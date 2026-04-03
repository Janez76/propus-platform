# Propus Platform — Buchungs-Flows

> **Automatisch mitpflegen:** Bei jeder Änderung an Buchungslogik, Status-Übergängen, Kalender-Sync oder Provisional-Flow dieses Dokument aktualisieren. Cursor-Regel `.cursor/rules/data-fields.mdc` erinnert daran.

*Zuletzt aktualisiert: April 2026*

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
  ├── 3. "any"-Fotograf auflösen (resolveAnyPhotographer)
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
pending → provisional → confirmed → completed → done
        ↘              ↗
         → cancelled
                     → archived
         → paused
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
  │     → last_reschedule_old_date, last_reschedule_old_time (alt, für E-Mails)
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
PATCH /api/admin/orders/:orderNo/cancel  (oder via Status-Änderung)
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
```

---

## 7. Fotograf-Wechsel

```
PATCH /api/admin/orders/:orderNo/reassign
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
  → /api/orders/:orderNo/confirm?token=XXX

GET /api/orders/:orderNo/confirm
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

**Endpunkt:** `POST /portal/webhook/payrexx`  
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

**Sync-Logik:** Wird manuell oder via Cron ausgelöst. Überträgt Auftragsdaten an Exxas-API (`POST /api/v2/orders`). Bei Erfolg: `exxas_status = "sent"`, `exxas_order_id` gesetzt.
