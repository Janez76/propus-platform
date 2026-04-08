Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$VpsHost    = "87.106.24.107"
$VpsUser    = "propus"
$KeyPath    = "$HOME\.ssh\id_ed25519_propus_vps"
$NoPassKey  = "$HOME\.ssh\propus_deploy_nopass"
$RemotePath = "/opt/propus-platform"
$sshTarget  = "${VpsUser}@${VpsHost}"
$localBase  = Split-Path $PSScriptRoot -Parent
$plink      = "C:\Program Files\PuTTY\plink.exe"
$hostKey    = "ssh-ed25519 255 SHA256:m9PtE+Rhlykcl5l8pfDibqU2s9FLwVkxwabcUxgJ0RQ"

# Passphrase-Dialog
$form = New-Object System.Windows.Forms.Form
$form.Text = "SSH Deploy - Propus VPS"
$form.Size = New-Object System.Drawing.Size(430, 190)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.TopMost = $true

$label = New-Object System.Windows.Forms.Label
$label.Text = "SSH-Passphrase fuer id_ed25519_propus_vps:"
$label.Location = New-Object System.Drawing.Point(20, 20)
$label.Size = New-Object System.Drawing.Size(380, 20)
$form.Controls.Add($label)

$passBox = New-Object System.Windows.Forms.TextBox
$passBox.PasswordChar = [char]42
$passBox.Location = New-Object System.Drawing.Point(20, 50)
$passBox.Size = New-Object System.Drawing.Size(375, 25)
$form.Controls.Add($passBox)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = ""
$statusLabel.Location = New-Object System.Drawing.Point(20, 85)
$statusLabel.Size = New-Object System.Drawing.Size(375, 20)
$statusLabel.ForeColor = [System.Drawing.Color]::Gray
$form.Controls.Add($statusLabel)

$okBtn = New-Object System.Windows.Forms.Button
$okBtn.Text = "Deploy starten"
$okBtn.Location = New-Object System.Drawing.Point(140, 115)
$okBtn.Size = New-Object System.Drawing.Size(140, 32)
$okBtn.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.AcceptButton = $okBtn
$form.Controls.Add($okBtn)

$result = $form.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
    Write-Host "Abgebrochen."
    exit 0
}
$passphrase = $passBox.Text
$form.Dispose()

if (-not $passphrase) {
    Write-Host "Keine Passphrase eingegeben."
    exit 1
}

Write-Host ""
Write-Host "===== Deploy startet =====" -ForegroundColor Cyan

# PPK konvertieren
Write-Host "[0/4] Konvertiere Key..." -ForegroundColor Yellow
$ppkPath = "$HOME\.ssh\propus_vps_temp.ppk"
$puttygen = "C:\Program Files\PuTTY\puttygen.exe"

if (-not (Test-Path $puttygen)) {
    Write-Host "PuTTY nicht gefunden!" -ForegroundColor Red
    exit 1
}

$p = Start-Process -FilePath $puttygen -ArgumentList "`"$KeyPath`" -O private -o `"$ppkPath`" --old-passphrase `"$passphrase`" --new-passphrase `"`"" -Wait -PassThru -NoNewWindow
Start-Sleep -Seconds 2

if (-not (Test-Path $ppkPath)) {
    Write-Host "  PPK-Konvertierung fehlgeschlagen. Passphrase falsch?" -ForegroundColor Red
    exit 1
}

# Verbindungstest
Write-Host "[0/4] Teste Verbindung..." -ForegroundColor Yellow
$testOut = & $plink -i $ppkPath -hostkey $hostKey -batch $sshTarget "echo CONN_OK" 2>&1
if ($testOut -notmatch "CONN_OK") {
    Write-Host "  Fehlgeschlagen: $testOut" -ForegroundColor Red
    Remove-Item $ppkPath -Force -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "  Verbindung OK" -ForegroundColor Green

# 1. Neuen passwortlosen Key eintragen
Write-Host "[1/4] Passwortlosen Key auf Server eintragen..." -ForegroundColor Yellow
$newPubKey = (Get-Content "$NoPassKey.pub").Trim()
$addKeyScript = "mkdir -p ~/.ssh ; grep -qF `"$newPubKey`" ~/.ssh/authorized_keys 2>/dev/null ; if [ `$? -ne 0 ]; then echo `"$newPubKey`" >> ~/.ssh/authorized_keys ; fi ; chmod 600 ~/.ssh/authorized_keys ; echo KEY_DONE"
$r = & $plink -i $ppkPath -hostkey $hostKey -batch $sshTarget $addKeyScript 2>&1
if ($r -match "KEY_DONE") {
    Write-Host "  OK" -ForegroundColor Green
} else {
    Write-Host "  Warnung: $r" -ForegroundColor Yellow
}

# 2. Dateien deployen mit neuem passwortlosen Key
Write-Host "[2/4] Deploye admin-api.js..." -ForegroundColor Yellow
$localFile = "$localBase\tours\routes\admin-api.js"
$remoteFile = "$RemotePath/tours/routes/admin-api.js"
scp -i $NoPassKey -o BatchMode=yes -o StrictHostKeyChecking=no $localFile "${sshTarget}:${remoteFile}"
if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK" -ForegroundColor Green
} else {
    Write-Host "  SCP mit neuem Key fehlgeschlagen, versuche mit PPK..." -ForegroundColor Yellow
    $scpOut = & "C:\Program Files\PuTTY\pscp.exe" -i $ppkPath -hostkey $hostKey -batch $localFile "${sshTarget}:${remoteFile}" 2>&1
    Write-Host "  $scpOut"
}

