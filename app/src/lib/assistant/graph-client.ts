/**
 * Microsoft-Graph-Client — Token-Cache + fetch-Helper.
 * Application-Permissions via client_credentials Flow.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_TIMEOUT_MS = 15_000;

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getGraphToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("MS_GRAPH_TENANT_ID / CLIENT_ID / CLIENT_SECRET fehlen");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    throw new Error(`Graph-Token-Fehler ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export async function graphFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const token = await getGraphToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(GRAPH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Graph ${path} → ${res.status}: ${await res.text()}`);
  }
  if (res.status === 202 || res.status === 204) return null;
  return (await res.json()) as T;
}

export const GRAPH_TIMEOUT = GRAPH_TIMEOUT_MS;
