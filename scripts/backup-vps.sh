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

logto_host="${LOGTO_DB_HOST:-}"
logto_port="${LOGTO_DB_PORT:-5432}"
logto_db="${LOGTO_DB_NAME:-logto}"
logto_user="${LOGTO_DB_USER:-logto}"
logto_password="${LOGTO_DB_PASSWORD:-}"

# Set BACKUP_INCLUDE_VOLUMES=1 to archive all mounted data volumes.
# Default on because the user wants complete backups, not just SQL dumps.
include_volumes="${BACKUP_INCLUDE_VOLUMES:-1}"
volume_paths="${BACKUP_VOLUME_PATHS:-/data/state:/app/logs:/upload_staging:/booking_upload_customer:/booking_upload_raw}"

mkdir -p "${backup_dir}"

if [ -z "${pg_password}" ]; then
  printf '[backup] POSTGRES_PASSWORD ist leer.\n' >&2
  exit 1
fi

export PGPASSWORD="${pg_password}"

printf '[backup] Erstelle SQL-Dump (propus): %s/db.sql\n' "${backup_dir}"
pg_dump \
  -h "${pg_host}" \
  -p "${pg_port}" \
  -U "${pg_user}" \
  -d "${pg_db}" \
  --clean \
  --if-exists \
  > "${backup_dir}/db.sql"

if [ ! -s "${backup_dir}/db.sql" ]; then
  printf '[backup] FEHLER: SQL-Dump ist leer.\n' >&2
  exit 1
fi

if [ -n "${logto_host}" ] && [ -n "${logto_password}" ]; then
  printf '[backup] Erstelle SQL-Dump (logto): %s/logto.sql\n' "${backup_dir}"
  PGPASSWORD="${logto_password}" pg_dump \
    -h "${logto_host}" \
    -p "${logto_port}" \
    -U "${logto_user}" \
    -d "${logto_db}" \
    --clean \
    --if-exists \
    > "${backup_dir}/logto.sql"

  if [ ! -s "${backup_dir}/logto.sql" ]; then
    printf '[backup] WARNUNG: Logto-Dump ist leer, wird entfernt.\n' >&2
    rm -f "${backup_dir}/logto.sql"
  fi
else
  printf '[backup] Logto-DB-Backup uebersprungen (LOGTO_DB_HOST oder LOGTO_DB_PASSWORD nicht gesetzt)\n'
fi

if [ -f "${orders_file}" ]; then
  printf '[backup] Sichere orders.json\n'
  cp "${orders_file}" "${backup_dir}/orders.json"
fi

if [ -f "${env_file}" ]; then
  printf '[backup] Sichere Env-Datei\n'
  cp "${env_file}" "${backup_dir}/.env.vps"
fi

if [ "${include_volumes}" = "1" ]; then
  printf '[backup] Sichere komplette Daten-Volumes...\n'
  old_ifs="${IFS}"
  IFS=':'
  # shellcheck disable=SC2086
  set -- ${volume_paths}
  IFS="${old_ifs}"
  for volume_dir in "$@"; do
    if [ -d "${volume_dir}" ]; then
      volume_name="$(basename "${volume_dir}")"
      archive_path="${backup_dir}/${volume_name}.tar.gz"
      printf '[backup]   Archiviere %s -> %s\n' "${volume_dir}" "${archive_path}"
      tar -czf "${archive_path}" -C "$(dirname "${volume_dir}")" "${volume_name}" \
        && printf '[backup]   OK: %s\n' "${archive_path}" \
        || printf '[backup]   WARNUNG: tar fehlgeschlagen fuer %s\n' "${volume_dir}"
    else
      printf '[backup]   WARNUNG: Volume-Pfad nicht gefunden: %s\n' "${volume_dir}"
    fi
  done
fi

{
  printf 'timestamp=%s\n' "${timestamp}"
  printf 'database=%s\n' "${pg_db}"
  printf 'logto_database=%s\n' "${logto_db}"
  printf 'host=%s\n' "${pg_host}"
  printf 'orders_file=%s\n' "${orders_file}"
  printf 'include_volumes=%s\n' "${include_volumes}"
  printf 'volume_paths=%s\n' "${volume_paths}"
} > "${backup_dir}/metadata.txt"

printf '[backup] Pruefsummen erzeugen\n'
(
  cd "${backup_dir}"
  sha256sum ./* > SHA256SUMS.txt
)

if [ "${retention_days}" -gt 0 ] 2>/dev/null; then
  printf '[backup] Loesche Backups aelter als %s Tage\n' "${retention_days}"
  find "${backup_root}" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' -mtime +"${retention_days}" -exec rm -rf {} +
fi

printf '[backup] Fertig: %s\n' "${backup_dir}"
