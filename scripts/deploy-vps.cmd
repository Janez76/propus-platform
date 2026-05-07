@echo off
REM Umgeht ExecutionPolicy (RemoteSigned/Restricted) – gleiche Parameter wie deploy-vps.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-vps.ps1" %*
