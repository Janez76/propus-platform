/**
 * Zentrale Env-Validierung für die Next-App.
 *
 * Hintergrund (Bug-Hunt T01/T03/T07):
 *   Mehrere Stellen lesen `process.env.X` direkt ohne Validation. Wenn die
 *   Variable fehlt, wird `undefined` durchgereicht und es bricht erst in
 *   nachgelagertem Code (z.B. Mailer). Das macht Konfigurationsfehler
 *   schwer auffindbar.
 *
 * Pattern: ein einziges Zod-Schema pro Sub-System. `env` wird beim ersten
 * Import lazy validiert; in Production werden Fehler beim Boot gelogged
 * (Hard-Fail vermeiden, weil Next.js Build-time process.env unterscheidet
 * von Runtime — wir validieren nur was im Server-Runtime sicher da sein
 * muss).
 *
 * @example
 *   import { env } from "@/lib/env";
 *   const url = env.PLATFORM_INTERNAL_URL;
 */

import "server-only";
import { z } from "zod";

const positiveInt = z.coerce
  .number()
  .int()
  .positive()
  .max(24 * 60 * 60 * 1000);

const optionalUrl = z.string().url().optional();
const optionalString = z.string().min(1).optional();

/**
 * Server-Env. Wird nur server-side ausgewertet. NIE auf Client-Code
 * importieren.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Express-Backend-Proxy
  PLATFORM_INTERNAL_URL: optionalUrl,
  PROXY_TIMEOUT_MS: positiveInt.default(30_000),

  // Datenbank
  DATABASE_URL: optionalString,

  // Mail / Office365
  OFFICE_EMAIL: z.string().email().optional(),
  M365_TENANT_ID: optionalString,
  M365_CLIENT_ID: optionalString,
  M365_CLIENT_SECRET: optionalString,

  // Anthropic Assistant (optional)
  ANTHROPIC_API_KEY: optionalString,

  // Build / Versioning (optional, kommt aus Docker)
  BUILD_ID: optionalString,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let _cached: ServerEnv | null = null;

function loadEnv(): ServerEnv {
  if (_cached) return _cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (parsed.success) {
    _cached = parsed.data;
    return _cached;
  }

  // Validation fehlgeschlagen: pro Feld einzeln parsen, damit ein einzelner
  // ungueltiger Wert nicht alle anderen mitkippt. Sonst wuerde z.B. ein
  // malformed OFFICE_EMAIL stillschweigend PLATFORM_INTERNAL_URL und alle
  // anderen Felder unsetzen.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  const msg = `Env-Validierung fehlgeschlagen:\n${issues}`;
  if (process.env.NODE_ENV === "production") {
    // eslint-disable-next-line no-console
    console.error("[env]", msg);
  } else {
    // eslint-disable-next-line no-console
    console.warn("[env]", msg);
  }

  // Field-level Fallback: pro Schlüssel im Schema einzeln parsen; was kaputt
  // ist, wird mit dem Schema-Default belegt (z.B. PROXY_TIMEOUT_MS=30_000)
  // oder bleibt undefined fuer optionale Felder.
  const shape = serverEnvSchema.shape as Record<string, z.ZodTypeAny>;
  const partial: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) {
    const fieldSchema = shape[key];
    const fieldResult = fieldSchema.safeParse((process.env as Record<string, unknown>)[key]);
    if (fieldResult.success) {
      partial[key] = fieldResult.data;
    } else {
      // Bewusst kein Default-Reparse — wenn der Feld-Wert weder gueltig noch
      // eine valide leere Eingabe ist (z.B. ein nicht-numerisches
      // PROXY_TIMEOUT_MS), greift hier ggf. der Schema-Default beim erneuten
      // safeParse mit `undefined`.
      const fallback = fieldSchema.safeParse(undefined);
      if (fallback.success) partial[key] = fallback.data;
      // sonst: Schluessel bleibt unset (undefined).
    }
  }
  _cached = partial as ServerEnv;
  return _cached;
}

/**
 * Stellt sicher, dass eine Env-Variable gesetzt ist. Wirft sonst einen
 * lesbaren Fehler — fuer Stellen, an denen die Variable wirklich
 * required ist (z.B. Mail-Versand ohne OFFICE_EMAIL ist sinnlos).
 */
export function assertEnv<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`[env] ${String(key)} ist required, aber nicht gesetzt`);
  }
  return value as NonNullable<ServerEnv[K]>;
}

export const env: ServerEnv = loadEnv();
