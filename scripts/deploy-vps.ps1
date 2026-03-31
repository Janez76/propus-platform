param(
    [string]$VpsHost = "87.106.24.107",
    [string]$User = "propus",
    [string]$KeyPath = $(Join-Path $HOME (Join-Path '.ssh' 'id_ed25519_propus_vps')),
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
    [switch]$SkipBuild,
    # Kein SSH-ControlMaster: jede ssh/scp-Verbindung authentifiziert separat (zum Debuggen).
    [switch]$NoMultiplex,
    # Kein automatischer Patch-Bump der VERSION-/Changelog-Dateien vor dem Upload (nicht empfohlen).
    [switch]$SkipVersionBump
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LocalBackupRoot = Join-Path $WorkspaceRoot "backups/vps-pre-migration"
$LocalEnvFile = Join-Path $WorkspaceRoot ".env.vps"
$LocalBookingEnv = Join-Path $WorkspaceRoot "booking/.env"

$script:DeployStarted = Get-Date
$script:UseSshMux = $false
$script:SshMuxStartedHere = $false
$script:SshControlPath = $null

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

function Test-SshMuxAlive {
    if (-not $script:SshControlPath) { return $false }
    if (-not (Test-Path -LiteralPath $script:SshControlPath)) { return $false }
    & ssh -S $script:SshControlPath -O check "${User}@${VpsHost}" 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Open-SshDeployMux {
    if ($NoMultiplex) { return }
    # Windows-OpenSSH: ControlMaster/ControlPath fuehrt oft zu "getsockname failed: Not a socket" — kein Mux.
    $isWin = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
        [System.Runtime.InteropServices.OSPlatform]::Windows)
    if ($isWin) {
        Write-Host "  Hinweis: Unter Windows kein SSH-Multiplexing (OpenSSH-Limit); bei Key-Passphrase ggf. mehrfach eingeben oder ssh-add." -ForegroundColor DarkGray
        return
    }
    $tempRoot = [System.IO.Path]::GetTempPath()
    if ([string]::IsNullOrWhiteSpace($tempRoot)) {
        throw "No temp directory available for SSH ControlMaster socket."
    }
    $safeHost = ($VpsHost -replace '[^\w\-]', '_')
    $script:SshControlPath = Join-Path $tempRoot "propus-deploy-${User}-${safeHost}.sock"
    if (Test-Path -LiteralPath $script:SshControlPath) {
        if (-not (Test-SshMuxAlive)) {
            Remove-Item -LiteralPath $script:SshControlPath -Force -ErrorAction SilentlyContinue
        }
    }
    if (Test-SshMuxAlive) {
        $script:UseSshMux = $true
        $script:SshMuxStartedHere = $false
        return
    }
    Write-Host "  SSH Multiplexing: eine Passphrase fuer alle Verbindungen in diesem Lauf (ControlMaster)." -ForegroundColor DarkGray
    Write-Host "  (Ohne das: ssh-agent oder mehrfache Passphrase-Eingabe.)" -ForegroundColor DarkGray
    & ssh `
        -M -S $script:SshControlPath `
        -o ControlPersist=30m `
        -fN `
        -i $KeyPath `
        -o IdentitiesOnly=yes `
        -o StrictHostKeyChecking=accept-new `
        "${User}@${VpsHost}"
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "SSH ControlMaster Start fehlgeschlagen — Deploy ohne Multiplexing (Passphrase ggf. mehrfach)."
        Remove-Item -LiteralPath $script:SshControlPath -Force -ErrorAction SilentlyContinue
        return
    }
    $wait = 0
    while ($wait -lt 150) {
        if (Test-SshMuxAlive) { break }
        Start-Sleep -Milliseconds 100
        $wait++
    }
    if (-not (Test-SshMuxAlive)) {
        Write-Warning "SSH Control-Socket Timeout — Deploy ohne Multiplexing."
        Remove-Item -LiteralPath $script:SshControlPath -Force -ErrorAction SilentlyContinue
        return
    }
    $script:UseSshMux = $true
    $script:SshMuxStartedHere = $true
}

function Close-SshDeployMux {
    if (-not $script:UseSshMux -or -not $script:SshControlPath) { return }
    if ($script:SshMuxStartedHere) {
        & ssh -S $script:SshControlPath -O exit "${User}@${VpsHost}" 2>$null
        if (Test-Path -LiteralPath $script:SshControlPath) {
            Remove-Item -LiteralPath $script:SshControlPath -Force -ErrorAction SilentlyContinue
        }
    }
    $script:UseSshMux = $false
    $script:SshMuxStartedHere = $false
}

function Normalize-SshRemoteScript {
    param([Parameter(Mandatory = $true)][string]$Text)
    # Windows-CRLF in Here-Strings fuehrt auf Linux zu "set: invalid option" und "\r" in export-Zeilen.
    return (($Text -replace "`r`n", "`n") -replace "`r", "`n").Trim()
}

# Lange docker compose build/run: Verbindung offen halten (NAT/CI-Timeouts).
$script:SshAliveOpts = @("-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=12")

function Invoke-SshDeployFailureDiagnostics {
    param([Parameter(Mandatory = $true)][int]$SshExitCode)
    $platformCtn = "${RemoteComposeProject}-platform-1"
    $diag = Normalize-SshRemoteScript @"
set +e
cd '$RemoteProjectRoot' || true
echo '===== [deploy-diagnose] docker compose ps -a ====='
docker compose -p '$RemoteComposeProject' -f '$RemoteComposeFile' --env-file '$RemoteEnvFile' ps -a
echo '===== [deploy-diagnose] platform logs (tail 200, container $platformCtn) ====='
docker logs --tail 200 '$platformCtn' 2>&1
echo '===== [deploy-diagnose] migrate / einmalige Container (letzte 8) ====='
docker ps -a --filter "name=$RemoteComposeProject" --format '{{.Names}} {{.Status}}' 2>&1 | grep -i migrate | tail -n 8 || true
MIG=`$(docker ps -a --filter "name=$RemoteComposeProject" --format '{{.Names}}' 2>/dev/null | grep -i migrate | head -n 1)
if [ -n "`$MIG" ]; then
  echo "===== [deploy-diagnose] logs von `$MIG (tail 120) ====="
  docker logs --tail 120 "`$MIG" 2>&1
fi
"@
    Write-Host ""
    Write-Host "--- Deploy-Fehlerdiagnose (vorheriger ssh-Exit: $SshExitCode) ---" -ForegroundColor Yellow
    if ($script:UseSshMux) {
        & ssh @script:SshAliveOpts -S $script:SshControlPath "${User}@${VpsHost}" $diag
    }
    else {
        & ssh `
            -i $KeyPath `
            -o IdentitiesOnly=yes `
            -o StrictHostKeyChecking=accept-new `
            @script:SshAliveOpts `
            "${User}@${VpsHost}" `
            $diag
    }
}

function Invoke-Ssh {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [string]$DeployStep = ""
    )
    $Command = Normalize-SshRemoteScript $Command

    if ($DeployStep) {
        Write-Host "  [deploy-step] $DeployStep" -ForegroundColor DarkCyan
    }

    if ($script:UseSshMux) {
        & ssh @script:SshAliveOpts -S $script:SshControlPath "${User}@${VpsHost}" $Command
    }
    else {
        & ssh `
            -i $KeyPath `
            -o IdentitiesOnly=yes `
            -o StrictHostKeyChecking=accept-new `
            @script:SshAliveOpts `
            "${User}@${VpsHost}" `
            $Command
    }

    $sshExit = $LASTEXITCODE
    if ($sshExit -ne 0) {
        try {
            Invoke-SshDeployFailureDiagnostics -SshExitCode $sshExit
        }
        catch {
            Write-Warning "Zusaetzliche Diagnose konnte nicht abgerufen werden: $($_.Exception.Message)"
        }
        $stepHint = if ($DeployStep) { "Deploy-Schritt: $DeployStep. " } else { "" }
        throw "SSH command failed (remote exit $sshExit). ${stepHint}Details: Logzeilen direkt UEBER dieser Meldung + Diagnoseblock [deploy-diagnose]."
    }
}

