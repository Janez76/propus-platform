#!/bin/sh
# Kopiert /data/state/orders.json von der Prod-Platform-Container auf Staging (LAN-NAS).
# Ausführung: im Repo-Root mit .env.staging, nachdem platform mindestens einmal lief (Volume existiert).
#
#   PROD_SSH=root@87.106.24.107 ./scripts/fetch-prod-orders-json-to-staging.sh
#
set -eu

COMPOSE_PROJECT="${COMPOSE_PROJECT:-propus-staging}"
ENV_FILE="${ENV_FILE:-.env.staging}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

PROD_SSH="${PROD_SSH:?Setze PROD_SSH (z. B. root@87.106.24.107)}"
PROD_ROOT="${PROD_ROOT:-/opt/propus-platform}"
PROD_COMPOSE="${PROD_COMPOSE:-docker-compose.vps.yml}"
PROD_ENV="${PROD_ENV:-.env.vps}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "[orders] Fehlt: ${ENV_FILE}" >&2
  exit 1
fi

compose() {
  docker compose -p "${COMPOSE_PROJECT}" \
    -f docker-compose.vps.yml \
    -f docker-compose.staging.nas.yml \
    --env-file "${ENV_FILE}" \
    "$@"
}

echo "[orders] Prüfe orders.json auf ${PROD_SSH} …"
# shellcheck disable=SC2029
if ! ssh -o BatchMode=yes "${PROD_SSH}" "set -eu; cd \"${PROD_ROOT}\" && \
  docker compose -f \"${PROD_COMPOSE}\" --env-file \"${PROD_ENV}\" exec -T platform \
  test -f /data/state/orders.json"; then
  echo "[orders] Keine /data/state/orders.json auf Prod – überspringe (mit DATABASE_URL gilt die DB; Dump enthält die Orders)."
  exit 0
fi

echo "[orders] Kopiere orders.json …"
ssh -o BatchMode=yes "${PROD_SSH}" "set -eu; cd \"${PROD_ROOT}\" && \
  docker compose -f \"${PROD_COMPOSE}\" --env-file \"${PROD_ENV}\" exec -T platform \
  cat /data/state/orders.json" \
  | compose exec -u 0 -T platform sh -c \
    'mkdir -p /data/state && cat > /data/state/orders.json && chown propus:propus /data/state/orders.json'

echo "[orders] Fertig."
