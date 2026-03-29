#!/bin/sh
# Runs on the NAS: triggers backup on VPS, then pulls backup files via rsync.
# Designed for cron: 0 2 * * * /volume1/backup/propus-platform/scripts/backup-nas-pull.sh >> /volume1/backup/propus-platform/logs/backup.log 2>&1
set -eu

VPS_HOST="${VPS_HOST:-87.106.24.107}"
VPS_USER="${VPS_USER:-root}"
VPS_SSH_KEY="${VPS_SSH_KEY:-/home/Janez/.ssh/id_ed25519_vps_backup}"
VPS_PROJECT="${VPS_PROJECT:-/opt/propus-platform}"
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-/volume1/backup/propus-platform}"
LOCAL_DATA_DIR="${LOCAL_BACKUP_DIR}/data"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
LOG_PREFIX="[nas-backup $(date '+%Y-%m-%d %H:%M:%S')]"

SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o ServerAliveInterval=30 -i ${VPS_SSH_KEY}"

echo "${LOG_PREFIX} === Backup-Zyklus gestartet ==="

echo "${LOG_PREFIX} 1/3 Backup auf VPS ausloesen..."
# shellcheck disable=SC2086
ssh ${SSH_OPTS} "${VPS_USER}@${VPS_HOST}" \
  "docker exec propus-platform-platform-1 /app/scripts/backup-vps.sh"

echo "${LOG_PREFIX} 2/3 Backups vom VPS synchronisieren..."
mkdir -p "${LOCAL_DATA_DIR}"
# shellcheck disable=SC2086
rsync -avz --delete-after \
  -e "ssh ${SSH_OPTS}" \
  "${VPS_USER}@${VPS_HOST}:${VPS_PROJECT}/backups/" \
  "${LOCAL_DATA_DIR}/"

echo "${LOG_PREFIX} 3/3 Alte Backups auf NAS aufraeumen (>${RETENTION_DAYS} Tage)..."
find "${LOCAL_DATA_DIR}" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' -mtime +"${RETENTION_DAYS}" -exec rm -rf {} +

backup_count=$(find "${LOCAL_DATA_DIR}" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' 2>/dev/null | wc -l)
backup_size=$(du -sh "${LOCAL_DATA_DIR}" 2>/dev/null | cut -f1)

echo "${LOG_PREFIX} === Backup-Zyklus abgeschlossen: ${backup_count} Backups, ${backup_size} Gesamtgroesse ==="
