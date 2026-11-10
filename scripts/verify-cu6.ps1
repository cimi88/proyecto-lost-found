#Requires -Version 5.1
# Verificación real del CU6 (Sugerir coincidencias): HTTP -> NestJS -> PostgreSQL.
# Aplica la migración aditiva AddPublicationMatching (la reversibilidad del down
# se verifica en las pruebas unitarias; este script NUNCA revierte migraciones en
# lostfound_dev). Crea publicaciones propias (UUIDs propios) y verifica: la
# forma original de las respuestas de CU1/CU2, la columna derivada search_text,
# la generación transaccional de parejas SUGGESTED, la consulta pública
# bidireccional de matches, la exclusión de no activas, los errores 400/404 y la
# idempotencia del backfill (sin duplicar parejas ni reabrir DISMISSED).
# Limpieza: elimina por ID exacto sus publicaciones (en cascada sus coincidencias)
# y, por diferencia de UUIDs, cualquier coincidencia creada por sus backfills.
# Preserva intactas las coincidencias preexistentes y las publicaciones de
# evidencia de CU1 y CU2, comparando todos sus valores antes y después.
[CmdletBinding()]
param(
  [string]$PgBin = 'C:\Program Files\PostgreSQL\18\bin',
  [string]$BackendDir,
  [string]$BaseUrl = 'http://localhost:3000',
  [string]$DemoUserId = '00000000-0000-4000-8000-000000000001',
  [int]$StartupTimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'

$script:ScriptPath = $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($script:ScriptPath)) { $script:ScriptPath = $PSCommandPath }
$script:ScriptRoot = $PSScriptRoot

function Get-ScriptDirectory {
  $candidates = @()
  if (-not [string]::IsNullOrWhiteSpace($script:ScriptPath)) {
    $candidates += (Split-Path -Parent $script:ScriptPath)
  }
  if (-not [string]::IsNullOrWhiteSpace($PSCommandPath)) {
    $candidates += (Split-Path -Parent $PSCommandPath)
  }
  if (-not [string]::IsNullOrWhiteSpace($script:ScriptRoot)) {
    $candidates += $script:ScriptRoot
  }
  foreach ($candidate in $candidates) {
    if (-not [string]::IsNullOrWhiteSpace($candidate)) {
      return [System.IO.Path]::GetFullPath($candidate)
    }
  }
  throw 'No se pudo determinar la ubicación del script. Ejecutalo con -File desde una ruta absoluta.'
}

$scriptDir = Get-ScriptDirectory
$projectRoot = Split-Path -Parent $scriptDir
if ([string]::IsNullOrWhiteSpace($projectRoot)) {
  throw "No se pudo determinar la raíz del proyecto desde '$scriptDir'."
}

if ([string]::IsNullOrWhiteSpace($BackendDir)) {
  $BackendDir = Join-Path $projectRoot 'backend'
}
elseif (-not [System.IO.Path]::IsPathRooted($BackendDir)) {
  $BackendDir = Join-Path $projectRoot $BackendDir
}
$BackendDir = [System.IO.Path]::GetFullPath($BackendDir)
if (-not (Test-Path -LiteralPath $BackendDir -PathType Container)) {
  throw "No se encontró el directorio backend en '$BackendDir'."
}

$script:Checks = New-Object System.Collections.Generic.List[string]
$script:Failures = New-Object System.Collections.Generic.List[string]
$script:Secret = ''

$tempDir = Join-Path $env:TEMP ("lostfound-cu6-" + [guid]::NewGuid().ToString('N'))
$apiProcess = $null
$pgpassFile = $null
$createdIds = New-Object System.Collections.Generic.List[string]
$script:MatchIdsAtStart = @()
$script:SnapshotCaptured = $false
$script:MatchesTableAvailable = $false

function Write-Check {
  param([string]$Name, [bool]$Passed, [string]$Detail = '')

  if ($Passed) {
    Write-Host "[PASS] $Name"
    $script:Checks.Add("PASS $Name")
    return
  }

  Write-Host "[FAIL] $Name $Detail"
  $script:Checks.Add("FAIL $Name $Detail")
  $script:Failures.Add($Name)
}

