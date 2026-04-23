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
auth/             → Auth-Hilfsfunktionen (Session-Store, Postgres-Sessions)
booking/          → Buchungsportal
platform/         → Docker-Container (Express + Next.js)
```

## Dubletten-Prävention & Wartung (Kunden)

- **Logik (Backend):** `booking/customer-dedup.js` – `findMatchingCustomer` (exact/strong/weak); starke Treffer: Kontakt an bestehendem Kunden; schwache: neuer Kunde + Eintrag in `booking.customer_duplicate_candidates` (siehe Migrationen 087/088).
- **Analyse (read-only):** `node scripts/find-duplicate-customers.js` (bzw. `cd booking && npm run analyze-duplicate-customers`) – gruppiert potenzielle Dubletten; geteilte Report-Logik: `scripts/lib/duplicate-customers-report.js` (wird von CLI + nächtlichem Job genutzt).
- **Nightly:** Hintergrundjob in `booking/jobs/duplicate-customers-nightly.js` (nur mit `feature.backgroundJobs=true`); optional Mail an `OFFICE_EMAIL` bzw. `DUPLICATE_CANDIDATES_REPORT_EMAIL` bei **neu** eingefügten Kandidaten.
- **Stammdaten vs. Exxas (read-only):** `cd booking && npm run audit:customer-stammdaten` → `scripts/customer-stammdaten-audit.js` (CSV/MD in `booking/analysis-customer-stammdaten/`, gitignored). Bewusste Differenzen beim **Firmennamen** in `EXXAS_COMPANY_NAME_DIFF_IGNORE` (z. B. Kunde 74: «Mirai Real Estate AG» in Propus, Exxas-Kartenname «Tonet»).

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

## Portal spiegelt Admin-Tour-Panel (Design & Funktionen)

Jede **Design- oder Funktionsänderung** am Admin-Tour-Panel muss **identisch auch im Kunden-Portal** umgesetzt werden. API-Endpunkte und DB-Schema sind separat.

| Admin | Portal |
|-------|--------|
| `TourDetailPage.tsx` | `PortalTourDetailPage.tsx` |
| `TourActionsPanel.tsx` | Inline in `PortalTourDetailPage` |
| `TourMatterportSection.tsx` | Inline in `PortalTourDetailPage` |
| `MatterportVisibilityPanel.tsx` | `PortalVisibilityPanel` (inline) |
| `TourInvoicesSection.tsx` | Inline in `PortalTourDetailPage` |

### Sektionen die im Portal NICHT existieren (weglassen)

- **Intern** (`TourInternSection`)
- **Aktionsprotokoll** (`TourActionLog`)
- Admin-only Aktionen: Tour löschen, Space übertragen, Ticket, Matterport-Options-Overrides

## Zentrales Rechnungsmodul (seit April 2026)

Verlängerungsrechnungen und Exxas-Rechnungen werden in einem **eigenständigen Admin-Modul** verwaltet — losgelöst vom Tours-Submenü.

### Routing

| URL | Komponente | Hinweis |
|-----|-----------|---------|
| `/admin/invoices` | `app/src/pages-legacy/admin/invoices/AdminInvoicesPage.tsx` | Zentrales Modul (neu) |
| `/admin/tours/invoices` | — | Redirect → `/admin/invoices` (Bookmarks) |

### API-Endpunkte

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `GET` | `/api/tours/admin/invoices-central?type=renewal\|exxas&status=&search=` | Kombinierte Rechnungsliste (neu) |
| `GET` | `/api/tours/admin/invoices` | Nur Verlängerungsrechnungen (Legacy, bleibt für Tour-Detail) |

### Backend-Logik

| Funktion | Datei |
|----------|-------|
| `getRenewalInvoicesCentral(status, search)` | `tours/lib/admin-phase3.js` |
| `getExxasInvoicesCentral(status, search)` | `tours/lib/admin-phase3.js` |

### DB

| Was | Wo |
|-----|----|
| View (beide Tabellen kombiniert) | `tour_manager.invoices_central_v` |
| Migration | `core/migrations/026_invoices_central_view.sql` |
| Verlängerungsrechnungen | `tour_manager.renewal_invoices` |
| Exxas-Rechnungen | `tour_manager.exxas_invoices` |

### Wichtig

- `TourInvoicesSection.tsx` in Tour-Detail bleibt **unverändert** — zeigt beide Rechnungstypen pro Tour
- Das zentrale Modul zeigt **alle** Rechnungen systemweit (mit Suche + Status-Filter)
- Exxas-Status `'bz'` = bezahlt; alle anderen Werte = offen

## Ticket-System (seit April 2026)

Zentrales Ticketsystem für alle Module (Touren, Buchung), erreichbar unter `/admin/tickets`.

### DB-Tabelle: `tour_manager.tickets`

| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| `id` | SERIAL PK | |
| `module` | TEXT | `'tours'` oder `'booking'` |
| `reference_id` | TEXT | ID der verknüpften Tour oder Bestellung |
| `reference_type` | TEXT | `'tour'` oder `'order'` |
| `customer_id` | INTEGER FK | → `core.customers(id)` (nullable) — direkte Kunden-Zuweisung |
| `category` | TEXT | `startpunkt` / `name_aendern` / `blur_request` / `sweep_verschieben` / `sonstiges` |
| `subject` | TEXT | Betreff (Pflichtfeld) |
| `description` | TEXT | Ausführliche Beschreibung |
| `status` | TEXT | `open` / `in_progress` / `done` / `rejected` |
| `priority` | TEXT | `normal` / `high` / `low` |
| `created_by` | TEXT | E-Mail des Erstellers |
| `assigned_to` | TEXT | E-Mail des Bearbeiters |
| `attachment_path` | TEXT | Relativer Pfad zu Datei in `tours/uploads/tickets/` |

### API-Endpunkte (unter `/api/tours/admin`)

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `GET` | `/tickets` | Liste (Filter: status, module, reference_id, reference_type, customer_id) |
| `GET` | `/tickets/:id` | Einzelticket mit JOINs (Tour, Bestellung, Kunde) |
| `POST` | `/tickets` | Neues Ticket erstellen (inkl. customer_id) |
| `POST` | `/tickets/from-email` | Ticket aus eingehender E-Mail erstellen |
| `PATCH` | `/tickets/:id` | Status, Zuweisung, customer_id, reference ändern |
| `POST` | `/tickets/upload` | Screenshot hochladen |

### Frontend

| Datei | Beschreibung |
|-------|-------------|
| `app/src/pages-legacy/tours/admin/AdminTicketsPage.tsx` | Hauptseite (Tab: Tickets + Postfach) |
| `app/src/pages-legacy/tours/admin/components/TicketCreateDialog.tsx` | Dialog für neues Ticket (auch von Tour-Detail nutzbar) |

### Postfach-Tab

Zeigt E-Mails aus `office@propus.ch` via `GET /api/tours/admin/mail/inbox`. Automatisches Matching gegen Touren und Kunden. Pro E-Mail: "Ticket erstellen" (mit Vorausfüllung) oder "Auto" (direktes Erstellen mit erkannten Zuordnungen).

## Technologie-Stack

- **Frontend**: React 19, Next.js, TypeScript, Tailwind CSS
- **Backend**: Express.js, PostgreSQL
- **Auth**: Session-basiert (lokale Passwort-Auth, Admin + Portal)
- **Deploy**: Docker Compose auf VPS, GitHub Actions CI/CD

### VPS-Deploy: `tar`/`rsync`-Excludes (häufige Falle)

- **Kein loses `backups`-Pattern ohne Root-Anker:** Sowohl GNU `tar --exclude=…` als auch `rsync --exclude='…'` matchen oft den **Basisnamen** auf **jeder** Pfadtiefe. Ein Exclude wie `backups` oder `backups/` schließt damit nicht nur das Top-Level-Verzeichnis `backups/` (Runtime-Backups), sondern auch **`app/src/components/backups/`** (React-Backup-UI) aus — die Dateien fehlen dann still im Deploy-Archiv bzw. werden per rsync nicht aktualisiert; der Docker-Build auf dem VPS tippt gegen **alten** Stand, während `git` lokal sauber ist.
- **Praxis:** Deploy-Archiv mit expliziter Top-Level-Dateiliste erstellen (z. B. `find . -maxdepth 1` mit gezielten Ausschlüssen für `./backups`, `./docs`, …) statt einem globalen `--exclude=backups`. Beim Sync in `scripts/deploy-remote.sh` das Runtime-`backups/`-Verzeichnis nur mit **Root-Anker** auslassen: `--exclude='/backups/'` (führendes `/` = relativ zum rsync-Quellroot).
- **CI-Hinweis:** Der Workflow-Job „Build Next.js“ im Deploy-Workflow läuft bei **normalem Push** typischerweise nicht (nur bei manuellem `workflow_dispatch` mit Smoke-Option). Dann prüft der Typecheck die App erst im **Platform-Docker-Build** auf dem VPS — lokale `npm run build`-Grünheit im Runner ersetzt das nicht.

## NAS / Infrastruktur (UGREEN 192.168.1.5)

### Netzlaufwerke (lokal gemountet)

| Laufwerk | UNC-Pfad | Inhalt |
|----------|----------|--------|
| `Z:` | `\\192.168.1.5\code` | Code-Ablage, Projekte |
| `Y:` | `\\192.168.1.5\PROPUS DRIVE` | Allgemeine Dateien |
| `N:` | `\\192.168.1.5\backup\HA ZH` | Home-Assistant-Backup |

### SSH-Zugang

| | |
|---|---|
| **Host** | `192.168.1.5` |
| **Benutzername** | `Janez` |
| **Port** | 22 |
| **Auth** | Nur `publickey` (kein Passwort-Login standardmässig) |
| **Host-Key Fingerprint** | `SHA256:wnXkTVoRvz2OCS2jUfY76XCkgG/B0YegQo3psPamHOA` |
| **SSH-Server** | OpenSSH_9.2p1 Debian-2+deb12u6 |

```powershell
# Bevorzugt (Alias):
ssh nas-propus

