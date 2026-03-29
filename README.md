# Propus Platform

Die **Propus Platform** bündelt **Buchungstool** und **Tour Manager** in **einer Codebasis**: gemeinsame Kundendaten, zentrale Anmeldung über **Logto** und **eine PostgreSQL-Datenbank**.

## Architektur

```
propus-platform/
├── core/           # Gemeinsame Migrationen, Migration Runner, Seed-Daten
├── platform/       # Zentraler Einstieg (server.js): Booking + Tours, ein Port
├── booking/        # Backend Buchungstool (Express)
├── tours/          # Tour Manager (Express/EJS), unter /tour-manager gemountet
├── auth/           # Logto-Middleware
├── infra/          # Hilfsskripte (z. B. Logto)
├── docs/           # Zusätzliche Dokumentation
└── docker-compose.yml
```

**Hinweis:** Wo sich nutzer- und admin-sichtbare Texte pflegen lassen, steht in [docs/PLATTFORM-TEXTE-UND-ARCHITEKTUR.md](docs/PLATTFORM-TEXTE-UND-ARCHITEKTUR.md).

### Datenbank-Schemas

| Schema          | Inhalt |
|-----------------|--------|
| `core`          | Gemeinsam: Kunden, Kontakte, Firmen, Auth-Bezüge |
| `booking`       | Aufträge, Fotografen, Produkte, Preise |
| `tour_manager`  | Touren, Rechnungen, Portalnutzer, Vorschläge |

Alle Module nutzen dieselbe Datenbank (`propus`) und setzen `search_path`, damit unqualifizierte SQL-Abfragen im richtigen Schema landen.

## Schnellstart (Docker, lokal)

Voraussetzung: [Docker Compose v2](https://docs.docker.com/compose/) im Projektroot (`propus-platform/`).

```bash
# 1. Umgebung anlegen und anpassen
cp .env.example .env
# Optional: .env.logto aus .env.logto.example (echte Logto-App-IDs für produktionsnahe SSO-Tests)

# 2. Datenbanken + Logto starten
docker compose up -d postgres logto-db logto

# 3. SQL-Migrationen (Service „migrate“ ist nur mit Profil aktiv)
docker compose --profile migrate run --rm migrate

# 4. Zentrale Plattform (Booking + Tour Manager, ein Prozess)
docker compose up -d platform
```

**Standard-Hostports** (über Variablen in `.env` änderbar, siehe `docker-compose.yml`):

| Dienst | Host (Default) | Hinweis |
|--------|----------------|---------|
| Plattform (SPA, API, Tour Manager) | [http://localhost:3100](http://localhost:3100) | `BOOKING_PORT`, Container lauscht intern auf 3000 |
| Tour Manager (EJS) | [http://localhost:3100/tour-manager/admin](http://localhost:3100/tour-manager/admin) | gleicher Container wie Plattform |
| Logto (OIDC / App-Endpunkt) | [http://localhost:3301](http://localhost:3301) | `LOGTO_PORT`; in `.env` typisch `LOGTO_ENDPOINT=http://localhost:3301` für Redirects vom Browser |
| Logto Admin Console | [http://localhost:3002](http://localhost:3002) oder [http://localhost:3302](http://localhost:3302) | beide mappen auf Port 3002 im Container |
| PostgreSQL (Propus) | `localhost:5435` | `PROPUS_PG_PORT` |

**Optional:** getrennte Legacy-Container statt gebündelter Plattform:

```bash
docker compose --profile legacy-services up -d booking tours
```

## Migrationen

Alle SQL-Migrationen liegen unter `core/migrations/` und werden von `core/migrate.js` in Reihenfolge ausgeführt:

```bash
docker compose --profile migrate run --rm migrate
```

## Weiterarbeit auf einem anderen Rechner

1. Repository klonen oder Ordner kopieren (Netzlaufwerk: bei Git ggf. `git config --global --add safe.directory "Z:/propus-platform"`).
2. `.env` aus `.env.example` erzeugen und anpassen.
3. `.env.logto` aus `.env.logto.example` anlegen und echte Logto-App-IDs und -Secrets eintragen (oder die Datei vom bisherigen Rechner **sicher** übernehmen – **nicht** ins Repository committen).
4. `docker compose up -d postgres logto-db logto` → `docker compose --profile migrate run --rm migrate` → `docker compose up -d platform`.
5. Kurztest: `http://localhost:3100` (SPA), in den Einstellungen z. B. **Interne Verwaltung** / **Firmenverwaltung**.

**Hinweis:** `core/dumps/` (SQL-Dumps) und `.env.logto` sind per `.gitignore` ausgeschlossen.
