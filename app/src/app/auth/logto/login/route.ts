/**
 * GET /auth/logto/login — Starts Logto OIDC PKCE flow.
 *
 * On VPS this route is never hit (Next.js rewrites /auth/* to Express).
 * On Vercel the rewrite is skipped so this handler runs directly.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";

const LOGTO_APP_ID = process.env.PROPUS_BOOKING_LOGTO_APP_ID || "";
const LOGTO_ENDPOINT = process.env.LOGTO_ENDPOINT || "http://localhost:3301";
const LOGTO_INTERNAL_ENDPOINT =
  process.env.LOGTO_INTERNAL_ENDPOINT || LOGTO_ENDPOINT;

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

export async function GET(req: NextRequest) {
  if (!LOGTO_APP_ID) {
    return new NextResponse("Logto not configured", { status: 503 });
  }

  await getOidcConfig();
  const state = randomBytes(16).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const returnTo = new URL(req.url).searchParams.get("returnTo") || "/";
  const baseUrl = getBaseUrl(req);

  const jar = await cookies();
  jar.set("logto_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  jar.set("logto_verifier", verifier, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  jar.set("logto_return_to", returnTo, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const params = new URLSearchParams({
    client_id: LOGTO_APP_ID,
    redirect_uri: `${baseUrl}/auth/logto/callback`,
    response_type: "code",
    scope: "openid profile email urn:logto:scope:roles",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  return NextResponse.redirect(`${LOGTO_ENDPOINT}/oidc/auth?${params}`);
}
