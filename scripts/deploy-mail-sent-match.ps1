#!/usr/bin/env pwsh
# Deploy: Postausgang-Kunden-Match + Container-Neustart + Automatische Zuweisung
# Aufruf: .\scripts\deploy-mail-sent-match.ps1 [-SpaceId toXApNsoKoc] [-DryRun] [-AutoAll]

param(
    [string]$VpsHost   = "87.106.24.107",
    [string]$VpsUser   = "propus",
    [string]$KeyPath   = "$HOME\.ssh\id_ed25519_propus_vps",
    [string]$RemotePath = "/opt/propus-platform",
    [string]$SpaceId   = "",       # leer = alle Touren ohne Kunden
    [switch]$DryRun,               # nur Vorschau, keine echten Änderungen
    [switch]$AutoAll,              # alle Matches automatisch zuweisen
    [switch]$SkipDeploy            # kein Deployment, nur API-Abfrage
)

$sshTarget = "${VpsUser}@${VpsHost}"
$localBase  = Split-Path $PSScriptRoot -Parent

Write-Host ""
Write-Host "===== Deploy: Postausgang Kunden-Match =====" -ForegroundColor Cyan
if ($SpaceId) { Write-Host "Space-ID: $SpaceId" }
if ($DryRun)  { Write-Host "Modus: DRY-RUN (keine Änderungen)" -ForegroundColor Yellow }
if ($AutoAll) { Write-Host "Modus: AUTO-ALL (alle Matches zuweisen)" -ForegroundColor Green }

# ── 1. Deployment ────────────────────────────────────────────────────────────
if (-not $SkipDeploy) {
    Write-Host ""
    Write-Host "[1/3] Deploye admin-api.js..." -ForegroundColor Yellow
    scp -i $KeyPath "$localBase\tours\routes\admin-api.js" "${sshTarget}:${RemotePath}/tours/routes/admin-api.js"
    if ($LASTEXITCODE -ne 0) { Write-Host "SCP Fehler!" -ForegroundColor Red; exit 1 }

    Write-Host "[2/3] Container neu starten..." -ForegroundColor Yellow
    ssh -i $KeyPath $sshTarget "cd $RemotePath && docker compose -p propus-platform restart tours && sleep 8 && echo RESTARTED"
    if ($LASTEXITCODE -ne 0) { Write-Host "Restart Fehler!" -ForegroundColor Red; exit 1 }
    Start-Sleep -Seconds 3
} else {
    Write-Host "(Deployment übersprungen)" -ForegroundColor Gray
}

