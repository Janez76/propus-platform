# Tour Manager Migration – Golden-Path-Checkliste

> Letzte Aktualisierung: 2026-03-31  
> Zweck: Feldparität, Rückfallpfade und Golden-Path-Tests für jede Umschaltphase sicherstellen.

---

## Phase 1 – Typen & API-Contracts ✅
- [x] `platform/frontend/src/types/tourManager.ts` – vollständige Typen für alle DB-Felder
- [x] `platform/frontend/src/api/tourAdmin.ts` – Admin JSON-API-Client
- [x] `platform/frontend/src/api/portalTours.ts` – Portal JSON-API-Client inkl. Mutationen
- [x] `tours/routes/admin-api.js` – Backend-Router für React-Admin
- [x] `tours/routes/portal-api-mutations.js` – Backend-Router für Portal-Mutationen

## Phase 2 – Portal ✅
- [x] `PortalToursPage.tsx` – Tourenliste mit Filter, Suche, Links zur Detailseite
- [x] `PortalTourDetailPage.tsx` – Vollständige Detailansicht (Assignees, Edit, Extend, Archive, Visibility, Invoices)
- [x] Portal-Routen in `App.tsx`: `/portal/tours`, `/portal/tours/:id`

## Phase 3 – Admin Kernseiten ✅
- [x] `AdminToursDashboardPage.tsx` – Dashboard mit Widgets, Quicklinks, unverknüpfte Spaces, ablaufende Touren
- [x] `AdminToursListPage.tsx` – Tourenliste mit Filterung, Suche, Sortierung, Pagination, Modals
- [x] `AdminTourDetailPage.tsx` – Tour-Detail: Stammdaten, URL/Name/Sweep, Sichtbarkeit, Rechnungen, Exxas, Aktionslog
- [x] `AdminTourInvoicesPage.tsx` – Rechnungsübersicht mit Filter, Mark-Paid, Löschen
- [x] `AdminMatterportLinkPage.tsx` – Matterport-Verknüpfung, Auto-Link, Sync
- [x] `AdminBankImportPage.tsx` – Dateiupload, ausstehende Transaktionen, Import-Läufe
- [x] Admin-Routen in `App.tsx`

## Phase 4 – Verbleibende Admin-Seiten (ausstehend)
- [ ] `AdminCustomersPage.tsx` – Kundenverwaltung (Kontakte, Exxas-Link)
- [ ] `AdminTeamPage.tsx` – Team verwalten, Einladungen
- [ ] `AdminPortalRolesPage.tsx` – Portal-Rollen verwalten
- [ ] `AdminSettingsPage.tsx` – Grundeinstellungen
- [ ] `AdminEmailTemplatesPage.tsx` – E-Mail-Vorlagen
- [ ] `AdminAutomationsPage.tsx` – Automatisierungsregeln
- [ ] `AdminAiChatPage.tsx` – AI-Assistent

---

## Feldparität-Checkliste (pro Seite)

### PortalTourDetailPage
| Feld | EJS-Quelle | React-Feld | Status |
|------|------------|------------|--------|
| Tourname | `tour.canonical_object_label` | `t.canonical_object_label` | ✅ |
| Ablaufdatum | `tour.canonical_term_end_date` | `t.canonical_term_end_date` | ✅ |
| Matterport-ID | `tour.canonical_matterport_space_id` | `t.canonical_matterport_space_id` | ✅ |
| Status | `tour.status` | `t.status` | ✅ |
| Assignees | `tour.assignees` | via `getPortalTourAssignees` | ✅ |
| Rechnungen | `renewalInvoices` | `data.invoices` | ✅ |
| Sichtbarkeit ändern | POST `/portal/:id/visibility` | `setPortalTourVisibility` | ✅ |
| Archivieren | POST `/portal/:id/archive` | `archivePortalTour` | ✅ |

### AdminToursListPage
| Feature | EJS-Feature | React-Feature | Status |
|---------|-------------|---------------|--------|
| Filter | URL-Params | State + URL-Params | ✅ |
| Suche | Server-Side | Server-Side via API | ✅ |
| Sortierung | Server-Side | Server-Side via API | ✅ |
| Pagination | Server-Side | Server-Side via API | ✅ |
| Zahlung prüfen Modal | ✅ | ✅ | ✅ |
| E-Mail-Modal | ✅ | ✅ | ✅ |

---

## Rückfallpfade

### Umschaltphase (Strangler Fig)
Die alten EJS-Routen bleiben aktiv unter `https://admin-booking.propus.ch/tour-manager/admin`.  
Die neuen React-Routen sind unter `/admin/tours/*` im `platform/frontend` erreichbar.

**Rückfall-Trigger:**
- API-Fehler: Komponenten zeigen Fehlermeldung + Reload-Button
- Fehlende API-Route: `adminFetch` wirft einen sprechenden Error
- Neue React-Seite mit Bug: Benutzer kann manuell auf EJS-URL wechseln

**Navigation-Konsistenz:**
- Das `AdminToursDashboardPage` verlinkt Dashboard → `/admin/tours/list`, `/admin/tours/invoices` usw.
- `AdminToursListPage` verlinkt auf `/admin/tours/:id` (neue Detailseite)
- Alle Admin-Routen sind durch `adminOnlyRoles` in `guardedElement()` geschützt

---

## Test-Szenarien (manuell)

### Portal
1. `/portal/tours` → Liste lädt, Filter funktioniert, Link "Details →" öffnet Detailseite
2. `/portal/tours/:id` → Daten laden, Assignee hinzufügen/entfernen, Tour bearbeiten
3. Tour verlängern → Modal erscheint, Zahlung via Payrexx, Status wechselt
4. Tour archivieren → Bestätigungsmodal, Tour aus Liste entfernt

### Admin
1. `/admin/tours/dashboard` → Widgets laden, Links zu Liste/Rechnungen/Matterport korrekt
2. `/admin/tours/list` → Filter, Suche, Sortierung, Pagination
3. `/admin/tours/:id` → Detaildaten, Name/URL ändern, Rechnung als bezahlt markieren
4. `/admin/tours/invoices` → Rechnungsliste, Filter, Mark-Paid, Löschen
5. `/admin/tours/matterport` → Unverknüpfte Spaces, mit bestehender Tour verknüpfen
6. `/admin/tours/bank-import` → CSV hochladen, Transaktion bestätigen

---

## Bekannte Abhängigkeiten / Risiken

| Bereich | Risiko | Mitigation |
|---------|--------|-----------|
| Exxas-API | Kann zu Timeouts führen | Admin-API hat try/catch, gibt Teilresultate zurück |
| Matterport-API | Rate-Limits bei Sync | Sync-Button nur auf Anfrage, nicht automatisch |
| Payrexx | Webhook-Delays | Status-Badge zeigt "Wartet auf Zahlung" korrekt |
| Session-Auth | Middleware `requireAdminOrRedirect` | Für JSON-API: gibt 401 JSON zurück, React zeigt Login-Redirect |