function Invoke-SshOutput {
    param([Parameter(Mandatory = $true)][string]$Command)
    $Command = Normalize-SshRemoteScript $Command

    if ($script:UseSshMux) {
        $out = & ssh @script:SshAliveOpts -S $script:SshControlPath "${User}@${VpsHost}" $Command 2>&1
    }
    else {
        $out = & ssh -i $KeyPath -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new @script:SshAliveOpts "${User}@${VpsHost}" $Command 2>&1
    }
    $sshExit = $LASTEXITCODE
    if ($sshExit -ne 0) {
        try {
            Invoke-SshDeployFailureDiagnostics -SshExitCode $sshExit
        }
        catch {
            Write-Warning "Zusaetzliche Diagnose konnte nicht abgerufen werden: $($_.Exception.Message)"
        }
        $tail = ($out | Out-String).Trim()
        if ($tail.Length -gt 3500) { $tail = $tail.Substring($tail.Length - 3500) }
        throw "SSH command failed (remote exit $sshExit). Output (tail): $tail"
    }
    return ($out | Out-String).Trim()
}

function Invoke-ScpDownload {
    param(
        [Parameter(Mandatory = $true)][string]$RemotePath,
        [Parameter(Mandatory = $true)][string]$LocalPath
    )

    if ($script:UseSshMux) {
        & scp `
            -o "ControlPath=$script:SshControlPath" `
            -o ControlMaster=no `
            -o StrictHostKeyChecking=accept-new `
            -r `
            "${User}@${VpsHost}:${RemotePath}" `
            $LocalPath
    }
    else {
        & scp `
            -i $KeyPath `
            -o IdentitiesOnly=yes `
            -o StrictHostKeyChecking=accept-new `
            -r `
            "${User}@${VpsHost}:${RemotePath}" `
            $LocalPath
    }

    if ($LASTEXITCODE -ne 0) {
        throw "SCP download failed: $RemotePath"
    }
}

