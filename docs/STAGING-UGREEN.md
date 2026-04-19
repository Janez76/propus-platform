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

### Zugriff im LAN & Prod-Datenbank spiegeln

- **Booking/Admin (Login):** [http://192.168.1.5:13100/login](http://192.168.1.5:13100/login) — Port entspricht `STAGING_PLATFORM_PORT` in `.env.staging` (Standard `13100`).
- **Postgres 1:1 von der Prod-VPS** auf dieses Staging (Kommando auf dem **NAS** im Repo-Root; `PROD_SSH` zeigt auf die **VPS**, nicht auf das NAS):
  ```bash
  PROD_SSH=root@87.106.24.107 ./scripts/restore-staging-db-from-prod.sh --from-prod-ssh
  ```
  Voraussetzung: SSH vom NAS zur VPS (z. B. öffentlicher Key auf `root@87.106.24.107`). Siehe [`scripts/restore-staging-db-from-prod.sh`](../scripts/restore-staging-db-from-prod.sh).

### Separates Staging-Admin-Passwort (Login)

Der Admin-Login (`/login` → `/api/auth/login`) prüft **`password_hash` in `core.admin_users`** (Hash-Format wie in [`booking/customer-auth.js`](../booking/customer-auth.js), Präfix `scrypt$`).

| Situation | Was gilt fürs Passwort |
| --- | --- |
| Frische Staging-DB, **`admin_users` leer** | Beim ersten Start kann [`bootstrapAdminUserFromEnvIfMissing`](../booking/db.js) einen User aus **`ADMIN_USER` / `ADMIN_PASS` / `ADMIN_EMAIL`** in `.env.staging` anlegen. |
| **Nach Restore** aus VPS-Backup ([`restore-staging-from-vps-backup.sh`](../scripts/restore-staging-from-vps-backup.sh)) oder Live-Dump | Die DB enthält die **Hashes aus Prod** — `ADMIN_PASS` in `.env.staging` **überschreibt bestehende Konten nicht**. Zum Einloggen müsstest du das **Prod-Passwort** kennen, oder ihr setzt ein **eigenes Staging-Passwort** (siehe unten). |

**Empfehlung:** Legt das gewünschte Staging-Passwort **nicht** ins Git, sondern im Passwort-Manager (Eintrag z. B. „Propus Staging LAN / js@propus.ch“). Nach jedem Restore das Passwort erneut setzen oder ein kurzes Runbook im Team teilen.

**Passwort gezielt setzen** (auf dem NAS, Platform-Container; `pg` liegt unter `/app/booking/node_modules`):

```bash
docker cp ./scripts/set-core-admin-password.js propus-staging-platform-1:/app/scripts/
docker exec -e NODE_PATH=/app/booking/node_modules propus-staging-platform-1 \
  node /app/scripts/set-core-admin-password.js "ihre@email.ch" 'IhrStagingPasswort'
```

Siehe [`scripts/set-core-admin-password.js`](../scripts/set-core-admin-password.js).

## GitHub Actions: Auto-Deploy bei Push (NAS)

Nach jedem Push auf **`master`** kann der Staging-Stack auf dem NAS automatisch gebaut und neu gestartet werden — **ohne** dass GitHub die private LAN-IP des NAS erreichen muss. Dafür läuft ein **[self-hosted Runner](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners)** direkt auf dem NAS (oder einem Rechner im gleichen LAN mit Zugriff auf dieselbe Repo-Pfad).

### Ablauf

1. Workflow [`.github/workflows/deploy-nas-staging.yml`](../.github/workflows/deploy-nas-staging.yml) startet nur auf Runnern mit Labels **`self-hosted`** + **`nas-staging`**.
2. **`actions/checkout`** holt den Code direkt von GitHub (privates Repo geht über den eingebauten `GITHUB_TOKEN` — **kein** funktionierendes `git` im Ordner `/volume1/docker/propus-staging/repo` nötig).
3. **`.env.staging`:** Entweder Secret **`NAS_ENV_FILE`** (vollständiger Inhalt) oder Kopie von **`/volume1/docker/propus-staging/repo/.env.staging`** auf dem NAS.
4. **`docker compose … up -d --build`**, danach **Health-Check im `platform`-Container** via `curl http://127.0.0.1:${PORT:-3100}/api/core/health` (Express, unabhängig vom Host-Port).
5. Markdown-/Doku-Pushes werden per `paths-ignore` **nicht** deployed.

Manuelles Deploy ohne CI weiterhin: [`scripts/deploy-staging-nas.sh`](../scripts/deploy-staging-nas.sh) (setzt voraus, dass unter `NAS_STAGING_REPO_ROOT` ein **Git-Repo** mit `origin` existiert).

### Einmalig auf dem NAS

1. **Runner installieren** (offizielle Anleitung: *Actions runner* für Linux x64), z. B. unter `/volume1/docker/propus-staging/actions-runner`.
2. Bei `./config.sh` Repository auswählen und **zusätzliches Label** `nas-staging` setzen (neben dem Standard `self-hosted`).
3. Den Prozess-Nutzer in die Gruppe **`docker`** aufnehmen (oder Runner als root betreiben — weniger empfehlenswert):
   ```bash
   sudo usermod -aG docker DER_RUNNER_USER
   ```
4. **Git-Zugriff:** Im Klon unter `/volume1/docker/propus-staging/repo` muss `git fetch`/`git pull` funktionieren (SSH-Deploy-Key oder HTTPS mit Credential / `gh auth`).
5. Optional unter **Settings → Secrets and variables → Actions → Variables**: `NAS_STAGING_REPO_ROOT`, falls der Repo-Pfad vom Default `/volume1/docker/propus-staging/repo` abweicht.
6. Optional unter **Settings → Secrets and variables → Actions → Secrets**: **`NAS_ENV_FILE`** — vollständiger Inhalt deiner NAS-Staging-Env (z. B. aus `.env.nas` / `.env.staging`, mehrzeilig). Der Workflow schreibt ihn vor dem Deploy nach `…/repo/.env.staging` (`chmod 600`). Ist das Secret **nicht** gesetzt oder leer, bleibt die bestehende `.env.staging` auf dem NAS unverändert.  
   **Health-Check:** `scripts/deploy-staging-nas.sh` liest **`STAGING_PLATFORM_PORT`** aus dieser Datei (Fallback `13100`). Öffentliche URL: `http://192.168.1.5:<STAGING_PLATFORM_PORT>/api/core/health` — bei Port **3100** also `http://192.168.1.5:3100/...`.
7. **Runner-Registrierung:** Token unter *New self-hosted runner* (ca. 1 h gültig), dann auf dem NAS in `/opt/actions-runner` als User `github-runner` ausführen: `./config.sh --url https://github.com/janez76/propus-platform --token … --name propus-nas-01 --labels nas-staging --work _work --unattended`. Danach erscheint **`svc.sh`** — `sudo ./svc.sh install github-runner`, `sudo ./svc.sh start`.
8. **Erstes Mal:** Workflow-Datei auf dem NAS — einmal `git pull` im Klon, danach übernimmt der Runner die Updates.

### Repo auf dem NAS ohne `.git` (nur manuelles `deploy-staging-nas.sh`)

Der **CI-Workflow** braucht **kein** lokales Git mehr (siehe „Ablauf“ oben). Nur wenn du weiterhin [`scripts/deploy-staging-nas.sh`](../scripts/deploy-staging-nas.sh) per SSH nutzen willst: entweder **Deploy-Key** für `github-runner` in GitHub (Public Key: `/home/github-runner/.ssh/id_ed25519.pub`) und [`scripts/nas-reclone-staging-repo.sh`](../scripts/nas-reclone-staging-repo.sh), oder dort ein funktionierendes `git pull` einrichten.

### Runner-Registrierung (ein Befehl mit Token)

Nach Erhalt des **Registrierungs-Tokens** (Actions → Runners → New self-hosted runner):

```bash
sudo bash /volume1/docker/propus-staging/repo/scripts/nas-register-actions-runner.sh '<TOKEN>'
```

(Skript liegt im Repo unter [`scripts/nas-register-actions-runner.sh`](../scripts/nas-register-actions-runner.sh); vorher Repo mit `git pull` aktualisieren oder Skript von einem Rechner nach `/tmp` kopieren.)

### Manuell (ohne CI)

```bash
cd /volume1/docker/propus-staging/repo
bash scripts/deploy-staging-nas.sh
```

Ohne `DEPLOY_GIT_SHA` macht das Skript `git pull --ff-only` statt exaktem Commit.

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

## Echte Prod-Daten ins Staging laden (Dump → Restore)

Empfohlener Weg, um mit echten Buchungs-/Kunden-Daten zu testen, **ohne** die Prod-DB zu gefährden: täglich produzierter `pg_dump` vom VPS wird über den Cron `scripts/backup-nas-pull.sh` nach `/volume1/backup/propus-platform/data/backup-*/db.sql` gespiegelt. Daraus restoren wir gezielt in die Staging-DB.

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
2. Streamt `db.sql` durch `sed` (`OWNER TO propus` / Grants → Staging-User) in `psql -U $POSTGRES_USER -d $POSTGRES_DB`
3. Optional: `--profile migrate run --rm migrate`
4. Startet `platform` neu

### Wichtig

- Der Dump enthält **echte Kunden-Mails**. Stelle sicher, dass `SMTP_HOST` auf Mailtrap/Sandbox zeigt — sonst löst Staging beim ersten Order-Status-Wechsel echte Mails aus.
- Payrexx-/Nextcloud-Vars in `.env.staging` müssen leer / Sandbox bleiben.
- **Admin-Login:** Nach Restore siehe Abschnitt **Separates Staging-Admin-Passwort** oben — `ADMIN_PASS` ersetzt keine bestehenden Hashes.

## Smoke-Tests

```bash
# Platform Health
curl -fsS http://192.168.1.5:13100/api/core/health
# erwartet: {"ok":true,...}

# Website
curl -fsSI http://192.168.1.5:14343/ | head -1
# erwartet: HTTP/1.1 200 OK
```

Vom Browser im LAN: `http://192.168.1.5:13100/login` (Booking/Admin-Login), `http://192.168.1.5:14343` (Website).

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
- `ports:` werden mit Staging-Ports auf `0.0.0.0` gebunden (optional steuerbar über `STAGING_*_BIND`)
- `SESSION_COOKIE_SECURE` wird für HTTP-LAN auf `false` gesetzt
- Nextcloud-Variablen werden für Staging geleert, damit nicht die Compose-Defaults (URL/Pfad) greifen

Alles andere (Volume-Pfade, Credentials, URLs) fließt über `.env.staging` per Variable-Substitution — die Defaults in `docker-compose.vps.yml` (`${BOOKING_UPLOAD_STAGING_HOST_PATH:-/opt/…}`) erlauben genau das.
