import { create } from "zustand";
import type { Role } from "../types";
import { isKundenRole } from "../lib/permissions";

type UiMode = "modern";

export const TOKEN_STORAGE_KEY = "admin_token_v2";
const ROLE_STORAGE_KEY = "admin_role_v1";
const PERMS_STORAGE_KEY = "admin_permissions_v1";

/** Vorbereitung zentrales Kunden-Panel: interne Admins vs. Kunden (Logto/Portal). */
export type UserPanelKind = "admin_intern" | "admin_kunde" | null;

type AuthState = {
  token: string;
  role: Role;
  permissions: string[];
  language: "de" | "en" | "fr" | "it";
  uiMode: UiMode;
  isSso: false;
  /** null = noch nicht gesetzt / Legacy */
  userPanelKind: UserPanelKind;
  setAuth: (token: string, role: Role, remember?: boolean, permissions?: string[]) => void;
  setRole: (role: Role) => void;
  setUserPanelKind: (kind: UserPanelKind) => void;
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

export function normalizeStoredRole(input: string): Role {
  const role = String(input || "").trim();
  // Legacy-Koercierungen: alte Rollennamen auf kanonische Werte abbilden
  if (role === "customer") return "customer_user";
  if (role === "company_admin") return "company_employee";
  const allowed: Role[] = [
    "admin",
    "photographer",
    "super_admin",
    "tour_manager",
    "company_owner",
    "company_employee",
    "customer_admin",
    "customer_user",
  ];
  return allowed.includes(role as Role) ? (role as Role) : "admin";
}

const initialToken = safeGet(TOKEN_STORAGE_KEY);
const allowedLangs = new Set(["de", "en", "fr", "it"]);
const storedLang = safeGet("admin_lang_v2").toLowerCase();
const initialLang = (allowedLangs.has(storedLang) ? storedLang : "de") as AuthState["language"];
const initialUiMode: UiMode = "modern";
const bootToken = initialToken;
const bootRole: Role = normalizeStoredRole(safeGet(ROLE_STORAGE_KEY));
const bootPermissions = readStoredPermissions();

export const useAuthStore = create<AuthState>((set) => ({
  token: bootToken,
  role: bootRole,
  permissions: bootPermissions,
  language: initialLang,
  uiMode: initialUiMode,
  isSso: false,
  userPanelKind: bootToken ? (isKundenRole(bootRole) ? "admin_kunde" : "admin_intern") : null,
  setUserPanelKind: (userPanelKind) => set({ userPanelKind }),
  setAuth: (token, role, remember = false, permissions) => {
    safeSet(TOKEN_STORAGE_KEY, token, remember);
    safeSet(ROLE_STORAGE_KEY, role, remember);
    const userPanelKind: UserPanelKind = isKundenRole(role) ? "admin_kunde" : "admin_intern";
    if (permissions !== undefined) {
      writeStoredPermissions(permissions);
      set({ token, role, permissions, userPanelKind });
    } else {
      set({ token, role, permissions: readStoredPermissions(), userPanelKind });
    }
  },
  setRole: (role) => {
    safeSet(ROLE_STORAGE_KEY, role, true);
    set({ role });
  },
  setPermissions: (permissions) => {
    writeStoredPermissions(permissions);
    set({ permissions: [...permissions] });
  },
  clearAuth: () => {
    safeRemove(TOKEN_STORAGE_KEY);
    safeRemove(ROLE_STORAGE_KEY);
    safeRemove("admin_auth_provider_v1");
    safeRemove(PERMS_STORAGE_KEY);
    set({ token: "", role: "admin", permissions: [], userPanelKind: null });
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
