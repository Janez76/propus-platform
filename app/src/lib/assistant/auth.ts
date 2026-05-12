/**
 * Unified auth for Assistant routes: cookie-based admin session (browser)
 * and Bearer token (mobile app via assistant_mobile_tokens table).
 */
import { createHash, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { getAdminSession, type AdminSession } from "@/lib/auth.server";
import { query, queryOne } from "@/lib/db";

export interface AssistantUser {
  id: string;
  email: string;
  name: string;
  role: string;
  source: "cookie" | "bearer";
}

/**
 * Cookie-Sessions mit Zugriff auf Assistant-/Propi-APIs.
 * Fotograf & Tour-Manager sind im Mobile-Cockpit eingeloggt, aber waren hier
 * früher ausgeschlossen → 401 trotz gültiger admin_session.
 */
export const ASSISTANT_COOKIE_SESSION_ROLES = new Set([
  "admin",
  "super_admin",
  "employee",
  "photographer",
  "tour_manager",
]);

export function isAssistantCookieSessionRole(role: string | null | undefined): boolean {
  return ASSISTANT_COOKIE_SESSION_ROLES.has(String(role || "").toLowerCase());
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Echte, routbare E-Mail (kein interner Platzhalter wie *.local / *.localhost). */
function looksLikeRealEmail(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return false;
  return !/\.(local|localhost|internal|lan|test|invalid|example)$/.test(v);
}

function sessionToUser(session: AdminSession): AssistantUser {
  const userId = String(session.userKey || session.userName || session.role || "admin").trim();
  // Echte E-Mail bestimmen: bei internen Admin-Logins steht in `userKey` die
  // numerische User-ID (z. B. "42") und die E-Mail in `userName`; bei
  // Portal-Logins steht die E-Mail in `userKey`. Beide Felder prüfen.
  // Nichts Echtes da → LEER lassen, KEIN Platzhalter wie "admin@propus.local":
  // der würde sonst als (nicht existente) Mailbox an Microsoft Graph geschickt
  // und get_m365_calendar_overlay scheiterte mit einem verwirrenden 404 statt
  // einer klaren "kein Postfach hinterlegt"-Meldung.
  const rawKey = String(session.userKey || "").trim();
  const rawName = String(session.userName || "").trim();
  const email = looksLikeRealEmail(rawKey)
    ? rawKey.toLowerCase()
    : looksLikeRealEmail(rawName)
      ? rawName.toLowerCase()
      : "";
  return {
    id: userId || "admin",
    email,
    name: session.userName || userId || "Admin",
    role: String(session.role || "admin").toLowerCase(),
    source: "cookie",
  };
}

/**
 * Resolve the authenticated user from cookie or Bearer token.
 * Returns null if neither auth method succeeds.
 */
export async function resolveAssistantUser(req: NextRequest): Promise<AssistantUser | null> {
  // 1. Try cookie-based admin session (primary path for browser)
  const session = await getAdminSession();
  if (session && isAssistantCookieSessionRole(session.role)) {
    return sessionToUser(session);
  }

  // 2. Try Bearer token (mobile app)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const plainToken = authHeader.slice(7).trim();
    if (!plainToken) return null;

    const tokenHash = hashToken(plainToken);
    const row = await queryOne<{ user_id: string; user_email: string }>(
      `SELECT user_id, user_email
       FROM tour_manager.assistant_mobile_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash],
    );
    if (!row) return null;

    // Fire-and-forget: update last_used_at
    query(
      `UPDATE tour_manager.assistant_mobile_tokens SET last_used_at = NOW() WHERE token_hash = $1`,
      [tokenHash],
    ).catch(() => {});

    return {
      id: row.user_id,
      email: row.user_email,
      name: row.user_email.split("@")[0] || row.user_id,
      role: "admin",
      source: "bearer",
    };
  }

  return null;
}

/**
 * Generate a new mobile token. Only callable from admin sessions (not bearer).
 * Returns the plain token (stored only as SHA-256 hash in DB).
 */
export async function generateMobileToken(
  userId: string,
  userEmail: string,
  label: string,
): Promise<{ id: string; token: string }> {
  const plainToken = randomBytes(36).toString("base64url").slice(0, 48);
  const tokenHash = hashToken(plainToken);

  const row = await queryOne<{ id: string }>(
    `INSERT INTO tour_manager.assistant_mobile_tokens (user_id, user_email, token_hash, label)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, userEmail, tokenHash, label || ""],
  );

  return { id: row!.id, token: plainToken };
}

export async function listMobileTokens(userId: string) {
  return query<{
    id: string;
    label: string;
    scope: string;
    created_at: string;
    last_used_at: string | null;
  }>(
    `SELECT id, label, scope, created_at, last_used_at
     FROM tour_manager.assistant_mobile_tokens
     WHERE user_id = $1 AND revoked_at IS NULL
     ORDER BY created_at DESC`,
    [userId],
  );
}

export async function revokeMobileToken(tokenId: string, userId: string): Promise<boolean> {
  const rows = await query(
    `UPDATE tour_manager.assistant_mobile_tokens
     SET revoked_at = NOW()
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
     RETURNING id`,
    [tokenId, userId],
  );
  return rows.length > 0;
}
