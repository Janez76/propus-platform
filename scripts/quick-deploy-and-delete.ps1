#!/usr/bin/env pwsh
# Schnell-Deploy: Kopiert geaenderte Dateien und loescht Space oXmUbaPie9Z in Matterport.
# Aufruf: .\scripts\quick-deploy-and-delete.ps1
# SSH-Key-Passphrase wird einmalig abgefragt.

param(
    [string]$SpaceId = "oXmUbaPie9Z",
    [string]$VpsHost = "87.106.24.107",
    [string]$VpsUser = "propus",
    [string]$KeyPath = "$HOME\.ssh\id_ed25519_propus_vps",
    [string]$RemotePath = "/opt/propus-platform"
)

$sshTarget = "${VpsUser}@${VpsHost}"
$localBase  = Split-Path $PSScriptRoot -Parent

Write-Host ""
Write-Host "===== Quick-Deploy + Matterport-Loeschung =====" -ForegroundColor Cyan
Write-Host "Space: $SpaceId"
Write-Host ""

# 1. Dateien kopieren
$files = @(
    "tours/lib/matterport.js",
    "tours/lib/cleanup-mailer.js",
    "tours/lib/settings.js",
    "tours/lib/tour-actions.js",
    "tours/routes/admin-api.js",
    "booking/server.js"
)

Write-Host "[1/3] Dateien kopieren..." -ForegroundColor Yellow
foreach ($f in $files) {
    $localFile  = Join-Path $localBase ($f -replace '/', '\')
    $remoteFile = "$RemotePath/$f"
    Write-Host "  scp $f"
    scp -i $KeyPath $localFile "${sshTarget}:${remoteFile}"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  FEHLER bei $f" -ForegroundColor Red
        exit 1
    }
}

# 2. Container neu starten
Write-Host ""
Write-Host "[2/3] Container neu starten..." -ForegroundColor Yellow
ssh -i $KeyPath $sshTarget "cd $RemotePath && docker compose -p propus-platform restart tours && sleep 8 && echo TOURS_RESTARTED"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Container-Neustart fehlgeschlagen!" -ForegroundColor Red
    exit 1
}

# 3. Matterport-Space loeschen via neuer Admin-API
Write-Host ""
Write-Host "[3/3] Loescheaufruf an Admin-API..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Login
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ username = "admin"; password = "Biel2503!" } | ConvertTo-Json
try {
    $login = Invoke-WebRequest -Uri "https://admin-booking.propus.ch/api/admin/login" `
        -Method POST -Body $loginBody -ContentType "application/json" `
        -WebSession $session -UseBasicParsing -ErrorAction Stop
    Write-Host "  Login OK"
} catch {
    Write-Host "  Login Fehler: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Delete-Aufruf
try {
    $del = Invoke-WebRequest -Uri "https://admin-booking.propus.ch/api/tours/admin/matterport-space/$SpaceId" `
        -Method DELETE -WebSession $session -UseBasicParsing -ErrorAction Stop
    $result = $del.Content | ConvertFrom-Json
    if ($result.ok) {
        Write-Host "  ERFOLG: $($result.message)" -ForegroundColor Green
    } else {
        Write-Host "  Fehler: $($result.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "  API-Fehler: $($_.Exception.Message)" -ForegroundColor Red
    try { Write-Host "  Details: $($_.ErrorDetails.Message)" } catch {}
}

Write-Host ""
Write-Host "===== Fertig! =====" -ForegroundColor Cyan
