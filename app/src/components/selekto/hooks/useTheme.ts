import { useCallback, useEffect, useState } from "react";
import { THEME_KEY } from "../data";

function readInitialDark(): boolean {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) return saved === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof window !== "undefined" ? readInitialDark() : false,
  );

  useEffect(() => {
    document.body.classList.toggle("theme-dark", isDark);
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
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
