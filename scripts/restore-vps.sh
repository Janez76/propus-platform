#!/bin/sh
set -eu

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <backup-folder-or-sql-file> [--skip-volumes]" >&2
  exit 1
fi

compose_file="${COMPOSE_FILE:-/opt/propus-platform/docker-compose.vps.yml}"
env_file="${VPS_ENV_FILE:-/opt/propus-platform/.env.vps}"
project_root="${VPS_PROJECT_ROOT:-/opt/propus-platform}"
backup_arg="$1"
skip_volumes=false

for arg in "$@"; do
  case "${arg}" in
    --skip-volumes) skip_volumes=true ;;
  esac
done

if [ ! -f "${env_file}" ]; then
  echo "[restore] Env-Datei nicht gefunden: ${env_file}" >&2
  exit 1
fi

set -a
. "${env_file}"
set +a

filter_sql_dump() {
  sed '/^SET transaction_timeout = 0;$/d' "$1"
}

case "${backup_arg}" in
  /*) backup_path="${backup_arg}" ;;
  *) backup_path="${project_root}/backups/${backup_arg}" ;;
esac

if [ ! -e "${backup_path}" ]; then
  echo "[restore] Backup nicht gefunden: ${backup_path}" >&2
  exit 1
fi

sql_path="${backup_path}"
orders_name=""
backup_dir_name=""

if [ -d "${backup_path}" ]; then
  backup_dir_name="$(basename "${backup_path}")"
  if [ -f "${backup_path}/db.sql" ]; then
    sql_path="${backup_path}/db.sql"
  else
    echo "[restore] db.sql fehlt im Backup-Ordner: ${backup_path}" >&2
    exit 1
  fi

  if [ -f "${backup_path}/.env.vps.secrets" ]; then
    echo "[restore] Stelle .env.vps.secrets aus Backup wieder her"
    cp "${backup_path}/.env.vps.secrets" "${project_root}/.env.vps.secrets"
    chmod 600 "${project_root}/.env.vps.secrets" 2>/dev/null || true
  fi

  if [ -f "${backup_path}/orders.json" ]; then
    orders_name="$(basename "${backup_path}")/orders.json"
  fi
fi

echo "[restore] Stoppe Platform fÃ¼r konsistente Wiederherstellung"
docker compose -f "${compose_file}" --env-file "${env_file}" stop platform

echo "[restore] Stelle Haupt-DB wieder her: ${sql_path}"
filter_sql_dump "${sql_path}" | docker compose -f "${compose_file}" --env-file "${env_file}" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

restore_volume_archive() {
  archive_name="$1"
  target_path="$2"
  if [ -z "${backup_dir_name}" ]; then
    echo "[restore] WARNUNG: Volume-Restore nur fuer Backup-Ordner unter ${project_root}/backups unterstuetzt. Ueberspringe ${archive_name}"
    return 0
  fi
  archive_in_container="/data/backups/${backup_dir_name}/${archive_name}"
  echo "[restore] Stelle Volume wieder her: ${archive_name} -> ${target_path}"
  docker compose -f "${compose_file}" --env-file "${env_file}" run --rm --no-deps platform \
    sh -lc "mkdir -p \"${target_path}\" && rm -rf \"${target_path}\"/* \"${target_path}\"/.[!.]* \"${target_path}\"/..?* 2>/dev/null || true; tar -xzf \"${archive_in_container}\" -C \"$(dirname "${target_path}")\""
}

if [ "${skip_volumes}" = false ] && [ -n "${backup_dir_name}" ]; then
  [ -f "${backup_path}/state.tar.gz" ] && restore_volume_archive "state.tar.gz" "/data/state"
  [ -f "${backup_path}/logs.tar.gz" ] && restore_volume_archive "logs.tar.gz" "/app/logs"
  [ -f "${backup_path}/upload_staging.tar.gz" ] && restore_volume_archive "upload_staging.tar.gz" "${BOOKING_UPLOAD_STAGING_ROOT:-/upload_staging}"
  [ -f "${backup_path}/booking_upload_customer.tar.gz" ] && restore_volume_archive "booking_upload_customer.tar.gz" "${BOOKING_UPLOAD_CUSTOMER_ROOT:-/booking_upload_customer}"
  [ -f "${backup_path}/booking_upload_raw.tar.gz" ] && restore_volume_archive "booking_upload_raw.tar.gz" "${BOOKING_UPLOAD_RAW_ROOT:-/booking_upload_raw}"
fi

echo "[restore] Starte Platform neu"
docker compose -f "${compose_file}" --env-file "${env_file}" up -d platform

if [ -n "${orders_name}" ]; then
  echo "[restore] Stelle orders.json wieder her"
  docker compose -f "${compose_file}" --env-file "${env_file}" exec -T platform \
    sh -lc "cp \"/data/backups/${orders_name}\" \"${ORDERS_FILE:-/data/state/orders.json}\""
fi

echo "[restore] Fertig. Bitte anschlieÃŸend die Health-Checks ausfÃ¼hren."
