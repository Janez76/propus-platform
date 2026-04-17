# Orders-Modul Refactoring

## Ausgangspunkt

- **Datum Start:** 2026-04-17T10:58:16+00:00
- **Ursprungs-Branch:** claude/refactor-orders-module-OlvYb
- **Ursprungs-Commit:** 823c0c2d07cd0fa47fb7c5363f946942c8d90209
- **Commit-Message:** Merge pull request #75 from Janez76/claude/admin-booking-listing-OVBJc
- **Backup-Branch:** backup/orders-pre-refactor-20260417-105816 (lokal, aus dem damaligen Claude-Worktree). Nur der reduzierte Variant-Branch **`backup/orders-pre-refactor-20260417`** ist auf `origin` gelandet und dient dort als Rollback-Quelle.
- **Tarball:** `.backups/orders-pre-refactor-20260417-105816.tar.gz` (145 KB, damals angelegt, im aktuellen Worktree nicht mehr vorhanden – siehe "Backup-Bestaetigung" unten fuer die Rekonstruktionsoptionen)
- **Feature-Branch:** claude/refactor-orders-module-OlvYb (harness-vorgegeben, kein separater `refactor/orders-module`-Branch)

## Entscheidungen (aus Planungs-Q&A)

- Branch: `claude/refactor-orders-module-OlvYb` bleibt Feature-Branch.
- Test-Runner: Vitest wird in Phase 1 zu `booking/admin-panel` hinzugefügt.
- Pricing: `calculatePricing` kapselt nur die VAT-/Discount-/Total-Mathematik. `OrderDetail` behält den `/api/bot`-Aufruf für `subtotal`.
- Design-Tokens: `--space-*` werden in das bestehende `src/index.css` ergänzt, kein neues `tokens.ts`.
- i18n-Tarball: `src/i18n/` als Ordner statt nicht existierender `src/i18n.ts`.

## Rollback

Vollständiger Rollback zum Ausgangspunkt:

```bash
git checkout claude/refactor-orders-module-OlvYb
git reset --hard backup/orders-pre-refactor-20260417-105816
```

Partieller Rollback nur der Orders-Komponenten:

```bash
tar -xzf .backups/orders-pre-refactor-20260417-105816.tar.gz -C .
```

## Phasen-Log

- [x] Phase 0 – Backup
- [x] Phase 1 – Code-Hygiene
- [x] Phase 2 – OrderDetail UX
- [x] Phase 3 – Wizard
- [x] Phase 4 – Empty States + Feinschliff

## Phase 1 – Änderungen

### Neue Module
- `src/lib/pricing.ts` – zentrale Preislogik (`calculatePricing`, `VAT_RATE=0.081`, `KEY_PICKUP_PRICE=50`).
- `src/lib/pricing.test.ts` – 10 Unit-Tests (Vitest).
- `src/lib/address.ts` – `extractSwissZip(address)`.
- `src/hooks/useDirty.ts` – generisches Dirty-Tracking via `fast-deep-equal`.
- `src/hooks/useT.ts` – sprachgebundene `t`-Funktion (kein Call-Site-Migration in Phase 1).
- `src/components/ui/StatusBadge.tsx` – gemeinsame Status-Badge mit `variant: "default" | "print"`.
- `vitest.config.ts` + neue Scripts `test`/`test:watch` in `package.json`.

### Ersetzungen & Löschungen
- `CreateOrderWizard.tsx`: 6 Preiskalkulationen → `calculatePricing`; lokale `extractSwissZip` entfernt.
- `OrderDetail.tsx`: lokales `KEY_PICKUP_PRICE` entfernt, `recalcPricing` nutzt `calculatePricing`; ~60-Zeilen `detailsDirty`-Block durch Snapshot + `useDirty` ersetzt.
- `OrderCards.tsx`, `OrderTable.tsx`, `PrintOrder.tsx`: Eigene Badge-Varianten → `<StatusBadge />`.
- Dead Code: `OrderDetails.tsx`, `OrderDetailsExample.tsx` gelöscht; i18n-Keys `orderDetails.*`/`orderDetailsExample.*` aus allen 4 Sprachdateien entfernt.
- `ChangePhotographerModal.tsx`: Bugfix (beide Ternary-Zweige rendern denselben Key) → neuer Key `changePhotographer.button.confirm` in DE/EN/FR/IT.

