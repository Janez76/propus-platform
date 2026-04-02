/**
 * GET /auth/logto/logout — Ends the session and redirects to Logto end-session.
 *
 * On VPS this route is never hit (Next.js rewrites /auth/* to Express).
 * On Vercel the rewrite is skipped so this handler runs directly.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { pool } from "@/lib/db";

const LOGTO_ENDPOINT = process.env.LOGTO_ENDPOINT || "http://localhost:3301";

function getBaseUrl(req: NextRequest) {
  const explicit = (
    process.env.BOOKING_LOGTO_REDIRECT_BASE_URL ||
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

  // Delete admin_session from DB
  if (token) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await pool
      .query("DELETE FROM booking.admin_sessions WHERE token_hash = $1", [
        tokenHash,
      ])
      .catch(() => null);
  }

  const baseUrl = getBaseUrl(req);
  const postLogoutUri = `${baseUrl}/`;

  const redirect = new URL(req.url).searchParams.get("redirect");

  // If there's a specific redirect requested (non-Logto), just go there
  if (redirect) {
    const res = NextResponse.redirect(redirect);
    res.cookies.delete("admin_session");
    return res;
  }

  // Redirect to Logto end-session
  const params = new URLSearchParams({
    post_logout_redirect_uri: postLogoutUri,
  });

  const res = NextResponse.redirect(
    `${LOGTO_ENDPOINT}/oidc/session/end?${params}`,
  );
  res.cookies.delete("admin_session");
  return res;
}
