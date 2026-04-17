# Orders-Modul Refactoring

## Ausgangspunkt

- **Datum Start:** 2026-04-17T10:58:16+00:00
- **Ursprungs-Branch:** claude/refactor-orders-module-OlvYb
- **Ursprungs-Commit:** 823c0c2d07cd0fa47fb7c5363f946942c8d90209
- **Commit-Message:** Merge pull request #75 from Janez76/claude/admin-booking-listing-OVBJc
- **Backup-Branch:** backup/orders-pre-refactor-20260417-105816
- **Tarball:** .backups/orders-pre-refactor-20260417-105816.tar.gz (145 KB)
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
- [ ] Phase 3 – Wizard
- [ ] Phase 4 – Empty States + Feinschliff

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
- `orderDetail.section.dangerZone` und `common.unsavedChanges` bleiben in den JSONs erhalten (potenzielle Wiederverwendung an anderer Stelle; harmlos). Cleanup ggf. in Phase 4.

### Bewusst verschoben (Phase 2b)
- **Per-Card Inline-Edit** ist in Phase 2 nicht geliefert. Der bestehende globale `editMode`-Flag kontrolliert weiterhin sämtliche Edit-UI gleichzeitig. Rationale: Einzelsektions-Edit würde eine größere Umstellung der Save-Logik erfordern (entweder pro Sektion separate Endpoints oder feinere Dirty-Flags mit partiellem Payload) und gefährdet ohne Backend-Anpassungen das "No-API-Change"-Constraint. Als Phase-2b-Follow-up vorgesehen: pro Card ein Stift-Icon + lokaler `isEditing`-Toggle, globaler Save im Header speichert weiterhin alles.

### Verifikation
- `npx tsc -b --noEmit` → clean.
- `npx vitest run` → 10/10 passed.
- `npm run build` → erfolgreich.
- `npm run lint` → keine neuen Fehler in geänderten Dateien (2 pre-existing `exhaustive-deps`-Warnungen in `OrderDetail.tsx`).
