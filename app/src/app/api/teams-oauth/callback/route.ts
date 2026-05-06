/**
 * GET /api/admin/teams/oauth/callback
 * Wird von Microsoft mit ?code=...&state=... aufgerufen. Tauscht den Code
 * gegen Access-/Refresh-Token und persistiert sie im Token-Store.
 */
import { NextResponse } from "next/server";
import { getAdminSession, isOrderEditorRole } from "@/lib/auth.server";
import {
  consumeOAuthState,
  exchangeCodeForToken,
  getDelegatedConfig,
  upsertDelegatedToken,
  TEAMS_DEFAULT_SCOPES,
} from "@/lib/assistant/teams-delegated";

type IdTokenClaims = { upn?: string; preferred_username?: string; name?: string; email?: string };

function decodeIdToken(idToken: string | undefined): IdTokenClaims | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as IdTokenClaims;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session || !isOrderEditorRole(session.role)) {
    return NextResponse.json({ ok: false, error: "Admin-Login erforderlich" }, { status: 401 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    const desc = url.searchParams.get("error_description") || "";
    return NextResponse.json({ ok: false, error: `Microsoft hat abgebrochen: ${oauthError} – ${desc}` }, { status: 400 });
  }
  if (!code || !state) {
    return NextResponse.json({ ok: false, error: "code oder state fehlt" }, { status: 400 });
  }

  const stored = await consumeOAuthState(state);
  if (!stored) {
    return NextResponse.json(
      { ok: false, error: "state ungültig oder abgelaufen — bitte /api/admin/teams/oauth/start erneut starten" },
      { status: 400 },
    );
  }

  const cfg = getDelegatedConfig();
  if (!cfg.tenantId || !cfg.clientId) {
    return NextResponse.json({ ok: false, error: "Konfig fehlt (M365_TENANT_ID/M365_CLIENT_ID)" }, { status: 500 });
  }

  const { data, error } = await exchangeCodeForToken({
    tenantId: cfg.tenantId,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    code,
    redirectUri: stored.redirectUri,
    pkceVerifier: stored.pkceVerifier,
  });
  if (error || !data?.access_token || !data.refresh_token) {
    return NextResponse.json(
      { ok: false, error: error || "Token-Antwort unvollständig (kein refresh_token? offline_access scope fehlt?)" },
      { status: 502 },
    );
  }

  const claims = decodeIdToken(data.id_token);
  const serviceUpn = (claims?.upn || claims?.preferred_username || claims?.email || "").toLowerCase().trim();
  if (!serviceUpn) {
    return NextResponse.json({ ok: false, error: "Service-UPN konnte aus id_token nicht ermittelt werden" }, { status: 502 });
  }

  const grantedScopes = data.scope ? data.scope.split(/\s+/).filter(Boolean) : TEAMS_DEFAULT_SCOPES;

  await upsertDelegatedToken({
    serviceUpn,
    displayName: claims?.name || null,
    tenantId: cfg.tenantId,
    clientId: cfg.clientId,
    scopes: grantedScopes,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresInSeconds: typeof data.expires_in === "number" ? data.expires_in : 3600,
    authorizedBy: stored.initiatedBy,
  });

  return NextResponse.json({
    ok: true,
    message: `Teams-Delegated-Auth aktiviert für ${serviceUpn}. Schreibtools sind jetzt verfügbar.`,
    serviceUpn,
    displayName: claims?.name || null,
    grantedScopes,
  });
}
