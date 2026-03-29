import { create } from "zustand";

export type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type ThemeState = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const STORAGE_KEY = "admin_theme_v1";
const isBrowser = typeof window !== "undefined";
let mediaCleanup: (() => void) | null = null;

function getSystemTheme(): ResolvedTheme {
  if (!isBrowser) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function normalizeTheme(raw: unknown): Theme {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

function readStoredTheme(): Theme {
  if (!isBrowser) return "system";
  try {
    return normalizeTheme(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return "system";
  }
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

function applyThemeToDom(resolvedTheme: ResolvedTheme) {
  if (!isBrowser) return;
  const html = document.documentElement;
  html.classList.toggle("dark", resolvedTheme === "dark");
  html.style.colorScheme = resolvedTheme;
}

function persistTheme(theme: Theme) {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Ignore storage errors in restricted environments.
  }
}

function setupSystemThemeListener() {
  if (!isBrowser) return;
  mediaCleanup?.();
  mediaCleanup = null;

  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    const { theme } = useThemeStore.getState();
    if (theme !== "system") return;
    const nextResolved = getSystemTheme();
    applyThemeToDom(nextResolved);
    useThemeStore.setState({ resolvedTheme: nextResolved });
  };

  mql.addEventListener("change", onChange);
  mediaCleanup = () => mql.removeEventListener("change", onChange);
}

const initialTheme = readStoredTheme();
const initialResolvedTheme = resolveTheme(initialTheme);

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initialTheme,
  resolvedTheme: initialResolvedTheme,
  setTheme: (theme) => {
    const normalizedTheme = normalizeTheme(theme);
    const nextResolved = resolveTheme(normalizedTheme);
    persistTheme(normalizedTheme);
    applyThemeToDom(nextResolved);
    if (normalizedTheme === "system") {
      setupSystemThemeListener();
    } else {
      mediaCleanup?.();
      mediaCleanup = null;
    }
    set({ theme: normalizedTheme, resolvedTheme: nextResolved });
  },
}));

export function applyTheme() {
  const { theme } = useThemeStore.getState();
  const resolved = resolveTheme(theme);
  applyThemeToDom(resolved);
  if (theme === "system") {
    setupSystemThemeListener();
  } else {
    mediaCleanup?.();
    mediaCleanup = null;
  }
  useThemeStore.setState({ resolvedTheme: resolved });
}
