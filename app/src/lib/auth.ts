/**
 * Logto OIDC Authentication for Next.js
 *
 * Logto endpoints:
 *   Authorization: ${LOGTO_ENDPOINT}/oidc/auth
 *   Token:         ${LOGTO_ENDPOINT}/oidc/token
 *   UserInfo:      ${LOGTO_ENDPOINT}/oidc/me
 *   Discovery:     ${LOGTO_ENDPOINT}/oidc/.well-known/openid-configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "./logger";

const LOGTO_ENDPOINT =
  process.env.LOGTO_ENDPOINT || "http://localhost:3301";
const LOGTO_INTERNAL_ENDPOINT =
  process.env.LOGTO_INTERNAL_ENDPOINT || LOGTO_ENDPOINT;

export interface LogtoAppConfig {
  prefix: "PROPUS_BOOKING" | "PROPUS_TOURS_ADMIN" | "PROPUS_TOURS_PORTAL" | "PROPUS_MANAGEMENT";
  callbackPath: string;
  loginPath: string;
  logoutPath: string;
  logoutRedirect: string;
}

export function getLogtoConfig(prefix: string) {
  return {
    endpoint: LOGTO_ENDPOINT,
    internalEndpoint: LOGTO_INTERNAL_ENDPOINT,
    appId: process.env[`${prefix}_LOGTO_APP_ID`] || "",
    appSecret: process.env[`${prefix}_LOGTO_APP_SECRET`] || "",
    scopes: ["openid", "profile", "email"],
    discoveryUrl: `${LOGTO_INTERNAL_ENDPOINT}/oidc/.well-known/openid-configuration`,
  };
}

export function isLogtoEnabled(prefix: string): boolean {
  return !!(
    process.env[`${prefix}_LOGTO_APP_ID`] &&
    process.env[`${prefix}_LOGTO_APP_SECRET`]
  );
}

/** Session token from cookie (Bearer token stored by Express session during migration) */
export function getTokenFromRequest(req: NextRequest): string | null {
  // During migration: token passed from React SPA via Authorization header
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
}

/** Decode JWT payload without verification (verification done by Logto) */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/** Validate a Logto JWT token via the Logto userinfo endpoint */
export async function validateToken(token: string): Promise<{
  sub: string;
  email?: string;
  name?: string;
  roles?: string[];
} | null> {
  try {
    const res = await fetch(`${LOGTO_INTERNAL_ENDPOINT}/oidc/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    logger.warn("Token validation failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/** Next.js middleware helper: returns 401 if no valid token */
export async function requireAuth(
  req: NextRequest,
): Promise<{ user: { sub: string; email?: string; roles?: string[] } } | NextResponse> {
  const token = getTokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await validateToken(token);
  if (!user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  return { user };
}

/** Build Logto authorization URL for PKCE login flow */
export function buildLogtoAuthUrl(config: {
  appId: string;
  endpoint: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    scope: "openid profile email",
    state: config.state,
    code_challenge: config.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${config.endpoint}/oidc/auth?${params.toString()}`;
}
