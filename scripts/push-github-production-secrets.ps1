<#
.SYNOPSIS
  Laedt Secrets fuer GitHub Actions Environment "production" per GitHub CLI (gh).

.DESCRIPTION
  Du musst das selbst ausfuehren (Cursor/GitHub haben keinen Zugriff auf dein Repo-Settings).
  Voraussetzungen:
  - GitHub CLI: https://cli.github.com/  ->  gh auth login
  - Im Repo-Root ausfuehren (oder -WorkspaceRoot setzen)

.EXAMPLE
  .\scripts\push-github-production-secrets.ps1 `
    -SshKeyPath "$HOME\.ssh\id_ed25519_propus_vps" `
    -EnvVpsPath ".\.env.vps" `
    -ExtraSecretsFile ".\scripts\local.github-actions.secrets.env"

.EXAMPLE
  Nur anzeigen, nichts senden:
  .\scripts\push-github-production-secrets.ps1 -DryRun
#>
param(
  [string]$WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$Environment = "production",
  [string]$SshKeyPath = "",
  [string]$EnvVpsPath = "",
  [string]$ExtraSecretsFile = "",
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-GhCli {
  $null = Get-Command gh -ErrorAction Stop
  gh auth status 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI nicht angemeldet. Fuehre aus: gh auth login"
  }
}

function Invoke-GhSecretSet {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Body
  )
  if ($DryRun) {
    $preview = if ($Body.Length -gt 80) { $Body.Substring(0, 77) + "..." } else { $Body }
    Write-Host "[DRY] gh secret set $Name --env $Environment  (Laenge $($Body.Length), Preview: $preview)"
    return
  }
  # gh 2.x: kein --body-file; Wert per stdin (zuverlaessig fuer mehrzeilige Keys)
  $Body | gh secret set $Name --env $Environment
  if ($LASTEXITCODE -ne 0) { throw "gh secret set $Name fehlgeschlagen (Exit $LASTEXITCODE)" }
  Write-Host "OK: $Name"
}

function Invoke-GhSecretSetFromFile {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$FilePath
  )
  if (-not (Test-Path -LiteralPath $FilePath)) {
    throw "Datei fehlt: $FilePath"
  }
  $body = [System.IO.File]::ReadAllText($FilePath)
  if ([string]::IsNullOrWhiteSpace($body)) {
    throw "Datei ist leer: $FilePath"
  }
  Invoke-GhSecretSet -Name $Name -Body $body
}

function Import-DotEnvStyleFile {
  param([Parameter(Mandatory)][string]$Path)
  $map = @{}
  Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $k = $line.Substring(0, $eq).Trim()
    $v = $line.Substring($eq + 1).Trim()
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    $map[$k] = $v
  }
  return $map
}

$allowedFromExtra = @(
  "VPS_HOST",
  "CLOUDFLARE_ZONE_ID",
  "CLOUDFLARE_AUTH_EMAIL",
  "CLOUDFLARE_AUTH_KEY",
  "PLAYWRIGHT_BASE_URL",
  "PLAYWRIGHT_LIVE_BOOKING",
  "PLAYWRIGHT_BOOKING_ADDRESS_QUERY",
  "PLAYWRIGHT_BOOKING_PACKAGE_KEY",
  "PLAYWRIGHT_BOOKING_DATE",
  "PLAYWRIGHT_BOOKING_SLOT",
  "PLAYWRIGHT_BOOKING_COMPANY",
  "PLAYWRIGHT_BOOKING_NAME",
  "PLAYWRIGHT_BOOKING_EMAIL",
  "PLAYWRIGHT_BOOKING_PHONE",
  "PLAYWRIGHT_BOOKING_STREET",
  "PLAYWRIGHT_BOOKING_ZIP",
  "PLAYWRIGHT_BOOKING_CITY",
  "PLAYWRIGHT_BOOKING_OBJECT_TYPE",
  "PLAYWRIGHT_BOOKING_AREA",
  "PLAYWRIGHT_BOOKING_ONSITE_NAME",
  "PLAYWRIGHT_BOOKING_ONSITE_PHONE"
)

Push-Location $WorkspaceRoot
try {
  Test-GhCli

  if ([string]::IsNullOrWhiteSpace($SshKeyPath)) {
    $SshKeyPath = Join-Path $HOME ".ssh/id_ed25519_propus_vps"
  }
  if ([string]::IsNullOrWhiteSpace($EnvVpsPath)) {
    $EnvVpsPath = Join-Path $WorkspaceRoot ".env.vps"
  }
  if ([string]::IsNullOrWhiteSpace($ExtraSecretsFile)) {
    $ExtraSecretsFile = Join-Path $PSScriptRoot "local.github-actions.secrets.env"
  }

  Write-Host "Workspace: $WorkspaceRoot"
  Write-Host "Environment: $Environment"
  Write-Host ""

  Invoke-GhSecretSetFromFile -Name "VPS_SSH_PRIVATE_KEY" -FilePath $SshKeyPath
  Invoke-GhSecretSetFromFile -Name "VPS_ENV_FILE" -FilePath $EnvVpsPath

  if (-not (Test-Path -LiteralPath $ExtraSecretsFile)) {
    Write-Host ""
    Write-Host "Hinweis: Zusatzdatei nicht gefunden: $ExtraSecretsFile"
    Write-Host "Lege sie an (Kopie von scripts\local.github-actions.secrets.env.example) und fuehre das Skript erneut aus,"
    Write-Host "damit Cloudflare- und Playwright-Secrets gesetzt werden."
    return
  }

  $extra = Import-DotEnvStyleFile -Path $ExtraSecretsFile
  foreach ($key in $allowedFromExtra) {
    if (-not $extra.ContainsKey($key)) { continue }
    $val = $extra[$key]
    if ([string]::IsNullOrWhiteSpace($val)) { continue }
    Invoke-GhSecretSet -Name $key -Body $val
  }

  Write-Host ""
  Write-Host "Fertig. Pruefe unter: GitHub Repo -> Settings -> Environments -> $Environment"
}
finally {
  Pop-Location
}
