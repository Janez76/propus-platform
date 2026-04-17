# Propus Platform

Die **Propus Platform** bündelt **Buchungstool**, **Tour Manager** und **Firmenhomepage** in **einer Codebasis**: gemeinsame Kundendaten, zentrale Anmeldung über **Logto** und **eine PostgreSQL-Datenbank**.

## Architektur

```
propus-platform/
├── app/            # Next.js 16 App (React 19, TypeScript, Tailwind v4) – primäres Admin-Frontend
├── platform/       # Zentraler Server (server.js): Booking + Tours, ein Port (3100)
│   └── frontend/   # Vite/React-SPA (Admin + Buchungs-Wizard, wird von platform ausgeliefert)
├── booking/        # Backend Buchungstool (Express) – API, RBAC, E-Mail, Kalender
│   └── admin-panel/# Vite/React-SPA (separates Booking-Admin-Panel)
├── tours/          # Tour Manager (Express), unter /tour-manager gemountet
├── core/           # Gemeinsame Migrationen, Migration Runner, Seed-Daten
├── auth/           # Logto-Middleware (OIDC-Callbacks, Session)
├── website/        # Firmenhomepage (Astro + Supabase)
├── infra/          # Hilfsskripte (Logto-Setup)
├── scripts/        # Deploy-, Backup- und Utility-Skripte
├── docs/           # Zusätzliche Dokumentation
├── docker-compose.yml          # Lokale Entwicklungsumgebung
└── docker-compose.vps.yml      # Produktions-Deploy (VPS)
```

**Hinweis:** Wo sich nutzer- und admin-sichtbare Texte pflegen lassen, steht in [docs/PLATTFORM-TEXTE-UND-ARCHITEKTUR.md](docs/PLATTFORM-TEXTE-UND-ARCHITEKTUR.md).

### Datenbank-Schemas

| Schema         | Inhalt                                             |
|----------------|----------------------------------------------------|
| `core`         | Gemeinsam: Kunden, Kontakte, Firmen, Auth-Bezüge   |
| `booking`      | Aufträge, Fotografen, Produkte, Preise, RBAC       |
| `tour_manager` | Touren, Rechnungen, Portalnutzer, Vorschläge       |

Alle Module nutzen dieselbe Datenbank (`propus`) und setzen `search_path`, damit unqualifizierte SQL-Abfragen im richtigen Schema landen.

### Frontend-Übersicht

| Paket                  | Tech-Stack                          | Zweck                                                             |
|------------------------|-------------------------------------|-------------------------------------------------------------------|
| `app/`                 | Next.js 16, React 19, Tailwind v4   | Primäres Admin-Frontend (Kunden, Aufträge, Kalender, Exxas, …)   |
| `booking/admin-panel/` | Vite, React, TypeScript             | _deprecated_ — siehe [`booking/admin-panel/DEPRECATED.md`](booking/admin-panel/DEPRECATED.md) |
| `website/`             | Astro + Supabase                    | Öffentliche Firmenhomepage mit Produkt-Katalog-API               |

---

## Schnellstart (Docker, lokal)

