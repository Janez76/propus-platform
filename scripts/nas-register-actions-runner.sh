#!/bin/sh
# NAS: GitHub Actions Runner nach einmaligem Token registrieren und als Dienst starten.
#
#   sudo bash scripts/nas-register-actions-runner.sh '<REGISTRATION_TOKEN>'
#
# Token: Repo → Settings → Actions → Runners → New self-hosted runner (~1 h gültig).
#
set -eu
TOKEN="${1:?Usage: $0 <registration-token>}"

RUNNER_ROOT="${ACTIONS_RUNNER_ROOT:-/opt/actions-runner}"
RUNNER_USER="${ACTIONS_RUNNER_USER:-github-runner}"
REPO_URL="${GITHUB_REPO_URL:-https://github.com/janez76/propus-platform}"

if [ ! -x "${RUNNER_ROOT}/config.sh" ]; then
  echo "[nas-register] FEHLER: ${RUNNER_ROOT}/config.sh fehlt — Runner-Binary installieren." >&2
  exit 1
fi

sudo -u "${RUNNER_USER}" bash -lc "cd '${RUNNER_ROOT}' && ./config.sh \
  --url '${REPO_URL}' \
  --token '${TOKEN}' \
  --name propus-nas-01 \
  --labels nas-staging \
  --work _work \
  --unattended"

cd "${RUNNER_ROOT}"
if [ -x ./svc.sh ]; then
  sudo ./svc.sh install "${RUNNER_USER}"
  sudo ./svc.sh start
  sudo ./svc.sh status
else
  echo "[nas-register] WARNUNG: svc.sh fehlt — Dienst manuell einrichten (siehe GitHub-Doku)." >&2
  exit 1
fi

echo "[nas-register] Fertig. In GitHub unter Actions → Runners sollte propus-nas-01 idle sein."
