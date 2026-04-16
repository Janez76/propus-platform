# Propus Platform — Dokumentations-Index

> Dies ist der **Hauptindex** der Plattform-Dokumentation. Alle Details befinden sich in den verlinkten Modulen unter `docs/`.
>
> **Automatisch mitpflegen:** Cursor-Regel `.cursor/rules/data-fields.mdc` definiert, wann welche Datei aktualisiert werden muss.

*Zuletzt aktualisiert: April 2026*

---

## Dokumentations-Module

| Datei | Inhalt |
|---|---|
| [docs/FLOWS_BOOKING.md](docs/FLOWS_BOOKING.md) | Buchungs-Flows: Haupt-Buchung, Provisional, Kalender-Sync, Reschedule, Storno, Fotograf-Wechsel, Bestätigung, Payrexx-Webhook, Exxas-Order-Sync |
| [docs/FLOWS_TOURS.md](docs/FLOWS_TOURS.md) | Tour-Manager: tours-Tabelle, Status-Maschine, Matterport-Integration, Verlängerungs-Flow, zentrales Rechnungsmodul (`/admin/invoices`), Listing/Kunden-Galerie (Magic-Link, NAS-Import, Auto-Fill Kundenordner + Freigabe-Link, Bestell-Kontakt-Fallback, NAS `/Finale`-Unterordner-Präferenz, Status-Sofortspeicherung), Bank-Import (Vorschau/Multi-Upload, Bestellungssuche), Bestellungs-Admin Finanzblock, KI/AI-Suggestions, Incoming-Emails, Cron-Jobs, Bestellung nachträglich verknüpfen (Tour-Detail Intern) |
| [docs/WORKFLOW_TOURS.md](docs/WORKFLOW_TOURS.md) | Tour-Workflow Regelwerk (Produkt), Admin `/admin/tours/workflow-settings`; mit `FLOWS_TOURS.md` synchron halten |
| [docs/FLOWS_UPLOAD.md](docs/FLOWS_UPLOAD.md) | Upload-System: Endpunkte, upload_batches/files-Tabellen, NAS-Pfad-Logik, Kategorien, Chunked-Upload, Konflikt-Modi, Upload-Gruppen |
| [docs/FLOWS_EXXAS.md](docs/FLOWS_EXXAS.md) | Exxas-Integration: Gespeicherte Felder, exxas_invoices-Tabelle, Reconcile-Flow, Scoring, API-Funktionen, Order-Sync |
| [docs/SCHEMA_FULL.md](docs/SCHEMA_FULL.md) | Vollständiges DB-Schema: core.*, booking.*, tour_manager.* — alle Tabellen mit allen Feldern |
| [docs/ROLES_PERMISSIONS.md](docs/ROLES_PERMISSIONS.md) | Rollen & Permissions: RBAC-System, System-Rollen, Permission-Keys, Mapping-Tabelle, Rollen-Sync, Logto-Integration, Portal-Rollen |
| [docs/EMAIL_TEMPLATES.md](docs/EMAIL_TEMPLATES.md) | E-Mail-Templates: Mail-Transport, alle Booking-Builder-Funktionen, Tour-Manager DB-Templates mit Platzhaltern, Logging |

---

## Schnell-Referenz: Datenbankschemas

| Schema | Wichtigste Tabellen |
|---|---|
| `core` | `customers`, `customer_contacts`, `companies`, `company_members`, `admin_users`, `sessions` |
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
| 5 | Booking-Modul hat kein dediziertes E-Mail-Log (nur `order_status_audit`) | Offen |
| 6 | Exxas-Order-Sync (`exxas_status`, `exxas_order_id`) ohne dedizierte Dokumentation der Sync-Häufigkeit | Offen |
| 7 | `calendar_delete_queue`-Tabelle noch nicht vollständig dokumentiert | Offen |

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