function Redact {
  param([string]$Text)

  if ([string]::IsNullOrEmpty($script:Secret)) {
    return $Text
  }

  return $Text.Replace($script:Secret, '***')
}

function Escape-PgPassValue {
  param([string]$Value)

  return $Value.Replace('\', '\\').Replace(':', '\:')
}

function Assert-ApiError {
  param(
    [string]$Name,
    [object]$Response,
    [int]$ExpectedStatus,
    [string]$ExpectedCode,
    [string]$ExpectedField = ''
  )

  $json = Convert-Body $Response.Body
  $ok = $Response.Status -eq $ExpectedStatus -and $null -ne $json -and $json.code -eq $ExpectedCode

  if ($ok -and $ExpectedField) {
    $ok = [bool]($json.details | Where-Object { $_.field -eq $ExpectedField })
  }

  Write-Check $Name $ok "status=$($Response.Status) code=$($json.code)"
  return $json
}

New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
  $envFile = Join-Path $BackendDir '.env'

  if (-not (Test-Path $envFile)) {
    throw "No existe '$envFile'. Ejecutá primero scripts/setup-db.ps1 en una consola interactiva."
  }

  $databaseUrl = $null

  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*DATABASE_URL\s*=\s*(.+)\s*$') {
      $databaseUrl = $Matches[1].Trim()
    }
  }

  if (-not $databaseUrl) {
    throw 'DATABASE_URL no está definida en backend/.env.'
  }

  $uri = [uri]$databaseUrl
  $userInfo = $uri.UserInfo
  $separator = $userInfo.IndexOf(':')

  if ($separator -lt 1) {
    throw 'DATABASE_URL no incluye usuario y contraseña.'
  }

  $dbUser = [uri]::UnescapeDataString($userInfo.Substring(0, $separator))
  $dbPassword = [uri]::UnescapeDataString($userInfo.Substring($separator + 1))
  $dbHost = $uri.Host
  $dbPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
  $dbName = $uri.AbsolutePath.TrimStart('/')
  $script:Secret = $dbPassword

  $psql = Join-Path $PgBin 'psql.exe'

  if (-not (Test-Path $psql)) {
    throw "No se encontró psql en '$psql'."
  }

  $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue

  if ($listener) {
    throw 'El puerto 3000 ya está en uso. Detené el proceso que lo ocupa y volvé a ejecutar la verificación.'
  }

  $pgpassFile = Join-Path $tempDir 'pgpass.conf'
  $pgpassLine = '{0}:{1}:{2}:{3}:{4}' -f `
    (Escape-PgPassValue $dbHost), `
    $dbPort, `
    (Escape-PgPassValue $dbName), `
    (Escape-PgPassValue $dbUser), `
    (Escape-PgPassValue $dbPassword)

  [IO.File]::WriteAllText($pgpassFile, $pgpassLine + "`n", (New-Object Text.UTF8Encoding($false)))

  try {
    $aclUser = "$($env:USERDOMAIN)\$($env:USERNAME)"
    & icacls.exe $pgpassFile /inheritance:r /grant:r "${aclUser}:(R,W)" | Out-Null
  }
  catch {
    Write-Warning 'No se pudieron restringir los permisos del archivo temporal de credenciales.'
  }

  $env:PGPASSFILE = $pgpassFile

  function Invoke-Db {
    param([string]$Sql)

    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $output = & $psql -X -q -t -A -v ON_ERROR_STOP=1 `
        -h $dbHost -p $dbPort -U $dbUser -d $dbName -c $Sql 2>&1
      $code = $LASTEXITCODE
    }
    finally {
      $ErrorActionPreference = $previousEap
    }
    $text = (($output | ForEach-Object { $_.ToString() }) -join "`n")

    if ($code -ne 0) {
      throw "psql falló: $(Redact $text)"
    }

    return $text.Trim()
  }

  function Invoke-Npm {
    param([string]$Script)

    Push-Location $BackendDir
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $output = & npm.cmd run $Script 2>&1
      $code = $LASTEXITCODE
    }
    finally {
      $ErrorActionPreference = $previousEap
      Pop-Location
    }
    $text = Redact (($output | ForEach-Object { $_.ToString() }) -join "`n")

    return [pscustomobject]@{ Code = $code; Text = $text }
  }

  function Invoke-Api {
    param(
      [string]$Method,
      [string]$Path,
      [string]$BodyJson,
      [string]$DemoHeader
    )

    $bodyFile = Join-Path $tempDir ('body-' + [guid]::NewGuid().ToString('N') + '.json')
    $outFile = Join-Path $tempDir ('resp-' + [guid]::NewGuid().ToString('N') + '.json')
    $curlArgs = @(
      '--silent',
      '--show-error',
      '--output', $outFile,
      '--write-out', '%{http_code}',
      '--request', $Method
    )

    if ($BodyJson) {
      [IO.File]::WriteAllText($bodyFile, $BodyJson, (New-Object Text.UTF8Encoding($false)))
      $curlArgs += @('--header', 'Content-Type: application/json', '--data-binary', "@$bodyFile")
    }

    if ($DemoHeader) {
      $curlArgs += @('--header', "X-Demo-User-Id: $DemoHeader")
    }

    $curlArgs += "$BaseUrl$Path"
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $status = ((& curl.exe @curlArgs) -join '').Trim()
    }
    finally {
      $ErrorActionPreference = $previousEap
    }
    $body = ''

    if (Test-Path $outFile) {
      $body = Get-Content $outFile -Raw -Encoding UTF8
    }

    $statusCode = if ($status -match '^\d{3}$') { [int]$status } else { 0 }

    return [pscustomobject]@{
      Status = $statusCode
      Body = $body
    }
  }

  function Convert-Body {
    param([string]$Body)

    if ([string]::IsNullOrWhiteSpace($Body)) {
      return $null
    }

    try {
      return $Body | ConvertFrom-Json
    }
    catch {
      return $null
    }
  }

  function New-Publication {
    param(
      [string]$Path,
      [hashtable]$Body
    )

    return Invoke-Api -Method 'POST' -Path $Path -BodyJson ($Body | ConvertTo-Json -Compress) -DemoHeader $DemoUserId
  }

  function Normalize-SearchText {
    param([string]$Value)

    return ($Value -replace '\s+', ' ').Trim().ToLowerInvariant()
  }

  function Get-CurrentMatchIds {
    $raw = Invoke-Db 'SELECT id::text FROM publication_matches ORDER BY id;'

    return @($raw -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  }

  # Restaura la tabla de coincidencias al snapshot inicial: elimina por su propio
  # UUID únicamente las filas que esta ejecución creó de más. Nunca borra por
  # conjunto completo y nunca toca las filas que ya existían.
  function Remove-RunCreatedMatchRows {
    if (-not $script:MatchesTableAvailable -or -not $script:SnapshotCaptured) {
      return
    }

    $currentIds = Get-CurrentMatchIds
    $initialSet = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($idValue in $script:MatchIdsAtStart) { [void]$initialSet.Add($idValue) }
    $staleIds = @($currentIds | Where-Object { -not $initialSet.Contains($_) })

    foreach ($staleId in $staleIds) {
      Invoke-Db ("DELETE FROM publication_matches WHERE id = '{0}'::uuid;" -f $staleId) | Out-Null
    }

    return $staleIds.Count
  }

  # --- Migración CU6: aplicar (aditiva; sin revert en esta base) --------------
  Write-Host 'Compilando y aplicando migraciones...'
  $migrate = Invoke-Npm 'db:migrate'
  if ($migrate.Code -ne 0) {
    throw "npm run db:migrate falló (exit $($migrate.Code)): $($migrate.Text)"
  }

  $migrationApplied = Invoke-Db "SELECT name FROM migrations WHERE name LIKE '%AddPublicationMatching%';"
  Write-Check 'La migración AddPublicationMatching está aplicada' ($migrationApplied -like '*AddPublicationMatching*')

  $generatedColumn = Invoke-Db "SELECT is_generated FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'publications' AND column_name = 'search_text';"
  Write-Check 'La columna publications.search_text existe como generada almacenada' ($generatedColumn -eq 'ALWAYS') "is_generated=$generatedColumn"

  $matchesTable = Invoke-Db "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'publication_matches';"
  Write-Check 'La tabla publication_matches existe' ([int]$matchesTable -eq 1)
  $script:MatchesTableAvailable = ([int]$matchesTable -eq 1)

  $indexNames = (Invoke-Db "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('publications', 'publication_matches') ORDER BY indexname;") -split "`r?`n"
  foreach ($indexName in @(
      'publications_search_text_trgm_idx',
      'publications_title_trgm_idx',
      'publications_description_trgm_idx',
      'publications_location_trgm_idx',
      'publications_status_created_at_idx',
      'publication_matches_lost_status_score_idx',
      'publication_matches_found_status_score_idx'
    )) {
    Write-Check "El índice $indexName existe" ($indexNames -contains $indexName)
  }

  # --- Snapshot de estado previo (preservación obligatoria) --------------------
  $evidenceIds = @(
    '82d35348-d8b3-4149-9ac7-4a8cbb0fe1ec',
    '12702eca-9ef6-4a03-9421-e980ae06e0c4'
  )
  $evidenceWhere = ($evidenceIds | ForEach-Object { "'$_'" }) -join ','
  $evidenceSql = "SELECT id || '|' || type || '|' || status || '|' || owner_id || '|' || title || '|' || description || '|' || category || '|' || location || '|' || event_date::text || '|' || created_at::text || '|' || updated_at::text FROM publications WHERE id IN ($evidenceWhere) ORDER BY id;"
  $script:EvidenceBefore = Invoke-Db $evidenceSql
  $evidenceCountBefore = [int](Invoke-Db "SELECT count(*) FROM publications WHERE id IN ($evidenceWhere);")
  Write-Check 'Las evidencias de CU1 y CU2 están presentes antes de la verificación' ($evidenceCountBefore -eq 2) "count=$evidenceCountBefore"

  $countBefore = [int](Invoke-Db 'SELECT count(*) FROM publications;')
  $script:MatchIdsAtStart = Get-CurrentMatchIds
  $script:SnapshotCaptured = $true
  Write-Check 'El snapshot de coincidencias preexistentes se capturó' ($true) "iniciales=$($script:MatchIdsAtStart.Count)"

  # --- API ---------------------------------------------------------------------
  Write-Host 'Iniciando la API...'
  $apiOut = Join-Path $tempDir 'api.out.log'
  $apiErr = Join-Path $tempDir 'api.err.log'
  $apiProcess = Start-Process -FilePath 'node' `
    -ArgumentList 'dist/main.js' `
    -WorkingDirectory $BackendDir `
    -RedirectStandardOutput $apiOut `
    -RedirectStandardError $apiErr `
    -PassThru `
    -WindowStyle Hidden

  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  $healthy = $false

  while ((Get-Date) -lt $deadline) {
    if ($apiProcess.HasExited) {
      break
    }

    try {
      $health = Invoke-RestMethod -Uri "$BaseUrl/api/health" -TimeoutSec 2

      if ($health.status -eq 'ok') {
        $healthy = $true
        break
      }
    }
    catch {
      Start-Sleep -Milliseconds 500
    }
  }

  if (-not $healthy) {
    $apiError = ''

    if (Test-Path $apiErr) {
      $apiError = Redact (Get-Content $apiErr -Raw)
    }

    throw "La API no respondió en $StartupTimeoutSeconds s. $apiError"
  }

  # --- Fixtures propias (UUIDs propios) -----------------------------------------
  $pairToken = [guid]::NewGuid().ToString('N')
  $unrelatedToken = [guid]::NewGuid().ToString('N')

  $lostTitle = "Mochila gris con franja reflectante $pairToken"
  $lostDescription = 'Mochila gris de gym con franja reflectante y un llavero verde colgado.'
  $lostLocation = 'Plaza Central Norte'

  $lostMain = New-Publication -Path '/api/v1/lost-publications' -Body @{
    title = $lostTitle
    description = $lostDescription
    category = 'BAGS'
    location = $lostLocation
    eventDate = '2026-11-01'
  }
  $lostMainJson = Convert-Body $lostMain.Body
  $lostMainId = if ($null -ne $lostMainJson -and $lostMainJson.id) { [string]$lostMainJson.id } else { $null }
  Write-Check 'Se crea la publicación LOST de CU6 con la respuesta original de CU1' (
    $lostMain.Status -eq 201 -and [bool]$lostMainId -and
    $lostMainJson.type -eq 'LOST' -and $lostMainJson.status -eq 'ACTIVE' -and
    $lostMainJson.ownerId -eq $DemoUserId -and
    (@('category', 'createdAt', 'description', 'eventDate', 'id', 'location',
      'ownerId', 'status', 'title', 'type', 'updatedAt') -join ',') -eq (($lostMainJson.PSObject.Properties.Name | Sort-Object) -join ',')
  ) "status=$($lostMain.Status)"
  if (-not $lostMainId) { throw 'No se pudo crear la publicación LOST de CU6.' }
  $createdIds.Add($lostMainId) | Out-Null

  $foundMain = New-Publication -Path '/api/v1/found-publications' -Body @{
    title = "Mochila gris con franja reflectante $pairToken hallada"
    description = 'Se encontro una mochila gris de gym con franja reflectante y un llavero verde colgado.'
    category = 'BAGS'
    location = 'Plaza Central Norte'
    eventDate = '2026-11-02'
  }
  $foundMainJson = Convert-Body $foundMain.Body
  $foundMainId = if ($null -ne $foundMainJson -and $foundMainJson.id) { [string]$foundMainJson.id } else { $null }
  Write-Check 'Se crea la publicación FOUND de CU6 con la respuesta original de CU2' (
    $foundMain.Status -eq 201 -and [bool]$foundMainId -and $foundMainJson.type -eq 'FOUND'
  ) "status=$($foundMain.Status)"
  if (-not $foundMainId) { throw 'No se pudo crear la publicación FOUND de CU6.' }
  $createdIds.Add($foundMainId) | Out-Null

  $foundClosed = New-Publication -Path '/api/v1/found-publications' -Body @{
    title = "Mochila gris con franja reflectante $pairToken guardada"
    description = 'Mochila gris de gym con franja reflectante y un llavero verde colgado, guardada en deposito.'
    category = 'BAGS'
    location = 'Plaza Central Norte'
    eventDate = '2026-11-03'
  }
  $foundClosedJson = Convert-Body $foundClosed.Body
  $foundClosedId = if ($null -ne $foundClosedJson -and $foundClosedJson.id) { [string]$foundClosedJson.id } else { $null }
  Write-Check 'Se crea la publicación FOUND que luego se cierra' ($foundClosed.Status -eq 201 -and [bool]$foundClosedId) "status=$($foundClosed.Status)"
  if (-not $foundClosedId) { throw 'No se pudo crear la publicación FOUND cerrada de CU6.' }
  $createdIds.Add($foundClosedId) | Out-Null

  $foundUnrelated = New-Publication -Path '/api/v1/found-publications' -Body @{
    title = "Termos de titanio $unrelatedToken"
    description = "Termos industrial de titanio con tapa de rosca $unrelatedToken"
    category = 'OTHER'
    location = "Deposito $unrelatedToken"
    eventDate = '2025-01-15'
  }
  $foundUnrelatedJson = Convert-Body $foundUnrelated.Body
  $foundUnrelatedId = if ($null -ne $foundUnrelatedJson -and $foundUnrelatedJson.id) { [string]$foundUnrelatedJson.id } else { $null }
  Write-Check 'Se crea la publicación FOUND no relacionada' ($foundUnrelated.Status -eq 201 -and [bool]$foundUnrelatedId) "status=$($foundUnrelated.Status)"
  if (-not $foundUnrelatedId) { throw 'No se pudo crear la publicación FOUND no relacionada de CU6.' }
  $createdIds.Add($foundUnrelatedId) | Out-Null

  # Solo se modifica la propia fila cerrada (UUID propio de esta ejecución).
  Invoke-Db "UPDATE publications SET status = 'CLOSED', updated_at = now() WHERE id = '$foundClosedId';" | Out-Null

  # --- search_text derivado -------------------------------------------------------
  $searchTextActual = Invoke-Db "SELECT search_text FROM publications WHERE id = '$lostMainId';"
  $searchTextExpected = Normalize-SearchText "$lostTitle $lostDescription $lostLocation"
  Write-Check 'search_text normaliza titulo, descripcion y ubicacion' ($searchTextActual -eq $searchTextExpected) "actual=$searchTextActual"

  # --- Generación transaccional al crear -------------------------------------------
  $pairRowCount = [int](Invoke-Db "SELECT count(*) FROM publication_matches WHERE lost_publication_id = '$lostMainId' AND found_publication_id = '$foundMainId';")
  Write-Check 'La creación de la FOUND genera la pareja SUGGESTED en la misma transaccion' ($pairRowCount -eq 1) "count=$pairRowCount"

  $lostClosedRowCount = [int](Invoke-Db "SELECT count(*) FROM publication_matches WHERE lost_publication_id = '$lostMainId' AND found_publication_id = '$foundClosedId';")
  Write-Check 'La segunda FOUND relacionada también genera su pareja SUGGESTED' ($lostClosedRowCount -eq 1) "count=$lostClosedRowCount"

  # --- Consulta pública bidireccional ----------------------------------------------
  $matchesOfLost = Invoke-Api -Method 'GET' -Path "/api/v1/publications/$lostMainId/matches"
  $matchesOfLostJson = Convert-Body $matchesOfLost.Body
  $lostCandidateIds = @($matchesOfLostJson.items | ForEach-Object { [string]$_.candidate.id })
  $mainItem = @($matchesOfLostJson.items | Where-Object { $_.candidate.id -eq $foundMainId }) | Select-Object -First 1

  Write-Check 'El listado LOST sugiere la FOUND relacionada y excluye la cerrada y la no relacionada' (
    $matchesOfLost.Status -eq 200 -and $lostCandidateIds -contains $foundMainId -and
    -not ($lostCandidateIds -contains $foundClosedId) -and
    -not ($lostCandidateIds -contains $foundUnrelatedId) -and
    -not ($lostCandidateIds -contains $lostMainId)
  ) "status=$($matchesOfLost.Status) ids=$($lostCandidateIds -join ',')"

  $breakdownOk = $null -ne $mainItem -and
    $mainItem.status -eq 'SUGGESTED' -and
    $mainItem.score -ge 0.55 -and
    $mainItem.scoreBreakdown.text.weight -eq 0.5 -and
    $mainItem.scoreBreakdown.category.weight -eq 0.2 -and
    $mainItem.scoreBreakdown.date.weight -eq 0.15 -and
    $mainItem.scoreBreakdown.location.weight -eq 0.15 -and
    $mainItem.eventDateDifferenceDays -eq 1 -and
    [Math]::Abs($mainItem.scoreBreakdown.text.contribution + $mainItem.scoreBreakdown.category.contribution +
      $mainItem.scoreBreakdown.date.contribution + $mainItem.scoreBreakdown.location.contribution - $mainItem.score) -le 0.0002
  Write-Check 'La sugerencia trae score, desglose y diferencia de días coherentes' $breakdownOk "item=$($mainItem | ConvertTo-Json -Compress -Depth 5)"

  $candidateKeys = if ($null -ne $mainItem) { (($mainItem.candidate.PSObject.Properties.Name) | Sort-Object) -join ',' } else { '' }
  Write-Check 'La candidata expone solo el resumen público, sin ownerId' (
    $candidateKeys -eq ((@('category', 'createdAt', 'description', 'eventDate', 'id', 'location', 'status', 'title', 'type') | Sort-Object) -join ',')
  ) "keys=$candidateKeys"

  $matchesOfFound = Invoke-Api -Method 'GET' -Path "/api/v1/publications/$foundMainId/matches"
  $matchesOfFoundJson = Convert-Body $matchesOfFound.Body
  $foundCandidateIds = @($matchesOfFoundJson.items | ForEach-Object { [string]$_.candidate.id })
  Write-Check 'La FOUND también sugiere a su LOST (consulta bidireccional)' (
    $matchesOfFound.Status -eq 200 -and $foundCandidateIds -contains $lostMainId
  ) "status=$($matchesOfFound.Status) ids=$($foundCandidateIds -join ',')"

  # --- Errores del endpoint ----------------------------------------------------------
  Assert-ApiError 'El matches de una publicación cerrada responde 404 PUBLICATION_NOT_FOUND' (
    Invoke-Api -Method 'GET' -Path "/api/v1/publications/$foundClosedId/matches"
  ) 404 'PUBLICATION_NOT_FOUND' | Out-Null
  Assert-ApiError 'El matches de un UUID inexistente responde 404 PUBLICATION_NOT_FOUND' (
    Invoke-Api -Method 'GET' -Path "/api/v1/publications/$([guid]::NewGuid().ToString())/matches"
  ) 404 'PUBLICATION_NOT_FOUND' | Out-Null
  Assert-ApiError 'El matches con UUID inválido responde 400 VALIDATION_ERROR' (
    Invoke-Api -Method 'GET' -Path '/api/v1/publications/not-a-uuid/matches'
  ) 400 'VALIDATION_ERROR' 'id' | Out-Null

  # --- Backfill idempotente -------------------------------------------------------------
  # La API se detiene antes de compilar/ejecutar backfills para evitar pisar dist
  # mientras el proceso sirve la aplicación.
  Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue
  $apiProcess.WaitForExit() | Out-Null
  $apiProcess = $null

  # Solo se marca DISMISSED la pareja de los propios fixtures.
  Invoke-Db "UPDATE publication_matches SET status = 'DISMISSED' WHERE lost_publication_id = '$lostMainId' AND found_publication_id = '$foundMainId';" | Out-Null

  $backfillFirst = Invoke-Npm 'matches:backfill'
  if ($backfillFirst.Code -ne 0) {
    throw "El primer backfill falló (exit $($backfillFirst.Code)): $($backfillFirst.Text)"
  }

  $rowsAfterFirst = Invoke-Db 'SELECT count(*), count(DISTINCT (lost_publication_id, found_publication_id)) FROM publication_matches;'
  $backfillSecond = Invoke-Npm 'matches:backfill'
  if ($backfillSecond.Code -ne 0) {
    throw "El segundo backfill falló (exit $($backfillSecond.Code)): $($backfillSecond.Text)"
  }

  $rowsAfterSecond = Invoke-Db 'SELECT count(*), count(DISTINCT (lost_publication_id, found_publication_id)) FROM publication_matches;'
  $dismisedStillTerminal = [int](Invoke-Db "SELECT count(*) FROM publication_matches WHERE lost_publication_id = '$lostMainId' AND found_publication_id = '$foundMainId' AND status = 'DISMISSED';")
  $rowsSplit = @($rowsAfterSecond -split '\|')
  Write-Check 'El backfill no duplica parejas ni cambia el total entre ejecuciones' (
    $rowsAfterFirst -eq $rowsAfterSecond -and $rowsSplit.Count -eq 2 -and $rowsSplit[0] -eq $rowsSplit[1]
  ) "first=$rowsAfterFirst second=$rowsAfterSecond"
  Write-Check 'El backfill no reabre coincidencias DISMISSED' ($dismisedStillTerminal -eq 1) "count=$dismisedStillTerminal"

  $pairRowCountAfterBackfill = [int](Invoke-Db "SELECT count(*) FROM publication_matches WHERE lost_publication_id = '$lostMainId' AND found_publication_id = '$foundMainId';")
  Write-Check 'La pareja del par de fixtures sigue siendo única tras dos backfills' ($pairRowCountAfterBackfill -eq 1) "count=$pairRowCountAfterBackfill"

  $evidenceMidRun = Invoke-Db $evidenceSql
  Write-Check 'Las publicaciones de evidencia mantienen todos sus valores durante la verificación' ($evidenceMidRun -eq $script:EvidenceBefore)

  # --- Limpieza y preservación -----------------------------------------------------------
  # 1) Elimina las coincidencias nuevas de esta ejecución por su propio UUID
  #    (las que el backfill pudo crear sobre pares preexistentes).
  Remove-RunCreatedMatchRows | Out-Null

  # 2) Elimina sus publicaciones propias por ID exacto (las coincidencias que las
  #    referencian caen en cascada).
  foreach ($createdId in $createdIds) {
    Invoke-Db ("DELETE FROM publications WHERE id = '{0}';" -f $createdId) | Out-Null
  }

  # 3) Verifica el estado restaurado.
  $countAfterCleanup = [int](Invoke-Db 'SELECT count(*) FROM publications;')
  Write-Check 'La limpieza restaura el conteo inicial' ($countAfterCleanup -eq $countBefore) "inicial=$countBefore final=$countAfterCleanup"

  $remainingCreated = 0
  if ($createdIds.Count -gt 0) {
    $createdWhere = ($createdIds | ForEach-Object { "'$_'" }) -join ','
    $remainingCreated = [int](Invoke-Db "SELECT count(*) FROM publications WHERE id IN ($createdWhere);")
  }
  Write-Check 'No quedan filas propias de la verificación' ($remainingCreated -eq 0) "remaining=$remainingCreated"

  $finalMatchIds = Get-CurrentMatchIds
  Write-Check 'La tabla de coincidencias queda exactamente como antes de la verificación' (
    ($finalMatchIds -join ',') -eq ($script:MatchIdsAtStart -join ',')
  ) "iniciales=$($script:MatchIdsAtStart.Count) finales=$($finalMatchIds.Count)"

  $evidenceAfter = Invoke-Db $evidenceSql
  Write-Check 'Las evidencias de CU1 y CU2 quedan intactas' ($evidenceAfter -eq $script:EvidenceBefore)
  Write-Host ''
  Write-Host 'Resumen:'
  foreach ($check in $script:Checks) {
    Write-Host "  $check"
  }
}
finally {
  if ($apiProcess -and -not $apiProcess.HasExited) {
    Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue
  }

  # Limpieza de respaldo: si una excepción cortó el flujo antes de la limpieza
  # normal, se eliminan igualmente las filas propias (publicaciones por ID exacto
  # y coincidencias nuevas identificadas por su UUID).
  try {
    if ($createdIds.Count -gt 0) {
      $initialSet = New-Object 'System.Collections.Generic.HashSet[string]'
      foreach ($idValue in $script:MatchIdsAtStart) { [void]$initialSet.Add($idValue) }
      $currentIds = Get-CurrentMatchIds
      $staleIds = @($currentIds | Where-Object { -not $initialSet.Contains($_) })
      foreach ($staleId in $staleIds) {
        Invoke-Db ("DELETE FROM publication_matches WHERE id = '{0}'::uuid;" -f $staleId) | Out-Null
      }
    }

    foreach ($createdId in $createdIds) {
      Invoke-Db ("DELETE FROM publications WHERE id = '{0}';" -f $createdId) | Out-Null
    }
  }
  catch {
    # No enmascarar el error original.
  }

  $env:PGPASSFILE = $null
  Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

if ($script:Failures.Count -gt 0) {
  Write-Host ''
  Write-Host "Resultado: $($script:Failures.Count) verificación(es) fallaron de $($script:Checks.Count)."
  exit 1
}

Write-Host ''
Write-Host "Resultado: $($script:Checks.Count) verificaciones pasaron."
exit 0
