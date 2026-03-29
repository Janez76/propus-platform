param(
    [string]$VpsHost = "87.106.24.107",
    [string]$User = "propus",
    [string]$KeyPath = "$HOME\.ssh\id_ed25519_propus_vps",
    [string]$RemoteProjectRoot = "/opt/propus-platform",
    [string]$RemoteLegacyRoot = "/opt/buchungstool",
    [string]$RemoteEnvFile = "/opt/propus-platform/.env.vps",
    [string]$RemoteComposeFile = "/opt/propus-platform/docker-compose.vps.yml",
    [string]$RemoteComposeProject = "propus-platform",
    [switch]$SkipBackup,
    [switch]$SkipUpload,
    [switch]$SkipSwitch,
    [switch]$SkipCloudflarePurge,
    # Ohne Image-Neuaufbau: nur Container neu starten (schnell; bei Codeaenderungen nicht verwenden).
    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LocalBackupRoot = Join-Path $WorkspaceRoot "backups\vps-pre-migration"
$LocalEnvFile = Join-Path $WorkspaceRoot ".env.vps"
$LocalBookingEnv = Join-Path $WorkspaceRoot "booking\.env"

$script:DeployStarted = Get-Date

function Write-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [string]$Color = "White"
    )
    Write-Host ""
    Write-Host $Message -ForegroundColor $Color
}

function Write-Elapsed {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][TimeSpan]$Span
    )
    $sec = [math]::Round($Span.TotalSeconds, 1)
    Write-Host "  -> $Label : ${sec}s" -ForegroundColor DarkGray
}

function Invoke-Ssh {
    param([Parameter(Mandatory = $true)][string]$Command)

    & ssh `
        -i $KeyPath `
        -o IdentitiesOnly=yes `
        -o StrictHostKeyChecking=accept-new `
        "$User@$VpsHost" `
        $Command

    if ($LASTEXITCODE -ne 0) {
        throw "SSH command failed: $Command"
    }
}

function Invoke-ScpDownload {
    param(
        [Parameter(Mandatory = $true)][string]$RemotePath,
        [Parameter(Mandatory = $true)][string]$LocalPath
    )

    & scp `
        -i $KeyPath `
        -o IdentitiesOnly=yes `
        -o StrictHostKeyChecking=accept-new `
        -r `
        "${User}@${VpsHost}:${RemotePath}" `
        $LocalPath

    if ($LASTEXITCODE -ne 0) {
        throw "SCP download failed: $RemotePath"
    }
}

function Invoke-ScpUpload {
    param(
        [Parameter(Mandatory = $true)][string]$LocalPath,
        [Parameter(Mandatory = $true)][string]$RemotePath
    )

    & scp `
        -i $KeyPath `
        -o IdentitiesOnly=yes `
        -o StrictHostKeyChecking=accept-new `
        $LocalPath `
        "${User}@${VpsHost}:${RemotePath}"

    if ($LASTEXITCODE -ne 0) {
        throw "SCP upload failed: $LocalPath"
    }
}

function Get-EnvFileValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if (-not (Test-Path $Path)) {
        return $null
    }

    $pattern = "^\s*$([regex]::Escape($Name))=(.*)$"
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match $pattern) {
            return $matches[1].Trim().Trim('"')
        }
    }

    return $null
}

foreach ($required in @(
    "docker-compose.vps.yml",
    ".env.vps.example",
    "platform\Dockerfile",
    "scripts\backup-vps.sh",
    "scripts\restore-vps.sh"
)) {
    $full = Join-Path $WorkspaceRoot $required
    if (-not (Test-Path $full)) {
        throw "Required file missing: $full"
    }
}

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    throw "OpenSSH client (ssh) not found."
}
if (-not (Get-Command scp -ErrorAction SilentlyContinue)) {
    throw "OpenSSH client (scp) not found."
}
if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) {
    throw "tar.exe not found."
}
if (-not (Test-Path $KeyPath)) {
    throw "SSH key not found: $KeyPath"
}

New-Item -ItemType Directory -Force -Path $LocalBackupRoot | Out-Null

Write-Step "[1/6] SSH-Verbindung" "Cyan"
$t0 = [Diagnostics.Stopwatch]::StartNew()
Invoke-Ssh "echo connected && hostname && id -un"
$t0.Stop()
Write-Elapsed "SSH-Test" $t0.Elapsed