# Fallback (explizit):
ssh -i "C:\Users\svajc\.ssh\id_ed25519" Janez@192.168.1.5

# Connectivity-Check:
ssh -o BatchMode=yes nas-propus "pwd && hostname"
# Erwartete Ausgabe: /home/Janez / Propus
```

**SSH-Keys auf Z:\.ssh\ (NAS-Ablage)**

| Datei | Verwendung |
|-------|-----------|
| `Z:\.ssh\id_ed25519` | **NAS-Login** (Janez@192.168.1.5) — lokal nach `C:\Users\svajc\.ssh\` kopieren |
| `Z:\.ssh\id_ed25519.pub` | Dazugehöriger Public Key |
| `Z:\.ssh\config` | SSH-Config mit allen Aliases → lokal nach `C:\Users\svajc\.ssh\config` kopieren |
| `Z:\.ssh\ugreen_nas_ed25519` | Login als `admin`@192.168.1.5 |
| `Z:\.ssh\buchungstool_deploy` | Deploy-Key Buchungstool |
| `Z:\.ssh\id_ed25519_propus_vps` | Propus VPS |

**authorized_keys auf dem NAS** enthält: `svajc@cursor` (= `Z:\.ssh\id_ed25519.pub`)

**Lokaler SSH-Alias auf diesem Rechner:** `nas-propus`

```powershell
ssh nas-propus
```

Der Alias nutzt:
- Host `192.168.1.5`
- User `Janez`
- Key `C:\Users\svajc\.ssh\id_ed25519`

### Web-Interface & externe URLs

| Dienst | URL |
|--------|-----|
| NAS lokal | `https://192.168.1.5` |
| NAS extern | `https://ugreen.propus.ch` |
| Nextcloud | `https://cloud.propus.ch` (Cloudflare Tunnel direkt vom NAS) |
| vcard | `https://vcard-pcs.ch` → `192.168.1.5:9500` |

