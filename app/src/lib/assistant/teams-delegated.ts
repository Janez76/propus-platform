/**
 * Microsoft Teams – Delegated OAuth Helper (Phase 2).
 *
 * Token-Lifecycle:
 *  1. Admin ruft GET /api/admin/teams/oauth/start auf → Browser-Redirect zu
 *     login.microsoftonline.com. PKCE-Verifier landet kurz in
 *     tour_manager.teams_oauth_state.
 *  2. Microsoft ruft GET /api/admin/teams/oauth/callback?code=... auf.
 *     Wir tauschen Code → access_token + refresh_token, persistieren in
 *     tour_manager.teams_delegated_tokens (UPSERT auf service_upn).
 *  3. Tools rufen getDelegatedAccessToken() — wenn access_token < 60s
 *     übrig hat, refreshen wir per refresh_token.
 *  4. delegatedGraphRequest() ist der Drop-in-Wrapper.
 *
 * Scopes (mindestens): offline_access, openid, profile,
 *   Chat.ReadWrite, ChatMessage.Send, ChannelMessage.Send.User.
 */

import { query, queryOne } from "@/lib/db";

export const TEAMS_DEFAULT_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Chat.ReadWrite",
  "ChatMessage.Send",
  "ChannelMessage.Send.User",
  "ChannelMessage.Read.All",
  "Chat.Read",
];

type TokenRow = {
  id: string;
  service_upn: string;
  tenant_id: string;
  client_id: string;
  scopes: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string | Date;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
  id_token?: string;
};

