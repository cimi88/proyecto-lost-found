#Requires -Version 5.1
# Verificación real del CU3 (Buscar objetos): HTTP -> NestJS -> PostgreSQL.
# Crea sus propias publicaciones, valida listado, búsqueda, paginación, detalle,
# visibilidad ACTIVE e índices trigram; limpia exclusivamente las filas que este
# script crea (por ID exacto) y no toca datos preexistentes, incluidas las
# evidencias persistidas de CU1 y CU2.
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

$tempDir = Join-Path $env:TEMP ("lostfound-cu3-" + [guid]::NewGuid().ToString('N'))
$apiProcess = $null
$pgpassFile = $null
$createdIds = New-Object System.Collections.Generic.List[string]

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

function Get-ItemIds {
  param([object]$Json)

  if ($null -eq $Json -or $null -eq $Json.items) {
    return @()
  }

  return @($Json.items | ForEach-Object { [string]$_.id })
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

  Push-Location $BackendDir

  try {
    Write-Host 'Compilando y aplicando migraciones...'
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $migrateOutput = & npm.cmd run db:migrate 2>&1
      $migrateCode = $LASTEXITCODE
    }
    finally {
      $ErrorActionPreference = $previousEap
    }
    $migrateText = Redact (($migrateOutput | ForEach-Object { $_.ToString() }) -join "`n")

    if ($migrateCode -ne 0) {
      throw "npm run db:migrate falló (exit $migrateCode): $migrateText"
    }
  }
  finally {
    Pop-Location
  }

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

  # --- Índices y migración -------------------------------------------------
  $indexNames = (Invoke-Db "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'publications' ORDER BY indexname;") -split "`r?`n"

  foreach ($indexName in @(
      'publications_title_trgm_idx',
      'publications_description_trgm_idx',
      'publications_location_trgm_idx',
      'publications_status_created_at_idx'
    )) {
    Write-Check "El índice $indexName existe" ($indexNames -contains $indexName)
  }

  $searchedMigration = Invoke-Db "SELECT count(*) FROM migrations WHERE name LIKE '%AddPublicationSearchIndexes%';"
  Write-Check 'La migración AddPublicationSearchIndexes está aplicada' ([int]$searchedMigration -ge 1) "count=$searchedMigration"

  # --- Evidencias preexistentes -------------------------------------------
  $evidenceIds = @(
    '82d35348-d8b3-4149-9ac7-4a8cbb0fe1ec',
    '12702eca-9ef6-4a03-9421-e980ae06e0c4'
  )
  $evidenceWhere = ($evidenceIds | ForEach-Object { "'$_'" }) -join ','
  $evidenceSql = "SELECT id || '|' || type || '|' || status || '|' || owner_id FROM publications WHERE id IN ($evidenceWhere) ORDER BY id;"
  $evidenceBefore = Invoke-Db $evidenceSql
  $evidenceCountBefore = [int](Invoke-Db "SELECT count(*) FROM publications WHERE id IN ($evidenceWhere);")
  Write-Check 'Las evidencias de CU1 y CU2 están presentes antes de la verificación' ($evidenceCountBefore -eq 2) "count=$evidenceCountBefore"

  $countBefore = [int](Invoke-Db 'SELECT count(*) FROM publications;')

  # --- Creación de filas propias ------------------------------------------
  $titleToken = "busquedacu3" + [guid]::NewGuid().ToString('N')
  $descToken = "descripcioncu3" + [guid]::NewGuid().ToString('N')
  $locToken = "ubicacioncu3" + [guid]::NewGuid().ToString('N')
  $closedToken = "cerrada" + [guid]::NewGuid().ToString('N')
  $pageToken = "paginada" + [guid]::NewGuid().ToString('N')
  $noMatchToken = "zzzz" + [guid]::NewGuid().ToString('N')
  $eventDate = '2024-05-10'

  $lost = New-Publication -Path '/api/v1/lost-publications' -Body @{
    title = "Mochila perdida $titleToken"
    description = "Mochila azul con cierre roto. Referencia $descToken."
    category = 'BAGS'
    location = 'Plaza central'
    eventDate = $eventDate
  }
  $lostJson = Convert-Body $lost.Body
  Write-Check 'POST LOST válido responde 201' ($lost.Status -eq 201) "status=$($lost.Status)"
  $lostId = if ($null -ne $lostJson -and $lostJson.id) { [string]$lostJson.id } else { $null }
  if ($lostId) { $createdIds.Add($lostId) }

  $found = New-Publication -Path '/api/v1/found-publications' -Body @{
    title = "Paraguas encontrado $titleToken"
    description = 'Paraguas negro con mango de madera y una etiqueta azul.'
    category = 'OTHER'
    location = "Biblioteca central $locToken"
    eventDate = $eventDate
  }
  $foundJson = Convert-Body $found.Body
  Write-Check 'POST FOUND válido responde 201' ($found.Status -eq 201) "status=$($found.Status)"
  $foundId = if ($null -ne $foundJson -and $foundJson.id) { [string]$foundJson.id } else { $null }
  if ($foundId) { $createdIds.Add($foundId) }

  $closed = New-Publication -Path '/api/v1/found-publications' -Body @{
    title = "Objeto cerrado $closedToken"
    description = 'Objeto destinado a comprobar la exclusión de estados no activos.'
    category = 'OTHER'
    location = 'Oficina central'
    eventDate = $eventDate
  }
  $closedJson = Convert-Body $closed.Body
  $closedId = if ($null -ne $closedJson -and $closedJson.id) { [string]$closedJson.id } else { $null }
  if ($closedId) { $createdIds.Add($closedId) }

  $pageIds = New-Object System.Collections.Generic.List[string]
  for ($pageIndex = 1; $pageIndex -le 3; $pageIndex++) {
    $pageRow = New-Publication -Path '/api/v1/found-publications' -Body @{
      title = "Objeto paginado $pageIndex $pageToken"
      description = "Fila $pageIndex para comprobar la paginación estable."
      category = 'OTHER'
      location = 'Oficina central'
      eventDate = $eventDate
    }
    $pageJson = Convert-Body $pageRow.Body
    if ($pageRow.Status -eq 201 -and $null -ne $pageJson -and $pageJson.id) {
      $pageIds.Add([string]$pageJson.id)
      $createdIds.Add([string]$pageJson.id)
    }
  }
  Write-Check 'Se crearon tres filas para paginación' ($pageIds.Count -eq 3) "count=$($pageIds.Count)"

  $typo = New-Publication -Path '/api/v1/lost-publications' -Body @{
    title = 'Mochila'
    description = 'Título corto para comprobar la tolerancia trigram a errores de tipeo.'
    category = 'BAGS'
    location = 'Oficina central'
    eventDate = $eventDate
  }
  $typoJson = Convert-Body $typo.Body
  $typoId = if ($null -ne $typoJson -and $typoJson.id) { [string]$typoJson.id } else { $null }
  if ($typoId) { $createdIds.Add($typoId) }
  Write-Check 'POST de fila con typo responde 201' ($typo.Status -eq 201) "status=$($typo.Status)"

  $countAfterCreate = [int](Invoke-Db 'SELECT count(*) FROM publications;')
  Write-Check 'Las siete filas propias se persistieron' ($countAfterCreate -eq ($countBefore + 7)) "antes=$countBefore despues=$countAfterCreate"

  $createdWhere = ($createdIds | ForEach-Object { "'$_'" }) -join ','

  # --- Listado y búsqueda --------------------------------------------------
  $listWithoutQ = Invoke-Api -Method 'GET' -Path '/api/v1/publications?pageSize=50'
  $listWithoutQJson = Convert-Body $listWithoutQ.Body
  $listWithoutQIds = @(Get-ItemIds $listWithoutQJson)
  Write-Check 'GET /publications sin q responde 200 sin identidad' ($listWithoutQ.Status -eq 200) "status=$($listWithoutQ.Status)"
  Write-Check 'El listado sin q contiene las filas propias recientes' (
    $null -ne $lostId -and $null -ne $foundId -and
    ($listWithoutQIds -contains $lostId) -and ($listWithoutQIds -contains $foundId)
  )
  Write-Check 'El listado no expone ownerId' (
    $null -ne $listWithoutQJson -and
    $null -ne $listWithoutQJson.items -and
    -not ($listWithoutQJson.items[0].PSObject.Properties.Name -contains 'ownerId')
  )

  $emptyQ = Invoke-Api -Method 'GET' -Path '/api/v1/publications?q=&pageSize=50'
  Write-Check 'GET /publications con q vacío responde 200 y explora' ($emptyQ.Status -eq 200) "status=$($emptyQ.Status)"

  $titleSearch = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$titleToken&pageSize=50"
  $titleJson = Convert-Body $titleSearch.Body
  $titleIds = @(Get-ItemIds $titleJson)
  Write-Check 'La búsqueda por título encuentra las dos filas con el token' (
    $titleSearch.Status -eq 200 -and $null -ne $titleJson -and $titleJson.total -eq 2 -and
    ($titleIds -contains $lostId) -and ($titleIds -contains $foundId)
  ) "status=$($titleSearch.Status) total=$($titleJson.total)"

  $descriptionSearch = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$descToken&pageSize=50"
  $descriptionJson = Convert-Body $descriptionSearch.Body
  Write-Check 'La búsqueda por descripción encuentra la fila correcta' (
    $descriptionSearch.Status -eq 200 -and $null -ne $descriptionJson -and
    $descriptionJson.total -eq 1 -and (@(Get-ItemIds $descriptionJson) -contains $lostId)
  ) "status=$($descriptionSearch.Status) total=$($descriptionJson.total)"

  $locationSearch = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$locToken&pageSize=50"
  $locationJson = Convert-Body $locationSearch.Body
  Write-Check 'La búsqueda por ubicación encuentra la fila correcta' (
    $locationSearch.Status -eq 200 -and $null -ne $locationJson -and
    $locationJson.total -eq 1 -and (@(Get-ItemIds $locationJson) -contains $foundId)
  ) "status=$($locationSearch.Status) total=$($locationJson.total)"

  $typoSearch = Invoke-Api -Method 'GET' -Path '/api/v1/publications?q=mochla&pageSize=50'
  $typoJsonBody = Convert-Body $typoSearch.Body
  Write-Check 'La búsqueda tolera un error de tipeo mediante trigramas' (
    $typoSearch.Status -eq 200 -and $null -ne $typoJsonBody -and $null -ne $typoId -and
    (@(Get-ItemIds $typoJsonBody) -contains $typoId)
  ) "status=$($typoSearch.Status) total=$($typoJsonBody.total)"

  $caseSearch = Invoke-Api -Method 'GET' -Path '/api/v1/publications?q=MOCHILA&pageSize=50'
  $caseJson = Convert-Body $caseSearch.Body
  Write-Check 'La búsqueda es insensible a mayúsculas' (
    $caseSearch.Status -eq 200 -and $null -ne $caseJson -and
    (@(Get-ItemIds $caseJson) -contains $lostId)
  ) "status=$($caseSearch.Status)"

  $noneSearch = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$noMatchToken&pageSize=50"
  $noneJson = Convert-Body $noneSearch.Body
  Write-Check 'La búsqueda sin resultados responde 200 con total 0 y totalPages 0' (
    $noneSearch.Status -eq 200 -and $null -ne $noneJson -and
    $noneJson.total -eq 0 -and $noneJson.totalPages -eq 0 -and @(Get-ItemIds $noneJson).Count -eq 0
  ) "status=$($noneSearch.Status) total=$($noneJson.total)"

  # --- Paginación y orden --------------------------------------------------
  $page1 = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$pageToken&page=1&pageSize=2"
  $page1Json = Convert-Body $page1.Body
  $page1Ids = @(Get-ItemIds $page1Json)
  $page2 = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$pageToken&page=2&pageSize=2"
  $page2Json = Convert-Body $page2.Body
  $page2Ids = @(Get-ItemIds $page2Json)

  Write-Check 'La paginación devuelve total y totalPages correctos' (
    $page1.Status -eq 200 -and $null -ne $page1Json -and
    $page1Json.total -eq 3 -and $page1Json.totalPages -eq 2 -and
    $page1Json.page -eq 1 -and $page1Json.pageSize -eq 2
  ) "total=$($page1Json.total) totalPages=$($page1Json.totalPages)"

  Write-Check 'La página 1 devuelve 2 filas y la página 2 devuelve 1' (
    $page1Ids.Count -eq 2 -and $page2Ids.Count -eq 1
  ) "page1=$($page1Ids.Count) page2=$($page2Ids.Count)"

  Write-Check 'Las páginas no se solapan y cubren las tres filas' (
    $page1Ids.Count -eq 2 -and $page2Ids.Count -eq 1 -and
    (@($page1Ids | Where-Object { $page2Ids -contains $_ }).Count -eq 0) -and
    (@($page1Ids + $page2Ids | Sort-Object -Unique).Count -eq 3)
  )

  $page1Again = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$pageToken&page=1&pageSize=2"
  $page1AgainJson = Convert-Body $page1Again.Body
  $page1AgainIds = @(Get-ItemIds $page1AgainJson)
  Write-Check 'El orden es estable entre solicitudes idénticas' (
    ($page1Ids -join ',') -eq ($page1AgainIds -join ',')
  )

  $orderedByCreatedAt = $true
  for ($i = 0; $i -lt ($page1Json.items.Count - 1); $i++) {
    if ([datetime]$page1Json.items[$i].createdAt -lt [datetime]$page1Json.items[$i + 1].createdAt) {
      $orderedByCreatedAt = $false
    }
  }
  Write-Check 'El orden es createdAt DESC dentro de la página' $orderedByCreatedAt

  $outOfRange = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$pageToken&page=99&pageSize=2"
  $outOfRangeJson = Convert-Body $outOfRange.Body
  Write-Check 'Una página fuera de rango responde 200 con items vacío y totales reales' (
    $outOfRange.Status -eq 200 -and $null -ne $outOfRangeJson -and
    @(Get-ItemIds $outOfRangeJson).Count -eq 0 -and
    $outOfRangeJson.total -eq 3 -and $outOfRangeJson.totalPages -eq 2
  ) "status=$($outOfRange.Status) total=$($outOfRangeJson.total)"

  $defaultPageSize = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$pageToken"
  $defaultPageSizeJson = Convert-Body $defaultPageSize.Body
  Write-Check 'pageSize predeterminado es 12' ($null -ne $defaultPageSizeJson -and $defaultPageSizeJson.pageSize -eq 12) "pageSize=$($defaultPageSizeJson.pageSize)"

  # --- Validación de parámetros -------------------------------------------
  $invalidPage = Invoke-Api -Method 'GET' -Path '/api/v1/publications?page=0'
  Assert-ApiError 'page=0 responde 400 VALIDATION_ERROR' $invalidPage 400 'VALIDATION_ERROR' 'page' | Out-Null

  $invalidPageSize = Invoke-Api -Method 'GET' -Path '/api/v1/publications?pageSize=51'
  Assert-ApiError 'pageSize=51 responde 400 VALIDATION_ERROR' $invalidPageSize 400 'VALIDATION_ERROR' 'pageSize' | Out-Null

  $longQuery = 'x' * 101
  $invalidQuery = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$longQuery"
  Assert-ApiError 'q de 101 caracteres responde 400 VALIDATION_ERROR' $invalidQuery 400 'VALIDATION_ERROR' 'q' | Out-Null

  $unknownParameter = Invoke-Api -Method 'GET' -Path '/api/v1/publications?ownerId=unknown'
  Assert-ApiError 'Un parámetro desconocido responde 400 VALIDATION_ERROR' $unknownParameter 400 'VALIDATION_ERROR' 'ownerId' | Out-Null

  $nonNumericPage = Invoke-Api -Method 'GET' -Path '/api/v1/publications?page=abc'
  Assert-ApiError 'page no numérico responde 400 VALIDATION_ERROR' $nonNumericPage 400 'VALIDATION_ERROR' 'page' | Out-Null

  # --- Detalle -------------------------------------------------------------
  $detail = Invoke-Api -Method 'GET' -Path "/api/v1/publications/$lostId"
  $detailJson = Convert-Body $detail.Body
  Write-Check 'El detalle de una publicación activa responde 200' (
    $detail.Status -eq 200 -and $null -ne $detailJson -and $detailJson.id -eq $lostId
  ) "status=$($detail.Status)"
  Write-Check 'El detalle devuelve status ACTIVE, type LOST y no expone ownerId' (
    $null -ne $detailJson -and $detailJson.status -eq 'ACTIVE' -and $detailJson.type -eq 'LOST' -and
    -not ($detailJson.PSObject.Properties.Name -contains 'ownerId')
  )

  $unknownDetail = Invoke-Api -Method 'GET' -Path "/api/v1/publications/$([guid]::NewGuid())"
  Assert-ApiError 'El detalle de un UUID inexistente responde 404 PUBLICATION_NOT_FOUND' $unknownDetail 404 'PUBLICATION_NOT_FOUND' | Out-Null

  $invalidDetail = Invoke-Api -Method 'GET' -Path '/api/v1/publications/no-es-un-uuid'
  Assert-ApiError 'El detalle con UUID inválido responde 400 VALIDATION_ERROR' $invalidDetail 400 'VALIDATION_ERROR' 'id' | Out-Null

  # --- Visibilidad ACTIVE en listado y detalle ----------------------------
  foreach ($status in @('RESERVED', 'RETURNED', 'CLOSED')) {
    Invoke-Db ("UPDATE publications SET status = '{0}' WHERE id = '{1}';" -f $status, $closedId) | Out-Null

    $hiddenSearch = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$closedToken&pageSize=50"
    $hiddenJson = Convert-Body $hiddenSearch.Body
    Write-Check "El listado excluye una publicación $status" (
      $hiddenSearch.Status -eq 200 -and $null -ne $hiddenJson -and
      $hiddenJson.total -eq 0 -and @(Get-ItemIds $hiddenJson).Count -eq 0
    ) "status=$($hiddenSearch.Status) total=$($hiddenJson.total)"

    $hiddenDetail = Invoke-Api -Method 'GET' -Path "/api/v1/publications/$closedId"
    Assert-ApiError "El detalle de una publicación $status responde 404 PUBLICATION_NOT_FOUND" $hiddenDetail 404 'PUBLICATION_NOT_FOUND' | Out-Null
  }

  $unfiltered = Invoke-Api -Method 'GET' -Path '/api/v1/publications?pageSize=50'
  $unfilteredJson = Convert-Body $unfiltered.Body
  Write-Check 'El listado sin q excluye la publicación cerrada' (
    $null -ne $unfilteredJson -and -not (@(Get-ItemIds $unfilteredJson) -contains $closedId)
  )

  # --- Limpieza y preservación --------------------------------------------
  foreach ($createdId in $createdIds) {
    Invoke-Db ("DELETE FROM publications WHERE id = '{0}';" -f $createdId) | Out-Null
  }

  $countAfterCleanup = [int](Invoke-Db 'SELECT count(*) FROM publications;')
  Write-Check 'La limpieza restaura el conteo inicial' ($countAfterCleanup -eq $countBefore) "inicial=$countBefore final=$countAfterCleanup"

  $createdWhere = ($createdIds | ForEach-Object { "'$_'" }) -join ','
  $remainingCreated = [int](Invoke-Db "SELECT count(*) FROM publications WHERE id IN ($createdWhere);")
  Write-Check 'No quedan filas propias de la verificación' ($remainingCreated -eq 0) "remaining=$remainingCreated"

  $evidenceAfter = Invoke-Db $evidenceSql
  Write-Check 'Las evidencias de CU1 y CU2 quedan intactas' ($evidenceAfter -eq $evidenceBefore)

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
  # normal, se eliminan igualmente las filas propias identificadas por ID exacto.
  foreach ($createdId in $createdIds) {
    try {
      Invoke-Db ("DELETE FROM publications WHERE id = '{0}';" -f $createdId) | Out-Null
    }
    catch {
      # No enmascarar el error original.
    }
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
