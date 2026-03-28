#!/bin/sh
# Produktions-Start: Dependencies nur bei Bedarf installieren (verkuerzt Deploy-502-Fenster).
set -e
cd /app

apk add --no-cache postgresql-client >/dev/null 2>&1 || true

STAMP="/app/node_modules/.buchungstool_deps_stamp"
need_install=0
if [ ! -f /app/package.json ]; then
  echo "[entrypoint] FEHLER: package.json fehlt" >&2
  exit 1
fi
if [ ! -d /app/node_modules ] || [ ! -f "$STAMP" ]; then
  need_install=1
elif [ /app/package.json -nt "$STAMP" ] 2>/dev/null; then
  need_install=1
elif [ -f /app/package-lock.json ] && [ /app/package-lock.json -nt "$STAMP" ] 2>/dev/null; then
  need_install=1
elif ! node -e "require.resolve('dotenv')" >/dev/null 2>&1; then
  echo "[entrypoint] node_modules unvollstaendig (dotenv fehlt), installiere neu..."
  need_install=1
fi

if [ "$need_install" = "1" ]; then
  echo "[entrypoint] Dependencies installieren (npm install --omit=dev)..."
  rm -rf /app/node_modules/*
  npm install --omit=dev --no-audit
  touch "$STAMP"
else
  echo "[entrypoint] node_modules aktuell, ueberspringe npm ci"
fi

echo "[entrypoint] Migrationen..."
node migrate.js

echo "[entrypoint] Server starten..."
exec node server.js
