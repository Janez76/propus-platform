#!/usr/bin/env pwsh
# Einmalig ausführen: Passwortlosen Deploy-Key auf dem Server hinterlegen
# Danach funktioniert SSH/SCP ohne jede Passphrase-Abfrage.
#
# Aufruf: .\scripts\setup-nopass-ssh.ps1
# → fragt einmalig nach der Passphrase des alten Keys

param(
    [string]$VpsHost  = "87.106.24.107",
    [string]$VpsUser  = "propus",
    [string]$OldKey   = "$HOME\.ssh\id_ed25519_propus_vps",
    [string]$NewKey   = "$HOME\.ssh\propus_deploy_nopass"
)

$sshTarget = "${VpsUser}@${VpsHost}"
$pubKey = Get-Content "$NewKey.pub"

Write-Host ""
Write-Host "===== Passwortlosen Deploy-Key einrichten =====" -ForegroundColor Cyan
Write-Host "Neuer Key: $pubKey"
Write-Host ""
Write-Host "→ Verbinde mit altem Key (Passphrase erforderlich)..." -ForegroundColor Yellow

# Public Key auf Server eintragen
$cmd = "echo '$pubKey' >> ~/.ssh/authorized_keys && echo KEY_ADDED"
$result = ssh -i $OldKey "${VpsUser}@${VpsHost}" $cmd

if ($result -match "KEY_ADDED") {
    Write-Host "✓ Key erfolgreich hinterlegt!" -ForegroundColor Green
} else {
    Write-Host "Ergebnis: $result"
    Write-Host "Fehler beim Eintragen." -ForegroundColor Red
    exit 1
}

# Sofort testen
Write-Host ""
Write-Host "Teste neuen passwortlosen Key..." -ForegroundColor Yellow
$test = ssh -i $NewKey -o BatchMode=yes -o ConnectTimeout=10 "${VpsUser}@${VpsHost}" "echo SSH_OK_NOPASS"
if ($test -match "SSH_OK_NOPASS") {
    Write-Host "✓ SSH ohne Passphrase funktioniert!" -ForegroundColor Green
    Write-Host ""
    Write-Host "SSH-Config wird aktualisiert..." -ForegroundColor Yellow
} else {
    Write-Host "Test fehlgeschlagen: $test" -ForegroundColor Red
    exit 1
}

Write-Host "===== Fertig! Alle künftigen Deployments laufen ohne Passphrase. =====" -ForegroundColor Cyan