if (-not $SkipBackup) {
    Write-Step "[2/6] Legacy-Backup auf dem VPS" "Cyan"
    $backupCommand = @"
set -eu
TS=`$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=/opt/buchungstool-backup-`$TS
mkdir -p "`$BACKUP_DIR"
docker exec buchungstool_prod-postgres-1 pg_dump -U propus -d buchungstool > "`$BACKUP_DIR/db.sql"
docker cp buchungstool_prod-backend-1:/data/orders.json "`$BACKUP_DIR/orders.json"
cp /opt/buchungstool/.env.prod "`$BACKUP_DIR/.env.prod"
if [ -f /etc/cloudflared/config.yml ]; then cp /etc/cloudflared/config.yml "`$BACKUP_DIR/cloudflared-config.yml"; fi
test -s "`$BACKUP_DIR/db.sql"
printf %s "`$BACKUP_DIR"
"@
    $remoteBackupDir = (& ssh -i $KeyPath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "$User@$VpsHost" $backupCommand)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($remoteBackupDir)) {
        throw "Could not create remote backup."
    }

    $remoteBackupDir = $remoteBackupDir.Trim()
    Write-Host "Remote backup: $remoteBackupDir"

    Write-Host "Lade Backup herunter..."
    Invoke-ScpDownload -RemotePath $remoteBackupDir -LocalPath $LocalBackupRoot
}
else {
    Write-Step "[2/6] Legacy-Backup uebersprungen (-SkipBackup)" "DarkGray"
}

if (-not $SkipUpload) {
    Write-Step "[3/6] Projekt per tar streamen (ohne node_modules, ohne Build-Artefakte)" "Cyan"
    $tUpload = [Diagnostics.Stopwatch]::StartNew()
    Push-Location $WorkspaceRoot
    try {
        # Zusaetzliche Excludes: weniger Bytes, schnellerer Upload. platform/frontend/dist wird im Image neu gebaut.
        $excludes = @(
            "--exclude=.git",
            "--exclude=node_modules",
            "--exclude=platform/frontend/node_modules",
            "--exclude=platform/node_modules",
            "--exclude=booking/node_modules",
            "--exclude=booking/admin-panel/node_modules",
            "--exclude=tours/node_modules",
            "--exclude=auth/node_modules",
            "--exclude=backups",
            "--exclude=data",
            "--exclude=.cursor",
            "--exclude=.vscode",
            "--exclude=platform/frontend/dist",
            "--exclude=booking/admin-panel/dist",
            "--exclude=.turbo"
        )
        $excludeArgs = $excludes -join " "
        $uploadCmd = @(
            "tar.exe $excludeArgs -cf - .",
            '| ssh',
            ('-i "{0}"' -f $KeyPath),
            '-o IdentitiesOnly=yes',
            '-o StrictHostKeyChecking=accept-new',
            ('{0}@{1}' -f $User, $VpsHost),
            ('"mkdir -p ''{0}'' && tar -xf - -C ''{0}''"' -f $RemoteProjectRoot)
        ) -join ' '

        & cmd.exe /d /c $uploadCmd
        if ($LASTEXITCODE -ne 0) {
            throw "Streaming upload failed."
        }
    }
    finally {
        Pop-Location
    }
    $tUpload.Stop()
    Write-Elapsed "Upload (tar+ssh)" $tUpload.Elapsed

    if (Test-Path $LocalEnvFile) {
        Write-Host "Lade .env.vps..."
        Invoke-ScpUpload -LocalPath $LocalEnvFile -RemotePath $RemoteEnvFile
    }
    else {
        Write-Warning ".env.vps nicht lokal gefunden. Auf dem VPS anlegen, falls noetig."
    }
}
else {
    Write-Step "[3/6] Upload uebersprungen (-SkipUpload)" "DarkGray"
}

