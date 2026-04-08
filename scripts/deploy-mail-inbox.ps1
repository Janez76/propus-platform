#!/usr/bin/env pwsh
# Deploy: Mail-Inbox Endpunkt + Container-Neustart + Posteingang lesen
# Aufruf: .\scripts\deploy-mail-inbox.ps1

param(
    [string]$VpsHost = "87.106.24.107",
    [string]$VpsUser = "propus",
    [string]$KeyPath = "$HOME\.ssh\id_ed25519_propus_vps",
    [string]$RemotePath = "/opt/propus-platform",
    [string]$Mailbox = "office@propus.ch",
    [int]$Top = 100
)

$sshTarget = "${VpsUser}@${VpsHost}"
$localBase  = Split-Path $PSScriptRoot -Parent

Write-Host ""
Write-Host "===== Deploy Mail-Inbox Endpunkt =====" -ForegroundColor Cyan

# 1. Datei deployen
Write-Host "[1/3] Deploye admin-api.js..." -ForegroundColor Yellow
scp -i $KeyPath "$localBase\tours\routes\admin-api.js" "${sshTarget}:${RemotePath}/tours/routes/admin-api.js"
if ($LASTEXITCODE -ne 0) { Write-Host "Fehler!" -ForegroundColor Red; exit 1 }

# 2. Container neu starten
Write-Host "[2/3] Container neu starten..." -ForegroundColor Yellow
ssh -i $KeyPath $sshTarget "cd $RemotePath && docker compose -p propus-platform restart tours && sleep 8 && echo RESTARTED"
if ($LASTEXITCODE -ne 0) { Write-Host "Fehler!" -ForegroundColor Red; exit 1 }

# 3. Posteingang lesen
Write-Host "[3/3] Lese Posteingang $Mailbox..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ username = "admin"; password = "Biel2503!" } | ConvertTo-Json
try {
    Invoke-WebRequest -Uri "https://admin-booking.propus.ch/api/admin/login" `
        -Method POST -Body $loginBody -ContentType "application/json" `
        -WebSession $session -UseBasicParsing -ErrorAction Stop | Out-Null
    Write-Host "  Login OK" -ForegroundColor Green
} catch {
    Write-Host "  Login Fehler: $($_.Exception.Message)" -ForegroundColor Red; exit 1
}

$url = "https://admin-booking.propus.ch/api/tours/admin/mail/inbox?mailbox=$([Uri]::EscapeDataString($Mailbox))&top=$Top"
try {
    $r = Invoke-WebRequest -Uri $url -WebSession $session -UseBasicParsing -ErrorAction Stop
    $data = $r.Content | ConvertFrom-Json

    Write-Host ""
    Write-Host "=== Posteingang $Mailbox ===" -ForegroundColor Cyan
    Write-Host "Nachrichten total:   $($data.total)"
    Write-Host "Mit Tour-Match:      $($data.withMatch)"
    Write-Host "Ohne Match:          $($data.withoutMatch)"
    Write-Host ""

    Write-Host "=== Nachrichten MIT Tour-Zuordnung ===" -ForegroundColor Green
    $data.messages | Where-Object { $_.matchedTours.Count -gt 0 } | ForEach-Object {
        $tours = ($_.matchedTours | ForEach-Object { "Tour $($_.id) ($($_.status))" }) -join ", "
        Write-Host "  Von: $($_.fromEmail) | Betreff: $($_.subject)"
        Write-Host "    → Touren: $tours"
    }

    Write-Host ""
    Write-Host "=== Nachrichten MIT Kunden-Zuordnung (ohne Tour) ===" -ForegroundColor Yellow
    $data.messages | Where-Object { $_.matchedCustomers.Count -gt 0 -and $_.matchedTours.Count -eq 0 } | ForEach-Object {
        $custs = ($_.matchedCustomers | ForEach-Object { "$($_.name) (ID $($_.id))" }) -join ", "
        Write-Host "  Von: $($_.fromEmail) | Betreff: $($_.subject)"
        Write-Host "    → Kunden: $custs"
    }

    Write-Host ""
    Write-Host "=== Alle Absender OHNE Zuordnung (Sample 20) ===" -ForegroundColor Gray
    $data.messages | Where-Object { $_.matchedTours.Count -eq 0 -and $_.matchedCustomers.Count -eq 0 } |
        Select-Object -First 20 | ForEach-Object {
        Write-Host "  Von: $($_.fromEmail) | $($_.subject)"
    }

    # CSV-Export
    $csvPath = "$env:TEMP\inbox-matches.csv"
    $data.messages | Select-Object fromEmail, fromName, subject, receivedAt,
        @{N='matchedTours';E={($_.matchedTours | ForEach-Object { $_.id }) -join ','}},
        @{N='matchedCustomers';E={($_.matchedCustomers | ForEach-Object { $_.name }) -join ','}} |
        Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8
    Write-Host ""
    Write-Host "CSV gespeichert: $csvPath" -ForegroundColor Cyan

} catch {
    Write-Host "API-Fehler: $($_.Exception.Message)" -ForegroundColor Red
    try { Write-Host "Details: $($_.ErrorDetails.Message)" } catch {}
}

Write-Host ""
Write-Host "===== Fertig! =====" -ForegroundColor Cyan
