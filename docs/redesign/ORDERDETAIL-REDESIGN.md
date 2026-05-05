# OrderDetail Redesign — Vorschlag

**Stand:** 2026-04-23  
**Status:** Vorschlag zur Review (nicht implementiert)  
**Betrifft:** `app/src/components/orders/OrderDetail.tsx` (1642 Zeilen, Monolith)  
**Ordnet ein in:** `PORTING-INVENTORY.md` → Kategorie C.2 (24 h geschätzt)

---

## 1 Ausgangslage

- **URL**: `admin-booking.propus.ch/orders/:id` (Beispiel: `/orders/100087`)
- **Ziel-Datei**: `app/src/components/orders/OrderDetail.tsx` — Monolith, 1642 Zeilen
- **SPA-Referenz** (teilzerlegt, Merge-Basis): `booking/admin-panel/src/components/orders/OrderDetail/`
  - `index.tsx` (1209 Zeilen, Tab-Inhalte noch im Orchestrator)
  - `OrderDetailHeader.tsx` (123)
  - `OrderDetailStatsBar.tsx` (47)
  - `OrderDetailTabs.tsx` (25)
  - `hooks/useOrderForm.ts` (256)
  - `tabs/CommunicationTab.tsx` (80)

## 2 Zwei Probleme, ein Refactor

1. **UX**: Tabs zwingen zum Kontext-Wechsel. Auf 13″-Laptop sieht der Bearbeiter nie Termin + Preis + Status gleichzeitig. Dirty-State beim Tab-Wechsel ist unklar kommuniziert.
2. **Architektur**: 1642 Zeilen in einer Datei. Änderung an einer Preis-Zeile triggert Re-Renders aller Tabs. Keine klare Verantwortungs-Trennung.

Der Vorschlag adressiert beides in **einem** Refactor — und nutzt denselben Zerlegungs-Aufwand, den Kategorie C.2 ohnehin vorsieht.

---

## 3 UX-Vorschlag

### Kern-Entscheidung: Tabs → Einseitiges Layout

Primäre Information (Kunde, Liegenschaft, Termin, Leistungen, Status, Zahlung) ist **permanent sichtbar**. Tiefer liegende Inhalte (Kommunikations-Log, E-Mail-Historie, Upload-Tool, Druck-Vorschau) bleiben als Tabs **unten am Dokument**, nicht oben als Navigation.

