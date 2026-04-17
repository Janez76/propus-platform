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
- [ ] Phase 1 – Code-Hygiene
- [ ] Phase 2 – OrderDetail UX
- [ ] Phase 3 – Wizard
- [ ] Phase 4 – Empty States + Feinschliff
