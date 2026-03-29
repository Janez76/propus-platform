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
    [switch]$SkipCloudflarePurge
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LocalBackupRoot = Join-Path $WorkspaceRoot "backups\vps-pre-migration"
$LocalEnvFile = Join-Path $WorkspaceRoot ".env.vps"
$LocalBookingEnv = Join-Path $WorkspaceRoot "booking\.env"

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

Write-Host "[1/7] SSH connectivity test..."
Invoke-Ssh "echo connected && hostname && id -un"

if (-not $SkipBackup) {
    Write-Host "[2/7] Creating legacy backup on VPS..."
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

    Write-Host "[3/7] Downloading backup locally..."
    Invoke-ScpDownload -RemotePath $remoteBackupDir -LocalPath $LocalBackupRoot
}

if (-not $SkipUpload) {
    Write-Host "[4/7] Uploading project files..."
    Push-Location $WorkspaceRoot
    try {
        $uploadCmd = @(
            'tar.exe --exclude=.git --exclude=node_modules --exclude=backups --exclude=data --exclude=.cursor --exclude=.vscode --exclude=platform/frontend/dist -cf - .',
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

    if (Test-Path $LocalEnvFile) {
        Write-Host "Uploading .env.vps..."
        Invoke-ScpUpload -LocalPath $LocalEnvFile -RemotePath $RemoteEnvFile
    }
    else {
        Write-Warning ".env.vps not found locally. Create it on the VPS before starting services."
    }
}

if (-not $SkipSwitch) {
    Write-Host "[5/7] Stopping legacy stack and archiving old directory..."
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

Write-Host "[6/7] Starting clean stack..."
$startCommand = @"
set -eu
cd "$RemoteProjectRoot"
test -f "$RemoteEnvFile"
docker compose -p "$RemoteComposeProject" -f "$RemoteComposeFile" --env-file "$RemoteEnvFile" up -d postgres logto-db logto
docker compose -p "$RemoteComposeProject" -f "$RemoteComposeFile" --env-file "$RemoteEnvFile" --profile migrate run --rm migrate
docker compose -p "$RemoteComposeProject" -f "$RemoteComposeFile" --env-file "$RemoteEnvFile" up -d platform
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if curl -fsS http://127.0.0.1:3100/api/health >/dev/null 2>&1; then
    exit 0
  fi
  sleep 10
done
echo "platform health check failed" >&2
exit 1
"@
Invoke-Ssh $startCommand

if (-not $SkipCloudflarePurge) {
    Write-Host "[7/7] Purging Cloudflare cache..."
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
        Write-Warning "Cloudflare variables missing in booking\.env. Skipping cache purge."
    }
}

Write-Host "Deploy completed. Next step: run the data migration on the VPS."
