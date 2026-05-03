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
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    const msg = `Env-Validierung fehlgeschlagen:\n${issues}`;
    if (process.env.NODE_ENV === "production") {
      // In Production: laut loggen, aber nicht crashen — sonst killt eine
      // einzelne fehlende optionale Variable die ganze App. Hard-Required-
      // Variablen werden im jeweiligen Aufrufer mit `assertRequired(...)`
      // explizit verifiziert.
      // eslint-disable-next-line no-console
      console.error("[env]", msg);
    } else {
      // eslint-disable-next-line no-console
      console.warn("[env]", msg);
    }
    // Trotzdem ein Default-Objekt zurueckliefern, damit der Import nicht
    // crasht. Felder sind dann undefined / Zod-Defaults.
    _cached = serverEnvSchema.parse({ NODE_ENV: process.env.NODE_ENV || "development" });
    return _cached;
  }
  _cached = parsed.data;
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
