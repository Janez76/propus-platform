/**
 * Design-Tokens als TypeScript-Konstanten.
 *
 * Spiegelt die CSS-Custom-Properties aus `src/index.css` (`:root`-Block).
 * Werte sind `var(--...)`-Strings, damit sie 1:1 in React-Inline-Styles
 * genutzt werden koennen, ohne hardgecodete Pixelwerte zu duplizieren.
 *
 * Die Pixel-Werte in den Kommentaren dienen nur zur Orientierung und sind
 * konsistent mit Tailwind-Scale (`space-1` = 4px, `space-2` = 8px, ...).
 *
 * Benutzung:
 *   import { space, palette } from "@/styles/tokens";
 *   <div style={{ padding: space.lg, color: palette.accent }} />
 *
 * Fuer Tailwind-Utility-Klassen bleibt die bisherige Arbeitsweise
 * bestehen (`gap-4`, `p-3`, etc.) – beide Wege erzeugen dieselben
 * Pixelwerte.
 */

export const space = {
  xs: "var(--space-xs)",   // 4px
  sm: "var(--space-sm)",   // 8px
  md: "var(--space-md)",   // 12px
  lg: "var(--space-lg)",   // 16px
  xl: "var(--space-xl)",   // 24px
  "2xl": "var(--space-2xl)", // 32px
} as const;

export type SpaceToken = keyof typeof space;

export const palette = {
  /** Propus-Gold-Akzent (Primaeraktionen, Marken-Elemente). */
  accent: "#B68E20",
  /** Dark-Background der Admin-SPA. */
  bg: "#0c0d10",
} as const;

export type PaletteToken = keyof typeof palette;
