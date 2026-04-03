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

## Kunden-E-Mail-Zuordnung (Email Aliases)

Kunden können mehrere E-Mail-Adressen haben: eine primäre (`customers.email`) und beliebig viele Aliase (`customers.email_aliases TEXT[]`).

**Hintergrund**: Firmen mit mehreren Marken/Domains (z.B. CSL Immobilien `@csl.ch` + Nextkey `@nextkey.ch`) sollen nach einem Merge unter **beiden** Domains gefunden werden.

### Regeln für neuen Code

#### Kunden per E-Mail suchen (JavaScript/TypeScript)

IMMER die zentralen Hilfsfunktionen nutzen, niemals selbst `WHERE email = $1` schreiben:

- **`booking/db.js`**: `getCustomerByEmail(email)` — für Booking-Modul
- **`tours/lib/customer-lookup.js`**: `getCustomerByEmail(email)` — für Tour-Manager

#### SQL-Queries mit Kunden-E-Mail-Vergleich

IMMER die DB-Funktion `core.customer_email_matches()` verwenden:

```sql
-- ✅ RICHTIG
WHERE core.customer_email_matches($1, c.email, c.email_aliases)

-- ✅ RICHTIG (Tour ↔ Kunde)
WHERE core.customer_email_matches(t.customer_email, c.email, c.email_aliases)

-- ❌ FALSCH — erkennt Aliase nicht
WHERE LOWER(c.email) = $1
WHERE LOWER(c.email) = LOWER(t.customer_email)
```

#### Neuer API-Endpunkt zum Lesen/Setzen von Aliases

- `GET /api/admin/customers/:id` → gibt `email_aliases` im Response zurück
- `PATCH /api/admin/customers/:id/email-aliases` → setzt die Aliases
- Beim Merge: `email_aliases` werden automatisch aus `booking/customer-merge.js` übernommen

### Wo was liegt

| Was | Wo |
|-----|----|
| DB-Funktion | `core/migrations/022_customer_email_aliases.sql` |
| Merge-Logik | `booking/customer-merge.js` |
| Booking-Lookup | `booking/db.js` → `getCustomerByEmail()` |
| Tour-Manager-Lookup | `tours/lib/customer-lookup.js` → `getCustomerByEmail()` |
| API-Endpunkt | `booking/server.js` → `PATCH /api/admin/customers/:id/email-aliases` |
| UI | `app/src/components/customers/CustomerViewModal.tsx` |
| API-Client | `app/src/api/customers.ts` → `updateCustomerEmailAliases()` |

## Portal spiegelt Admin-Tour-Panel

Alles was in der Admin-Tour-Detailansicht geändert oder hinzugefügt wird, muss **identisch auch im Kunden-Portal** umgesetzt werden.

| Was | Admin | Portal |
|-----|-------|--------|
| Seiten-Komponente | `app/src/pages-legacy/tours/admin/TourDetailPage.tsx` | `app/src/pages-legacy/portal/PortalTourDetailPage.tsx` |
| Stammdaten-Panel | `TourActionsPanel.tsx` | Inline in `PortalTourDetailPage` |
| Matterport-Sektion | `TourMatterportSection.tsx` | Inline in `PortalTourDetailPage` |
| Rechnungen | `TourInvoicesSection.tsx` | Inline in `PortalTourDetailPage` |
| Backend API | `tours/routes/admin-api.js` | `tours/routes/portal-api-mutations.js` |

### Sektionen die im Portal NICHT existieren (weglassen)

- **Intern** (`TourInternSection`)
- **Aktionsprotokoll** (`TourActionLog`)
- Admin-Aktionen: Tour löschen, Space übertragen, Ticket, Matterport-Options-Overrides

## Technologie-Stack

- **Frontend**: React 19, Next.js, TypeScript, Tailwind CSS
- **Backend**: Express.js, PostgreSQL
- **Auth**: Logto OIDC (Admin), Session-basiert (Portal)
- **Deploy**: Docker Compose auf VPS, GitHub Actions CI/CD