function Invoke-ScpUpload {
    param(
        [Parameter(Mandatory = $true)][string]$LocalPath,
        [Parameter(Mandatory = $true)][string]$RemotePath
    )

    if ($script:UseSshMux) {
        & scp `
            -o "ControlPath=$script:SshControlPath" `
            -o ControlMaster=no `
            -o StrictHostKeyChecking=accept-new `
            $LocalPath `
            "${User}@${VpsHost}:${RemotePath}"
    }
    else {
        & scp `
            -i $KeyPath `
            -o IdentitiesOnly=yes `
            -o StrictHostKeyChecking=accept-new `
            $LocalPath `
            "${User}@${VpsHost}:${RemotePath}"
    }

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
    "platform/Dockerfile",
    "scripts/backup-vps.sh",
    "scripts/restore-vps.sh"
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
$isWinOS = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
    [System.Runtime.InteropServices.OSPlatform]::Windows)
if ($isWinOS -and (Get-Command tar.exe -ErrorAction SilentlyContinue)) {
    $DeployTarCmd = 'tar.exe'
}
elseif (Get-Command tar -ErrorAction SilentlyContinue) {
    $DeployTarCmd = 'tar'
}
else {
    throw "tar (gzip) not found (Windows: tar.exe; Linux/macOS: tar)."
}
if (-not (Test-Path $KeyPath)) {
    throw "SSH key not found: $KeyPath"
}

New-Item -ItemType Directory -Force -Path $LocalBackupRoot | Out-Null

Open-SshDeployMux

