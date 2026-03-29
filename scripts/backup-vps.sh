#!/bin/sh
set -eu

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_root="${BACKUP_ROOT:-/data/backups}"
backup_dir="${backup_root}/backup-${timestamp}"

pg_host="${POSTGRES_HOST:-postgres}"
pg_port="${POSTGRES_PORT:-5432}"
pg_db="${POSTGRES_DB:-propus}"
pg_user="${POSTGRES_USER:-propus}"
pg_password="${POSTGRES_PASSWORD:-}"
orders_file="${ORDERS_FILE:-/data/state/orders.json}"
retention_days="${BACKUP_RETENTION_DAYS:-30}"
env_file="${VPS_ENV_FILE:-/opt/propus-platform/.env.vps}"

mkdir -p "${backup_dir}"

if [ -z "${pg_password}" ]; then
  echo "[backup] POSTGRES_PASSWORD ist leer." >&2
  exit 1
fi

export PGPASSWORD="${pg_password}"

echo "[backup] Erstelle SQL-Dump: ${backup_dir}/db.sql"
pg_dump \
  -h "${pg_host}" \
  -p "${pg_port}" \
  -U "${pg_user}" \
  -d "${pg_db}" \
  --clean \
  --if-exists \
  > "${backup_dir}/db.sql"

if [ ! -s "${backup_dir}/db.sql" ]; then
  echo "[backup] SQL-Dump ist leer." >&2
  exit 1
fi

if [ -f "${orders_file}" ]; then
  echo "[backup] Sichere orders.json"
  cp "${orders_file}" "${backup_dir}/orders.json"
fi

if [ -f "${env_file}" ]; then
  echo "[backup] Sichere Env-Datei"
  cp "${env_file}" "${backup_dir}/.env.vps"
fi

{
  echo "timestamp=${timestamp}"
  echo "database=${pg_db}"
  echo "host=${pg_host}"
  echo "orders_file=${orders_file}"
} > "${backup_dir}/metadata.txt"

echo "[backup] Prüfsummen erzeugen"
(
  cd "${backup_dir}"
  sha256sum ./* > SHA256SUMS.txt
)

if [ "${retention_days}" -gt 0 ] 2>/dev/null; then
  echo "[backup] Lösche Backups älter als ${retention_days} Tage"
  find "${backup_root}" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' -mtime +"${retention_days}" -exec rm -rf {} +
fi

echo "[backup] Fertig: ${backup_dir}"
