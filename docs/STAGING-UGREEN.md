# LAN-Staging auf UGREEN NAS

Dieses Dokument beschreibt, wie du den Prod-Stack zusätzlich auf dem UGREEN NAS (`192.168.1.5`) als LAN-Testumgebung fährst — mit eigenen Daten, Ports und Secrets, ohne die VPS-Produktion zu berühren.

> **Prod bleibt auf dem VPS.** Dieses Staging ist nur zum Testen *vor* dem Live-Deploy. Der VPS-Workflow (`.github/workflows/deploy-vps-and-booking-smoke.yml`) wird nicht verändert.

## Übersicht

- **Host:** UGREEN NAS, Debian 12 Bookworm, Docker 26.1.0, Compose v2.26.1
- **Compose-Projektname:** `propus-staging` (Isolation von Volumes/Netzwerk)
- **Compose-Dateien:** `docker-compose.vps.yml` (Basis) + [`docker-compose.staging.nas.yml`](../docker-compose.staging.nas.yml) (Override)
- **Env-Datei:** `.env.staging` (nicht im Git; Vorlage [`.env.staging.example`](../.env.staging.example))
- **Ports (Defaults):** Platform `13100`, Website `14343`; Postgres intern (Docker-Netz), Host-Bind nur `127.0.0.1:${PROPUS_PG_PORT}` (Standard in Basis-Compose: `55435` in der Staging-Vorlage)
- **Upload-Wurzel:** `/volume1/docker/propus-staging/`

## Einmaliges Setup auf dem NAS

### 1. Repo-Klon

```bash
sudo install -d -o $(id -u) -g $(id -g) /volume1/docker/propus-staging
cd /volume1/docker/propus-staging
git clone https://github.com/janez76/propus-platform.git repo
cd repo
git checkout main   # oder ein Feature-Branch zum Testen
```

### 2. Host-Verzeichnisse für Uploads

```bash
sudo install -d -o 1000 -g 1000 \
  /volume1/docker/propus-staging/uploads/staging \
  /volume1/docker/propus-staging/uploads/customer \
  /volume1/docker/propus-staging/uploads/raw
```

Die Pfade entsprechen den Volume-Mounts in `docker-compose.vps.yml:148–150` (Substitution via `BOOKING_UPLOAD_*_HOST_PATH` in `.env.staging`).

### 3. `.env.staging` anlegen

```bash
cp .env.staging.example .env.staging
chmod 600 .env.staging
# Editor öffnen und alle CHANGE_ME-Werte, SMTP-Zugänge,
# WEBSITE_SUPABASE_* und Admin-Credentials setzen.
```

### 4. Port-Kollisionen prüfen

```bash
ss -tlnp | grep -E ':(13100|14343|55435)' && echo "PORT BELEGT — andere in .env.staging wählen" || echo "OK"
```

Bereits belegte Ports auf dem NAS (Stand: `ss -tlnp`-Diagnose): u. a. `22`, `80`, `443`, `3001`, `3010`, `8090`, `8095`, `9443`, `9998`. Bei Konflikt `STAGING_PLATFORM_PORT` / `STAGING_WEBSITE_PORT` bzw. `PROPUS_PG_PORT` in `.env.staging` auf freie Werte setzen.

## Start

Alle Compose-Kommandos müssen beide Dateien übergeben und das Staging-Projekt verwenden.

### Migrations (einmalig pro Schema-Änderung)

```bash
docker compose -p propus-staging \
  -f docker-compose.vps.yml \
  -f docker-compose.staging.nas.yml \
  --env-file .env.staging \
  --profile migrate run --rm migrate
```

### Stack hochfahren

```bash
docker compose -p propus-staging \
  -f docker-compose.vps.yml \
  -f docker-compose.staging.nas.yml \
  --env-file .env.staging \
  up -d --build
```

### Logs / Status

```bash
docker compose -p propus-staging \
  -f docker-compose.vps.yml \
  -f docker-compose.staging.nas.yml \
  --env-file .env.staging \
  ps

docker compose -p propus-staging \
  -f docker-compose.vps.yml \
  -f docker-compose.staging.nas.yml \
  --env-file .env.staging \
  logs -f platform
```

### Stoppen

```bash
docker compose -p propus-staging \
  -f docker-compose.vps.yml \
  -f docker-compose.staging.nas.yml \
  --env-file .env.staging \
  down
```

Zum kompletten Zurücksetzen (Volumes löschen → frischer DB-Stand):

