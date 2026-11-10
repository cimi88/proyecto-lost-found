#Requires -Version 5.1
# Verificación real del CU4 (Filtrar y ordenar objetos): HTTP -> NestJS -> PostgreSQL.
# Crea sus propias publicaciones, valida filtros, orden, paginación, detalle,
# visibilidad ACTIVE e índices; limpia exclusivamente las filas que este
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

$tempDir = Join-Path $env:TEMP ("lostfound-cu4-" + [guid]::NewGuid().ToString('N'))
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

  $cu3Migration = Invoke-Db "SELECT count(*) FROM migrations WHERE name LIKE '%AddPublicationSearchIndexes%';"
  Write-Check 'La migración AddPublicationSearchIndexes sigue aplicada' ([int]$cu3Migration -ge 1) "count=$cu3Migration"

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
  $titleToken = 'titulocu4' + [guid]::NewGuid().ToString('N')
  $descToken = 'descripcioncu4' + [guid]::NewGuid().ToString('N')
  $locToken = 'ubicacioncu4' + [guid]::NewGuid().ToString('N')
  $relevanceToken = 'relevanciacu4' + [guid]::NewGuid().ToString('N')
  $closedToken = 'cerradacu4' + [guid]::NewGuid().ToString('N')

  $lostSports = New-Publication -Path '/api/v1/lost-publications' -Body @{
    title = $relevanceToken
    description = 'Bicicleta azul con canasto negro y una calcomanía.'
    category = 'SPORTS'
    location = 'Plaza San Martín'
    eventDate = '2024-05-10'
  }
  $lostSportsJson = Convert-Body $lostSports.Body
  $lostSportsId = if ($null -ne $lostSportsJson -and $lostSportsJson.id) { [string]$lostSportsJson.id } else { $null }
  Write-Check 'Se crea la publicación LOST/SPORTS de CU4' ($lostSports.Status -eq 201 -and [bool]$lostSportsId) "status=$($lostSports.Status)"
  if (-not $lostSportsId) { throw 'No se pudo crear la publicación LOST/SPORTS de CU4.' }
  $createdIds.Add($lostSportsId) | Out-Null

  $foundKeys = New-Publication -Path '/api/v1/found-publications' -Body @{
    title = 'Llaves de prueba CU4'
    description = $descToken
    category = 'KEYS'
    location = $locToken
    eventDate = '2024-11-12'
  }
  $foundKeysJson = Convert-Body $foundKeys.Body
  $foundKeysId = if ($null -ne $foundKeysJson -and $foundKeysJson.id) { [string]$foundKeysJson.id } else { $null }
  Write-Check 'Se crea la publicación FOUND/KEYS de CU4' ($foundKeys.Status -eq 201 -and [bool]$foundKeysId) "status=$($foundKeys.Status)"
  if (-not $foundKeysId) { throw 'No se pudo crear la publicación FOUND/KEYS de CU4.' }
  $createdIds.Add($foundKeysId) | Out-Null

  $lostBags = New-Publication -Path '/api/v1/lost-publications' -Body @{
    title = $titleToken
    description = 'Mochila gris con toalla azul.'
    category = 'BAGS'
    location = 'Vestuario del club'
    eventDate = '2024-01-15'
  }
  $lostBagsJson = Convert-Body $lostBags.Body
  $lostBagsId = if ($null -ne $lostBagsJson -and $lostBagsJson.id) { [string]$lostBagsJson.id } else { $null }
  Write-Check 'Se crea la publicación LOST/BAGS de CU4' ($lostBags.Status -eq 201 -and [bool]$lostBagsId) "status=$($lostBags.Status)"
  if (-not $lostBagsId) { throw 'No se pudo crear la publicación LOST/BAGS de CU4.' }
  $createdIds.Add($lostBagsId) | Out-Null

  $foundSports = New-Publication -Path '/api/v1/found-publications' -Body @{
    title = "Bicicleta $relevanceToken"
    description = 'Bicicleta roja sin canasto.'
    category = 'SPORTS'
    location = 'Plaza central'
    eventDate = '2023-12-01'
  }
  $foundSportsJson = Convert-Body $foundSports.Body
  $foundSportsId = if ($null -ne $foundSportsJson -and $foundSportsJson.id) { [string]$foundSportsJson.id } else { $null }
  Write-Check 'Se crea la publicación FOUND/SPORTS de CU4' ($foundSports.Status -eq 201 -and [bool]$foundSportsId) "status=$($foundSports.Status)"
  if (-not $foundSportsId) { throw 'No se pudo crear la publicación FOUND/SPORTS de CU4.' }
  $createdIds.Add($foundSportsId) | Out-Null

  $closed = New-Publication -Path '/api/v1/found-publications' -Body @{
    title = $closedToken
    description = 'No debe aparecer en la lectura pública.'
    category = 'OTHER'
    location = 'Depósito'
    eventDate = '2024-06-01'
  }
  $closedJson = Convert-Body $closed.Body
  $closedId = if ($null -ne $closedJson -and $closedJson.id) { [string]$closedJson.id } else { $null }
  Write-Check 'Se crea la publicación de control de CU4' ($closed.Status -eq 201 -and [bool]$closedId) "status=$($closed.Status)"
  if (-not $closedId) { throw 'No se pudo crear la publicación de control de CU4.' }
  $createdIds.Add($closedId) | Out-Null

  # Fechas de creación fijas para verificar orden de forma determinista.
  Invoke-Db ("UPDATE publications SET created_at = TIMESTAMPTZ '2026-11-05 10:00:00+00' WHERE id = '{0}';" -f $lostSportsId) | Out-Null
  Invoke-Db ("UPDATE publications SET created_at = TIMESTAMPTZ '2026-11-05 11:00:00+00' WHERE id = '{0}';" -f $foundKeysId) | Out-Null
  Invoke-Db ("UPDATE publications SET created_at = TIMESTAMPTZ '2026-11-05 12:00:00+00' WHERE id = '{0}';" -f $lostBagsId) | Out-Null
  Invoke-Db ("UPDATE publications SET created_at = TIMESTAMPTZ '2026-11-05 13:00:00+00' WHERE id = '{0}';" -f $foundSportsId) | Out-Null
  Invoke-Db ("UPDATE publications SET created_at = TIMESTAMPTZ '2026-11-05 14:00:00+00', status = 'RESERVED' WHERE id = '{0}';" -f $closedId) | Out-Null

  $countAfterCreate = [int](Invoke-Db 'SELECT count(*) FROM publications;')
  Write-Check 'La creación agrega exactamente cinco filas' ($countAfterCreate -eq ($countBefore + 5)) "inicial=$countBefore final=$countAfterCreate"

  $createdWhere = ($createdIds | ForEach-Object { "'$_'" }) -join ','
  $createdRows = Invoke-Db "SELECT id || '|' || type || '|' || status || '|' || category || '|' || event_date FROM publications WHERE id IN ($createdWhere) ORDER BY created_at;"
  Write-Check 'Las filas propias conservan tipo, categoría y fecha esperados' (
    $createdRows -match [regex]::Escape("$lostSportsId|LOST|ACTIVE|SPORTS|2024-05-10") -and
    $createdRows -match [regex]::Escape("$foundKeysId|FOUND|ACTIVE|KEYS|2024-11-12") -and
    $createdRows -match [regex]::Escape("$lostBagsId|LOST|ACTIVE|BAGS|2024-01-15") -and
    $createdRows -match [regex]::Escape("$foundSportsId|FOUND|ACTIVE|SPORTS|2023-12-01") -and
    $createdRows -match [regex]::Escape("$closedId|FOUND|RESERVED|OTHER|2024-06-01")
  ) $createdRows

  function Get-CreatedIntersection {
    param([object]$Json, [string[]]$ExpectedIds)

    return @(Get-ItemIds $Json | Where-Object { $ExpectedIds -contains $_ })
  }

  function Test-Sequence {
    param([string[]]$Actual, [string[]]$Expected)

    return (($Actual -join ',') -eq ($Expected -join ','))
  }

  $activeIds = @($lostSportsId, $foundKeysId, $lostBagsId, $foundSportsId)

  # --- Filtros individuales ------------------------------------------------
  $listWithoutFilters = Invoke-Api -Method 'GET' -Path '/api/v1/publications?pageSize=50'
  $listWithoutFiltersJson = Convert-Body $listWithoutFilters.Body
  $defaultCreated = @(Get-CreatedIntersection $listWithoutFiltersJson $activeIds)
  Write-Check 'El orden predeterminado es recent y excluye la publicación no activa' (
    $listWithoutFilters.Status -eq 200 -and
    (Test-Sequence $defaultCreated @($foundSportsId, $lostBagsId, $foundKeysId, $lostSportsId)) -and
    -not (@(Get-ItemIds $listWithoutFiltersJson) -contains $closedId)
  ) "status=$($listWithoutFilters.Status) created=$($defaultCreated -join ',')"

  $typeLost = Invoke-Api -Method 'GET' -Path '/api/v1/publications?type=LOST&pageSize=50'
  $typeLostJson = Convert-Body $typeLost.Body
  $typeLostCreated = @(Get-CreatedIntersection $typeLostJson $activeIds)
  Write-Check 'El filtro type=LOST devuelve solo las publicaciones LOST propias' (
    $typeLost.Status -eq 200 -and (Test-Sequence $typeLostCreated @($lostBagsId, $lostSportsId)) -and
    -not (@(Get-ItemIds $typeLostJson) -contains $closedId)
  ) "status=$($typeLost.Status) created=$($typeLostCreated -join ',')"

  $typeFound = Invoke-Api -Method 'GET' -Path '/api/v1/publications?type=FOUND&pageSize=50'
  $typeFoundJson = Convert-Body $typeFound.Body
  $typeFoundCreated = @(Get-CreatedIntersection $typeFoundJson $activeIds)
  Write-Check 'El filtro type=FOUND devuelve solo las publicaciones FOUND propias' (
    $typeFound.Status -eq 200 -and (Test-Sequence $typeFoundCreated @($foundSportsId, $foundKeysId))
  ) "status=$($typeFound.Status) created=$($typeFoundCreated -join ',')"

  $categoryKeys = Invoke-Api -Method 'GET' -Path '/api/v1/publications?category=KEYS&pageSize=50'
  $categoryKeysJson = Convert-Body $categoryKeys.Body
  $categoryKeysCreated = @(Get-CreatedIntersection $categoryKeysJson $activeIds)
  Write-Check 'El filtro category=KEYS devuelve la publicación propia esperada' (
    $categoryKeys.Status -eq 200 -and (Test-Sequence $categoryKeysCreated @($foundKeysId))
  ) "status=$($categoryKeys.Status) created=$($categoryKeysCreated -join ',')"

  $categorySports = Invoke-Api -Method 'GET' -Path '/api/v1/publications?category=SPORTS&pageSize=50'
  $categorySportsJson = Convert-Body $categorySports.Body
  $categorySportsCreated = @(Get-CreatedIntersection $categorySportsJson $activeIds)
  Write-Check 'El filtro category=SPORTS devuelve las publicaciones propias esperadas' (
    $categorySports.Status -eq 200 -and (Test-Sequence $categorySportsCreated @($foundSportsId, $lostSportsId))
  ) "status=$($categorySports.Status) created=$($categorySportsCreated -join ',')"

  $fromDate = Invoke-Api -Method 'GET' -Path '/api/v1/publications?eventDateFrom=2024-06-01&pageSize=50'
  $fromDateJson = Convert-Body $fromDate.Body
  $fromDateCreated = @(Get-CreatedIntersection $fromDateJson $activeIds)
  Write-Check 'El filtro eventDateFrom es inclusivo y excluye la publicación no activa' (
    $fromDate.Status -eq 200 -and (Test-Sequence $fromDateCreated @($foundKeysId)) -and
    -not (@(Get-ItemIds $fromDateJson) -contains $closedId)
  ) "status=$($fromDate.Status) created=$($fromDateCreated -join ',')"

  $toDate = Invoke-Api -Method 'GET' -Path '/api/v1/publications?eventDateTo=2024-01-31&pageSize=50'
  $toDateJson = Convert-Body $toDate.Body
  $toDateCreated = @(Get-CreatedIntersection $toDateJson $activeIds)
  Write-Check 'El filtro eventDateTo es inclusivo' (
    $toDate.Status -eq 200 -and (Test-Sequence $toDateCreated @($foundSportsId, $lostBagsId))
  ) "status=$($toDate.Status) created=$($toDateCreated -join ',')"

  $boundaries = Invoke-Api -Method 'GET' -Path '/api/v1/publications?eventDateFrom=2024-05-10&eventDateTo=2024-11-12&pageSize=50'
  $boundariesJson = Convert-Body $boundaries.Body
  $boundariesCreated = @(Get-CreatedIntersection $boundariesJson $activeIds)
  Write-Check 'Los extremos del rango de fechas se incluyen' (
    $boundaries.Status -eq 200 -and (Test-Sequence $boundariesCreated @($foundKeysId, $lostSportsId))
  ) "status=$($boundaries.Status) created=$($boundariesCreated -join ',')"

  $combined = Invoke-Api -Method 'GET' -Path '/api/v1/publications?type=LOST&category=SPORTS&eventDateFrom=2024-01-01&eventDateTo=2024-12-31&pageSize=50'
  $combinedJson = Convert-Body $combined.Body
  $combinedCreated = @(Get-CreatedIntersection $combinedJson $activeIds)
  Write-Check 'Los filtros se combinan con AND' (
    $combined.Status -eq 200 -and (Test-Sequence $combinedCreated @($lostSportsId))
  ) "status=$($combined.Status) created=$($combinedCreated -join ',')"

  # --- Búsqueda textual de CU3 y combinación con filtros -------------------
  $titleSearch = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$titleToken&pageSize=50"
  $titleSearchJson = Convert-Body $titleSearch.Body
  $titleSearchCreated = @(Get-CreatedIntersection $titleSearchJson $activeIds)
  Write-Check 'La búsqueda por título de CU3 sigue funcionando' (
    $titleSearch.Status -eq 200 -and (Test-Sequence $titleSearchCreated @($lostBagsId))
  ) "status=$($titleSearch.Status) created=$($titleSearchCreated -join ',')"

  $descriptionSearch = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$descToken&pageSize=50"
  $descriptionSearchJson = Convert-Body $descriptionSearch.Body
  $descriptionSearchCreated = @(Get-CreatedIntersection $descriptionSearchJson $activeIds)
  Write-Check 'La búsqueda por descripción de CU3 sigue funcionando' (
    $descriptionSearch.Status -eq 200 -and (Test-Sequence $descriptionSearchCreated @($foundKeysId))
  ) "status=$($descriptionSearch.Status) created=$($descriptionSearchCreated -join ',')"

  $locationSearch = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$locToken&pageSize=50"
  $locationSearchJson = Convert-Body $locationSearch.Body
  $locationSearchCreated = @(Get-CreatedIntersection $locationSearchJson $activeIds)
  Write-Check 'La búsqueda por ubicación de CU3 sigue funcionando' (
    $locationSearch.Status -eq 200 -and (Test-Sequence $locationSearchCreated @($foundKeysId))
  ) "status=$($locationSearch.Status) created=$($locationSearchCreated -join ',')"

  $textAndFilter = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$titleToken&type=LOST&pageSize=50"
  $textAndFilterJson = Convert-Body $textAndFilter.Body
  $textAndFilterCreated = @(Get-CreatedIntersection $textAndFilterJson $activeIds)
  Write-Check 'La búsqueda textual se combina con los filtros mediante AND' (
    $textAndFilter.Status -eq 200 -and (Test-Sequence $textAndFilterCreated @($lostBagsId))
  ) "status=$($textAndFilter.Status) created=$($textAndFilterCreated -join ',')"

  # --- Orden ----------------------------------------------------------------
  $oldest = Invoke-Api -Method 'GET' -Path '/api/v1/publications?sort=oldest&pageSize=50'
  $oldestJson = Convert-Body $oldest.Body
  $oldestCreated = @(Get-CreatedIntersection $oldestJson $activeIds)
  Write-Check 'sort=oldest ordena por createdAt e id ascendentes' (
    $oldest.Status -eq 200 -and (Test-Sequence $oldestCreated @($lostSportsId, $foundKeysId, $lostBagsId, $foundSportsId))
  ) "status=$($oldest.Status) created=$($oldestCreated -join ',')"

  $relevance = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$relevanceToken&sort=relevance&pageSize=50"
  $relevanceJson = Convert-Body $relevance.Body
  $relevanceCreated = @(Get-CreatedIntersection $relevanceJson $activeIds)
  Write-Check 'sort=relevance ordena por similitud trigram y no por recencia' (
    $relevance.Status -eq 200 -and (Test-Sequence $relevanceCreated @($lostSportsId, $foundSportsId))
  ) "status=$($relevance.Status) created=$($relevanceCreated -join ',')"

  # --- Paginación con filtros y orden --------------------------------------
  $page1 = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$relevanceToken&page=1&pageSize=1"
  $page1Json = Convert-Body $page1.Body
  $page1Created = @(Get-CreatedIntersection $page1Json $activeIds)
  $page2 = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$relevanceToken&page=2&pageSize=1"
  $page2Json = Convert-Body $page2.Body
  $page2Created = @(Get-CreatedIntersection $page2Json $activeIds)
  Write-Check 'La paginación conserva los filtros y el orden' (
    $page1.Status -eq 200 -and $page2.Status -eq 200 -and
    $page1Json.total -eq 2 -and $page2Json.total -eq 2 -and
    $page1Json.totalPages -eq 2 -and $page2Json.totalPages -eq 2 -and
    (Test-Sequence $page1Created @($foundSportsId)) -and
    (Test-Sequence $page2Created @($lostSportsId))
  ) "page1=$($page1Created -join ',') page2=$($page2Created -join ',')"

  # --- Validación de parámetros --------------------------------------------
  Assert-ApiError 'Se rechaza type=RESERVED con 400 VALIDATION_ERROR' (Invoke-Api -Method 'GET' -Path '/api/v1/publications?type=RESERVED') 400 'VALIDATION_ERROR' 'type' | Out-Null
  Assert-ApiError 'Se rechaza una categoría inválida con 400 VALIDATION_ERROR' (Invoke-Api -Method 'GET' -Path '/api/v1/publications?category=VEHICLES') 400 'VALIDATION_ERROR' 'category' | Out-Null
  Assert-ApiError 'Se rechaza eventDateFrom inválida con 400 VALIDATION_ERROR' (Invoke-Api -Method 'GET' -Path '/api/v1/publications?eventDateFrom=2024-02-30') 400 'VALIDATION_ERROR' 'eventDateFrom' | Out-Null
  Assert-ApiError 'Se rechaza eventDateTo inválida con 400 VALIDATION_ERROR' (Invoke-Api -Method 'GET' -Path '/api/v1/publications?eventDateTo=2024-13-01') 400 'VALIDATION_ERROR' 'eventDateTo' | Out-Null
  Assert-ApiError 'Se rechaza un sort desconocido con 400 VALIDATION_ERROR' (Invoke-Api -Method 'GET' -Path '/api/v1/publications?sort=createdAt') 400 'VALIDATION_ERROR' 'sort' | Out-Null
  Assert-ApiError 'Se rechaza sort=relevance sin q con 400 VALIDATION_ERROR' (Invoke-Api -Method 'GET' -Path '/api/v1/publications?sort=relevance') 400 'VALIDATION_ERROR' 'sort' | Out-Null
  Assert-ApiError 'Se rechaza un rango de fechas invertido con 400 VALIDATION_ERROR' (Invoke-Api -Method 'GET' -Path '/api/v1/publications?eventDateFrom=2024-12-31&eventDateTo=2024-01-01') 400 'VALIDATION_ERROR' 'eventDateTo' | Out-Null
  Assert-ApiError 'Se rechaza ownerId como parámetro desconocido' (Invoke-Api -Method 'GET' -Path '/api/v1/publications?ownerId=unknown') 400 'VALIDATION_ERROR' 'ownerId' | Out-Null
  Assert-ApiError 'Se rechaza status como parámetro desconocido' (Invoke-Api -Method 'GET' -Path '/api/v1/publications?status=RESERVED') 400 'VALIDATION_ERROR' 'status' | Out-Null
  Assert-ApiError 'Se rechaza page=0 con 400 VALIDATION_ERROR' (Invoke-Api -Method 'GET' -Path '/api/v1/publications?page=0') 400 'VALIDATION_ERROR' 'page' | Out-Null
  Assert-ApiError 'Se rechaza pageSize=51 con 400 VALIDATION_ERROR' (Invoke-Api -Method 'GET' -Path '/api/v1/publications?pageSize=51') 400 'VALIDATION_ERROR' 'pageSize' | Out-Null
  $longQuery = 'x' * 101
  Assert-ApiError 'Se rechaza q de más de 100 caracteres con 400 VALIDATION_ERROR' (Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$longQuery") 400 'VALIDATION_ERROR' 'q' | Out-Null

  # --- Visibilidad ACTIVE ---------------------------------------------------
  $hiddenSearch = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$closedToken&pageSize=50"
  $hiddenJson = Convert-Body $hiddenSearch.Body
  Write-Check 'El listado excluye una publicación RESERVED aunque se filtre por su texto' (
    $hiddenSearch.Status -eq 200 -and $null -ne $hiddenJson -and
    $hiddenJson.total -eq 0 -and @(Get-ItemIds $hiddenJson).Count -eq 0
  ) "status=$($hiddenSearch.Status) total=$($hiddenJson.total)"

  $hiddenDetail = Invoke-Api -Method 'GET' -Path "/api/v1/publications/$closedId"
  Assert-ApiError 'El detalle de una publicación RESERVED responde 404 PUBLICATION_NOT_FOUND' $hiddenDetail 404 'PUBLICATION_NOT_FOUND' | Out-Null

  # --- Limpieza y preservación ---------------------------------------------
  foreach ($createdId in $createdIds) {
    Invoke-Db ("DELETE FROM publications WHERE id = '{0}';" -f $createdId) | Out-Null
  }

  $countAfterCleanup = [int](Invoke-Db 'SELECT count(*) FROM publications;')
  Write-Check 'La limpieza restaura el conteo inicial' ($countAfterCleanup -eq $countBefore) "inicial=$countBefore final=$countAfterCleanup"

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
