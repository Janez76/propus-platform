#!/bin/sh
# Lädt den jüngsten VPS-DB-Dump (vom NAS-Cron `backup-nas-pull.sh` synchronisiert)
# in den Staging-Postgres-Container. Lauf-Ort: NAS (Debian 12).
#
# Nutzung:
#   ./scripts/restore-staging-from-vps-backup.sh [<backup-folder-name>]
#
# Ohne Argument: nimmt den lexikalisch jüngsten Ordner unter
# $STAGING_BACKUP_SOURCE (Default /volume1/backup/propus-platform/data).
# Mit Argument: erwartet einen Ordner "backup-YYYYMMDD-HHMMSS" oder absoluten Pfad.
#
# Voraussetzungen:
#   - .env.staging existiert im Repo-Root
#   - Staging-Stack ist mindestens für `postgres` gestartet
#     (Compose-Projekt: propus-staging)
#   - Daily-Cron `backup-nas-pull.sh` läuft, Backups liegen lokal vor
#
# Sicherheit: stoppt den platform-Container vor dem Restore, damit keine
# konkurrierenden Schreibvorgänge das Schema sprengen.
set -eu

# --- Pfade / Defaults -------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${STAGING_ENV_FILE:-${REPO_ROOT}/.env.staging}"
COMPOSE_PROJECT="${STAGING_COMPOSE_PROJECT:-propus-staging}"
COMPOSE_BASE="${STAGING_COMPOSE_BASE:-${REPO_ROOT}/docker-compose.vps.yml}"
COMPOSE_OVERRIDE="${STAGING_COMPOSE_OVERRIDE:-${REPO_ROOT}/docker-compose.staging.nas.yml}"
BACKUP_SOURCE="${STAGING_BACKUP_SOURCE:-/volume1/backup/propus-platform/data}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "[restore-staging] FEHLER: ${ENV_FILE} fehlt." >&2
  exit 1
fi

# .env.staging nur für POSTGRES_USER / POSTGRES_DB lesen — nicht alles
# exportieren, sonst überschreibt es Shell-Vars wie HOME etc.
STAGING_PG_USER="$(grep -E '^POSTGRES_USER=' "${ENV_FILE}" | tail -1 | cut -d= -f2-)"
STAGING_PG_DB="$(grep -E '^POSTGRES_DB=' "${ENV_FILE}" | tail -1 | cut -d= -f2-)"

if [ -z "${STAGING_PG_USER}" ] || [ -z "${STAGING_PG_DB}" ]; then
  echo "[restore-staging] FEHLER: POSTGRES_USER / POSTGRES_DB fehlen in ${ENV_FILE}." >&2
  exit 1
fi

# --- Backup-Ordner auflösen -------------------------------------------------
if [ "$#" -ge 1 ] && [ -n "$1" ]; then
  case "$1" in
    /*) backup_dir="$1" ;;
    *)  backup_dir="${BACKUP_SOURCE}/$1" ;;
  esac
else
  backup_dir="$(find "${BACKUP_SOURCE}" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' 2>/dev/null \
    | sort | tail -n 1)"
  if [ -z "${backup_dir}" ]; then
    echo "[restore-staging] FEHLER: keine Backups unter ${BACKUP_SOURCE}." >&2
    exit 1
  fi
  echo "[restore-staging] Jüngster Backup-Ordner: ${backup_dir}"
fi

sql_path="${backup_dir}/db.sql"
if [ ! -s "${sql_path}" ]; then
  echo "[restore-staging] FEHLER: ${sql_path} fehlt oder ist leer." >&2
  exit 1
fi

compose_cmd="docker compose -p ${COMPOSE_PROJECT} -f ${COMPOSE_BASE} -f ${COMPOSE_OVERRIDE} --env-file ${ENV_FILE}"

# --- Sicherheits-Bestätigung -----------------------------------------------
echo "[restore-staging] ============================================="
echo "[restore-staging] Ziel: ${COMPOSE_PROJECT} / Datenbank ${STAGING_PG_DB} (User ${STAGING_PG_USER})"
echo "[restore-staging] Quelle: ${sql_path}"
echo "[restore-staging] Schema- und Datenbestand werden ÜBERSCHRIEBEN (--clean --if-exists)."
echo "[restore-staging] ============================================="
if [ "${STAGING_RESTORE_YES:-0}" != "1" ]; then
  printf "[restore-staging] Fortfahren? (yes/Nein) "
  read -r answer
  case "${answer}" in
    yes|YES|Yes) ;;
    *) echo "[restore-staging] Abgebrochen."; exit 1 ;;
  esac
fi

# --- Stop platform (verhindert konkurrierende Writes) ----------------------
echo "[restore-staging] Stoppe platform-Container..."
# shellcheck disable=SC2086
${compose_cmd} stop platform >/dev/null 2>&1 || true

# --- Restore: SQL-Filter + Owner/Grant rewrite -----------------------------
# Der Prod-Dump benennt überall `propus` als Owner / Grantee. In Staging heißt
# der Rolle/DB i.d.R. `propus_staging`, deshalb stream-rewrite via sed.
# Außerdem die transaction_timeout-Zeile entfernen (PG ≥ 17 only), wie im
# bestehenden restore-vps.sh.
echo "[restore-staging] Lade Dump in Staging-Postgres..."
sed \
  -e '/^SET transaction_timeout = 0;$/d' \
  -e "s/OWNER TO propus;/OWNER TO ${STAGING_PG_USER};/g" \
  -e "s/\\([[:space:]]\\)TO propus;/\\1TO ${STAGING_PG_USER};/g" \
  "${sql_path}" \
  | ${compose_cmd} exec -T postgres \
      psql -v ON_ERROR_STOP=1 -U "${STAGING_PG_USER}" -d "${STAGING_PG_DB}"

# --- Optional: Migrate-Profile ausführen, falls Staging-Branch neuer ist ---
if [ "${STAGING_RESTORE_RUN_MIGRATE:-0}" = "1" ]; then
  echo "[restore-staging] Führe migrate-Profile aus..."
  # shellcheck disable=SC2086
  ${compose_cmd} --profile migrate run --rm migrate
fi

# --- Platform wieder hoch ---------------------------------------------------
echo "[restore-staging] Starte platform neu..."
# shellcheck disable=SC2086
${compose_cmd} up -d platform

echo "[restore-staging] Fertig. Health-Check:"
echo "[restore-staging]   curl -fsS http://192.168.1.5:\${STAGING_PLATFORM_PORT:-13100}/api/core/health"
