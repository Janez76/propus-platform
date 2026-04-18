# Porting Inventory: booking/admin-panel/ → app/src/

Stand: 2026-04-17

Messmethode Zeilenzahl: PowerShell `(Get-Content <Datei> | Measure-Object -Line).Lines` im Repo `propus-platform-1`.

Letzter Commit: `git log -1 --format="%h %s" -- <pfad>` relativ zum Git-Root von `propus-platform-1`.

---

## Bereits portiert (PR #82)

| Quelle (admin-panel, historisch) | Ziel (app/src/) | Status |
|----------------------------------|-----------------|--------|
| `src/lib/pricing.ts` + Tests | `app/src/lib/pricing.ts` | **DONE** |
| `src/hooks/useDirty.ts` | `app/src/hooks/useDirty.ts` | **DONE** |
| `src/hooks/useT.ts` | `app/src/hooks/useT.ts` | **DONE** |
| `src/lib/address.ts` | `app/src/lib/address.ts` | **DONE** |
| `src/components/ui/StatusBadge.tsx` | `app/src/components/ui/StatusBadge.tsx` | **DONE** |

Hinweis: `booking/admin-panel/src/lib/pricing.test.ts` existiert weiterhin in der SPA; die Produktions-Library ist in `app/` — Test-Port siehe Kategorie D.

---

## Schritt 1 — Ist-Zustand booking/admin-panel/src/

### `booking/admin-panel/src/components/orders/` (rekursiv)

