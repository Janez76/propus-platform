#!/bin/sh
# Weekly full backup including only VPS-local restore volumes.
# Suggested cron on NAS: 0 3 * * 0 /volume1/backup/propus-platform/scripts/backup-nas-full-pull.sh >> /volume1/backup/propus-platform/logs/backup-full.log 2>&1
set -eu

BACKUP_NAS_INCLUDE_VOLUMES="${BACKUP_NAS_INCLUDE_VOLUMES:-1}"
BACKUP_NAS_VOLUME_PATHS="${BACKUP_NAS_VOLUME_PATHS:-/data/state:/app/logs:/upload_staging}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

export BACKUP_NAS_INCLUDE_VOLUMES
export BACKUP_NAS_VOLUME_PATHS
export RETENTION_DAYS

exec "${SCRIPT_DIR}/backup-nas-pull.sh"
