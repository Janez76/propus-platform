# Propus Platform — Buchungs-Flows

> **Automatisch mitpflegen:** Bei jeder Änderung an Buchungslogik, Status-Übergängen, Kalender-Sync oder Provisional-Flow dieses Dokument aktualisieren. Cursor-Regel `.cursor/rules/data-fields.mdc` erinnert daran.

*Zuletzt aktualisiert: April 2026 (§15 Kunden-Profil-Vorausfüllung via /auth/profile)*

---

## Inhaltsverzeichnis

1. [Haupt-Buchungsfluss (POST /api/booking)](#1-haupt-buchungsfluss)
2. [Provisorische Buchung](#2-provisorische-buchung)
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

---

## 1. Haupt-Buchungsfluss

**Endpunkt:** `POST /api/booking`  
**Datei:** `booking/server.js`

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
  │        │     → INSERT INTO customers (email,name,company,phone,street,zipcity)
  │        │     → ON CONFLICT UPDATE (name,company,phone,street,zipcity)
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
  │        │     ├── logtoOrgSync.ensureOrganizationForCompany()
  │        │     ├── logtoOrgSync.addCompanyMemberToLogtoOrg()
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

## 3. Status-Übergänge

**Mögliche Status-Werte:**

```
pending     → provisional → confirmed → completed → done → archived
   │              │            │            │
   ├→ paused      ├→ paused    ├→ paused    └→ archived
   ├→ cancelled   └→ cancelled └→ cancelled
   ├→ archived
   └→ confirmed / completed / done

paused    → pending / provisional / cancelled
cancelled → archived
archived  → pending

Sonderfall:
provisional → pending nur automatisch via expiry_job
```

| Status | Bedeutung | Kalender |
|---|---|---|
| `pending` | Offen / noch nicht bearbeitet | — |
| `provisional` | Provisorisch reserviert | tentative |
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
- **Storno:** DELETE auf beide Event-IDs. 404 = bereits gelöscht (ok). Andere Fehler → `calendar_delete_queue` für Retry.

### `calendar_sync_status`-Werte

| Wert | Bedeutung |
|---|---|
| `tentative` | Provisorische Events aktiv |
| `final` | Finale Events aktiv |
| `deleted` | Events gelöscht |
| `error` | Lösch-Fehler, in Retry-Queue |
| null | Noch kein Sync |

---

## 5. Reschedule-Flow

```
PATCH /api/admin/orders/:orderNo/reschedule
  │
  ├── Felder aktualisieren:
  │     → schedule.date, schedule.time (neu)
  │     → bestehende Reschedule-Hilfsfelder werden hier nicht separat gesetzt
  │
  ├── Kalender-Events aktualisieren (PATCH auf bestehende IDs)
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

GET /api/booking/confirm/:token
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
  ├── company_member erstellen + Logto-Org-Sync
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
