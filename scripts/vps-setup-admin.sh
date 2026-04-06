#!/usr/bin/env bash
# ─── VPS Admin-Benutzer Setup ────────────────────────────────────────────────
# Dieses Script setzt den Hauptadministrator-Account in der laufenden
# Docker-Produktionsumgebung.
#
# Ausführen auf dem VPS:
#   ssh propus@87.106.24.107
#   cd /opt/propus-platform
#   bash scripts/vps-setup-admin.sh
#
# Oder direkt:
#   ssh propus@87.106.24.107 "cd /opt/propus-platform && bash scripts/vps-setup-admin.sh"
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Konfiguration ───────────────────────────────────────────────────────────
ADMIN_USER="janez"
ADMIN_PASS="Zuerich8038!"
ADMIN_EMAIL="js@propus.ch"
ADMIN_NAME="Janez"
ADMIN_ROLE="super_admin"

# Docker-Container Name (aus docker-compose.yml)
CONTAINER="propus-platform"

echo ""
echo "=== Propus Admin-Benutzer Setup ==="
echo "  Benutzername : $ADMIN_USER"
echo "  E-Mail       : $ADMIN_EMAIL"
echo "  Name         : $ADMIN_NAME"
echo "  Rolle        : $ADMIN_ROLE"
echo ""

# Prüfen ob Container läuft
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "❌ Container '$CONTAINER' läuft nicht. Starte mit:"
  echo "   docker compose up -d"
  exit 1
fi

echo "  ✓ Container '$CONTAINER' läuft"

# Admin-Benutzer via Node.js setup-admin-user.js im Container anlegen
echo ""
echo "  Erstelle/aktualisiere Admin-Benutzer..."
docker exec -e "ADMIN_USER=$ADMIN_USER" \
            -e "ADMIN_PASS=$ADMIN_PASS" \
            -e "ADMIN_EMAIL=$ADMIN_EMAIL" \
            -e "ADMIN_NAME=$ADMIN_NAME" \
            -e "ADMIN_ROLE=$ADMIN_ROLE" \
            "$CONTAINER" \
            node -e "
const db = require('./booking/db');
db.bootstrapAdminUserFromEnvIfMissing().then(result => {
  console.log('Ergebnis:', JSON.stringify(result, null, 2));
  process.exit(0);
}).catch(err => {
  console.error('Fehler:', err.message);
  process.exit(1);
});
" 2>&1

echo ""
echo "=== Fertig ==="
echo ""
echo "  Login: https://admin-booking.propus.ch/login"
echo "  Benutzername: $ADMIN_USER  ODER  E-Mail: $ADMIN_EMAIL"
echo "  Passwort: $ADMIN_PASS"
echo ""
echo "  WICHTIG: Ändere das Passwort nach dem ersten Login!"
echo ""
