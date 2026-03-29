#!/bin/sh
set -eu

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <backup-folder-or-sql-file>" >&2
  exit 1
fi

compose_file="${COMPOSE_FILE:-/opt/propus-platform/docker-compose.vps.yml}"
env_file="${VPS_ENV_FILE:-/opt/propus-platform/.env.vps}"
project_root="${VPS_PROJECT_ROOT:-/opt/propus-platform}"
backup_arg="$1"

if [ ! -f "${env_file}" ]; then
  echo "[restore] Env-Datei nicht gefunden: ${env_file}" >&2
  exit 1
fi

set -a
. "${env_file}"
set +a

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

if [ -d "${backup_path}" ]; then
  if [ -f "${backup_path}/db.sql" ]; then
    sql_path="${backup_path}/db.sql"
  else
    echo "[restore] db.sql fehlt im Backup-Ordner: ${backup_path}" >&2
    exit 1
  fi

  if [ -f "${backup_path}/orders.json" ]; then
    orders_name="$(basename "${backup_path}")/orders.json"
  fi
fi

echo "[restore] Stoppe Platform für konsistente Wiederherstellung"
docker compose -f "${compose_file}" --env-file "${env_file}" stop platform

echo "[restore] Stelle SQL-Dump wieder her: ${sql_path}"
cat "${sql_path}" | docker compose -f "${compose_file}" --env-file "${env_file}" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

echo "[restore] Starte Platform neu"
docker compose -f "${compose_file}" --env-file "${env_file}" up -d platform

if [ -n "${orders_name}" ]; then
  echo "[restore] Stelle orders.json wieder her"
  docker compose -f "${compose_file}" --env-file "${env_file}" exec -T platform \
    sh -lc "cp \"/data/backups/${orders_name}\" \"${ORDERS_FILE:-/data/state/orders.json}\""
fi

echo "[restore] Fertig. Bitte anschließend die Health-Checks ausführen."
