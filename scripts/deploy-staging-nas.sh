#!/bin/sh
# Deploy des LAN-Staging-Stacks auf dem UGREEN-NAS: Git-Stand aktualisieren, dann
# docker compose bauen und hochfahren.
#
# Voraussetzungen auf dem NAS:
#   - Repo-Klon mit .env.staging (nicht im Git)
#   - Docker / Compose; Nutzer des GitHub Runners in der Gruppe docker (oder root-Runner)
#   - git remote fetch (Deploy-Key oder HTTPS-Credential für GitHub)
#
# Umgebungsvariablen:
#   NAS_STAGING_REPO_ROOT  Repo-Root (Default: /volume1/docker/propus-staging/repo)
#   DEPLOY_GIT_SHA         Optional: exakter Commit (von CI gesetzt, z. B. github.sha)
#   STAGING_COMPOSE_PROJECT Default: propus-staging
#
set -eu

REPO_ROOT="${NAS_STAGING_REPO_ROOT:-/volume1/docker/propus-staging/repo}"
COMPOSE_PROJECT="${STAGING_COMPOSE_PROJECT:-propus-staging}"

if [ ! -d "${REPO_ROOT}/.git" ]; then
  echo "[deploy-staging-nas] FEHLER: kein Git-Repo unter ${REPO_ROOT}" >&2
  exit 1
fi

# Optional: CI schreibt Inhalt aus Secret NAS_ENV_FILE vor diesem Skript nach .env.staging
if [ ! -f "${REPO_ROOT}/.env.staging" ]; then
  echo "[deploy-staging-nas] FEHLER: ${REPO_ROOT}/.env.staging fehlt (oder Secret NAS_ENV_FILE nicht gesetzt)." >&2
  exit 1
fi

cd "${REPO_ROOT}"

# Runner/CI: safe.directory (Git 2.35+)
git config --global --add safe.directory "${REPO_ROOT}" 2>/dev/null || true

echo "[deploy-staging-nas] Repo: ${REPO_ROOT}"

if [ -n "${DEPLOY_GIT_SHA:-}" ]; then
  echo "[deploy-staging-nas] Checkout ${DEPLOY_GIT_SHA}"
  git fetch origin
  git checkout -f "${DEPLOY_GIT_SHA}"
else
  echo "[deploy-staging-nas] git pull --ff-only (aktueller Branch)"
  git pull --ff-only
fi

COMPOSE_BASE="docker compose -p ${COMPOSE_PROJECT} -f docker-compose.vps.yml -f docker-compose.staging.nas.yml --env-file .env.staging"

echo "[deploy-staging-nas] docker compose up -d --build …"
${COMPOSE_BASE} up -d --build

# Wie CI: Express im Container (PORT soll 3100 sein; siehe docker-compose.staging.nas.yml)
if command -v curl >/dev/null 2>&1; then
  echo "[deploy-staging-nas] Health Express (im Container, /api/core/health) …"
  i=0
  while [ "$i" -lt 60 ]; do
    if ${COMPOSE_BASE} exec -T platform sh -c 'EP="${PORT:-3100}"; curl -fsS --max-time 5 "http://127.0.0.1:${EP}/api/core/health"' 2>/dev/null; then
      echo ""
      echo "[deploy-staging-nas] Express-Health OK."
      break
    fi
    i=$((i + 1))
    if [ "$i" -eq 60 ]; then
      echo "[deploy-staging-nas] WARNUNG: Express-Health nach ~300s nicht OK (Logs prüfen)."
    else
      sleep 5
    fi
  done
fi

# Optional: Next am Host-Port (DB-Pool); STAGING_PLATFORM_PORT → Container 3001
STAGING_PORT="${STAGING_PLATFORM_PORT:-}"
if [ -z "${STAGING_PORT}" ] && [ -f "${REPO_ROOT}/.env.staging" ]; then
  STAGING_PORT="$(grep -E '^STAGING_PLATFORM_PORT=' "${REPO_ROOT}/.env.staging" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r')"
fi
STAGING_PORT="${STAGING_PORT:-13100}"
STAGING_IP="${STAGING_HEALTH_HOST:-127.0.0.1}"
if command -v curl >/dev/null 2>&1; then
  echo "[deploy-staging-nas] Health Next (Host ${STAGING_IP}:${STAGING_PORT}, optional) …"
  curl -fsS "http://${STAGING_IP}:${STAGING_PORT}/api/core/health" && echo "" || echo "[deploy-staging-nas] HINWEIS: Next-Health optional fehlgeschlagen (Express oben ist maßgeblich für CI)."
fi

echo "[deploy-staging-nas] Fertig."
