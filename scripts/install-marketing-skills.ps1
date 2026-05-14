# ============================================================
#  Install: coreyhaines31/marketingskills
#  Ziel:    Y:\skills\marketingskills (zentral, updatebar)
#  Bonus:   Junction in $HOME\.claude\skills\marketingskills
# ============================================================

$ErrorActionPreference = 'Stop'

$RepoUrl       = 'https://github.com/coreyhaines31/marketingskills.git'
$InstallRoot   = 'Y:\skills'
$RepoPath      = Join-Path $InstallRoot 'marketingskills'
$ClaudeSkills  = Join-Path $HOME '.claude\skills'
$JunctionPath  = Join-Path $ClaudeSkills 'marketingskills'

# --- 1) Basisordner -----------------------------------------
if (-not (Test-Path $InstallRoot)) {
    New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
    Write-Host "✓ Erstellt: $InstallRoot" -ForegroundColor Green
}

# --- 2) Repo klonen oder aktualisieren ----------------------
if (Test-Path (Join-Path $RepoPath '.git')) {
    Write-Host "→ Repo vorhanden, hole Updates..." -ForegroundColor Cyan
    Push-Location $RepoPath
    git fetch --all --quiet
    git pull --ff-only
    Pop-Location
} else {
    Write-Host "→ Klone Repo nach $RepoPath ..." -ForegroundColor Cyan
    git clone --depth 1 $RepoUrl $RepoPath
}

# --- 3) Version anzeigen ------------------------------------
$plugin = Get-Content (Join-Path $RepoPath '.claude-plugin\plugin.json') -Raw | ConvertFrom-Json
$skillCount = (Get-ChildItem (Join-Path $RepoPath 'skills') -Directory).Count
Write-Host ""
Write-Host "✓ $($plugin.name) v$($plugin.version) — $skillCount Skills bereit" -ForegroundColor Green
Write-Host "  Pfad: $RepoPath" -ForegroundColor DarkGray

# --- 4) Junction in User-Claude-Skills ----------------------
if (-not (Test-Path $ClaudeSkills)) {
    New-Item -ItemType Directory -Path $ClaudeSkills -Force | Out-Null
}

if (Test-Path $JunctionPath) {
    Write-Host "→ Junction existiert bereits: $JunctionPath" -ForegroundColor Yellow
} else {
    # Junction (Directory Junction) braucht keine Admin-Rechte
    cmd /c mklink /J "`"$JunctionPath`"" "`"$(Join-Path $RepoPath 'skills')`"" | Out-Null
    Write-Host "✓ Junction angelegt: $JunctionPath" -ForegroundColor Green
    Write-Host "  → zeigt auf: $RepoPath\skills" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Fertig. In Claude Code:" -ForegroundColor Cyan
Write-Host "  /skill list                   # alle Skills sehen"
Write-Host "  /copywriting                  # Skill direkt aufrufen"
Write-Host ""
Write-Host "Update später: einfach dieses Script erneut ausführen." -ForegroundColor DarkGray
