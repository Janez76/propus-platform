#!/usr/bin/env pwsh
# Deploy + Postausgang analysieren + Kunden zuweisen
# Aufruf: .\scripts\run-mail-sent-match.ps1
# SSH-Passphrase wird einmalig abgefragt

param(
    [string]$VpsHost    = "87.106.24.107",
    [string]$VpsUser    = "root",
    [string]$KeyPath    = "$HOME\.ssh\id_ed25519_propus_vps",
    [string]$RemotePath = "/opt/propus-platform"
)

$sshTarget = "${VpsUser}@${VpsHost}"
$localBase  = Split-Path $PSScriptRoot -Parent

Write-Host ""
Write-Host "===== Postausgang → Kunden-Zuweisung =====" -ForegroundColor Cyan

# 1. admin-api.js deployen
Write-Host "[1/3] Deploye admin-api.js..." -ForegroundColor Yellow
scp -i $KeyPath "$localBase\tours\routes\admin-api.js" "${sshTarget}:${RemotePath}/tours/routes/admin-api.js"
if ($LASTEXITCODE -ne 0) { Write-Host "Fehler!" -ForegroundColor Red; exit 1 }
Write-Host "  OK" -ForegroundColor Green

# 2. Container neu starten
Write-Host "[2/3] Container neu starten..." -ForegroundColor Yellow
ssh -i $KeyPath $sshTarget "cd $RemotePath && docker compose -p propus-platform restart tours && sleep 8 && echo RESTARTED"
if ($LASTEXITCODE -ne 0) { Write-Host "Fehler!" -ForegroundColor Red; exit 1 }
Start-Sleep -Seconds 3

# 3. Login
Write-Host "[3/3] API-Login..." -ForegroundColor Yellow
$web = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-WebRequest -Uri "https://admin-booking.propus.ch/api/admin/login" `
    -Method POST -Body (@{ username = "admin"; password = "Biel2503!" } | ConvertTo-Json) `
    -ContentType "application/json" -WebSession $web -UseBasicParsing | Out-Null
Write-Host "  OK" -ForegroundColor Green

# 4. Postausgang-Match abfragen
Write-Host ""
Write-Host "Analysiere Postausgang..." -ForegroundColor Yellow
$r = Invoke-WebRequest -Uri "https://admin-booking.propus.ch/api/tours/admin/mail/sent-customer-match" `
    -WebSession $web -UseBasicParsing
$data = $r.Content | ConvertFrom-Json

Write-Host ""
Write-Host "=== Ergebnis ===" -ForegroundColor Cyan
Write-Host "Touren mit gesendeten Mails (ohne Kunden): $($data.total)"
Write-Host "Davon mit Kunden-Match:                    $($data.withCustomerMatch)" -ForegroundColor Green
Write-Host "Ohne Match (neue Kunden nötig):            $($data.withoutCustomerMatch)" -ForegroundColor Yellow

$withMatch = @($data.matches | Where-Object { $_.bestMatch -and -not $_.alreadyLinked })

Write-Host ""
Write-Host "=== Matches die zugewiesen werden ===" -ForegroundColor Green
$withMatch | ForEach-Object {
    Write-Host "  Tour $($_.tourId) | $($_.bezeichnung)"
    Write-Host "    E-Mail: $($_.recipientEmail)"
    Write-Host "    Kunde:  $($_.bestMatch.name) (ID $($_.bestMatch.id))"
}

Write-Host ""
Write-Host "=== Touren ohne Kunden-Match ===" -ForegroundColor Yellow
$data.matches | Where-Object { -not $_.bestMatch } | ForEach-Object {
    Write-Host "  Tour $($_.tourId) | $($_.bezeichnung) | $($_.recipientEmail)"
}

if ($withMatch.Count -eq 0) {
    Write-Host ""
    Write-Host "Keine neuen Zuweisungen möglich." -ForegroundColor Yellow
    exit 0
}

# 5. Alle Matches zuweisen
Write-Host ""
Write-Host "Weise $($withMatch.Count) Touren Kunden zu..." -ForegroundColor Cyan

$applyBody = @{
    dryRun  = $false
    autoAll = $false
    matches = @($withMatch | ForEach-Object {
        @{
            tourId          = [int]$_.tourId
            customerId      = [int]$_.bestMatch.id
            customerName    = $_.bestMatch.name
            customerEmail   = $_.recipientEmail
            customerContact = $_.bestMatch.contactName
        }
    })
} | ConvertTo-Json -Depth 5

$applyR = Invoke-WebRequest -Uri "https://admin-booking.propus.ch/api/tours/admin/mail/sent-customer-match/apply" `
    -Method POST -Body $applyBody -ContentType "application/json" `
    -WebSession $web -UseBasicParsing
$applyData = $applyR.Content | ConvertFrom-Json

Write-Host ""
Write-Host "=== Zuweisung Ergebnis ===" -ForegroundColor Cyan
Write-Host "Total:     $($applyData.total)"
Write-Host "Verknüpft: $($applyData.linked)" -ForegroundColor Green
$applyData.results | Where-Object { -not $_.ok } | ForEach-Object {
    Write-Host "  FEHLER Tour $($_.tourId): $($_.error)" -ForegroundColor Red
}
$applyData.results | Where-Object { $_.ok } | ForEach-Object {
    Write-Host "  OK Tour $($_.tourId): $($_.customerName) <$($_.customerEmail)>" -ForegroundColor Green
}

Write-Host ""
Write-Host "===== Fertig! =====" -ForegroundColor Cyan
