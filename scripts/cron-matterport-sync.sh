#!/bin/bash
# cron-matterport-sync.sh
# Aktualisiert matterport_state aller Touren via Matterport API.
# Laeuft alle 30 Minuten. Logs: /var/log/propus-matterport-sync.log

set -euo pipefail

CRON_SECRET=$(grep '^CRON_SECRET=' /opt/propus-platform/.env.vps | cut -d= -f2- | tr -d '\r\n')
API_URL=http://127.0.0.1:3100/api/tours/cron/sync-matterport-state
LOG=/var/log/propus-matterport-sync.log

echo [$(date '+%Y-%m-%d %H:%M:%S')] sync-matterport-state START >> $LOG

RESPONSE=$(curl -s -w \n%{http_code} -X POST $API_URL \
  -H Content-Type: application/json \
  -H X-Cron-Secret: $CRON_SECRET \
  --max-time 120)

HTTP_CODE=$(echo $RESPONSE | tail -1)
BODY=$(echo $RESPONSE | head -n -1)

echo [$(date '+%Y-%m-%d %H:%M:%S')] HTTP $HTTP_CODE — $BODY >> $LOG

if [ $HTTP_CODE != 200 ]; then
  echo [$(date '+%Y-%m-%d %H:%M:%S')] FEHLER: HTTP $HTTP_CODE >> $LOG
  exit 1
fi

echo [$(date '+%Y-%m-%d %H:%M:%S')] sync-matterport-state OK >> $LOG
