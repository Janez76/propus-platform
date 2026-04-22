# Dubletten-Analyse ausfuehren (laedt booking/.env falls vorhanden, sonst muss DATABASE_URL gesetzt sein).
#   .\scripts\run-duplicate-analysis.ps1
#   .\scripts\run-duplicate-analysis.ps1 -EnvFile "D:\secrets\prod.env"
param(
  [string] $EnvFile = ""
)
$ErrorActionPreference = "Stop"
# PSScriptRoot = .../propus-platform/scripts
$root = Split-Path $PSScriptRoot -Parent
Set-Location (Join-Path $root "booking")
$node = "node"
$script = Join-Path $root "scripts\find-duplicate-customers.js"
$nodeArgs = @($script, "--export")
if ($EnvFile) {
  $nodeArgs = @($script, "--env-file", (Resolve-Path $EnvFile), "--export")
}
& $node @nodeArgs
exit $LASTEXITCODE