function env(name: string, ...fallback: string[]): string | undefined {
  for (const k of [name, ...fallback]) {
    const v = process.env[k];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

export function getDelegatedConfig() {
  const tenantId = env("M365_TENANT_ID", "MS_GRAPH_TENANT_ID", "TENANT_ID");
  const clientId = env("M365_DELEGATED_CLIENT_ID", "M365_CLIENT_ID", "MS_GRAPH_CLIENT_ID", "CLIENT_ID");
  const clientSecret = env(
    "M365_DELEGATED_CLIENT_SECRET",
    "M365_CLIENT_SECRET",
    "MS_GRAPH_CLIENT_SECRET",
    "CLIENT_SECRET",
  );
  const redirectUri =
    env("M365_DELEGATED_REDIRECT_URI") ||
    `${env("PLATFORM_PUBLIC_URL") || "https://admin-booking.propus.ch"}/api/teams-oauth/callback`;
  return { tenantId, clientId, clientSecret, redirectUri };
}

export function buildAuthorizeUrl(opts: {
  tenantId: string;
  clientId: string;
  redirectUri: string;
  state: string;
  pkceChallenge: string;
  scopes: string[];
  loginHint?: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    response_type: "code",
    redirect_uri: opts.redirectUri,
    response_mode: "query",
    scope: opts.scopes.join(" "),
    state: opts.state,
    code_challenge: opts.pkceChallenge,
    code_challenge_method: "S256",
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `https://login.microsoftonline.com/${encodeURIComponent(
    opts.tenantId,
  )}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(opts: {
  tenantId: string;
  clientId: string;
  clientSecret?: string;
  code: string;
  redirectUri: string;
  pkceVerifier: string;
}): Promise<{ data: TokenResponse | null; error: string | null }> {
  const body = new URLSearchParams({
    client_id: opts.clientId,
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    code_verifier: opts.pkceVerifier,
  });
  if (opts.clientSecret) body.set("client_secret", opts.clientSecret);

  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(opts.tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
    );
    const data = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok || !data.access_token) {
      return { data: null, error: data.error_description || data.error || `Token-Tausch HTTP ${res.status}` };
    }
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function refreshDelegatedToken(opts: {
  tenantId: string;
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
  scopes: string[];
}): Promise<{ data: TokenResponse | null; error: string | null }> {
  const body = new URLSearchParams({
    client_id: opts.clientId,
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    scope: opts.scopes.join(" "),
  });
  if (opts.clientSecret) body.set("client_secret", opts.clientSecret);
  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(opts.tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
    );
    const data = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok || !data.access_token) {
      return { data: null, error: data.error_description || data.error || `Refresh HTTP ${res.status}` };
    }
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function upsertDelegatedToken(args: {
  serviceUpn: string;
  displayName: string | null;
  tenantId: string;
  clientId: string;
  scopes: string[];
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  authorizedBy: string | null;
}) {
  const expiresAt = new Date(Date.now() + Math.max(60, args.expiresInSeconds - 30) * 1000);
  await query(
    `INSERT INTO tour_manager.teams_delegated_tokens
       (service_upn, display_name, tenant_id, client_id, scopes,
        access_token, refresh_token, access_token_expires_at,
        refresh_token_obtained_at, authorized_by, updated_at, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, NOW(), NULL)
     ON CONFLICT (service_upn) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       tenant_id = EXCLUDED.tenant_id,
       client_id = EXCLUDED.client_id,
       scopes = EXCLUDED.scopes,
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       access_token_expires_at = EXCLUDED.access_token_expires_at,
       refresh_token_obtained_at = NOW(),
       authorized_by = EXCLUDED.authorized_by,
       updated_at = NOW(),
       revoked_at = NULL`,
    [
      args.serviceUpn.toLowerCase(),
      args.displayName,
      args.tenantId,
      args.clientId,
      args.scopes.join(" "),
      args.accessToken,
      args.refreshToken,
      expiresAt.toISOString(),
      args.authorizedBy,
    ],
  );
}

async function loadActiveToken(serviceUpn?: string): Promise<TokenRow | null> {
  if (serviceUpn) {
    return queryOne<TokenRow>(
      `SELECT id, service_upn, tenant_id, client_id, scopes,
              access_token, refresh_token, access_token_expires_at
       FROM tour_manager.teams_delegated_tokens
       WHERE service_upn = $1 AND revoked_at IS NULL
       LIMIT 1`,
      [serviceUpn.toLowerCase()],
    );
  }
  return queryOne<TokenRow>(
    `SELECT id, service_upn, tenant_id, client_id, scopes,
            access_token, refresh_token, access_token_expires_at
     FROM tour_manager.teams_delegated_tokens
     WHERE revoked_at IS NULL
     ORDER BY updated_at DESC
     LIMIT 1`,
  );
}

export async function getDelegatedAccessToken(serviceUpn?: string): Promise<{
  token: string | null;
  upn: string | null;
  error: string | null;
}> {
  const row = await loadActiveToken(serviceUpn);
  if (!row) {
    return {
      token: null,
      upn: null,
      error: "Keine delegierten Teams-Tokens gefunden — Admin: /api/teams-oauth/start aufrufen.",
    };
  }
  const expiresAt = new Date(row.access_token_expires_at);
  const safetyMs = 60_000;
  if (expiresAt.getTime() - Date.now() > safetyMs) {
    return { token: row.access_token, upn: row.service_upn, error: null };
  }
  // Refresh
  const cfg = getDelegatedConfig();
  if (!cfg.clientId) {
    return { token: null, upn: row.service_upn, error: "M365_CLIENT_ID nicht konfiguriert" };
  }
  const { data, error } = await refreshDelegatedToken({
    tenantId: row.tenant_id,
    clientId: row.client_id || cfg.clientId,
    clientSecret: cfg.clientSecret,
    refreshToken: row.refresh_token,
    scopes: row.scopes.split(/\s+/).filter(Boolean),
  });
  if (error || !data?.access_token) {
    return { token: null, upn: row.service_upn, error: error || "Refresh fehlgeschlagen" };
  }
  const newExpires = new Date(Date.now() + Math.max(60, (data.expires_in || 3600) - 30) * 1000);
  await query(
    `UPDATE tour_manager.teams_delegated_tokens
     SET access_token = $1,
         refresh_token = COALESCE($2, refresh_token),
         access_token_expires_at = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [data.access_token, data.refresh_token || null, newExpires.toISOString(), row.id],
  );
  return { token: data.access_token, upn: row.service_upn, error: null };
}

export async function delegatedGraphRequest<T = unknown>(
  url: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string>; serviceUpn?: string } = {},
): Promise<{ data: T | null; status: number; error: string | null }> {
  const { token, error } = await getDelegatedAccessToken(options.serviceUpn);
  if (!token) return { data: null, status: 0, error };
  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text().catch(() => "");
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      let errMsg: string = `Graph HTTP ${res.status}`;
      if (data && typeof data === "object") {
        const maybeMsg = (data as { error?: { message?: string } }).error?.message;
        if (typeof maybeMsg === "string" && maybeMsg.trim() !== "") errMsg = maybeMsg;
      }
      return { data: data as T, status: res.status, error: errMsg };
    }
    return { data: data as T, status: res.status, error: null };
  } catch (err) {
    return { data: null, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

// PKCE helpers (lightweight — no external dep)
import { createHash, randomBytes } from "crypto";

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function generateState(): string {
  return base64UrlEncode(randomBytes(24));
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function persistOAuthState(args: {
  state: string;
  pkceVerifier: string;
  initiatedBy: string | null;
  redirectUri: string;
}) {
  await query(
    `INSERT INTO tour_manager.teams_oauth_state (state, pkce_verifier, initiated_by, redirect_uri)
     VALUES ($1, $2, $3, $4)`,
    [args.state, args.pkceVerifier, args.initiatedBy, args.redirectUri],
  );
  // Best-effort GC: alle Einträge älter als 10 min löschen
  await query(
    `DELETE FROM tour_manager.teams_oauth_state WHERE created_at < NOW() - INTERVAL '10 minutes'`,
  );
}

export async function consumeOAuthState(state: string): Promise<{
  pkceVerifier: string;
  initiatedBy: string | null;
  redirectUri: string;
} | null> {
  const row = await queryOne<{
    pkce_verifier: string;
    initiated_by: string | null;
    redirect_uri: string;
    created_at: string | Date;
  }>(
    `SELECT pkce_verifier, initiated_by, redirect_uri, created_at
     FROM tour_manager.teams_oauth_state WHERE state = $1`,
    [state],
  );
  if (!row) return null;
  // Single-use: löschen
  await query(`DELETE FROM tour_manager.teams_oauth_state WHERE state = $1`, [state]);
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (ageMs > 10 * 60_000) return null;
  return {
    pkceVerifier: row.pkce_verifier,
    initiatedBy: row.initiated_by,
    redirectUri: row.redirect_uri,
  };
}
