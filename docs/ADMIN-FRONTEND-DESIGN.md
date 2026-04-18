# Internal Backend Design

Diese Datei ist die feste Referenz fuer neue interne Backend-Seiten in allen Modulen.

## Ziel

Neue interne Oberflaechen sollen visuell zum bestehenden Propus-Backend-Design passen, statt pro Seite neue Muster zu erfinden.
Das gilt fuer:

- klassisches Admin Panel
- Tour Manager
- weitere bestehende interne Module
- alle zukuenftigen Backend-Seiten

## Source Of Truth

- Layout- und Design-Tokens: `app/src/index.css`
- Referenzseite: `app/src/pages-legacy/CustomersPage.tsx`
- Referenzliste: `app/src/components/customers/CustomerList.tsx`
- Zentrale Listen mit Tabs/Stats/Filter (Tour-Manager): `app/src/pages-legacy/admin/invoices/AdminInvoicesPage.tsx` (`/admin/invoices`)
- Weitere interne Referenzseiten aus `app/src/pages-legacy/` heranziehen.

## Verbindliche Bausteine

- Header: Titel, Untertitel, Primaraktion wie in `CustomersPage.tsx`
- Tabs: `cust-tab-row`, `cust-tab`, `cust-tab-count`
- Toolbar: `cust-toolbar`, `cust-search-wrap`, `cust-search-input`, `cust-filter-select`, `cust-count-badge`
- Tabellencontainer: `cust-table-wrap`
- Tabellenmuster: `cust-td-id`, `cust-customer-cell`, `cust-avatar`, `cust-td-address`
- Status/Rolle: `cust-status-badge`, `cust-status-aktiv`, `cust-status-inaktiv`, `cust-role-badge`, `cust-role-kunde`, `cust-role-admin`
- Aktionen: `cust-row-actions`, `cust-action-view`, `cust-action-icon`
- Paginierung: `cust-pagination`, `cust-page-btn`

## Regeln

- Erst vorhandene `cust-*`-Klassen und semantische Tokens wiederverwenden, dann erst neue Varianten schaffen.
- Keine neuen Hardcoded-Farben in TSX oder CSS, wenn bereits Tokens wie `--accent`, `--surface`, `--text-main`, `--border-soft` existieren.
- Neue Listen-/Verwaltungsseiten in allen internen Modulen sollen die Struktur `PageHeader -> optional Stats -> Tabs -> Toolbar -> Table -> Pagination` bevorzugen.
- Tour Manager und andere interne Module sollen dieselbe Dichte, Hierarchie, Tabellenoptik, Badge-Sprache, Hover-Verhalten und Aktionslogik verwenden wie bestehende Backend-Seiten.
- Wenn ein neues Muster mehrfach gebraucht wird, als wiederverwendbaren Baustein einfuehren statt seitenlokal zu duplizieren.
- User-facing Texte immer ueber i18n ausgeben, nicht inline hart codieren.

## Listing-Editor: Zuweisungs-Bausteine

Referenz: `app/src/pages-legacy/admin/listing/ListingEditorPage.tsx`, CSS in `app/src/styles/listing-admin.css`.

Die Listing-Editor-Seite (`/admin/listing/:id`) verwendet eigene `gbe-*`-Klassen. Der `:id`-Parameter akzeptiert sowohl UUID als auch Slug: Wird ein Slug erkannt, leitet die Seite automatisch auf die kanonische UUID-URL um (`navigate(pathListingAdmin(row.id), { replace: true })`), damit alle Folge-Mutationen (PATCH/DELETE) korrekt gegen `WHERE id = $1` funktionieren. Folgende Muster stehen zur Wiederverwendung bereit:

### Zuweisungs-Karte

- `gbe-card--assignment`: Karte mit farbigem linken Rand (`border-left: 3px solid var(--accent)`). Gruppiert Bestellung, Kunde und Kontakt.
- `gbe-card-hint`: Erklaerungstext unter der Kartenüberschrift (12 px, `--text-subtle`).

### Link-Chips (Verknuepfungs-Anzeige)

Kompakte Pill-Elemente, die eine aktive Verknuepfung (Bestellung, Kunde, Kontakt) anzeigen. Enthalten Icon, Label, optionale ID und einen Entfernen-Button.

- `gbe-link-chip`: Basis-Chip (Pill, `border-radius: 999px`, `--surface-raised`).
- `gbe-link-chip--order`, `gbe-link-chip--customer`, `gbe-link-chip--contact`: Varianten mit eigener Rand-Farbe. Die Kontakt-Variante zeigt bei einem Bestell-Kontakt-Fallback (Sentinel-ID `−1`) die Rolle «aus Bestellung» statt einer DB-ID an.
- `gbe-link-chip-icon`, `gbe-link-chip-label`, `gbe-link-chip-id`, `gbe-link-chip-remove`: Interne Bestandteile.

### Autocomplete-Optionen (strukturiert)

