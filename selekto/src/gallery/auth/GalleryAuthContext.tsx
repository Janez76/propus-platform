import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const SESSION_KEY = "propus_gallery_local_admin";
const SESSION_USER_KEY = "propus_gallery_local_admin_user";

function expectedAdminUser(): string {
  const v = import.meta.env.VITE_LOCAL_ADMIN_USER;
  if (typeof v === "string" && v.trim()) return v.trim();
  return "admin";
}

function expectedAdminPassword(): string {
  const v = import.meta.env.VITE_LOCAL_ADMIN_PASSWORD;
  if (typeof v === "string" && v.trim()) return v.trim();
  return "Biel2503!";
}

/** Gesetzt = Zugang nur mit `/bilder-auswahl?key=…` (Magic-Link). Leer = lokal ohne Key (nur Entwicklung). */
function configuredMagicLinkKey(): string | null {
  const v = import.meta.env.VITE_BILDER_AUSWAHL_MAGIC_KEY;
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function tryConsumeMagicKeyFromUrl(): boolean {
  const want = configuredMagicLinkKey();
  if (!want) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const got = params.get("key")?.trim();
    if (!got || got !== want) return false;
    params.delete("key");
    const q = params.toString();
    const path = window.location.pathname + (q ? `?${q}` : "") + window.location.hash;
    window.history.replaceState(null, "", path);
    return true;
  } catch {
    return false;
  }
}

function readSession(): { ok: boolean; displayName: string } {
  try {
    if (sessionStorage.getItem(SESSION_KEY) !== "1") return { ok: false, displayName: "" };
    const name = sessionStorage.getItem(SESSION_USER_KEY)?.trim() || expectedAdminUser();
    return { ok: true, displayName: name };
  } catch {
    return { ok: false, displayName: "" };
  }
}

function writeSession(ok: boolean, loggedInUser?: string): void {
  try {
    if (ok) {
      sessionStorage.setItem(SESSION_KEY, "1");
      if (loggedInUser?.trim()) sessionStorage.setItem(SESSION_USER_KEY, loggedInUser.trim());
    } else {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_USER_KEY);
    }
  } catch {
    /* private mode */
  }
}

type GalleryAuthValue = {
  /** Pseudo-User für UI (kein Supabase) */
  user: { email: string } | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const GalleryAuthContext = createContext<GalleryAuthValue | null>(null);

export function GalleryAuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const s = readSession();
    if (s.ok) {
      setAuthed(true);
      setDisplayName(s.displayName);
      setLoading(false);
      return;
    }
    const magicConfigured = configuredMagicLinkKey();
    if (!magicConfigured) {
      /* Lokaler Modus: kein Magic-Link vorgesehen → direkt Zugang (ohne Login-Seite). */
      writeSession(true, expectedAdminUser());
      setAuthed(true);
      setDisplayName(expectedAdminUser());
      setLoading(false);
      return;
    }
    if (tryConsumeMagicKeyFromUrl()) {
      writeSession(true, expectedAdminUser());
      setAuthed(true);
      setDisplayName(expectedAdminUser());
      setLoading(false);
      return;
    }
    setAuthed(false);
    setDisplayName("");
    setLoading(false);
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const u = username.trim();
    const wantUser = expectedAdminUser();
    const wantPw = expectedAdminPassword();
    if (u !== wantUser || password !== wantPw) {
      return { error: "Nutzername oder Passwort falsch." };
    }
    writeSession(true, u);
    setDisplayName(u);
    setAuthed(true);
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    writeSession(false);
    setDisplayName("");
    setAuthed(false);
    /* Ohne konfigurierten Magic-Link: wieder automatisch anmelden (lokaler Modus). */
    if (!configuredMagicLinkKey()) {
      writeSession(true, expectedAdminUser());
      setAuthed(true);
      setDisplayName(expectedAdminUser());
    }
  }, []);

  const value = useMemo<GalleryAuthValue>(
    () => ({
      user: authed ? { email: displayName || expectedAdminUser() } : null,
      loading,
      signIn,
      signOut,
    }),
    [authed, displayName, loading, signIn, signOut],
  );

  return <GalleryAuthContext.Provider value={value}>{children}</GalleryAuthContext.Provider>;
}

export function useGalleryAuth(): GalleryAuthValue {
  const ctx = useContext(GalleryAuthContext);
  if (!ctx) {
    throw new Error("useGalleryAuth nur innerhalb GalleryAuthProvider");
  }
  return ctx;
}
