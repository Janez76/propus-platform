# Erhoeht die sichtbare Deploy-Version (Patch) und traegt einen kurzen Changelog-Eintrag ein.
# Wird von deploy-vps.ps1 vor dem tar-Upload aufgerufen (wenn nicht -SkipVersionBump).
# VERSION-Quelle: booking/public/VERSION (Format v2.3.123).

param(
    [string]$WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )
    $enc = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

function Update-PackageJsonVersionPreserveFormatting {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Version
    )

    $content = [System.IO.File]::ReadAllText($Path)
    $updated = [regex]::Replace(
        $content,
        '("version"\s*:\s*")([^"]+)(")',
        {
            param($match)
            return $match.Groups[1].Value + $Version + $match.Groups[3].Value
        },
        1
    )
    if ($updated -eq $content) {
        throw "version-Feld nicht gefunden in $Path"
    }
    Write-Utf8NoBom -Path $Path -Content $updated
}

$versionFile = Join-Path $WorkspaceRoot (Join-Path "booking" (Join-Path "public" "VERSION"))
if (-not (Test-Path -LiteralPath $versionFile)) {
    throw "VERSION nicht gefunden: $versionFile"
}

$raw = (Get-Content -LiteralPath $versionFile -Raw).Trim()
if ($raw -notmatch '^\s*v?(\d+)\.(\d+)\.(\d+)\s*$') {
    throw "VERSION nicht parsbar (erwartet z.B. v2.3.280): $raw"
}

$major = [int]$Matches[1]
$minor = [int]$Matches[2]
$patch = [int]$Matches[3] + 1
$verStr = "$major.$minor.$patch"
$verTag = "v$verStr"

$versionRelPaths = @(
    @( "booking", "public", "VERSION" ),
    @( "app", "public", "VERSION" ),
    @( "website", "public", "VERSION" )
)
foreach ($segments in $versionRelPaths) {
    $p = $WorkspaceRoot
    foreach ($seg in $segments) { $p = Join-Path $p $seg }
    if (-not (Test-Path -LiteralPath $p)) {
        throw "VERSION-Pfad fehlt: $p"
    }
    Write-Utf8NoBom -Path $p -Content $verTag
}

# website/package.json version aktualisieren
$websitePkgPath = Join-Path $WorkspaceRoot (Join-Path "website" "package.json")
if (Test-Path -LiteralPath $websitePkgPath) {
    Update-PackageJsonVersionPreserveFormatting -Path $websitePkgPath -Version $verStr
}

$dateStr = Get-Date -Format "yyyy-MM-dd"
$changelogBlock = @"
  {
    version: "$verStr",
    date: "$dateStr",
    title: "Deploy",
    changes: [
      {
        type: "improvement",
        text: "Versionsnummer fuer VPS-Deploy auf $verTag erhoeht.",
      },
    ],
  },
"@

$changelogRelPaths = @(
    ,@( "app", "src", "data", "changelogData.ts" )
)

foreach ($segments in $changelogRelPaths) {
    $p = $WorkspaceRoot
    foreach ($seg in $segments) { $p = Join-Path $p $seg }
    if (-not (Test-Path -LiteralPath $p)) {
        throw "changelogData fehlt: $p"
    }
    $content = [System.IO.File]::ReadAllText($p)
    $m = [regex]::Match($content, 'export const CHANGELOG: ChangelogVersion\[\] = \[\r?\n')
    if (-not $m.Success) {
        throw "CHANGELOG-Marker nicht gefunden in $p"
    }
    $pos = $m.Index + $m.Length
    $newContent = $content.Substring(0, $pos) + $changelogBlock + [Environment]::NewLine + $content.Substring($pos)
    Write-Utf8NoBom -Path $p -Content $newContent
}

Write-Host "  Deploy-Version: $verTag (Patch +1, Changelog + Eintrag)" -ForegroundColor Green
