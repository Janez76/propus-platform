#!/bin/sh
# Runs on the NAS: triggers backup on VPS, then pulls backup files via rsync.
# Designed for cron: 0 2 * * * /volume1/backup/propus-platform/scripts/backup-nas-pull.sh >> /volume1/backup/propus-platform/logs/backup.log 2>&1
set -eu

VPS_HOST="${VPS_HOST:-87.106.24.107}"
VPS_USER="${VPS_USER:-root}"
VPS_SSH_KEY="${VPS_SSH_KEY:-/home/Janez/.ssh/id_ed25519_vps_backup}"
VPS_PROJECT="${VPS_PROJECT:-/opt/propus-platform}"
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-/volume1/backup/propus-platform}"
BACKUP_NAS_TARGET="${BACKUP_NAS_TARGET:-${LOCAL_BACKUP_DIR}/data}"
BACKUP_NAS_INCLUDE_VOLUMES="${BACKUP_NAS_INCLUDE_VOLUMES:-0}"
BACKUP_NAS_VOLUME_PATHS="${BACKUP_NAS_VOLUME_PATHS:-}"
LOCAL_DATA_DIR="${BACKUP_NAS_TARGET}"
REMOTE_NAS_LOG_PATH="${REMOTE_NAS_LOG_PATH:-${VPS_PROJECT}/backups/.nas-sync.log}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
LOG_PREFIX="[nas-backup $(date '+%Y-%m-%d %H:%M:%S')]"
CURRENT_STEP="initialisiert"

SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o ServerAliveInterval=30 -i ${VPS_SSH_KEY}"

write_remote_log() {
  message="$1"
  remote_log_dir="$(dirname "${REMOTE_NAS_LOG_PATH}")"
  ssh ${SSH_OPTS} "${VPS_USER}@${VPS_HOST}" \
    "mkdir -p \"${remote_log_dir}\" && cat >> \"${REMOTE_NAS_LOG_PATH}\"" <<EOF || true
$(date '+%Y-%m-%d %H:%M:%S') ${message}
EOF
}

finish() {
  exit_code=$?
  if [ "${exit_code}" -eq 0 ]; then
    write_remote_log "NAS-Sync abgeschlossen: ${LOCAL_DATA_DIR}"
  else
    write_remote_log "FEHLER beim NAS-Sync (${CURRENT_STEP}, exit ${exit_code})"
  fi
  exit "${exit_code}"
}

trap finish EXIT

echo "${LOG_PREFIX} === Backup-Zyklus gestartet ==="

echo "${LOG_PREFIX} 1/3 Backup auf VPS ausloesen..."
CURRENT_STEP="Backup auf VPS ausloesen"
docker_env_args="-e BACKUP_INCLUDE_VOLUMES=${BACKUP_NAS_INCLUDE_VOLUMES}"
if [ -n "${BACKUP_NAS_VOLUME_PATHS}" ]; then
  docker_env_args="${docker_env_args} -e BACKUP_VOLUME_PATHS=${BACKUP_NAS_VOLUME_PATHS}"
fi
# shellcheck disable=SC2086
ssh ${SSH_OPTS} "${VPS_USER}@${VPS_HOST}" \
  "docker exec ${docker_env_args} propus-platform-platform-1 /app/scripts/backup-vps.sh"

echo "${LOG_PREFIX} 2/3 Backups vom VPS synchronisieren..."
CURRENT_STEP="Backups vom VPS synchronisieren"
mkdir -p "${LOCAL_DATA_DIR}"
# shellcheck disable=SC2086
rsync -avz --delete-after \
  -e "ssh ${SSH_OPTS}" \
  "${VPS_USER}@${VPS_HOST}:${VPS_PROJECT}/backups/" \
  "${LOCAL_DATA_DIR}/"

echo "${LOG_PREFIX} 3/3 Alte Backups auf NAS aufraeumen (>${RETENTION_DAYS} Tage)..."
CURRENT_STEP="Alte NAS-Backups aufraeumen"
find "${LOCAL_DATA_DIR}" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' -mtime +"${RETENTION_DAYS}" -exec rm -rf {} +

backup_count=$(find "${LOCAL_DATA_DIR}" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' 2>/dev/null | wc -l)
backup_size=$(du -sh "${LOCAL_DATA_DIR}" 2>/dev/null | cut -f1)

echo "${LOG_PREFIX} === Backup-Zyklus abgeschlossen: ${backup_count} Backups, ${backup_size} Gesamtgroesse ==="
