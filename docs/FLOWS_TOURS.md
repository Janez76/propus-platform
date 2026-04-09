# Propus Platform — Tour-Manager Flows

> **Automatisch mitpflegen:** Bei jeder Änderung an Tour-Status, Matterport-Integration, Verlängerungs- oder Archivierungs-Logik dieses Dokument aktualisieren. **Produkt-Workflow (Regeln, Reminder-Stufen, Preise):** [WORKFLOW_TOURS.md](./WORKFLOW_TOURS.md) — bei Abweichungen beide Dateien abstimmen.

*Zuletzt aktualisiert: April 2026 (Galerie/NAS: Migrationen 031–032; Admin `/api/tours/admin/galleries` NAS-Import; öffentlich `/api/listing/...` Video/Grundriss/ZIP; Bestellung nachträglich verknüpfen via Tour-Detail Intern-Sektion; Bank-Import: Vorschau/Multi-Upload, Bestellungssuche zur Rechnungszuordnung; Bestellungs-Admin: Finanzblock «Rechnungen & Zahlungen»; Bereinigungslauf: CUSTOMER_ACCEPTED_AWAITING_PAYMENT-Label + termEndFormatted-Fix; Matterport-State-Cron: POST /api/tours/cron/sync-matterport-state alle 30 Min; Rechnung löschen mit Workflow-Reset; Reaktivierung ohne Rechnung (Admin-Kulanz); Bereinigungslauf-Widget in Tour-Detail)*

---

## Inhaltsverzeichnis