| Pfad | Zeilen | Letzter Commit | Kurzbeschreibung |
|------|--------|----------------|------------------|
| `booking/admin-panel/src/components/orders/ChangePhotographerModal.tsx` | 126 | b94788b chore(orders): phase 1 – code hygiene | Modal: Fotograf für eine Bestellung auswählen und speichern (`Photographer`, i18n). |
| `booking/admin-panel/src/components/orders/OrderCards.tsx` | 73 | b94788b chore(orders): phase 1 – code hygiene | Karten-/Kachelansicht von Aufträgen. |
| `booking/admin-panel/src/components/orders/OrderChat.tsx` | 187 | 07d08ec refactor(admin-panel): tighten address heuristic + lint baseline + stepper tests | Chat-/Kommunikations-UI zur Bestellung. |
| `booking/admin-panel/src/components/orders/OrderCreate.tsx` | 140 | f60a890 feat: Gesamt-Design-Vereinheitlichung v2.3.326 | Einstieg/Container „Auftrag anlegen“. |
| `booking/admin-panel/src/components/orders/OrderEmailLog.tsx` | 160 | 0d3baad refactor(orders): phase 4 – polish | Anzeige des E-Mail-Verlaufs zur Bestellung. |
| `booking/admin-panel/src/components/orders/OrderMessages.tsx` | 48 | f60a890 feat: Gesamt-Design-Vereinheitlichung v2.3.326 | Nachrichten-/Kommentarliste (Order). |
| `booking/admin-panel/src/components/orders/OrderStatusSelect.tsx` | 91 | f60a890 feat: Gesamt-Design-Vereinheitlichung v2.3.326 | Auswahl des Order-Status (Dropdown). |
| `booking/admin-panel/src/components/orders/OrderTable.tsx` | 451 | 07d08ec refactor(admin-panel): tighten address heuristic + lint baseline + stepper tests | Tabellenliste der Aufträge inkl. Aktionen. |
| `booking/admin-panel/src/components/orders/PrintOrder.tsx` | 213 | b94788b chore(orders): phase 1 – code hygiene | Druck-/Export-UI für eine Bestellung. |
| `booking/admin-panel/src/components/orders/UploadTool.tsx` | 1571 | 1f4dae2 refactor(orders): missing empty states (contacts, uploads) | Großes Upload-/Medien-Tool inkl. Kontext „Order“ (Empty States). |
| `booking/admin-panel/src/components/orders/CreateOrderWizard/index.tsx` | 465 | 44bd606 test(admin-panel): add wizard unit tests for pricing + step validation | Orchestrator des mehrstufigen „Order anlegen“-Wizards. |
| `booking/admin-panel/src/components/orders/CreateOrderWizard/styles.ts` | 16 | 3fb1e08 refactor(orders): phase 3 – wizard | Wizard-spezifische Styles/Konstanten. |
| `booking/admin-panel/src/components/orders/CreateOrderWizard/validation.ts` | 35 | 07d08ec refactor(admin-panel): tighten address heuristic + lint baseline + stepper tests | Validierung pro Wizard-Schritt (u. a. Adresse). |
| `booking/admin-panel/src/components/orders/CreateOrderWizard/WizardPriceSidebar.tsx` | 108 | cccf6d1 refactor(orders): structural quick-wins (wizard hooks folder, tokens module, backup docs) | Sidebar: Preis-/Paket-Zusammenfassung im Wizard. |
| `booking/admin-panel/src/components/orders/CreateOrderWizard/WizardShell.tsx` | 163 | 3fb1e08 refactor(orders): phase 3 – wizard | Layout/Shell (Schritte, Navigation) des Wizards. |
| `booking/admin-panel/src/components/orders/CreateOrderWizard/hooks/useWizardForm.ts` | 311 | cccf6d1 refactor(orders): structural quick-wins (wizard hooks folder, tokens module, backup docs) | Hook: Formularzustand, Steps, Pricing-Anbindung im Wizard. |
| `booking/admin-panel/src/components/orders/CreateOrderWizard/steps/Step1Customer.tsx` | 307 | 1f4dae2 refactor(orders): missing empty states (contacts, uploads) | Wizard Schritt 1: Kunde/Kontakte. |
| `booking/admin-panel/src/components/orders/CreateOrderWizard/steps/Step2Object.tsx` | 250 | cccf6d1 refactor(orders): structural quick-wins (wizard hooks folder, tokens module, backup docs) | Wizard Schritt 2: Objekt/Adresse. |
| `booking/admin-panel/src/components/orders/CreateOrderWizard/steps/Step3Service.tsx` | 161 | cccf6d1 refactor(orders): structural quick-wins (wizard hooks folder, tokens module, backup docs) | Wizard Schritt 3: Leistung/Paket. |
| `booking/admin-panel/src/components/orders/CreateOrderWizard/steps/Step4Schedule.tsx` | 269 | cccf6d1 refactor(orders): structural quick-wins (wizard hooks folder, tokens module, backup docs) | Wizard Schritt 4: Terminplanung. |
| `booking/admin-panel/src/components/orders/OrderDetail/index.tsx` | 1209 | 5cf0cc6 refactor(orders): extract OrderDetailTabs nav and CommunicationTab | Haupt-„Order bearbeiten“-Ansicht (Tabs, Formular, Karten; Orchestrator). |
| `booking/admin-panel/src/components/orders/OrderDetail/OrderDetailHeader.tsx` | 123 | c229234 refactor(orders): move OrderDetail into folder structure (preserves history) | Kopfzeile (Titel, Meta-Aktionen) für OrderDetail. |
| `booking/admin-panel/src/components/orders/OrderDetail/OrderDetailStatsBar.tsx` | 47 | c229234 refactor(orders): move OrderDetail into folder structure (preserves history) | Statistik-/KPI-Leiste. |
| `booking/admin-panel/src/components/orders/OrderDetail/OrderDetailTabs.tsx` | 25 | 5cf0cc6 refactor(orders): extract OrderDetailTabs nav and CommunicationTab | Nur Tab-Header (`TabsList`/`TabsTrigger`); Inhalte bleiben im Orchestrator. |
| `booking/admin-panel/src/components/orders/OrderDetail/hooks/useOrderForm.ts` | 256 | ee08e40 refactor(orders): extract useOrderForm hook (state, dirty, snapshots) | Hook: lokaler Formularzustand, Dirty-Tracking, Snapshots. |
| `booking/admin-panel/src/components/orders/OrderDetail/tabs/CommunicationTab.tsx` | 80 | 5cf0cc6 refactor(orders): extract OrderDetailTabs nav and CommunicationTab | Tab „Kommunikation“ (ausgelagert aus Monolith). |

### Tests im Orders-/Wizard-Bereich (`*.test.ts` / `*.test.tsx`)