- `gbe-autocomplete-option`: Flex-Container (Icon + Body) fuer Dropdown-Eintraege.
- `gbe-autocomplete-option-icon`: Lucide-Icon links (16 px, `--text-subtle`).
- `gbe-autocomplete-option-body`: Rechter Bereich mit Titel und Subtext.
- `gbe-autocomplete-option-title`: Erste Zeile (flex, gap fuer inline-Badges).
- `gbe-autocomplete-option-sub`: Zweite Zeile (12 px, ellipsis).

### Bestell-Status-Badges

`OrderStatusBadge`-Komponente (`gbe-order-status-badge`) mit Varianten:

| CSS-Klasse | Status | Label (DE) |
|---|---|---|
| `gbe-order-status-badge--pending` | pending | offen |
| `gbe-order-status-badge--paused` | paused | pausiert |
| `gbe-order-status-badge--confirmed` | confirmed | bestaetigt |
| `gbe-order-status-badge--completed` | completed | abgeschlossen |
| `gbe-order-status-badge--done` | done | erledigt |
| `gbe-order-status-badge--cancelled` | cancelled | storniert |
| `gbe-order-status-badge--archived` | archived | archiviert |

Alle Varianten haben Light- und Dark-Theme-Farben.

### Autofill-Flash

- `gbe-autofill-flash`: Einblend-Meldung (gruener Balken links, `role="status"`), die nach 4 Sekunden automatisch ausblendet. Wird angezeigt wenn eine Bestellungs-Auswahl Felder vorausfuellt. Die Meldung listet dynamisch die uebernommenen Teile auf (z. B. «Kunde, Kontakt, Adresse, Kundenordner, Freigabe-Link aus Bestellung uebernommen.»).

## Shared Order-Module in der Main App

Wiederverwendbare Module in `app/src/`, die bei neuen Order-Features zuerst herangezogen werden sollen.

### StatusBadge

Komponente: `app/src/components/ui/StatusBadge.tsx`

Zeigt Bestell-Status als Badge mit Icon (Default-Variante) oder als Inline-Span mit Hintergrundfarbe (Print-Variante).

| Prop | Typ | Beschreibung |
|---|---|---|
| `status` | `string \| undefined \| null` | Status-Key (z.B. `pending`, `confirmed`, `cancelled`) |
| `variant` | `"default" \| "print"` | `default`: Icon + CSS-Klasse via `getStatusEntry`/`getStatusIcon`; `print`: Inline-Styles fuer Drucklayout |

Abhaengigkeit: `app/src/lib/status` (muss `getStatusEntry`, `getStatusIcon` exportieren).

### Preisberechnung (`pricing.ts`)

Modul: `app/src/lib/pricing.ts`

| Export | Beschreibung |
|---|---|
| `calculatePricing(input)` | Kanonische Preisformel: Subtotal + MwSt - Rabatt → Total |
| `VAT_RATE` | `0.081` (8.1 % Schweizer MwSt) |
| `KEY_PICKUP_PRICE` | `50` (CHF, Schluesselabholung) |
| `PricingInput` | Typ: `packagePrice`, `addons[]`, `travelZonePrice`, `keyPickupActive`, `discount` |
| `PricingResult` | Typ: `subtotal`, `discount`, `vat`, `total` |

Regeln: Negative Eingaben → 0; Rabatt vor MwSt; Rundung auf 2 Dezimalstellen.

### Hilfsfunktionen und Hooks

| Modul | Export | Beschreibung |
|---|---|---|
| `app/src/lib/address.ts` | `extractSwissZip(address)` | Extrahiert 4-stellige Schweizer PLZ aus Adress-String |
| `app/src/hooks/useDirty.ts` | `useDirty(current, initial)` | Generisches Dirty-Tracking via `fast-deep-equal` |
| `app/src/hooks/useT.ts` | `useT()` | Gibt sprachgebundene `t(key)`-Funktion zurueck (liest Sprache aus `authStore`) |

Abhaengigkeit in `app/package.json`: `fast-deep-equal` (fuer `useDirty`).

### Test-Infrastruktur

- Vitest-Konfiguration: `app/vitest.config.ts`
- Setup (jest-dom + Auto-Cleanup): `app/src/__tests__/setup.ts`
- Scripts in `package.json`: `npm test` / `npm run test:watch` / `npm run test:ui`
- Abhaengigkeiten: `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `vite-tsconfig-paths`
- CI-Workflow: `.github/workflows/app-ci.yml` (laeuft bei PRs und Pushes auf `master`, Pfad-Filter `app/**`)
- Ausfuehrliche Dokumentation: `app/TESTING.md`

---

## i18n Pflicht

Wenn neue Texte oder Tabellenlabels eingefuehrt werden:

- Schluessel in `de.json`, `en.json`, `fr.json`, `it.json` gleichzeitig anlegen
- Keine fehlenden Keys im UI akzeptieren
- Vorhandene Keys bevorzugen statt neue Synonyme anzulegen
