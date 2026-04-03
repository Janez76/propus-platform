#!/bin/bash
# rollback-vps.sh
#
# Stellt die letzte funktionierende Version auf dem VPS wieder her.
# Wird automatisch von GitHub Actions aufgerufen wenn der Deploy fehlschlaegt.
#
# Voraussetzung: Vor jedem Deploy wurde ein Archiv unter
#   /opt/propus-platform-rollback/last-good.tar.gz
# gespeichert (erster Schritt im Deploy-Workflow).
#
# Aufruf:
#   bash /opt/propus-platform/scripts/rollback-vps.sh

set -euo pipefail

PROJECT_ROOT="/opt/propus-platform"
ROLLBACK_DIR="/opt/propus-platform-rollback"
ROLLBACK_ARCHIVE="${ROLLBACK_DIR}/last-good.tar.gz"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.vps.yml"
ENV_FILE="${PROJECT_ROOT}/.env.vps"
COMPOSE_PROJECT="propus-platform"

log() {
  echo "[rollback] $(date -u +'%Y-%m-%dT%H:%M:%SZ') $*"
}

log "=== Automatischer Rollback gestartet ==="

# Pruefe ob ein Rollback-Archiv vorhanden ist
if [ ! -f "${ROLLBACK_ARCHIVE}" ]; then
  log "FEHLER: Kein Rollback-Archiv gefunden: ${ROLLBACK_ARCHIVE}"
  log "Kein Rollback moeglich – manueller Eingriff noetig."
  exit 1
fi

ARCHIVE_SIZE=$(stat -c%s "${ROLLBACK_ARCHIVE}" 2>/dev/null || echo 0)
if [ "${ARCHIVE_SIZE}" -lt 10240 ]; then
  log "FEHLER: Rollback-Archiv zu klein (${ARCHIVE_SIZE} Bytes) – beschaedigt?"
  exit 1
fi

log "Rollback-Archiv gefunden: ${ROLLBACK_ARCHIVE} ($(du -sh "${ROLLBACK_ARCHIVE}" | cut -f1))"

# Aktuelle (fehlerhafte) Version als failed-Snapshot sichern
FAILED_SNAPSHOT="${ROLLBACK_DIR}/failed-$(date +%Y%m%d-%H%M%S).tar.gz"
log "Sichere aktuelle (fehlerhafte) Version nach: ${FAILED_SNAPSHOT}"
tar -czf "${FAILED_SNAPSHOT}" -C "${PROJECT_ROOT}" . 2>/dev/null || true

# Container stoppen
log "Stoppe laufende Container..."
docker compose \
  -p "${COMPOSE_PROJECT}" \
  -f "${COMPOSE_FILE}" \
  --env-file "${ENV_FILE}" \
  down --timeout 30 2>/dev/null || true

# Rollback-Archiv entpacken
log "Entpacke Rollback-Archiv nach ${PROJECT_ROOT}..."
STAGING_DIR=$(mktemp -d /tmp/propus-rollback-XXXXXX)
tar -xzf "${ROLLBACK_ARCHIVE}" -C "${STAGING_DIR}"
tar -C "${STAGING_DIR}" -cf - . | tar -C "${PROJECT_ROOT}" -xf -
rm -rf "${STAGING_DIR}"
log "Entpacken abgeschlossen."

# Env-Datei bleibt erhalten (wurde separat gesichert / nicht im Archiv)
if [ -f "${ROLLBACK_DIR}/last-good.env.vps" ]; then
  log "Stelle .env.vps aus Rollback-Sicherung wieder her..."
  cp "${ROLLBACK_DIR}/last-good.env.vps" "${ENV_FILE}"
fi

# Container neu starten (kein Rebuild – bestehendes Image nutzen)
log "Starte Container aus bestehendem Image (kein Rebuild)..."
docker compose \
  -p "${COMPOSE_PROJECT}" \
  -f "${COMPOSE_FILE}" \
  --env-file "${ENV_FILE}" \
  up -d platform website

# Health-Check
log "Warte auf Health-Check (max 90s)..."
i=0
while [ "$i" -lt 30 ]; do
  i=$((i + 1))
  if curl -fsS http://127.0.0.1:3100/api/core/health >/dev/null 2>&1; then
    log "Health-Check OK nach ${i} Versuchen."
    break
  fi
  if [ "$i" -eq 30 ]; then
    log "FEHLER: Health-Check fehlgeschlagen nach 30 Versuchen."
    log "Container-Status:"
    docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || true
    exit 1
  fi
  sleep 3
done

log "=== Rollback erfolgreich abgeschlossen ==="
log "Produktionssystem laeuft wieder auf der letzten stabilen Version."
log "Bitte den fehlgeschlagenen Commit untersuchen und den Fehler beheben."