# 3. Container neu starten
Write-Host "[3/4] Container neu starten..." -ForegroundColor Yellow
$restartOut = & $plink -i $ppkPath -hostkey $hostKey -batch $sshTarget "cd $RemotePath ; docker compose -p propus-platform restart tours ; sleep 8 ; echo RESTARTED" 2>&1
if ($restartOut -match "RESTARTED") {
    Write-Host "  OK" -ForegroundColor Green
} else {
    Write-Host "  $restartOut"
}

# Aufraumen
Remove-Item $ppkPath -Force -ErrorAction SilentlyContinue

# 4. Postausgang-Match
Write-Host "[4/4] Postausgang analysieren..." -ForegroundColor Yellow
Start-Sleep -Seconds 4

$web = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-WebRequest -Uri "https://admin-booking.propus.ch/api/admin/login" `
    -Method POST -Body '{"username":"admin","password":"Biel2503!"}' `
    -ContentType "application/json" -WebSession $web -UseBasicParsing | Out-Null

$matchR = Invoke-WebRequest -Uri "https://admin-booking.propus.ch/api/tours/admin/mail/sent-customer-match" `
    -WebSession $web -UseBasicParsing
$matchData = $matchR.Content | ConvertFrom-Json

Write-Host ""
Write-Host "=== Postausgang-Analyse ===" -ForegroundColor Cyan
Write-Host "Touren mit Mails (ohne Kunden): $($matchData.total)"
Write-Host "Mit Kunden-Match:               $($matchData.withCustomerMatch)" -ForegroundColor Green
Write-Host "Ohne Match:                     $($matchData.withoutCustomerMatch)" -ForegroundColor Yellow

$withMatch = @($matchData.matches | Where-Object { $_.bestMatch -and (-not $_.alreadyLinked) })
foreach ($m in $withMatch) {
    Write-Host ("  Tour {0}: {1} --> {2} <{3}>" -f $m.tourId, $m.bezeichnung, $m.bestMatch.name, $m.recipientEmail) -ForegroundColor Green
}

if ($withMatch.Count -gt 0) {
    Write-Host ""
    Write-Host ("Weise {0} Touren zu..." -f $withMatch.Count) -ForegroundColor Cyan

    $matchList = @()
    foreach ($m in $withMatch) {
        $matchList += @{
            tourId        = [int]$m.tourId
            customerId    = [int]$m.bestMatch.id
            customerName  = [string]$m.bestMatch.name
            customerEmail = [string]$m.recipientEmail
            customerContact = if ($m.bestMatch.contactName) { [string]$m.bestMatch.contactName } else { $null }
        }
    }
    $applyBody = @{ dryRun = $false; matches = $matchList } | ConvertTo-Json -Depth 5

    $applyR = Invoke-WebRequest -Uri "https://admin-booking.propus.ch/api/tours/admin/mail/sent-customer-match/apply" `
        -Method POST -Body $applyBody -ContentType "application/json" `
        -WebSession $web -UseBasicParsing
    $applyData = $applyR.Content | ConvertFrom-Json

    Write-Host ("Verknuepft: {0}/{1}" -f $applyData.linked, $applyData.total) -ForegroundColor Green
    foreach ($r2 in $applyData.results) {
        if ($r2.ok) {
            Write-Host ("  OK Tour {0}: {1}" -f $r2.tourId, $r2.customerName) -ForegroundColor Green
        } else {
            Write-Host ("  FEHLER Tour {0}: {1}" -f $r2.tourId, $r2.error) -ForegroundColor Red
        }
    }
} else {
    Write-Host "Keine neuen Matches zum Zuweisen." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "===== Fertig! Ab jetzt laeuft SSH ohne Passphrase. =====" -ForegroundColor Cyan
Read-Host "Enter druecken zum Schliessen"
