/**
 * Auth-Helper für Assistant-Routen.
 *
 * Akzeptiert (in Reihenfolge):
 *  1. Cookie `admin_session`              — Browser-Login (gleicher Pfad wie Admin-Panel)
 *  2. `Authorization: Bearer <token>`     — Mobile + Integrationen
 *     - Token-Prefix `ppk_live_…`         → core.api_keys  (langlebiger API-Key)
 *     - sonst                             → booking.admin_sessions  (Login-Session)
 *
 * Beide Token-Pfade werden mit SHA-256 gehasht (gleich wie der Express-Backend
 * in booking/server.js:2454-2474). Portal-only-Rollen werden abgelehnt — die
 * Assistant-Tools sind admin-Niveau (Mails versenden, HA-Services aufrufen).
 */

import type { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query, queryOne } from "@/lib/db";
import { getAdminSession, type AdminSession } from "@/lib/auth.server";
import { isPortalOnlyRole } from "@/lib/postLoginRedirect";

const API_KEY_PREFIX = "ppk_live_";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function lookupAdminSessionToken(token: string): Promise<AdminSession | null> {
  const row = await queryOne<{
    role: string;
    user_key: string | null;
    user_name: string | null;
    impersonator_user_key: string | null;
  }>(
    `SELECT role, user_key, user_name, impersonator_user_key
       FROM booking.admin_sessions
      WHERE token_hash = $1 AND expires_at > NOW()`,
    [hashToken(token)],
  );
  if (!row) return null;
  return {
    role: String(row.role || "admin"),
    userKey: row.user_key,
    userName: row.user_name,
    isImpersonating:
      row.impersonator_user_key != null &&
      String(row.impersonator_user_key).trim() !== "",
  };
}

async function lookupApiKeyToken(token: string): Promise<AdminSession | null> {
  const tokenHash = hashToken(token);
  const row = await queryOne<{
    api_key_id: number;
    role: string | null;
    user_key: string;
    user_name: string | null;
    is_active: boolean;
  }>(
    `SELECT
        k.id                                                     AS api_key_id,
        (u.roles)[1]                                             AS role,
        u.id::text                                               AS user_key,
        COALESCE(NULLIF(u.full_name, ''), NULLIF(u.username, ''), u.email) AS user_name,
        u.is_active
       FROM core.api_keys k
       JOIN core.admin_users u ON u.id = k.created_by
      WHERE k.token_hash = $1
        AND k.revoked_at IS NULL
        AND (k.expires_at IS NULL OR k.expires_at > NOW())
      LIMIT 1`,
    [tokenHash],
  );
  if (!row || !row.is_active) return null;

  // last_used_at als best-effort fire-and-forget; Fehler ignorieren.
  void query(
    `UPDATE core.api_keys SET last_used_at = NOW() WHERE id = $1`,
    [row.api_key_id],
  ).catch(() => {});

  return {
    role: String(row.role || "admin"),
    userKey: row.user_key,
    userName: row.user_name,
    isImpersonating: false,
  };
}

/**
 * Liefert eine gültige Session für den Assistant oder `null`.
 * Lehnt portal-only-Rollen ohne Impersonation ab — diese gehören nicht aufs Admin-Panel,
 * und die Assistant-Tools sind admin-Niveau (Mails versenden, HA-Services aufrufen, etc.).
 */
export async function getAssistantSession(req: NextRequest): Promise<AdminSession | null> {
  let session = await getAdminSession();

  if (!session) {
    const auth = req.headers.get("authorization");
    const match = auth?.match(/^\s*Bearer\s+(\S.*)$/i);
    if (match) {
      const token = match[1].trim();
      if (token) {
        session = token.startsWith(API_KEY_PREFIX)
          ? await lookupApiKeyToken(token)
          : await lookupAdminSessionToken(token);
      }
    }
  }

  if (!session) return null;
  if (isPortalOnlyRole(session.role) && !session.isImpersonating) return null;

  return session;
}

/**
 * Loest die echte Mail-Adresse hinter einer Admin-Session auf.
 * `session.userKey` ist je nach Quelle ein Username (booking.admin_sessions),
 * eine numerische Admin-ID (core.api_keys-Pfad) oder ein photographer_key.
 * Wir probieren in dieser Reihenfolge: Email-im-Key erkennen, dann ID-Lookup,
 * dann Username/Email-Match in core.admin_users.
 *
 * Liefert null wenn nichts aufloesbar ist — der Aufrufer entscheidet, was im
 * System-Prompt steht.
 */
export async function resolveAdminEmail(session: AdminSession): Promise<string | null> {
  const key = String(session.userKey ?? "").trim();
  if (!key) return null;
  if (key.includes("@")) return key;

  if (/^\d+$/.test(key)) {
    const byId = await queryOne<{ email: string | null }>(
      `SELECT email FROM core.admin_users WHERE id = $1 LIMIT 1`,
      [Number.parseInt(key, 10)],
    );
    if (byId?.email) return byId.email;
  }

  const byUsername = await queryOne<{ email: string | null }>(
    `SELECT email FROM core.admin_users
      WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)
      LIMIT 1`,
    [key],
  );
  return byUsername?.email ?? null;
}