try {

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
    $remoteBackupDir = Invoke-SshOutput $backupCommand
    if ([string]::IsNullOrWhiteSpace($remoteBackupDir)) {
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
    if (-not $SkipVersionBump) {
        Write-Step "[3/6a] Versionsnummer fuer Deploy (Patch +1)" "Cyan"
        $bumpScript = Join-Path $PSScriptRoot "bump-deploy-version.ps1"
        if (-not (Test-Path -LiteralPath $bumpScript)) {
            throw "bump-deploy-version.ps1 fehlt: $bumpScript"
        }
        & $bumpScript -WorkspaceRoot $WorkspaceRoot
    }
    else {
        Write-Step "[3/6a] Versions-Bump uebersprungen (-SkipVersionBump)" "DarkGray"
    }

    Write-Step "[3/6] Projekt packen + hochladen (tar -> tmp-Datei -> scp -> ssh-Extraktion)" "Cyan"
    $tUpload = [Diagnostics.Stopwatch]::StartNew()

    # Temp-Archiv lokal anlegen (kein cmd.exe-Pipe-Trick noetig – funktioniert auch im Cursor-Agent)
    $TempTar = Join-Path ([System.IO.Path]::GetTempPath()) "propus-deploy-$(Get-Date -Format 'yyyyMMddHHmmss').tar.gz"
    Write-Host "  Erstelle Archiv: $TempTar"
    Push-Location $WorkspaceRoot
    try {
        $tarArgs = @(
            '--exclude=.git',
            '--exclude=node_modules',
            '--exclude=platform/frontend/node_modules',
            '--exclude=platform/node_modules',
            '--exclude=booking/node_modules',
            '--exclude=booking/admin-panel/node_modules',
            '--exclude=tours/node_modules',
            '--exclude=auth/node_modules',
            '--exclude=backups',
            '--exclude=data',
            '--exclude=.cursor',
            '--exclude=.vscode',
            '--exclude=platform/frontend/dist',
            '--exclude=booking/admin-panel/dist',
            '--exclude=.turbo',
            '-czf', $TempTar,
            '.'
        )
        & $DeployTarCmd @tarArgs
        if ($LASTEXITCODE -ne 0) { throw "tar failed (exit $LASTEXITCODE)" }
    }
    finally {
        Pop-Location
    }
    $sizeMb = [math]::Round((Get-Item $TempTar).Length / 1MB, 1)
    Write-Host "  Archiv: ${sizeMb} MB  -> upload via scp..."

    try {
        Invoke-ScpUpload -LocalPath $TempTar -RemotePath "/tmp/propus-deploy.tar.gz"
    }
    catch {
        Remove-Item $TempTar -Force -ErrorAction SilentlyContinue
        throw
    }

    Remove-Item $TempTar -Force
    Write-Host "  Lokale Temp-Datei entfernt."

    Write-Host "  Extrahiere auf VPS..."
    Invoke-Ssh "mkdir -p '$RemoteProjectRoot' && tar -xzf /tmp/propus-deploy.tar.gz -C '$RemoteProjectRoot' && rm /tmp/propus-deploy.tar.gz"

    $tUpload.Stop()
    Write-Elapsed "Upload (tar+scp+ssh)" $tUpload.Elapsed

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

$composeBase = "docker compose -p `"$RemoteComposeProject`" -f `"$RemoteComposeFile`" --env-file `"$RemoteEnvFile`""

$tRemote = [Diagnostics.Stopwatch]::StartNew()

Invoke-Ssh -DeployStep "5a/6 cd + .env.vps vorhanden" @"
set -eu
cd '$RemoteProjectRoot'
test -f '$RemoteEnvFile'
"@

Invoke-Ssh -DeployStep "5b/6 postgres + logto-db + logto (up -d)" @"
set -eu
cd '$RemoteProjectRoot'
echo '[deploy] postgres + logto...'
$composeBase up -d postgres logto-db logto
"@

Invoke-Ssh -DeployStep "5c/6 migrate-Image bauen" @"
set -eu
cd '$RemoteProjectRoot'
echo '[deploy] migrate image build...'
$composeBase build migrate
"@

Invoke-Ssh -DeployStep "5d/6 core migrate (compose run --rm migrate)" @"
set -eu
cd '$RemoteProjectRoot'
echo '[deploy] core migrate (Profil migrate)...'
$composeBase --profile migrate run --rm migrate
"@

$platformUpBlock = @"
set -eu
cd '$RemoteProjectRoot'
$buildLine
echo '[deploy] platform Container (alten gestoppten Container entfernen falls vorhanden)...'
docker rm -f "${RemoteComposeProject}-platform-1" 2>/dev/null || true
$composeBase up -d platform
"@
Invoke-Ssh -DeployStep "5e/6 platform (build ggf.) + up -d" $platformUpBlock

$healthBlock = @"
set -eu
echo '[deploy] warte auf /api/health (max ~120s, Schritt 3s)...'
i=0
while [ `$i -lt 40 ]; do
  i=`$((i+1))
  echo "[deploy] health Versuch `$i/40..."
  if curl -fsS http://127.0.0.1:3100/api/health >/dev/null 2>&1; then
    echo '[deploy] health ok'
    exit 0
  fi
  sleep 3
done
echo '[deploy] health: letzter curl-Versuch (Ausgabe fuer Log):' >&2
curl -sS http://127.0.0.1:3100/api/health >&2 || true
echo 'platform health check failed' >&2
exit 1
"@
Invoke-Ssh -DeployStep "5f/6 Health-Check localhost:3100/api/health" $healthBlock

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
        Write-Warning "Cloudflare-Variablen in booking/.env fehlen. Cache-Purge uebersprungen."
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

}
finally {
    Close-SshDeployMux
}
