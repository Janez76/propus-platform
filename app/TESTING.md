# Testing in app/

Vitest-basierte Unit-Tests fuer die Main-App.

## Tests ausführen

### Lokal
- `npm test` — einmaliger Run (entspricht `vitest run`)
- `npm run test:watch` — Watch-Modus für Entwicklung
- `npm run test:ui` — Visual Test UI (installiert `@vitest/ui` on-demand)

### In CI
Workflow `.github/workflows/app-ci.yml` läuft automatisch bei:
- Pull Requests, die `app/**` ändern
- Pushes auf `master`, die `app/**` ändern

## Wo Tests liegen sollen

Konvention: Tests liegen neben dem zu testenden Code.

- `app/src/lib/pricing.ts` → `app/src/lib/pricing.test.ts`
- `app/src/components/orders/OrderDetail.tsx` →
  `app/src/components/orders/OrderDetail.test.tsx`

Für übergreifende Test-Utilities oder Smoke-Tests:
- `app/src/__tests__/`

## Setup-Dateien

- `vitest.config.ts` — Vitest-Konfiguration
- `src/__tests__/setup.ts` — jest-dom-Matcher + Auto-Cleanup nach Tests
- `src/vitest.d.ts` — TypeScript-Types für globals und jest-dom

## Build-Kompatibilität

Vitest-Konfiguration beeinflusst den Next.js-Build nicht:
- `vitest.config.ts` wird von Next nicht eingelesen
- Test-Files (`*.test.ts`, `*.test.tsx`) werden von Next automatisch ignoriert
- Verifiziert in Etappe 1 (Schritt 6): `tsc --noEmit` clean,
  `next build` clean nach Setup

## Known Issues

### Vitest + Next.js 16
- Async Server Components werden von Vitest nicht unterstützt.
  Für unseren Scope (Client-Side Admin-Panel) irrelevant.
- Modul-Resolution-Issue [#64783](https://github.com/vercel/next.js/issues/64783)
  in `next`: Vitest resolved React zur `package.json`-Version. Betrifft
  nur Tests mit canary-React-Features, nicht unsere RTL-Tests.
