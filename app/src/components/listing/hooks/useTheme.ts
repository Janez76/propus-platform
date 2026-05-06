import { useCallback, useEffect, useState } from "react";
import { THEME_KEY } from "../data";

// Globaler Theme-Key aus app/src/app/layout.tsx — synchron halten, damit der
// Listing-Toggle dieselbe Praeferenz speichert wie der Admin-Toggle und der
// Inline-Themes-Script auf der HTML-Seite.
const GLOBAL_THEME_KEY = "admin_theme_v1";

function readInitialDark(): boolean {
  // Reihenfolge: globaler Theme-Key (vom Inline-Script in layout.tsx gesetzt)
  // > legacy listing-spezifischer Key > System-Preferenz.
  try {
    const global = localStorage.getItem(GLOBAL_THEME_KEY);
    if (global === "dark") return true;
    if (global === "light") return false;
    // "system" oder unset → fallthrough
  } catch { /* private mode */ }
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark") return true;
    if (saved === "light") return false;
  } catch { /* private mode */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(isDark: boolean) {
  // Zwei Klassen + colorScheme — sonst kommt Tailwind-`dark:` (html.dark) und
  // unsere body.theme-dark-Selektoren nicht synchron, und das CSS sieht halb
  // hell, halb dunkel aus.
  document.documentElement.classList.toggle("dark", isDark);
  document.body.classList.toggle("theme-dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
}

export function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof window !== "undefined" ? readInitialDark() : false,
  );

  useEffect(() => {
    applyTheme(isDark);
    try {
      localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
      // Globalen Key parallel pflegen, damit ein Theme-Switch im Listing
      // auch bei spaeterem Aufruf des Admin-Bereichs / des Inline-Scripts
      // greift.
      localStorage.setItem(GLOBAL_THEME_KEY, isDark ? "dark" : "light");
    } catch { /* private mode */ }
  }, [isDark]);

  const toggle = useCallback(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const go = () => setIsDark((d) => !d);
    if (!reduced && typeof document.startViewTransition === "function") {
      document.startViewTransition(go);
    } else {
      go();
    }
  }, []);

  return { isDark, toggle };
}
