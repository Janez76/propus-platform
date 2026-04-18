# Buchungstool

Zentrales Repository fuer das Backend und die Betriebsdokumentation.

## Operations Quicklinks

- Mail-Versand Betrieb und Incident-Ablauf: `docs/MAIL_OPERATIONS_CHECKLIST.md`
- Logging-Konzept und Umgebungsvariablen: `docs/LOGGING.md`
- Grafana/Loki Monitoring-Setup: `docs/MONITORING_GRAFANA_LOKI.md`
- Projektstruktur und wichtige Hinweise: `docs/PROJEKT_STRUKTUR_HINWEISE.md`
- Live-Setup Checklisten: `docs/LIVE_SETUP_PRICING_SCHEDULING_CHECKLIST.md`

## Lokal mit Docker

- **Gesamt-Stack (Postgres + Backend + Buchungsseite):** aus dem Repo-Root:

  ```bash
  docker compose -f docker-compose.desktop.yml up --build
  ```

  - Buchungsseite: **http://localhost:8090**
  - API (direkt): **http://localhost:3001**
  - Postgres: **localhost:5432** (`propus` / `propus` / `buchungstool`)

  Optional: `SESSION_SECRET`, `BUCHUNGSTOOL_DESKTOP_ADMIN_USER`, `BUCHUNGSTOOL_DESKTOP_ADMIN_PASS` (siehe `docker-compose.desktop.yml`) oder `docker compose --env-file .env.docker ...` mit Vorlage `.env.docker.example`. **Nicht** die allgemeine Windows-Variable `ADMIN_PASS` verwenden — Docker Compose wuerde sie sonst statt `localdev12` einsetzen. Ohne eigene Graph-App sind `MS_GRAPH_*` als **lokale Platzhalter** gesetzt (`MAIL_PREFER_GRAPH=false`).

  **Admin-Login (lokal):** Benutzer **`admin`**, Passwort **`localdev12`** bei frischer lokaler DB. `BUCHUNGSTOOL_DESKTOP_ADMIN_PASS` wird nur fuer die erstmalige Anlage in `admin_users` verwendet. Bestehende Passwoerter bitte direkt in `admin_users` oder ueber das interne Admin-Tool aendern.

  Unter Windows kannst du auch `powershell -File scripts/docker-desktop-up.ps1` ausführen (sucht `docker.exe` typischer Installationspfade). Der Compose-Projektname ist **`buchungstool-desktop`** (Volumes/Container sind darunter gruppiert).

### Import von der VPS-Produktion in Docker Desktop

Voraussetzungen: `.env` im Repo-Root mit `VPS_IP`, `VPS_USER`, ggf. `VPS_SSH_PW` (PuTTY) oder `VPS_USE_OPENSSH=1` mit SSH-Key; optional `VPS_PROJECT_ROOT`, `VPS_COMPOSE_PROJECT`, `VPS_ENV_FILE` wie bei `deploy-prod.ps1`.

```powershell
# Nur Datenbank (VPS pg_dump → lokale Postgres-Volume)
.\scripts\import-vps-to-desktop.ps1 -Confirm

# Code + DB + orders.json + photographers/discount/version (Root)
.\scripts\import-vps-to-desktop.ps1 -Confirm -IncludeCode -IncludeOrders -IncludeBookingFiles
```

Hinweise: NAS-Upload-Pfade der VPS existieren lokal nicht; der Desktop-Stack nutzt bereits `BOOKING_UPLOAD_REQUIRE_MOUNT=false`. **Admin-Passwort:** `BUCHUNGSTOOL_DESKTOP_ADMIN_PASS` greift nur bei der erstmaligen Anlage des Kontos. Bei importierter oder bestehender DB bleibt das Passwort unveraendert und muss direkt in `admin_users` oder ueber das interne Admin-Tool geaendert werden.

- **Nur PostgreSQL:** `docker compose -f docker-compose.local.yml up -d postgres` startet Postgres auf **Port 5432**. Backend und Admin startest du danach auf dem Host; im Ordner `backend` in der `.env` z. B. `DATABASE_URL=postgresql://propus:propus@127.0.0.1:5432/buchungstool` setzen.

- **Hinweis:** Die Datei `docker-compose.yml` im Repo-Root ist für die NAS-/Produktionspfade (`/volume1/...`) ausgelegt und auf einem normalen Entwicklungsrechner in der Regel **nicht** ohne Anpassung lauffähig.