### Abhängigkeiten
- Hinzu: `fast-deep-equal@^3.1.3`, `vitest@^4.1.4`, `@vitest/coverage-v8@^4.1.4`.

### Verhaltensänderungen (bewusst)
- **Rundung in `OrderDetail.recalcPricing`**: vorher 5-Rappen-Rundung (`Math.round(x*20)/20`), jetzt 2-Dezimal-Rundung (`Math.round(x*100)/100`). Abgestimmt mit der Formel in der Spec und konsistent mit dem Wizard. Auswirkung: Endbeträge können um ≤ 0.02 CHF abweichen; Backend-Preise werden nicht verändert (nur die clientseitige Nach-API-Mathematik).

### Verifikation
- `npx tsc -b --noEmit` → clean.
- `npx vitest run` → 10/10 passed.
- `npm run lint` → 40 errors / 13 warnings, identisch zur Baseline bis auf −1 `static-components` (Netto-Verbesserung; alle verbleibenden Warnungen sind vor-bestehend und außerhalb des Phase-1-Scopes).

## Phase 2 – Änderungen

### Neue Module
- `src/components/ui/tabs.tsx` – generisches Tabs-Primitiv (`<Tabs>`, `<TabsList>`, `<TabsTrigger>`, `<TabsContent>`) mit ARIA `role="tablist"`/`role="tab"`/`role="tabpanel"` und Keyboard-Fokus.
- `src/components/orders/OrderDetailHeader.tsx` – Header mit Titel + Status-Badge + primärer Save-Aktion (nur im Edit-Modus) + Kebab-Menü (Drucken / Upload / ICS / Auftrag löschen) + Schliessen-Button. Click-outside und Escape schliessen das Menü.
- `src/components/orders/OrderDetailStatsBar.tsx` – kompakte Stats-Leiste mit Termin, Fotograf, Total (3-Spalten auf sm).

### Restrukturierung `OrderDetail.tsx`
- Alte Kopfzeile (H3 + Edit/Close-Buttons) ersetzt durch `<OrderDetailHeader />`.
- `<OrderDetailStatsBar />` direkt unter dem Header, wenn `data` geladen ist.
- Inhalt in drei Tabs aufgeteilt:
  1. **Details** – Kunde, Rechnung, Objekt, Leistungen, Preisübersicht.
  2. **Termin & Status** – Status-Select, Termin, Mitarbeiter, Status-E-Mail-Targets.
  3. **Kommunikation** – `OrderChat`, `OrderEmailLog`, E-Mail-Resend.
- Inline Save-Button-Zeile (`flex items-center gap-3` mit `runSaveChanges`) entfernt – Save ist jetzt die primäre Aktion im Header.
- Bottom-Action-Bar (Drucken/Upload/ResendEmail/ICS) entfernt – Drucken/Upload/ICS/Löschen sind im Kebab-Menü; ResendEmail ist Bestandteil der Kommunikations-Tab.
- Danger-Zone-Block (roter Löschen-Button am Ende) entfernt – Löschen ist jetzt im Kebab-Menü (destructive, rot) und triggert den bestehenden `ConfirmDeleteDialog`.

### i18n
- Neu (DE/EN/FR/IT): `orderDetail.tab.details`, `orderDetail.tab.scheduling`, `orderDetail.tab.communication`, `common.moreActions`.
- `orderDetail.section.dangerZone` und `common.unsavedChanges` waren noch in den JSONs (ohne UI-Nutzung); später im i18n-Cleanup entfernt.

### Bewusst verschoben (Phase 2b)
- **Per-Card Inline-Edit** ist in Phase 2 nicht geliefert. Der bestehende globale `editMode`-Flag kontrolliert weiterhin sämtliche Edit-UI gleichzeitig. Rationale: Einzelsektions-Edit würde eine größere Umstellung der Save-Logik erfordern (entweder pro Sektion separate Endpoints oder feinere Dirty-Flags mit partiellem Payload) und gefährdet ohne Backend-Anpassungen das "No-API-Change"-Constraint. Als Phase-2b-Follow-up vorgesehen: pro Card ein Stift-Icon + lokaler `isEditing`-Toggle, globaler Save im Header speichert weiterhin alles.

### Verifikation
- `npx tsc -b --noEmit` → clean.
- `npx vitest run` → 10/10 passed.
- `npm run build` → erfolgreich.
- `npm run lint` → keine neuen Fehler in geänderten Dateien (2 pre-existing `exhaustive-deps`-Warnungen in `OrderDetail.tsx`).