# ── 2. Login ─────────────────────────────────────────────────────────────────
Write-Host "[3/3] Verbinde mit Admin-API..." -ForegroundColor Yellow
$web = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ username = "admin"; password = "Biel2503!" } | ConvertTo-Json
try {
    Invoke-WebRequest -Uri "https://admin-booking.propus.ch/api/admin/login" `
        -Method POST -Body $loginBody -ContentType "application/json" `
        -WebSession $web -UseBasicParsing -ErrorAction Stop | Out-Null
    Write-Host "  Login OK" -ForegroundColor Green
} catch { Write-Host "  Login Fehler: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }

# ── 3. Postausgang-Match abfragen ─────────────────────────────────────────────
$matchUrl = "https://admin-booking.propus.ch/api/tours/admin/mail/sent-customer-match"
if ($SpaceId) { $matchUrl += "?spaceId=$([Uri]::EscapeDataString($SpaceId))" }

try {
    $r = Invoke-WebRequest -Uri $matchUrl -WebSession $web -UseBasicParsing -ErrorAction Stop
    $data = $r.Content | ConvertFrom-Json
} catch {
    Write-Host "API-Fehler: $($_.Exception.Message)" -ForegroundColor Red
    try { Write-Host $_.ErrorDetails.Message } catch {}
    exit 1
}

Write-Host ""
Write-Host "=== Postausgang-Analyse ===" -ForegroundColor Cyan
Write-Host "Gefundene Einträge:        $($data.total)"
Write-Host "Mit Kunden-Match:          $($data.withCustomerMatch)"
Write-Host "Ohne Kunden-Match:         $($data.withoutCustomerMatch)"

Write-Host ""
Write-Host "=== Matches (Empfänger → Kunde) ===" -ForegroundColor Green
$withMatch = $data.matches | Where-Object { $_.bestMatch }
$withMatch | ForEach-Object {
    $c = $_.bestMatch
    Write-Host "  Tour $($_.tourId) [$($_.status)]"
    Write-Host "    Space:   $($_.spaceId)"
    Write-Host "    Name:    $($_.bezeichnung)"
    Write-Host "    E-Mail:  $($_.recipientEmail)  (gesendet: $($_.sentAt))"
    Write-Host "    Kunde:   $($c.name) (ID $($c.id))" -ForegroundColor Green
    if ($_.alreadyLinked) { Write-Host "    ⚠ Tour hat bereits Kundenzuordnung" -ForegroundColor Yellow }
}

if ($data.withoutCustomerMatch -gt 0) {
    Write-Host ""
    Write-Host "=== Ohne Kunden-Match (neue Kunden anlegen nötig) ===" -ForegroundColor Yellow
    $data.matches | Where-Object { -not $_.bestMatch } | Select-Object -First 20 | ForEach-Object {
        Write-Host "  Tour $($_.tourId): $($_.bezeichnung) | E-Mail: $($_.recipientEmail)"
    }
}

# ── 4. Automatisch zuweisen (wenn -AutoAll oder Bestätigung) ──────────────────
if ($withMatch.Count -gt 0) {
    $doApply = $false

    if ($AutoAll) {
        $doApply = $true
    } elseif (-not $DryRun) {
        Write-Host ""
        $confirm = Read-Host "Möchten Sie alle $($data.withCustomerMatch) Matches jetzt zuweisen? (j/n)"
        $doApply = ($confirm -eq "j" -or $confirm -eq "J")
    }

    if ($doApply -or $DryRun) {
        $applyBody = @{
            dryRun  = [bool]$DryRun
            autoAll = $false
            matches = @($withMatch | Where-Object { -not $_.alreadyLinked } | ForEach-Object {
                $c = $_.bestMatch
                @{
                    tourId          = $_.tourId
                    customerId      = $c.id
                    customerName    = $c.name
                    customerEmail   = $_.recipientEmail
                    customerContact = $c.contactName
                }
            })
        } | ConvertTo-Json -Depth 5

        try {
            $applyR = Invoke-WebRequest -Uri "https://admin-booking.propus.ch/api/tours/admin/mail/sent-customer-match/apply" `
                -Method POST -Body $applyBody -ContentType "application/json" `
                -WebSession $web -UseBasicParsing -ErrorAction Stop
            $applyData = $applyR.Content | ConvertFrom-Json

            Write-Host ""
            Write-Host "=== Zuweisung ===" -ForegroundColor Cyan
            if ($DryRun) { Write-Host "(DRY-RUN – keine echten Änderungen)" -ForegroundColor Yellow }
            Write-Host "Total:     $($applyData.total)"
            Write-Host "Verknüpft: $($applyData.linked)"
            $applyData.results | Where-Object { -not $_.ok } | ForEach-Object {
                Write-Host "  FEHLER Tour $($_.tourId): $($_.error)" -ForegroundColor Red
            }
        } catch {
            Write-Host "Apply-Fehler: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

# ── CSV-Export ────────────────────────────────────────────────────────────────
$csvPath = "$env:TEMP\sent-customer-match.csv"
$data.matches | Select-Object tourId, spaceId, bezeichnung, status, recipientEmail, sentAt,
    @{N='customerName';  E={ $_.bestMatch.name }},
    @{N='customerId';    E={ $_.bestMatch.id }},
    @{N='alreadyLinked'; E={ $_.alreadyLinked }} |
    Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8
Write-Host ""
Write-Host "CSV: $csvPath" -ForegroundColor Cyan
Write-Host "===== Fertig! =====" -ForegroundColor Cyan
