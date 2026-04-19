# LAN-Staging auf UGREEN NAS

Dieses Dokument beschreibt, wie du den Prod-Stack zusätzlich auf dem UGREEN NAS (`192.168.1.5`) als LAN-Testumgebung fährst — mit eigenen Daten, Ports und Secrets, ohne die VPS-Produktion zu berühren.

> **Prod bleibt auf dem VPS.** Dieses Staging ist nur zum Testen *vor* dem Live-Deploy. Der VPS-Workflow (`.github/workflows/deploy-vps-and-booking-smoke.yml`) wird nicht verändert.

## Übersicht

- **Host:** UGREEN NAS, Debian 12 Bookworm, Docker 26.1.0, Compose v2.26.1
- **Compose-Projektname:** `propus-staging` (Isolation von Volumes/Netzwerk)
- **Compose-Dateien:** `docker-compose.vps.yml` (Basis) + `docker-compose.staging.nas.yml` (Override)
- **Env-Datei:** `.env.staging` (nicht im Git; Vorlage `.env.staging.example`)
- **Ports (Defaults):** Platform `13100`, Website `14343`; Postgres intern (Docker-Netz), optional publizierbar
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

Die Pfade entsprechen den Volume-Mounts in `docker-compose.vps.yml:148–150` (substitution via `BOOKING_UPLOAD_*_HOST_PATH` in `.env.staging`).

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

Bereits belegte Ports auf dem NAS (Stand: `ss -tlnp`-Diagnose): u. a. `22`, `80`, `443`, `3001`, `3010`, `8090`, `8095`, `9443`, `9998`. Bei Konflikt `STAGING_PLATFORM_PORT` / `STAGING_WEBSITE_PORT` in `.env.staging` auf freie Werte setzen.

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

## Echte Prod-Daten ins Staging laden (Dump → Restore)

Empfohlener Weg, um mit echten Buchungs-/Kunden-Daten zu testen, **ohne** die Prod-DB zu gefährden: täglich produzierter `pg_dump` vom VPS wird über den bestehenden Cron `scripts/backup-nas-pull.sh` nach `/volume1/backup/propus-platform/data/backup-*/db.sql` gespiegelt. Daraus restoren wir gezielt in die Staging-DB.

> Voraussetzung: der NAS-Cron für `backup-nas-pull.sh` läuft (siehe Header dieses Scripts). Prüfen mit `ls -lt /volume1/backup/propus-platform/data | head`.

### Restore-Befehl

```bash
# Aus dem Repo-Root auf dem NAS:
./scripts/restore-staging-from-vps-backup.sh
# → nimmt den lexikalisch jüngsten Backup-Ordner unter
#   /volume1/backup/propus-platform/data/

# Bestimmten Stand wählen:
./scripts/restore-staging-from-vps-backup.sh backup-20260418-020014

# Ohne Rückfrage (für Cron / Skripte):
STAGING_RESTORE_YES=1 ./scripts/restore-staging-from-vps-backup.sh

# Nach dem Restore Migrations ausführen (falls Staging-Branch neuer ist):
STAGING_RESTORE_YES=1 STAGING_RESTORE_RUN_MIGRATE=1 \
  ./scripts/restore-staging-from-vps-backup.sh
```

### Was das Script tut

1. Stoppt den `platform`-Container (verhindert Schreibkollisionen)
2. Streamt `db.sql` durch `sed` (`OWNER TO propus` / `GRANT ... TO propus` → Staging-User) in `psql -U $POSTGRES_USER -d $POSTGRES_DB`
3. Optional: `--profile migrate run --rm migrate`
4. Startet `platform` neu

### Wichtig

- Der Dump enthält **echte Kunden-Mails**. Stelle sicher, dass `SMTP_HOST=sandbox.smtp.mailtrap.io` (oder vergleichbar) in `.env.staging` gesetzt ist — sonst löst Staging beim ersten Order-Status-Wechsel echte Mails aus.
- Payrexx-/Nextcloud-Vars in `.env.staging` müssen leer / Sandbox bleiben.
- `BOOKING_UPLOAD_*_HOST_PATH` zeigt auf eigene Staging-Verzeichnisse — Datei-Pfade in der DB können auf das echte `/mnt/propus-nas-customers/...` zeigen, das auf dem NAS nicht existiert. Erwartetes Verhalten: Vorschauen 404, Listing funktioniert.

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
| Nextcloud | `https://cloud.propus.ch` | leer (Feature aus) |

## Wartung

- **Docker-Aufräumen** (NAS hat viele ungenutzte Images):
  ```bash
  docker image prune -a --filter "until=168h"
  ```
- **DB-Shell:**
  ```bash
  docker exec -it propus-staging-postgres-1 psql -U propus_staging -d propus_staging
  ```
- **Postgres-Port vom LAN erreichbar machen** (falls DB-Debug nötig): in `docker-compose.staging.nas.yml` bei `postgres` einen `ports: !override`-Eintrag ergänzen und auf `0.0.0.0:55435:5432` mappen.

## Warum ein Override statt zweiter Compose-Datei

Die Prod-Datei `docker-compose.vps.yml` ist die **einzige fachliche Wahrheit** für den Stack. Ein zweites, dupliziertes Compose-File würde bei jeder Änderung (neuer Service, neues Env-Var, neue Volume) doppelt gepflegt — Drift garantiert. Das Override-File enthält nur, was sich zwingend unterscheiden muss:

- `env_file: !override` (Compose ≥ 2.20) ersetzt die Prod-Env-Dateien komplett
- `ports:` werden mit Staging-Ports auf `0.0.0.0` gebunden
- `SESSION_COOKIE_SECURE` wird für HTTP-LAN auf `false` gesetzt

Alles andere (Volume-Pfade, Credentials, URLs) fließt über `.env.staging` per Variable-Substitution — die Defaults in `docker-compose.vps.yml` (`${BOOKING_UPLOAD_STAGING_HOST_PATH:-/opt/…}`) erlauben genau das.
