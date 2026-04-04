#!/bin/sh
# Einmalig auf dem VPS: legt .env.vps.secrets aus der Vorlage an (wenn noch fehlt).
# Payrexx-Werte manuell eintragen, dann: docker compose ... up -d --force-recreate platform
#
#   bash /opt/propus-platform/scripts/vps-bootstrap-env-secrets.sh
set -eu

ROOT="${VPS_PROJECT_ROOT:-/opt/propus-platform}"
EXAMPLE="${ROOT}/.env.vps.secrets.example"
TARGET="${ROOT}/.env.vps.secrets"

cd "${ROOT}" || exit 1

if [ -f "${TARGET}" ] && [ -s "${TARGET}" ]; then
  # Nicht leer: erste Zeile mit KEY= die kein reiner Kommentar ist
  if grep -q '^[A-Za-z_][A-Za-z0-9_]*=.' "${TARGET}" 2>/dev/null; then
    echo "[vps-bootstrap-env-secrets] ${TARGET} existiert bereits mit Inhalt — nichts getan."
    exit 0
  fi
fi

if [ ! -f "${EXAMPLE}" ]; then
  echo "[vps-bootstrap-env-secrets] Fehlt: ${EXAMPLE} (nach Deploy/Repo-Update vorhanden?)" >&2
  exit 1
fi

cp "${EXAMPLE}" "${TARGET}"
chmod 600 "${TARGET}" || true
echo "[vps-bootstrap-env-secrets] ${TARGET} angelegt. Bitte PAYREXX_* eintragen, dann platform neu erstellen."
