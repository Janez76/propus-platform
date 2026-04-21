#!/usr/bin/env pwsh
# ============================================================
# pull-vps-backup.ps1  –  VPS-Backup auslösen und lokal speichern
# ============================================================
# 1) Löst im Platform-Container backup-vps.sh aus
# 2) Lädt den neu erzeugten Ordner backup-* per OpenSSH scp herunter
#
# SSH: root@87.106.24.107 via ~/.ssh/id_ed25519_propus_vps
# Remote: /opt/propus-platform/backups/ (Bind-Mount ./backups)
#
# Aufruf:
#   .\scripts\pull-vps-backup.ps1
#   .\scripts\pull-vps-backup.ps1 -IncludeVolumes   # wie Wochen-Backup (Volumes .tar.gz)
#   .\scripts\pull-vps-backup.ps1 -OutputParent "D:\Archiv\propus"
#   .\scripts\pull-vps-backup.ps1 -DryRun
# ============================================================

param(
    [string]$VpsHost = "87.106.24.107",
    [string]$VpsUser = "root",
    [string]$KeyPath = "$HOME\.ssh\id_ed25519_propus_vps",
    [string]$RemotePath = "/opt/propus-platform",
    [string]$Container = "propus-platform-platform-1",
    [string]$OutputParent = "",
    [switch]$IncludeVolumes,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$sshTarget = "${VpsUser}@${VpsHost}"
$repoRoot = Split-Path $PSScriptRoot -Parent
$sshOpts = @(
    "-i", $KeyPath,
    "-o", "IdentitiesOnly=yes",
    "-o", "StrictHostKeyChecking=no",
    "-o", "ConnectTimeout=20"
)

function Invoke-Remote([string]$Cmd) {
    & ssh @sshOpts $sshTarget $Cmd 2>&1
}

Write-Host ""
Write-Host "===== Propus VPS Backup pull =====" -ForegroundColor Cyan
Write-Host "Host:       $sshTarget"
Write-Host "Remote:     $RemotePath"
Write-Host "Container:  $Container"
if ($IncludeVolumes) { Write-Host "Volumes:    ja (BACKUP_INCLUDE_VOLUMES=1)" -ForegroundColor Yellow }
if ($DryRun) { Write-Host "MODUS:      DRY-RUN" -ForegroundColor Yellow }
Write-Host ""

if (-not (Test-Path -LiteralPath $KeyPath)) {
    Write-Host "FEHLER: SSH-Key nicht gefunden: $KeyPath" -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] SSH testen..." -ForegroundColor Yellow
$test = Invoke-Remote "echo SSH_OK"
if ($test -notmatch "SSH_OK") {
    Write-Host "FEHLER: SSH-Verbindung fehlgeschlagen." -ForegroundColor Red
    Write-Host $test
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

$dockerExec = if ($IncludeVolumes) {
    "docker exec -e BACKUP_INCLUDE_VOLUMES=1 ${Container} /app/scripts/backup-vps.sh"
} else {
    "docker exec ${Container} /app/scripts/backup-vps.sh"
}

Write-Host "[2/3] Backup auf VPS ausführen..." -ForegroundColor Yellow
if ($DryRun) {
    Write-Host "  (DryRun) würde ausführen: $dockerExec"
} else {
    $backupOut = Invoke-Remote $dockerExec
    $backupOut | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FEHLER: backup-vps.sh auf dem VPS fehlgeschlagen (exit $LASTEXITCODE)." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Write-Host "[3/3] Neuesten Backup-Ordner ermitteln und herunterladen..." -ForegroundColor Yellow
$latest = (Invoke-Remote "ls -td ${RemotePath}/backups/backup-* 2>/dev/null | head -1").Trim()
if (-not $latest -or $latest -notmatch "backup-") {
    Write-Host "FEHLER: Kein Ordner backup-* unter ${RemotePath}/backups gefunden." -ForegroundColor Red
    exit 1
}
Write-Host "  Quelle: $latest"

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$parent = if ($OutputParent) { $OutputParent } else { Join-Path $repoRoot "backups" }
$dest = Join-Path $parent "vps-pull-$ts"

if ($DryRun) {
    Write-Host "  (DryRun) Ziel wäre: $dest"
    Write-Host "  (DryRun) scp -r ${sshTarget}:${latest} -> $dest"
    Write-Host ""
    Write-Host "DryRun beendet." -ForegroundColor Cyan
    exit 0
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-Host "  Ziel:   $dest" -ForegroundColor Gray

& scp @sshOpts -r "${sshTarget}:${latest}" $dest
if ($LASTEXITCODE -ne 0) {
    Write-Host "FEHLER: scp fehlgeschlagen (exit $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}

$leaf = Split-Path $latest -Leaf
$full = Join-Path $dest $leaf
Write-Host ""
Write-Host "Fertig: $full" -ForegroundColor Green
Get-ChildItem -LiteralPath $full -ErrorAction SilentlyContinue | Format-Table Name, Length -AutoSize
