import { create } from "zustand";
import type { Role } from "../types";

type UiMode = "modern";

const PERMS_STORAGE_KEY = "admin_permissions_v1";

type AuthState = {
  token: string;
  role: Role;
  permissions: string[];
  language: "de" | "en" | "fr" | "it";
  uiMode: UiMode;
  isSso: false;
  setAuth: (token: string, role: Role, remember?: boolean, permissions?: string[]) => void;
  setPermissions: (permissions: string[]) => void;
  clearAuth: () => void;
  setLanguage: (lang: AuthState["language"]) => void;
  setUiMode: (mode: UiMode) => void;
};

const isBrowser = typeof window !== "undefined";

function safeGet(key: string): string {
  if (!isBrowser) return "";
  try {
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function safeSet(key: string, value: string, remember: boolean = false) {
  if (!isBrowser) return;
  try {
    if (remember) {
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, value);
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

function safeRemove(key: string) {
  if (!isBrowser) return;
  try {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function readStoredPermissions(): string[] {
  if (!isBrowser) return [];
  try {
    const raw = window.localStorage.getItem(PERMS_STORAGE_KEY) || "";
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map((p) => String(p)) : [];
  } catch {
    return [];
  }
}

function writeStoredPermissions(perms: string[]) {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(PERMS_STORAGE_KEY, JSON.stringify(perms));
  } catch {
    // ignore
  }
}

const initialToken = safeGet("admin_token_v2");
const allowedLangs = new Set(["de", "en", "fr", "it"]);
const storedLang = safeGet("admin_lang_v2").toLowerCase();
const initialLang = (allowedLangs.has(storedLang) ? storedLang : "de") as AuthState["language"];
const initialUiMode: UiMode = "modern";
const bootToken = initialToken;
const bootRole: Role = "admin";
const bootPermissions = readStoredPermissions();

export const useAuthStore = create<AuthState>((set) => ({
  token: bootToken,
  role: bootRole,
  permissions: bootPermissions,
  language: initialLang,
  uiMode: initialUiMode,
  isSso: false,
  setAuth: (token, role, remember = false, permissions) => {
    safeSet("admin_token_v2", token, remember);
    if (permissions !== undefined) {
      writeStoredPermissions(permissions);
      set({ token, role, permissions });
    } else {
      set({ token, role, permissions: readStoredPermissions() });
    }
  },
  setPermissions: (permissions) => {
    writeStoredPermissions(permissions);
    set({ permissions: [...permissions] });
  },
  clearAuth: () => {
    safeRemove("admin_token_v2");
    safeRemove("admin_auth_provider_v1");
    safeRemove(PERMS_STORAGE_KEY);
    set({ token: "", role: "admin", permissions: [] });
  },
  setLanguage: (language) => {
    const normalized = (String(language || "").toLowerCase()) as AuthState["language"];
    const finalLang = (allowedLangs.has(normalized) ? normalized : "de") as AuthState["language"];
    safeSet("admin_lang_v2", finalLang, true);
    set({ language: finalLang });
  },
  setUiMode: (uiMode) => {
    void uiMode;
    safeSet("admin_ui_mode_v1", "modern", true);
    set({ uiMode: "modern" });
  },
}));
