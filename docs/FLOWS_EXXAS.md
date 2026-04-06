# Propus Platform — Exxas-Integration

> **Automatisch mitpflegen:** Bei Änderungen an Exxas-API-Calls, Scoring-Logik, Reconcile-Flow oder DB-Feldern dieses Dokument aktualisieren.

*Zuletzt aktualisiert: April 2026 (Verweis zentrales Rechnungsmodul)*

---

## Inhaltsverzeichnis

1. [Übersicht](#1-übersicht)
2. [Gespeicherte Felder in der DB](#2-gespeicherte-felder-in-der-db)
3. [Tabelle exxas_invoices](#3-tabelle-exxas_invoices)
4. [Reconcile-Flow (Kunden-Abgleich)](#4-reconcile-flow-kunden-abgleich)
5. [Exxas-API-Funktionen](#5-exxas-api-funktionen)
6. [Live-Linking von Rechnungen](#6-live-linking-von-rechnungen)
7. [Exxas-Order-Sync (Buchungen)](#7-exxas-order-sync-buchungen)

---

## 1. Übersicht

Exxas ist das Buchhaltungssystem der Propus GmbH. Die Propus Platform integriert Exxas für:

- **Kundendaten-Abgleich** (`/reconcile`): Exxas-Kunden ↔ lokale `customers`
- **Rechnungs-Sync** (`exxas_invoices`): Exxas-Rechnungen im Tour-Manager sichtbar (Tour-Detail + systemweite Liste)
- **Zentrale Admin-Liste:** Tab „Exxas-Rechnungen“ unter `/admin/invoices` — siehe [FLOWS_TOURS.md §13](./FLOWS_TOURS.md#13-zentrales-rechnungsmodul-admin)
- **Vertrags-Referenzen** (`exxas_abo_id` / `exxas_subscription_id`): Touren mit Exxas-Verträgen verknüpfen
- **Auftrags-Export** (`exxas_order_id`): Buchungen an Exxas übertragen

**Auth:** `Authorization: ApiKey {EXXAS_API_TOKEN}` (alternativ Bearer, optional `X-App-Password`)

---

## 2. Gespeicherte Felder in der DB

### `core.customers`

| Feld | Herkunft |
|---|---|
| `exxas_customer_id` | `raw.id` des Exxas-Kunden |
| `exxas_address_id` | Ebenfalls `raw.id` (bei Exxas oft identisch) |

### `core.customer_contacts`

| Feld | Herkunft |
|---|---|
| `exxas_contact_id` | `raw.id` des Exxas-Kontakts |

### `tour_manager.tours`

| Feld | Herkunft |
|---|---|
| `exxas_abo_id` | Exxas-Vertrags/Abo-ID (alt) |
| `exxas_subscription_id` | Exxas-Vertrags-ID (neu, Migration 012) |
| `canonical_exxas_contract_id` | Normalisiert: `exxas_abo_id || exxas_subscription_id` |

### `booking.orders`

| Feld | Bedeutung |
|---|---|
| `exxas_order_id` | Exxas-Auftrags-ID (nach Export) |
| `exxas_status` | `not_sent` / `sent` / `error` |
| `exxas_error` | Fehlermeldung bei `error` |

---

## 3. Tabelle `tour_manager.exxas_invoices`

Sync-Tabelle: Rechnungsdaten aus Exxas, im Tour-Manager sichtbar und KI-matchbar.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | SERIAL PK | |
| `exxas_document_id` | TEXT UNIQUE | Exxas-interne Dokumenten-ID |
| `nummer` | TEXT | Rechnungsnummer (lesbar) |
| `kunde_name` | TEXT | Kundenname aus Exxas |
| `bezeichnung` | TEXT | Rechnungsbezeichnung |
| `ref_kunde` | TEXT | Exxas-Kundennummer |
| `ref_vertrag` | TEXT | Exxas-Vertragsnummer |
| `exxas_status` | TEXT | z.B. `bz` (bezahlt), `offen`, etc. |
| `sv_status` | TEXT | SV-Status (Schweizer Variante) |
| `zahlungstermin` | DATE | Zahlungszieldatum |
| `dok_datum` | DATE | Rechnungsdatum |
| `preis_brutto` | NUMERIC(10,2) | Bruttobetrag CHF |
| `tour_id` | INT FK → tours | Nach KI-Matching zugeordnet |
| `archived_at` | TIMESTAMPTZ | Archivierungszeitpunkt; archivierte Exxas-Rechnungen bleiben erhalten, werden aber in zentralen Listen ausgefiltert |
| `synced_at` | TIMESTAMPTZ | Letzter Sync |
| `created_at` | TIMESTAMPTZ | |

---

## 4. Reconcile-Flow (Kunden-Abgleich)

**Dateien:** `booking/exxas-reconcile-routes.js`

### Schritt 1: Preview (keine DB-Schreibzugriffe)

```
POST /api/admin/integrations/exxas/reconcile/preview
  │
  ├── Exxas-API parallel:
  │     /api/v2/customers → Exxas-Kunden
  │     /api/v2/contacts  → Exxas-Kontakte
  │
  ├── Lokale DB: alle customers + customer_contacts laden
  │
  ├── Für jeden Exxas-Kunden: scoreCustomerCandidate() gegen lokale Kunden
  │
  └── Response: Vorschläge pro Exxas-Kunde (keine DB-Schreibzugriffe!)
```

### Scoring-System (Kunden)

| Signal | Punkte | Schwelle |
|---|---|---|
| `exxas_customer_id` exakt | +140 | exactMatch |
| `exxas_address_id` exakt | +140 | exactMatch |
| E-Mail direkt am Kunden | +70 | |
| E-Mail über Kontakt | +45 | |
| Firmenname exakt | +30 | |
| Firmenname teilweise | +18 | |
| Telefon (last 8/9 Stellen) | +14 | |
| PLZ exakt | +8 | |
| Strasse exakt | +8 | |
| Stadt exakt | +6 | |

### Entscheidungslogik

| Bedingung | Aktion | Qualität |
|---|---|---|
| exactMatch (≥140) | `link_existing` | `exact` |
| Score ≥ 90, Gap ≥ 20, korroboriert | `link_existing` | `strong` |
| Score ≥ 55 | `skip` (Review nötig) | `ambiguous` |
| sonst | `create_customer` | `none` |

### Schritt 2: Confirm (DB-Schreibzugriffe in Transaktion)

```
POST /api/admin/integrations/exxas/reconcile/confirm
  Body: {
    decisions: [{
      exxasCustomer,
      customerAction,
      localCustomerId?,
      overwriteCustomerFields?,
      contactDecisions?: [{ exxasContact, action, localContactId?, overwriteFields? }]
    }]
  }
  │
  ├── Pro Exxas-Kunde (in Transaktion):
  │     ├── "skip" → nichts
  │     ├── "link_existing":
  │     │     → fillMissingCustomerFields() (standardmässig nur leere Felder, gezielte Overwrites via `overwriteCustomerFields`)
  │     │     → exxas_customer_id + exxas_address_id setzen
  │     └── "create_customer":
  │           → INSERT customers (mit Fallback bei Unique-Violation)
  │
  ├── Pro Kontakt:
  │     ├── "skip" → nichts
  │     ├── "link_existing" → exxas_contact_id setzen
  │     └── "create_contact" → INSERT customer_contacts
  │
  └── Nach Commit:
        → syncCustomerContactToCompanyMember()
        → logtoOrgSync (Company + Member)
```

---

## 5. Exxas-API-Funktionen

**Datei:** `tours/lib/exxas.js`

| Funktion | Beschreibung |
|---|---|
| `createInvoice(tour, amount, periodStart, periodEnd)` | Rechnung erstellen (`POST /api/v2/rechnungen`) |
| `sendInvoice(exxasInvoiceId)` | Rechnung senden (`POST /api/v2/rechnungen/{id}/send`) |
| `getInvoiceStatus(id)` | Status abrufen |
| `getInvoiceDetails(id)` | Vollständiges Objekt |
| `extendSubscription(id, months=6)` | Vertrag verlängern (`POST /api/v2/contracts/{id}/extend`) |
| `cancelSubscription(id)` | Vertrag kündigen (mehrere Fallback-Endpunkte) |
| `cancelInvoice(id)` | Rechnung stornieren |
| `deactivateCustomer(id)` | Kunden deaktivieren |
| `searchInvoices(query, opts)` | Live-Suche über `/api/v2/rechnungen` (1-Min-Cache, client-seitig gefiltert) |
| `searchCustomers(query)` | Suche (client-seitig gefiltert, max. 30 Treffer) |
| `getCustomer(id)` | Kunden abrufen (5-Min-Cache) |
| `resolveCustomerIdentity(ref, opts)` | Exxas-Kunde per ID/Name/Email finden |
| `getContactsForCustomer(customerId)` | Kontakte per `ref_kunde` |

**Caching:**
- Rechnungsliste: 1-Min-Cache in `exxasInvoiceListCache`
- Kontaktliste: 5-Min-Cache in `exxasContactsListCache`
- Einzelne Kunden: 5-Min-Cache in `exxasCustomerCache` (Map)

---

## 6. Live-Linking von Rechnungen

**Dateien:** `tours/lib/admin-phase3.js`, `app/src/pages-legacy/tours/admin/ToursAdminLinkInvoicePage.tsx`

Der Dialog **„Exxas-Rechnung verknüpfen“** unter `/admin/tours/:id/link-invoice` kombiniert seit April 2026 lokale Sync-Daten mit Live-Treffern aus Exxas.

### GET `/api/tours/admin/tours/:id/link-invoice`

```
Admin öffnet Link-Dialog
  │
  ├── Tour laden und normalisieren
  ├── Lokale Kandidaten aus `tour_manager.exxas_invoices`
  │     → nur `archived_at IS NULL`
  │     → nur `tour_id IS NULL`
  │
  ├── Vorschläge via `getInvoiceLinkSuggestionsForTour()`
  │
  └── Live-Kandidaten via `exxas.searchInvoices()`
        Suchbegriffe:
        - explizite Suche (`search`)
        - sonst best effort aus Vertrags-ID / Kunde / Mail-Alias
```

**Merge-Regeln:**

- Lokale Datensätze bleiben primär.
- Falls ein lokaler Datensatz dieselbe `exxas_document_id` / `nummer` hat, werden fehlende Anzeige-Felder aus dem Live-Treffer ergänzt.
- Bereits einer anderen Tour zugeordnete Exxas-Referenzen werden aus der Live-Liste entfernt.
- Reine Live-Treffer erscheinen im UI mit `source = "live"` und `link_id = "live:<referenz>"`.

### POST `/api/tours/admin/tours/:id/link-invoice`

```
Body: { invoice_id }
  │
  ├── `local:<id>` oder alte lokale ID
  │     → UPDATE exxas_invoices SET tour_id = ?, synced_at = NOW()
  │
  └── `live:<referenz>`
        ├── Falls lokal bereits vorhanden:
        │     → bestehende Zeile reaktivieren / zuordnen
        └── Sonst:
              → `exxas.getInvoiceDetails(referenz)`
              → INSERT in `tour_manager.exxas_invoices`
              → direkt `tour_id` setzen
```

### UI-Hinweise

- Live-Treffer erhalten ein **`Live`**-Badge.
- Bei Fehlern der Exxas-Liveabfrage wird `liveError` oberhalb der Tabelle angezeigt.
- Verknüpft wird immer über `link_id`, nicht mehr nur über die lokale numerische DB-ID.

---

## 7. Exxas-Order-Sync (Buchungen)

**Ziel:** Buchungen aus dem Booking-Tool an Exxas übertragen

**Status-Werte in `booking.orders`:**

| Wert | Bedeutung |
|---|---|
| `not_sent` | Noch nicht an Exxas übertragen |
| `sent` | Erfolgreich übertragen, `exxas_order_id` gesetzt |
| `error` | Fehler, `exxas_error` gesetzt |

**Hinweis:** Die Statusfelder und Hilfsfunktionen sind vorhanden, aber ein aktiv verdrahteter Order-Sync-Trigger für Buchungen ist im aktuellen Repo-Stand nicht klar nachweisbar. Diesen Abschnitt daher nur als Feld-/Zielbeschreibung verstehen, nicht als gesicherten Live-Flow.
