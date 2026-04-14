import { useEffect } from "react";
import { THEME_KEY } from "../../data.ts";

function shouldUseDarkFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Backpanel ist nur hell: `theme-dark` am Body wird hier deaktiviert und beim Verlassen wiederhergestellt.
 */
export function useAdminBackpanelForceLight() {
  useEffect(() => {
    document.body.classList.add("admin-backpanel-force-light");
    document.body.classList.remove("theme-dark");
    return () => {
      document.body.classList.remove("admin-backpanel-force-light");
      document.body.classList.toggle("theme-dark", shouldUseDarkFromStorage());
    };
  }, []);
}
