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

## Technologie-Stack

- **Frontend**: React 19, Next.js, TypeScript, Tailwind CSS
- **Backend**: Express.js, PostgreSQL
- **Auth**: Logto OIDC (Admin), Session-basiert (Portal)
- **Deploy**: Docker Compose auf VPS, GitHub Actions CI/CD

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
| vcard | `/volume1/docker/vcard/` · Port 9500 |
| Cloudflare Tunnel | Container Manager → `cloudflared` |

### Zweites NAS (Dev – 192.168.1.4)

- Benutzer: `Janez`
- Dienste: Ollama (Port 11434), Buchungstool-Dev, Propusdrop, Spoolman
