#!/bin/sh
# NAS: Staging-Repo ohne .git durch vollständigen Git-Klon ersetzen.
# Voraussetzung: Deploy-Key für User github-runner in GitHub (Repo → Deploy keys).
#
# Als root oder mit sudo:
#   sudo bash scripts/nas-reclone-staging-repo.sh
#
set -eu
STAGING_ROOT="${NAS_STAGING_ROOT:-/volume1/docker/propus-staging}"
REPO="${STAGING_ROOT}/repo"
REMOTE="${GITHUB_REPO_SSH:-git@github.com:janez76/propus-platform.git}"

if [ -d "${REPO}/.git" ]; then
  echo "[nas-reclone] ${REPO} ist bereits ein Git-Repo — Abbruch."
  exit 0
fi

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP="${STAGING_ROOT}/repo.notgit.${TS}"
echo "[nas-reclone] Verschiebe ${REPO} → ${BACKUP}"
mv "${REPO}" "${BACKUP}"

echo "[nas-reclone] git clone ${REMOTE}"
sudo -u github-runner -g admin git clone "${REMOTE}" "${REPO}"

if [ -f "${BACKUP}/.env.staging" ]; then
  cp -a "${BACKUP}/.env.staging" "${REPO}/.env.staging"
  chown Janez:admin "${REPO}/.env.staging" 2>/dev/null || true
  chmod 600 "${REPO}/.env.staging" 2>/dev/null || true
  echo "[nas-reclone] .env.staging aus Backup übernommen."
else
  echo "[nas-reclone] WARNUNG: kein .env.staging im Backup." >&2
fi

chown -R Janez:admin "${REPO}" 2>/dev/null || true

echo "[nas-reclone] Fertig. $(cd "${REPO}" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo branch=?)"
