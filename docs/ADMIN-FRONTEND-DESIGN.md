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

- Layout- und Design-Tokens: `platform/frontend/src/index.css`
- Zweites internes Frontend: `booking/admin-panel/src/index.css`
- Referenzseite: `platform/frontend/src/pages/CustomersPage.tsx`
- Referenzliste: `platform/frontend/src/components/customers/CustomerList.tsx`
- Weitere interne Referenzseiten koennen aus `platform/frontend/src/pages/` und `booking/admin-panel/src/pages/` herangezogen werden, muessen sich aber in dieselbe visuelle Sprache einfuegen

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

## i18n Pflicht

Wenn neue Texte oder Tabellenlabels eingefuehrt werden:

- Schluessel in `de.json`, `en.json`, `fr.json`, `it.json` gleichzeitig anlegen
- Keine fehlenden Keys im UI akzeptieren
- Vorhandene Keys bevorzugen statt neue Synonyme anzulegen
