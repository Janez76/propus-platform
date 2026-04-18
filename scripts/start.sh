#!/bin/sh
# Phase 3 von 3 im Deploy-Flow. Architektur und Aufteilung:
#   docs/DEPLOY-FLOW.md
# Phase 1 (Orchestrierung): .github/workflows/deploy-vps-and-booking-smoke.yml
# Phase 2 (VPS-Host):       scripts/deploy-remote.sh
#
# Express muss vor Next.js erreichbar sein: /api/auth/* wird im Next-Handler an
# Express proxied. Lief Next früher, schlug Login mit "auth backend unavailable" fehl.
set -e

EXPRESS_PORT="${PORT:-3100}"
NEXT_PORT="${NEXTJS_PORT:-3001}"

echo "[start.sh] Starting Express on port ${EXPRESS_PORT}..."
PORT="${EXPRESS_PORT}" node /app/platform/server.js &
EXPRESS_PID=$!

echo "[start.sh] Waiting for Express (http://127.0.0.1:${EXPRESS_PORT}/api/core/health)..."
i=0
while [ "$i" -lt 180 ]; do
  if curl -sf "http://127.0.0.1:${EXPRESS_PORT}/api/core/health" >/dev/null 2>&1; then
    echo "[start.sh] Express is ready."
    break
  fi
  i=$((i + 1))
  sleep 1
done
if [ "$i" -eq 180 ]; then
  echo "[start.sh] ERROR: Express did not become ready in time"
  kill "$EXPRESS_PID" 2>/dev/null || true
  wait "$EXPRESS_PID" 2>/dev/null || true
  exit 1
fi

echo "[start.sh] Starting Next.js on port ${NEXT_PORT}..."
PORT="${NEXT_PORT}" HOSTNAME="0.0.0.0" node /app/nextjs/server.js &
NEXTJS_PID=$!

echo "[start.sh] Next.js PID=$NEXTJS_PID, Express PID=$EXPRESS_PID"

trap 'echo "[start.sh] Shutting down..."; kill $NEXTJS_PID $EXPRESS_PID 2>/dev/null; wait' SIGTERM SIGINT

wait -n
EXIT_CODE=$?
echo "[start.sh] Process exited with code $EXIT_CODE, stopping all..."
kill $NEXTJS_PID $EXPRESS_PID 2>/dev/null
exit $EXIT_CODE
