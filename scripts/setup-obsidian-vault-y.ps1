# setup-obsidian-vault-y.ps1
# One-time: bindet Y:\Obsidian an github.com/Janez76/obsidian-vault (Clone mit Backup).
# Voraussetzung: Obsidian schliessen, Netzlaufwerk Y: erreichbar, Git installiert.
#
# Ausfuehrung (PowerShell), aus dem propus-platform Repo-Root:
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-obsidian-vault-y.ps1
#
# Optional:
#   .\scripts\setup-obsidian-vault-y.ps1 -VaultPath 'Y:\Obsidian' -RemoteUrl 'https://github.com/Janez76/obsidian-vault.git'

param(
    [string]$VaultPath = 'Y:\Obsidian',
    [string]$RemoteUrl = 'https://github.com/Janez76/obsidian-vault.git'
)

$ErrorActionPreference = 'Stop'

function Find-GitExe {
    $candidates = @(
        'git',
        'C:\Program Files\Git\cmd\git.exe',
        'C:\Program Files\Git\bin\git.exe'
    )
    foreach ($g in $candidates) {
        if ($g -eq 'git') {
            $cmd = Get-Command git -ErrorAction SilentlyContinue
            if ($cmd) { return $cmd.Source }
            continue
        }
        if (Test-Path $g) { return $g }
    }
    throw "Git nicht gefunden. Installiere Git for Windows und starte PowerShell neu."
}

function Invoke-Git {
    param([string[]]$GitArguments)
    & $script:GitExe @GitArguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitArguments -join ' ') beendete sich mit Code $LASTEXITCODE"
    }
}

$GitExe = Find-GitExe
Write-Host "Git: $GitExe" -ForegroundColor Gray

$parent = Split-Path -Parent $VaultPath
if (-not (Test-Path $parent)) {
    throw "Pfad nicht erreichbar: $parent (Laufwerk gemappt / UNC pruefen)"
}

$gitDir = Join-Path $VaultPath '.git'
$linear = Join-Path $VaultPath '20_Projects\propus-platform\Linear - Workflow.md'

if (Test-Path $gitDir) {
    Write-Host "Vault ist bereits ein Git-Repository — pull origin main …" -ForegroundColor Cyan
    Invoke-Git @('-C', $VaultPath, 'remote', '-v')
    Invoke-Git @('-C', $VaultPath, 'fetch', 'origin')
    Invoke-Git @('-C', $VaultPath, 'pull', 'origin', 'main')
    if (Test-Path $linear) {
        Write-Host "OK: Linear-Notiz vorhanden: $linear" -ForegroundColor Green
    } else {
        Write-Warning "Erwartete Notiz fehlt nach pull: $linear"
    }
    exit 0
}

$backupFull = $null
if (Test-Path $VaultPath) {
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $backupName = "Obsidian_nicht_git_Backup_$stamp"
    $backupFull = Join-Path $parent $backupName
    Write-Host "Kein .git unter $VaultPath — sichere Ordner nach:" -ForegroundColor Yellow
    Write-Host "  $backupFull"
    Write-Host "Hinweis: Obsidian schliessen, sonst sperrt Windows Dateien."
    try {
        Rename-Item -LiteralPath $VaultPath -NewName $backupName -ErrorAction Stop
    } catch {
        throw "Umbenennen fehlgeschlagen (Obsidian offen oder keine Rechte?): $($_.Exception.Message)"
    }
}

Write-Host "Clone $RemoteUrl -> $VaultPath …" -ForegroundColor Cyan
Invoke-Git @('clone', $RemoteUrl, $VaultPath)

if (Test-Path $linear) {
    Write-Host "OK: Linear-Notiz vorhanden: $linear" -ForegroundColor Green
} else {
    Write-Warning "Linear-Notiz fehlt unerwartet: $linear"
}

if ($backupFull) {
    Write-Host ""
    Write-Host "Alter Inhalt liegt unter: $backupFull" -ForegroundColor Gray
    Write-Host "Falls du nur dort liegende Notizen brauchst, gezielt nach $VaultPath kopieren (nicht den ganzen Ordner ueberschreiben)."
}

Write-Host ""
Write-Host "Naechste Schritte:" -ForegroundColor Cyan
Write-Host "  1) Obsidian oeffnen — Vault-Ordner auf $VaultPath setzen."
Write-Host ('  2) Auto-Push (Task Scheduler): Umgebungsvariable OBSIDIAN_VAULT=''' + $VaultPath + ''' setzen (siehe 90_Meta/auto-push-vault.ps1).')
exit 0
