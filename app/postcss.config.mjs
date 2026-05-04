/**
 * Tailwind CSS v4 PostCSS-Konfig.
 *
 * Wichtig: v4 funktioniert anders als v3:
 *  - Kein `tailwindcss`-Plugin mehr in der PostCSS-Chain — nur noch
 *    `@tailwindcss/postcss`.
 *  - Konfig liegt in CSS via `@theme`-Direktive (siehe app/src/app/globals.css),
 *    nicht mehr in tailwind.config.js.
 *  - Migrationspfad v3 → v4: https://tailwindcss.com/docs/upgrade-guide
 *
 * Falls hier weitere PostCSS-Plugins (z.B. autoprefixer) reinwandern: das
 * `@tailwindcss/postcss`-Plugin enthaelt bereits autoprefixer + cssnano —
 * NICHT separat hinzufuegen, sonst doppelte Verarbeitung.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
