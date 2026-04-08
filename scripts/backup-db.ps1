#!/usr/bin/env powershell
# Vollstaendiges Datenbank-Backup von VPS nach lokal
# Aufruf: .\scripts\backup-db.ps1
#
# Wiederherstellen:
#   scp -i $KeyPath <backup>.sql.gz root@87.106.24.107:/tmp/restore.sql.gz
#   ssh -i $KeyPath root@87.106.24.107 "gunzip -c /tmp/restore.sql.gz | docker exec -i propus-platform-postgres-1 psql -U propus"

param(
    [string]$VpsHost       = "87.106.24.107",
    [string]$VpsUser       = "root",
    [string]$KeyPath       = "$HOME\.ssh\id_ed25519_propus_vps",
    [string]$PgContainer   = "propus-platform-postgres-1",
    [string]$PgUser        = "propus",
    [string]$LocalDir      = ""
)

$sshTarget = "${VpsUser}@${VpsHost}"
$localBase  = Split-Path $PSScriptRoot -Parent

if (-not $LocalDir) {
    $LocalDir = Join-Path $localBase "backups"
}

if (-not (Test-Path $LocalDir)) {
    New-Item -ItemType Directory -Path $LocalDir | Out-Null
    Write-Host "Ordner erstellt: $LocalDir" -ForegroundColor Gray
}

$timestamp  = Get-Date -Format "yyyyMMdd_HHmmss"
$remoteGz   = "/tmp/propus_backup_${timestamp}.sql.gz"
$localGz    = Join-Path $LocalDir "propus_backup_${timestamp}.sql.gz"

Write-Host ""
Write-Host "===== Propus Datenbank-Backup =====" -ForegroundColor Cyan
Write-Host "VPS:         $sshTarget"
Write-Host "Container:   $PgContainer (User: $PgUser)"
Write-Host "Ziel:        $localGz"
Write-Host "Zeitstempel: $timestamp"
Write-Host ""

# 1. pg_dumpall auf VPS ausfuehren
Write-Host "[1/3] Erstelle Datenbank-Dump (pg_dumpall)..." -ForegroundColor Yellow
$result = ssh -i $KeyPath $sshTarget "docker exec $PgContainer pg_dumpall -U $PgUser | gzip > $remoteGz && ls -lh $remoteGz && echo DUMP_OK"
if ($LASTEXITCODE -ne 0 -or ($result -notmatch "DUMP_OK")) {
    Write-Host "FEHLER beim Dump!" -ForegroundColor Red
    Write-Host $result
    exit 1
}
Write-Host "  Dump erstellt: $remoteGz" -ForegroundColor Green
Write-Host "  $($result | Select-String 'propus_backup')" -ForegroundColor Gray

# 2. Datei lokal herunterladen
Write-Host "[2/3] Lade Backup herunter..." -ForegroundColor Yellow
scp -i $KeyPath "${sshTarget}:${remoteGz}" $localGz
if ($LASTEXITCODE -ne 0) {
    Write-Host "FEHLER beim Download!" -ForegroundColor Red
    exit 1
}
Write-Host "  Gespeichert: $localGz" -ForegroundColor Green

# 3. Temporaere Datei auf VPS loeschen
Write-Host "[3/3] Temporaere Datei auf VPS loeschen..." -ForegroundColor Yellow
ssh -i $KeyPath $sshTarget "rm -f $remoteGz"
Write-Host "  Geloescht." -ForegroundColor Gray

$localSize = [Math]::Round((Get-Item $localGz).Length / 1MB, 2)

Write-Host ""
Write-Host "===== Backup abgeschlossen! =====" -ForegroundColor Green
Write-Host "Datei:   $localGz"
Write-Host "Groesse: $localSize MB"
Write-Host ""
Write-Host "Wiederherstellen:" -ForegroundColor Cyan
Write-Host "  scp -i $KeyPath `"$localGz`" ${sshTarget}:/tmp/restore.sql.gz"
Write-Host "  ssh -i $KeyPath $sshTarget `"gunzip -c /tmp/restore.sql.gz | docker exec -i $PgContainer psql -U $PgUser`""
Write-Host ""