if (-not $SkipSwitch) {
    Write-Step "[4/6] Legacy-Stack stoppen / Archiv" "Cyan"
    $switchCommand = @"
set -eu
if [ -d "$RemoteLegacyRoot" ]; then
  cd "$RemoteLegacyRoot"
  docker compose -p buchungstool_prod --env-file .env.prod -f docker-compose.prod.yml down || true
  cd /opt
  if [ ! -d /opt/buchungstool-OLD ]; then
    mv "$RemoteLegacyRoot" /opt/buchungstool-OLD
  fi
fi
"@
    Invoke-Ssh $switchCommand
}
else {
    Write-Step "[4/6] Legacy-Switch uebersprungen (-SkipSwitch)" "DarkGray"
}

Write-Step "[5/6] Docker: Abhaengigkeiten + optional Build + Start" "Cyan"
$buildLine = if ($SkipBuild) {
    "echo '[deploy] SkipBuild: kein docker compose build (bestehendes platform-Image)'"
} else {
    @"
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
echo '[deploy] docker compose build platform (BuildKit-Cache)...'
date -u +'[deploy] build start %Y-%m-%dT%H:%M:%SZ'
docker compose -p "$RemoteComposeProject" -f "$RemoteComposeFile" --env-file "$RemoteEnvFile" build platform
date -u +'[deploy] build end   %Y-%m-%dT%H:%M:%SZ'
"@
}

$startCommand = @"
set -eu
cd "$RemoteProjectRoot"
test -f "$RemoteEnvFile"
echo '[deploy] postgres + logto...'
docker compose -p "$RemoteComposeProject" -f "$RemoteComposeFile" --env-file "$RemoteEnvFile" up -d postgres logto-db logto
echo '[deploy] core migrate (Profil migrate)...'
docker compose -p "$RemoteComposeProject" -f "$RemoteComposeFile" --env-file "$RemoteEnvFile" --profile migrate run --rm migrate
$buildLine
echo '[deploy] platform Container...'
docker compose -p "$RemoteComposeProject" -f "$RemoteComposeFile" --env-file "$RemoteEnvFile" up -d platform
echo '[deploy] warte auf /api/health (max ~90s, Schritt 3s)...'
i=0
while [ $i -lt 30 ]; do
  i=$((i+1))
  if curl -fsS http://127.0.0.1:3100/api/health >/dev/null 2>&1; then
    echo '[deploy] health ok'
    exit 0
  fi
  sleep 3
done
echo 'platform health check failed' >&2
exit 1
"@
$tRemote = [Diagnostics.Stopwatch]::StartNew()
Invoke-Ssh $startCommand
$tRemote.Stop()
Write-Elapsed "Remote (compose + optional build + health)" $tRemote.Elapsed

if (-not $SkipCloudflarePurge) {
    Write-Step "[6/6] Cloudflare Cache leeren" "Cyan"
    $cfZone = Get-EnvFileValue -Path $LocalBookingEnv -Name "CF_ZONE"
    $cfEmail = Get-EnvFileValue -Path $LocalBookingEnv -Name "CF_EMAIL"
    $cfKey = Get-EnvFileValue -Path $LocalBookingEnv -Name "CF_KEY"

    if ($cfZone -and $cfEmail -and $cfKey) {
        $headers = @{
            "X-Auth-Email" = $cfEmail
            "X-Auth-Key" = $cfKey
            "Content-Type" = "application/json"
        }
        $body = @{ purge_everything = $true } | ConvertTo-Json -Compress
        Invoke-RestMethod -Method Post -Uri "https://api.cloudflare.com/client/v4/zones/$cfZone/purge_cache" -Headers $headers -Body $body | Out-Null
    }
    else {
        Write-Warning "Cloudflare-Variablen in booking\.env fehlen. Cache-Purge uebersprungen."
    }
}
else {
    Write-Step "[6/6] Cloudflare uebersprungen (-SkipCloudflarePurge)" "DarkGray"
}

$total = (Get-Date) - $script:DeployStarted
Write-Step "Fertig" "Green"
Write-Host "Gesamtdauer: $([math]::Round($total.TotalMinutes, 2)) Min ($([math]::Round($total.TotalSeconds, 1))s)" -ForegroundColor Green
Write-Host ""
Write-Host "Hinweis: Booking-DB-Migrationen laufen beim Start des platform-Containers (booking/server.js -> db.runMigrations)." -ForegroundColor DarkGray
Write-Host "Ohne Code-Deploy nur schnell neu starten: -SkipUpload -SkipBuild und auf dem Host: docker compose ... up -d platform" -ForegroundColor DarkGray
