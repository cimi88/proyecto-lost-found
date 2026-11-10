#Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$PgBin = 'C:\Program Files\PostgreSQL\18\bin',
  [string]$PgHost = 'localhost',
  [int]$PgPort = 5432,
  [string]$SuperUser = 'postgres',
  [string]$AppRole = 'lostfound_app',
  [string]$Database = 'lostfound_dev',
  [string]$EnvFile,
  [switch]$CheckOnly,
  [switch]$PromptOnly
)

$ErrorActionPreference = 'Stop'

if ($CheckOnly -and $PromptOnly) {
  throw 'Usá -CheckOnly o -PromptOnly, no ambos.'
}

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

$backendDir = Join-Path $projectRoot 'backend'
if (-not (Test-Path -LiteralPath $backendDir -PathType Container)) {
  throw "No se encontró el directorio 'backend' en '$projectRoot'. Verificá que el script esté en '<proyecto>\scripts'."
}

if ([string]::IsNullOrWhiteSpace($EnvFile)) {
  $EnvFile = Join-Path $backendDir '.env'
}
elseif (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
  $EnvFile = Join-Path $projectRoot $EnvFile
}
$EnvFile = [System.IO.Path]::GetFullPath($EnvFile)
$envDir = Split-Path -Parent $EnvFile
if ([string]::IsNullOrWhiteSpace($envDir)) {
  throw "No se pudo determinar el directorio de destino para '$EnvFile'."
}

$script:Psql = Join-Path $PgBin 'psql.exe'
if (-not (Test-Path -LiteralPath $script:Psql -PathType Leaf)) {
  throw "No se encontró psql en '$script:Psql'."
}

$script:PgIsReady = Join-Path $PgBin 'pg_isready.exe'
if (-not (Test-Path -LiteralPath $script:PgIsReady -PathType Leaf)) {
  throw "No se encontró pg_isready en '$script:PgIsReady'."
}

function Test-PostgresServer {
  & $script:PgIsReady -h $PgHost -p $PgPort *> $null
  return ($LASTEXITCODE -eq 0)
}

if ($CheckOnly) {
  $serverOk = Test-PostgresServer
  Write-Host 'Preflight de setup-db.ps1 (sin credenciales, sin SQL)'
  Write-Host "  ScriptDir:   $scriptDir"
  Write-Host "  ProjectRoot: $projectRoot"
  Write-Host "  BackendDir:  $backendDir"
  Write-Host "  EnvFile:     $EnvFile (existe: $(Test-Path -LiteralPath $EnvFile))"
  Write-Host "  psql:        $script:Psql (existe: True)"
  Write-Host "  pg_isready:  $script:PgIsReady (existe: True)"
  if ($serverOk) {
    Write-Host "  Servidor:    aceptando conexiones en ${PgHost}:${PgPort}"
  }
  else {
    Write-Host "  Servidor:    NO responde en ${PgHost}:${PgPort}"
  }
  Write-Host 'CheckOnly: no se solicitó ninguna credencial ni se ejecutó SQL.'
  return
}

if (-not (Test-PostgresServer)) {
  throw "PostgreSQL no responde en ${PgHost}:${PgPort}. Verificá que el servicio 'postgresql-x64-18' esté iniciado."
}

$script:SecretForRedaction = ''

