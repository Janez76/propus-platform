/**
 * GET /auth/logto/logout — Logto SSO wurde entfernt.
 * Löscht die lokale Admin-Session und leitet auf die Login-Seite.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { pool } from "@/lib/db";

function getBaseUrl(req: NextRequest) {
  const explicit = (
    process.env.ADMIN_PANEL_URL ||
    process.env.ADMIN_FRONTEND_URL ||
    ""
  ).trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function getTokenFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return req.cookies.get("admin_session")?.value || null;
}

export async function GET(req: NextRequest) {
  const token = getTokenFromRequest(req);

  if (token) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await pool
      .query("DELETE FROM booking.admin_sessions WHERE token_hash = $1", [tokenHash])
      .catch(() => null);
  }

  const baseUrl = getBaseUrl(req);
  const res = NextResponse.redirect(`${baseUrl}/login`);
  res.cookies.delete("admin_session");
  return res;
}
