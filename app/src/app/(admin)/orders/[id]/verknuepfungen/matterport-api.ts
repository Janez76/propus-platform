import "server-only";

/**
 * Minimaler Matterport-GraphQL-Client für die Verknuepfungen-Mutate-Route
 * und das Daten-Loading der Verknuepfungen-Seite.
 *
 * Auth: MATTERPORT_TOKEN_ID + MATTERPORT_TOKEN_SECRET (Basic) — wie in
 * tours/lib/matterport.js. Fallback: MATTERPORT_API_KEY als Bearer.
 *
 * Operationen:
 *   - mpGetModelMeta(spaceId)       → { name, accessVisibility } (read-only)
 *   - mpPatchModelName(spaceId, n)  → setzt Modellname in Matterport
 *   - mpSetVisibility(spaceId, v, p?) → setzt Sichtbarkeit (PRIVATE / LINK_ONLY /
 *                                       PUBLIC / PASSWORD)
 */

const MATTERPORT_GRAPHQL_URLS = [
  "https://api.matterport.com/api/models/graph",
  "https://api.matterport.com/api/graphiql/",
];

export const VISIBILITY_PORTAL_KEYS = ["PRIVATE", "LINK_ONLY", "PUBLIC", "PASSWORD"] as const;
export type VisibilityPortalKey = (typeof VISIBILITY_PORTAL_KEYS)[number];

const VISIBILITY_API_MAP: Record<VisibilityPortalKey, string> = {
  PRIVATE: "private",
  LINK_ONLY: "unlisted",
  PUBLIC: "public",
  PASSWORD: "password",
};

const VISIBILITY_API_REVERSE: Record<string, VisibilityPortalKey> = {
  private: "PRIVATE",
  unlisted: "LINK_ONLY",
  public: "PUBLIC",
  password: "PASSWORD",
};

export function visibilityFromMatterport(api: string | null | undefined): VisibilityPortalKey | null {
  if (!api) return null;
  return VISIBILITY_API_REVERSE[String(api).toLowerCase()] ?? null;
}

function getAuthHeader(): string | null {
  const tokenId = (process.env.MATTERPORT_TOKEN_ID || "").trim();
  const tokenSecret = (process.env.MATTERPORT_TOKEN_SECRET || process.env.MATTERPORT_API_KEY || "").trim();
  if (tokenId && tokenSecret) {
    return `Basic ${Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64")}`;
  }
  if (tokenSecret) return `Bearer ${tokenSecret}`;
  return null;
}

async function graphRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<{ data: T | null; error: string | null }> {
  const auth = getAuthHeader();
  if (!auth) {
    return { data: null, error: "Matterport-Credentials fehlen (MATTERPORT_TOKEN_ID/SECRET)" };
  }
  const body = JSON.stringify({ query, variables });
  let lastDetail = "";
  for (const url of MATTERPORT_GRAPHQL_URLS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const raw = await res.text().catch(() => "");
      let parsed: { data?: T; errors?: { message?: string }[] } = {};
      try { parsed = JSON.parse(raw); } catch { /* HTML / leer */ }
      if (res.ok && !parsed.errors) return { data: parsed.data ?? null, error: null };
      if (parsed.errors?.length) {
        return { data: parsed.data ?? null, error: parsed.errors[0]?.message || "GraphQL-Fehler" };
      }
      if (res.status === 401 || res.status === 403) {
        return { data: null, error: "Matterport lehnt die Anmeldung ab — Token-ID + Secret prüfen" };
      }
      lastDetail = `HTTP ${res.status}: ${raw.slice(0, 200)}`;
    } catch (e) {
      clearTimeout(timeout);
      lastDetail = e instanceof Error ? e.message : String(e);
    }
  }
  return { data: null, error: `Matterport-API nicht erreichbar (${lastDetail || "kein Detail"})` };
}

export type MatterportModelMeta = {
  name: string | null;
  accessVisibility: VisibilityPortalKey | null;
  visibilityRaw: string | null;
};

export async function mpGetModelMeta(spaceId: string): Promise<{
  meta: MatterportModelMeta | null;
  error: string | null;
}> {
  if (!spaceId) return { meta: null, error: "space_id fehlt" };
  const gql = `query getModel($id: ID!) {
    model(id: $id) { id name accessVisibility }
  }`;
  const { data, error } = await graphRequest<{
    model: { id: string; name: string | null; accessVisibility: string | null } | null;
  }>(gql, { id: spaceId });
  if (error && !data?.model) return { meta: null, error };
  if (!data?.model) return { meta: null, error: "Model nicht gefunden" };
  return {
    meta: {
      name: data.model.name,
      accessVisibility: visibilityFromMatterport(data.model.accessVisibility),
      visibilityRaw: data.model.accessVisibility ?? null,
    },
    error: null,
  };
}

export async function mpPatchModelName(spaceId: string, name: string): Promise<{
  ok: boolean;
  name?: string;
  error?: string;
}> {
  const trimmed = name.trim();
  if (!spaceId) return { ok: false, error: "space_id fehlt" };
  if (!trimmed) return { ok: false, error: "Name darf nicht leer sein" };
  const gql = `mutation($id: ID!, $name: String!) {
    patchModel(id: $id, patch: { name: $name }) { id name }
  }`;
  const { data, error } = await graphRequest<{ patchModel: { id: string; name: string } | null }>(
    gql,
    { id: spaceId, name: trimmed },
  );
  if (data?.patchModel) return { ok: true, name: data.patchModel.name };
  return { ok: false, error: error || "Umbenennung fehlgeschlagen" };
}

export async function mpSetVisibility(
  spaceId: string,
  visibilityKey: VisibilityPortalKey,
  password?: string | null,
): Promise<{ ok: boolean; visibility?: string; error?: string }> {
  if (!spaceId) return { ok: false, error: "space_id fehlt" };
  const apiVis = VISIBILITY_API_MAP[visibilityKey];
  if (!apiVis) return { ok: false, error: `Ungueltige Sichtbarkeit: ${visibilityKey}` };
  if (visibilityKey === "PASSWORD" && !(password && password.length > 0)) {
    return { ok: false, error: "Passwort erforderlich bei visibility=PASSWORD" };
  }
  const gql = `mutation($id: ID!, $vis: ModelAccessVisibility!, $pw: String) {
    updateModelAccessVisibility(id: $id, visibility: $vis, password: $pw) { id visibility }
  }`;
  const { data, error } = await graphRequest<{
    updateModelAccessVisibility: { id: string; visibility: string } | null;
  }>(gql, {
    id: spaceId,
    vis: apiVis,
    pw: visibilityKey === "PASSWORD" ? password ?? null : null,
  });
  if (data?.updateModelAccessVisibility) {
    return { ok: true, visibility: data.updateModelAccessVisibility.visibility };
  }
  return { ok: false, error: error || "Sichtbarkeit setzen fehlgeschlagen" };
}
