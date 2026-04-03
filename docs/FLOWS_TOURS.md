# Propus Platform — Tour-Manager Flows

> **Automatisch mitpflegen:** Bei jeder Änderung an Tour-Status, Matterport-Integration, Verlängerungs- oder Archivierungs-Logik dieses Dokument aktualisieren.

*Zuletzt aktualisiert: April 2026*

---

## Inhaltsverzeichnis

1. [tour_manager.tours — Alle Felder](#1-tourmanagertours--alle-felder)
2. [Status-Maschine](#2-status-maschine)
3. [Matterport-Integration](#3-matterport-integration)
4. [Verlängerungs-Flow (Portal)](#4-verlängerungs-flow-portal)
5. [Archivierungs-Flow](#5-archivierungs-flow)
6. [Bank-Import](#6-bank-import)
7. [KI / AI-Suggestions](#7-ki--ai-suggestions)
8. [Incoming-Emails](#8-incoming-emails)
9. [Cron-Jobs Übersicht](#9-cron-jobs-übersicht)
10. [Kanonische Felder (normalizeTourRow)](#10-kanonische-felder)

---

## 1. `tour_manager.tours` — Alle Felder

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | SERIAL PK | Interne Tour-ID |
| `exxas_abo_id` | TEXT | Exxas-Vertragsreferenz (alt) |
| `exxas_subscription_id` | TEXT | Exxas-Vertragsfeld (neu, Migration 012) |
| `matterport_space_id` | TEXT | Matterport Space-ID |
| `tour_url` | TEXT | Tour-URL (z.B. `https://my.matterport.com/show/?m=XXX`) |
| `kunde_ref` | TEXT | Exxas-Kunden-Referenz |
| `customer_id` | INT → core.customers | FK zum Stammkunden |
| `customer_name` | TEXT | Firmenname des Kunden |
| `customer_email` | TEXT | Kunden-E-Mail (für E-Mails) |
| `customer_contact` | TEXT | Ansprechpartner (Name für Anrede) |
| `bezeichnung` | TEXT | Tour-Bezeichnung (Legacy) |
| `object_label` | TEXT | Objekt-Label (bevorzugt) |
| `matterport_created_at` | TIMESTAMPTZ | Erstelldatum des Matterport-Modells |
| `term_end_date` | DATE | Ablaufdatum des Abonnements |
| `ablaufdatum` | DATE | Ablaufdatum (Legacy) |
| `matterport_state` | VARCHAR(50) | `active`, `inactive`, `processing`, `failed`, `pending`, `staging` |
| `matterport_is_own` | BOOLEAN | Space im eigenen Matterport-Account? |
| `matterport_start_sweep` | TEXT | Start-Scan-ID (`ts=` URL-Parameter, Migration 014) |
| `booking_order_no` | INT | Verknüpfung mit `booking.orders.order_no` (Migration 021) |
| `last_email_sent_at` | TIMESTAMPTZ | Letzter E-Mail-Versand (Cooldown-Logik, Migration 020) |
| `archiv` | BOOLEAN | Archiv-Flag (Legacy) |
| `archiv_datum` | DATE | Datum der Archivierung |
| `status` | TEXT DEFAULT 'ACTIVE' | Workflow-Status (s. Status-Maschine) |
| `customer_verified` | BOOLEAN DEFAULT FALSE | Kundenzuordnung manuell verifiziert |
| `customer_intent` | VARCHAR(30) | KI-erkannte Absicht (`renew_yes`, `renew_no`, `transfer_requested`, etc.) |
| `customer_intent_source` | VARCHAR(30) | Woher erkannt (`approved_suggestion`, `manual`, etc.) |
| `customer_intent_note` | TEXT | KI-Begründung |
| `customer_intent_confidence` | NUMERIC(5,2) | Konfidenz 0–100 |
| `customer_intent_updated_at` | TIMESTAMPTZ | Letztes Update |
| `customer_transfer_requested` | BOOLEAN DEFAULT FALSE | Übertragung angefragt |
| `customer_billing_attention` | BOOLEAN DEFAULT FALSE | Billing-Attention-Flag |
| `created_at` | TIMESTAMPTZ | Erstellzeitpunkt |
| `updated_at` | TIMESTAMPTZ | Letzter Update |

**Kanonische (berechnete) Felder — kein DB-Persist, via `normalizeTourRow()`:**

| Feld | Berechnung |
|---|---|
| `canonical_object_label` | `object_label \|\| bezeichnung` |
| `canonical_customer_name` | `customer_name \|\| kunde_ref` |
| `canonical_term_end_date` | `term_end_date \|\| ablaufdatum` |
| `canonical_matterport_space_id` | `matterport_space_id \|\| extractSpaceIdFromTourUrl(tour_url)` |
| `canonical_exxas_contract_id` | `exxas_abo_id \|\| exxas_subscription_id` |

---

## 2. Status-Maschine

```
ACTIVE
  │
  ├─→ EXPIRING_SOON          (Ablaufdatum naht, Verlängerungs-E-Mail gesendet)
  │     │
  │     └─→ AWAITING_CUSTOMER_DECISION   (Ja/Nein-Links in E-Mail)
  │           │
  │           ├─→ CUSTOMER_ACCEPTED_AWAITING_PAYMENT  (Verlängerung bestätigt)
  │           │     │
  │           │     └─→ ACTIVE           (Zahlung eingegangen)
  │           │
  │           └─→ CUSTOMER_DECLINED      (Archivierung eingeleitet)
  │                 │
  │                 └─→ ARCHIVED
  │
  └─→ EXPIRED_PENDING_ARCHIVE  (Ablaufdatum überschritten)
        │
        └─→ ARCHIVED
```

---

## 3. Matterport-Integration

### Auth & API

- **Basic Auth:** `base64(MATTERPORT_TOKEN_ID:MATTERPORT_TOKEN_SECRET)`
- **API-Keys auch in:** `tour_manager.settings` (Key `matterport_api_credentials`) — Priorität über ENV
- **GraphQL-Endpunkt:** `https://api.matterport.com/api/models/graph`
- **Timeout:** 15 Sekunden
- **Credentials-Cache:** 30 Sekunden

### Was in DB gespeichert wird

| DB-Feld | Quelle |
|---|---|
| `matterport_space_id` | Manuell verknüpft oder aus `tour_url` extrahiert |
| `matterport_state` | Von API (`model.state`) |
| `matterport_is_own` | Vergleich mit eigenen Models (`listModels()`) |
| `matterport_created_at` | Aus `model.created` |
| `matterport_start_sweep` | Manuell gesetzt |

### Was NICHT in DB gespeichert wird (live von API)

- `visibility` / `accessVisibility`
- `publication.url`
- `publication.address` (wird virtuell als `tour.object_address` befüllt)
- Modell-Options (dollhouse, floorplan, etc.)

### Portal-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `GET /portal/api/tours/:id/matterport-model` | Vollständiges Matterport-Modell |
| `POST /portal/api/tours/:id/set-start-sweep` | `matterport_start_sweep` setzen |
| `POST /portal/api/tours/:id/matterport-options` | Sichtbarkeits-Optionen setzen (GraphQL) |
| `POST /portal/api/tours/:id/visibility` | Visibility ändern (`PRIVATE`/`LINK_ONLY`/`PUBLIC`/`PASSWORD`) |

**Erlaubte Override-Felder (`matterport-options`):**
- `defurnishViewOverride`, `dollhouseOverride`, `floorplanOverride`, `socialSharingOverride`
- `vrOverride`, `highlightReelOverride`, `labelsOverride`, `tourAutoplayOverride`, `roomBoundsOverride`
- Werte: `'enabled'` | `'disabled'` | `'default'`

### Admin-Endpunkte (zusätzlich)

| Endpunkt | Beschreibung |
|---|---|
| `POST .../set-tour-url` | `tour_url` setzen, `matterport_is_own` löschen |
| `POST .../set-name` | `bezeichnung` + `object_label` + optional `patchModelName` |
| `POST .../archive-matterport` | Space archivieren → `status='ARCHIVED'`, `matterport_state='inactive'` |
| `POST .../unarchive-matterport` | Space reaktivieren → `status='ACTIVE'`, `matterport_state='active'` |
| `POST .../transfer-matterport` | Space per E-Mail-Einladung übertragen |
| `DELETE .../tours/:id` | Tour aus DB löschen |
| `GET .../link-matterport` | Unverknüpfte Spaces auflisten |
| `POST .../link-matterport` | Space manuell verknüpfen |
| `POST .../link-matterport/auto` | Automatisches Linking via URL-Pattern |

---

## 4. Verlängerungs-Flow (Portal)

### Preise (subscriptions.js)

| Konstante | Wert |
|---|---|
| `EXTENSION_PRICE_CHF` | 59 CHF |
| `REACTIVATION_FEE_CHF` | 15 CHF |
| `REACTIVATION_PRICE_CHF` | 74 CHF |
| `SUBSCRIPTION_MONTHS` | 6 Monate |

### Tabelle `tour_manager.renewal_invoices`

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | SERIAL PK | |
| `tour_id` | INT FK → tours CASCADE | |
| `invoice_number` | VARCHAR(64) | Rechnungsnummer |
| `invoice_status` | TEXT | `draft`, `sent`, `paid`, `overdue`, `cancelled` |
| `invoice_kind` | VARCHAR(40) | `portal_extension` oder `portal_reactivation` |
| `amount_chf` | NUMERIC(10,2) | Betrag |
| `due_at` | TIMESTAMPTZ | Fälligkeitsdatum |
| `sent_at` | TIMESTAMPTZ | Versandzeitpunkt |
| `paid_at` | TIMESTAMPTZ | Zahlungseingang |
| `payment_method` | VARCHAR(30) | `payrexx`, `bank_transfer`, etc. |
| `payment_source` | VARCHAR(30) | `payrexx`, `payrexx_pending`, `qr_pending`, `bank_import` |
| `payment_note` | TEXT | Freitext |
| `recorded_by` | TEXT | Admin-E-Mail |
| `recorded_at` | TIMESTAMPTZ | |
| `subscription_start_at` | DATE | Start des verlängerten Abonnements |
| `subscription_end_at` | DATE | Ende des verlängerten Abonnements |
| `payrexx_payment_url` | TEXT | Payrexx-Checkout-Link |
| `exxas_invoice_id` | TEXT | Referenz auf Exxas (optional) |
| `created_at` | TIMESTAMPTZ | |

### POST /portal/api/tours/:id/extend

```
Body: { paymentMethod: "qr_invoice" | "payrexx" }
  │
  ├── Preisberechnung:
  │     ARCHIVED → 74 CHF (Reaktivierung)
  │     sonst    → 59 CHF (Verlängerung)
  │
  ├── [QR-Rechnung]:
  │     ├── INSERT renewal_invoices (payment_source='qr_pending')
  │     ├── UPDATE tours.status = 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT'
  │     ├── Loggt PORTAL_EXTEND
  │     └── sendInvoiceWithQrEmail() async
  │           → E-Mail: portal_invoice_sent (PDF-Anhang + QR-Bill)
  │
  └── [Payrexx]:
        ├── INSERT renewal_invoices (payment_source='payrexx_pending')
        ├── UPDATE tours.status = 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT'
        ├── payrexx.createCheckout():
        │     referenceId: "tour-{id}-internal-{invoiceId}"
        │     amount: Rappen
        │     successUrl: /portal/tours/{id}?success=paid
        │     cancelUrl:  /portal/tours/{id}?error=cancelled
        │     fields[email]: kundenEmail
        ├── renewal_invoices.payrexx_payment_url speichern
        └── Response: { ok: true, redirectUrl: paymentUrl }
```

### Payrexx-Webhook nach Zahlung

→ Siehe [FLOWS_BOOKING.md — Payrexx-Webhook](./FLOWS_BOOKING.md#9-payrexx-webhook)

---

## 5. Archivierungs-Flow

### Portal-Archivierung (POST /portal/api/tours/:id/archive)

```
1. assertTourAccess()
2. matterport_space_id vorhanden?
   ├── Ja: mpArchiveSpace(spaceId)
   │         REST: POST /api/models/{id}/archive
   │         Fallback: GraphQL updateModelState(state: inactive)
   │         Fehler → { error: 'matterport_archive_failed' }
   └── Nein: nur DB-Update
3. UPDATE: status='ARCHIVED', archiv=TRUE, archiv_datum=NOW()
4. Loggt PORTAL_ARCHIVE
⚠️ Kein E-Mail-Versand! (nur Admin/Cron sendet E-Mail)
```

### Admin/Cron-Archivierung (`archiveTourNow()`)

```
archiveTourNow(tourId, actorRef)  [in tour-actions.js]
  │
  ├── Tour laden
  ├── statusMachine.canArchive() prüfen
  ├── getMatterportId(t) ermitteln
  ├── matterport_space_id noch nicht in DB? → UPDATE
  ├── spaceId vorhanden?
  │     ├── Ja: matterport.archiveSpace(spaceId)
  │     │         REST: POST /api/models/{id}/archive
  │     │         Fallback: GraphQL updateModelState(state: inactive)
  │     │     UPDATE: status='ARCHIVED', matterport_state='inactive'
  │     └── Nein: UPDATE nur status='ARCHIVED'
  ├── Loggt ARCHIVE_SPACE
  └── sendArchiveNoticeEmail() → Template: archive_notice
        (MS Graph mit SMTP-Fallback)
```

---

## 6. Bank-Import

**Tabellen:** `tour_manager.bank_import_runs`, `tour_manager.bank_import_transactions`

### Formate

- **camt054** (ISO 20022 XML): Schweizer Bankstandard
- **CSV:** Auto-Detection `;` vs `,`, Header-Mapping

### Match-Logik

| Stufe | Bedingung | Status | Konfidenz |
|---|---|---|---|
| EXACT | `referenceDigits === qrReferenceDigits` **UND** `|amount - invoice| < 0.01 CHF` | `exact` | 100 |
| REVIEW | `referenceDigits` matches | `review` | 80 |
| REVIEW | Betrag exakt, 1 Kandidat | `review` | 60 |
| NONE | kein Match | `none` | 0 |

Nur Rechnungen mit Status `sent`, `overdue`, `draft` sind matchbar.

### Nach erfolgreichem Match

```
applyImportedPayment(invoiceId, actorEmail, details)
  │
  ├── renewal_invoices UPDATE:
  │     invoice_status='paid', paid_at, payment_method='bank_transfer',
  │     payment_source='bank_import', payment_note, recorded_by
  │
  ├── subscription_end_at gesetzt?
  │     → tours UPDATE: status='ACTIVE', term_end_date, ablaufdatum
  │
  ├── invoice_kind = 'portal_reactivation'?
  │     → matterport.unarchiveSpace()
  │     → tours.matterport_state = 'active'
  │
  ├── E-Mail: extension_confirmed / reactivation_confirmed
  │
  └── Aktionsprotokoll: INVOICE_MARK_PAID_BANK_IMPORT
```

---

## 7. KI / AI-Suggestions

**Tabellen:** `tour_manager.ai_suggestions`, `tour_manager.incoming_emails`

### Suggestion-Typen

| Typ | Beschreibung |
|---|---|
| `email_intent` | Absicht des Kunden aus eingehender E-Mail |
| `invoice_match` | Exxas-Rechnung einer Tour zuordnen |

### Intent-Werte

| Intent | Bedeutung | Action |
|---|---|---|
| `renew_yes` | Verlängerung gewünscht | `mark_accept` |
| `renew_no` | Keine Verlängerung | `mark_decline` |
| `transfer_requested` | Space-Übertragung | `flag_transfer` |
| `billing_question` | Rechnungsfrage | `review_billing` |
| `unclear` | Unklar | `review_manual` |

### KI-Pipeline

```
Regelbasiert (immer zuerst)
  │
  ├── Pattern erkannt mit hoher Konfidenz → fertig
  │
  └── Kein klarer Treffer + OPENAI_API_KEY gesetzt:
        │
        ├── gpt-5-mini (Prefilter, temperature 0.0):
        │     einfache Fälle, confidence ≥ 0.75 + should_escalate=false → fertig
        │
        └── gpt-5.4 (Hauptmodell, temperature 0.1):
              komplexe Fälle, inkl. top-3 Kandidaten + Review-Beispiele
```

### Vorgeschlagene Aktionen

| Action | DB-Effekt |
|---|---|
| `mark_accept` | `tours.customer_intent = 'renew_yes'` |
| `mark_decline` | `tours.customer_intent = 'renew_no'` |
| `flag_transfer` | `tours.customer_transfer_requested = TRUE` |
| `review_billing` | `tours.customer_billing_attention = TRUE` |
| `link_invoice_to_tour` | `exxas_invoices.tour_id` gesetzt |

### Status-Werte in `ai_suggestions`

`open` → `approved` / `rejected` → `applied`

---

## 8. Incoming-Emails

**Polling:** `syncMailboxSuggestions()` — Cron oder manuell via Admin

```
1. syncSentMailboxAnchors():
   → MS Graph: sentitems der Postfächer (letzte 6 Monate, max 200)
   → Jede gesendete Nachricht → Tour-Match versuchen
   → Gespeichert in outgoing_emails (template_key='sent_mail_anchor')

2. Inbox-Sync:
   → MS Graph: inbox der Postfächer
   → Neue E-Mails → storeIncomingEmail() → incoming_emails (upsert)

3. Scope-Check:
   → Irrelevante E-Mails → processing_status='ignored'

4. Kandidaten-Suche (findEmailCandidates()):
   → Parallel: Outgoing-Anker + Content-Direktsuche
   → Scoring → Ranking → Ambiguity-Auflösung

5. Intent-Klassifikation:
   → Regelbasiert → KI-Prefilter → Hauptmodell-KI

6. Suggestion-Upsert:
   → ai_suggestions (source_key='email:uuid')
   → Approved/Applied werden NICHT zurückgesetzt
```

**MS-Graph-Konfiguration:**

```
M365_TENANT_ID / M365_CLIENT_ID / M365_CLIENT_SECRET
M365_MAILBOX_UPNS  (z.B. "office@propus.ch,js@propus.ch")
M365_LOOKBACK_MONTHS  (default 6)
M365_INBOX_TOP  (default 200)
M365_SENT_TOP   (default 200)
```

---

## 9. Cron-Jobs Übersicht

| Endpunkt | Zweck |
|---|---|
| `POST /cron/send-expiring-soon` | Batch-Versand Ablauf-E-Mails |
| `POST /cron/check-payments` | Offene Rechnungen prüfen, überfällige → `overdue` |
| `POST /cron/archive-expired` | Archiviert EXPIRED_PENDING_ARCHIVE Touren |
| `POST /cron/auto-link-matterport` | Auto-Verknüpfung via tour_url |
| `POST /cron/refresh-matterport-created` | `matterport_created_at` nachtragen |
| `POST /cron/sync-matterport-status` | Status-Sync via `listModels()` |
| `POST /cron/check-matterport-ownership` | `matterport_is_own` prüfen |

**Konfigurations-Key:** `automation_settings` in `tour_manager.settings`

| Setting | Default | Beschreibung |
|---|---|---|
| `expiringMailEnabled` | true | Ablauf-E-Mails aktiv |
| `expiringMailLeadDays` | 30 | Tage vor Ablauf |
| `expiringMailCooldownDays` | 14 | Mindestabstand zwischen Mails |
| `expiringMailBatchLimit` | 50 | Max. pro Cron-Lauf |
| `expiryArchiveAfterDays` | — | Tage nach Ablauf → Archiv |
| `matterportAutoLinkEnabled` | — | Auto-Linking aktiv |

---

## 10. Kanonische Felder

`normalizeTourRow()` in `normalize.js` berechnet kanonische Felder aus Legacy-Duplikaten:

```js
canonical_object_label        = object_label || bezeichnung
canonical_customer_name       = customer_name || kunde_ref
canonical_term_end_date       = term_end_date || ablaufdatum
canonical_matterport_space_id = matterport_space_id || extractSpaceIdFromTourUrl(tour_url)
canonical_exxas_contract_id   = exxas_abo_id || exxas_subscription_id
```

**Im gesamten Code immer die `canonical_*`-Felder verwenden**, nicht die Legacy-Felder direkt.
