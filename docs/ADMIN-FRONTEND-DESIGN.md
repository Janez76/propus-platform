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

## Booking Admin-Panel: Gemeinsame Bausteine (seit Phase 1 Refactoring)

Wiederverwendbare Module im Booking Admin-Panel (`booking/admin-panel/`), die bei neuen Order-Features zuerst herangezogen werden sollen.

### StatusBadge

Komponente: `src/components/ui/StatusBadge.tsx`

Einheitliche Darstellung des Bestell-Status in allen Order-Ansichten. Ersetzt bisherige inline Badge-Implementierungen.

| Prop | Typ | Beschreibung |
|---|---|---|
| `status` | `string` | Status-Key (z.B. `pending`, `confirmed`, `cancelled`) |
| `variant` | `"default" \| "print"` | `default`: Icon + CSS-Klasse; `print`: Inline-Styles fuer Drucklayout |

Verwendet in: `OrderTable`, `OrderCards`, `PrintOrder`.

### Preisberechnung (`pricing.ts`)

Modul: `src/lib/pricing.ts`

| Export | Beschreibung |
|---|---|
| `calculatePricing(input)` | Kanonische Preisformel: Subtotal + MwSt + Rabatt → Total |
| `VAT_RATE` | `0.081` (8.1 % Schweizer MwSt) |
| `KEY_PICKUP_PRICE` | `50` (CHF, Schluesselabholung) |

Eingabe (`PricingInput`): `packagePrice`, `addons[]`, `travelZonePrice`, `keyPickupActive`, `discount`.
Ausgabe (`PricingResult`): `subtotal`, `discount`, `vat`, `total`.

Regeln:
- Negative Eingaben werden auf 0 geklemmt.
- Rabatt wird vor MwSt abgezogen; Ergebnis kann nicht negativ werden.
- Rundung auf 2 Dezimalstellen (`Math.round(x * 100) / 100`).
- Unit-Tests: `src/lib/pricing.test.ts` (Vitest, 10 Tests).

### Hilfsfunktionen und Hooks

| Modul | Export | Beschreibung |
|---|---|---|
| `src/lib/address.ts` | `extractSwissZip(address)` | Extrahiert 4-stellige Schweizer PLZ aus Adress-String |
| `src/hooks/useDirty.ts` | `useDirty(current, initial)` | Generisches Dirty-Tracking via `fast-deep-equal` |
| `src/hooks/useT.ts` | `useT()` | Gibt sprachgebundene `t(key)`-Funktion zurueck (Convenience-Wrapper) |

### Test-Infrastruktur

- Vitest-Konfiguration: `booking/admin-panel/vitest.config.ts`
- Scripts in `package.json`: `npm test` / `npm run test:watch`
- Abhaengigkeiten: `vitest`, `@vitest/coverage-v8`, `fast-deep-equal`

## Booking Admin-Panel: OrderDetail UX (seit Phase 2 Refactoring)

### Tabs-Primitiv (`tabs.tsx`)

Komponente: `src/components/ui/tabs.tsx`

Generisches, abhaengigkeitsfreies Tabs-Primitiv mit vollstaendiger ARIA-Unterstuetzung (`role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`). Unterstuetzt sowohl kontrolliert (`value`-Prop) als auch unkontrolliert (`defaultValue`).

| Export | Beschreibung |
|---|---|
| `Tabs` | Wrapper mit Context-Provider; nimmt `defaultValue` oder `value`+`onValueChange` entgegen |
| `TabsList` | Container fuer Tab-Trigger (`role="tablist"`) |
| `TabsTrigger` | Einzelner Tab-Button mit `value`-Prop; aktiver Tab erhaelt Akzent-Farbe und `border-bottom` |
| `TabsContent` | Panel-Inhalt, wird nur gerendert wenn der zugehoerige Tab aktiv ist |

Styling: Verwendet Design-Tokens (`--accent`, `--border-soft`). Keyboard-Navigation via `tabIndex`.

### OrderDetailHeader

Komponente: `src/components/orders/OrderDetailHeader.tsx`

Ersetzt die bisherige einfache Kopfzeile (H3 + Edit/Close) durch einen vollstaendigen Header-Baustein.

| Element | Beschreibung |
|---|---|
| Titel + StatusBadge | Bestellnummer mit inline Status-Badge |
| Primaere Aktion (Edit-Modus) | Save-Button (disabled wenn nicht dirty), Cancel-Button |
| Edit-Button (Lese-Modus) | Oeffnet den globalen Edit-Modus |
| Kebab-Menue (3-Punkte) | Drucken, Upload, ICS-Download, Auftrag loeschen (destructive, rot) |
| Schliessen-Button | Immer sichtbar |