1. [tour_manager.tours — Alle Felder](#1-tourmanagertours--alle-felder)
2. [Status-Maschine](#2-status-maschine)
3. [Matterport-Integration](#3-matterport-integration)
4. [Verlängerungs-Flow (Portal)](#4-verlängerungs-flow-portal)
5. [Grundriss-Bestellen-Flow](#5-grundriss-bestellen-flow)
6. [Archivierungs-Flow](#6-archivierungs-flow)
7. [Bank-Import](#7-bank-import)
8. [KI / AI-Suggestions](#8-ki--ai-suggestions)
9. [Incoming-Emails](#9-incoming-emails)
10. [Cron-Jobs Übersicht](#10-cron-jobs-übersicht)
11. [Admin-Einstellungen](#11-admin-einstellungen)
12. [Kanonische Felder (normalizeTourRow)](#12-kanonische-felder)
13. [Zentrales Rechnungsmodul (Admin)](#13-zentrales-rechnungsmodul-admin)
14. [Listing / Kunden-Galerie (Magic-Link)](#14-listing--kunden-galerie-magic-link)
15. [Bereinigungslauf (Cleanup)](#15-bereinigungslauf-cleanup)

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
| `confirmation_required` | BOOLEAN DEFAULT FALSE | Bereinigungslauf: manuelle Markierung (Migration 027) |
| `confirmation_sent_at` | TIMESTAMPTZ | Letzter Versand Bestätigungs-Mail (geplant; Migration 027) |
| `subscription_start_date` | DATE | Start der aktuellen Abo-Periode: i. d. R. `created_at` bzw. Zahlungsdatum bei Reaktivierung/Verlängerung (Migration 027) |
| `created_at` | TIMESTAMPTZ | Erstellzeitpunkt |
| `updated_at` | TIMESTAMPTZ | Letzter Update |

**Kanonische Felder:** Die folgenden Werte existieren als Spalten in `tour_manager.tours` und werden zusätzlich in der Anwendung über `normalizeTourRow()` aus Legacy-Feldern konsistent bereitgestellt.

| Feld | Berechnung |
|---|---|
| `canonical_object_label` | `object_label \|\| bezeichnung` |
| `canonical_customer_name` | `customer_name \|\| kunde_ref` |
| `canonical_term_end_date` | `term_end_date \|\| ablaufdatum` |
| `canonical_matterport_space_id` | `matterport_space_id \|\| extractSpaceIdFromTourUrl(tour_url)` |
| `canonical_exxas_contract_id` | `exxas_abo_id \|\| exxas_subscription_id` |

---

## 2. Status-Maschine

**Kanonische Geschäftsregeln** (Übergänge, Nein-/Keine-Antwort, Transfer, Reaktivierung, Preise, Cron-Ziele, E-Mail-Keys): **[WORKFLOW_TOURS.md](./WORKFLOW_TOURS.md)**.

**Implementierung im Code (Legacy-Zwischenstände):** Die Codebasis setzt und filtert zusätzliche `tours.status`-Werte (`EXPIRING_SOON`, `AWAITING_CUSTOMER_DECISION`, `CUSTOMER_ACCEPTED_AWAITING_PAYMENT`, `CUSTOMER_DECLINED`, …). Logik: `tours/lib/status-machine.js`, Übergänge u. a. `tours/lib/tour-actions.js`, `tours/routes/customer.js`, Cron `tours/routes/api.js` (`archive-expired`, `send-expiring-soon`). Bei Vereinfachung auf das Regelwerk müssen diese Stellen und Admin-/Portal-Filter migriert werden.

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

**Override-Toggle UI (Admin + Portal):**
- Nur 2 Buttons pro Funktion: **An** / **Aus** (kein "Standard"-Button mehr)
- **Kräftig hervorgehoben** = manuell gesetzt (Override aktiv, `'enabled'` oder `'disabled'`)
- **Gedimmt hervorgehoben** = aktueller Matterport-Standard-Wert (kein Override, `'default'`)
- Aktiven Override erneut anklicken → setzt zurück auf `'default'`
- Komponenten: `OverrideToggle` (`TourMatterportSection.tsx`), `PortalOverrideToggle` (`PortalTourDetailPage.tsx`)

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
| `GET .../tours/:id/customer-orders` | Alle Bestellungen des verknüpften Kunden (via `getOrdersForCustomerId`); `needsCustomer: true` wenn kein Kunde gesetzt |
| `POST .../tours/:id/set-booking-order` | `booking_order_no` nachträglich setzen (Body: `{ orderNo }`); Validierung dass Bestellung zum Kunden gehört; loggt `ADMIN_SET_BOOKING_ORDER`; patcht Matterport Internal-ID best-effort |

### Flow: Bestellung nachträglich verknüpfen (Admin Tour-Detail → Intern)

Ab April 2026 ist die Bestellverknüpfung direkt im Admin-Tour-Detail unter **Intern** möglich — ohne das Matterport-Anlage-iframe.

```
Admin öffnet Tour-Detail → Abschnitt «Intern»
  │
  ├── [customer_id gesetzt]
  │     → Button «Bestellung Verknüpfen» (Dropdown)
  │           GET /tours/:id/customer-orders
  │           → Liste aller Bestellungen des Kunden (booking/db.getOrdersForCustomerId)
  │           Suchfeld clientseitig filtert nach Nr., Adresse, Datum
  │           Klick auf Bestellung:
  │             POST /tours/:id/set-booking-order { orderNo }
  │             → Validierung (Bestellung muss zum Kunden gehören)
  │             → UPDATE tour_manager.tours SET booking_order_no = ?
  │             → logAction ADMIN_SET_BOOKING_ORDER
  │             → matterport.patchModelInternalId(mpId, "#<orderNo>") [best effort]
  │             → UI schließt Dropdown, löst Refetch aus
  │
  └── [kein customer_id]
        → Hinweistext: «Kunden verknüpfen um Bestellung auszuwählen»
        → «Kunde anpassen» führt zum bestehenden Kunden-Verknüpfungs-Flow
```

**Komponenten:** `TourInternSection.tsx` (Dropdown `BookingDropdown`), `TourDetailPage.tsx` (Props `linkedCoreCustomerId`, `onBookingLinked`).

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

### Admin-Reaktivierung (POST /tours/:id/reactivate via admin-api.js)

Gleicher Flow wie Portal-Reaktivierung, aber durch Admin ausgelöst (nicht Kunde).

```
Body: { paymentMethod: "qr_invoice" | "payrexx" | "none" }
  │
  ├── [QR-Rechnung]:
  │     ├── matterport.unarchiveSpace() → sofort aktivieren
  │     ├── UPDATE tours.status = 'ACTIVE', matterport_state = 'active'
  │     ├── INSERT renewal_invoices (payment_source='qr_pending', invoice_kind='portal_reactivation', due_at=+14 Tage)
  │     ├── Loggt REACTIVATE_REQUESTED (via: qr_invoice, immediate_activation: true)
  │     └── sendInvoiceWithQrEmail() async
  │           Offene Rechnung nach 30 Tagen → cron/archive-unpaid-qr archiviert Tour
  │
  ├── [Payrexx]:
  │     ├── UPDATE tours.status = 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT'
  │     ├── payrexx.isConfigured()? → NEIN → 400 { error: 'Payrexx nicht konfiguriert – bitte QR-Rechnung wählen' }
  │     ├── INSERT renewal_invoices (payment_source='payrexx_pending', invoice_kind='portal_reactivation')
  │     ├── payrexx.createCheckout()
  │     ├── paymentUrl in renewal_invoices speichern
  │     └── Response: { ok: true, via: 'payrexx', redirectUrl: paymentUrl }
  │
  └── [Ohne Rechnung – Admin-Kulanz]:
        ├── matterport.unarchiveSpace() → sofort aktivieren
        ├── UPDATE tours: status='ACTIVE', matterport_state='active', subscription_start_date, term_end_date (+6 Monate)
        ├── Keine Rechnung erstellen
        └── Loggt REACTIVATE_REQUESTED (via: admin_no_invoice, no_invoice: true)
```

**UI-Verhalten (TourMatterportSection.tsx):**
- `payrexxConfigured` wird vom Backend im Tour-Detail-Payload mitgeliefert (`tour-detail-payload.js`)
- Ist Payrexx nicht konfiguriert: "Online bezahlen (Payrexx)" ist ausgegraut + deaktiviert, "QR-Rechnung" ist vorgewählt
- Ist Payrexx konfiguriert: "Payrexx" ist Standard-Auswahl
- Dritte Option "Ohne Rechnung aktivieren (nur Admin)": sofortige Aktivierung ohne Rechnung, Abo 6 Monate ab heute, nur für Kulanz-/interne Fälle

### Payrexx-Webhook nach Zahlung

**Webhook-URL:** `https://admin-booking.propus.ch/webhook/payrexx`
(Kein `next.config.ts`-Rewrite: `/webhook/payrexx` wird bewusst als Next.js-Route `app/src/app/webhook/payrexx/route.ts` umgesetzt, damit der Raw-Body bytegenau an Express `/tour-manager/webhook/payrexx` weitergeleitet wird und die HMAC-Signatur gültig bleibt.)
(Express-Handler: `tours/routes/payrexx-webhook.js`, registriert VOR `express.json()` für korrektes `express.raw()`.)

→ Siehe [FLOWS_BOOKING.md — Payrexx-Webhook](./FLOWS_BOOKING.md#9-payrexx-webhook)

---

## 5. Grundriss-Bestellen-Flow

### Produkt & Preis

| Parameter | Wert / Quelle |
|---|---|
| Produktcode | `floorplans:tour` |
| Preisregel | `booking.pricing_rules` (rule_type=`per_floor`, aktiv) |
| Standardpreis | 49 CHF / Etage (Netto) |
| MwSt | aus `booking.app_settings` (key=`vat_rate`) |
| Etagen-Anzahl | Live von Matterport GraphQL (`floors { id label }`) |

### Tabelle `tour_manager.renewal_invoices` (invoice_kind = `floorplan_order`)

Zusätzlich zu den Standardfeldern wird in `payment_note` gespeichert:
```
Etagen: N, Preis pro Etage: CHF XX.XX, inkl. X.X% MwSt
```

### GET /api/tours/admin/tours/:id/floorplan-pricing

```
→ Lädt unitPrice + vatRate aus DB
→ Lädt floors[] von Matterport GraphQL (falls space_id vorhanden)
→ Berechnet totalNet, totalGross
→ Response: { unitPrice, vatRate, vatPercent, floors, floorCount, totalNet, totalGross }
```

### POST /api/tours/admin/tours/:id/order-floorplan (Admin)

```
Body: { paymentMethod: "qr_invoice" | "payrexx", comment?: string, floorCount: number }
  │
  ├── Preisberechnung aus DB (unitPrice × floorCount + MwSt)
  ├── Fälligkeitsdatum: +14 Tage
  │
  ├── [QR-Rechnung]:
  │     ├── INSERT renewal_invoices (invoice_kind='floorplan_order', payment_source='qr_pending')
  │     ├── Loggt FLOORPLAN_ORDER (source: admin_api, via: qr_invoice)
  │     └── sendInvoiceWithQrEmail() async → Portal-E-Mail mit PDF-Anhang + QR-Bill
  │
  └── [Payrexx]:
        ├── payrexx.isConfigured()? → NEIN → 400 { error: 'Payrexx nicht konfiguriert' }
        ├── INSERT renewal_invoices (invoice_kind='floorplan_order', payment_source='payrexx_pending')
        ├── Loggt FLOORPLAN_ORDER (source: admin_api, via: payrexx)
        ├── payrexx.createCheckout()
        │     referenceId: "tour-{id}-internal-{invoiceId}"
        │     purpose: "{tourLabel} – Grundriss ({N} Etagen)"
        ├── payrexx_payment_url speichern
        └── Response: { ok: true, via: 'payrexx', redirectUrl: paymentUrl }
```

### POST /portal/api/tours/:id/order-floorplan (Portal)

Identischer Flow wie Admin, jedoch mit Portal-Session-Auth.

### Payrexx-Webhook nach Zahlung

Identisch mit Verlängerungs-Flow — der Webhook-Handler (`payrexx-webhook.js`) erkennt `invoice_kind='floorplan_order'` und verarbeitet entsprechend.

### PDF-Rechnung (invoice_kind = floorplan_order)

Bezeichnet die Position als:
```
"2D Grundriss von Tour (N Etage(n) × CHF XX.XX)"
```
Zeigt MwSt-Aufschlüsselung:
```
Pos. 1   2D Grundriss von Tour (2 Etagen × CHF 49.00)   CHF 98.00 (Netto)
         Zwischensumme                                    CHF 98.00
         MwSt 8.1%                                        CHF  7.94
         ─────────────────────────────────────────────────────────
         Total                                            CHF 105.94
```

### UI-Verhalten (FloorplanOrderDialog)

- `payrexxConfigured` kommt aus `data.payrexxConfigured` (Tour-Detail-Payload)
- Payrexx **nicht konfiguriert**: Option wird vollständig ausgeblendet, "QR-Rechnung" vorgewählt
- Payrexx **konfiguriert**: "Online bezahlen (Payrexx)" sichtbar und vorgewählt
- Etagen werden automatisch von Matterport ermittelt; manuelle Eingabe als Fallback
- Hinweis bei QR-Rechnung: "innerhalb von 14 Tagen zu bezahlen"

---

## 6. Archivierungs-Flow

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

## 7. Bank-Import

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

### Upload & Vorschau (Admin Finanzen → Bank-Import)

- **Mehrere Dateien:** Im Dateidialog können mehrere `.xml`/`.csv` gewählt werden; pro Datei nacheinander Vorschau → optional «Überspringen» → «Import bestätigen».
- **Endpunkte:** `POST /bank-import/preview` (multipart `bankFile`, keine DB-Persistenz) → `POST /bank-import/upload` (speichert Run + Transaktionen).

### Manuelle Zuordnung: Rechnung vs. Bestellung

Offene Importzeilen (`match_status` `review` / `none`) erscheinen unter **Prüfen & zuordnen**. Pro Zeile:

| Modus | UI | Backend |
|---|---|---|
| **Rechnung** | Freitextsuche (Nr., Tour, Kunde …) | `GET /bank-import/invoice-search?q=&amount=` |
| **Bestellung** | Suche nach Bestellnr., Firmenname, Kundenname oder E-Mail | `GET /bank-import/order-search?q=` |

**`order-search`:** Join `booking.orders` → `tour_manager.tours` (`booking_order_no`) → `tour_manager.renewal_invoices`. Antwort gruppiert nach `order_no` mit Liste der Rechnungen; Auswahl einer Rechnung nutzt denselben Confirm-Flow wie die Rechnungssuche (`POST /bank-import/transactions/:id/confirm` mit `invoiceId`, `invoiceSource: renewal`).

Gilt für **Portal-Buchungen** und **manuell erstellte Bestellungen**, sobald eine Tour mit `booking_order_no` verknüpft ist und Rechnungen existieren.

### Bestellungs-Admin: Finanzstatus (OrderDetail)

- **Endpunkt:** `GET /tours/invoices-by-order/:orderNo` — alle `renewal_invoices` zu Touren mit `tours.booking_order_no = orderNo` (neueste zuerst).
- **UI:** In der Bestellungs-Detailansicht erscheint der Block **«Rechnungen & Zahlungen»** (nur wenn mindestens eine Rechnung existiert): Status-Badge, Betrag, Nr., Tour-Label, Fälligkeit bzw. Bezahlt-Datum und Zahlungskanal, Skonto; Kopfzeile mit Kurzstatistik (z. B. bezahlt/offen, Summe CHF). Nach **«Rechnung erstellen»** wird die Liste neu geladen.

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

## 8. KI / AI-Suggestions

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

## 9. Incoming-Emails

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

## 10. Cron-Jobs Übersicht

Zielbild Reminder (30 / 10 / 3 Tage) und Kulanzfristen: **[WORKFLOW_TOURS.md](./WORKFLOW_TOURS.md).** `send-expiring-soon` wählt Touren mit `status = ACTIVE` und Tagen bis Ablauf in den Fenstern **29–31**, **9–11**, **2–4**; Dedup über `outgoing_emails.details_json` (`reminderStage`, `termEndAnchor`). Stufe 3 nutzt Template `renewal_request_final`. Schalter: `expiringMailEnabled` (Default in Code: **false**).

### Cron-API (neu, `/api/tours/cron/`)

Dedizierte Cron-Endpunkte mit `X-Cron-Secret`-Header-Auth (kein Admin-Login nötig).

| Endpunkt | Intervall (VPS crontab) | Zweck |
|---|---|---|
| `POST /api/tours/cron/sync-matterport-state` | `*/30 * * * *` (alle 30 Min) | `matterport_state` aller Touren via `listModels()` aktualisieren |

**Auth:** `X-Cron-Secret: <CRON_SECRET>` (Wert aus `/opt/propus-platform/.env.vps`)

**Backend:** `tours/routes/cron-api.js` → `postLinkMatterportSyncStatus()` in `tours/lib/admin-phase3.js`

**Script:** `/opt/propus-platform/scripts/cron-matterport-sync.sh`

**Log:** `/var/log/propus-matterport-sync.log`

```
# VPS crontab (root):
*/30 * * * * /opt/propus-platform/scripts/cron-matterport-sync.sh >> /var/log/propus-matterport-sync.log 2>&1
```

**Env:** `CRON_SECRET` in `.env.vps` — wird beim Deploy nicht überschrieben (manuell gesetzt, einmalig).

### Admin-UI-Trigger (manuell, `/api/tours/admin/link-matterport/...`)

Diese Endpunkte können auch manuell aus dem Admin ausgelöst werden (brauchen Admin-Session):

| Endpunkt | Zweck |
|---|---|
| `POST /api/tours/admin/link-matterport/sync-status` | Gleiches wie Cron, manuell auslösbar |
| `POST /api/tours/admin/link-matterport/check-ownership` | `matterport_is_own` für alle Touren prüfen |
| `POST /api/tours/admin/link-matterport/auto-link` | Auto-Verknüpfung via `tour_url` |
| `POST /api/tours/admin/link-matterport/refresh-created` | `matterport_created_at` nachtragen |

### Booking-Cron (bestehend, via Booking-Backend)

| Endpunkt | Zweck |
|---|---|
| `POST /cron/send-expiring-soon` | Drei Reminder-Stufen (30/10/3 Tage), siehe oben |
| `POST /cron/check-payments` | Offene Rechnungen prüfen, überfällige → `overdue` |
| `POST /cron/remind-unpaid-qr` | Zahlungserinnerung bei überfälliger QR-Rechnung (einmalig, Template `invoice_overdue_reminder`) |
| `POST /cron/archive-unpaid-qr` | QR-Rechnungen mit `payment_source='qr_pending'` älter als 30 Tage → Tour archivieren |
| `POST /cron/archive-expired` | Archiviert EXPIRED_PENDING_ARCHIVE Touren |

**Konfigurations-Key:** `automation_settings` in `tour_manager.settings`

| Setting | Default | Beschreibung |
|---|---|---|
| `expiringMailEnabled` | false | Ablauf-E-Mails aktiv (neuer Default) |
| `expiringMailLeadDays` | 30 | Legacy (alter Ein-Treffer-Cron); aktueller Cron ignoriert |
| `expiringMailCooldownDays` | 14 | Legacy; aktueller Cron nutzt Stufen-Dedup |
| `expiringMailBatchLimit` | 50 | Max. pro Cron-Lauf |
| `expiryArchiveAfterDays` | — | Tage nach Ablauf → Archiv |
| `matterportAutoLinkEnabled` | — | Auto-Linking aktiv |

---

## 11. Admin-Einstellungen

### Tour-Workflow (React)

| Route | Beschreibung |
|---|---|
| `/admin/tours/workflow-settings` | Tabs: Workflow/Cron- und Policy-Einstellungen, E-Mail-Templates, Bereinigungslauf (`confirmation_required`) |

### Seiten unter `/settings/` (Admin-Panel)

| Route | Seite | Beschreibung |
|---|---|---|
| `/settings/email-templates` | E-Mail-Vorlagen | Alle 8+ Kunden-E-Mail-Templates editierbar |
| `/settings/payment` | Zahlungseinstellungen | Payrexx-Status, MwSt-Satz |
| `/settings/invoice-template` | Rechnungsvorlage | Absender (Creditor), PDF-Footer, E-Mail für QR-Rechnung, Vorschau |
| `/settings/exxas` | Exxas-Konfiguration | Exxas-API-Integration |
| `/settings/calendar-templates` | Kalender-Vorlagen | — |
| `/settings/team` | Team | Admin-Einladungen |

### Zahlungseinstellungen (`GET/PATCH /api/tours/admin/payment-settings`)

| Feld | Quelle | Editierbar |
|---|---|---|
| `payrexxConfigured` | `process.env.PAYREXX_INSTANCE` + `PAYREXX_API_SECRET` | `.env.vps` und/oder `.env.vps.secrets` (Compose `env_file`) |
| `payrexxInstance` | `process.env.PAYREXX_INSTANCE` | wie oben |
| `vatRate` / `vatPercent` | `booking.app_settings` (key=`vat_rate`) | Ja |
| `floorplanUnitPrice` | `booking.pricing_rules` (floorplans:tour, per_floor) | Via Rechnungsvorlage |
| `hostingUnitPrice` | `booking.pricing_rules` (hosting, per_period) | Read-only |

Hinweis zur Laufzeit-Konfiguration:
- `platform/server.js` und `booking/server.js` laden `.env`, `.env.vps.secrets` und `.env.vps` in dieser Reihenfolge mit `override: true`.
- Dadurch koennen produktive Werte aus `.env.vps` oder `.env.vps.secrets` lokale Defaults oder leere Werte aus `.env` gezielt ueberschreiben.
- Nach Aenderungen an Payrexx-Variablen ist ein Neustart bzw. Container-Recreate noetig, damit `process.env` neu eingelesen wird.

### Rechnungsvorlage (`GET/PATCH /api/tours/admin/invoice-template`)

**Creditor-Daten** — gespeichert in `tour_manager.settings` (key=`invoice_creditor`):

| Feld | Verwendung |
|---|---|
| `name` | PDF-Header, Grusszeile |
| `street` + `buildingNumber` + `zip` + `city` + `country` | Swiss QR-Bill Creditor-Adresse |
| `iban` | Swiss QR-Bill IBAN |
| `email` | PDF-Kontaktzeile, Grusszeile |
| `phone` / `website` | PDF-Kontaktzeile |
| `vatId` | PDF-Absenderblock |
| `footerNote` | PDF-Fusszeile (Dankestext) |

**Fallback-Hierarchie:** DB → Env-Variablen (`QR_BILL_*`) → Hardcoded Defaults (Propus GmbH)

**E-Mail-Vorlage** (`portal_invoice_sent`) — Betreff + HTML + Plaintext editierbar

---

## 12. Kanonische Felder

`normalizeTourRow()` in `normalize.js` berechnet kanonische Felder aus Legacy-Duplikaten:

```js
canonical_object_label        = object_label || bezeichnung
canonical_customer_name       = customer_name || kunde_ref
canonical_term_end_date       = term_end_date || ablaufdatum
canonical_matterport_space_id = matterport_space_id || extractSpaceIdFromTourUrl(tour_url)
canonical_exxas_contract_id   = exxas_abo_id || exxas_subscription_id
```

**Im gesamten Code immer die `canonical_*`-Felder verwenden**, nicht die Legacy-Felder direkt.

---

## 13. Zentrales Rechnungsmodul (Admin)

Systemweite Rechnungsliste **ausserhalb** des Tour-Untermenüs. Pro-Tour-Ansicht bleibt in `TourInvoicesSection` (Tour-Detail).

### UI

| Route | Komponente | Beschreibung |
|---|---|---|
| `/admin/invoices` | `app/src/pages-legacy/admin/invoices/AdminInvoicesPage.tsx` | Tabs: Verlängerungsrechnungen / Exxas; Status-Filter; Suche; Stats; Links zur Tour |
| `/admin/tours/invoices` | — | Redirect → `/admin/invoices` (Bookmarks / alte URLs, z. B. [admin-booking.propus.ch/admin/tours/invoices](https://admin-booking.propus.ch/admin/tours/invoices)) |

**Navigation:** Sidebar Top-Level `nav.invoices` → `/admin/invoices` (nicht mehr unter Tours eingenestet).

**Berechtigung:** `ROUTE_PERMISSIONS["/admin/invoices"]` = `dashboard.view` (wie Tour-Manager-Bereich), siehe `app/src/lib/permissions.ts`.

### Admin-JSON-API

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/api/tours/admin/invoices-central?type=renewal\|exxas&status=&search=` | Listen + Stats; `status` wie bisher Verlängerung (`offen`, `ueberfaellig`, `bezahlt`, `entwurf`) bzw. Exxas (`offen` = `exxas_status != 'bz'`, `bezahlt` = `bz`) |
| `GET` | `/api/tours/admin/invoices` | Unverändert: nur Verlängerungen (Legacy / andere Clients) |
| `DELETE` | `/api/tours/admin/invoices/renewal/:id` | Verlängerungsrechnung löschen (nur nicht-bezahlte); setzt Tour-Workflow-Status zurück; loggt `DELETE_INVOICE` |
| `DELETE` | `/api/tours/admin/invoices/exxas/:id` | Exxas-Rechnung löschen |
| `GET` | `/api/tours/admin/tours/:id/link-invoice?search=` | Link-Dialog für Exxas-Rechnungen; kombiniert lokale `exxas_invoices` mit Live-Treffern aus Exxas |
| `POST` | `/api/tours/admin/tours/:id/link-invoice` | Verknüpft lokale Exxas-Rechnung oder legt bei `live:<referenz>` zuerst einen lokalen Datensatz an |

**Backend:** `tours/lib/admin-phase3.js` — `getRenewalInvoicesCentral()`, `getExxasInvoicesCentral()`, `deleteRenewalInvoice(invoiceId, actorEmail)`; Route `tours/routes/admin-api.js` → `GET /invoices-central`.

### Rechnung löschen — Workflow-Reset-Logik

`deleteRenewalInvoice()` prüft nach dem Löschen den Tour-Status und setzt ihn automatisch zurück:

| `invoice_kind` | Tour-Status war | → Reset auf |
|---|---|---|
| `portal_reactivation` | `CUSTOMER_ACCEPTED_AWAITING_PAYMENT` | `ARCHIVED` |
| `portal_extension` / `null` | `CUSTOMER_ACCEPTED_AWAITING_PAYMENT` | `AWAITING_CUSTOMER_DECISION` |

Bezahlte Rechnungen (`invoice_status = 'paid'`) können nicht gelöscht werden.

**UI:** Trash-Icon pro Zeile in `TourInvoicesSection.tsx`, nur für nicht-bezahlte Rechnungen sichtbar. Bestätigung via `window.confirm()`. Nach Erfolg: `onRefresh()` lädt Tour-Detail neu.

**Tour-Detail Nebenflow:** Der Dialog **„Exxas-Rechnung verknüpfen“** (`ToursAdminLinkInvoicePage.tsx`) zeigt lokale wie auch Live-Kandidaten. Live-Treffer werden im UI markiert und können direkt zugeordnet werden, auch wenn der reguläre Exxas-Sync die Rechnung lokal noch nicht geschrieben hat.

### Datenbank

| Objekt | Zweck |
|---|---|
| `tour_manager.invoices_central_v` | View über `renewal_invoices` ∪ `exxas_invoices` (Migration `026_invoices_central_view.sql`) |
| Indexes | `renewal_invoices(invoice_status)`, `exxas_invoices(exxas_status)`, u. a. siehe Migration |

→ Schema-Detail: [SCHEMA_FULL.md](./SCHEMA_FULL.md#tour_managerinvoices_central_v--view-admin-rechnungsübersicht)

---

## 14. Listing / Kunden-Galerie (Magic-Link)

React-Admin unter `/admin/listing/…` (Komponenten in `app/src/pages-legacy/admin/listing/`). Öffentliche Kundenansicht: Next.js-Route `/listing/:slug` (Payload von `/api/listing/:slug`).

### Datenmodell

→ Tabellen `tour_manager.galleries`, `gallery_images`, `gallery_feedback`, `gallery_email_templates`: [SCHEMA_FULL.md](./SCHEMA_FULL.md#tour_managergalleries--listing--kunden-galerie-magic-link)

**NAS-Import:** Relativ zu den gleichen Roots wie das Buchungs-Upload-System (`BOOKING_UPLOAD_CUSTOMER_ROOT`, `BOOKING_UPLOAD_RAW_ROOT`, …); Logik in `booking/order-storage.js`, genutzt von `tours/lib/gallery.js`. Keine freien absoluten Pfade über die API.

### Admin-JSON-API (`tours/routes/gallery-admin-api.js`)

Basis-Mount: **`/api/tours/admin/galleries`** (hinter `requireAdmin`, siehe `platform/server.js`).

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/` | Liste mit `search`, `filter`, `sort` |
| `POST` | `/` | Neue Galerie |
| `GET` | `/:id` | Detail inkl. Bilder + Feedback |
| `PATCH` | `/:id` | Metadaten |
| `DELETE` | `/:id` | Galerie löschen |
| `POST` | `/:id/duplicate` | Duplikat |
| `GET` | `/email-templates` | E-Mail-Vorlagen |
| `PUT` | `/email-templates/:tplId` | Vorlage speichern |
| `GET` | `/:id/nas-context` | Storage-Health (`getStorageHealth`) + Bestellordner-Vorschläge |
| `GET` | `/:id/nas-browse?rootKind=customer\|raw&relativePath=` | Nur Unterordner des erlaubten Roots; Medien-Zählung erst ab gewähltem Pfad |
| `POST` | `/:id/import-nas` | Body: `rootKind`, `relativePath`, `storageSourceType` (`order_folder` \| `nas_browser`) |
| `POST` | `/:id/import-share` | Body: `{ urls: [{ url }] }` — Nextcloud/Propus-Cloud-Freigabe rekursiv (WebDAV) |
| `POST` | `/:id/images` | Bild anlegen |
| `PATCH` | `/:id/images/:imgId` | Bild ändern |
| `DELETE` | `/:id/images/:imgId` | Bild löschen |
| `PUT` | `/:id/images/order` | Reihenfolge |
| `GET` | `/:id/images/:imgId/file` | Thumbnail/Preview: NAS → `sendFile`, sonst Redirect auf `remote_src` |
| `POST` | `/:id/feedback` | Büro-Rückfrage (`author: office`) |
| `PATCH` | `/:id/feedback/:fbId` | resolved / reopen |
| `DELETE` | `/:id/feedback/:fbId` | Feedback löschen |
| `POST` | `/:id/send-email` | Versand via Microsoft Graph (`to`, `subject`, `htmlBody`) |
| `POST` | `/:id/record-sent` | `client_delivery_status = sent` |

### Öffentliche JSON-API (`tours/routes/gallery-public-api.js`)

Mount: **`/api/listing`** (ohne Login).

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/:slug` | Payload inkl. `download_all_url` wenn `storage_source_type` `order_folder` oder `nas_browser` |
| `GET` | `/:slug/images/:imgId` | Bild: NAS → `sendFile`, sonst Redirect `remote_src` |
| `GET` | `/:slug/video` | Video-Datei (NAS) oder 404 |
| `GET` | `/:slug/floorplans/:index` | PDF (NAS) oder Redirect auf gespeicherte URL |
| `GET` | `/:slug/download-all` | ZIP des importierten NAS-Ordners (`archiver`) |
| `POST` | `/:slug/viewed` | Client-Log |
| `POST` | `/:slug/downloaded` | Client-Log |
| `POST` | `/:slug/feedback` | Kunden-Feedback |
| `GET` | `/:slug/feedback` | Feedback-Liste / pro Asset |

---

## 15. Bereinigungslauf (Cleanup)

Einmaliger Lauf: Kunden werden per Mail gefragt, was mit ihrer Tour passieren soll (Weiterführen / Archivieren / Übertragen / Löschen). Ausgelöst manuell durch Admin.

### DB-Felder (tour_manager.tours)

| Feld | Typ | Beschreibung |
|---|---|---|
| `confirmation_required` | BOOLEAN | Manuell markiert → erscheint in Kandidatenliste |
| `cleanup_sent_at` | TIMESTAMPTZ | Zeitpunkt des letzten Mailversands |
| `cleanup_action` | TEXT | Gewählte Aktion (`weiterfuehren` \| `archivieren` \| `uebertragen` \| `loeschen`) |
| `cleanup_action_at` | TIMESTAMPTZ | Zeitpunkt der Aktion |

### Status-Mapping (computeCleanupRule)

| Tour-Status | `statusLabel` (E-Mail + UI) | `needsInvoice` | Besonderheit |
|---|---|---|---|
| `ACTIVE`, `EXPIRING_SOON` | Aktiv / Läuft bald ab | nein | Tour bleibt unverändert |
| `EXPIRED_PENDING_ARCHIVE` | Abgelaufen | ja | Reaktivierung CHF 59.– |
| `CUSTOMER_ACCEPTED_AWAITING_PAYMENT` | Warten auf Zahlung | ja | `termEndFormatted` = `–` (kein gültiges Ablaufdatum) |
| `ARCHIVED` (< 6 Monate) | Archiviert | nein | `needsManualReview = true` |
| `ARCHIVED` (> 6 Monate) | Archiviert | ja | Reaktivierung CHF 59.– |

### Admin-API

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/api/tours/admin/cleanup/candidates` | Kandidatenliste (confirmation_required = true) |
| `GET` | `/api/tours/admin/cleanup/sandbox/:id` | Sandbox-Vorschau (kein DB-Write, kein Versand) |
| `POST` | `/api/tours/admin/cleanup/batch-dry-run` | Dry-Run für alle/ausgewählte Kandidaten |
| `POST` | `/api/tours/admin/cleanup/batch-send` | Produktiver Versand |
| `POST` | `/api/tours/admin/cleanup/send/:id` | Einzelversand |
| `POST` | `/api/tours/admin/cleanup/incoming-reply` | Ticket aus Kunden-E-Mail erstellen |

### Kunden-Aktionsseiten (öffentlich, Token-basiert)

| Pfad | Beschreibung |
|---|---|
| `GET /cleanup/:action?token=…` | Token einlösen, Aktion ausführen, EJS-Bestätigungsseite |
| `POST /cleanup/reply` | Freitext-Antwort → Ticket |

**Aktionen:** `weiterfuehren` \| `archivieren` \| `uebertragen` \| `loeschen`

**Besonderheit `weiterfuehren`:** Setzt Matterport-Sichtbarkeit automatisch auf `LINK_ONLY`.

### Frontend

| Datei | Beschreibung |
|---|---|
| `app/src/pages-legacy/tours/admin/ToursAdminCleanupPage.tsx` | Admin-UI: Kandidatentabelle, Sandbox-Vorschau, Matterport Live-Check |
| `app/src/pages-legacy/tours/admin/components/TourCleanupSection.tsx` | Tour-Detail-Widget: Sandbox-Vorschau + produktiver Einzelversand (nur wenn `confirmation_required = true`) |

**Tour-Detail-Integration (`TourDetailPage.tsx`):** `TourCleanupSection` erscheint unterhalb von `TourInvoicesSection`, aber nur wenn `tour.confirmation_required = true`. Zeigt Sandbox-Vorschau-Toggle und "Mail jetzt senden (produktiv)"-Button mit Bestätigungsdialog. Bereits versendete/abgeschlossene Touren zeigen nur den Status.

### Backend

| Datei | Beschreibung |
|---|---|
| `tours/lib/cleanup-mailer.js` | `computeCleanupRule()`, `buildCleanupEmailContent()`, `sandboxPreviewForTour()`, `sendCleanupMailForTour()`, `runCleanupBatch()` |
| `tours/routes/cleanup.js` | Öffentliche Token-Aktionsseiten |
| `tours/routes/admin-api.js` | Admin-API-Endpunkte (ab Zeile ~860) |

### Matterport Live-Check (Sandbox-Vorschau)

In der Sandbox-Vorschau kann der Admin den aktuellen Zustand des Spaces direkt bei Matterport abfragen (`GET /api/tours/admin/tours/:id/matterport-model`). Zeigt: Space-ID, Name, Zustand (active/inactive/…), Sichtbarkeit, Adresse, Link, Erstell-/Änderungsdatum.

---

## 16. VPS-Betrieb: Port-Mapping und Cloudflare-Tunnel

### Port-Mapping (WICHTIG)

Der VPS-Betrieb läuft ausschliesslich mit `docker-compose.vps.yml` (nicht `docker-compose.yml`).

| Container-intern | Host (extern) | Beschreibung |
|---|---|---|
| `3001` | `127.0.0.1:3100` | Next.js Admin-Panel (alle Hosts) |
| `3100` | — | Express-API (nur intern, kein eigener Host-Port) |

**Compose-Datei für Deploy und manuellen Neustart:**
```bash
cd /opt/propus-platform
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --force-recreate platform
```

**NIEMALS** `docker compose up` ohne `-f docker-compose.vps.yml` ausführen — sonst wird `docker-compose.yml` verwendet, die Port 3001 und 3100 separat exposed, und der Tunnel zeigt auf den falschen Port.

### Cloudflare Tunnel (Server Propus Code)

Alle Hosts zeigen auf `http://127.0.0.1:3100` (= Next.js via Port-Mapping):

| Hostname | Tunnel-Ziel |
|---|---|
| `booking.propus.ch` | `http://127.0.0.1:3100` |
| `admin-booking.propus.ch` | `http://127.0.0.1:3100` |
| `api-booking.propus.ch` | `http://127.0.0.1:3100` |
| `api.propus.ch` | `http://127.0.0.1:3100` |
| `upload.propus.ch` | `http://127.0.0.1:4455` |
| `api-booking-dev.propus.ch` | `http://127.0.0.1:3200` |

### Cloudflare CSP (Zaraz)

Cloudflare Zaraz injiziert einen `Content-Security-Policy: default-src 'none'` Header, der seine eigenen `cdn-cgi/zaraz/s.js`-Scripts blockiert. Daher wird der CSP-Header für `admin-booking.propus.ch` via Cloudflare Ruleset `Auth hosts CSP fix` entfernt.

### Env-Dateien Lade-Reihenfolge

`docker-compose.vps.yml` lädt:
1. `.env.vps` (wird bei jedem Deploy überschrieben)
2. `.env.vps.secrets` (nur manuell auf dem VPS, nie überschrieben — enthält `PAYREXX_INSTANCE`, `PAYREXX_API_SECRET`)

Nach Änderungen an Env-Dateien Container neu erstellen:
```bash
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --force-recreate platform
```
