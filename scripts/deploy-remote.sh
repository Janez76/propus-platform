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

# ── Health-Check: wartet bis Platform wirklich antwortet, bevor Cloudflare-
#    Tunnel wieder Traffic bekommt. Ohne diesen Wait serviert Cloudflare 403
#    ("origin not reachable") waehrend des Container-Neustarts.
echo "==> Platform Health Check (max 120s)"
HEALTH_OK=0
for attempt in $(seq 1 60); do
  STATUS=$(curl -so /dev/null -w "%{http_code}" http://127.0.0.1:3100/api/core/health 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "  Platform bereit nach ${attempt}x2s (HTTP $STATUS)"
    HEALTH_OK=1
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    echo "  Platform NICHT bereit nach 120s (letzter HTTP-Status: $STATUS)"
    exit 1
  fi
  echo "  Versuch $attempt/60 – warte (HTTP $STATUS) ..."
  sleep 2
done

# Cloudflare-Tunnel sicherstellen: laeuft er nicht mehr (z. B. nach vorherigem
# Deploy-Fehler), starten wir ihn explizit neu. Ein Reconnect per Signal wird
# NICHT gemacht – cloudflared beendet sich bei SIGHUP statt neu zu verbinden.
if [ "$HEALTH_OK" -eq 1 ]; then
  if systemctl is-active --quiet cloudflared; then
    echo "==> Cloudflare-Tunnel laeuft bereits (kein Eingriff noetig)"
  else
    echo "==> Cloudflare-Tunnel war nicht aktiv – starte neu"
    systemctl start cloudflared 2>/dev/null || true
    sleep 3
    echo "  cloudflared status: $(systemctl is-active cloudflared)"
  fi
fi

echo "==> Website Health Check (max 60s)"
for attempt in $(seq 1 30); do
  STATUS=$(curl -so /dev/null -w "%{http_code}" http://127.0.0.1:4343/ 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ] || [ "$STATUS" = "301" ] || [ "$STATUS" = "302" ]; then
    echo "  Website bereit nach ${attempt}x2s (HTTP $STATUS)"
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "  Website NICHT bereit nach 60s (letzter HTTP-Status: $STATUS)"
    exit 1
  fi
  echo "  Versuch $attempt/30 – warte (HTTP $STATUS) ..."
  sleep 2
done

echo "==> Deploy complete"
