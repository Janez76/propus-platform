# Deploy-Flow (Architektur)

**Status:** verbindlich · **Letzte Aktualisierung:** 2026-04-18

Dieses Dokument erklärt, **warum** der Deploy auf drei Dateien verteilt ist
(GitHub-Workflow, VPS-Script, Container-Init) und **welche Datei wofür
zuständig ist**. Operative Details (SSH-Setup, Secrets, Backup-Restore) stehen
in [`VPS-BETRIEB.md`](VPS-BETRIEB.md).

## Übersicht: Drei Phasen, drei Dateien

```
┌──────────────────────────────────────────────────────────────────────┐
│ Phase 1: Orchestrierung (GitHub Actions Runner, ubuntu-latest)       │
│                                                                      │
│   .github/workflows/deploy-vps-and-booking-smoke.yml                 │
│                                                                      │
│   ▸ Trigger: push auf master  oder  workflow_dispatch                │
│   ▸ Architecture-Guard (kein neues EJS), Documentation-Guard         │
│   ▸ Version stempeln (booking/public/VERSION etc.)                   │
│   ▸ admin-panel via Vite bauen                                       │
│   ▸ Deploy-Archiv (tar.gz) bauen                                     │
│   ▸ Rollback-Snapshot auf VPS sichern                                │
│   ▸ Archiv + Scripts via scp hochladen                               │
│   ▸ deploy-remote.sh via ssh starten (mit 1× Retry)                  │
│   ▸ Bei Fehler: rollback-vps.sh ausfuehren, GitHub-Issue erstellen   │
│   ▸ Cloudflare-Cache purgen, Public-Routes verifizieren              │
└──────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼ ssh + scp
┌──────────────────────────────────────────────────────────────────────┐
│ Phase 2: Host-Setup (VPS, ausserhalb der Container)                  │
│                                                                      │
│   scripts/deploy-remote.sh                                           │
│                                                                      │
│   ▸ tar -xzf  →  rsync --delete nach /opt/propus-platform            │
│     (preserved: .env.vps, .env.vps.secrets, backups/)                │
│   ▸ Symlinks: compose.yaml → docker-compose.vps.yml,  .env → .env.vps│
│   ▸ Port-Konflikt-Check (3100, 3301, 3302, 5435, 5436, 4343)         │
│   ▸ docker compose build  (migrate + platform + website)             │
│   ▸ docker compose up -d --force-recreate platform                   │
│   ▸ DB-Migrations: docker compose run --rm migrate                   │
│   ▸ Website-Container neu starten (separat wegen Port 4343)          │
│   ▸ Health-Check Platform (max 120s) + Website (max 60s)             │
│   ▸ Cloudflare-Tunnel sicherstellen (systemctl)                      │
│   ▸ Lokale Smoke-Routes via Host-Header pruefen                      │
└──────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼ docker compose up
┌──────────────────────────────────────────────────────────────────────┐
│ Phase 3: Container-Init (im platform-Container, jeder Start)         │
│                                                                      │
│   scripts/start.sh                                                   │
│                                                                      │
│   ▸ Next.js spawnen:  PORT=3001 node /app/nextjs/server.js           │
│   ▸ Express spawnen:  PORT=3100 node /app/platform/server.js         │
│   ▸ trap SIGTERM/SIGINT → beide Prozesse sauber beenden              │
│   ▸ wait -n: bricht der Container ab, wenn ein Prozess stirbt        │
└──────────────────────────────────────────────────────────────────────┘
```

## Warum diese Aufteilung?

Die naheliegende Idee „alles in einer Datei" scheitert an **drei harten
Constraints**:

1. **GitHub-Actions kann keine 5-min-SSH-Sessions halten.** `docker compose
   build` dauert je nach Cache-Zustand 2–5 min. Würde der Workflow die Logik
   inline via `ssh '<komplettes Skript>'` ausführen, brächen Verbindungen
   regelmäßig in der Build-Phase ab, ohne dass der Workflow das mitkriegt.
   → **`deploy-remote.sh` läuft VPS-lokal**, der Workflow wartet nur auf das
   Ergebnis (mit `ServerAliveInterval=30 ServerAliveCountMax=12`).
2. **`start.sh` muss im Container-Image liegen.** Das `CMD` im
   `platform/Dockerfile` zeigt darauf. Beim Container-Start (auch nach
   `docker compose restart` außerhalb eines Deploys) muss der Init-Code
   verfügbar sein, ohne dass der Workflow läuft.
   → **`start.sh` ist Teil des Images**, nicht des Deploys.
3. **Ein einzelner Container, zwei Node-Prozesse.** Während der Migration zu
   Next.js läuft die alte Express-API parallel zur neuen Next.js-App. Beide
   müssen im selben Container leben (gemeinsame Filesystem-Mounts, geteilte
   ENV, gemeinsamer Healthcheck). `start.sh` ist der minimale Supervisor,
   der das ohne Tini/PM2 löst.