Das Kebab-Menue schliesst bei Click-outside und Escape. Menueeintraege werden als `MenuItem[]`-Array uebergeben (Label, onClick, optional `destructive`).

### OrderDetailStatsBar

Komponente: `src/components/orders/OrderDetailStatsBar.tsx`

Kompakte 3-Spalten-Leiste (responsive, `sm:grid-cols-3`) direkt unter dem Header. Zeigt auf einen Blick:

| Stat | Icon | Quelle |
|---|---|---|
| Termin | `CalendarDays` | `data.appointmentDate` (formatiert) oder "Nicht gesetzt" |
| Fotograf | `User` | `data.photographer.name` oder "Nicht zugewiesen" |
| Total | `Wallet` | `data.total` bzw. `data.pricing.total` (formatiert als Waehrung) |

Styling: `surface-raised` Hintergrund, `--border-soft` Rand, Lucide-Icons in Akzent-Farbe.

### OrderDetail Tab-Layout

`OrderDetail.tsx` ist seit Phase 2 in drei Tabs aufgeteilt (via `<Tabs defaultValue="details">`):

| Tab | i18n-Key | Inhalt |
|---|---|---|
| **Details** | `orderDetail.tab.details` | Kunde, Rechnung, Objekt, Leistungen, Preisberechnung |
| **Termin & Status** | `orderDetail.tab.scheduling` | Status-Select, Termin-/Zeitfelder, Fotografen-Zuweisung, Status-E-Mail-Targets |
| **Kommunikation** | `orderDetail.tab.communication` | `OrderChat`, `OrderEmailLog`, E-Mail-Resend-Select |

Bisherige Elemente, die entfernt/verschoben wurden:
- Bottom-Action-Bar (Drucken/Upload/ICS) → Kebab-Menue im Header
- Danger-Zone-Block (roter Loeschen-Button) → Kebab-Menue (destructive)
- Inline Save-Button-Zeile → Primaere Aktion im Header

## Booking Admin-Panel: CreateOrderWizard (seit Phase 3 Refactoring)

Der ehemalige 1676-Zeilen-Monolith `CreateOrderWizard.tsx` wurde in eine Ordner-Struktur aufgeteilt. Der Import-Pfad bleibt identisch (`import { CreateOrderWizard } from "../components/orders/CreateOrderWizard"` → loest auf `index.tsx` auf).

### Ordner-Struktur

| Datei | Beschreibung |
|---|---|
| `CreateOrderWizard/index.tsx` | Main-Orchestrator: laedt Katalog/Fotografen/Kontakte, haelt Step-Index, Slot-Fetch, Submit |
| `CreateOrderWizard/WizardShell.tsx` | Progress-Bar (4 Segmente, Checkmarks, Step-Label), Next/Back/Submit-Navigation, Content-Slot + optionale Sticky-Sidebar |
| `CreateOrderWizard/WizardPriceSidebar.tsx` | Live-Preis-Sidebar: Paket, Addons, Key-Pickup, Travel-Zone, Subtotal, Discount, VAT, Total; mit Empty-State |
| `CreateOrderWizard/useWizardForm.ts` | `useReducer`-basierter Form-State (`WizardFormState` + `WizardAction`), `INITIAL_STATE`, `estimatePrice`, `selectPricing`-Selector, `usePricing`-Hook |
| `CreateOrderWizard/styles.ts` | Gemeinsame Tailwind-Klassen: `INPUT_CLASS`, `LABEL_CLASS`, `SECTION_CLASS`, `SECTION_TITLE_CLASS` |
| `CreateOrderWizard/steps/Step1Customer.tsx` | Firma, Ansprechpartner-Dropdown, Name/E-Mail/Telefon, Rechnungsadresse, CC-E-Mails |
| `CreateOrderWizard/steps/Step2Object.tsx` | Objektadresse + Auto-Travel-Zone, Vor-Ort-Kontakt, Objekt-Metadaten (Typ, Flaeche, Etagen, Zimmer), Beschreibung |
| `CreateOrderWizard/steps/Step3Service.tsx` | Paket-Select, Addons-Checkboxen, Key-Pickup, Discount + Discount-Code |
| `CreateOrderWizard/steps/Step4Schedule.tsx` | Anfangsstatus, E-Mail-Targets, Fotograf-Select, Datum, AM/PM-Slot-Picker, Notizen |

### WizardShell (wiederverwendbar)

Exportiert: `WizardShell`, `WizardStepDef`

