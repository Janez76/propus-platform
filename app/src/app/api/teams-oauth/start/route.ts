/**
 * GET /api/admin/teams/oauth/start
 * Beginnt den Microsoft Auth-Code-Flow (PKCE) für den delegierten Service-User.
 * Nur Admins dürfen das einleiten — der entstehende Refresh-Token erlaubt es
 * dem Assistenten, dauerhaft als dieser User in Teams zu schreiben.
 */
import { NextResponse } from "next/server";
import { getAdminSession, isOrderEditorRole } from "@/lib/auth.server";
import {
  TEAMS_DEFAULT_SCOPES,
  buildAuthorizeUrl,
  generatePkcePair,
  generateState,
  getDelegatedConfig,
  persistOAuthState,
} from "@/lib/assistant/teams-delegated";

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session || !isOrderEditorRole(session.role)) {
    return NextResponse.json({ ok: false, error: "Admin-Login erforderlich" }, { status: 401 });
  }

  const cfg = getDelegatedConfig();
  if (!cfg.tenantId || !cfg.clientId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Microsoft Graph nicht konfiguriert: M365_TENANT_ID und M365_CLIENT_ID (oder M365_DELEGATED_CLIENT_ID) müssen gesetzt sein.",
      },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const loginHint = url.searchParams.get("login_hint") || undefined;
  const customScopes = url.searchParams.get("scopes");
  const scopes = customScopes ? customScopes.split(/[\s,]+/).filter(Boolean) : TEAMS_DEFAULT_SCOPES;

  const { verifier, challenge } = generatePkcePair();
  const state = generateState();

  await persistOAuthState({
    state,
    pkceVerifier: verifier,
    initiatedBy: session.userKey || session.userName || "admin",
    redirectUri: cfg.redirectUri,
  });

  const authorizeUrl = buildAuthorizeUrl({
    tenantId: cfg.tenantId,
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    state,
    pkceChallenge: challenge,
    scopes,
    loginHint,
  });

  return NextResponse.redirect(authorizeUrl, 302);
}
