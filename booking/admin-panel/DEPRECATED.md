# DEPRECATED — `booking/admin-panel/`

**Status:** deprecated
**Datum:** 2026-04-17

## Kurzfassung

Dieser Ast (`booking/admin-panel/`, Vite + React) wird **nicht mehr in Produktion
ausgeliefert**. Alle neuen Admin-Features gehören ausschließlich in das
Next.js-Frontend unter `app/src/`.

## Warum

Die Produktion rendert das Admin-Frontend ausschließlich über das Next.js-SPA
in `app/` (siehe [`AGENTS.md`](../../AGENTS.md) § _Einheitliches React-System
(seit April 2026)_):

- Requests an `admin-booking.propus.ch` werden durch den Cloudflare-Tunnel auf
  den Platform-Container geroutet.
- Der Platform-Container serviert Next.js (Port 3001). Next.js besitzt einen
  Catch-All-Route (`app/src/app/[[...slug]]/page.tsx`), der `ClientShell.tsx`
  mountet und darüber die Legacy-React-SPA aus `app/src/pages-legacy/` lädt.
- Der Vite-Build aus `booking/admin-panel/dist/` wird zwar weiterhin in das
  Platform-Image kopiert (`platform/Dockerfile`), durch die Next.js-Catch-All
  aber **nie** als HTML-Response ausgeliefert. Der Express-Fallback in
  `booking/server.js` läuft nur, wenn Next.js die Route nicht beantwortet —
  das passiert für normale UI-Routen nicht.

Konsequenz: Arbeit an `booking/admin-panel/**` landet im Git, im Build und im
Container-Image, aber **nie beim Benutzer**. Das Orders-Modul-Refactoring
(Phasen 0–4 + 2b) aus April 2026 ist genau aus diesem Grund in Produktion
unsichtbar geblieben.

## Regeln für neuen Code

| Was | Wo |
|---|---|
| Neue Admin-Seite | `app/src/pages-legacy/` |
| Neue gemeinsame Komponente | `app/src/components/` |
| Neue API-Client-Funktion | `app/src/api/` |
| Route registrieren | `app/src/components/ClientShell.tsx` |
| Backend-Endpunkt (JSON) | `tours/routes/` bzw. `booking/*routes*.js` |

**Nicht** in `booking/admin-panel/src/` neu anlegen. Auch nicht „parallel auch
hier reinziehen, damit beide Frontends konsistent bleiben". Dieses Frontend
existiert nur noch historisch.

## Was mit bestehendem Code passiert

- **Keine Löschung.** Der Vite-Build bleibt bis auf Weiteres grün, der
  Deploy-Workflow wird **nicht** angefasst.
- **Kein Block bei Änderungen.** Legitime Bugfixes für Altcode, der noch im
  Build sein muss, sind erlaubt. Der Warn-Workflow
  `.github/workflows/warn-deprecated-admin-panel.yml` hängt bei solchen PRs
  einen Hinweiskommentar an, blockiert aber nicht.
- **Migration verschoben.** Ein vollständiger Code-Umzug der verbliebenen
  Seiten (Orders-Refactoring, `OrderDetail.tsx`, Wizard) nach `app/src/` ist
  offen und wird separat geplant.

## Referenzen

- [`AGENTS.md`](../../AGENTS.md) — verbindliche Architektur-Regeln seit April
  2026
- [`README.md`](../../README.md) — Frontend-Übersicht (Eintrag für
  `booking/admin-panel/` ist als _deprecated_ markiert)
- [`app/src/components/ClientShell.tsx`](../../app/src/components/ClientShell.tsx)
  — dokumentiert den inkrementellen Vite → Next.js-Übergang im Code
- [`app/src/app/[[...slug]]/page.tsx`](../../app/src/app/%5B%5B...slug%5D%5D/page.tsx)
  — Next.js-Catch-All, der alle Admin-Routen übernimmt
