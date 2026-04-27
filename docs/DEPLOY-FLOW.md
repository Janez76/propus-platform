# Deploy-Flow (Architektur)

**Status:** verbindlich · **Letzte Aktualisierung:** 2026-04-27 (Auto-Deploy bei Push auf master)

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
│   ▸ Trigger: push auf master (Auto-Deploy nach PR-Merge) ODER         │
│              workflow_dispatch (manuell, opt. Smoke-Test)             │
│     Doku-only-Aenderungen (*.md, docs/**) ueberspringen Auto-Deploy  │
│   ▸ Architecture-Guard (kein neues EJS), Documentation-Guard         │
│   ▸ Version stempeln (booking/public/VERSION etc.)                   │
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
│     (preserved: .env.vps, .env.vps.secrets; Runtime ./backups/       │
│      via --exclude='/backups/' — siehe Abschnitt unten)               │
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
│   ▸ Express zuerst: PORT=3100 node /app/platform/server.js           │
│   ▸ Warten bis GET /api/core/health auf 127.0.0.1:3100 OK (max 180s) │
│   ▸ Dann Next.js: PORT=3001 node /app/nextjs/server.js               │
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

VPS-Deploy-Workflow (`.github/workflows/deploy-vps-and-booking-smoke.yml`) startet
**nur** per **Actions → manuell ausfuehren** (`workflow_dispatch`). Ein `git push`
auf `master` loest **kein** Deploy aus; er loest nur ggf. [`app-ci.yml`](../.github/workflows/app-ci.yml) (Unit-Tests) aus.

| Trigger | Phase 1 (GH) | Phase 2 (VPS) | Phase 3 (Container) |
|---|---|---|---|
| `workflow_dispatch` mit `run_deploy=true` | ✓ | ✓ | ✓ (nach `up`) |
| `workflow_dispatch` mit `run_deploy=true`, `run_smoke=false` | ✓ (ohne Smokes) | ✓ | ✓ (nach `up`) |
| `git push` `master` | – | – | – |
| Manuelles `docker compose up -d platform` auf VPS | – | – | ✓ |
| Manueller Aufruf `bash deploy-remote.sh` mit `GITHUB_SHA=...` | – | ✓ | ✓ |
| `docker compose restart platform` | – | – | ✓ |

### Booking-Smoke (nur `workflow_dispatch`)

- `run_smoke=true`: Job **Booking Smoke Tests**; Playwright nutzt `BASE_URL` aus
  Repository-Secret **`STAGING_URL`**, sonst `https://booking.propus.ch` (oeffentlicher
  Host). Ohne funktionierendes DNS liefert der GitHub-Runner
  `net::ERR_NAME_NOT_RESOLVED` — ggf. `STAGING_URL` auf eine erreichbare
  Buchungs-URL setzen, oder
- `run_smoke=false`: **nur Deploy**, Workflow endet gruen ohne Playwright. Details: [`BOOKING-E2E-DEPLOY.md`](BOOKING-E2E-DEPLOY.md).

## Wo läuft welche Datei?

| Datei | Läuft auf | Wird gestartet von |
|---|---|---|
| `.github/workflows/deploy-vps-and-booking-smoke.yml` | GitHub-Runner (`ubuntu-latest`) | Nur manuell (`workflow_dispatch`) |
| `scripts/deploy-remote.sh` | VPS (Host, kein Container) | Workflow via `ssh` |
| `scripts/rollback-vps.sh` | VPS (Host, kein Container) | Workflow bei Deploy-Fehler |
| `scripts/start.sh` | Im `platform`-Container | `CMD` im `platform/Dockerfile` |

## Deploy-Archiv und rsync: Exclude-Fallen (wichtig)

Ein loses Pattern wie `tar --exclude=backups` oder `rsync --exclude='backups/'`
**ohne** Anker am Archiv- bzw. Sync-Root schließt auf GNU tar/rsync oft **jede**
Pfadkomponente dieses Namens aus — nicht nur das Top-Level-Verzeichnis
`./backups/` (Runtime-Backups auf dem VPS). Dadurch kann u. a.
`app/src/components/backups/` (React-Backup-UI) **still** aus dem Archiv
fallen oder beim rsync nicht aktualisiert werden; der Docker-Build auf dem VPS
tippt dann gegen veralteten Code, obwohl `git` sauber ist.

**Umsetzung im Repo:** Phase 1 baut das Archiv per expliziter Top-Level-Liste
(`find . -maxdepth 1` mit Ausschlüssen), Phase 2 nutzt
`--exclude='/backups/'` (führendes `/` = relativ zum rsync-Quellroot). Kurz
auch in [`AGENTS.md`](../AGENTS.md) unter *VPS-Deploy*.

### Rollback-Snapshot (`last-good.tar.gz` und `failed-*.tar.gz`)

Der Workflow **Save rollback snapshot** und `scripts/rollback-vps.sh` packen **nicht**
blind den gesamten Tree wie früher, sondern schließen dieselben
Speicher-/Build-Pfade aus wie sinnvoll: u. a. VCS, `.github`, `docs`,
**nur** Top-Level `./backups/`, `node_modules` überall, `.next`, `.turbo`, `dist`,
`coverage`. Kompression: **`GZIP=-1`** (schneller, etwas größere Datei).
Ausgeschlossene Pfade, die schon auf der Platte lagen (z. B. `backups/`), bleiben
beim Entpacken des Rollbacks unverändert, weil `tar` dort keine Lösch-Synchronisation
durchführt. Die Exclude-Liste muss in **Workflow** und **`rollback-vps.sh`**
(`VPS_ROLLBACK_TAR_EXCLUDES`) abgestimmt bleiben.

## Erweiterungen — wo gehört was hin?

| Aufgabe | Datei |
|---|---|
| Neuer GitHub-Secret in der Pipeline | Workflow YAML (Section `env`) |
| Neuer Pre-Deploy-Check (z. B. „läuft Cloudflare Origin?") | `deploy-remote.sh` (vor `docker compose build`) |
| Neues ENV-Var in den Container | `platform/Dockerfile` (`ENV`) und `docker-compose.vps.yml` |
| Neuer Hintergrund-Worker im Container | **Erst** prüfen, ob ein eigener Container besser ist. Sonst zusätzliche Zeile in `start.sh` mit eigenem `&` und in den `trap`/`wait`-Block. |
| Neuer Service neben Platform/Website | `docker-compose.vps.yml` (neuer Service) und `deploy-remote.sh` (Build/Start in der richtigen Reihenfolge) |

## Häufige Fragen

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
