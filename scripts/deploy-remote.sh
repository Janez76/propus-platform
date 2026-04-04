#!/bin/bash
# deploy-remote.sh
# Wird auf dem VPS ausgefuehrt. Erwartet GITHUB_SHA als Umgebungsvariable.
set -euo pipefail

PROJECT_ROOT=/opt/propus-platform
ARCHIVE_PATH="/tmp/propus-platform-${GITHUB_SHA}.tar.gz"
STAGING_DIR="/tmp/propus-platform-${GITHUB_SHA}"

mkdir -p "$PROJECT_ROOT"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

echo "==> Extract deploy archive"
tar -xzf "$ARCHIVE_PATH" -C "$STAGING_DIR"
tar -C "$STAGING_DIR" -cf - . | tar -C "$PROJECT_ROOT" -xf -
rm -rf "$STAGING_DIR" "$ARCHIVE_PATH"

mkdir -p "$PROJECT_ROOT/backups"
chown -R 1001:65533 "$PROJECT_ROOT/backups" || true
chmod 775 "$PROJECT_ROOT/backups" || true

cd "$PROJECT_ROOT"

# Optionale VPS-only Env (z. B. Payrexx); wird nicht aus dem Deploy-Archiv geliefert.
touch .env.vps.secrets

echo "==> Port-Konflikt-Check"
# Alle Host-Ports die vom propus-platform Stack benoetigt werden
REQUIRED_PORTS="3100 3301 3302 5435 5436 4343"
FAILED_PORTS=""

for port in $REQUIRED_PORTS; do
  listeners=$(ss -tlnp "sport = :${port}" 2>/dev/null | tail -n +2)
  if [ -n "$listeners" ]; then
    # Ignoriere Prozesse die zu Docker gehoeren (docker-proxy = unser eigener Stack)
    non_docker=$(echo "$listeners" | grep -v "docker-proxy" || true)
    if [ -n "$non_docker" ]; then
      echo "  KONFLIKT Port $port wird von einem anderen Prozess belegt:"
      echo "  $non_docker"
      FAILED_PORTS="$FAILED_PORTS $port"
    else
      echo "  OK       Port $port (Docker-Stack propus-platform)"
    fi
  else
    echo "  FREI     Port $port"
  fi
done

if [ -n "$FAILED_PORTS" ]; then
  echo ""
  echo "FEHLER: Port-Konflikte auf:$FAILED_PORTS"
  echo "Bitte die konfliktierenden Prozesse stoppen und erneut deployen."
  exit 1
fi
echo "Alle Ports verfuegbar."

echo "==> Docker Build"
export DOCKER_BUILDKIT=1
docker compose -f docker-compose.vps.yml --env-file .env.vps build migrate platform website

echo "==> Platform Restart"
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --force-recreate platform

echo "==> DB Migrations"
docker compose -f docker-compose.vps.yml --env-file .env.vps --profile migrate run --rm migrate

echo "==> Website Handover"
docker compose -f docker-compose.vps.yml --env-file .env.vps rm -sf website || true
if command -v fuser >/dev/null 2>&1; then
  fuser -k 4343/tcp || true
else
  pids=$(ss -ltnp '( sport = :4343 )' 2>/dev/null | awk -F 'pid=' 'NR>1 && NF>1 {split($2,a,","); print a[1]}' | sort -u)
  if [ -n "$pids" ]; then kill $pids || true; fi
fi
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --force-recreate website

echo "==> Health Check"
for attempt in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3100/api/core/health >/dev/null; then
    echo "Health check passed on attempt $attempt"
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "Health check failed after 30 attempts"
    exit 1
  fi
  sleep 2
done

echo "==> Website Health Check"
for attempt in $(seq 1 30); do
  if curl -sf http://127.0.0.1:4343/ >/dev/null; then
    echo "Website health check passed on attempt $attempt"
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "Website health check failed after 30 attempts"
    exit 1
  fi
  sleep 2
done

echo "==> Deploy complete"
