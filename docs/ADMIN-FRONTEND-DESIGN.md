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
- Zweites internes Frontend: `booking/admin-panel/src/index.css`
- Referenzseite: `app/src/pages-legacy/CustomersPage.tsx`
- Referenzliste: `app/src/components/customers/CustomerList.tsx`
- Zentrale Listen mit Tabs/Stats/Filter (Tour-Manager): `app/src/pages-legacy/admin/invoices/AdminInvoicesPage.tsx` (`/admin/invoices`)
- Weitere interne Referenzseiten koennen aus `app/src/pages-legacy/` und `booking/admin-panel/src/pages/` herangezogen werden, muessen sich aber in dieselbe visuelle Sprache einfuegen

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

Die Listing-Editor-Seite (`/admin/listing/:id`) verwendet eigene `gbe-*`-Klassen. Folgende Muster stehen zur Wiederverwendung bereit:

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

## i18n Pflicht

Wenn neue Texte oder Tabellenlabels eingefuehrt werden:

- Schluessel in `de.json`, `en.json`, `fr.json`, `it.json` gleichzeitig anlegen
- Keine fehlenden Keys im UI akzeptieren
- Vorhandene Keys bevorzugen statt neue Synonyme anzulegen
