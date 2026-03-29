# Propus Platform

Unified platform combining the **Booking Tool** and **Tour Manager** into a single
codebase with shared customer data, centralized authentication (Logto), and a
common PostgreSQL instance.

## Architecture

```
propus-platform/
├── core/           # Shared migrations, migration runner, seed data
├── platform/       # Zentraler Entry (server.js): Booking + Tours, ein Port
├── booking/        # Buchungstool Backend (Express) – weiterhin Quellcode
├── tours/          # Tour Manager (Express/EJS) – wird unter /tour-manager gemountet
├── auth/           # Logto-Middleware
├── infra/          # Hilfsskripte (z. B. Logto)
├── docs/           # Architecture docs
└── docker-compose.yml
```

### Database Schema Layout

| Schema         | Purpose                                      |
|---------------|----------------------------------------------|
| `core`        | Shared: customers, contacts, companies, auth |
| `booking`     | Orders, photographers, products, pricing     |
| `tour_manager`| Tours, invoices, portal users, suggestions   |

Each module connects to the same PostgreSQL database (`propus`) and sets
`search_path` so unqualified queries resolve correctly.

## Quick Start (Local Docker)

```bash
# 1. Copy and edit environment
cp .env.example .env

# 2. Start infrastructure
docker compose up -d postgres logto-db logto

# 3. Run migrations
docker compose run --rm migrate

# 4. Zentrale Plattform (Booking + Tour Manager, ein Container)
docker compose up -d platform

# 5. Zugriff
#    SPA (Admin + neue Routen /book, /account, …): http://localhost:3100
#    Tour Manager (EJS):  http://localhost:3100/tour-manager/admin
#    Logto Admin:         http://localhost:3002  (auch :3302 gemappt)
#
# Optional: getrennte Legacy-Container (Profil legacy-services)
# docker compose --profile legacy-services up -d booking tours
```

## Migrations

All SQL migrations live in `core/migrations/` and are executed in order by
`core/migrate.js`. Run them with:

```bash
docker compose run --rm migrate
```

## Weiterarbeit auf einem anderen PC

1. Repository klonen oder Ordner kopieren (Netzlaufwerk: bei Git ggf. `git config --global --add safe.directory "Z:/propus-platform"`).
2. `.env` aus `.env.example` anlegen und anpassen.
3. `.env.logto` aus `.env.logto.example` anlegen und echte Logto-App-IDs/Secrets eintragen (oder Datei vom alten Rechner **sicher** übernehmen – nicht ins Git committen).
4. `docker compose up -d postgres logto-db logto` → `docker compose run --rm migrate` → `docker compose up -d platform`.
5. Test: `http://localhost:3100` (SPA), Einstellungen → **Interne Verwaltung** / **Firmenverwaltung**.

**Hinweis:** `core/dumps/` (SQL-Dumps) und `.env.logto` sind per `.gitignore` ausgeschlossen.
