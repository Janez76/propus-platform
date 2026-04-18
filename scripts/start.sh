#!/bin/sh
# Phase 3 von 3 im Deploy-Flow. Architektur und Aufteilung:
#   docs/DEPLOY-FLOW.md
# Phase 1 (Orchestrierung): .github/workflows/deploy-vps-and-booking-smoke.yml
# Phase 2 (VPS-Host):       scripts/deploy-remote.sh
set -e

echo "[start.sh] Starting Next.js on port ${NEXTJS_PORT:-3001}..."
PORT="${NEXTJS_PORT:-3001}" HOSTNAME="0.0.0.0" node /app/nextjs/server.js &
NEXTJS_PID=$!

echo "[start.sh] Starting Express on port ${PORT:-3100}..."
PORT="${PORT:-3100}" node /app/platform/server.js &
EXPRESS_PID=$!

echo "[start.sh] Next.js PID=$NEXTJS_PID, Express PID=$EXPRESS_PID"

trap 'echo "[start.sh] Shutting down..."; kill $NEXTJS_PID $EXPRESS_PID 2>/dev/null; wait' SIGTERM SIGINT

wait -n
EXIT_CODE=$?
echo "[start.sh] Process exited with code $EXIT_CODE, stopping all..."
kill $NEXTJS_PID $EXPRESS_PID 2>/dev/null
exit $EXIT_CODE
