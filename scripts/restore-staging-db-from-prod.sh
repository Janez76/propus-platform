#!/bin/sh
# Stellt die Staging-Postgres auf dem NAS aus einem Prod-pg_dump wieder her (volle 1:1-Daten).
# Ausführung: auf dem UGREEN-NAS im Repo-Root (z. B. /volume1/docker/propus-staging/repo).
#
# Voraussetzungen:
#   - .env.staging mit POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB (Staging-DB-Name bleibt z. B. propus_staging).
#   - pg_dump mit --no-owner --no-acl (vermeidet Rolle/Kollisionsprobleme zwischen Prod und Staging).
#
# Nutzung:
#   1) Dump-Datei lokal:
#        ./scripts/restore-staging-db-from-prod.sh /pfad/zum/db.sql
#
#   2) Dump direkt von der Prod-VPS (SSH), ohne Zwischendatei auf dem NAS:
#        PROD_SSH=root@87.106.24.107 \
#        PROD_ROOT=/opt/propus-platform \
#        ./scripts/restore-staging-db-from-prod.sh --from-prod-ssh
#
# Optional danach orders.json (Booking-State) von Prod kopieren:
#   PROD_SSH=root@87.106.24.107 ./scripts/fetch-prod-orders-json-to-staging.sh
#   (siehe zweites Skript unten oder manuell docker cp)
#
set -eu

COMPOSE_PROJECT="${COMPOSE_PROJECT:-propus-staging}"
ENV_FILE="${ENV_FILE:-.env.staging}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# POSIX-sh: . name ohne "/" sucht in PATH — immer ./ oder absolut verwenden.
case "${ENV_FILE}" in
  /* | ./* | ../*) ENV_DOT="${ENV_FILE}" ;;
  *) ENV_DOT="./${ENV_FILE}" ;;
esac

if [ ! -f "${ENV_DOT}" ]; then
  echo "[restore-staging] Fehlt: ${ENV_DOT}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ENV_DOT}"
set +a

compose() {
  # shellcheck disable=SC2086
  docker compose -p "${COMPOSE_PROJECT}" \
    -f docker-compose.vps.yml \
    -f docker-compose.staging.nas.yml \
    --env-file "${ENV_FILE}" \
    "$@"
}

filter_sql_dump() {
  sed '/^SET transaction_timeout = 0;$/d'
}

drop_and_recreate_db() {
  dbname="${POSTGRES_DB:?POSTGRES_DB fehlt in env}"
  user="${POSTGRES_USER:?POSTGRES_USER fehlt in env}"
  echo "[restore-staging] Leere Ziel-DB ${dbname} (DROP/CREATE) …"
  compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "${user}" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbname}' AND pid <> pg_backend_pid();" \
    || true
  compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "${user}" -d postgres -c \
    "DROP DATABASE IF EXISTS \"${dbname}\";"
  compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "${user}" -d postgres -c \
    "CREATE DATABASE \"${dbname}\" OWNER \"${user}\";"
}

restore_from_stream() {
  echo "[restore-staging] Importiere SQL (stdin) …"
  filter_sql_dump | compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
}

case "${1:-}" in
  --from-prod-ssh)
    PROD_SSH="${PROD_SSH:?Setze PROD_SSH, z. B. root@87.106.24.107}"
    PROD_ROOT="${PROD_ROOT:-/opt/propus-platform}"
    PROD_COMPOSE="${PROD_COMPOSE:-docker-compose.vps.yml}"
    PROD_ENV="${PROD_ENV:-.env.vps}"
    echo "[restore-staging] Stoppe Platform/Website auf Staging …"
    compose stop platform website 2>/dev/null || true
    compose stop migrate 2>/dev/null || true
    echo "[restore-staging] Hole pg_dump von ${PROD_SSH} (${PROD_ROOT}) …"
    drop_and_recreate_db
    # shellcheck disable=SC2029
    ssh -o BatchMode=yes "${PROD_SSH}" "set -eu; cd \"${PROD_ROOT}\" && set -a && . \"${PROD_ENV}\" && set +a && \
      docker compose -f \"${PROD_COMPOSE}\" --env-file \"${PROD_ENV}\" exec -T postgres \
      pg_dump -U \"\${POSTGRES_USER}\" -d \"\${POSTGRES_DB}\" --clean --if-exists --no-owner --no-acl" \
      | restore_from_stream
    echo "[restore-staging] Starte Dienste …"
    compose up -d platform website
    echo "[restore-staging] Fertig. Optional: orders.json von Prod nachziehen (siehe Skriptkopf)."
    ;;
  "")
    echo "Usage: $0 <db.sql> | --from-prod-ssh" >&2
    exit 1
    ;;
  *)
    sql_path="$1"
    if [ ! -f "${sql_path}" ]; then
      echo "[restore-staging] Datei nicht gefunden: ${sql_path}" >&2
      exit 1
    fi
    echo "[restore-staging] Stoppe Platform/Website auf Staging …"
    compose stop platform website 2>/dev/null || true
    compose stop migrate 2>/dev/null || true
    drop_and_recreate_db
    echo "[restore-staging] Importiere ${sql_path} …"
    filter_sql_dump < "${sql_path}" | compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
    echo "[restore-staging] Starte Dienste …"
    compose up -d platform website
    echo "[restore-staging] Fertig."
    ;;
esac
