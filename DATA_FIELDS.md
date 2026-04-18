# Propus Platform — Dokumentations-Index

> Dies ist der **Hauptindex** der Plattform-Dokumentation. Alle Details befinden sich in den verlinkten Modulen unter `docs/`.
>
> **Automatisch mitpflegen:** Cursor-Regel `.cursor/rules/data-fields.mdc` definiert, wann welche Datei aktualisiert werden muss.

*Zuletzt aktualisiert: April 2026 (PR #94: admin_users Legacy-Tabellen durch Views mit INSTEAD-OF-Triggern über `core.admin_users` ersetzt; FK `booking.access_subjects.admin_user_id` zeigt jetzt auf `core.admin_users(id)`). PR #93: `booking/admin-panel/` vollständig entfernt — Code, Docker-Services, CI-Build-Step, Warn-Workflow gelöscht; Docs bereinigt. PR #92: API-Key-Auth bindet req.user.id auf numerische admin_users.id, created_by-Lookup per ID. PR #91: API-Token-Generator — core.api_keys-Tabelle, CRUD-Endpunkte, RBAC-Permission `api_keys.manage`, Settings-UI. PR #90: booking/Dockerfile Build-Context auf Repo-Root, core/ wird mitkopiert wegen cross-module Dependency. PR #89: Rate-Limiting auf Auth/Booking-Endpunkte, helmet Security-Header, OpenAPI-CI-Lint, SCHEMA_FULL.md um ~20 fehlende Tabellen ergänzt. PR #88: Node-Pinning auf 20.18.1, GOOGLE_REVIEWS_PLACE_ID externalisiert, core/lib/customer-lookup zentralisiert.*

---

## Dokumentations-Module

| Datei | Inhalt |
|---|---|
| [docs/FLOWS_BOOKING.md](docs/FLOWS_BOOKING.md) | Buchungs-Flows: Haupt-Buchung, Provisional, Kalender-Sync, Reschedule, Storno, Fotograf-Wechsel, Bestätigung, Payrexx-Webhook, Exxas-Order-Sync, Rate-Limiting & Security-Header, API-Key-Verwaltung (CRUD) |
| [docs/FLOWS_TOURS.md](docs/FLOWS_TOURS.md) | Tour-Manager: tours-Tabelle, Status-Maschine, Matterport-Integration, Verlängerungs-Flow, zentrales Rechnungsmodul (`/admin/invoices`), Listing/Kunden-Galerie (Magic-Link, NAS-Import, Auto-Fill Kundenordner + Freigabe-Link, Bestell-Kontakt-Fallback, NAS `/Finale`-Unterordner-Präferenz, Status-Sofortspeicherung, Slug-URL-Auflösung in Admin + API, Friendly-Slug-URLs `<plz>-<ort>-<bestellnr>`, Websize-only Galerie, nur «Alle Medien herunterladen»-Button, MediaSummary, Feedback→Ticket-Integration), Bank-Import (Vorschau/Multi-Upload, Bestellungssuche), Bestellungs-Admin Finanzblock, KI/AI-Suggestions, Incoming-Emails, Cron-Jobs, Bestellung nachträglich verknüpfen (Tour-Detail Intern) |
| [docs/WORKFLOW_TOURS.md](docs/WORKFLOW_TOURS.md) | Tour-Workflow Regelwerk (Produkt), Admin `/admin/tours/workflow-settings`; mit `FLOWS_TOURS.md` synchron halten |
| [docs/FLOWS_UPLOAD.md](docs/FLOWS_UPLOAD.md) | Upload-System: Endpunkte, upload_batches/files-Tabellen, NAS-Pfad-Logik, Kategorien, Chunked-Upload, Konflikt-Modi, Upload-Gruppen |
| [docs/FLOWS_EXXAS.md](docs/FLOWS_EXXAS.md) | Exxas-Integration: Gespeicherte Felder, exxas_invoices-Tabelle, Reconcile-Flow, Scoring, API-Funktionen, Order-Sync |
| [docs/SCHEMA_FULL.md](docs/SCHEMA_FULL.md) | Vollständiges DB-Schema: core.*, booking.*, tour_manager.* — alle Tabellen mit allen Feldern |
| [docs/ROLES_PERMISSIONS.md](docs/ROLES_PERMISSIONS.md) | Rollen & Permissions: RBAC-System, System-Rollen, Permission-Keys, Mapping-Tabelle, Rollen-Sync, Logto-Integration, Portal-Rollen |
| [docs/EMAIL_TEMPLATES.md](docs/EMAIL_TEMPLATES.md) | E-Mail-Templates: Mail-Transport, alle Booking-Builder-Funktionen, Tour-Manager DB-Templates mit Platzhaltern, Logging |
| [docs/ADMIN-FRONTEND-DESIGN.md](docs/ADMIN-FRONTEND-DESIGN.md) | Admin-Frontend Design-Referenz: Verbindliche Bausteine, Listing-Editor, Shared-Module in der Main-App (StatusBadge, Pricing, useDirty, useT, address, Test-Infrastruktur/Vitest) |
| [docs/OPENAPI.md](docs/OPENAPI.md) | OpenAPI 3.1 Spec (Skeleton): 5 kritische Endpunkte, Konventionen, Lint-/Preview-Anleitung. Spec liegt in [`docs/openapi/openapi.yaml`](docs/openapi/openapi.yaml) |
| [docs/DEPLOY-FLOW.md](docs/DEPLOY-FLOW.md) | Drei-Phasen-Deploy: GitHub Actions → VPS-Bash (`scripts/deploy-remote.sh`) → Container-Init (`scripts/start.sh`). Trigger-Matrix, Decision-Table |

---

## Schnell-Referenz: Datenbankschemas

| Schema | Wichtigste Tabellen |
|---|---|
| `core` | `customers`, `customer_contacts`, `companies`, `company_members`, `admin_users`, `sessions`, `api_keys` |
| `booking` | `orders`, `photographers`, `products`, `discount_codes`, `upload_batches`, `access_subjects`, `app_settings` |
| `tour_manager` | `tours`, `galleries`, `gallery_images`, `gallery_feedback`, `renewal_invoices`, `exxas_invoices`, `invoices_central_v` (View), `incoming_emails`, `outgoing_emails`, `ai_suggestions`, `settings` |

---

## Schnell-Referenz: Wichtigste Regeln für neuen Code

```sql
-- ✅ RICHTIG: Kunden per E-Mail suchen
WHERE core.customer_email_matches($1, c.email, c.email_aliases)

-- ❌ FALSCH: Aliase werden nicht erkannt
WHERE LOWER(c.email) = $1
```

- **Synthetische E-Mails:** `@invite.buchungstool.invalid` (nicht `@company.local`)
- **Kein serverseitiges HTML:** Express-Routen → JSON, kein `res.render()`
- **Portal spiegelt Admin:** `TourDetailPage.tsx` → identisch in `PortalTourDetailPage.tsx`
- **Kanonische Felder:** `canonical_object_label`, `canonical_term_end_date`, etc. — nicht Legacy-Felder direkt

---

## Bekannte Lücken & TODOs

| # | Lücke | Status |
|---|---|---|
| 1 | Neukunde über Online-Buchung landet nur in `customers` ohne Company-Member und Logto-Sync | ✅ **Behoben** April 2026 in `booking/server.js` (`createCustomerPortalMagicLink`) |
| 2 | `isSynthCustomerEmail` erkannte nur `@company.local`, nicht `@invite.buchungstool.invalid` | ✅ **Behoben** April 2026 in `CompanyManagementPage.tsx` |
| 3 | Sidebar hatte doppelte Einträge "Kunden" + "Firmenverwaltung" | ✅ **Behoben** April 2026: kombiniertes Submenu "Kunden & Firmen" |
| 4 | Firmenverwaltungs-Seite zeigte keine Kontaktpersonen | ✅ **Behoben** April 2026: `CustomerContactsSection` integriert |
| 5 | Booking-Modul hat kein dediziertes E-Mail-Log (nur `order_status_audit`) | ✅ **Behoben** April 2026: `booking.email_send_log` dokumentiert in SCHEMA_FULL.md |
| 6 | Exxas-Order-Sync (`exxas_status`, `exxas_order_id`) ohne dedizierte Dokumentation der Sync-Häufigkeit | Offen |
| 7 | `calendar_delete_queue`-Tabelle noch nicht vollständig dokumentiert | ✅ **Behoben** April 2026: in SCHEMA_FULL.md |
| 8 | `booking.companies/company_members/company_invitations` sind Duplikate zu `core.*` — Migration zur `core`-Variante offen | Offen |
| 9 | `booking.admin_users` und `tour_manager.admin_users` sind Legacy — Single Source of Truth ist `core.admin_users` | ✅ **Behoben** April 2026 in `core/migrations/040`: Legacy-Tabellen durch Views mit INSTEAD-OF-Triggern ersetzt; FK `booking.access_subjects.admin_user_id` zeigt jetzt auf `core.admin_users(id)`. |

---

## Technologie-Stack

| Schicht | Technologie |
|---|---|
| Frontend | React 19, Next.js (SPA), TypeScript, Tailwind CSS |
| Backend | Express.js, PostgreSQL |
| Auth | Logto OIDC (Admin), Session-basiert (Portal-Legacy), Magic-Link (Kunden) |
| E-Mail | Microsoft Graph API + SMTP-Fallback |
| Kalender | Microsoft Graph API (Exchange/M365) |
| Matterport | REST + GraphQL API |
| Exxas | REST API (ApiKey-Auth) |
| Payrexx | REST API + Webhook (HMAC-SHA256) |
| Deploy | Docker Compose auf VPS, GitHub Actions CI/CD |