| Pfad | Zeilen | Letzter Commit | Kurzbeschreibung |
|------|--------|----------------|------------------|
| `booking/admin-panel/src/components/orders/CreateOrderWizard/validation.test.ts` | 121 | 07d08ec refactor(admin-panel): tighten address heuristic + lint baseline + stepper tests | Vitest: `isObjectAddressComplete`, `validateStep`. |
| `booking/admin-panel/src/components/orders/CreateOrderWizard/WizardShell.test.tsx` | 134 | 07d08ec refactor(admin-panel): tighten address heuristic + lint baseline + stepper tests | Vitest: Wizard-Shell/Stepper-Verhalten. |
| `booking/admin-panel/src/components/orders/CreateOrderWizard/hooks/useWizardForm.test.ts` | 229 | 44bd606 test(admin-panel): add wizard unit tests for pricing + step validation | Vitest: Wizard-State, Pricing-/Validierungs-Kantenfälle. |
| `booking/admin-panel/src/lib/pricing.test.ts` | 121 | b94788b chore(orders): phase 1 – code hygiene | Vitest: Pricing-Logik (Library in PR #82 nach `app/` portiert). |

**Anzahl Testfälle:** In diesen vier Dateien zusammen **65** Vorkommen von `it(` (Vitest), entspricht der kommunizierten Größenordnung „65 Unit-Tests“.

### Design-Tokens

| Pfad | Zeilen | Letzter Commit | Kurzbeschreibung |
|------|--------|----------------|------------------|
| `booking/admin-panel/src/styles/tokens.ts` | 34 | cccf6d1 refactor(orders): structural quick-wins (wizard hooks folder, tokens module, backup docs) | TS-Konstanten für `space`/`palette` als `var(--…)`-Strings, abgestimmt auf `:root` in CSS. |

### API-Client (Orders)

| Pfad | Zeilen | Letzter Commit | Kurzbeschreibung |
|------|--------|----------------|------------------|
| `booking/admin-panel/src/api/orders.ts` | 735 | 07d08ec refactor(admin-panel): tighten address heuristic + lint baseline + stepper tests | Fetch-Wrapper und Typen für Order-Endpunkte (`apiRequest`, `API_BASE`). |
| `booking/admin-panel/src/api/client.ts` | 215 | 07d08ec refactor(admin-panel): tighten address heuristic + lint baseline + stepper tests | HTTP-Client: `apiRequest`, Base-URL-Ermittlung (`import.meta.env.VITE_*`, Vite/SPA). |

### i18n (Orders-relevante Gesamtdateien)

Neue Keys einzeln auszuzählen ist hier nicht automatisiert — die vollständigen Dateien sind die Merge-Basis.

| Pfad | Zeilen | Letzter Commit | Kurzbeschreibung |
|------|--------|----------------|------------------|
| `booking/admin-panel/src/i18n/de.json` | 1381 | 8ad3c9b chore(admin-panel): remove unused i18n keys (dangerZone, unsavedChanges) | DE-Strings (JSON). |
| `booking/admin-panel/src/i18n/en.json` | 1364 | 8ad3c9b chore(admin-panel): remove unused i18n keys (dangerZone, unsavedChanges) | EN-Strings (JSON). |
| `booking/admin-panel/src/i18n/fr.json` | 1314 | 8ad3c9b chore(admin-panel): remove unused i18n keys (dangerZone, unsavedChanges) | FR-Strings (JSON). |
| `booking/admin-panel/src/i18n/it.json` | 1314 | 8ad3c9b chore(admin-panel): remove unused i18n keys (dangerZone, unsavedChanges) | IT-Strings (JSON). |

### Seiten (Pages)

| Pfad | Zeilen | Letzter Commit | Kurzbeschreibung |
|------|--------|----------------|------------------|
| `booking/admin-panel/src/pages/CustomersPage.tsx` | 909 | 07d08ec refactor(admin-panel): tighten address heuristic + lint baseline + stepper tests | Kundenverwaltung; bindet u. a. `CreateOrderWizard` ein. |
| `booking/admin-panel/src/pages/EmailTemplatesPage.tsx` | 793 | 07d08ec refactor(admin-panel): tighten address heuristic + lint baseline + stepper tests | Verwaltung E-Mail-Vorlagen. |
| `booking/admin-panel/src/pages/PrintOrderPage.tsx` | 79 | 07d08ec refactor(admin-panel): tighten address heuristic + lint baseline + stepper tests | Druckseite für Bestellung (Routing/Page). |

---

## Schritt 2 — Ist-Zustand app/src/

### `app/src/components/orders/` (rekursiv)

| Pfad | Zeilen | Kurzbeschreibung |
|------|--------|------------------|
| `app/src/components/orders/ChangePhotographerModal.tsx` | 126 | Entspricht SPA-Modal (Fotograf wechseln). |
| `app/src/components/orders/CreateOrderWizard.tsx` | 1938 | **Monolithischer** Wizard (entspricht der zerlegten SPA-Struktur `CreateOrderWizard/` + Steps). |
| `app/src/components/orders/OrderCards.tsx` | 79 | Kartenansicht Aufträge. |
| `app/src/components/orders/OrderChat.tsx` | 197 | Chat zur Bestellung. |
| `app/src/components/orders/OrderCreate.tsx` | 140 | Auftrag-anlegen-Einstieg. |
| `app/src/components/orders/OrderDetail.tsx` | 1642 | **Monolithische** Order-Detail-Ansicht (SPA: Ordner `OrderDetail/` + `index.tsx`). |
| `app/src/components/orders/OrderDetails.tsx` | 341 | Präsentations-Komponente „Order-Details“ (Dialog/Zusammenfassung; **nicht** identisch mit `OrderDetail.tsx`). |
| `app/src/components/orders/OrderDetailsExample.tsx` | 117 | Demo/Story-ähnliche Beispieldaten für `OrderDetails`. |
| `app/src/components/orders/OrderEmailLog.tsx` | 155 | E-Mail-Log. |
| `app/src/components/orders/OrderMessages.tsx` | 48 | Nachrichtenliste. |
| `app/src/components/orders/OrderStatusSelect.tsx` | 91 | Status-Auswahl. |
| `app/src/components/orders/OrderTable.tsx` | 448 | Auftragstabelle. |
| `app/src/components/orders/PrintOrder.tsx` | 227 | Druckansicht. |
| `app/src/components/orders/UploadTool.tsx` | 1597 | Upload-Tool (groß). |

**Hinweis:** `app/src/styles/tokens.ts` **fehlt** — Design-Tokens existieren in der SPA separat (`booking/admin-panel`, siehe Schritt 1).

### Bereits portiert (PR #82) — Zielpfade

| Pfad | Zeilen | Kurzbeschreibung |
|------|--------|------------------|
| `app/src/lib/pricing.ts` | 39 | Preisberechnung (portiert). |
| `app/src/lib/address.ts` | 4 | Adress-Helfer (portiert; sehr klein). |
| `app/src/hooks/useDirty.ts` | 5 | Dirty-Flag-Hook (portiert). |
| `app/src/hooks/useT.ts` | 7 | i18n-Zugriff (portiert). |
| `app/src/components/ui/StatusBadge.tsx` | 46 | Status-Badge (portiert). |

### i18n

| Pfad | Zeilen | Kurzbeschreibung |
|------|--------|------------------|
| `app/src/i18n/de.json` | 1854 | DE (größer als SPA-JSONs → bereits erweitert/anderer Stand). |
| `app/src/i18n/en.json` | 1854 | EN |
| `app/src/i18n/fr.json` | 1854 | FR |
| `app/src/i18n/it.json` | 1854 | IT |
| `app/src/i18n/index.ts` | 11 | `t(lang, key)` Loader für `de`/`en`/`fr`/`it`. |

### API-Client (Browser → Backend; nicht Next `route.ts`)

| Pfad | Zeilen | Kurzbeschreibung |
|------|--------|------------------|
| `app/src/api/client.ts` | 213 | `apiRequest`, Base-URL (`process.env.NEXT_PUBLIC_API_BASE`, Next). |
| `app/src/api/orders.ts` | 762 | Order-API-Funktionen (ähnlicher Aufbau wie SPA; **Zeilendifferenz** zur SPA: +27 Zeilen laut Messung). |

### Seiten (Legacy-Router unter `app/src/pages-legacy/`)

| Pfad | Zeilen | Kurzbeschreibung |
|------|--------|------------------|
| `app/src/pages-legacy/CustomersPage.tsx` | 1089 | Kunden-Seite (react-router); nutzt `CreateOrderWizard`. |
| `app/src/pages-legacy/EmailTemplatesPage.tsx` | 793 | E-Mail-Vorlagen. |
| `app/src/pages-legacy/PrintOrderPage.tsx` | 79 | Druckseite. |

### Next.js App Router — API-Routen (Proxy/Backend)

Order-spezifische `route.ts` unter `app/src/app/api/` **nicht** als eigene Datei vorhanden; Backend wird über Catch-Alls und `app/src/api/*` angesprochen. Relevante Einträge (Auszug):

| Pfad | Kurzbeschreibung |
|------|------------------|
| `app/src/app/api/booking/[[...path]]/route.ts` | Proxy Booking-API. |
| `app/src/app/api/admin/[...path]/route.ts` | Proxy Admin-API. |
| `app/src/app/api/address-suggest/route.ts` | Adress-Vorschläge. |
| `…` | Siehe Verzeichnis `app/src/app/api/` für vollständige Liste. |

### Tests unter `app/src/`

Keine `*.test.ts` / `*.test.tsx` unter `app/src/` gefunden — **Vitest/Tests-Setup fehlt** (siehe Kategorie D und offene Punkte).

---

## Neu zu portieren

### Kategorie A: Direkt-Kopie (niedrige Komplexität)

| Quelle → Ziel | Zeilen (Quelle) | Risiken / Hinweise |
|---------------|-----------------|---------------------|
| `booking/admin-panel/src/styles/tokens.ts` → `app/src/styles/tokens.ts` (neu anlegen) | 34 | Abgleich mit `app/src/app/globals.css` / Tailwind: Werte müssen zu den tatsächlich gesetzten CSS-Variablen passen; sonst visuelle Drift. |
| `CreateOrderWizard/styles.ts` → gleicher relativer Pfad unter zerlegtem Wizard in `app/` | 16 | Gering; nur wenn Wizard-Struktur übernommen wird. |

Komponenten, die in **beiden** Trees schon nahezu 1:1 existieren (nach Review ggf. „nur Diff“ statt Blind-Kopie): z. B. `ChangePhotographerModal`, `OrderStatusSelect`, `OrderMessages` — dennoch **Import-Pfade** (`@/`, `api`, `i18n`) und **Env** prüfen.

### Kategorie B: Merge / Anpassung (mittlere Komplexität)

| Quelle → Ziel | Zeilen (admin / app) | Was angepasst werden muss |
|---------------|------------------------|---------------------------|
| `booking/admin-panel/src/api/orders.ts` ↔ `app/src/api/orders.ts` | 735 / 762 | Drei-Wege-Merge: neue Endpunkte/Typen aus SPA vs. Next-Client; `client.ts`-Unterschiede (Vite vs. Next env). |
| `booking/admin-panel/src/api/client.ts` ↔ `app/src/api/client.ts` | 215 / 213 | `import.meta.env` vs. `process.env.NEXT_PUBLIC_*`; Fehlerpayload-/Retry-Verhalten angleichen. |
| `booking/admin-panel/src/i18n/*.json` ↔ `app/src/i18n/*.json` | ca. 1314–1381 / 1854 | Keys mergen: `app` ist umfangreicher — fehlende Order/Wizard-Strings aus SPA übernehmen, Duplikate/Drift auflösen. |
| `booking/admin-panel/src/pages/CustomersPage.tsx` ↔ `app/src/pages-legacy/CustomersPage.tsx` | 909 / 1089 | Routing: SPA vs. Legacy-`react-router` in `app`; bereits unterschiedliche Größe → fachlichen Diff sauber zusammenführen (nicht überschreiben ohne Review). |
| `…/EmailTemplatesPage.tsx` (beide) | 793 / 793 | Gleiche Zeilenzahl laut Messung — trotzdem inhaltlich diffen (Imports, Stores). |
| `…/PrintOrderPage.tsx` (beide) | 79 / 79 | Kurz — Router/Layout Next vs. SPA prüfen. |

### Kategorie C: Strukturelle Refactorings (hohe Komplexität)

| Quelle → Ziel | Zeilen (orientierend) | Decomposition-Plan |
|---------------|------------------------|---------------------|
| Gemeinsame Bausteine aus SPA (`useOrderForm`, `OrderDetailHeader`, `OrderDetailStatsBar`, `OrderDetailTabs`, `CommunicationTab`, Wizard-`validation`/`hooks`) | — | **C.1** Zuerst in `app/` einführbar machen (Imports, Tests), bevor Monolithen geschnitten werden. |
| `OrderDetail/` (SPA) → Aufsplitten von `app/src/components/orders/OrderDetail.tsx` | SPA `index.tsx` 1209; App-Monolith 1642 | **C.2** SPA-Struktur übernehmen; Tab-Inhalte bleiben laut SPA-Kommentar teils im Orchestrator (`index.tsx`). |
| `CreateOrderWizard/` (SPA) → Ersetzen/Erspalten von `app/src/components/orders/CreateOrderWizard.tsx` | SPA mehrere Dateien; App-Monolith 1938 | **C.3** Ordnerstruktur wie SPA: `steps/`, `hooks/useWizardForm`, `WizardShell`, `WizardPriceSidebar`, `validation.ts`; Monolith-Datei in `app/` reduzieren. |
| `UploadTool.tsx` | 1571 / 1597 | Groß; nach C.2/C.3 erneut testen (Empty States, Kontakte). |

### Kategorie D: Tests

| Testdatei (admin-panel) | Zeilen | Hinweis |
|-------------------------|--------|---------|
| `…/CreateOrderWizard/validation.test.ts` | 121 | Blockiert bis Vitest in `app/` läuft. |
| `…/CreateOrderWizard/WizardShell.test.tsx` | 134 | React/Vitest + ggf. jsdom — Next-kompatibel konfigurieren. |
| `…/CreateOrderWizard/hooks/useWizardForm.test.ts` | 229 | Hook-Tests. |
| `booking/admin-panel/src/lib/pricing.test.ts` | 121 | Gehört zur portierten `lib/pricing.ts` in `app/` — Zielpfad nach Konvention festlegen (z. B. `app/src/lib/pricing.test.ts`). |

**Gesamt:** 65 `it(`-Fälle in diesen Dateien — **Vitest-Setup in `app/`** ist Voraussetzung.

---

## Offene Fragen / Blocker

- **Rappen-Rundung (0.01 vs 0.05)** — vor Integration von `calculatePricing` / Abgleich mit Backend **fachlich klären** (betrifft Kategorie B/C und bestehende Tests).
- **Vitest-Setup in `app/`** (Next.js, TSX, Pfad-Aliase, `src`-Root) — Voraussetzung für Kategorie D.
- **i18n-Delta:** Automatischer Key-Vergleich SPA vs. `app` wurde nicht durchgeführt — beim Merge **Diff-Tool** oder Skript einplanen.
- **Namenskonflikt:** `OrderDetails.tsx` vs. `OrderDetail.tsx` in `app/` — beim Port klare Benennung/Docs, um Verwechslung mit SPA-`OrderDetail/` zu vermeiden.
- **`customers.ts` in `app/src/api/`:** wurde beim Scan nicht als Orders-Datei gelistet; für `CustomersPage`-Merge trotzdem **mit einbeziehen**.

---

## Empfohlene Portierungs-Reihenfolge (mit Schätzungen)

| # | Schritt | Geschätzte Stunden |
|---|---------|----------------------|
| 1 | Vitest-Setup in `app/` (Next-kompatibel, ein grüner Smoke-Test) | 6 h |
| 2 | Kategorie A (Tokens + kleine direkte Übernahmen) | 3 h |
| 3 | Kategorie B — parallel **i18n-Merge** und **api/orders + client** | 14 h |
| 4 | Kategorie C.1 — Utilities für Decomposition vorbereiten (Hooks, Tab-Header, Validierung) | 6 h |
| 5 | Kategorie C.2 — `OrderDetail.tsx` in `app/` nach SPA-Struktur zerlegen | 24 h |
| 6 | Kategorie C.3 — `CreateOrderWizard.tsx` nach SPA-Ordnerstruktur zerlegen | 24 h |
| 7 | Kategorie D — Tests portieren, 65 Fälle grün | 12 h |
| 8 | Build-Verifikation, Deploy Staging | 4 h |

*Schätzungen sind Groborders; echte Dauer hängt von Review-Zyklen und QA ab.*

---

## Abhängigkeiten

| Blocker / Vorgänger | Blockiert |
|---------------------|-----------|
| Klärung Rappen-Rundung | Zuverlässige Pricing-Tests + finale `orders`-API-/Wizard-Logik |
| Vitest-Setup in `app/` | Kategorie D (alle Tests) |
| Merge `client.ts` / Env-Konvention | Stabile API-Aufrufe aus portierten Komponenten |
| i18n-Merge abgeschlossen | UI-Review ohne fehlende Strings |
| Kategorie C.1 (Utilities/Teil-Komponenten) | C.2 OrderDetail-Extraktion ohne erneutes Big-Bang-Refactoring |
| Kategorie C.2 / C.3 abgeschlossen | Sinnvolle E2E-/Smoke-Tests auf Staging |

---

*Dieses Dokument ist eine Bestandsaufnahme; keine Code-Änderungen im Rahmen der Erstellung.*

---

## Updates

### 2026-04-18 — Etappe-2-Start-Entscheidungen

- **Rundung (Etappe 5/6):** Variante B beschlossen — `Math.round(x * 20) / 20` pro Position (nicht auf Zwischensummen oder Endbetrag). Umsetzung erst in Etappe 5/6, hier nur dokumentiert.
- **Inventory-Drift-Regel:** Alle künftigen Änderungen/Ergänzungen zum Inventory gehen in diesen Updates-Block, nicht inline ins Original.
- **Workflow:** Kein Push ohne Freigabe. Squash-Merge via PR als Standard. Chat plant und reviewt, Claude Code führt aus.
