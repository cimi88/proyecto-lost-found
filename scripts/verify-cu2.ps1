#Requires -Version 5.1
# Verificación real del CU2 (Registrar objeto encontrado): HTTP -> NestJS -> PostgreSQL.
# Limpia exclusivamente las filas que este script crea (por ID exacto) y no toca
# datos preexistentes, incluida la publicación E2E conservada como evidencia del CU1.
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

$tempDir = Join-Path $env:TEMP ("lostfound-cu2-" + [guid]::NewGuid().ToString('N'))
$apiProcess = $null
$pgpassFile = $null
$publicationId = $null
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

  $countBefore = [int](Invoke-Db 'SELECT count(*) FROM publications;')
  $unique = [guid]::NewGuid().ToString('N')
  $title = "Mochila negra encontrada $unique"
  $validBody = @{
    title = $title
    description = 'Mochila negra con cierre y un llavero de metal, encontrada intacta.'
    category = 'BAGS'
    location = 'Biblioteca central, mostrador de atencion'
    eventDate = '2024-05-10'
  } | ConvertTo-Json -Compress

  $valid = Invoke-Api -Method 'POST' -Path '/api/v1/found-publications' -BodyJson $validBody -DemoHeader $DemoUserId
  $validJson = Convert-Body $valid.Body

  Write-Check 'POST válido responde 201' ($valid.Status -eq 201) "status=$($valid.Status)"
  Write-Check 'La respuesta contiene type=FOUND y status=ACTIVE' (
    $null -ne $validJson -and $validJson.type -eq 'FOUND' -and $validJson.status -eq 'ACTIVE'
  )
  Write-Check 'La respuesta asigna ownerId al usuario demo' (
    $null -ne $validJson -and $validJson.ownerId -eq $DemoUserId
  )
  Write-Check 'La respuesta devuelve la categoría y la fecha enviadas' (
    $null -ne $validJson -and $validJson.category -eq 'BAGS' -and $validJson.eventDate -eq '2024-05-10'
  )

  if ($null -ne $validJson -and $validJson.id) {
    $publicationId = [string]$validJson.id
    $createdIds.Add($publicationId)
  }

  if ($publicationId) {
    $row = Invoke-Db ("SELECT type || '|' || status || '|' || owner_id || '|' || category || '|' || event_date::text || '|' || title FROM publications WHERE id = '{0}';" -f $publicationId)
    $expected = "FOUND|ACTIVE|$DemoUserId|BAGS|2024-05-10|$title"
    Write-Check 'La fila existe en PostgreSQL con los valores esperados' ($row -eq $expected) "row=$row"
  }
  else {
    Write-Check 'La fila existe en PostgreSQL con los valores esperados' $false 'sin id en la respuesta'
  }

  $countAfterValid = [int](Invoke-Db 'SELECT count(*) FROM publications;')
  Write-Check 'El registro válido agregó exactamente una fila' ($countAfterValid -eq ($countBefore + 1)) "antes=$countBefore despues=$countAfterValid"

  $invalidBody = @{
    title = 'ab'
    description = 'Mochila negra con cierre y un llavero de metal, encontrada intacta.'
    category = 'BAGS'
    location = 'Biblioteca central, mostrador de atencion'
    eventDate = '2024-05-10'
  } | ConvertTo-Json -Compress
  $invalid = Invoke-Api -Method 'POST' -Path '/api/v1/found-publications' -BodyJson $invalidBody -DemoHeader $DemoUserId
  $invalidJson = Convert-Body $invalid.Body

  Write-Check 'POST con título corto responde 400' ($invalid.Status -eq 400) "status=$($invalid.Status)"
  Write-Check 'El error 400 usa VALIDATION_ERROR y detalla el campo title' (
    $null -ne $invalidJson -and
    $invalidJson.code -eq 'VALIDATION_ERROR' -and
    [bool]($invalidJson.details | Where-Object { $_.field -eq 'title' })
  )

  $futureDate = (Get-Date).ToUniversalTime().AddDays(2).ToString('yyyy-MM-dd')
  $futureBody = @{
    title = "Objeto futuro $unique"
    description = 'Descripcion suficientemente larga para pasar la validacion.'
    category = 'OTHER'
    location = 'Oficina central'
    eventDate = $futureDate
  } | ConvertTo-Json -Compress
  $future = Invoke-Api -Method 'POST' -Path '/api/v1/found-publications' -BodyJson $futureBody -DemoHeader $DemoUserId
  $futureJson = Convert-Body $future.Body

  if ($future.Status -eq 201 -and $null -ne $futureJson -and $futureJson.id) {
    $createdIds.Add([string]$futureJson.id)
  }

  Write-Check 'POST con fecha futura responde 400 y detalla eventDate' (
    $future.Status -eq 400 -and
    $null -ne $futureJson -and
    [bool]($futureJson.details | Where-Object { $_.field -eq 'eventDate' })
  ) "status=$($future.Status)"

  $categoryBody = @{
    title = "Objeto categoria $unique"
    description = 'Descripcion suficientemente larga para pasar la validacion.'
    category = 'FURNITURE'
    location = 'Oficina central'
    eventDate = '2024-05-10'
  } | ConvertTo-Json -Compress
  $category = Invoke-Api -Method 'POST' -Path '/api/v1/found-publications' -BodyJson $categoryBody -DemoHeader $DemoUserId
  $categoryJson = Convert-Body $category.Body

  Write-Check 'POST con categoría fuera de las nueve responde 400 y detalla category' (
    $category.Status -eq 400 -and
    $null -ne $categoryJson -and
    [bool]($categoryJson.details | Where-Object { $_.field -eq 'category' })
  ) "status=$($category.Status)"

  $spoofBody = @{
    title = "Objeto spoof $unique"
    description = 'Descripcion suficientemente larga para pasar la validacion.'
    category = 'OTHER'
    location = 'Oficina central'
    eventDate = '2024-05-10'
    type = 'LOST'
    status = 'CLOSED'
    ownerId = '00000000-0000-4000-8000-0000000000ff'
  } | ConvertTo-Json -Compress
  $spoof = Invoke-Api -Method 'POST' -Path '/api/v1/found-publications' -BodyJson $spoofBody -DemoHeader $DemoUserId
  $spoofJson = Convert-Body $spoof.Body

  Write-Check 'POST con type/status/ownerId del cliente responde 400 VALIDATION_ERROR' (
    $spoof.Status -eq 400 -and
    $null -ne $spoofJson -and
    $spoofJson.code -eq 'VALIDATION_ERROR' -and
    [bool]($spoofJson.details | Where-Object { $_.field -in @('type', 'status', 'ownerId') })
  ) "status=$($spoof.Status)"

  $noHeader = Invoke-Api -Method 'POST' -Path '/api/v1/found-publications' -BodyJson $validBody
  $noHeaderJson = Convert-Body $noHeader.Body

  Write-Check 'POST sin X-Demo-User-Id responde 401 DEMO_IDENTITY_REQUIRED' (
    $noHeader.Status -eq 401 -and
    $null -ne $noHeaderJson -and
    $noHeaderJson.code -eq 'DEMO_IDENTITY_REQUIRED'
  ) "status=$($noHeader.Status)"

  $unknown = Invoke-Api -Method 'POST' -Path '/api/v1/found-publications' -BodyJson $validBody -DemoHeader '00000000-0000-4000-8000-0000000000ff'
  $unknownJson = Convert-Body $unknown.Body

  Write-Check 'POST con usuario demo inexistente responde 401 DEMO_IDENTITY_INVALID' (
    $unknown.Status -eq 401 -and
    $null -ne $unknownJson -and
    $unknownJson.code -eq 'DEMO_IDENTITY_INVALID'
  ) "status=$($unknown.Status)"

  $countAfterInvalid = [int](Invoke-Db 'SELECT count(*) FROM publications;')
  Write-Check 'Las peticiones inválidas no persistieron filas' ($countAfterInvalid -eq $countAfterValid) "despues_validas=$countAfterValid despues_invalidas=$countAfterInvalid"

  foreach ($createdId in $createdIds) {
    Invoke-Db ("DELETE FROM publications WHERE id = '{0}';" -f $createdId) | Out-Null
  }

  $countAfterCleanup = [int](Invoke-Db 'SELECT count(*) FROM publications;')
  Write-Check 'La limpieza elimina solo la fila propia y deja el estado inicial (evidencia de CU1 intacta)' ($countAfterCleanup -eq $countBefore) "inicial=$countBefore final=$countAfterCleanup"

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