Voraussetzung: [Docker Compose v2](https://docs.docker.com/compose/) im Projektroot.

```bash
# 1. Umgebung anlegen und anpassen
cp .env.example .env
# Optional: .env.logto aus .env.logto.example (echte Logto-App-IDs für SSO-Tests)

# 2. Datenbank + Logto starten
docker compose up -d postgres logto-db logto

# 3. SQL-Migrationen ausführen
docker compose --profile migrate run --rm migrate

# 4. Zentrale Plattform (Booking + Tour Manager, ein Prozess)
docker compose up -d platform
```

**Standard-Hostports** (über Variablen in `.env` änderbar):

| Dienst                         | Host (Default)                                                  | Hinweis                                        |
|--------------------------------|-----------------------------------------------------------------|------------------------------------------------|
| Plattform (SPA, API, Tour Mgr) | [http://localhost:3100](http://localhost:3100)                   | `BOOKING_PORT`; Container intern auf 3000      |
| Tour Manager (EJS)             | [http://localhost:3100/tour-manager/admin](http://localhost:3100/tour-manager/admin) | gleicher Container          |
| Health-Check                   | `http://localhost:3100/api/core/health`                         | Prüft DB-Verbindung                            |
| Logto (OIDC)                   | [http://localhost:3301](http://localhost:3301)                   | `LOGTO_PORT`                                   |
| Logto Admin Console            | [http://localhost:3302](http://localhost:3302)                   | mapped auf Container-Port 3002                 |
| PostgreSQL (Propus)            | `localhost:5435`                                                | `PROPUS_PG_PORT`                               |

**Next.js App lokal starten** (separater Dev-Server, zeigt auf `platform`-API):

```bash
cd app
npm install
npm run dev   # http://localhost:3000
```

**Optional:** Legacy-Container separat:

```bash
docker compose --profile legacy-services up -d booking tours
```

---

## Migrationen

Alle SQL-Migrationen liegen unter `core/migrations/` (gemeinsame Schemas) und `booking/migrations/` (Booking-spezifisch). Der Runner `core/migrate.js` führt sie in Reihenfolge aus:

```bash
docker compose --profile migrate run --rm migrate
```

Der Runner wendet nur noch nicht in `core.applied_migrations` eingetragene `*.sql`-Dateien an (alphabetische Reihenfolge). **Booking**-Migrationen laufen separat über `booking/migrations/` (siehe Booking-Doku).

**Hinweis Finanzen / Rechnungen (2026):** `036_renewal_invoices_payment_fields.sql` ergänzt `tour_manager.renewal_invoices` um `paid_at_date`, `payment_channel`, `skonto_chf`, `writeoff` (im Admin: «Betreibung eingeleitet»), `writeoff_reason`. Nach Deploy läuft die Migration automatisch mit, sofern der VPS-Deploy den Schritt `docker compose … --profile migrate run --rm migrate` ausführt (siehe `scripts/deploy-remote.sh`). Manuell auf dem Server dasselbe Kommando mit gültiger `DATABASE_URL` in `.env.vps`.

---

## Deploy (VPS)

**VPS:** `87.106.24.107` | **Projektpfad:** `/opt/propus-platform` | **Port:** `3100`

### Schnell-Deploy (empfohlen, lokal)

```powershell
.\scripts\deploy-vps.ps1 -VpsHost 87.106.24.107 -User root -SkipBackup -SkipSwitch -SkipCloudflarePurge
```

Bei blockierter PowerShell-Execution-Policy:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\deploy-vps.ps1" -VpsHost 87.106.24.107 -User root -SkipBackup -SkipSwitch -SkipCloudflarePurge
```

`deploy-vps.ps1` packt den Code als `tar.gz`, lädt ihn hoch, baut `migrate` und `platform` neu und führt den Health-Check aus.

### GitHub Actions CI/CD

Automatischer Deploy nach **Push auf `master`** (Workflow: `.github/workflows/deploy-vps-and-booking-smoke.yml`):

1. **Build Next.js** – Type-Check + Build der `app/`
2. **Deploy to VPS** – Upload + Docker-Build + Migrationen + Health-Check + Cloudflare-Purge
3. **Smoke Tests** – Nur bei manuellem Trigger (`run_smoke`)

| Auslöser        | Jobs                                  |
|-----------------|---------------------------------------|
| Push auf master | Build Next.js → Deploy (automatisch)  |
| Manuell         | Build Next.js → Deploy + ggf. Smoke   |

Details und Secrets-Setup: [docs/BOOKING-E2E-DEPLOY.md](docs/BOOKING-E2E-DEPLOY.md)

### Cloudflare-Hostnames

Alle drei zeigen auf `http://127.0.0.1:3100`:

| Hostname                    | Zweck                             |
|-----------------------------|-----------------------------------|
| `booking.propus.ch`         | Öffentlicher Buchungs-Wizard      |
| `admin-booking.propus.ch`   | Admin-SPA                         |
| `api-booking.propus.ch`     | API + Auth-Endpunkte              |

### Logs & Health auf dem VPS

```powershell
# Health-Check
ssh -i "C:\Users\svajc\.ssh\id_ed25519_propus_vps" -o IdentitiesOnly=yes root@87.106.24.107 `
  "curl -fsS http://127.0.0.1:3100/api/core/health"

# Logs (live)
ssh -i "C:\Users\svajc\.ssh\id_ed25519_propus_vps" -o IdentitiesOnly=yes root@87.106.24.107 `
  "docker logs propus-platform-platform-1 --tail 100 -f"
```

### Versionierung

Vor jedem Deploy die Build-Nummer in `scripts/bump-deploy-version.ps1` erhöhen. Nicht mit derselben Nummer erneut deployen.

---

## Logto (SSO)

| Eigenschaft         | Wert                                                     |
|---------------------|----------------------------------------------------------|
| Admin Console       | `https://auth-admin.propus.ch/console`                   |
| Branding anwenden   | `node auth/apply-logto-propus-branding.js`               |

Detaillierte Logto-Konfiguration: [docs/VPS-BETRIEB.md](docs/VPS-BETRIEB.md)

---

## Weiterarbeit auf einem anderen Rechner

1. Repository klonen (bei Netzlaufwerk ggf. `git config --global --add safe.directory "Z:/propus-platform"`).
2. `.env` aus `.env.example` erzeugen und anpassen.
3. `.env.logto` aus `.env.logto.example` anlegen und Logto-App-IDs/Secrets eintragen (oder sicher vom bisherigen Rechner übernehmen – **nicht** committen).
4. `docker compose up -d postgres logto-db logto` → `docker compose --profile migrate run --rm migrate` → `docker compose up -d platform`.
5. Kurztest: `http://localhost:3100` (SPA) und `http://localhost:3100/api/core/health`.

**Hinweis:** `core/dumps/` (SQL-Dumps) und `.env.logto` sind per `.gitignore` ausgeschlossen.

---

## Weitere Dokumentation

| Datei                                                         | Inhalt                                               |
|---------------------------------------------------------------|------------------------------------------------------|
| [docs/FLOWS_AUTH.md](docs/FLOWS_AUTH.md)                     | Auth-Flows: Unified Login, Session-Bridge, Magic-Link, Passwort-Reset |
| [docs/FLOWS_BOOKING.md](docs/FLOWS_BOOKING.md)               | Buchungs-Flows, Status-Übergänge, Kalender-Sync      |
| [docs/FLOWS_TOURS.md](docs/FLOWS_TOURS.md)                   | Tour-Manager-Flows, Matterport, Portal, Cleanup      |
| [docs/ROLES_PERMISSIONS.md](docs/ROLES_PERMISSIONS.md)       | RBAC, Rollen, Permissions, Logto-Mapping             |
| [docs/VPS-BETRIEB.md](docs/VPS-BETRIEB.md)                   | VPS-Setup, Logto-Branding, Backup/Restore            |
| [docs/BOOKING-E2E-DEPLOY.md](docs/BOOKING-E2E-DEPLOY.md)     | GitHub Actions Secrets, Playwright Smoke Tests       |
| [docs/FIRMENHOMEPAGE-KATALOG-API.md](docs/FIRMENHOMEPAGE-KATALOG-API.md) | Website-Katalog-API                     |
| [docs/ADMIN-FRONTEND-DESIGN.md](docs/ADMIN-FRONTEND-DESIGN.md) | Design-System, Theme, Komponenten                  |
| [docs/PLATTFORM-TEXTE-UND-ARCHITEKTUR.md](docs/PLATTFORM-TEXTE-UND-ARCHITEKTUR.md) | Texte und Seiten-Architektur  |
