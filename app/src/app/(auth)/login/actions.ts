"use server";

import { cookies } from "next/headers";

import { resolvePostLoginTarget } from "@/lib/postLoginRedirect";
import type { LoginState } from "./state";

/**
 * Login-Server-Action für die Propus Platform.
 *
 * Authentifizierung läuft über den bestehenden Express-Endpunkt
 * `/auth/login` (über `PLATFORM_INTERNAL_URL`). Der Endpunkt setzt das
 * HttpOnly-Cookie `admin_session` (SHA-256-Token-Hash, siehe
 * `lib/auth.server.ts`) und liefert `{ token, role, permissions }` zurück.
 *
 * Diese Action reicht das `Set-Cookie` an die Browser-Response weiter und
 * gibt `token`/`role`/`permissions` an das Formular zurück, damit der
 * SPA-`zustand`-Store (ClientShell) befüllt werden kann. Erst danach
 * navigiert der Client clientseitig auf das Ziel — ein serverseitiger
 * `redirect` würde sonst in einem `/login` ↔ `/dashboard`-Loop landen,
 * weil die SPA ohne Token im Store sofort wieder auf `/login` schickt.
 *
 * Hinweis: Aus `"use server"`-Dateien dürfen nur async-Funktionen exportiert
 * werden — `LoginState`/`INITIAL_STATE` liegen daher in `./state`.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isSafeInternalPath(path: string | null | undefined): path is string {
  if (!path || !path.startsWith("/")) return false;
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  return true;
}

type ParsedCookie = {
  name: string;
  value: string;
  options: {
    domain?: string;
    path?: string;
    expires?: Date;
    maxAge?: number;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "lax" | "strict" | "none";
  };
};

/**
 * Parst einen `Set-Cookie`-Header und übernimmt die Original-Attribute des
 * Backends (Domain/Path/Lifetime/SameSite/Secure/HttpOnly) — sonst weicht das
 * Session-Verhalten von der Auth-Policy des Backends ab (z. B. Cross-Subdomain).
 */
function parseSetCookie(raw: string): ParsedCookie | null {
  const parts = raw.split(";");
  const first = parts.shift();
  if (!first) return null;
  const eq = first.indexOf("=");
  if (eq < 0) return null;
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  if (!name) return null;

  const options: ParsedCookie["options"] = {};
  for (const part of parts) {
    const idx = part.indexOf("=");
    const key = (idx < 0 ? part : part.slice(0, idx)).trim().toLowerCase();
    const val = idx < 0 ? "" : part.slice(idx + 1).trim();
    switch (key) {
      case "domain":
        if (val) options.domain = val;
        break;
      case "path":
        options.path = val || "/";
        break;
      case "max-age": {
        const n = Number(val);
        if (Number.isFinite(n)) options.maxAge = n;
        break;
      }
      case "expires": {
        const d = new Date(val);
        if (!Number.isNaN(d.getTime())) options.expires = d;
        break;
      }
      case "secure":
        options.secure = true;
        break;
      case "httponly":
        options.httpOnly = true;
        break;
      case "samesite": {
        const s = val.toLowerCase();
        if (s === "lax" || s === "strict" || s === "none") options.sameSite = s;
        break;
      }
    }
  }
  return { name, value, options };
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

  // Trusted Backend-Origin aus der Server-Konfiguration — niemals aus dem
  // Host-/X-Forwarded-Proto-Header (SSRF/Credential-Leak-Risiko). Express
  // serviert die Auth-Routen unter `/auth/*` (der Next-Proxy `/api/auth/*`
  // leitet ebenfalls dorthin).
  const backendOrigin = process.env.PLATFORM_INTERNAL_URL;
  if (!backendOrigin) {
    console.error("[loginAction] PLATFORM_INTERNAL_URL ist nicht gesetzt.");
    return { ok: false, field: "form", error: "Anmeldedienst nicht erreichbar. Bitte später erneut versuchen." };
  }

  let res: Response;
  try {
    res = await fetch(new URL("/auth/login", backendOrigin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        username: email,
        password,
        rememberMe: remember,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
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

  // Set-Cookie aus der Backend-Antwort 1:1 (inkl. Original-Attribute) an die
  // Browser-Response weiterreichen.
  const cookieStore = await cookies();
  const setCookies =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const raw of setCookies) {
    const parsed = parseSetCookie(raw);
    if (!parsed) continue;
    cookieStore.set(parsed.name, parsed.value, parsed.options);
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
