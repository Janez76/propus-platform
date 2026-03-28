# Propus Platform

Unified platform combining the **Booking Tool** and **Tour Manager** into a single
codebase with shared customer data, centralized authentication (Logto), and a
common PostgreSQL instance.

## Architecture

```
propus-platform/
├── core/           # Shared migrations, migration runner, seed data
├── booking/        # Buchungstool backend (Express/Node)
├── tours/          # Tour Manager backend (Express/Node/EJS)
├── auth/           # Logto config helpers (future)
├── infra/          # Nginx, backup scripts
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

# 4. Start application modules
docker compose up -d booking tours

# 5. Access
#    Booking:  http://localhost:3100
#    Tours:    http://localhost:3200
#    Logto:    http://localhost:3302 (Admin Console)
```

## Migrations

All SQL migrations live in `core/migrations/` and are executed in order by
`core/migrate.js`. Run them with:

```bash
docker compose run --rm migrate
```