function Read-SecretText {
  param([string]$Prompt)
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Redact {
  param([string]$Text)
  if ([string]::IsNullOrEmpty($script:SecretForRedaction)) { return $Text }
  return $Text.Replace($script:SecretForRedaction, '***')
}

function Invoke-Psql {
  param([string]$Sql, [string]$Db = 'postgres')
  $output = $Sql | & $script:Psql -X -q -v ON_ERROR_STOP=1 -h $PgHost -p $PgPort -U $SuperUser -d $Db -t -A 2>&1
  $code = $LASTEXITCODE
  $text = Redact (($output | ForEach-Object { $_.ToString() }) -join "`n")
  if ($code -ne 0) { throw "psql falló (exit $code): $text" }
  return $text.Trim()
}

Write-Host 'Configuración de PostgreSQL para LostFound CU1'
Write-Host "Base: $Database | Rol: $AppRole | Host: $PgHost`:$PgPort"
Write-Host "Proyecto: $projectRoot"
Write-Host "Archivo .env: $EnvFile"
Write-Host ''

$superPw = $null
$appPw = $null
$appPw2 = $null
$skipOperations = $false

try {
  Write-Host 'Se solicitarán las contraseñas de forma segura; no se mostrarán ni se registrarán.'
  Write-Host ''

  $superPw = Read-SecretText "Contraseña del superusuario '$SuperUser'"
  if ([string]::IsNullOrWhiteSpace($superPw)) { throw 'La contraseña del superusuario no puede estar vacía.' }

  $appPw = Read-SecretText "Nueva contraseña para '$AppRole'"
  $appPw2 = Read-SecretText "Repetí la contraseña de '$AppRole'"
  if ($appPw -ne $appPw2) { throw 'Las contraseñas de la aplicación no coinciden.' }
  if ([string]::IsNullOrWhiteSpace($appPw)) { throw 'La contraseña de la aplicación no puede estar vacía.' }

  if ($PromptOnly) {
    Write-Host ''
    Write-Host 'PromptOnly: credenciales recibidas (no se muestran). No se ejecutó ninguna operación.'
    Write-Host 'No se creó el rol, la base ni el archivo .env.'
    $skipOperations = $true
  }

  if (-not $skipOperations) {
    $env:PGPASSWORD = $superPw
    $superPw = $null
    $script:SecretForRedaction = $appPw

    $roleExists = Invoke-Psql "SELECT 1 FROM pg_roles WHERE rolname = '$AppRole';"
    $escaped = $appPw.Replace("'", "''")
    if ($roleExists -ne '1') {
      Invoke-Psql "CREATE ROLE $AppRole LOGIN PASSWORD '$escaped';" | Out-Null
      Write-Host "Rol '$AppRole' creado (LOGIN, sin CREATEDB/CREATEROLE/SUPERUSER)."
    }
    else {
      Invoke-Psql "ALTER ROLE $AppRole WITH LOGIN PASSWORD '$escaped';" | Out-Null
      Write-Host "Rol '$AppRole' ya existía; contraseña sincronizada."
    }

    $dbExists = Invoke-Psql "SELECT 1 FROM pg_database WHERE datname = '$Database';"
    if ($dbExists -ne '1') {
      Invoke-Psql "CREATE DATABASE $Database OWNER $AppRole ENCODING 'UTF8' TEMPLATE template0;" | Out-Null
      Write-Host "Base '$Database' creada con dueño '$AppRole'."
    }
    else {
      $owner = Invoke-Psql "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$Database';"
      if ($owner -ne $AppRole) {
        throw "La base '$Database' existe y su dueño es '$owner', no '$AppRole'. No se modificó nada."
      }
      Write-Host "Base '$Database' ya existía con el dueño esperado."
    }

    Invoke-Psql "REVOKE ALL ON DATABASE $Database FROM PUBLIC; GRANT CONNECT, TEMPORARY ON DATABASE $Database TO $AppRole;" | Out-Null

    $env:PGPASSWORD = $appPw
    $connOutput = "SELECT current_user || '@' || current_database();" | & $script:Psql -X -q -v ON_ERROR_STOP=1 -h $PgHost -p $PgPort -U $AppRole -d $Database -t -A 2>&1
    $connCode = $LASTEXITCODE
    $connText = Redact (($connOutput | ForEach-Object { $_.ToString() }) -join ' ')
    if ($connCode -ne 0) { throw "No se pudo conectar como '$AppRole': $connText" }
    Write-Host "Conexión verificada: $($connText.Trim())"

    $encoded = [uri]::EscapeDataString($appPw)
    if (-not (Test-Path -LiteralPath $envDir -PathType Container)) {
      New-Item -ItemType Directory -Path $envDir -Force | Out-Null
    }
    $lines = @(
      'NODE_ENV=development',
      'PORT=3000',
      'AUTH_MODE=demo',
      "DATABASE_URL=postgresql://$AppRole`:$encoded@$PgHost`:$PgPort/$Database"
    )
    [IO.File]::WriteAllText($EnvFile, (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
    Write-Host "Archivo local '$EnvFile' escrito (no versionado)."

    try {
      $aclUser = "$($env:USERDOMAIN)\$($env:USERNAME)"
      & icacls.exe $EnvFile /inheritance:r /grant:r "${aclUser}:(R,W)" | Out-Null
      if ($LASTEXITCODE -eq 0) { Write-Host 'Permisos del archivo restringidos al usuario actual.' }
    }
    catch {
      Write-Warning 'No se pudieron restringir los permisos del archivo .env.'
    }

    Write-Host ''
    Write-Host 'OK: PostgreSQL configurado para CU1.'
    Write-Host "URL: postgresql://$AppRole`:***@$PgHost`:$PgPort/$Database"
  }
}
finally {
  $env:PGPASSWORD = $null
  $superPw = $null
  $appPw = $null
  $appPw2 = $null
  $script:SecretForRedaction = ''
}

Read-Host 'Presioná Enter para cerrar' | Out-Null
