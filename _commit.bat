@echo off
cd /d "Y:\NEW PANEL\propus-platform-1"
echo === Git Add ===
git add -A
echo === Changed Files ===
git status --short
echo === Committing ===
git commit -m "feat: Logto vollstaendig entfernt, lokale Auth, Admin janez (js@propus.ch), CI-Pipeline repariert"
echo === Pushing ===
git push
echo === DONE ===
pause