### NAS-Dokumentation

Alle NAS-Skripte und Anleitungen liegen in `Z:\NAS Ugreen\`:
- `ZUGANGSDATEN.md` — vollständige Zugangsinfos
- `SSH-PASSWORT-AKTIVIEREN.md` — Anleitung Passwort-Auth
- `nas-tunnel-repair.ps1` — Cloudflare-Tunnel reparieren
- `update-cloudflare-tunnel.ps1` — Tunnel-Config aktualisieren

### Docker auf dem NAS

| Dienst | Pfad / Port |
|--------|------------|
| Nextcloud | `/volume1/docker/nextcloud/` · lokal `http://192.168.1.5:8090` · extern `https://cloud.propus.ch` |
| vcard | `/volume1/docker/vcard/` · Port 9500 |
| Cloudflare Tunnel | Container `dreamy_poincare` (cloudflared) |

**Nextcloud-Container (Docker Compose):**

| Container | Details |
|-----------|---------|
| `nextcloud` | App-Container |
| `nextcloud-nginx` | Port 8090→80 |
| `nextcloud-db` | PostgreSQL 16 |
| `nextcloud-redis` | Cache |
| `nextcloud-push` | Push-Benachrichtigungen |
| `nextcloud-signaling` | Sprach-/Video-Signaling |
| `nextcloud-coturn` | TURN-Server |
| `nextcloud-nats` | NATS-Messaging |

### Cloudflare-Infrastruktur

| | |
|---|---|
| **Zone** | `propus.ch` |
| **Zone ID** | `705b4ad4994d062aada5c5432044d9cb` |
| **Account ID** | `8b91ce43aae424d922fc7bc54ffa93dd` |
| **Tunnel Name** | `Ugreen 4800` |
| **Tunnel ID** | `852d718f-22ff-4ab3-8e52-1a9e337314e0` |
| **Tunnel-Container** | `dreamy_poincare` (läuft auf NAS 192.168.1.5) |
| **Tunnel-Ingress** | `cloud.propus.ch` → `http://192.168.1.5:8090` |
| **CF-Credentials** | `CF_EMAIL` + `CF_KEY` (Global API Key) in `.env.vps` auf dem VPS |

### VPS & Netzwerk

| | |
|---|---|
| **VPS IP** | `87.106.24.107` |
| **Router** | UniFi OS · `192.168.1.1` |
| **Hinweis DNS** | UniFi lokale DNS-Overrides für interne Domains immer prüfen — können Cloudflare-Tunnel-Routing stören |

### Zweites NAS (Dev – 192.168.1.4)

- Benutzer: `Janez`
- Dienste: Ollama (Port 11434), Buchungstool-Dev, Propusdrop, Spoolman
