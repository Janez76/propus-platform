/**
 * Authentication helpers for Next.js
 * Logto wurde April 2026 entfernt — lokale Session-basierte Auth.
 */

import { NextRequest, NextResponse } from "next/server";

/** Bearer-Token aus Authorization-Header oder Cookie */
export function getTokenFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  const cookie = req.cookies.get("admin_session");
  if (cookie?.value) return cookie.value;
  return null;
}

/** Immer false — Logto entfernt */
export function isLogtoEnabled(_prefix?: string): boolean {
  return false;
}

/** Immer leeres Config-Objekt — Logto entfernt */
export function getLogtoConfig(_prefix?: string) {
  return { endpoint: "", internalEndpoint: "", appId: "", appSecret: "", scopes: [], discoveryUrl: "" };
}

/** JWT-Payload dekodieren (ohne Verifikation) */
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

/** Middleware: 401 wenn kein Token vorhanden */
export async function requireAuth(
  req: NextRequest,
): Promise<{ user: { sub: string; email?: string; roles?: string[] } } | NextResponse> {
  const token = getTokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { user: { sub: token } };
}