## Was triggert was?

| Trigger | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| `git push` auf `master` | ✓ | ✓ | ✓ |
| `workflow_dispatch` mit `run_deploy=true` | ✓ | ✓ | ✓ |
| Manuelles `docker compose up -d platform` auf VPS | – | – | ✓ |
| Manueller Aufruf `bash deploy-remote.sh` mit `GITHUB_SHA=...` | – | ✓ | ✓ |
| `docker compose restart platform` | – | – | ✓ |

## Wo läuft welche Datei?

| Datei | Läuft auf | Wird gestartet von |
|---|---|---|
| `.github/workflows/deploy-vps-and-booking-smoke.yml` | GitHub-Runner (`ubuntu-latest`) | Push / Dispatch |
| `scripts/deploy-remote.sh` | VPS (Host, kein Container) | Workflow via `ssh` |
| `scripts/rollback-vps.sh` | VPS (Host, kein Container) | Workflow bei Deploy-Fehler |
| `scripts/start.sh` | Im `platform`-Container | `CMD` im `platform/Dockerfile` |

## Erweiterungen — wo gehört was hin?

| Aufgabe | Datei |
|---|---|
| Neuer GitHub-Secret in der Pipeline | Workflow YAML (Section `env`) |
| Neuer Pre-Deploy-Check (z. B. „läuft Cloudflare Origin?") | `deploy-remote.sh` (vor `docker compose build`) |
| Neues ENV-Var in den Container | `platform/Dockerfile` (`ENV`) und `docker-compose.vps.yml` |
| Neuer Hintergrund-Worker im Container | **Erst** prüfen, ob ein eigener Container besser ist. Sonst zusätzliche Zeile in `start.sh` mit eigenem `&` und in den `trap`/`wait`-Block. |
| Neuer Service neben Platform/Website | `docker-compose.vps.yml` (neuer Service) und `deploy-remote.sh` (Build/Start in der richtigen Reihenfolge) |

## Häufige Fragen

**Warum baut die Pipeline `booking/admin-panel` separat und schickt das mit?**
Historisch — siehe [`booking/admin-panel/DEPRECATED.md`](../booking/admin-panel/DEPRECATED.md).
Der Build-Schritt bleibt drin, bis die letzten Seiten nach `app/src/` migriert sind.

**Wie wird das Admin-Panel ausgeliefert?**
Zwei Wege (seit PR #94):
1. **Im Platform-Container** (Hauptweg): `platform/Dockerfile` kopiert `booking/admin-panel/dist` ins Image. ENV `ADMIN_PANEL_DIST=/app/booking/admin-panel/dist`. `booking/server.js` liefert das SPA via `express.static` aus und leitet Nicht-API-Routen auf `index.html` (SPA-Routing).
2. **Standalone** (Entwicklung/NAS): `booking/docker-compose.prod.yml` definiert einen eigenen `admin`-Service (Nginx, Port 8091), der das SPA über `booking/admin-panel/Dockerfile` baut.

**Warum kein BlueGreen / Zero-Downtime?**
Der Cloudflare-Tunnel routet auf die Container-Health-Probe. Während des
`force-recreate` antwortet Platform für ~60 s mit 502. Die Phase-2-Health-Probe
verhindert Routing zurück, bevor der Container wirklich `200 OK` liefert.
Echtes BlueGreen bräuchte zwei Container-Sets + Reverse-Proxy-Switch — bewusst
out of scope, weil der einzelne VPS keine zweite Platform-Instanz tragen kann.

**Warum wird `master` für die Version nicht zurückgeschrieben?**
Workflow-Notiz in der `Prepare deploy version`-Section: ephemere
Deploy-Versionen (`v1.2.3-deploy.42.1.abcdef0`) bleiben nur im Container, nie im
Repository. Das verhindert Endlosschleifen und macht Rollbacks per `git revert`
sauber.

## Verwandte Dokumente

- [`VPS-BETRIEB.md`](VPS-BETRIEB.md) — operatives Handbuch (Backup, SSH,
  Secrets, manuelle Eingriffe)
- [`BACKUPS.md`](BACKUPS.md) — Backup-Strategie, Restore-Vorgehen
- [`BOOKING-E2E-DEPLOY.md`](BOOKING-E2E-DEPLOY.md) — End-to-End-Tests gegen
  Staging
- [`PLATTFORM-TEXTE-UND-ARCHITEKTUR.md`](PLATTFORM-TEXTE-UND-ARCHITEKTUR.md)
  — Gesamt-Architektur (Container, Subdomains, Schemas)
