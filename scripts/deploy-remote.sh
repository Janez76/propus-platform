#!/bin/bash
# deploy-remote.sh
# Wird auf dem VPS ausgefuehrt. Erwartet GITHUB_SHA als Umgebungsvariable.
#
# Phase 2 von 3 im Deploy-Flow. Architektur und Aufteilung:
#   docs/DEPLOY-FLOW.md
# Phase 1 (Orchestrierung): .github/workflows/deploy-vps-and-booking-smoke.yml
# Phase 3 (Container-Init): scripts/start.sh
set -euo pipefail

PROJECT_ROOT=/opt/propus-platform
ARCHIVE_PATH="/tmp/propus-platform-${GITHUB_SHA}.tar.gz"
STAGING_DIR="/tmp/propus-platform-${GITHUB_SHA}"
EXPECTED_PLATFORM_PORT_BINDINGS='{"3001/tcp":[{"HostIp":"127.0.0.1","HostPort":"3100"}]}'

check_platform_port_bindings() {
  local actual
  actual=$(docker inspect propus-platform-platform-1 --format '{{json .HostConfig.PortBindings}}' 2>/dev/null || echo "")
  if [ "$actual" != "$EXPECTED_PLATFORM_PORT_BINDINGS" ]; then
    echo "  FEHLER   Unerwartetes Platform-Port-Mapping"
    echo "           erwartet: $EXPECTED_PLATFORM_PORT_BINDINGS"
    echo "           aktuell : ${actual:-<leer>}"
    return 1
  fi
  echo "  OK       Platform-Port-Mapping: $actual"
}

check_local_route() {
  local name="$1"
  local host="$2"
  local path="$3"
  local mode="$4"
  local body_file
  body_file=$(mktemp)
  local header_file
  header_file=$(mktemp)
  local status="000"
  local ok=0

  for attempt in $(seq 1 20); do
    status=$(curl -sS -L \
      -H "Host: $host" \
      -D "$header_file" \
      -o "$body_file" \
      -w "%{http_code}" \
      "http://127.0.0.1:3100${path}" 2>/dev/null || echo "000")

    case "$mode" in
      html)
        if [ "$status" = "200" ] && grep -qi '^content-type: text/html' "$header_file"; then
          ok=1
        fi
        ;;
      json_health)
        if [ "$status" = "200" ] && grep -q '"ok"[[:space:]]*:[[:space:]]*true' "$body_file"; then
          ok=1
        fi
        ;;
    esac

    if [ "$ok" -eq 1 ]; then
      echo "  OK       $name ($status)"
      rm -f "$body_file" "$header_file"
      return 0
    fi

    if [ "$attempt" -lt 20 ]; then
      echo "  Versuch  $attempt/20 $name (HTTP $status) ..."
      sleep 3
    fi
  done

  echo "  FEHLER   $name (HTTP $status)"
  echo "  Header:"
  sed 's/^/    /' "$header_file" || true
  echo "  Body:"
  sed 's/^/    /' "$body_file" | head -40 || true
  rm -f "$body_file" "$header_file"
  return 1
}

mkdir -p "$PROJECT_ROOT"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

echo "==> Extract deploy archive"
tar -xzf "$ARCHIVE_PATH" -C "$STAGING_DIR"

echo "==> DEBUG: Archive-Stand von BackupManager.tsx"
ls -la "$STAGING_DIR/app/src/components/backups/BackupManager.tsx" 2>&1 || echo "(Datei im Archiv FEHLT!)"
echo "--- grep 'logto' im Archive-BackupManager:"
grep -n 'logto' "$STAGING_DIR/app/src/components/backups/BackupManager.tsx" 2>&1 | head -5 || echo "(keine Treffer)"
echo "--- rsync/fallback wird gleich die Dateien nach $PROJECT_ROOT syncen"

# Sync with deletion so removed files don't linger on disk (causing stale TS/Docker errors).
# Preserve runtime-only files that are not in the archive.
if command -v rsync >/dev/null 2>&1; then
  echo "==> rsync --delete (verbose)"
  rsync -av --delete \
    --exclude='.env.vps' \
    --exclude='.env.vps.secrets' \
    --exclude='backups/' \
    "$STAGING_DIR/" "$PROJECT_ROOT/" 2>&1 | grep -E "BackupManager|backups/|deleting|^sent" | head -20 || true
else
  # Fallback: wipe source-code directories explicitly before overlay-copy
  for _srcdir in app booking core platform tours website; do
    [ -d "$PROJECT_ROOT/$_srcdir" ] && rm -rf "$PROJECT_ROOT/$_srcdir" || true
  done
  tar -C "$STAGING_DIR" -cf - . | tar -C "$PROJECT_ROOT" -xf -
fi

echo "==> DEBUG: VPS-Stand nach rsync"
ls -la "$PROJECT_ROOT/app/src/components/backups/BackupManager.tsx"
grep -c 'logto' "$PROJECT_ROOT/app/src/components/backups/BackupManager.tsx" || echo "0 Logto-Treffer"

rm -rf "$STAGING_DIR" "$ARCHIVE_PATH"

mkdir -p "$PROJECT_ROOT/backups"
chown -R 1001:65533 "$PROJECT_ROOT/backups" || true
chmod 775 "$PROJECT_ROOT/backups" || true

cd "$PROJECT_ROOT"

# Optionale VPS-only Env (z. B. Payrexx); wird nicht aus dem Deploy-Archiv geliefert.
touch .env.vps.secrets

echo "==> Installiere VPS-sichere Compose-Defaults"
# Auf dem VPS soll auch ein plain `docker compose up` dieselbe Konfiguration wie
# der produktive Deploy verwenden. Dazu bevorzugen Default-Kommandos `compose.yaml`
# und `.env` -> `.env.vps`.
rm -f compose.yaml
ln -s docker-compose.vps.yml compose.yaml
rm -f .env
ln -s .env.vps .env

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

echo "==> DEBUG: Datei-Stand auf VPS-Dateisystem"
ls -la "$PROJECT_ROOT/app/src/components/backups/BackupManager.tsx" || echo "Datei fehlt"
echo "--- grep 'logto' in BackupManager.tsx:"
grep -n 'logto' "$PROJECT_ROOT/app/src/components/backups/BackupManager.tsx" || echo "(keine Treffer - Datei ist sauber)"
echo "--- grep 'logto' in api/backups.ts:"
grep -n 'logto' "$PROJECT_ROOT/app/src/api/backups.ts" || echo "(keine Treffer - Datei ist sauber)"
echo "==> Docker Build"
export DOCKER_BUILDKIT=1
docker compose -f docker-compose.vps.yml --env-file .env.vps build migrate website
docker compose -f docker-compose.vps.yml --env-file .env.vps build --no-cache \
  --build-arg DEPLOY_SHA="${GITHUB_SHA:-$(date +%s)}" \
  platform

echo "==> Platform Restart"
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --force-recreate platform

echo "==> Platform Port-Binding Check"
check_platform_port_bindings

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

echo "==> Platform Host Routing Smoke Check (local)"
check_local_route "booking.propus.ch /" "booking.propus.ch" "/" "html"
check_local_route "admin-booking.propus.ch /" "admin-booking.propus.ch" "/" "html"
check_local_route "api-booking.propus.ch /api/core/health" "api-booking.propus.ch" "/api/core/health" "json_health"
check_local_route "api.propus.ch /api/core/health" "api.propus.ch" "/api/core/health" "json_health"

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