```bash
docker compose -p propus-staging \
  -f docker-compose.vps.yml \
  -f docker-compose.staging.nas.yml \
  --env-file .env.staging \
  down -v
```

## Smoke-Tests

```bash
# Platform Health
curl -fsS http://192.168.1.5:13100/api/core/health
# erwartet: {"ok":true,...}

# Website
curl -fsSI http://192.168.1.5:14343/ | head -1
# erwartet: HTTP/1.1 200 OK
```

Vom Browser im LAN: `http://192.168.1.5:13100` (Booking/Admin), `http://192.168.1.5:14343` (Website).

## Checkliste vor VPS-Deploy (Merge nach `main`)

- [ ] Stack lief auf Staging ohne Fehler in Logs (`docker compose ... logs platform | grep -Ei "error|fatal"` leer)
- [ ] Migrate-Lauf grün
- [ ] Smoke-Tests (oben) grün
- [ ] Admin-Login / Kunden-Flow / Upload / Mail-Versand an Mailtrap manuell geprüft
- [ ] Keine Änderungen an `docker-compose.vps.yml`, `.env.vps.example` oder Prod-Workflow nötig
- [ ] PR erstellt, Reviewer zugewiesen

## Unterschiede zu Prod (dokumentiert)

| Aspekt | Prod (VPS) | Staging (NAS) |
|---|---|---|
| Compose-Projekt | `propus-platform` | `propus-staging` |
| Env-Datei | `.env.vps` + `.env.vps.secrets` | `.env.staging` + `.env.staging.secrets` |
| Port-Bind | `127.0.0.1` | `0.0.0.0` (LAN) |
| Platform-Port | 3100 | 13100 |
| Website-Port | 4343 | 14343 |
| URL vor dem Stack | Cloudflare + Nginx → HTTPS | direkt HTTP im LAN |
| `SESSION_COOKIE_SECURE` | `true` | `false` (HTTP-LAN) |
| Upload-Pfade | `/opt/…`, `/mnt/propus-nas-*` | `/volume1/docker/propus-staging/uploads/*` |
| SMTP | echte Propus-Mailbox | Mailtrap / Sandbox |
| Payrexx | Live-Instanz | Sandbox / leer |
| Nextcloud | `https://cloud.propus.ch` | aus (leere Variablen + Override in `docker-compose.staging.nas.yml`) |

## Wartung

- **Docker-Aufräumen** (NAS hat viele ungenutzte Images):
  ```bash
  docker image prune -a --filter "until=168h"
  ```
- **DB-Shell:**
  ```bash
  docker exec -it propus-staging-postgres-1 psql -U propus_staging -d propus_staging
  ```
- **Postgres-Port vom LAN erreichbar machen** (falls DB-Debug nötig): in [`docker-compose.staging.nas.yml`](../docker-compose.staging.nas.yml) beim Service `postgres` einen `ports`-Block mit `!override` ergänzen und z. B. auf `0.0.0.0:55435:5432` mappen (und Kollisionen mit `PROPUS_PG_PORT` vermeiden).

## Warum ein Override statt zweiter Compose-Datei

Die Prod-Datei `docker-compose.vps.yml` ist die **einzige fachliche Wahrheit** für den Stack. Ein zweites, dupliziertes Compose-File würde bei jeder Änderung (neuer Service, neues Env-Var, neue Volume) doppelt gepflegt — Drift garantiert. Das Override-File enthält nur, was sich zwingend unterscheiden muss:

- `env_file: !override` (Compose ≥ 2.20) ersetzt bei **platform** die Prod-Env-Dateien komplett (`.env.vps` / Secrets)
- **website:** nur `ports: !override` — die Variablen wie in Prod über `docker compose --env-file .env.staging` zur Substitution der bestehenden `environment`-Keys in `docker-compose.vps.yml` (sonst würde `env_file` unnötig alle Keys aus `.env.staging` in den Website-Container injizieren)
- `ports:` werden mit Staging-Ports auf `0.0.0.0` gebunden
- `SESSION_COOKIE_SECURE` wird für HTTP-LAN auf `false` gesetzt
- Nextcloud-Variablen werden für Staging geleert, damit nicht die Compose-Defaults (URL/Pfad) greifen

Alles andere (Volume-Pfade, Credentials, URLs) fließt über `.env.staging` per Variable-Substitution — die Defaults in `docker-compose.vps.yml` (`${BOOKING_UPLOAD_STAGING_HOST_PATH:-/opt/…}`) erlauben genau das.
