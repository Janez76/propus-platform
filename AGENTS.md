# Propus Platform — Architektur-Richtlinien

## Einheitliches React-System (seit April 2026)

Die gesamte UI der Plattform wird über eine **einzige React-SPA (Next.js)** gerendert.
Es gibt **kein** serverseitiges HTML-Rendering für Portal- oder Admin-Seiten mehr.

### Absolute Verbote

1. **Keine neuen `.ejs`-Dateien** erstellen (außer `tours/views/customer/`)
2. **Kein `res.render()`** in Express-Routen für Portal/Admin-Seiten
3. **Keine neue View-Engine** (Pug, Handlebars, Nunjucks, etc.)
4. **Kein serverseitiges HTML** für neue Features — alles über React

### Einzige Ausnahmen

Die folgenden 3 EJS-Dateien bleiben bestehen (triviale Seiten ohne Login):
- `tours/views/customer/thank-you-yes.ejs`
- `tours/views/customer/thank-you-no.ejs`
- `tours/views/customer/error.ejs`

### Neue Features umsetzen

| Was | Wo |
|-----|-----|
| Neue Seite | `app/src/pages-legacy/` (React-Komponente) |
| Portal-Seite | `app/src/pages-legacy/portal/` |
| Route registrieren | `app/src/components/ClientShell.tsx` |
| API-Endpunkt | `tours/routes/` (JSON zurückgeben, kein HTML) |
| API-Proxy | `app/next.config.ts` (beforeFiles rewrites) |
| API-Client | `app/src/api/portalTours.ts` oder `app/src/api/toursAdmin.ts` |

### Sicherheitsmaßnahmen

- **CI-Guard**: `scripts/guard-no-ejs.sh` läuft bei jedem Push und blockiert den Deploy bei Verstößen
- **Pre-Commit**: `scripts/guard-no-ejs.sh` kann als Git-Hook genutzt werden
- **Cursor-Regeln**: `.cursor/rules/architecture-no-ejs.mdc` informiert AI-Agenten

## Projektstruktur

```
app/              → Next.js SPA (React Frontend)
tours/            → Express Backend (JSON-APIs)
tours/routes/     → API-Endpunkte (nur JSON, keine HTML-Views)
tours/views/      → Nur customer/ EJS (3 Dateien, Legacy)
auth/             → Logto OIDC Integration
booking/          → Buchungsportal
platform/         → Docker-Container (Express + Next.js)
```

## Technologie-Stack

- **Frontend**: React 19, Next.js, TypeScript, Tailwind CSS
- **Backend**: Express.js, PostgreSQL
- **Auth**: Logto OIDC (Admin), Session-basiert (Portal)
- **Deploy**: Docker Compose auf VPS, GitHub Actions CI/CD
