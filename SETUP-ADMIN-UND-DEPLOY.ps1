#!/usr/bin/env pwsh
#Requires -Version 7.0
<#
  Propus Platform – Einmal-Setup
  Tippt in Terminal 7: .\SETUP-ADMIN-UND-DEPLOY.ps1
#>
$ErrorActionPreference = "Continue"
$REPO = "Y:\NEW PANEL\propus-platform-1"
$SSH_KEY = "$env:USERPROFILE\.ssh\id_ed25519_propus_vps"
$VPS = "root@87.106.24.107"

Write-Host "`n=== Propus Setup ===" -ForegroundColor Cyan

# 1. Git push
Write-Host "`n[1/3] Git commit + push..." -ForegroundColor Yellow
Set-Location $REPO
git add -A
$changes = git status --short
if ($changes) {
    git commit -m "feat: Admin janez (js@propus.ch), Logto entfernt, CI/CD repariert"
    git push
    Write-Host "  OK: Code gepusht – GitHub Actions Deploy laeuft." -ForegroundColor Green
} else {
    Write-Host "  Keine neuen Aenderungen." -ForegroundColor Gray
    git push 2>$null
}

# 2. GitHub Secrets
Write-Host "`n[2/3] GitHub Secrets setzen..." -ForegroundColor Yellow
if (Get-Command gh -ErrorAction SilentlyContinue) {
    "janez"          | gh secret set ADMIN_USER
    "Zuerich8038!"   | gh secret set ADMIN_PASS
    "js@propus.ch"   | gh secret set ADMIN_EMAIL
    "Janez"          | gh secret set ADMIN_NAME
    "super_admin"    | gh secret set ADMIN_ROLE
    Write-Host "  OK: GitHub Secrets gesetzt." -ForegroundColor Green
} else {
    Write-Host "  Uebersprungen (gh nicht installiert)." -ForegroundColor Gray
}

# 3. Admin direkt auf VPS erstellen
Write-Host "`n[3/3] Admin-Benutzer auf VPS erstellen..." -ForegroundColor Yellow
if (Test-Path $SSH_KEY) {
    ssh -i $SSH_KEY -o StrictHostKeyChecking=no $VPS "bash /mnt/nas-ssd/propus-setup-admin.sh"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK: Admin-Benutzer erstellt!" -ForegroundColor Green
    } else {
        Write-Host "  Warnung: SSH fehlgeschlagen – Admin wird beim Deploy erstellt." -ForegroundColor Yellow
    }
} else {
    Write-Host "  SSH-Key nicht gefunden: $SSH_KEY" -ForegroundColor Yellow
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  LOGIN: https://admin-booking.propus.ch/login" -ForegroundColor White
Write-Host "  Benutzer: janez   Passwort: Zuerich8038!" -ForegroundColor White
Write-Host "========================================`n" -ForegroundColor Cyan