## Phase 3 – Änderungen

### Neue Module
- `src/components/orders/CreateOrderWizard/` – neuer Ordner mit Wizard-Struktur:
  - `index.tsx` – Main-Orchestrator (lädt Katalog/Fotografen/Kontakte, hält Step-Index, Slot-Fetch, Submit).
  - `WizardShell.tsx` – Progress-Bar (4 Segmente, Checkmarks bei abgeschlossenen Schritten, Step-Label + Schritt-Zähler), Next/Back/Submit-Navigation, Content-Slot + optional Sticky-Sidebar (lg:`grid-cols-[1fr_320px]`).
  - `WizardPriceSidebar.tsx` – Live-Preis (Paket, Addons, Key-Pickup, Travel-Zone, Subtotal, Discount, VAT, Total) mit Empty-State.
  - `useWizardForm.ts` – `useReducer`-basierter Form-State (`WizardFormState` + `WizardAction`), `INITIAL_STATE`, `estimatePrice`, `selectPricing` (Selector) und `usePricing`-Hook; alle State-Mutationen gehen über typisierte Actions (`selectCustomer`, `setObjectAddress`, `setTravelZone`, `selectPackage`, `toggleAddon`, `toggleKeyPickup`, `setSlot`, `setInitialStatus`, `setStatusEmailTarget`, …).
  - `styles.ts` – gemeinsame Tailwind-Klassen (`INPUT_CLASS`, `LABEL_CLASS`, `SECTION_CLASS`, `SECTION_TITLE_CLASS`).
  - `steps/Step1Customer.tsx` – Firma, Ansprechpartner-Dropdown, Name/E-Mail/Telefon, Rechnungsadresse, CC-E-Mails.
  - `steps/Step2Object.tsx` – Objektadresse + Auto-Travel-Zone, Vor-Ort-Kontakt, Objekt-Metadaten (Typ, Fläche, Etagen, Zimmer), Beschreibung.
  - `steps/Step3Service.tsx` – Paket-Select, Addons-Checkboxen, Key-Pickup, Discount + Discount-Code; EmptyState wenn Katalog leer.
  - `steps/Step4Schedule.tsx` – Anfangsstatus, E-Mail-Targets, Fotograf-Select, Datum, AM/PM-Slot-Picker, Notizen; EmptyStates für leere Fotografen-Liste und leere Slots.

### Entfernte Module
- `src/components/orders/CreateOrderWizard.tsx` (1676-Zeilen-Monolith) → ersetzt durch `CreateOrderWizard/`-Ordner (Import-Pfad bleibt identisch, `import { CreateOrderWizard } from "../components/orders/CreateOrderWizard"` löst auf `index.tsx` auf).

### UX-Verbesserungen
- **4 Schritte** (Kunde / Objekt / Service / Termin) statt eine endlose Seite.
- **Progress-Bar**: abgeschlossene Schritte klickbar (zurückspringen), zukünftige blockiert; aktueller Schritt via `aria-current="step"`.
- **Per-Schritt-Validierung**: `Next`-Button ist disabled, wenn der aktuelle Schritt ungültige Pflichtfelder hat; Fehler werden inline am Feld angezeigt, nicht erst beim Submit.
- **Live-Preis-Sidebar** ab Schritt 3 (`showSidebar = currentStep >= 2`); auf Mobil fällt die Sidebar unter den Content (lg-breakpoint-gesteuert via `grid-cols-[1fr_320px]`).
- **Slot-Fetch** lädt nur, wenn der User tatsächlich auf Schritt 4 ist (Datensparen + weniger `/api/admin/availability`-Requests während dem Ausfüllen der ersten Schritte).

### useReducer statt useState-Cluster
- Alte 50-Felder-`useState` plus 10 weitere Zustände (Package/Addon-Codes, Slots, Email-Targets, …) zusammengeführt in einem einzigen Reducer.
- Pricing wird nicht mehr im Reducer berechnet, sondern on-the-fly aus dem State via `selectPricing(state, catalog)` (Selector-Pattern).
- Manuelle `subtotal`-Override möglich via `setManualSubtotal`-Action (erhält Ableitung von VAT/Total, clampt nie die gespeicherte Subtotal).

