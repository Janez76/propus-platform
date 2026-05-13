# Propus Platform — Buchungs-Flows

> **Automatisch mitpflegen:** Bei jeder Änderung an Buchungslogik, Status-Übergängen, Kalender-Sync oder Provisional-Flow dieses Dokument aktualisieren. Cursor-Regel `.cursor/rules/data-fields.mdc` erinnert daran.

*Zuletzt aktualisiert: Mai 2026 — Flexible Buchung mit Deadline (PR #424): zweiter Discriminator-Branch in `POST /api/booking`, neuer Status `disposition_offen`, Kanban-Spalte mit Deadline-Sortierung, zwei neue de-CH Mail-Templates. — PR #490: Radius-Default-Bug behoben (`null` = unbegrenzt), Travel-Zone-Backfill nutzt jetzt Liegenschafts-PLZ aus `order.address` statt `billing.zipcity`, Fotografen-Kalender zeigt nur Objekt-Adresse wenn diese eine PLZ enthält.*

---

## Inhaltsverzeichnis

1. [Haupt-Buchungsfluss (POST /api/booking)](#1-haupt-buchungsfluss)
2. [Provisorische Buchung](#2-provisorische-buchung)
    - [2b. Flexible Buchung mit Deadline](#2b-flexible-buchung-mit-deadline)
3. [Status-Übergänge](#3-status-übergänge)
4. [Kalender-Sync (MS Graph)](#4-kalender-sync-ms-graph)
5. [Reschedule-Flow](#5-reschedule-flow)
6. [Storno-Flow](#6-storno-flow)
7. [Fotograf-Wechsel (Reassign)](#7-fotograf-wechsel)
8. [Bestätigungs-Flow](#8-bestätigungs-flow)
9. [Payrexx-Webhook](#9-payrexx-webhook)
10. [Exxas-Order-Sync](#10-exxas-order-sync)
11. [Fotograf-Vergabe (resolveAnyPhotographer)](#11-fotograf-vergabe)
12. [Slot-Generierung (fahrzeit-bewusst)](#12-slot-generierung)
13. [Routing-Service](#13-routing-service)
14. [Magic-Link in Buchungs-Mail](#14-magic-link-in-buchungs-mail)
15. [Kunden-Profil-Vorausfüllung (StepBilling)](#15-kunden-profil-vorausfüllung-stepbilling)
16. [Rate-Limiting & Security-Header](#16-rate-limiting--security-header)
17. [API-Key-Verwaltung (CRUD)](#17-api-key-verwaltung-crud)
18. [Admin-Panel SPA-Auslieferung](#18-admin-panel-spa-auslieferung)
19. [CI & HTML-Lint (Booking-Backend)](#19-ci--html-lint-booking-backend)
20. [Mobile Tagesplan & Live-Routing](#20-mobile-tagesplan--live-routing)

---

## 1. Haupt-Buchungsfluss

**Endpunkt:** `POST /api/booking`  
**Datei:** `booking/server.js`  
**Rate-Limit:** `bookingLimiter` — 10 Submits / 60 min pro IP

```
POST /api/booking
  │
  ├── 1. Payload normalisieren (normalizeTextDeep)
  ├── 2. onsiteContacts normalisieren (normalizeOnsiteContactsFromObject)
  │        → object.onsiteName/Phone/Email → onsite_contacts[0]
  │        → object.additionalOnsiteContacts[] → onsite_contacts[1..n]
  ├── 3. "any"-Fotograf auflösen (resolveAnyPhotographer) → siehe §11
  ├── 4. Preise berechnen & validieren (computePricing)
  ├── 5. Kalender-Verfügbarkeit prüfen (checkPhotographerAvailability)
  ├── 6. orderNo vergeben (nextOrderNumber)
  ├── 7. Rabattcode als "verwendet" markieren (discount_code_usages)
  ├── 8. orderRecord zusammenbauen (alle billing.*, onsite_contacts, key_pickup etc.)
  │
  ├── 9. saveOrder():
  │        ├── upsertCustomer(billing)
  |        |     -> findMatchingCustomer(billing)
  |        |     -> exakte Treffer: customers.email oder customer_contacts.email
  |        |     -> strong: company_key + E-Mail-Domain
  |        |     -> weak: neuer Kunde + customer_duplicate_candidates
  |        |     -> INSERT/UPDATE customers (email,name,company,phone,street,zipcity)
  │        └── insertOrder(record, customerId)
  │              → INSERT INTO booking.orders (alle Felder)
  │
  ├── 10. Kalender-Events erstellen (MS Graph):
  │        ├── Fotograf: POST /users/{email}/events
  │        └── Büro: POST /users/{OFFICE_EMAIL}/events
  │        → photographer_event_id, office_event_id gesetzt
  │        → calendar_sync_status = "final" (oder "tentative" bei provisional)
  │
  ├── 11. E-Mails senden:
  │        ├── Büro (buildOfficeEmail)
  │        ├── Fotograf (buildPhotographerEmail)
  │        ├── Kunden-Bestätigung (buildCustomerEmail)
  │        └── Kalendereinladungen an onsiteContacts mit calendarInvite=true
  │
  ├── 12. createCustomerPortalMagicLink(billing):
  │        ├── getCustomerByEmail() → isNewCustomer?
  │        ├── [Neukunde] createCustomer() → INSERT customers
  │        ├── [billing.company gesetzt]:
  │        │     ├── ensureCompanyByName() → core.companies
  │        │     ├── upsertCompanyMember(role: company_owner) → core.company_members
  │        │     └── rbac.syncCompanyMemberRolesFromDb()
  │        └── createCustomerSession() → core.customer_sessions (Token für Magic-Link)
  │
  ├── 13. booking_confirmation_request E-Mail (Template, idempotent)
  │        → confirmation_token + confirmation_token_expires_at gesetzt
  │
  └── Response: { ok: true, orderNo, warnings[] }
```

### Was in die DB geschrieben wird

| Tabelle | Operation | Felder |
|---|---|---|
| `core.customers` | INSERT/UPDATE | email, name, company, phone, street, zipcity |
| `core.customer_sessions` | INSERT | customerId, tokenHash, expiresAt |
| `core.companies` | INSERT (wenn neu) | name, slug, billing_customer_id |
| `core.company_members` | UPSERT | companyId, customerId, email, role, status |
| `booking.orders` | INSERT | alle order-Felder |
| `booking.discount_code_usages` | INSERT | discount_code_id, customer_email, order_id |

### Kundendeduplizierung bei neuen Buchungen

**Datei:** `booking/customer-dedup.js`

`upsertCustomer(billing)` verhindert neue Personen-Datensaetze fuer bestehende Firmenkunden:

1. Exakter Treffer ueber `core.customers.email`.
2. Exakter Treffer ueber `core.customer_contacts.email` -> Bestellung wird dem zugehoerigen Firmenkunden zugeordnet.
3. Starker Treffer ueber `company_key` + E-Mail-Domain -> Kontakt wird am bestehenden Kunden ergaenzt.
4. Schwacher Treffer ueber Firmenname/Fuzzy-Logik -> neuer Kunde + Review-Eintrag in `booking.customer_duplicate_candidates`.

Damit Kontaktpersonen wie `name@kundendomain.ch`, die bereits unter einer Firmenzeile in `customer_contacts` gepflegt sind, keinen zweiten Kunden erzeugen.

---

## 2. Provisorische Buchung

**Status:** `status = "provisional"`

```
Buchung mit provisional=true
  │
  ├── Wie normaler Buchungsfluss, aber:
  │     → status = "provisional"
  │     → provisional_booked_at = NOW()
  │     → provisional_expires_at = Beginn des 4. Tages (00:00 Zürich)
  │     → provisional_reminder_1/2_sent_at = null
  │
  ├── Kalender-Events: showAs = "tentative"
  │     → calendar_sync_status = "tentative"
  │
  └── Kunden-E-Mail: buildCustomerEmail mit isProvisional=true
        → Template enthält Hinweis auf Ablaufdatum

Cron-Jobs:
  ├── Stündlich: jobs/provisional-reminders.js
  │     ├── ≥24h → Reminder 1 (Template: provisional_reminder_1)
  │     ├── ≥48h → Reminder 2 (Template: provisional_reminder_2)
  │     └── ≥72h → Reminder 3 (Template: provisional_reminder_3)
  │
  └── Täglich 03:00 Zürich: jobs/provisional-expiry.js
        → provisional_expires_at < NOW()
        → changeOrderStatus(orderNo, "pending")
        → Kalender-Events löschen
        → provisional_*-Felder → null
        → E-Mail: provisional_expired
```

---

## 2b. Flexible Buchung mit Deadline

**Status nach Buchung:** `status = "disposition_offen"`
**Discriminator:** `schedule.bookingKind` ∈ `'fixed' | 'flexible'` (Default `fixed`).

Kunden auf booking.propus.ch wählen in `StepSchedule` zwischen Fix-Termin und
Flex-Buchung. Bei flex reserviert das Buchen **keinen Slot** und es findet
**kein Photographer-Routing / Distance-Matrix** statt — Office disponiert
später Fotograf+Termin und der Statuswechsel `disposition_offen → confirmed`
schickt eine Disposition-Mail mit dem konkreten Termin.

```text
POST /api/booking { schedule: { bookingKind: "flexible", deadlineAt, flexibleEarliestAt? } }
  │
  ├── 1. Diskriminator früh prüfen (server.js:4607ff) → handleFlexibleBookingSubmit()
  │
  ├── 2. Validierung (KEINE Slot/Calendar-Calls):
  │        ├── customerEmail erforderlich
  │        ├── deadlineAt parsebar UND ≥ now() + 24h
  │        └── flexibleEarliestAt (optional) parsebar UND < deadlineAt
  │
  ├── 3. Pricing aus Frontend-Payload (Fallback: computePricing).
  │
  ├── 4. orderNo vergeben → orderRecord:
  │        ├── status = "disposition_offen"
  │        ├── booking_kind = "flexible"
  │        ├── deadline_at = ISO
  │        ├── flexible_earliest_at = ISO | null
  │        ├── photographer = {}     (Office trägt später ein)
  │        └── schedule = {}          (Office trägt später date+time ein)
  │
  ├── 5. saveOrder() → db.insertOrder() persistiert die neuen Spalten.
  │
  └── 6. flex_booking_confirmation per sendMailIdempotent() an Kunden.
```

**Disposition durch Office:**

```text
PATCH /api/admin/orders/:orderNo/status  (status="confirmed", schedule.date+time, photographer)
  │
  ├── getTransitionError() prüft: photographer + schedule.date + schedule.time gesetzt
  │
  ├── getSideEffects("disposition_offen", "confirmed"):
  │        ├── calendar.create_final
  │        ├── email.flex_booking_disposition       ← Kunde (statt confirmed_customer)
  │        ├── email.confirmed_office               ← Büro
  │        └── email.confirmed_photographer         ← Fotograf
  │
  └── sendMailIdempotent() schickt flex_booking_disposition mit Hinweisblock
       oben (Datum, Uhrzeit, Fotograf) und sonst Standard-Layout.
```

### CHECK-Constraint (Migration 092)

```sql
CHECK (
  (booking_kind = 'fixed'    AND (schedule->>'date') IS NOT NULL)
  OR
  (booking_kind = 'flexible' AND deadline_at IS NOT NULL
                              AND (flexible_earliest_at IS NULL OR flexible_earliest_at < deadline_at))
)
```

### Index für Disposition-Queue

```sql
CREATE INDEX idx_orders_deadline_disposition
  ON orders (deadline_at)
  WHERE booking_kind = 'flexible' AND status = 'disposition_offen';
```

### Kanban

| Spalte | Routing | Sortierung |
|---|---|---|
| `disposition-offen` (links) | `status === 'disposition_offen'` | `deadline_at ASC` |
| Card-Badge | `DeadlineBadge` (`app/src/components/ui/DeadlineBadge.tsx`) | rot < 7d, gelb < 14d, neutral sonst |

### Listenansicht (`/admin/orders`, View "Liste")

`disposition_offen` ist eine eigene Tabellen-Sektion zwischen `provisional` und `confirmed`
(`SECTION_ORDER` in `app/src/components/orders/OrderTable.tsx`, `DEFAULT_EXPANDED=true`).
Der Chip-Filter "Offen" zählt `disposition_offen` mit (`CHIP_GROUPS` in
`app/src/pages-legacy/OrdersPage.tsx`, Members `["pending","provisional","disposition_offen"]`).
Ohne diese beiden Einträge werden Orders mit dem Status durch `grouped.get(key)?.push(order)`
schweigend verworfen — Regression-Test: `app/src/__tests__/statusCoverage.test.ts`.

### Karten-/Map-Ansicht

Map-Pin orange (`#C25E1F` Ring auf `#FCE7CE` Bg) — siehe
`STATUS_PALETTE.disposition_offen` und `paletteForStatus()` in
`app/src/components/orders/mapStatusColors.ts`. Locale-Labels in
`app/src/i18n/{de,en,fr,it}.json` unter `dashboardV2.map.status.disposition_offen`.

### Order-Chat

Chat ist im Status `disposition_offen` aktiv (Office tauscht sich vor der Disposition mit Kunde
und Fotograf aus). `ACTIVE_STATUSES` in `app/src/components/orders/OrderChat.tsx` enthält
`pending`, `provisional`, `disposition_offen`, `paused`, `confirmed`, `completed`. Geblockt
bleibt nur `cancelled` und `archived`; `done` ist passiv (Feedback-Fenster).

### Mail-Templates (DB)

| Key | Trigger | Layout |
|---|---|---|
| `flex_booking_confirmation` | direkt nach Buchung (im POST-Handler) | Eingangsbestätigung mit Deadline + Frühestens-ab |
| `flex_booking_disposition` | `disposition_offen → confirmed` (Side-Effect) | Hinweisblock oben mit Datum/Uhrzeit/Fotograf, sonst Standard |

Beide de-CH (Schweizer Spelling, "ss" statt "ß"), idempotent via
`email_send_log` (Key `<orderNo>_<templateKey>_<recipient>`).

### Critical Files

| Was | Datei |
|---|---|
| Discriminator-Branch | `booking/server.js` `handleFlexibleBookingSubmit()` |
| DB-Insert | `booking/db.js::insertOrder()` (Spalten `booking_kind`, `deadline_at`, `flexible_earliest_at`) |
| State + Side-Effects | `booking/order-status.js`, `booking/state-machine.js`, `booking/admin-status-email.js` |
| Migration | `booking/migrations/092_orders_flex_booking.sql`, `093_flex_booking_email_templates.sql` |
| Wizard-Toggle | `app/src/pages-legacy/booking/BookingTypeToggle.tsx` |
| Wizard-Step | `app/src/pages-legacy/booking/StepSchedule.tsx` |
| Wizard-State | `app/src/store/bookingWizardStore.ts` (`bookingKind`, `deadlineAt`, `flexibleEarliestAt`, persist v7) |
| Validation | `app/src/lib/bookingValidation.ts::validateStep3` |
| Status-Mirror | `app/src/lib/status.ts`, `app/src/lib/orderWorkflow/orderStatus.ts` |
| Kanban | `app/src/pages-legacy/OrdersKanbanPage.tsx` |
| Badge | `app/src/components/ui/DeadlineBadge.tsx` |

---

## 3. Status-Übergänge

**Mögliche Status-Werte:**

```text
pending           → provisional       → confirmed → completed → done → archived
   │                    │                  │            │
   ├→ disposition_offen ├→ paused          ├→ paused    └→ archived
   ├→ paused            └→ cancelled       └→ cancelled
   ├→ cancelled
   ├→ archived
   └→ confirmed / completed / done

disposition_offen → confirmed / paused / cancelled
paused            → pending / provisional / disposition_offen / cancelled
cancelled         → archived / pending
archived          → pending

Sonderfall:
provisional → pending nur automatisch via expiry_job
```

| Status | Bedeutung | Kalender |
|---|---|---|
| `pending` | Offen / noch nicht bearbeitet | — |
| `provisional` | Provisorisch reserviert (Fix-Flow) | tentative |
| `disposition_offen` | Flexible Buchung — wartet auf Disposition durch Office (siehe §2b) | — |
| `confirmed` | Bestätigt | final (busy) |
| `completed` | Shooting abgeschlossen | — |
| `done` | Vollständig abgeschlossen | — |
| `cancelled` | Storniert | gelöscht |
| `paused` | Pausiert | — |
| `archived` | Archiviert | — |

**Audit:** Jeder Übergang wird in `booking.order_status_audit` protokolliert:
- `from_status`, `to_status`, `source`, `actor_id`, `calendar_result`

---

## 4. Kalender-Sync (MS Graph)

**Konfiguration:** `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET`  
**Postfächer:** `OFFICE_EMAIL`, Fotografen-E-Mail

### Events erstellen

| Situation | Fotograf | Büro | showAs |
|---|---|---|---|
| Provisorische Buchung | `createProvisional` | `createProvisional` | tentative |
| Finale Buchung direkt | `createFinal` | `createFinal` | busy |
| Provisional → Confirmed | `upgradeToFinal` (PATCH) | `upgradeToFinal` (PATCH) | busy |

**Rollback:** Falls Büro-Event fehlschlägt → Fotograf-Event wird gelöscht.

### Events aktualisieren

- **Reschedule:** PATCH auf bestehende Event-IDs. Falls PATCH fehlschlägt → neue Events erstellen.
- **Dauer-Only-Änderungen aus Next.js-Admin-Actions:** `requestAdminReschedule()` ruft dieselbe Route auf und nutzt bevorzugt `PLATFORM_INTERNAL_URL`, sonst `NEXT_PUBLIC_API_BASE`. Der Backend-Reschedule patcht vorhandene Graph-Events in möglichen Mailbox-Kandidaten (kanonische Fotografen-Mailbox + gespeicherte Mailbox), damit alte 60-Minuten-Termine nicht als Dublette in Outlook bleiben.
- **Storno:** DELETE auf beide Event-IDs. 404 = bereits gelöscht (ok). Andere Fehler → `calendar_delete_queue` für Retry.

### `calendar_sync_status`-Werte

| Wert | Bedeutung |
|---|---|
| `tentative` | Provisorische Events aktiv |
| `final` | Finale Events aktiv |
| `deleted` | Events gelöscht |
| `error` | Lösch-Fehler, in Retry-Queue |
| null | Noch kein Sync |

### 4a. Outlook-/365-Overlay im Admin-Kalender (read-only)

**Endpunkt:** `GET /api/admin/calendar-events?includeOutlook=true&outlookFrom=YYYY-MM-DD&outlookTo=YYYY-MM-DD&outlookUser=<email>`

**Backend:** `loadOutlookCalendarEventsMulti` in `booking/server.js` (`loadOutlookCalendarEvents` = Komfort-Wrapper nur für genau ein Postfach).

- Kombination Postfächer (Admin-/Assistant-Overlay): `outlookAssistantOverlayMailboxes(primaryEmail)` ⇒ **Fallback** = Session-/Header-Nutzer + `OFFICE_EMAIL` + jedes Postfach aus `BKBN_CALENDAR_MAILBOXES` (Komma/Leerzeichen). Mit ENV `ASSISTANT_OUTLOOK_OVERLAY_MAILBOXES` lässt sich die Liste **komplett** überschreiben (gleiche Grammatik wie BKBN-Mailboxliste).
- Liest jedes Postfach via `GET /users/{mailbox}/calendarView`, folgt `@odata.nextLink` (max. 10 Seiten)
- Doppelte Einträge derselben Besprechung zwischen Postfächern werden per `iCalUId` (Fallback stabil pro Graph-Instanz) zusammengeführt (`mailboxes[]`, `graphIds[]`); `event.id = outlook-{primaryGraphId}` bleibt kompatibel mit BKBN-Dedupliziierung im Kalender-Endpunkt
- Default-Range: aktueller Monat ± 1 Monat (deckt Mini-Monat-Navigation ab); Assistant-Overlay bekommt `from`/`to` aus Query
- Caching: 60 s pro `mailboxJoined|from|to|dedupeExistingOrderIds` (In-Memory-Map); Cache speichert zugleich `partialError`
- Teilfehler beim Lesen eines Postfachs ⇒ `outlook.error` enthält Liste + Meldung, aber andere erfolgreichen Termine werden trotzdem geliefert
- Filter/Buchungs-Dubletten-/Privacy wie zuvor (ohne Änderungsbedarf hier)

**Response-Erweiterung:** `{ ok: true, events: [...], outlook: { enabled, user, mailboxes[], count, error } }`

**Frontend:** `app/src/pages-legacy/CalendarPage.tsx`

- Toggle "365-Kalender An/Aus" (`localStorage: calendar.showOutlook`)
- Kategorie-Filter (Pills + Select, `localStorage: calendar.outlookCategory`)
- Visuelle Kennzeichnung in `HandoffCalendarView`: lila Akzentfarbe (`#7c3aed`), Badge "365" oben rechts
- Klick → Read-only-Detail-Panel mit Titel, Zeit, Adresse, Kategorie, Notiz; Button "In Outlook öffnen" via `webLink`
- Order-/Status-/Reschedule-Aktionen bleiben für 365-Termine ausgeblendet (kein `orderNo`)

**Voraussetzungen:**

- MS Graph App-Only Berechtigung `Calendars.Read` (mind. delegiert auf den Service-Principal)
- `req.user.email` muss eine Mailbox im Mandanten sein, sonst `outlook.error = "no_user_email"`
- Bei fehlender Konfiguration: `outlook.error = "graph_not_configured"`, Toggle bleibt sichtbar mit Hinweis
- **KI-Assistenz-Endpunkt:** `GET /api/internal/assistant/outlook-overlay` (Loopback-/`ASSISTANT_BOOKING_GRAPH_PROXY_KEY`) erhält denselben gemergten Datenstand via `loadOutlookCalendarEventsMulti(outlookAssistantOverlayMailboxes(headerEmail),…)`.

### 4b. BKBN-Aufträge (Backbone Photo) im Admin-Panel (read-only)

Backbone Photo (`backbonephoto.co`) vergibt Shooting-Aufträge an Propus, die **nicht**
als DB-Auftrag landen, sondern nur als Outlook-Termin in den Postfächern der
ausführenden Mitarbeiter (Default: `ivan.mijajlovic@propus.ch`, `janez.smirmaul@propus.ch`).

**Endpunkte:**
- `GET /api/admin/bkbn-orders?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ ok, events:[...], mailboxes, matchDomains, range, meta:{enabled,count,error} }`. **Default-Range ohne Parameter:** letzte `BKBN_PAST_DAYS` Tage (10) + nächste `BKBN_FUTURE_MONTHS` Monate (6) — `bkbnDefaultRange()`. Dieselbe Default-Range nutzen Banner, `/orders`-„BKBN"-Bereich und das Assistant-Tool.
- `GET /api/admin/calendar-events?includeBkbn=true` → BKBN-Termine werden als `type:"bkbn"`-Events angehängt; Response erhält zusätzlich `bkbn: { enabled, mailboxes, count, error }`. Range = sichtbarer Kalenderbereich (Frontend übergibt `outlookFrom/outlookTo`) — hier **nicht** auf „letzte 10 Tage" beschnitten, damit Monatsnavigation funktioniert.
- `GET /api/internal/assistant/bkbn-orders?from=&to=` → Loopback-/Proxy-Key-geschützt (wie `outlook-overlay`), für das Assistant-Tool `get_bkbn_orders`

**Backend:** `loadBkbnCalendarEvents({ from, to })` in `booking/server.js`
- Liest `calendarView` für jede konfigurierte Mailbox (ENV `BKBN_CALENDAR_MAILBOXES`), folgt `@odata.nextLink` (max. 10 Seiten); Range mit ±1 Tag Puffer (Graph behandelt naive Zeitstempel als UTC)
- Ein Termin gilt als BKBN-Auftrag, wenn Organizer-/Attendee-Adresse, Betreff, Body oder Ort eine der `BKBN_MATCH_DOMAINS` (Default `backbonephoto.co`) enthält
- Dedupliziert über `iCalUId` (gleicher Termin in beiden Postfächern → ein Eintrag, `mailboxes[]` + `graphIds[]` führen alle); `error` meldet auch Teil-Fehler (fehlgeschlagene Postfächer)
- Farbe pro Postfach: `__bkbnEventColor(mailbox, order)` → Palette in Reihenfolge der `BKBN_CALENDAR_MAILBOXES` (1. Ivan orange `#ea580c`, 2. Janez teal `#0d9488`, …)
- Caching: `BKBN_CACHE_TTL_MS` (Default **5 min**) pro `mailboxes|tokens|from|to` — Graph wird nicht bei jedem Seitenaufruf neu abgefragt
- Im Kalender-Overlay werden persönliche 365-Overlay-Termine mit denselben Graph-Event-IDs entfernt, damit ein Termin nicht doppelt erscheint
- Sensitivity `private`/`confidential` → Titel/`bodyPreview` maskiert

**Frontend:**
- Eigene Seite `app/src/pages-legacy/admin/bkbn/BkbnOrdersPage.tsx` unter `/admin/bkbn-orders` (Nav „BKBN-Aufträge" in „Heute"); Tabelle (`app/src/components/bkbn/BkbnOrdersTable.tsx`) mit Termin, Adresse, Organizer, Postfach, „In Outlook öffnen"; Farb-Legende pro Mitarbeiter (`app/src/lib/bkbn.ts` → `bkbnLegend`/`bkbnShortName`)
- `app/src/components/bkbn/BkbnOrdersBanner.tsx`: Hinweis-Streifen mit Anzahl kommender BKBN-Aufträge auf `OrdersPage` und `DispositionPage` (verlinkt auf die Seite)
- `OrdersPage.tsx`: Quick-Filter-Pill „BKBN" → zeigt statt der DB-Aufträge die BKBN-Tabelle; in der Karten-Ansicht (`OrdersMapView`) werden BKBN-Termine als orange Pins (Status `bkbn`, Palette `BKBN_PALETTE` in `mapStatusColors.ts`) gerendert, Popup-Link → `/admin/bkbn-orders`
- `CalendarPage.tsx`: Toggle „Backbone-Aufträge An/Aus" (`localStorage: calendar.showBkbn`); Akzentfarbe pro Postfach, Badge „BKBN" in `HandoffCalendarView`; Detail-Panel read-only mit Organizer/Postfach; Sidebar-Legende
- KI-Assistent: Tool `get_bkbn_orders` (`app/src/lib/assistant/tools/orders.ts`) + Prompt-Hinweis in `system-prompt.ts`

**Voraussetzungen:** wie 4a (`Calendars.Read` app-only); ohne Graph → `meta.enabled=false`, Seite/Banner/Filter bleiben leer.

ENV BKBN (`booking/server.js`): `BKBN_CALENDAR_MAILBOXES` (Komma-/Leerzeichen-Liste, Default `ivan.mijajlovic@propus.ch,janez.smirmaul@propus.ch`), `BKBN_MATCH_DOMAINS` (Default `backbonephoto.co`), `BKBN_CACHE_TTL_MS` (Default `300000`), `BKBN_PAST_DAYS` (Default `10`), `BKBN_FUTURE_MONTHS` (Default `6`).

Outlook-Assistenz zusätzlich: `ASSISTANT_OUTLOOK_OVERLAY_MAILBOXES` überschreibt die Auto-Liste `{Nutzer,OFFICE_EMAIL,BKBN_MAILBOX…}` nur für `/api/internal/assistant/outlook-overlay`.

**Betrieb (Azure Admin-Consent, VPS-ENV, Verifikation):** [docs/OPS_M365_GRAPH_BKBN.md](./OPS_M365_GRAPH_BKBN.md) — Script `booking/scripts/verify-graph-bkbn-mailboxes.js` bzw. `npm run verify:graph-bkbn` im Ordner `booking/`.

---

## 5. Reschedule-Flow

```
PATCH /api/admin/orders/:orderNo/reschedule
  │
  ├── Felder aktualisieren:
  │     → schedule.date, schedule.time (neu)
  │     → schedule.durationMin wird mitgeführt, wenn die Dauer explizit geändert wurde
  │     → bestehende Reschedule-Hilfsfelder werden hier nicht separat gesetzt
  │
  ├── Kalender-Events aktualisieren (PATCH auf bestehende IDs)
  │     → Fotograf: PATCH in kanonischer + gespeicherter Mailbox versuchen
  │     → Büro: PATCH in OFFICE_EMAIL
  │     → Fallback nur wenn PATCH nicht möglich: neues Event erstellen
  │     → reine Daueränderung: keine Reschedule-Mails
  │
  └── E-Mails:
        ├── Büro (buildRescheduleOfficeEmail, alt + neu)
        ├── Fotograf (buildReschedulePhotographerEmail)
        └── Kunde (buildRescheduleCustomerEmail)
```

---

## 6. Storno-Flow

```
PATCH /api/admin/orders/:orderNo/status  (mit `status = "cancelled"`)
  │
  ├── status = "cancelled"
  ├── cancel_reason gesetzt
  ├── closed_at = NOW()
  │
  ├── Kalender-Events löschen (DELETE)
  │     → calendar_sync_status = "deleted" (oder "error" bei Fehler)
  │
  └── E-Mails:
        ├── Büro (buildCancellationOfficeEmail)
        ├── Fotograf (buildCancellationPhotographerEmail)
        └── Kunde (buildCancellationCustomerEmail)

Separater Kunden-Endpunkt:
  POST /api/customer/orders/:orderNo/cancel
```

---

## 7. Fotograf-Wechsel

```
PATCH /api/admin/orders/:orderNo/photographer
  │
  ├── photographer-Feld aktualisieren (neuer Key/Name/Email)
  │
  ├── Kalender-Events:
  │     ├── Alter Fotograf: Event löschen
  │     └── Neuer Fotograf: neues Event erstellen
  │
  └── E-Mails:
        ├── Büro (buildReassignOfficeEmail, alt + neu)
        ├── Alter Fotograf (buildReassignPhotographerEmail, role='old')
        ├── Neuer Fotograf (buildReassignPhotographerEmail, role='new')
        └── Kunde (buildReassignCustomerEmail, neuer Fotograf)
```

---

## 8. Bestätigungs-Flow

```
Kunde erhält E-Mail mit Bestätigungs-Link:
  → /api/booking/confirm/:token

GET /api/booking/confirm/:token  (confirmTokenLimiter: 10 / 15 min pro IP)
  │
  ├── Token prüfen: confirmation_token + confirmation_token_expires_at
  ├── Status: pending/provisional → confirmed
  │
  ├── Kalender-Events:
  │     ├── Provisional: upgradeToFinal (PATCH → busy)
  │     └── Pending: createFinal (neue Events)
  │
  └── E-Mails (confirmed_*):
        ├── Kunde
        ├── Büro
        └── Fotograf
```

---

## 9. Payrexx-Webhook

**Öffentlicher Endpunkt:** `POST /webhook/payrexx`  
**Proxy:** Next.js-Route `app/src/app/webhook/payrexx/route.ts` leitet den Raw-Body unverändert an Express `/tour-manager/webhook/payrexx` weiter.  
**Kontext:** Nur für Tour-Verlängerungen (nicht normale Buchungen)

```
Payrexx-Webhook (transaction.status = "confirmed"|"paid")
  │
  ├── HMAC-SHA256 Signaturprüfung (payrexx-signature Header)
  ├── referenceId parsen: "tour-{tourId}-inv-{invoiceId}"
  │
  ├── renewal_invoices UPDATE:
  │     → invoice_status = "paid"
  │     → paid_at = NOW()
  │     → payment_source = "payrexx"
  │     → subscription_start_at, subscription_end_at
  │
  ├── tours UPDATE:
  │     → status = "ACTIVE"
  │     → term_end_date = newTermEndDate
  │     → ablaufdatum = newTermEndDate
  │
  ├── [Bei Reaktivierung]:
  │     → matterport.unarchiveSpace()
  │     → tours.matterport_state = "active"
  │
  └── E-Mail: payment_confirmed / reactivation_confirmed
```

---

## 10. Exxas-Order-Sync

**Felder in `booking.orders`:**

| Feld | Bedeutung |
|---|---|
| `exxas_order_id` | Exxas-seitige Auftrags-ID |
| `exxas_status` | `not_sent` / `sent` / `error` |
| `exxas_error` | Fehlermeldung bei `error` |

**Hinweis:** Die Statusfelder sind im Schema vorhanden. Ein aktiver manueller/Cron-Sync-Pfad für Booking-Aufträge an Exxas ist im aktuellen Repo-Stand jedoch nicht klar nachweisbar. Diesen Abschnitt nur wieder konkretisieren, wenn der echte Trigger/Job im Code vorhanden ist.

---

## 11. Fotograf-Vergabe

**Datei:** `photographer-resolver.js`  
**Aufruf:** Schritt 3 im Haupt-Buchungsfluss (`resolveAnyPhotographer`)

### Zwei Modi

| | Modus A — `photographer = "any"` | Modus B — `photographer = "ivan"` (explizit) |
|---|---|---|
| Skill-Check | ✓ Pflicht | ✗ entfällt |
| Radius-Check | ✓ Pflicht | ✗ entfällt |
| Kalender-Verfügbarkeit | ✓ | ✓ |
| Feiertag / Abwesenheit | ✓ | ✓ |
| Fahrzeit | Ausschluss-Kriterium + Sortierung | Nur informativ im `decisionTrace` |
| Skill = 0 | Ausschluss (`skill_zero`) | Warning im Response |
| Kein Match | `null` → needs_admin | Fehler mit Grund |

**Skill-Warning bei expliziter Wahl (Modus B):**
```json
{
  "ok": true,
  "warnings": ["ivan: skill drohne_foto = 0 — manuelle Überprüfung empfohlen"]
}
```
Kein Block — Admin hat bewusst gewählt. Warnung ist rein informativ.

Wird nur ausgelöst wenn `photographer = "any"` im Payload. Gibt `{ key, name }` oder `null` (→ Admin muss manuell vergeben) zurück.

### Modus A: `photographer = "any"` — automatische Vergabe



Zwei Quellen werden parallel ausgewertet und mit `mergeNeededSkills()` zusammengeführt (je Skill das höhere Minimum):

**Legacy-Flags** (`services.*`):
- `services.matterport / grundriss / floorplan / tour` → Skill `matterport`
- `services.drohne / drone` → Skill `drohne_foto`
- `services.video` → Skill `video`
- `foto` ist immer gesetzt (Minimum aus `assignment.requiredSkillLevels.foto`, Default 5)

**DB-Produkte** (`required_skills`, `skill_key`, `group_key`):
- `skill_key = "drohne"` / `"dronephoto"` → `drohne_foto`
- `skill_key = "dronevideo"` → `drohne_foto` + `drohne_video` + `video`
- `group_key = "groundvideo"` → `video`
- `group_key = "tour"` oder `code = "floorplans:tour"` → `matterport`

**Matterport-Sonderregel:**
- `sqm ≥ matterportLargeSqmThreshold` (Default 300) → Mindest-Level `matterportLargeSqmMinLevel` (Default 7)
- `sqm < 300` → `max(1, baseLevel - matterportSmallSqmReduction)` (Default Reduktion 2)

Alle Schwellenwerte kommen aus DB-Settings (`assignment.*`).

### Phase 2: Fotografen filtern

Ausschlüsse in dieser Reihenfolge (früher Ausschluss verhindert weitere Prüfungen):

| Grund | Bedingung | Code |
|---|---|---|
| `not_available` | Kein freier Kalenderslot zur gebuchten Zeit | `availabilityMap[key].includes(time)` |
| `holiday_blocked` | Nationaler Feiertag (`scheduling.nationalHolidaysEnabled = true`) | `isHoliday(date)` |
| `blocked_date` | Admin-Abwesenheit (Einzeltag oder Von–Bis-Bereich) | `isDateBlocked(blocked_dates, date)` |

Danach Fahrzeit berechnen (wird für Radius-Check und Sortierung verwendet):
- Primär: OSRM-Routing → `travelMinutes`
- Fallback: Haversine-Luftlinie → `estimatedKm = travelMinutes / 0.8`

### Phase 3: Stage-Loop (Skill-Relaxation)

```
Stage 0: skillReduction = 0  (exakte Anforderungen)
Stage 1: skillReduction = 1  (Anforderungen -1)
Stage 2: skillReduction = 2  ...
...
Stage N: skillReduction = min(maxGap, 5)

maxGap = max über alle Skills von (minLevel - absoluteMinimum)
```

Nur aktiv wenn `assignment.allowSkillRelaxation = true` oder `fallbackPolicy = "allow_skill_relax"`.

Pro Stage wird `selectStageCandidates()` aufgerufen:

1. **Skill-Check:** `level >= (minLevel - skillReduction)` für jeden benötigten Skill
   - Skill-Level 0 → immer ausgeschlossen (`skill_zero`), auch bei maximaler Relaxation
   - `absoluteSkillMinimums` setzt eine Untergrenze die nicht relaxiert werden kann
2. **Radius-Check:** `estimatedKm <= max_radius_km` (pro Mitarbeiter konfiguriert)
   - Überschreitung → `radius_employee`
   - **`max_radius_km = NULL`** (oder `0` / negativ) **= Radius-Check inaktiv** (unbegrenzt). Quelle der Wahrheit: `isWithinRadiusLimit` in `photographer-resolver.js`. Das `EmployeeModal` und der PUT-Endpoint `/api/admin/photographers/:key/settings` normalisieren leer / 0 / negativ / NaN → `NULL`. Default für neue Fotografen ist leer (unbegrenzt) — nicht 30 km, wie es früher fälschlich war (siehe PR #490)

Sobald eine Stage Kandidaten liefert, wird nicht weiter relaxiert.

### Phase 4: Auswahl

Kandidaten werden sortiert nach:
1. `travelMinutes` aufsteigend (kürzeste Fahrzeit gewinnt)
2. `skillScore` absteigend bei Gleichstand (Summe der relevanten Skill-Level)

`matches[0]` wird zurückgegeben.

Keine Matches in allen Stages → `null` → `reason: "needs_admin"`

### DB-Settings (assignment.*)

| Setting | Default | Bedeutung |
|---|---|---|
| `assignment.requiredSkillLevels` | `{}` | Mindest-Level je Skill |
| `assignment.matterportLargeSqmThreshold` | `300` | Ab dieser Fläche erhöhtes Matterport-Level |
| `assignment.matterportLargeSqmMinLevel` | `7` | Mindest-Level für grosse Flächen |
| `assignment.matterportSmallSqmReduction` | `2` | Level-Reduktion für kleine Flächen |
| `assignment.fallbackPolicy` | `radius_expand_then_no_auto_assign` | Verhalten wenn kein Match |
| `assignment.allowSkillRelaxation` | `false` | Skill-Anforderungen stufenweise lockern |
| `assignment.absoluteSkillMinimums` | `{}` | Untergrenze die nie relaxiert wird |
| `scheduling.nationalHolidaysEnabled` | `true` | Feiertage blockieren alle Fotografen |

### Bekannte Schwachstellen / offene TODOs

> Diese Punkte sind dokumentiert, aber noch nicht behoben.

**`anySlotMode` ignoriert Uhrzeit** — bei `anySlotMode=true` gilt ein Fotograf als verfügbar sobald er *irgendeinen* freien Slot hat, unabhängig von der gebuchten Uhrzeit. Kann zu falschen Zuweisungen führen.

**Radius-Check auf km, nicht auf Minuten** — `estimatedKm` wird aus `travelMinutes / 0.8` berechnet (1 km ≈ 0.8 Fahrminuten, Stadtnäherung). Der Radius-Grenzwert `max_radius_km` bezieht sich aber auf km. Bei Stau oder Umwegen kann ein Fotograf innerhalb des km-Radius aber weit ausserhalb der realistischen Fahrzeit liegen.

**Kein Workload-Ausgleich** — Anzahl bestehender Buchungen pro Fotograf wird nicht berücksichtigt. Bei Gleichstand in Fahrzeit und Score entscheidet die Reihenfolge in `PHOTOGRAPHERS_CONFIG`.

**Feiertags-Check ist global** — kein per-Fotograf-Override. Entweder alle sind blockiert oder keiner.

**`foto`-Skill immer Pflicht** — `needed.foto` wird immer gesetzt (Zeile 129), auch wenn das gebuchte Paket kein Foto enthält. Prüfen ob das für reine Matterport/Drohnen-Buchungen korrekt ist.

**Hardcoded Fallback-Werte** — `matterportLargeSqmThreshold = 300` und `matterportLargeSqmMinLevel = 7` sind an mehreren Stellen im Code hardcoded (Zeilen 81–83 und 125–127), obwohl sie aus DB-Settings kommen sollten. Eine Änderung in der DB ohne Code-Anpassung hat keinen Effekt.

**`decisionTrace` wird nicht persistiert** — die Vergabe-Begründung (welche Stage, warum welcher Fotograf) ist nur im Response-Objekt verfügbar wenn `withDecisionTrace=true`. Im normalen Flow geht sie verloren. Empfehlung: `booking.orders.assignment_trace jsonb` Spalte anlegen und bei jeder automatischen Vergabe befüllen.

### Modus B: `photographer = "ivan"` — explizite Wahl

```
resolveExplicitPhotographer({ key, photographersConfig, availabilityMap, date, time, services, needed })
  │
  ├── 1. Fotograf in PHOTOGRAPHERS_CONFIG suchen → nicht gefunden: Fehler
  ├── 2. Kalender-Verfügbarkeit prüfen → nicht verfügbar: { ok: false, reason: "not_available" }
  ├── 3. Feiertag prüfen              → blockiert:       { ok: false, reason: "holiday_blocked" }
  ├── 4. Abwesenheit prüfen           → blockiert:       { ok: false, reason: "blocked_date" }
  ├── 5. Skill-Check (nur Warning, kein Ausschluss):
  │        → für jeden Skill in needed: wenn level = 0 → warning sammeln
  ├── 6. Fahrzeit berechnen (informativ, siehe §13)
  │        → travelMinutes + estimatedKm in decisionTrace
  └── Response: { ok: true, key, name, warnings[], decisionTrace }
```

Fehler-Response wenn nicht verfügbar:
```json
{ "ok": false, "reason": "not_available", "photographer": "ivan" }
```
Kein stiller Fallback auf anderen Fotografen — Admin muss explizit neu wählen.

---

## 12. Slot-Generierung

**Datei:** `slot-generator.js` (neu)  
**Aufruf:** `GET /api/availability?date=...&coords=...&duration=...`

Ersetzt die bisherige reine Kalender-Lücken-Logik durch fahrzeit-bewusste Slot-Berechnung.

### Ablauf

```
generateAvailableSlots({ photographer, date, bookingCoords, durationMinutes })
  │
  ├── 1. Tagesbuchungen laden (confirmed + provisional, sortiert nach schedule_time)
  │        → nur Buchungen mit address_lat/address_lon werden für Fahrzeit genutzt
  │
  ├── 2. Arbeitsfenster bestimmen (Mitarbeiter-Settings):
  │        work_start_time        z.B. 08:00
  │        work_end_time          z.B. 18:00
  │        earliest_departure     z.B. 07:00
  │
  ├── 3. Für jede Lücke zwischen Buchungen (inkl. vor erster / nach letzter):
  │
  │     a) startCoord bestimmen (same-day proximity):
  │          → vorherige Buchung vorhanden: address_coords der letzten Buchung
  │          → keine vorherige Buchung:     home_coord des Fotografen
  │
  │     b) Fahrzeit berechnen (§13 Routing-Service):
  │          travelToSlot   = routeMinutes(startCoord → bookingCoords, departure_time)
  │          travelFromSlot = routeMinutes(bookingCoords → nextBooking.coords, departure_time)
  │                           (nur wenn nächste Buchung vorhanden)
  │
  │     c) Frühester Slot-Beginn:
  │          earliestArrival = max(
  │            work_start_time,
  │            previousBooking.end + minBufferMinutes + travelToSlot
  │          )
  │          → beim allerersten Slot zusätzlich:
  │            earliestArrival = max(earliestArrival, earliest_departure + travelToSlot)
  │
  │     d) Spätester Slot-Beginn:
  │          latestStart = min(
  │            work_end_time - durationMinutes,
  │            nextBooking.start - minBufferMinutes - travelFromSlot - durationMinutes
  │          )
  │
  │     e) Slot verfügbar wenn earliestArrival ≤ latestStart
  │          → Slots in Intervallen (z.B. 30-Min-Raster) zwischen earliestArrival und latestStart
  │
  └── Response: [{ time, travelMinutes, fromCoords }]
```

### Same-day Proximity

```
Beispiel:
  Ivan hat 09:00–11:00 in St. Gallen (Koordinaten gespeichert)
  Neue Buchung: 12:00 in Rorschach, ~20 Min von St. Gallen

  Ohne same-day proximity: Fahrzeit von Zuhause (Zürich) ~90 Min → Slot 12:00 nicht anbietbar
  Mit same-day proximity:  Fahrzeit von St. Gallen ~20 Min + Buffer 30 Min → Slot 11:30 / 12:00 anbietbar
```

Voraussetzung: `address_lat` und `address_lon` werden bei jeder Buchung in `booking.orders` gespeichert.

### Neue Mitarbeiter-Settings

| Setting | Beispiel | Bedeutung |
|---|---|---|
| `work_start` | `08:00` | Früheste On-site-Arbeitszeit |
| `work_end` | `18:00` | Spätestes Arbeitsende |
| `earliest_departure` | `07:00` | Ab wann darf losgefahren werden |
| `scheduling.minBufferMinutes` | `30` | Globaler Mindestpuffer zwischen zwei Einsätzen (Min) |

### Neue Felder in `booking.orders`

| Feld | Typ | Bedeutung |
|---|---|---|
| `address_lat` | `float` | Breitengrad der Buchungsadresse |
| `address_lon` | `float` | Längengrad der Buchungsadresse |
| `assignment_trace` | `jsonb` | Vergabe-Begründung (decisionTrace) |

---

## 13. Routing-Service

**Datei:** `travel.js` (erweitert)

Zentraler Service für alle Fahrzeit-Berechnungen im System (Slot-Generierung, Vergabe-Resolver, Radius-Check).

### Fallback-Kette

```
1. Google Maps Distance Matrix API  (departure_time → traffic-aware)
2. Google Maps Distance Matrix API  (ohne departure_time → historischer Durchschnitt)
3. OSRM lokal                       (kein Traffic)
4. Haversine × 1.4 Faktor           (Luftlinie, letzter Ausweg)
```

Timeout pro Stufe: 2000ms. Bei Überschreitung sofort nächste Stufe.

### Google Maps Distance Matrix

```
GET https://maps.googleapis.com/maps/api/distancematrix/json
  ?origins={lat},{lon}
  &destinations={lat},{lon}
  &mode=driving
  &departure_time={unix_timestamp}   ← geplanter Abfahrtszeitpunkt
  &traffic_model=pessimistic         ← für Puffer-Berechnung (intern)
  &traffic_model=best_guess          ← für Slot-Anzeige (Kunde)
  &key={GOOGLE_API_KEY}

Antwort: duration_in_traffic.value (Sekunden, stauberücksichtigt)
```

**`traffic_model`-Empfehlung:**
- `pessimistic` — interne Puffer-Berechnung, lieber einen Slot weniger anbieten
- `best_guess` — Slot-Anzeige im Buchungsformular

### Caching

```
cache_key = "{origin_geohash6}:{dest_geohash6}:{weekday}:{hour}"
ttl       = 6 Stunden
```

Geohash Precision 6 ≈ ~1km Genauigkeit. Feinere Auflösung bringt kaum Mehrwert bei exponentiell mehr Cache-Einträgen.

### Puffer-Berechnung

```javascript
buffer = Math.max(
  minBufferBetweenJobs,                    // fixer Mindestpuffer (Setting)
  duration_in_traffic_minutes + minBuffer  // Fahrzeit + Puffer
)
```

`duration_in_traffic` allein ist nicht der Buffer — Fotograf braucht Zeit für Equipment, Übergabe, kurze Pause.

### Settings

| Setting | Beispiel | Bedeutung |
|---|---|---|
| `routing.provider` | `google` | `google` / `osrm` / `haversine` |
| `routing.googleApiKey` | `AIza...` | Google Maps API-Key |
| `routing.trafficModel` | `pessimistic` | Modell für interne Berechnung |
| `routing.trafficModelDisplay` | `best_guess` | Modell für Kunden-Anzeige |
| `routing.cacheHours` | `6` | Cache-TTL |
| `routing.timeoutMs` | `2000` | Fallback-Trigger pro Stufe |
| `scheduling.minBufferMinutes` | `30` | Mindestpuffer zwischen Einsätzen |

---

## 14. Magic-Link in Buchungs-Mail

Nach erfolgreichem Buchungsabschluss (`POST /api/booking`) wird ein persönlicher Magic-Link generiert und in die Bestätigungs-E-Mail eingebettet.

**Funktion:** `createCustomerPortalMagicLink(billing)` in `booking/server.js`

```
Buchungsabschluss
  │
  ├── Kunde in core.customers suchen / anlegen
  ├── Firma sicherstellen (ensureCompanyByName)
  ├── company_member erstellen
  ├── Token (random hex) → INSERT booking.customer_sessions
  └── Link: /auth/customer/magic?magic=<token>&returnTo=<path>
```

**Endpunkt:** `GET /auth/customer/magic` setzt Cookie `customer_session` und leitet weiter.

Vollständige Dokumentation: [docs/FLOWS_AUTH.md §5](./FLOWS_AUTH.md#5-magic-link-flow-buchungs-mail)

---

## 15. Kunden-Profil-Vorausfüllung (StepBilling)

Angemeldete Portal-Kunden sehen im Buchungs-Wizard (Schritt 4 — Rechnungsadresse) ihre gespeicherten Profil-Daten automatisch vorausgefüllt.

**Dateien:**
- `app/src/hooks/useCustomerProfile.ts` — Hook, ruft `/api/auth/profile` auf
- `app/src/api/customer.ts` — `getCustomerProfile()` Fetch-Funktion
- `app/src/pages-legacy/booking/StepBilling.tsx` — `useEffect` zum Vorausfüllen

**Ablauf:**

```
StepBilling mountet
  │
  ├── useCustomerProfile() → GET /api/auth/profile  (nur wenn isKundenRole)
  │     → { email, name, company, phone, street, zipcity }
  │
  └── useEffect([profile]):
        Felder nur setzen wenn noch leer (kein Überschreiben bereits eingetippter Werte)
        zipcity-Parsing: /^(?:CH-?)?(\d{4})\s+(.+)$/i
          → billing.zip  = match[1]   z.B. "8001"
          → billing.city = match[2]   z.B. "Zürich"
```

**Login-Hinweis-Banner:** Nicht angemeldete Benutzer sehen einen Hinweis mit Link zur Login-Seite (`/login?returnTo=<aktuelle-URL>`).

**Profil-Vorausfüll-Banner:** Angemeldete Kunden sehen eine Bestätigung, dass Profil-Daten verwendet wurden (`booking.step4.profilePrefilled`).

**Auth-Endpunkt:** Vollständige Dokumentation → [docs/FLOWS_AUTH.md §4](./FLOWS_AUTH.md#4-kunden-profil-endpunkt-get-authprofile)

---

## 16. Rate-Limiting & Security-Header

**Datei:** `booking/rate-limiters.js` (neu in PR #89)  
**Eingebunden in:** `booking/server.js`

### Rate-Limiter

Vier vorkonfigurierte `express-rate-limit`-Instanzen schützen sicherheitskritische Endpunkte. Alle Limiter nutzen `req.ip` (Trust-Proxy aktiv, echte Client-IP hinter Cloudflare/Nginx). Defaults via ENV überschreibbar.

| Limiter | Endpunkte | Default-Limit | Fenster | ENV-Override |
|---|---|---|---|---|
| `authLimiter` | `POST /api/admin/login`, `POST /auth/login` | 5 Versuche | 15 min | `RATE_LIMIT_AUTH_MAX`, `RATE_LIMIT_AUTH_WINDOW_MS` |
| `confirmTokenLimiter` | `GET /api/booking/confirm/:token` | 10 Versuche | 15 min | `RATE_LIMIT_CONFIRM_MAX`, `RATE_LIMIT_CONFIRM_WINDOW_MS` |
| `passwordResetLimiter` | Forgot-Password-Endpunkte | 3 Versuche | 60 min | `RATE_LIMIT_PASSWORD_RESET_MAX`, `RATE_LIMIT_PASSWORD_RESET_WINDOW_MS` |
| `bookingLimiter` | `POST /api/booking` | 10 Submits | 60 min | `RATE_LIMIT_BOOKING_MAX`, `RATE_LIMIT_BOOKING_WINDOW_MS` |

**Besonderheiten:**
- `authLimiter` hat `skipSuccessfulRequests: true` — nur fehlgeschlagene Logins (4xx/5xx) zählen gegen das Budget. Grund: Shared-NAT (Office, VPN) könnte mit normalen Logins das 5er-Budget aufbrauchen.
- `confirmTokenLimiter` ist eine eigene Instanz (nicht `authLimiter`), damit Confirm-Link-Spam nicht das Admin-Login-Budget beeinflusst.
- Alle Limiter senden `429 Too Many Requests` mit deutschsprachiger JSON-Fehlermeldung.
- Response-Header: `RateLimit-*` im Draft-7-Format (`standardHeaders: "draft-7"`).

### Helmet Security-Header

`booking/server.js` setzt via `helmet` die Standard-Security-Header:

| Header | Wert |
|---|---|
| `Strict-Transport-Security` | Default (max-age=15552000) |
| `X-Content-Type-Options` | nosniff |
| `X-Frame-Options` | SAMEORIGIN |
| `Referrer-Policy` | no-referrer |
| `Content-Security-Policy` | **deaktiviert** — Admin-SPA lädt Assets von NAS/Cloudflare/Google Maps |
| `Cross-Origin-Embedder-Policy` | **deaktiviert** — gleicher Grund |
| `Cross-Origin-Resource-Policy` | cross-origin — NAS-Bilder in Admin-Oberfläche ladbar |

---

## 17. API-Key-Verwaltung (CRUD)

**Datei:** `booking/server.js`, `booking/db.js`
**Frontend:** `app/src/pages-legacy/settings/ApiKeysSection.tsx`, `app/src/api/apiKeys.ts`
**Migration:** `core/migrations/039_api_keys.sql`

Langlebige API-Tokens fuer Integrationen und CI-Jobs. Tokens werden einmalig bei Erstellung angezeigt (wie GitHub/Stripe Personal Access Tokens). Verwaltung im Settings-UI unter Tab "API-Keys".

### Endpunkte

| Methode | Pfad | Auth | Rate-Limit | Beschreibung |
|---|---|---|---|---|
| `GET` | `/api/admin/api-keys` | `requireAdmin` + `api_keys.manage` | — | Alle Keys auflisten (inkl. revozierte), JOIN auf `admin_users` fuer Ersteller-Info |
| `POST` | `/api/admin/api-keys` | `requireAdmin` + `api_keys.manage` | `authLimiter` | Neuen Key erstellen; gibt `{ key, token }` zurueck — `token` ist der Klartext (einmalig!) |
| `DELETE` | `/api/admin/api-keys/:id` | `requireAdmin` + `api_keys.manage` | `authLimiter` | Soft-Revoke: setzt `revoked_at = NOW()` |

### Token-Erstellung (POST)

```
POST /api/admin/api-keys  { label }
  │
  ├── Validierung: label nicht leer, max. 200 Zeichen
  ├── crypto.randomBytes(32).toString("base64url")
  │     → token = "ppk_live_<base64url>"
  │     → tokenHash = SHA-256(token)
  │     → prefix = token.slice(0, 12)
  ├── created_by = Number(req.user.id) → db.getAdminUserById(adminId)
  │     → numerische admin_users.id wird direkt verwendet (kein Username-Lookup)
  ├── INSERT INTO core.api_keys
  └── Response 201: { key: {...}, token: "ppk_live_..." }
```

### Frontend (ApiKeysSection)

- Tab "API-Keys" in SettingsPage, sichtbar fuer `super_admin`, `admin` oder Permission `api_keys.manage`
- Erstell-Formular mit Label-Eingabe
- Einmaliger Token-Anzeige-Banner (Amber-Box) mit Kopieren-Button
- Tabelle aktiver Keys (Label, Prefix, Ersteller, Erstellt am, Zuletzt genutzt, Revoke-Button)
- Tabelle revozierter Keys (Label, Prefix, Revoziert am)

---

## 18. Admin-Panel SPA-Auslieferung

*Seit PR #94 (April 2026).* Das Booking-Admin-Panel (`booking/admin-panel/`) ist ein Vite/React-SPA, das von `booking/server.js` ausgeliefert wird. **Deprecated** — neue Features nach `app/src/`.

### Next.js Admin-Bestell-Detail

Neue Bestell-Detailseiten liegen in `app/src/app/(admin)/orders/[id]/...` und werden unter `/orders/:id` ausgeliefert. Erwartete/alte Admin-Links unter `/admin/orders/:id` werden in `app/next.config.ts` per Redirect auf `/orders/:id` normalisiert; Unterseiten wie `/admin/orders/:id/verknuepfungen` landen damit auf `/orders/:id/verknuepfungen`.

Die Tabbar im Bestell-Detail navigiert direkt auf die Subroutes (`/objekt`, `/leistungen`, `/termin`, `/kommunikation`, `/dateien`, `/verknuepfungen`, `/verlauf`). Verknuepfungen und Verlauf sind keine versteckten Inline-Buttons mehr.

Die Verknuepfungsseite laedt neben dem aktuellen Link-Status die 10 neuesten unverknuepften Matterport-Touren aus `tour_manager.tours` (`booking_order_no IS NULL`) und erlaubt das direkte Verknuepfen per Tour-ID. Die manuelle Eingabe von Matterport-Space-ID oder `my.matterport.com/show/?m=...` bleibt als Fallback erhalten.

Mutationen laufen ueber die stabile POST-Route `/orders/:id/verknuepfungen/mutate` mit `_action` (`link-matterport`, `link-suggested-matterport`, `unlink-matterport`, `link-gallery`, `unlink-gallery`). Die Formulare verwenden bewusst keine gehashten Next Server Actions, damit nach einem Deploy bereits offene Bestellseiten nicht mit `UnrecognizedActionError` scheitern.

### Routing in `booking/server.js`

```
ADMIN_PANEL_DIST = process.env.ADMIN_PANEL_DIST
  || path.join(__dirname, "admin-panel", "dist")

Falls dist-Verzeichnis existiert:
  express.static(ADMIN_PANEL_DIST)
  GET /^(?!\/api|\/auth).*$/  → index.html   (SPA Catch-all)
```

- Alle `/api/*`- und `/auth/*`-Routen werden **nicht** vom Catch-all erfasst.
- Wenn das dist-Verzeichnis nicht existiert (kein Build), zeigt die Root-Route einen Hinweis.
- Frontend-Logs (`POST /api/logs`) werden mit `source: "admin-panel"` getaggt (vorher `"booking-backend"`).

---

## 19. CI & HTML-Lint (Booking-Backend)

**Workflow:** [`.github/workflows/booking-ci.yml`](../.github/workflows/booking-ci.yml) — läuft bei PR und `push` auf `master`, sobald **`booking/**`** oder diese Workflow-Datei geändert wird (läuft **nicht** bei reinen Änderungen an `app/` ohne Booking-Touch).

| Schritt | Befehl (Working Directory `booking/`) | Zweck |
|---|---|---|
| Abhängigkeiten | `npm ci` | Reproduzierbar wie auf dem VPS/Dev |
| Unit-Tests | `npm test` (`node:test`, `tests/*.test.js`) | Reine Logiktests (Pricing, RBAC-Presets, Order-Transitions, Storage-Hilfen) ohne laufende Postgres — DB-Zugriff erfolgt erst in Routen/async-Pfaden bzw. lazy `require("./db")` |
| HTML-Lint | `npm run lint:html` (htmlhint + [`.htmlhintrc`](../booking/.htmlhintrc)) | Statische Checks auf `booking/*.html` (Legacy-Admin-Spa tolerante Regeln) |

Siehe Gesamtüberblick CI vs. VPS-Deploy: [`DEPLOY-FLOW.md`](DEPLOY-FLOW.md) (Abschnitt *Unit-Tests / Lint*).

## 20. Mobile Tagesplan & Live-Routing

**Komponenten:** [`app/src/pages-legacy/mobile/MobileOrdersTab.tsx`](../app/src/pages-legacy/mobile/MobileOrdersTab.tsx) · [`MobileOrdersUI.tsx`](../app/src/pages-legacy/mobile/MobileOrdersUI.tsx) · [`dayBuckets.ts`](../app/src/pages-legacy/mobile/dayBuckets.ts) · [`departureLogic.ts`](../app/src/pages-legacy/mobile/departureLogic.ts) · [`useDriveTimesFromLive.ts`](../app/src/pages-legacy/mobile/useDriveTimesFromLive.ts)

Tagesplan-Ansicht für Fotograf:innen unter `/mobile` (Aufträge-Tab). Gruppiert offene Bestellungen in **Heute / Morgen / Diese Woche / Später** und zeigt pro Termin Live-Fahrzeit + Abfahrtszeit-Eskalation. Reuse von `useGeolocation` (Cockpit) + `missionTimeline.ts` (Dashboard-v2) + `/api/dashboard/drive-times` (Distance-Matrix-API mit Rate-Limit aus Bug-Hunt M01).

### Daten-Pipeline

```
GET /api/admin/orders                  ← alle offenen Bestellungen
  ↓
bucketOrdersByDay()                    ← klassifiziert nach Tagesgruppe
  ↓
useGeolocation()                       ← User-Opt-In, navigator.geolocation
  ↓
useDriveTimesFromLive()                ← Debounce 450 ms, Abort-Controller
  → POST /api/dashboard/drive-times   ← max 25 Legs, Live-Verkehr
  ↓
missionTimeline.estimateDriveMinutes() ← Fallback ohne Geo (ZIP-Haversine, 28 km/h, +5 min Setup)
  ↓
departureLogic.computeDeparture()      ← Termin − Fahrt − 15 min Puffer
  ↓
Eskalations-UI                         ← passed / now / soon / ok
```

### Tagesgruppen ([`dayBuckets.ts`](../app/src/pages-legacy/mobile/dayBuckets.ts))

| Bucket | Definition | Sortierung |
|---|---|---|
| `today` | Termin heute (start-of-day bis +24 h) | aufsteigend nach Uhrzeit |
| `tomorrow` | Termin morgen (+24 h bis +48 h) | aufsteigend nach Uhrzeit |
| `week` | Termin nach Morgen, bis Ende der laufenden Kalenderwoche (So 23:59:59) | aufsteigend |
| `later` | Ab Mo der Folgewoche, oder kein `appointmentDate`, oder Vergangenheit ohne `done` | absteigend (jüngste zuerst), per Default collapsed |

Default-versteckte Statuses (per `DEFAULT_HIDDEN_STATUSES` in `dayBuckets.ts`): `closed`, `cancelled`. Stornierte gehoeren nicht in den Tagesplan; wer sie explizit braucht, nutzt einen anderen Pfad oder hebt das Hide via Filter-Sheet auf.

### Tour-Routing (Heute & Morgen)

- **Erster Termin am Tag:** Fahrtquelle = aktuelle GPS-Position (oder PLZ `8005` Studio-Fallback)
- **Folgetermin:** Fahrtquelle = Adresse des **vorigen** Termins (chained)
- **Tour-Divider** zwischen Same-Day-Terminen: `(next.appt - cur.appt)` als Pause-Anzeige + Hinweis auf nächste Fahrtzeit + Engpass-Warnung wenn `Pause - Fahrt - Puffer < 30 min`
- **Heimfahrt-Divider** nach letztem Tagestermin: Fahrtzeit zur `home_address` aus `photographer_settings` (geladen via `GET /api/admin/me/home`)

### Abfahrts-Eskalation ([`departureLogic.ts`](../app/src/pages-legacy/mobile/departureLogic.ts))

```
leaveAt = appointmentDate − travelMin − BUFFER_MIN (= 15 min)
minutesUntilLeave = leaveAt − now

→ < -2     : passed (durchgestrichen)
→ ≤ 15 min : now    (rote Pulse-Pille, ARIA-live)
→ ≤ 60 min : soon   (gelbe Pille mit "in X min")
→ > 60 min : ok     (grüne Pille)
```

Eskalation rerendered jede 60 s via Effect-Tick (Phase 5 Polish: aktuell statisch beim Mount).

### Live-Drive-Times-Hook

`useDriveTimesFromLive({ lat, lng, enabled, legs })` — extrahiert aus `dashboard-v2/TodayCard`:

- Debounce 450 ms vor jedem Fetch (verhindert Flood bei rascher Position-Update-Folge)
- `AbortController` cancelt veraltete Requests bei Re-Render
- Maximal 25 Legs pro Request (MAX_LEGS Server-side)
- Bei `enabled=false` (Geo aus) → idle, leere Map
- Liefert `{ byOrderNo: Record<string, { durationText, distanceText? }>, loading, error }`

### Heim-Adresse-Lookup

Mount-once Fetch von `GET /api/admin/me/home`:

```sql
SELECT ps.home_address, ps.home_lat, ps.home_lon
  FROM photographer_settings ps
  JOIN photographers p ON p.key = ps.photographer_key
 WHERE LOWER(p.email) = LOWER($1)
 LIMIT 1
```

Match via E-Mail aus Session. Admins ohne Mitarbeiter-Verknüpfung → `null` für alle Felder, UI zeigt „keine Heim-Adresse hinterlegt".

### Rate-Limits & Budget

`/api/dashboard/drive-times` aus Bug-Hunt M01:

- 30 Anfragen/Minute pro Session (Default, via `DRIVE_TIMES_PER_MIN_LIMIT`)
- 1000 Anfragen/Tag pro Session (Default, via `DRIVE_TIMES_PER_DAY_LIMIT`)
- Distance Matrix kostet ~$0.005 pro Element → 25 Legs ≈ $0.125 pro Request
- Ausnahmen via `ASSISTANT_UNLIMITED_EMAILS`-Liste

Mobile-Strategie: Drive-Times werden NUR für Heute + Morgen geladen (≤ ~10 Legs typisch). Diese Woche & Später nutzen ZIP-Schätzung (kein API-Cost).

### Ausgeblendete / collapsed Sections

- `later` per Default collapsed (zu lange Liste)
- Empty-State pro `today`/`tomorrow` falls Bucket leer: „Tag frei · keine Termine"

### Verwandte Doku

- `docs/openapi/openapi.yaml` — `getApiAdminMeHome` + `postApiDashboardDriveTimes`
- §11 Fotograf-Vergabe (Slot-Generierung nutzt selben travel.js-Service)
- §13 Routing-Service (Backend-Fallback-Kette für Distance Matrix)
- `dashboard-v2/missionTimeline.ts` — Schweizer ZIP-Tabelle + Haversine + 28 km/h-Schätzung

## 21. KI-Auftragsanlage via Propi (`create_order`-Tool)

**Ziel**: Auftragsanlage über den Admin-Chat-Assistenten so eng am manuellen Admin-Form, dass kein Office-Nacharbeiten nötig ist (Preise, Kontaktperson, Schlüsselabholung).

### Tool-Schema-Highlights

| Parameter | Pflicht | Wirkung |
|---|---|---|
| `customer_id` + `address` | ja | Stammdaten + Objektadresse |
| `service_items: [{code, qty?}]` | bevorzugt | Resolved gegen `booking.products` + `booking.pricing_rules` → echte Positionen + Total |
| `services: {photography, …}` (Booleans) | Fallback | DEPRECATED — System-Prompt verbietet das, weil kein Pricing entsteht |
| `custom_items: [{label, price, qty?}]` | optional | Ad-hoc Positionen für Sonderwünsche (z. B. Rendering, Reisepauschale) — Preis vom Nutzer bestätigt |
| `key_pickup: {address, info}` | optional | Setzt `services.options.keyPickup`. Zusammen mit `service_items: [{code:"keypickup:main"}]` |
| `booking_kind: "fixed"\|"flexible"` | ja | `"flexible"` → Status `disposition_offen` |
| `deadline_at` | bei flex Pflicht | Office disponiert bis dahin |
| `skip_customer_email` | optional | `true` → Kunden-Bestätigungsmail wird NICHT enqueued. Office-Mail bleibt |

### System-Prompt-Regeln (lib/assistant/system-prompt.ts)

- **Grundregel**: Im Zweifel fragen statt annehmen.
- **Regel 1a**: Bei mehreren `customer_contacts` MUSS Propi den Kontakt erfragen.
- **Regel 3a/3b/3c**: `service_items` mit Codes zwingend; bei unbekanntem Service → `custom_items` nach Preisbestätigung; Schlüsselabholung = `keypickup:main` + `key_pickup`-Block.
- **Regel 7**: Zusammenfassung mit Total + Kontaktperson, dann Bestätigungspflicht.
- **Regel 8**: Nach `create_order` `pricing._note` aktiv weitermelden.
- **Regel 9**: `skip_customer_email: true` bei "keine Mail an Kunde", "Test-Buchung", "still anlegen".

### Click-Antworten (Suggestion-Chips)

Bot hängt am Ende einer Auswahlfrage `[[OPTIONS: a | b | c]]` an. UI parst (`extractSuggestions` in `app/src/lib/assistant/suggestions.ts`), entfernt den Marker aus der Anzeige und rendert Buttons. Klick sendet die Option als nächste User-Message. Cap: 8 Optionen, je ≤80 Zeichen.

### Critical Files

| Was | Datei |
|---|---|
| Tool-Schema + Handler | `app/src/lib/assistant/tools/writes.ts` (~`create_order`) |
| System-Prompt | `app/src/lib/assistant/system-prompt.ts` |
| Few-Shots | `app/src/lib/assistant/few-shot-examples.ts` |
| Suggestion-Helper | `app/src/lib/assistant/suggestions.ts` |
| Chat-UI Render | `app/src/app/(admin)/assistant/_components/ConversationView.tsx` |
| Tests | `app/src/__tests__/{assistantWrites,assistantFewShots,suggestions,statusCoverage}.test.ts` |