### Layout-Skizze (desktop, ≥ 1280 px)

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Bestellungen │ #100087 │ Ziegler Immo AG │ [TERMINIERT] │ [⋯]  │  Sticky
├─────────────────────────────────────────┬────────────────────────┤
│ Kunde           │ Liegenschaft          │  Status-Timeline      │
├─────────────────┴───────────────────────┤  (5 Knoten, klickbar)  │
│ Termin & Fotograf                       │                        │
├─────────────────────────────────────────┤  Zahlung               │
│ Leistungen (Paket + Addons + Travel)    │                        │
│ Live-Total mit Rappen-Rundung           │  Schnellaktionen       │
├─────────────────────────────────────────┤  ⌘B Bestätigung        │
│ Verknüpfungen                           │  ⌘R Rechnung           │
│ Matterport │ Galerie │ Ordner │ Rechn.  │  ⌘D Duplizieren        │
├─────────────────────────────────────────┤                        │
│ Notizen (intern / kundensichtbar)       │                        │
├─────────────────────────────────────────┤                        │
│ Deep-Dives (Tab-Row):                   │                        │
│ [Kommunikation] [E-Mail-Log] [Uploads]  │  Aktivität             │
├─────────────────────────────────────────┴────────────────────────┤
│ ● Automatisch gespeichert vor 2s  │  ⌘S Speichern  ⌘⏎ Versenden  │  Sticky
└──────────────────────────────────────────────────────────────────┘
```

### Vier konkrete UX-Änderungen

**(a) Status als Timeline statt Dropdown**  
`OrderStatusSelect` wird zur visuellen `StatusTimeline` rechts oben. Klick auf den nächsten Knoten löst die passende Transition aus. Der Dropdown bleibt im Aktionen-Menü `[⋯]` als Fallback für atypische Rückwärts-Transitionen (`confirmed → pending`, Stornos etc.).

**(b) Leistungen mit Live-Pricing statt Save-Reload**  
Inline-Toggles für Addons, Card-Picker für Paket, Slider oder Input für Rabatt. `calculatePricing()` läuft bei jedem `onChange`. Rappen-Rundung `Math.round(x * 20) / 20` **pro Position** (Etappe-2-Entscheid vom 2026-04-18). MwSt. 8.1 % und Total im Tabellen-Footer, immer aktuell.

**(c) Auto-Save mit sichtbarem Zustand**  
`useDirty()` treibt einen debounced Save (2 s nach letzter Änderung) und einen Indikator unten links. Keine Confirm-Dialoge beim Verlassen, kein impliziter Datenverlust. Bei Netzwerk-Fehler: roter Punkt + Retry-Button, nicht Toast.

**(d) Verknüpfungen in einer Sektion, nicht über Seiten verteilt**  
Alle Deliverables einer Bestellung (Matterport-Tour, Kunden-Galerie, Kundenordner, Rechnung) werden in `DeliverablesSection.tsx` gebündelt. Jede Zeile zeigt Status, Link und die passenden Aktionen. Die Matterport-Zeile kann in zwei Modi:

- **Existierende Tour verknüpfen** — Autocomplete gegen `tour_manager.tours` (Muster: `gbe-autocomplete-option` aus dem Listing-Editor). Keine Duplikate.
- **Externer Link/SID pasten** — Backend legt beim Speichern einen `tour_manager.tours`-Eintrag an, damit Laufzeit (6 Mt.), Erneuerung (CHF 59) und Reaktivierung (CHF 74) automatisch greifen.

Die bestehende Matterport-Verknüpfen-Seite bleibt erreichbar für Bulk-Operationen — sie wird aber nicht mehr der einzige Weg, einer einzelnen Bestellung eine Tour zuzuordnen.

---

## 4 Ziel-Datei-Struktur

`app/src/components/orders/OrderDetail/`:

```
OrderDetail/
├── index.tsx                       # Orchestrator, < 200 Zeilen
├── hooks/
│   ├── useOrderForm.ts             # Port aus SPA (256 Z.), state + dirty + snapshots
│   └── useOrderMutations.ts        # save, status-advance, photographer-assign
├── layout/
│   ├── OrderHeader.tsx             # Back, ID, Kunde, Status-Badge, Aktionen-Menu
│   └── OrderLayout.tsx             # 2-Spalten-Grid + Sticky Header/Footer
├── sections/
│   ├── CustomerCard.tsx            # Kunde + Kontakt, inline editierbar
│   ├── PropertyCard.tsx            # Liegenschaft, Adresse, Meta, Karte öffnen
│   ├── AppointmentCard.tsx         # Termin + Fotograf (nutzt ChangePhotographerModal)
│   ├── ServicesSection.tsx         # Paket + Addons + Travel + Key-Pickup + Rabatt
│   ├── DeliverablesSection.tsx     # Matterport + Galerie + Ordner + Rechnung (Verknüpfungen)
│   └── NotesSection.tsx            # Intern + kundensichtbar (zwei Textareas)
├── sidebar/
│   ├── StatusTimeline.tsx          # Ersetzt Dropdown auf Haupt-UI
│   ├── PaymentCard.tsx             # Offen/Bezahlt/Mahnung
│   ├── QuickActions.tsx            # Bestätigung/Rechnung/Duplizieren + Shortcuts
│   └── ActivityFeed.tsx            # Wer-was-wann (Order-History)
├── tabs/                           # Deep-Dives, optional, unten auf der Seite
│   ├── CommunicationTab.tsx        # Port aus SPA (80 Z.)
│   ├── EmailLogTab.tsx             # Wrapper um bestehende OrderEmailLog
│   └── UploadsTab.tsx              # Wrapper um bestehende UploadTool
└── README.md                       # Dokumentation der Zerlegung
```

**Prinzipien:**
- Jede Komponente < 300 Zeilen
- Business-Logik in Hooks, nicht in JSX
- CSS über `--accent` / `--surface-*` / `--text-*` / `--border-soft` Tokens (siehe `ADMIN-FRONTEND-DESIGN.md`)
- Neue Klassen nur wenn nötig, Prefix `gbe-order-*` analog zum Listing-Editor
- Keine Hardcoded-Farben in TSX
- Jeder neue String in `de/en/fr/it.json` gleichzeitig

---

## 5 Migrations-Schritte

**Regel:** jeder Punkt = ein Squash-Merge-PR, Review vor Push (Porting-Inventory-Workflow 2026-04-18).

| # | Schritt | Neue Dateien | h |
|---|---------|--------------|---|
| 1 | Scaffolding: Ordner anlegen, `OrderDetail.tsx` → `OrderDetail/index.tsx` verschieben (1:1, kein Content-Diff) | — | 1 |
| 2 | **Tab-Infrastruktur zurückbauen** in `index.tsx`: `OrderDetailTab`-Union, `activeTab`-State und `tabDefs` entfernen; Inhalte der 6 Tabs (overview/services/schedule/communication/files/history) werden zu vertikal gestackten Abschnitten im JSX. Zwischenstand: lange lineare Seite, noch nicht sektioniert. | — | 4 |
| 3 | `hooks/useOrderForm.ts` aus SPA portieren + in `index.tsx` einklinken | 1 | 3 |
| 4 | `layout/OrderHeader.tsx` extrahieren — verwende den bestehenden Sticky-Header aus HEAD als Basis, ergänze Aktionen-Menu | 1 | 2 |
| 5 | `sections/CustomerCard.tsx` + `PropertyCard.tsx` extrahieren | 2 | 3 |
| 6 | `sections/AppointmentCard.tsx` (bindet `ChangePhotographerModal` ein) | 1 | 2 |
| 7 | `sections/ServicesSection.tsx` mit `calculatePricing()` + Inline-Edits | 1 | 4 |
| 8 | `sections/DeliverablesSection.tsx` — Matterport (Autocomplete + URL-Paste), Galerie, Ordner, Rechnung | 1 | 4 |
| 9 | `sections/NotesSection.tsx` (zwei Textareas, intern/extern) | 1 | 2 |
| 10 | `sidebar/StatusTimeline.tsx` — ersetzt OrderStatusSelect auf Haupt-UI | 1 | 3 |
| 11 | `sidebar/PaymentCard.tsx`, `QuickActions.tsx`, `ActivityFeed.tsx` | 3 | 3 |
| 12 | `tabs/` als Deep-Dives (nicht primary nav), CommunicationTab aus SPA portieren | 3 | 2 |
| 13 | i18n-Keys in `de/en/fr/it.json` mergen (`order.detail.*` Namespace) | 4 | 2 |
| 14 | README.md der neuen Struktur + PORTING-INVENTORY Update | 2 | 1 |

**Summe:** ~ 36 h. Kategorie-C.2-Schätzung war 24 h — die +12 h decken: UX-Erweiterungen (Timeline, Auto-Save, Verknüpfungen) +8 h und den Tab-Rückbau +4 h, der im Original-Inventory nicht vorgesehen war (HEAD-Code ist jünger als die Inventory-Erstellung).

**Tests (Kategorie D parallel):** Vitest-Setup + 65 Testfälle aus SPA (separate Porting-Inventory-Zeile, 12 h).

---

## 6 Abhängigkeiten und Annahmen

**Vorausgesetzt vor Schritt 1:**
- Vitest-Setup in `app/` existiert noch nicht (PORTING-INVENTORY Kategorie D) — aber nicht blockierend für Schritte 1–10, nur für Schritt 12.
- `.gitignore`/`git ls-files` Leak-Check (offener Punkt aus vorigem Memory) sollte durch sein, bevor grössere PRs starten.

**Ausgangsbasis ist HEAD auf `claude/orderdetail-scaffolding-YZ5Zi`, NICHT `master`:**
- Lokaler `master` ist 60 PRs hinter Produktion (unrelated histories zu diesem Branch — eigenes Git-Problem, separat aufzulösen).
- HEAD enthält bereits substantielle Vorarbeit in **entgegengesetzter Richtung** zum Redesign: `OrderDetailTab` Union-Type, `activeTab` State, Sticky-Header mit Status-Badge, `tabDefs`-Array mit 6 Tabs (overview/services/schedule/communication/files/history), Billing-Address-Cascading.
- **Pivot-Entscheid 2026-04-23**: Tab-basierte Navigation wird zurückgebaut (Schritt 2). Sticky-Header bleibt, wird in Schritt 4 (OrderHeader) verwendet statt neu gebaut. Billing-Cascading bleibt.

**Annahmen über Datenmodell, bitte bestätigen:**
- "Leistungen" = 1 Paket + N Addons + Travel-Zone + Key-Pickup + Rabatt (wie `PricingInput` in `app/src/lib/pricing.ts` suggeriert). **Nicht** arbitrary Line Items.
- Status-Übergänge sind einseitig vorwärts, ausser über Aktionen-Menu.
- `useDirty()` ist kompatibel mit dem geplanten Auto-Save (2 s debounce via `setTimeout`).

**Berechtigungen (entschieden 2026-04-23):**
- **Admin darf alles** auf dieser Seite bearbeiten: inline Felder, Preis-Override pro Position, Rabatt, Status rückwärts, Verknüpfungen entfernen, Duplizieren, Rechnung erstellen.
- **Nicht-Admin-Rollen** sehen die Seite gar nicht — Route-Level-Guard in `app/src/app/`-Router, kein Feld-Level-Disable.
- **Keine feingranularen RBAC-Checks** auf Feldebene im `useOrderForm`-Hook — reduziert Komplexität erheblich.
- **Konsequenz:** Der `ActivityFeed` wird zum primären Audit-Trail. Jede Mutation (Feld-Update, Status-Transition, Verknüpfungs-Änderung) muss dort mit User + Timestamp + alter/neuer Wert erscheinen. Kein stilles Überschreiben.

---

## 7 Offene Fragen vor Start

1. **OrderStatusSelect** — bleibt als Fallback im Aktionen-Menu oder ganz raus?
2. **Auto-Save-Debounce** — 2 s OK, oder Server-Constraints die längere/kürzere Debounce verlangen?
3. **i18n-Review** — wer validiert die französischen und italienischen Strings vor Merge?
4. **`OrderDetails.tsx` vs. `OrderDetail/`** — der Name-Clash aus Porting-Inventory: im gleichen PR umbenennen oder separat?
5. **Tab-Persistenz** — soll der aktuell geöffnete Deep-Dive-Tab in URL/localStorage landen, oder beim Reload immer zu?
6. **Datenmodell Order ↔ Tour** — wo wohnt die Verknüpfung? Auf `tour_manager.tours.order_id`, auf `booking.orders.tour_id`, oder indirekt über Listings? Bestimmt, wie die Autocomplete in `DeliverablesSection` die Kandidaten lädt.
7. **Galerie-Token, Kundenordner, Rechnungsnummer** — welche dieser Felder existieren heute schon auf `booking.orders`? Wenn nicht, braucht es Migrationen, bevor Schritt 7 sinnvoll ist. (Der Autofill-Flash aus dem Listing-Editor suggeriert, dass `Kundenordner` und `Freigabe-Link` bereits da sind — bestätigen.)

---

## 8 Rollenverteilung

| Rolle | Aufgabe |
|-------|---------|
| **Chat (Review)** | Dieser Vorschlag, Component-Interface pro Schritt, PR-Review, Freigabe für Push |
| **Claude Code (Execution)** | Scaffolding, File-Moves, Hook-Ports, Komponenten-Extraktion, Tests grün machen |
| **Kein Push ohne explizite Freigabe pro Schritt** — pro PORTING-INVENTORY-Update 2026-04-18 |

---

## 9 Nächster konkreter Schritt

Falls dieser Vorschlag grundsätzlich freigegeben wird:

1. Offene Fragen aus §7 klären
2. Ich bereite die PR-Beschreibung + Commit-Message für **Schritt 1 (Scaffolding)** vor
3. Claude Code führt Schritt 1 aus, Chat reviewt, Push

Wenn etwas an der Richtung nicht passt (Tabs doch behalten, andere Reihenfolge, andere Dateistruktur), Feedback vor Schritt 1 — einmal gestartet, sind die späteren Schritte aufeinander aufgebaut.