### i18n
- Neu (DE/EN/FR/IT): `wizard.progress.stepOf`, `wizard.priceSidebar.title`, `wizard.priceSidebar.empty`, `wizard.empty.noPhotographers`, `wizard.empty.noSlots`.
- Bestehende Keys `wizard.step.customer/object/service/schedule/price`, `wizard.button.back/next/createOrder` unverändert wiederverwendet.

### Verhaltensänderungen (bewusst)
- **Slot-Fetch-Timing**: Slots werden erst ab Schritt 4 geladen (bisher: sobald Datum gesetzt wurde, unabhängig von Wizard-Position). Weniger Netzwerk-Last während frühen Schritten.
- **Duplicate-else-if bereinigt**: Redundante `else if (isAny && data.resolvedPhotographer && Array.isArray(data.freeSlots))`-Klausel entfernt (Lint-Fehler `no-dupe-else-if`, gleichzeitig Logik-Cleanup; das erste `Array.isArray(data.freeSlots)` deckt den Fall ab).
- **Save-Button**: Aus dem Inline-Submit-Knopf am Seitenende wurde ein Submit-Button am Ende der Wizard-Navigation (nur im letzten Schritt sichtbar).

### Nicht umgestellt
- API-Contract zu `createOrder` / `updateOrderStatus` identisch (gleiches Payload-Shape).
- `OrderCreate.tsx` und `OrderDetail.tsx` wurden nicht angefasst.

### Verifikation
- `npx tsc -b --noEmit` → clean.
- `npx vitest run` → 10/10 passed.
- `npm run build` → erfolgreich (13.64s).
- `npm run lint` → 38 errors / 13 warnings (2 pre-existing Warnings in OrderDetail, alles andere vor-bestehend; −1 aus dem Wizard `no-dupe-else-if`-Fix).

## Phase 4 – Änderungen

### Empty States
- `OrderChat.tsx`: Wenn noch keine Nachrichten existieren, wird die alte Inline-Leerzeile durch `<EmptyState>` mit `MessageSquare`-Icon und i18n-Titel `chat.empty` ersetzt.
- `OrderEmailLog.tsx`: Die "Keine E-Mails gefunden"-Zeile ist durch `<EmptyState>` mit `MailX`-Icon ersetzt; bei `availability === "no_db"` wird `emailLog.empty.noDb` angezeigt, ansonsten `emailLog.empty`.

### UploadTool – Progress-Overlap entfernt
- Der globale Fortschrittsbalken im Upload-Header (der nur bei `busy === "upload"` sichtbar war und den gleichen Prozentwert wie die Datei-Overlays zeigte) wurde komplett entfernt.
- Die interne Datei-Progress-Liste im Dialog (zeigte pro Datei einen kleinen Balken zusätzlich zum Overlay über dem Preview) wurde entfernt.
- Übrig bleibt der **Transfer-Status-Balken** für Nicht-Upload-Transfers (WeTransfer/externe Links) – dieser hat als einziges verbliebenes UI-Element keinen Duplikat.
- Die Prozent-Overlays direkt auf den `FilePreviewCard`s bleiben unverändert; sie sind die einzige Fortschrittsanzeige pro Datei.

### OrderChat – Availability vereinfacht
- Entfernt: lokale Konstanten `ACTIVE_STATUSES`, `CHAT_BLOCKED_STATUSES`, `FEEDBACK_WINDOW_MS` und die Helfer-Funktion `deriveAvailabilityFromOrder(order, actorRole)`.
- Die Availability kommt jetzt ausschliesslich vom Backend (`GET /api/admin/orders/:orderNo/chat` liefert `availability`). Vor dem ersten Fetch wird ein sicherer Loading-Default (`{ readable: false, writable: false, feedbackUntil: null }`) verwendet – das Chat-Fenster ist also während des initialen Ladens nicht bedienbar, was mit dem bisherigen UX-Vertrag übereinstimmt (User sah vorher bestenfalls `chat.closed`).
- Die `actorRole`-Prop bleibt im Interface (wird nur noch für das Regel-Label `chat.rule.admin` / `chat.rule.beforeAppointment` / `chat.rule.afterAppointment` genutzt).

### Spacing-Tokens
- `src/index.css`: Neue CSS-Custom-Properties `--space-xs` (4px), `--space-sm` (8px), `--space-md` (12px), `--space-lg` (16px), `--space-xl` (24px), `--space-2xl` (32px) im `:root`-Block.
- Die Werte decken sich mit der Tailwind-Default-Scale (`space-1` = 4px, `space-2` = 8px, `space-3` = 12px, `space-4` = 16px, `space-6` = 24px, `space-8` = 32px), so dass bestehendes Tailwind-Padding/`gap-*` bereits konsistent ist. Tokens stehen bereit für direktes Inline-CSS (`style={{ padding: "var(--space-lg)" }}`) ohne Tailwind-Umweg.

