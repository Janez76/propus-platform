/**
 * GET /auth/logto/callback — Logto OIDC callback handler.
 *
 * Exchanges the authorization code for tokens, upserts admin_users,
 * creates an admin_session, and redirects the SPA to /login?logto_token=…
 *
 * On VPS this route is never hit (Next.js rewrites /auth/* to Express).
 * On Vercel the rewrite is skipped so this handler runs directly.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";

const LOGTO_APP_ID = process.env.PROPUS_BOOKING_LOGTO_APP_ID || "";
const LOGTO_APP_SECRET = process.env.PROPUS_BOOKING_LOGTO_APP_SECRET || "";
const LOGTO_ENDPOINT = process.env.LOGTO_ENDPOINT || "http://localhost:3301";
const LOGTO_INTERNAL_ENDPOINT =
  process.env.LOGTO_INTERNAL_ENDPOINT || LOGTO_ENDPOINT;

const MGMT_APP_ID = process.env.PROPUS_MANAGEMENT_LOGTO_APP_ID || "";
const MGMT_APP_SECRET = process.env.PROPUS_MANAGEMENT_LOGTO_APP_SECRET || "";

let oidcConfigCache: Record<string, string> | null = null;

async function getOidcConfig() {
  if (oidcConfigCache) return oidcConfigCache;
  const res = await fetch(
    `${LOGTO_INTERNAL_ENDPOINT}/oidc/.well-known/openid-configuration`,
  );
  oidcConfigCache = (await res.json()) as Record<string, string>;
  return oidcConfigCache;
}

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

function sha256hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function getM2mToken(): Promise<string | null> {
  if (!MGMT_APP_ID || !MGMT_APP_SECRET) return null;
  const res = await fetch(`${LOGTO_INTERNAL_ENDPOINT}/oidc/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: MGMT_APP_ID,
      client_secret: MGMT_APP_SECRET,
      resource: "https://default.logto.app/api",
      scope: "all",
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token || null;
}

async function getUserRoles(logtoUserId: string): Promise<string[]> {
  const token = await getM2mToken();
  if (!token) return [];
  const res = await fetch(
    `${LOGTO_INTERNAL_ENDPOINT}/api/users/${logtoUserId}/roles`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const roles = (await res.json()) as { name: string }[];
  return roles.map((r) => r.name);
}

const ROLE_PRIORITY = ["super_admin", "admin", "photographer", "customer"];

export async function GET(req: NextRequest) {
  if (!LOGTO_APP_ID || !LOGTO_APP_SECRET) {
    return new NextResponse("Logto not configured", { status: 503 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const savedState = jar.get("logto_state")?.value;
  const verifier = jar.get("logto_verifier")?.value || "";
  const returnTo = jar.get("logto_return_to")?.value || "/";

  if (!code || !state || state !== savedState) {
    return new NextResponse("Invalid callback (state mismatch)", {
      status: 400,
    });
  }

  // Clean up OIDC cookies
  jar.delete("logto_state");
  jar.delete("logto_verifier");
  jar.delete("logto_return_to");

  try {
    const config = await getOidcConfig();
    const baseUrl = getBaseUrl(req);

    // Exchange code for tokens
    const tokenRes = await fetch(config.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: LOGTO_APP_ID,
        client_secret: LOGTO_APP_SECRET,
        redirect_uri: `${baseUrl}/auth/logto/callback`,
        code_verifier: verifier,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("[logto] token exchange failed:", err);
      return new NextResponse("Auth token exchange failed", { status: 500 });
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      id_token?: string;
    };

    // Fetch user info
    const userRes = await fetch(config.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = userRes.ok
      ? ((await userRes.json()) as Record<string, unknown>)
      : {};

    const email = String(userInfo.email || "").trim().toLowerCase();
    const name = String(
      userInfo.name || userInfo.username || email || "",
    );
    const logtoUserId = String(userInfo.sub || "");

    if (!email) {
      return new NextResponse("Kein E-Mail-Konto in Logto hinterlegt.", {
        status: 400,
      });
    }

    // Determine roles
    let logtoRoles: string[] = [];
    if (Array.isArray(userInfo.roles)) {
      logtoRoles = userInfo.roles as string[];
    } else if (logtoUserId) {
      logtoRoles = await getUserRoles(logtoUserId);
    }

    let sessionRole = "photographer";
    for (const rp of ROLE_PRIORITY) {
      if (logtoRoles.includes(rp)) {
        sessionRole = rp === "super_admin" ? "admin" : rp;
        break;
      }
    }

    const dbRole = logtoRoles.includes("super_admin")
      ? "super_admin"
      : logtoRoles.includes("admin")
        ? "admin"
        : sessionRole;

    // Upsert admin_users
    await pool
      .query(
        `INSERT INTO booking.admin_users (username, email, name, logto_user_id, role, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
         ON CONFLICT (username) DO UPDATE
           SET email=EXCLUDED.email,
               name=EXCLUDED.name,
               logto_user_id=COALESCE(EXCLUDED.logto_user_id, booking.admin_users.logto_user_id),
               role=$5,
               active=TRUE,
               updated_at=NOW()`,
        [email, email, name, logtoUserId || null, dbRole],
      )
      .catch(() => null);

    // Create admin_session
    const sessionToken = randomBytes(32).toString("hex");
    const tokenHash = sha256hex(sessionToken);
    await pool
      .query(
        `INSERT INTO booking.admin_sessions (token_hash, user_key, user_name, role, expires_at, created_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days', NOW())`,
        [tokenHash, email, name, sessionRole],
      )
      .catch((e: Error) => {
        console.error("[logto] create admin session failed:", e.message);
      });

    // Redirect SPA to /login with the token
    const loginUrl = new URL("/login", `${baseUrl}/`);
    loginUrl.searchParams.set("logto_token", sessionToken);
    loginUrl.searchParams.set("returnTo", returnTo);

    return NextResponse.redirect(loginUrl.toString());
  } catch (err) {
    console.error(
      "[logto] callback error:",
      err instanceof Error ? err.message : err,
    );
    return new NextResponse(
      `Login fehlgeschlagen: ${err instanceof Error ? err.message : "Unknown error"}`,
      { status: 500 },
    );
  }
}
