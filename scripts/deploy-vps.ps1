#!/usr/bin/env pwsh
# ============================================================
# deploy-vps.ps1  –  Propus VPS Deployment Script
# ============================================================
# Deployt geänderte Dateien auf den VPS und startet den
# platform-Container neu (docker cp + docker restart).
#
# SSH: root@87.106.24.107 via ~/.ssh/id_ed25519_propus_vps
# Remote: /opt/propus-platform
# Container: propus-platform-platform-1
#
# Aufruf:
#   .\scripts\deploy-vps.ps1
#   .\scripts\deploy-vps.ps1 -DryRun        # nur anzeigen, nicht deployen
#   .\scripts\deploy-vps.ps1 -SkipRestart   # kein Container-Restart
# ============================================================

param(
    [string]$VpsHost    = "87.106.24.107",
    [string]$VpsUser    = "root",
    [string]$KeyPath    = "$HOME\.ssh\id_ed25519_propus_vps",
    [string]$RemotePath = "/opt/propus-platform",
    [string]$Container  = "propus-platform-platform-1",
    [switch]$DryRun,
    [switch]$SkipRestart
)

$sshTarget = "${VpsUser}@${VpsHost}"
$localBase  = Split-Path $PSScriptRoot -Parent
$sshOpts    = @("-i", $KeyPath, "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10")

function Invoke-SSH($cmd) {
    & ssh @sshOpts $sshTarget $cmd 2>&1
}

function Invoke-SCP($local, $remote) {
    & scp @sshOpts $local "${sshTarget}:${remote}" 2>&1
}

Write-Host ""
Write-Host "===== Propus VPS Deployment =====" -ForegroundColor Cyan
Write-Host "Host:      $sshTarget"
Write-Host "Remote:    $RemotePath"
Write-Host "Container: $Container"
if ($DryRun) { Write-Host "MODUS:     DRY-RUN (keine Änderungen)" -ForegroundColor Yellow }
Write-Host ""

# ─── 1. SSH-Verbindung testen ────────────────────────────────────────────────
Write-Host "[1/4] SSH-Verbindung testen..." -ForegroundColor Yellow
$test = Invoke-SSH "echo SSH_OK"
if ($test -notmatch "SSH_OK") {
    Write-Host "  FEHLER: SSH-Verbindung fehlgeschlagen!" -ForegroundColor Red
    Write-Host "  $test"
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

# ─── 2. Dateien deployen ─────────────────────────────────────────────────────
Write-Host "[2/4] Dateien deployen..." -ForegroundColor Yellow

$filesToDeploy = @(
    # Tours Backend
    @{ local = "tours\routes\admin-api.js";    remote = "$RemotePath/tours/routes/admin-api.js" },
    @{ local = "tours\routes\public-api.js";   remote = "$RemotePath/tours/routes/public-api.js" },
    @{ local = "tours\lib\cleanup-mailer.js";  remote = "$RemotePath/tours/lib/cleanup-mailer.js" },
    @{ local = "tours\lib\matterport.js";      remote = "$RemotePath/tours/lib/matterport.js" },
    @{ local = "tours\lib\tour-actions.js";    remote = "$RemotePath/tours/lib/tour-actions.js" },
    @{ local = "tours\lib\settings.js";        remote = "$RemotePath/tours/lib/settings.js" },
    @{ local = "tours\lib\tokens.js";          remote = "$RemotePath/tours/lib/tokens.js" },
    @{ local = "tours\lib\subscriptions.js";   remote = "$RemotePath/tours/lib/subscriptions.js" },
    @{ local = "tours\lib\payrexx.js";         remote = "$RemotePath/tours/lib/payrexx.js" },
    @{ local = "tours\lib\customer-lookup.js"; remote = "$RemotePath/tours/lib/customer-lookup.js" },
    @{ local = "tours\lib\microsoft-graph.js"; remote = "$RemotePath/tours/lib/microsoft-graph.js" }
)

$deployed = @()
foreach ($f in $filesToDeploy) {
    $localPath = Join-Path $localBase $f.local
    if (-not (Test-Path $localPath)) { continue }

    if ($DryRun) {
        Write-Host "  [DRY] $($f.local)" -ForegroundColor Gray
        continue
    }

    $r = Invoke-SCP $localPath $f.remote
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK: $($f.local)" -ForegroundColor Green
        $deployed += $f
    } else {
        Write-Host "  FEHLER: $($f.local)" -ForegroundColor Red
        Write-Host "  $r"
    }
}

if ($DryRun -or $deployed.Count -eq 0) {
    if (-not $DryRun) { Write-Host "  Keine Dateien deployed." -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "===== Fertig (kein Restart nötig) =====" -ForegroundColor Cyan
    exit 0
}

# ─── 3. Dateien in Container kopieren ────────────────────────────────────────
Write-Host "[3/4] Dateien in Container kopieren..." -ForegroundColor Yellow

# tours/lib komplett
$libCopy = Invoke-SSH "docker cp ${RemotePath}/tours/lib/. ${Container}:/app/tours/lib/ && docker cp ${RemotePath}/tours/routes/admin-api.js ${Container}:/app/tours/routes/admin-api.js 2>/dev/null; echo CP_DONE"
if ($libCopy -match "CP_DONE") {
    Write-Host "  OK" -ForegroundColor Green
} else {
    Write-Host "  Warnung: docker cp Fehler (Container läuft möglicherweise nicht)" -ForegroundColor Yellow
}

# ─── 4. Container neu starten ────────────────────────────────────────────────
if ($SkipRestart) {
    Write-Host "[4/4] Container-Restart übersprungen (-SkipRestart)" -ForegroundColor Gray
} else {
    Write-Host "[4/4] Container neu starten..." -ForegroundColor Yellow
    $restart = Invoke-SSH "docker restart $Container && sleep 15 && docker ps --filter name=$Container --format '{{.Status}}'"
    Write-Host "  Status: $restart" -ForegroundColor Green
}

Write-Host ""
Write-Host "===== Deployment abgeschlossen! =====" -ForegroundColor Cyan
Write-Host ""
Write-Host "Admin-Panel: https://admin-booking.propus.ch/admin/tours/list" -ForegroundColor Gray
