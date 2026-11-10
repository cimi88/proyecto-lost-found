#Requires -Version 5.1
# Verificación real del CU7 (Solicitar recuperación): HTTP -> NestJS -> PostgreSQL.
# Aplica la migración aditiva AddRecoveryRequests (el down se verifica en tests
# unitarios; este script NUNCA revierte migraciones en lostfound_dev).
# Crea usuarios, publicaciones y solicitudes propias con UUIDs propios y verifica:
# creación, duplicado, listas, permisos, aprobación con rechazo de otras
# pendientes, exclusividad de una sola APPROVED, rechazo, cancelación PENDING y
# APPROVED, reserva inconsistente sin reactivación, privacidad y 404 de
# publicación no apta.
# Limpieza: elimina solo sus filas por ID exacto, en orden requests -> publications
# -> users. No ejecuta DELETE generales ni db:revert. Preserva las evidencias de
# CU1/CU2 y el resto de las coincidencias.
[CmdletBinding()]
param(
  [string]$PgBin = 'C:\Program Files\PostgreSQL\18\bin',
  [string]$BackendDir,
  [string]$BaseUrl = 'http://localhost:3000',
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

$tempDir = Join-Path $env:TEMP ("lostfound-cu7-" + [guid]::NewGuid().ToString('N'))
$apiProcess = $null
$pgpassFile = $null
$createdUserIds = New-Object System.Collections.Generic.List[string]
$createdPublicationIds = New-Object System.Collections.Generic.List[string]
$createdRequestIds = New-Object System.Collections.Generic.List[string]

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

  function Invoke-DbExpectFailure {
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

    return [pscustomobject]@{
      Failed = ($code -ne 0)
      Output = Redact (($output | ForEach-Object { $_.ToString() }) -join "`n")
    }
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
      [string]$UserId
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

    if ($UserId) {
      $curlArgs += @('--header', "X-Demo-User-Id: $UserId")
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
      Json = Convert-Body $body
    }
  }

  function Assert-ApiError {
    param(
      [string]$Name,
      [object]$Response,
      [int]$ExpectedStatus,
      [string]$ExpectedCode,
      [string]$ExpectedField = ''
    )

    $json = $Response.Json
    $ok = $Response.Status -eq $ExpectedStatus -and $null -ne $json -and $json.code -eq $ExpectedCode

    if ($ok -and $ExpectedField) {
      $ok = [bool]($json.details | Where-Object { $_.field -eq $ExpectedField })
    }

    Write-Check $Name $ok "status=$($Response.Status) code=$($json.code)"
    return $json
  }

  function New-Request {
    param(
      [string]$PublicationId,
      [string]$UserId,
      [hashtable]$Body = @{}
    )

    $json = if ($Body.Count -gt 0) { $Body | ConvertTo-Json -Compress } else { '{}' }
    return Invoke-Api -Method 'POST' -Path "/api/v1/publications/$PublicationId/recovery-requests" -BodyJson $json -UserId $UserId
  }

  function Get-RequestId {
    param([object]$Response)

    if ($null -ne $Response.Json -and $Response.Json.id) {
      return [string]$Response.Json.id
    }

    return $null
  }

  function Add-RequestId {
    param([string]$Id)

    if ($Id) {
      $script:CreatedRequestIds.Add($Id) | Out-Null
    }
  }

  # --- Migración CU7: aplicar (aditiva; sin revert) ---------------------------
  Write-Host 'Compilando y aplicando migraciones...'
  $migrate = Invoke-Npm 'db:migrate'
  if ($migrate.Code -ne 0) {
    throw "npm run db:migrate falló (exit $($migrate.Code)): $($migrate.Text)"
  }

  $migrationApplied = Invoke-Db "SELECT name FROM migrations WHERE name LIKE '%AddRecoveryRequests%';"
  Write-Check 'La migración AddRecoveryRequests está aplicada' ($migrationApplied -like '*AddRecoveryRequests*')

  $tableExists = Invoke-Db "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recovery_requests';"
  Write-Check 'La tabla recovery_requests existe' ([int]$tableExists -eq 1) "count=$tableExists"

  $indexNames = (Invoke-Db "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'recovery_requests' ORDER BY indexname;") -split "`r?`n"
  foreach ($indexName in @(
      'recovery_requests_active_requester_unique',
      'recovery_requests_single_approved_unique',
      'recovery_requests_publication_status_idx',
      'recovery_requests_requester_status_idx'
    )) {
    Write-Check "El índice $indexName existe" ($indexNames -contains $indexName)
  }

  $constraintNames = Invoke-Db "SELECT conname FROM pg_constraint WHERE conrelid = 'recovery_requests'::regclass ORDER BY conname;"
  foreach ($constraintName in @(
      'recovery_requests_status_check',
      'recovery_requests_cancellation_check',
      'recovery_requests_publication_fk',
      'recovery_requests_requester_fk',
      'recovery_requests_cancelled_by_fk'
    )) {
    Write-Check "La restricción $constraintName existe" ($constraintNames -like "*$constraintName*")
  }

  # --- Snapshot de evidencias y conteos ---------------------------------------
  $evidenceIds = @(
    '82d35348-d8b3-4149-9ac7-4a8cbb0fe1ec',
    '12702eca-9ef6-4a03-9421-e980ae06e0c4'
  )
  $evidenceWhere = ($evidenceIds | ForEach-Object { "'$_'" }) -join ','
  $evidenceSql = "SELECT id || '|' || type || '|' || status || '|' || owner_id || '|' || title || '|' || description || '|' || category || '|' || location || '|' || event_date::text || '|' || created_at::text || '|' || updated_at::text FROM publications WHERE id IN ($evidenceWhere) ORDER BY id;"
  $script:EvidenceBefore = Invoke-Db $evidenceSql
  $evidenceCountBefore = [int](Invoke-Db "SELECT count(*) FROM publications WHERE id IN ($evidenceWhere);")
  Write-Check 'Las evidencias de CU1 y CU2 están presentes antes de la verificación' ($evidenceCountBefore -eq 2) "count=$evidenceCountBefore"

  $publicationsBefore = [int](Invoke-Db 'SELECT count(*) FROM publications;')
  $requestsBefore = [int](Invoke-Db 'SELECT count(*) FROM recovery_requests;')
  $usersBefore = [int](Invoke-Db 'SELECT count(*) FROM users;')
  $matchesBefore = [int](Invoke-Db 'SELECT count(*) FROM publication_matches;')
  Write-Check 'El snapshot inicial de conteos se capturó' ($true) "publications=$publicationsBefore requests=$requestsBefore users=$usersBefore matches=$matchesBefore"

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
    if ($apiProcess.HasExited) { break }

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
    if (Test-Path $apiErr) { $apiError = Redact (Get-Content $apiErr -Raw) }
    throw "La API no respondió en $StartupTimeoutSeconds s. $apiError"
  }

  # --- Fixtures propias ---------------------------------------------------------
  $token = [guid]::NewGuid().ToString('N')
  $ownerId = [guid]::NewGuid().ToString()
  $requesterId = [guid]::NewGuid().ToString()
  $otherId = [guid]::NewGuid().ToString()
  $adminId = [guid]::NewGuid().ToString()
  $intruderId = [guid]::NewGuid().ToString()

  foreach ($id in @($ownerId, $requesterId, $otherId, $adminId, $intruderId)) {
    $script:CreatedUserIds.Add($id) | Out-Null
  }

  $ownerName = "Owner $token"
  $requesterName = "Requester $token"
  $otherName = "Other $token"
  $adminName = "Admin $token"
  $intruderName = "Intruder $token"

  $userRows = @(
    "('$ownerId', 'owner-$token@example.test', '$ownerName', 'USER')",
    "('$requesterId', 'requester-$token@example.test', '$requesterName', 'USER')",
    "('$otherId', 'other-$token@example.test', '$otherName', 'USER')",
    "('$adminId', 'admin-$token@example.test', '$adminName', 'ADMIN')",
    "('$intruderId', 'intruder-$token@example.test', '$intruderName', 'USER')"
  ) -join ','
  Invoke-Db "INSERT INTO users (id, email, display_name, role) VALUES $userRows;" | Out-Null

  $publication = Invoke-Api -Method 'POST' -Path '/api/v1/found-publications' -UserId $ownerId -BodyJson (@{
    title = "Mochila negra con marca azul $token"
    description = 'Mochila negra de gimnasio con una marca azul y un cierre roto.'
    category = 'BAGS'
    location = "Vestuario del club $token"
    eventDate = '2026-11-01'
  } | ConvertTo-Json -Compress)
  $publicationId = if ($null -ne $publication.Json -and $publication.Json.id) { [string]$publication.Json.id } else { $null }
  Write-Check 'Se crea la publicación FOUND propia del propietario' ($publication.Status -eq 201 -and [bool]$publicationId) "status=$($publication.Status)"
  if (-not $publicationId) { throw 'No se pudo crear la publicación FOUND de CU7.' }
  $script:CreatedPublicationIds.Add($publicationId) | Out-Null

  # --- Creación, duplicado, permisos y privacidad -------------------------------
  $createA = New-Request -PublicationId $publicationId -UserId $requesterId -Body @{ notes = '  Tiene una marca azul.  ' }
  $requestA = Get-RequestId $createA
  Add-RequestId $requestA
  $createAKeys = if ($null -ne $createA.Json) { (($createA.Json.PSObject.Properties.Name) | Sort-Object) -join ',' } else { '' }
  $publicationKeys = if ($null -ne $createA.Json) { (($createA.Json.publication.PSObject.Properties.Name) | Sort-Object) -join ',' } else { '' }
  Write-Check 'La creación devuelve 201 PENDING con notas recortadas' (
    $createA.Status -eq 201 -and $createA.Json.status -eq 'PENDING' -and
    $createA.Json.notes -eq 'Tiene una marca azul.' -and [bool]$requestA
  ) "status=$($createA.Status)"
  Write-Check 'La respuesta no expone IDs internos, correo ni contacto' (
    $createAKeys -eq 'cancellationReason,createdAt,id,notes,publication,requesterDisplayName,status,updatedAt' -and
    $publicationKeys -eq 'category,createdAt,description,eventDate,id,location,status,title,type' -and
    $createA.Body -notmatch '@' -and $createA.Body -notmatch 'ownerId' -and
    $createA.Body -notmatch 'requesterId' -and $createA.Body -notmatch 'cancelledById'
  ) "keys=$createAKeys publicationKeys=$publicationKeys"

  Assert-ApiError 'El duplicado activo responde 409 RECOVERY_REQUEST_DUPLICATE' (
    New-Request -PublicationId $publicationId -UserId $requesterId
  ) 409 'RECOVERY_REQUEST_DUPLICATE' | Out-Null

  $createB = New-Request -PublicationId $publicationId -UserId $otherId
  $requestB = Get-RequestId $createB
  Add-RequestId $requestB
  Write-Check 'Otro solicitante puede crear una segunda solicitud PENDING' ($createB.Status -eq 201 -and [bool]$requestB) "status=$($createB.Status)"

  Assert-ApiError 'El propietario no puede solicitar su propia publicación' (
    New-Request -PublicationId $publicationId -UserId $ownerId
  ) 403 'RECOVERY_REQUEST_FORBIDDEN' | Out-Null

  Assert-ApiError 'Una publicación LOST responde 404 PUBLICATION_NOT_FOUND' (
    New-Request -PublicationId '82d35348-d8b3-4149-9ac7-4a8cbb0fe1ec' -UserId $requesterId
  ) 404 'PUBLICATION_NOT_FOUND' | Out-Null

  Assert-ApiError 'Una publicación inexistente responde 404 PUBLICATION_NOT_FOUND' (
    New-Request -PublicationId ([guid]::NewGuid().ToString()) -UserId $requesterId
  ) 404 'PUBLICATION_NOT_FOUND' | Out-Null

  # --- Listas -------------------------------------------------------------------
  $mine = Invoke-Api -Method 'GET' -Path '/api/v1/recovery-requests/mine' -UserId $requesterId
  $received = Invoke-Api -Method 'GET' -Path '/api/v1/recovery-requests/received' -UserId $ownerId
  $mineIds = @($mine.Json | ForEach-Object { [string]$_.id })
  $receivedIds = @($received.Json | ForEach-Object { [string]$_.id })
  Write-Check 'mine devuelve solo las solicitudes del solicitante' (
    $mine.Status -eq 200 -and $mineIds -contains $requestA -and -not ($mineIds -contains $requestB) -and
    $mine.Json[0].requesterDisplayName -eq $requesterName
  ) "status=$($mine.Status) ids=$($mineIds -join ',')"
  Write-Check 'received devuelve las solicitudes de las publicaciones propias' (
    $received.Status -eq 200 -and $receivedIds -contains $requestA -and $receivedIds -contains $requestB -and
    $received.Json[0].publication.id -eq $publicationId -and
    $received.Body -notmatch '@'
  ) "status=$($received.Status) ids=$($receivedIds -join ',')"

  # --- Aprobación y exclusividad -------------------------------------------------
  Assert-ApiError 'El solicitante no puede aprobar su solicitud' (
    Invoke-Api -Method 'POST' -Path "/api/v1/recovery-requests/$requestA/approve" -UserId $requesterId
  ) 403 'RECOVERY_REQUEST_FORBIDDEN' | Out-Null

  $approveA = Invoke-Api -Method 'POST' -Path "/api/v1/recovery-requests/$requestA/approve" -UserId $ownerId
  Write-Check 'El propietario aprueba y la publicación queda RESERVED' (
    $approveA.Status -eq 200 -and $approveA.Json.status -eq 'APPROVED' -and
    $approveA.Json.publication.status -eq 'RESERVED'
  ) "status=$($approveA.Status)"

  $approvedCount = [int](Invoke-Db "SELECT count(*) FROM recovery_requests WHERE publication_id = '$publicationId' AND status = 'APPROVED';")
  $rejectedOther = [int](Invoke-Db "SELECT count(*) FROM recovery_requests WHERE id = '$requestB' AND status = 'REJECTED';")
  $publicationStatus = Invoke-Db "SELECT status FROM publications WHERE id = '$publicationId';"
  Write-Check 'Solo queda una APPROVED y las demás PENDING pasan a REJECTED' (
    $approvedCount -eq 1 -and $rejectedOther -eq 1
  ) "approved=$approvedCount rejectedOther=$rejectedOther"
  Write-Check 'La publicación quedó RESERVED en PostgreSQL' ($publicationStatus -eq 'RESERVED') "status=$publicationStatus"

  Assert-ApiError 'Una publicación RESERVED no admite nuevas solicitudes' (
    New-Request -PublicationId $publicationId -UserId $intruderId
  ) 404 'PUBLICATION_NOT_FOUND' | Out-Null

  $detailReserved = Invoke-Api -Method 'GET' -Path "/api/v1/publications/$publicationId"
  $matchesReserved = Invoke-Api -Method 'GET' -Path "/api/v1/publications/$publicationId/matches"
  $listReserved = Invoke-Api -Method 'GET' -Path "/api/v1/publications?q=$token"
  $listIds = @($listReserved.Json.items | ForEach-Object { [string]$_.id })
  Write-Check 'La publicación RESERVED desaparece de las lecturas públicas' (
    $detailReserved.Status -eq 404 -and $matchesReserved.Status -eq 404 -and
    $listReserved.Status -eq 200 -and -not ($listIds -contains $publicationId)
  ) "detail=$($detailReserved.Status) matches=$($matchesReserved.Status)"

  $uniqueIndexFailure = Invoke-DbExpectFailure "UPDATE recovery_requests SET status = 'APPROVED' WHERE id = '$requestB';"
  Write-Check 'El índice único impide una segunda APPROVED por publicación' (
    $uniqueIndexFailure.Failed -and $uniqueIndexFailure.Output -match 'recovery_requests_single_approved_unique'
  ) "failed=$($uniqueIndexFailure.Failed)"

  # --- Cancelación de APPROVED ----------------------------------------------------
  Assert-ApiError 'Cancelar una aprobada con motivo inválido responde 400' (
    Invoke-Api -Method 'POST' -Path "/api/v1/recovery-requests/$requestA/cancel" -UserId $adminId -BodyJson (@{ reason = 'x' } | ConvertTo-Json -Compress)
  ) 400 'VALIDATION_ERROR' 'reason' | Out-Null

  Assert-ApiError 'Un usuario ajeno no puede cancelar una aprobada' (
    Invoke-Api -Method 'POST' -Path "/api/v1/recovery-requests/$requestA/cancel" -UserId $intruderId -BodyJson (@{ reason = 'Motivo ajeno' } | ConvertTo-Json -Compress)
  ) 403 'RECOVERY_REQUEST_FORBIDDEN' | Out-Null

  $cancelAdmin = Invoke-Api -Method 'POST' -Path "/api/v1/recovery-requests/$requestA/cancel" -UserId $adminId -BodyJson (@{ reason = 'Cancelación administrativa de prueba.' } | ConvertTo-Json -Compress)
  $publicationAfterAdminCancel = Invoke-Db "SELECT status FROM publications WHERE id = '$publicationId';"
  $cancelledActor = Invoke-Db "SELECT cancelled_by_id FROM recovery_requests WHERE id = '$requestA';"
  Write-Check 'ADMIN cancela la aprobada y la publicación vuelve a ACTIVE' (
    $cancelAdmin.Status -eq 200 -and $cancelAdmin.Json.status -eq 'CANCELLED' -and
    $publicationAfterAdminCancel -eq 'ACTIVE' -and $cancelledActor -eq $adminId
  ) "status=$($cancelAdmin.Status) publication=$publicationAfterAdminCancel"

  $createC = New-Request -PublicationId $publicationId -UserId $requesterId
  $requestC = Get-RequestId $createC
  Add-RequestId $requestC
  Write-Check 'Tras cancelar una aprobada se puede crear otra solicitud' ($createC.Status -eq 201 -and [bool]$requestC) "status=$($createC.Status)"

  $approveC = Invoke-Api -Method 'POST' -Path "/api/v1/recovery-requests/$requestC/approve" -UserId $ownerId
  $cancelRequester = Invoke-Api -Method 'POST' -Path "/api/v1/recovery-requests/$requestC/cancel" -UserId $requesterId -BodyJson (@{ reason = 'El solicitante desistió de la reserva.' } | ConvertTo-Json -Compress)
  $publicationAfterRequesterCancel = Invoke-Db "SELECT status FROM publications WHERE id = '$publicationId';"
  Write-Check 'El solicitante cancela su aprobada y registra actor/motivo' (
    $approveC.Status -eq 200 -and $cancelRequester.Status -eq 200 -and
    $cancelRequester.Json.status -eq 'CANCELLED' -and
    $cancelRequester.Json.cancellationReason -eq 'El solicitante desistió de la reserva.' -and
    $publicationAfterRequesterCancel -eq 'ACTIVE'
  ) "approve=$($approveC.Status) cancel=$($cancelRequester.Status)"

  # --- Rechazo y cancelación PENDING ------------------------------------------------
  $createD = New-Request -PublicationId $publicationId -UserId $otherId
  $requestD = Get-RequestId $createD
  Add-RequestId $requestD
  $rejectD = Invoke-Api -Method 'POST' -Path "/api/v1/recovery-requests/$requestD/reject" -UserId $ownerId
  $publicationAfterReject = Invoke-Db "SELECT status FROM publications WHERE id = '$publicationId';"
  Write-Check 'El propietario rechaza una PENDING sin cambiar la publicación' (
    $rejectD.Status -eq 200 -and $rejectD.Json.status -eq 'REJECTED' -and
    $publicationAfterReject -eq 'ACTIVE'
  ) "status=$($rejectD.Status)"

  Assert-ApiError 'Aprobar una solicitud ya no pendiente responde 409 RECOVERY_REQUEST_NOT_PENDING' (
    Invoke-Api -Method 'POST' -Path "/api/v1/recovery-requests/$requestD/approve" -UserId $ownerId
  ) 409 'RECOVERY_REQUEST_NOT_PENDING' | Out-Null

  $createE = New-Request -PublicationId $publicationId -UserId $otherId
  $requestE = Get-RequestId $createE
  Add-RequestId $requestE
  $cancelPendingOther = Invoke-Api -Method 'POST' -Path "/api/v1/recovery-requests/$requestE/cancel" -UserId $otherId -BodyJson (@{ reason = 'Ya no necesito reclamarla.' } | ConvertTo-Json -Compress)
  Write-Check 'El solicitante cancela su propia PENDING con motivo' (
    $createE.Status -eq 201 -and $cancelPendingOther.Status -eq 200 -and
    $cancelPendingOther.Json.status -eq 'CANCELLED' -and
    $cancelPendingOther.Json.cancellationReason -eq 'Ya no necesito reclamarla.'
  ) "status=$($cancelPendingOther.Status)"

  $createF = New-Request -PublicationId $publicationId -UserId $requesterId
  $requestF = Get-RequestId $createF
  Add-RequestId $requestF
  Assert-ApiError 'El propietario no puede cancelar una PENDING' (
    Invoke-Api -Method 'POST' -Path "/api/v1/recovery-requests/$requestF/cancel" -UserId $ownerId -BodyJson (@{ reason = 'Motivo del propietario' } | ConvertTo-Json -Compress)
  ) 403 'RECOVERY_REQUEST_FORBIDDEN' | Out-Null
  $cancelF = Invoke-Api -Method 'POST' -Path "/api/v1/recovery-requests/$requestF/cancel" -UserId $requesterId -BodyJson (@{ reason = 'Cancelación de la solicitante.' } | ConvertTo-Json -Compress)
  Write-Check 'La solicitante sí puede cancelar su PENDING' ($cancelF.Status -eq 200 -and $cancelF.Json.status -eq 'CANCELLED') "status=$($cancelF.Status)"

  # --- Inconsistencia de reserva y exclusividad ------------------------------------
  $createG = New-Request -PublicationId $publicationId -UserId $requesterId
  $requestG = Get-RequestId $createG
  Add-RequestId $requestG
  $createH = New-Request -PublicationId $publicationId -UserId $otherId
  $requestH = Get-RequestId $createH
  Add-RequestId $requestH

  $approveG = Invoke-Api -Method 'POST' -Path "/api/v1/recovery-requests/$requestG/approve" -UserId $ownerId
  $approvedCountG = [int](Invoke-Db "SELECT count(*) FROM recovery_requests WHERE publication_id = '$publicationId' AND status = 'APPROVED';")
  $otherRejectedG = [int](Invoke-Db "SELECT count(*) FROM recovery_requests WHERE id = '$requestH' AND status = 'REJECTED';")
  Write-Check 'La aprobación de G deja una sola APPROVED y rechaza H' (
    $approveG.Status -eq 200 -and $approvedCountG -eq 1 -and $otherRejectedG -eq 1
  ) "approved=$approvedCountG rejectedH=$otherRejectedG"

  $uniqueIndexFailure2 = Invoke-DbExpectFailure "UPDATE recovery_requests SET status = 'APPROVED' WHERE id = '$requestH';"
  Write-Check 'La base rechaza una segunda APPROVED aunque se intente por SQL' (
    $uniqueIndexFailure2.Failed -and $uniqueIndexFailure2.Output -match 'recovery_requests_single_approved_unique'
  ) "failed=$($uniqueIndexFailure2.Failed)"

  # Inconsistencia deliberada sobre una fila propia: CLOSED en lugar de RESERVED.
  Invoke-Db "UPDATE publications SET status = 'CLOSED', updated_at = now() WHERE id = '$publicationId';" | Out-Null
  Assert-ApiError 'Cancelar una aprobada con reserva inconsistente responde 409 RECOVERY_REQUEST_CONFLICT' (
    Invoke-Api -Method 'POST' -Path "/api/v1/recovery-requests/$requestG/cancel" -UserId $requesterId -BodyJson (@{ reason = 'Intento con reserva inconsistente.' } | ConvertTo-Json -Compress)
  ) 409 'RECOVERY_REQUEST_CONFLICT' | Out-Null
  $statusAfterConflict = Invoke-Db "SELECT status FROM publications WHERE id = '$publicationId';"
  $requestGStatus = Invoke-Db "SELECT status FROM recovery_requests WHERE id = '$requestG';"
  Write-Check 'La inconsistencia no reactiva la publicación ni cambia la solicitud' (
    $statusAfterConflict -eq 'CLOSED' -and $requestGStatus -eq 'APPROVED'
  ) "publication=$statusAfterConflict request=$requestGStatus"

  # --- Preservación y limpieza ------------------------------------------------------
  $evidenceMidRun = Invoke-Db $evidenceSql
  Write-Check 'Las publicaciones de evidencia mantienen todos sus valores durante la verificación' ($evidenceMidRun -eq $script:EvidenceBefore)

  Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue
  $apiProcess.WaitForExit() | Out-Null
  $apiProcess = $null

  foreach ($requestId in $script:CreatedRequestIds) {
    Invoke-Db ("DELETE FROM recovery_requests WHERE id = '{0}';" -f $requestId) | Out-Null
  }
  foreach ($publicationToDelete in $script:CreatedPublicationIds) {
    Invoke-Db ("DELETE FROM publications WHERE id = '{0}';" -f $publicationToDelete) | Out-Null
  }
  foreach ($userId in $script:CreatedUserIds) {
    Invoke-Db ("DELETE FROM users WHERE id = '{0}';" -f $userId) | Out-Null
  }

  $publicationsAfter = [int](Invoke-Db 'SELECT count(*) FROM publications;')
  $requestsAfter = [int](Invoke-Db 'SELECT count(*) FROM recovery_requests;')
  $usersAfter = [int](Invoke-Db 'SELECT count(*) FROM users;')
  $matchesAfter = [int](Invoke-Db 'SELECT count(*) FROM publication_matches;')
  Write-Check 'La limpieza restaura los conteos iniciales' (
    $publicationsAfter -eq $publicationsBefore -and
    $requestsAfter -eq $requestsBefore -and
    $usersAfter -eq $usersBefore -and
    $matchesAfter -eq $matchesBefore
  ) "publications=$publicationsAfter requests=$requestsAfter users=$usersAfter matches=$matchesAfter"

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

  try {
    foreach ($requestId in $script:CreatedRequestIds) {
      Invoke-Db ("DELETE FROM recovery_requests WHERE id = '{0}';" -f $requestId) | Out-Null
    }
    foreach ($publicationToDelete in $script:CreatedPublicationIds) {
      Invoke-Db ("DELETE FROM publications WHERE id = '{0}';" -f $publicationToDelete) | Out-Null
    }
    foreach ($userId in $script:CreatedUserIds) {
      Invoke-Db ("DELETE FROM users WHERE id = '{0}';" -f $userId) | Out-Null
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
