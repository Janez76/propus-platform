# AGENTS.md

## Cursor Cloud specific instructions

### Architecture overview

This is the **Propus Platform** monorepo — a Swiss business management platform with three products:

| Service | Tech | Ports | Description |
|---|---|---|---|
| **Platform** (Docker) | Express.js | `3100` (API), `3001` (Next.js prod) | Unified backend: Booking + Tour Manager + built Next.js |
| **App** (local dev) | Next.js 16, React 19 | `3000` | Primary admin frontend (dev server) |
| **PostgreSQL** (Docker) | Postgres 16 | `5435` | Main database (schemas: core, booking, tour_manager) |
| **Logto** (Docker) | OIDC auth server | `3301` (API), `3302` (admin) | SSO identity provider |

### Starting the development environment

Docker must be running (`sudo dockerd` if needed, then `sudo chmod 666 /var/run/docker.sock`).

```bash
# 1. Infrastructure (from repo root)
docker compose up -d postgres logto-db logto

# 2. Migrations (one-shot, idempotent)
#    IMPORTANT: On fresh DB, booking.admin_users.logto_user_id must exist
#    before core migration 018 runs. Workaround:
#    docker exec workspace-postgres-1 psql -U propus -d propus \
#      -c "ALTER TABLE booking.admin_users ADD COLUMN IF NOT EXISTS logto_user_id TEXT;"
docker compose --profile migrate run --rm migrate

# 3. Platform container (Express API + Next.js built)
docker compose up -d platform

# 4. Next.js dev server (separate terminal)
cd app && npm run dev  # http://localhost:3000
```

### Gotchas

- **Migration ordering bug**: Core migration `018_normalize_admin_users.sql` references `booking.admin_users.logto_user_id`, which is only added by `booking/migrations/061_admin_users_logto_fields.sql`. On a completely fresh database, the core migration runner runs first and fails. Workaround: manually add the column before running migrations (see above).
- **Platform first-boot crash**: The platform container runs booking-module inline migrations on first start. If these fail (e.g., missing column), the container crashes but succeeds on restart (`docker compose restart platform`) because the tracking table persists.
- **No test script in `app/`**: The Next.js app has no `npm test` script. Use `npm run lint` (eslint) and `npm run build` (type-check + build) for validation.
- **Tours tests**: Run with `cd tours && npm test` (Node.js built-in test runner). Some tests have pre-existing failures unrelated to environment setup.
- **`.env.local` for app/**: The Next.js dev server needs `app/.env.local` with `POSTGRES_HOST=localhost`, `POSTGRES_PORT=5435`, etc. to connect to the Docker-hosted DB. This file is not committed.
- **Health checks**: `curl http://localhost:3100/api/core/health` (Express) and `curl http://localhost:3001/api/core/health` (Next.js container).
- **Package manager**: All packages use **npm** with `package-lock.json`.

### Lint / Build / Test commands

| Scope | Command | Notes |
|---|---|---|
| App lint | `cd app && npx eslint .` | Pre-existing warnings/errors |
| App build | `cd app && npm run build` | Type-check + production build |
| App dev | `cd app && npm run dev` | Dev server on port 3000 |
| Tours test | `cd tours && npm test` | Node built-in test runner |
| Booking test | `cd booking && npm test` | Node built-in test runner (no test files currently) |