| Prop | Typ | Beschreibung |
|---|---|---|
| `steps` | `WizardStepDef[]` | Array mit `{ key, label }` pro Schritt |
| `currentIndex` | `number` | Aktueller Schritt (0-basiert) |
| `canNext` | `boolean` | Aktiviert/deaktiviert den Weiter-Button |
| `isSubmitting` | `boolean` | Zeigt Spinner auf Submit-Button |
| `onBack / onNext / onSubmit / onGoto` | Callbacks | Navigation |
| `children` | `ReactNode` | Step-Inhalt (linke Spalte) |
| `sidebar` | `ReactNode` (optional) | Sticky-Sidebar (rechte Spalte, `lg:grid-cols-[1fr_320px]`) |

Progress-Bar: abgeschlossene Schritte klickbar (zurueckspringen), zukuenftige blockiert; aktiver Schritt via `aria-current="step"`.

### useWizardForm (Reducer-Pattern)

Form-State wird ueber typisierte Actions mutiert. Wichtige Actions:

| Action | Beschreibung |
|---|---|
| `selectCustomer` | Befuellt Kunde + Rechnungsadresse aus Customer-Objekt |
| `selectContact` | Waehlt Kontaktperson aus Dropdown |
| `setObjectAddress` | Parsed Adresse (Strasse, PLZ, Ort, Kanton) |
| `setTravelZone` | Setzt Anfahrtszone inkl. Preis |
| `selectPackage` | Waehlt Paket + Preis |
| `toggleAddon` | Addon an/aus |
| `toggleKeyPickup` | Schluesselabholung an/aus |
| `setSlot` | Datum + Uhrzeit setzen |
| `setInitialStatus` | Anfangsstatus der Bestellung |
| `setStatusEmailTarget` | E-Mail-Versand-Ziele (Kunde, Buero, Fotograf, CC) |

Pricing wird nicht im Reducer berechnet, sondern on-the-fly via `selectPricing(state, catalog)` (Selector-Pattern). Manueller Subtotal-Override moeglich via `setManualSubtotal`.

### Per-Schritt-Validierung

`validateStep(index, state)` prueft Pflichtfelder pro Schritt. Der `Next`-Button ist disabled, wenn der aktuelle Schritt ungueltige Felder hat; Fehler werden inline am Feld angezeigt.

## Booking Admin-Panel: EmptyState + Spacing Tokens (seit Phase 4 Refactoring)

### EmptyState

Komponente: `src/components/ui/empty-state.tsx`

Einheitliche Leer-Darstellung fuer Listen und Panels ohne Inhalt.

| Prop | Typ | Beschreibung |
|---|---|---|
| `icon` | `ReactNode` | Lucide-Icon (z.B. `<MessageSquare />`, `<MailX />`) |
| `title` | `string` | Haupttext (via i18n) |
| `className` | `string` (optional) | Zusaetzliche CSS-Klassen |

Verwendet in: `OrderChat` (leere Nachrichten), `OrderEmailLog` (kein E-Mail-Log), `Step3Service` (leerer Katalog), `Step4Schedule` (keine Fotografen/keine Slots).

### Spacing Tokens

Neue CSS-Custom-Properties in `booking/admin-panel/src/index.css` (`:root`-Block):

| Token | Wert | Tailwind-Aequivalent |
|---|---|---|
| `--space-xs` | 4px | `space-1` |
| `--space-sm` | 8px | `space-2` |
| `--space-md` | 12px | `space-3` |
| `--space-lg` | 16px | `space-4` |
| `--space-xl` | 24px | `space-6` |
| `--space-2xl` | 32px | `space-8` |

Fuer Inline-Styles (`style={{ padding: "var(--space-lg)" }}`) ohne Tailwind-Umweg. Bestehende Tailwind-Klassen bleiben unveraendert (numerisch identisch).

### OrderChat – Server-seitige Availability

`OrderChat` leitet die Chat-Verfuegbarkeit nicht mehr lokal ab (`deriveAvailabilityFromOrder` entfernt). Die Availability kommt ausschliesslich vom Backend (`GET /api/admin/orders/:orderNo/chat` → `availability`). Vor dem ersten Fetch gilt ein sicherer Default (`readable: false, writable: false`).

---

## i18n Pflicht

Wenn neue Texte oder Tabellenlabels eingefuehrt werden:

- Schluessel in `de.json`, `en.json`, `fr.json`, `it.json` gleichzeitig anlegen
- Keine fehlenden Keys im UI akzeptieren
- Vorhandene Keys bevorzugen statt neue Synonyme anzulegen
