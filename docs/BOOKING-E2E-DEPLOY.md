# Booking E2E Deploy

Diese Notiz beschreibt das Zusammenspiel von VPS-Deploy und Playwright-Smoke-Test fuer den oeffentlichen Buchungs-Wizard.

## Bestandteile

- `platform/frontend/e2e/booking-happy-path.spec.ts` *(entfernt – Vite-SPA wurde durch Next.js-App unter `app/` ersetzt)*
  - war: schneller lokaler Smoke-Test mit API-Mocks

- `platform/frontend/e2e/booking-staging.spec.ts` *(entfernt)*
  - war: echter End-to-End-Test ohne `page.route(...)`

- `.github/workflows/deploy-vps-and-booking-smoke.yml`
  - deployt den aktuellen Commit-Stand als Archiv auf den VPS (ohne `git pull` auf dem Server)
  - baut das `platform`-Image neu
  - prueft `/api/health`
  - leert bei gesetzten Cloudflare-Secrets den Zone-Cache (`purge_everything`)
  - den echten Buchungs-Smoke-Test startet **nur** bei manuellem Lauf mit `run_smoke=true` (nicht bei jedem Push)
  - bei `workflow_dispatch` kann man `deploy`, `smoke` oder beides auswaehlen

## Manuelle Workflow-Starts

Der Workflow kann auf zwei Arten laufen:

- `push` auf `master`
  - fuehrt nur `deploy` (kein automatischer `booking-smoke`)

- `workflow_dispatch`
  - `run_deploy=true`, `run_smoke=true`
    - kompletter Deploy plus Smoke-Test
  - `run_deploy=true`, `run_smoke=false`
    - nur Deploy
  - `run_deploy=false`, `run_smoke=true`
    - nur Smoke-Test gegen bereits laufende Staging-/Produktiv-URL

## GitHub Environment `production`

### Deploy-Secrets

- `VPS_SSH_PRIVATE_KEY`
  - Inhalt des privaten SSH-Keys inkl. `BEGIN/END`

- `VPS_ENV_FILE`
  - kompletter Inhalt der produktiven `.env.vps`
  - wird bei jedem Deploy nach `/opt/propus-platform/.env.vps` geschrieben
  - Guard: Wenn das eingehende Secret live gesetzte `PAYREXX_*`-Werte leeren wuerde, bricht der Workflow den Deploy vor dem Upload bewusst ab
  - nach manuellen Aenderungen auf dem VPS daher immer auch das GitHub-Secret `VPS_ENV_FILE` nachziehen, z. B. mit `scripts/push-github-production-secrets.ps1`

- `VPS_HOST`
  - Hostname oder IP des VPS (fuer `ssh` und `ssh-keyscan` im Workflow)

- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_AUTH_EMAIL`
- `CLOUDFLARE_AUTH_KEY`
  - fuer automatischen **Cache-Purge nach jedem Deploy** (Schritt im Workflow); gleiche API-Zugangsdaten wie lokal in `booking/.env` unter `CF_ZONE` / `CF_EMAIL` / `CF_KEY`

### Playwright-Secrets

- `PLAYWRIGHT_BASE_URL`
  - bevorzugt eine echte Staging-Domain
  - Produktion ist moeglich, erzeugt aber echte Buchungen

- `PLAYWRIGHT_LIVE_BOOKING`
  - muss `1` sein, sonst wird der Live-Spec bewusst uebersprungen

- `PLAYWRIGHT_BOOKING_ADDRESS_QUERY`
- `PLAYWRIGHT_BOOKING_PACKAGE_KEY`
- `PLAYWRIGHT_BOOKING_DATE`
- `PLAYWRIGHT_BOOKING_SLOT`
- `PLAYWRIGHT_BOOKING_COMPANY`
- `PLAYWRIGHT_BOOKING_NAME`
- `PLAYWRIGHT_BOOKING_EMAIL`
- `PLAYWRIGHT_BOOKING_PHONE`
- `PLAYWRIGHT_BOOKING_STREET`
- `PLAYWRIGHT_BOOKING_ZIP`
- `PLAYWRIGHT_BOOKING_CITY`

Optional:

- `PLAYWRIGHT_BOOKING_OBJECT_TYPE`
- `PLAYWRIGHT_BOOKING_AREA`
- `PLAYWRIGHT_BOOKING_ONSITE_NAME`
- `PLAYWRIGHT_BOOKING_ONSITE_PHONE`

## Empfohlene Staging-Testdaten

Der Live-Spec ist nur dann stabil, wenn folgende Daten bewusst fix gehalten werden:

- ein aktives Paket mit festem `key`, z. B. `bestseller`
- mindestens ein fuer Deploy-Tests reservierter Zeitslot
- eine testgeeignete Adresse, die ueber `/api/address-suggest` sauber aufloest
- eine dedizierte Testfirma, z. B. `Propus Test AG`
- eine dedizierte Test-E-Mail, damit Testauftraege leicht auffindbar sind

## Empfohlene Betriebsregeln

- Den Live-Spec zunaechst gegen Staging laufen lassen, nicht gegen Produktion.
- Fuer Produktion nur dann aktivieren, wenn Testauftraege downstream klar markiert oder automatisiert bereinigt werden.
- Wenn der Staging-Slot konsumiert wird, den Secret-Wert `PLAYWRIGHT_BOOKING_DATE` oder `PLAYWRIGHT_BOOKING_SLOT` direkt anpassen.
- Wenn sich Paket-Keys aendern, `PLAYWRIGHT_BOOKING_PACKAGE_KEY` sofort mitpflegen.

## Lokale Befehle

Mock-basierter UI-Smoke-Test:

```powershell
cd app
npm run test:e2e
```

Remote-Staging-Test:

```powershell
cd app
$env:PLAYWRIGHT_BASE_URL="https://staging-booking.propus.ch"
$env:PLAYWRIGHT_LIVE_BOOKING="1"
npm run test:e2e:staging
```