### Nicht umgestellt
- Bestehende Tailwind-Utility-Klassen in den Orders-Komponenten wurden **nicht** pauschal auf `var(--space-*)` umgeschrieben – Tailwind-Scale und Tokens sind numerisch identisch, ein Massen-Ersatz würde das Diff aufblähen ohne Nutzen.
- i18n-Key-Cleanup für `orderDetail.section.dangerZone` / `common.unsavedChanges` erfolgte nach Phase 4 separat (Keys waren unbenutzt).

### Verifikation
- `npx tsc -b --noEmit` → clean.
- `npx vitest run` → 10/10 passed.
- `npm run build` → erfolgreich (12.82s).
- `npm run lint` → 51 Probleme, alles vor-bestehend (keine neuen Fehler oder Warnungen in den in Phase 4 geänderten Dateien).
- `tests/chat.e2e.spec.ts` nicht ausgeführt (Playwright-E2E benötigt laufenden API-Server auf `:3004` und Admin-Credentials); statische Review: Test hängt an `data-testid="order-chat"`, `chat-input`, `chat-send`, alle sind nach der Änderung unverändert vorhanden. Die Availability-Anzeige im Test stützt sich auf die Backend-Response, nicht auf den entfernten Client-Derivate-Code – damit weiterhin kompatibel.

---

## Übersicht – alle neuen Dateien (Phase 1 – 4)

- `src/lib/pricing.ts`
- `src/lib/pricing.test.ts`
- `src/lib/address.ts`
- `src/hooks/useDirty.ts`
- `src/hooks/useT.ts`
- `src/components/ui/StatusBadge.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/orders/OrderDetailHeader.tsx`
- `src/components/orders/OrderDetailStatsBar.tsx`
- `src/components/orders/CreateOrderWizard/index.tsx`
- `src/components/orders/CreateOrderWizard/WizardShell.tsx`
- `src/components/orders/CreateOrderWizard/WizardPriceSidebar.tsx`
- `src/components/orders/CreateOrderWizard/useWizardForm.ts`
- `src/components/orders/CreateOrderWizard/styles.ts`
- `src/components/orders/CreateOrderWizard/steps/Step1Customer.tsx`
- `src/components/orders/CreateOrderWizard/steps/Step2Object.tsx`
- `src/components/orders/CreateOrderWizard/steps/Step3Service.tsx`
- `src/components/orders/CreateOrderWizard/steps/Step4Schedule.tsx`
- `vitest.config.ts`
- `REFACTORING.md` (dieses Dokument)

## Gelöschte Dateien

- `src/components/orders/OrderDetails.tsx` (toter Code, Phase 1)
- `src/components/orders/OrderDetailsExample.tsx` (toter Code, Phase 1)
- `src/components/orders/CreateOrderWizard.tsx` (1676-Zeilen-Monolith ersetzt durch Ordner-Struktur, Phase 3)

## Breaking Changes

Keine für externe Consumer:

- **API-Contract unverändert**: `POST /api/admin/orders`, `PATCH …/status`, `GET …/chat`, `…/email-log`, `…/availability` – alle Payloads und Response-Shapes identisch.
- **Import-Pfade**: `CreateOrderWizard` wird weiterhin aus `@/components/orders/CreateOrderWizard` importiert (Node-Resolve greift `CreateOrderWizard/index.tsx`).
- **i18n-Keys**: nur additiv (neue Keys, keine umbenannten/entfernten, die von Konsumenten erwartet werden).

Intern (nur für Entwickler an `OrderDetail`/`CreateOrderWizard`):

- **`OrderDetail.recalcPricing` rundet jetzt auf 2 Dezimalen** statt auf 5 Rappen. Auswirkung ≤ 0.02 CHF auf client-seitige Totals; Backend-Berechnung unverändert.
- **`OrderChat` leitet Availability nicht mehr aus `order.status` ab**, sondern verlässt sich auf die Backend-Response. Wer `OrderChat` ausserhalb von `OrderDetail` verwenden will, muss sicherstellen, dass der `GET …/chat`-Endpoint eine valide `availability` liefert.
- **Wizard-Form-State** ist jetzt `useReducer`-basiert. Wer vorher direkten `setXxx`-Zugriff hatte, muss auf `dispatch({ type: …, … })` umstellen (nur intern, keine externen Konsumenten).

