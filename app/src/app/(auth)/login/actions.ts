"use server";

import { cookies, headers } from "next/headers";

import { resolvePostLoginTarget } from "@/lib/postLoginRedirect";

/**
 * Login-Server-Action für die Propus Platform.
 *
 * Authentifizierung läuft über den bestehenden Express-Endpunkt
 * `/api/auth/login` (→ Express `/auth/login`). Der Endpunkt setzt das
 * HttpOnly-Cookie `admin_session` (SHA-256-Token-Hash, siehe
 * `lib/auth.server.ts`) und liefert `{ token, role, permissions }` zurück.
 *
 * Diese Action reicht das `Set-Cookie` an die Browser-Response weiter und
 * gibt `token`/`role`/`permissions` an das Formular zurück, damit der
 * SPA-`zustand`-Store (ClientShell) befüllt werden kann. Erst danach
 * navigiert der Client clientseitig auf das Ziel — ein serverseitiger
 * `redirect` würde sonst in einem `/login` ↔ `/dashboard`-Loop landen,
 * weil die SPA ohne Token im Store sofort wieder auf `/login` schickt.
 */

export type LoginState = {
  ok: boolean;
  error: string | null;
  field?: "email" | "password" | "form";
  token?: string;
  role?: string;
  permissions?: string[];
  remember?: boolean;
  target?: string;
};

const INITIAL_STATE: LoginState = { ok: false, error: null };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isSafeInternalPath(path: string | null | undefined): path is string {
  if (!path || !path.startsWith("/")) return false;
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  return true;
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";
  const rawNext = formData.get("returnTo") ?? formData.get("next");
  const returnTo = typeof rawNext === "string" ? rawNext : null;

  // 1) Validierung
  if (!EMAIL_REGEX.test(email)) {
    return {
      ok: false,
      field: "email",
      error: "Bitte eine gültige E-Mail-Adresse eingeben.",
    };
  }
  if (password.length < 6) {
    return {
      ok: false,
      field: "password",
      error: "Mindestens 6 Zeichen erforderlich.",
    };
  }

  let res: Response;
  try {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    if (!host) {
      return { ok: false, field: "form", error: "Unerwarteter Fehler. Bitte erneut versuchen." };
    }
    res = await fetch(`${proto}://${host}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        username: email,
        password,
        rememberMe: remember,
      }),
      cache: "no-store",
    });
  } catch (err) {
    console.error("[loginAction] Backend-Fehler:", err);
    return { ok: false, field: "form", error: "Anmeldedienst nicht erreichbar. Bitte später erneut versuchen." };
  }

  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    role?: string;
    permissions?: string[];
    error?: string;
  };

  if (!res.ok || !data.token) {
    return {
      ok: false,
      field: "form",
      error: data.error || "E-Mail oder Passwort nicht korrekt.",
    };
  }

  // Set-Cookie aus der Backend-Antwort an die Browser-Response weiterreichen.
  const proto = (await headers()).get("x-forwarded-proto") ?? "https";
  const cookieStore = await cookies();
  const setCookies =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const raw of setCookies) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) continue;
    cookieStore.set(name, value, {
      httpOnly: true,
      secure: proto === "https",
      sameSite: "lax",
      path: "/",
      maxAge: remember ? 60 * 60 * 24 * 30 : 60 * 60 * 8,
    });
  }

  const role = String(data.role || "admin");
  const target = resolvePostLoginTarget(
    role,
    isSafeInternalPath(returnTo) ? returnTo : undefined,
  );

  return {
    ok: true,
    error: null,
    token: data.token,
    role,
    permissions: Array.isArray(data.permissions) ? data.permissions : [],
    remember,
    target,
  };
}

export { INITIAL_STATE };
