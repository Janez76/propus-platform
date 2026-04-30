/**
 * Auth-Helper für Assistant-Routen.
 *
 * - Cookie `admin_session` (wie der Rest des Admin-Panels), ODER
 * - `Authorization: Bearer <token>` (für die Mobile-App).
 *
 * Der Bearer-Token wird gleich gehasht und in `booking.admin_sessions` gesucht
 * wie der Cookie-Token (`getAdminSession` in lib/auth.server.ts).
 *
 * Portal-only-Rollen (Kunden) werden abgelehnt — die Tools sind admin-Niveau.
 */

import type { NextRequest } from "next/server";
import { createHash } from "crypto";
import { queryOne } from "@/lib/db";
import { getAdminSession, type AdminSession } from "@/lib/auth.server";
import { isPortalOnlyRole } from "@/lib/postLoginRedirect";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function lookupBearerSession(token: string): Promise<AdminSession | null> {
  const tokenHash = hashToken(token);
  const row = await queryOne<{
    role: string;
    user_key: string | null;
    user_name: string | null;
    impersonator_user_key: string | null;
  }>(
    `SELECT role, user_key, user_name, impersonator_user_key
       FROM booking.admin_sessions
      WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash],
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

/**
 * Liefert eine gültige Session für den Assistant oder `null`.
 * Lehnt portal-only-Rollen ohne Impersonation ab — diese gehören nicht aufs Admin-Panel,
 * und die Assistant-Tools sind admin-Niveau (Mails versenden, HA-Services aufrufen, etc.).
 */
export async function getAssistantSession(req: NextRequest): Promise<AdminSession | null> {
  let session = await getAdminSession();

  if (!session) {
    const auth = req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice("Bearer ".length).trim();
      if (token) session = await lookupBearerSession(token);
    }
  }

  if (!session) return null;
  if (isPortalOnlyRole(session.role) && !session.isImpersonating) return null;

  return session;
}