## Migration-Notes für andere Devs

1. **Neue Preislogik verwenden**: Alle client-seitigen Preisberechnungen gehen durch `calculatePricing(...)` aus `src/lib/pricing.ts`. Keine neuen Inline-VAT/Discount-Formeln mehr.
2. **Dirty-Tracking**: Für neue Forms `useDirty(snapshot, current)` aus `src/hooks/useDirty.ts` nutzen (via `fast-deep-equal`), nicht manuell per-Feld vergleichen.
3. **Status-Badges**: Einheitlich `<StatusBadge status={...} variant="default|print" />` aus `src/components/ui/StatusBadge.tsx` – keine neuen eigenen Badge-Komponenten.
4. **Tabs / Empty States**: `src/components/ui/tabs.tsx` und `src/components/ui/empty-state.tsx` wiederverwenden.
5. **Wizard erweitern**: Neue Felder als Action im `WizardAction`-Union hinzufügen, Reducer-Branch anfügen, in `selectPricing` berücksichtigen wenn preisrelevant, dann im entsprechenden `steps/StepX.tsx` renderen.
6. **Spacing**: `var(--space-*)` für Inline-Styles; Tailwind `gap-2/3/4/6/8` für Flex/Grid – beide führen zum gleichen Pixelwert.

## Offene Punkte / Follow-ups

- **Phase 2b**: Per-Card Inline-Edit in `OrderDetail.tsx` (globaler `editMode`-Flag durch pro-Section-Toggles ersetzen). Erfordert Backend-seitig entweder feinere Save-Endpoints oder client-seitiges partielles Payload-Merging.
- **Lint-Baseline**: 51 vor-bestehende Probleme (vor allem `exhaustive-deps` in Legacy-Komponenten). Separater Cleanup-PR empfohlen.
- **Wizard-Tests** (2026-04-17): Unit-Tests für `estimatePrice`, `selectPricing` (`CreateOrderWizard/hooks/useWizardForm.test.ts`) und `validateStep`/`isObjectAddressComplete` (`CreateOrderWizard/validation.test.ts`) ergänzt – 34 neue Tests (`npx vitest run` → 44/44). Follow-up: Component-Tests für den Stepper/Progress-Bar (benötigt `@testing-library/react`).
- **Playwright-Suite**: `tests/chat.e2e.spec.ts` + ggf. neue Specs für den 4-Step-Wizard in CI aufnehmen.

## Backup-Bestätigung

- **Ausgangs-Commit** `823c0c2d07cd0fa47fb7c5363f946942c8d90209` (Merge von PR #75) ist in der Git-History auf `master` weiterhin erreichbar (`git cat-file -t 823c0c2` → commit). Der komplette Pre-Refactor-Stand lässt sich jederzeit wiederherstellen via `git checkout 823c0c2 -- booking/admin-panel/src/components/orders/` oder für einen vollständigen Rollback-Branch via `git checkout -b rollback-orders 823c0c2`.
- **Backup-Branch auf origin:** `backup/orders-pre-refactor-20260417` (Commit `823c0c2`) existiert remote und ist die autoritative Rollback-Quelle. Abruf per `git fetch origin backup/orders-pre-refactor-20260417 && git checkout -b rollback-orders FETCH_HEAD`.
- **Hinweis zum Plan-Namen mit Uhrzeit-Suffix:** Der ursprünglich in Phase 0 erzeugte lokale Backup-Branch `backup/orders-pre-refactor-20260417-105816` wurde nicht zu `origin` gepusht und existiert in keinem aktuellen Worktree mehr. Der Inhalt ist vollständig identisch zum Commit `823c0c2` (siehe oben) und ist über den remote-Branch ohne Uhrzeit-Suffix weiterhin erreichbar.
- **Tarball `.backups/orders-pre-refactor-20260417-105816.tar.gz`: lokal nicht verfügbar.** Für einen reproduzierbaren Tarball-Snapshot aus dem Ausgangs-Commit: `git archive --format=tar.gz --prefix=orders-pre-refactor/ 823c0c2 -- booking/admin-panel/src/components/orders booking/admin-panel/src/i18n booking/admin-panel/src/lib > /tmp/orders-pre-refactor.tar.gz`.
