import "server-only";
import { query, queryOne } from "./db";
import { logger } from "./logger";

const GRAPH_URLS = [
  "https://api.matterport.com/api/models/graph",
  "https://api.matterport.com/api/graphiql/",
];

export type MatterportModel = {
  id: string;
  name: string | null;
  description: string | null;
  internalId: string | null;
  state: string | null;
  created: string | null;
};

type Credentials = { tokenId: string; tokenSecret: string };
type CacheEntry<T> = { value: T; at: number };

const CREDS_TTL_MS = 30_000;
const LIST_TTL_MS = 30_000;

let credsCache: CacheEntry<Credentials> | null = null;
let listCache: CacheEntry<MatterportModel[]> | null = null;

async function resolveCredentials(): Promise<Credentials> {
  const now = Date.now();
  if (credsCache && now - credsCache.at < CREDS_TTL_MS) {
    return credsCache.value;
  }
  let stored: Credentials = { tokenId: "", tokenSecret: "" };
  try {
    const row = await queryOne<{ value: { tokenId?: string; tokenSecret?: string } }>(
      `SELECT value FROM tour_manager.settings WHERE key = 'matterport_api_credentials'`,
    );
    if (row?.value && typeof row.value === "object") {
      stored = {
        tokenId: String(row.value.tokenId ?? "").trim(),
        tokenSecret: String(row.value.tokenSecret ?? "").trim(),
      };
    }
  } catch (e) {
    logger.warn("matterport credentials lookup failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
  const envId = process.env.MATTERPORT_TOKEN_ID || "";
  const envSecret =
    process.env.MATTERPORT_TOKEN_SECRET || process.env.MATTERPORT_API_KEY || "";
  const value: Credentials = {
    tokenId: stored.tokenId || envId,
    tokenSecret: stored.tokenSecret || envSecret,
  };
  credsCache = { value, at: now };
  return value;
}

async function authHeader(): Promise<string | null> {
  const { tokenId, tokenSecret } = await resolveCredentials();
  if (tokenId && tokenSecret) {
    return `Basic ${Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64")}`;
  }
  if (tokenSecret) {
    return `Bearer ${tokenSecret}`;
  }
  return null;
}

type GraphResult<T> = { data: T | null; error: string | null };

async function graphRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<GraphResult<T>> {
  const auth = await authHeader();
  if (!auth) {
    return { data: null, error: "MATTERPORT_TOKEN_ID/SECRET nicht gesetzt" };
  }
  const body = JSON.stringify({ query, variables });
  const headers = { Authorization: auth, "Content-Type": "application/json" };
  let lastDetail = "";
  for (const url of GRAPH_URLS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
      clearTimeout(timeout);
      const raw = await res.text().catch(() => "");
      let parsed: { data?: T; errors?: Array<{ message?: string }> } = {};
      try {
        parsed = raw ? JSON.parse(raw) : {};
      } catch {
        // not JSON
      }
      if (res.ok && !parsed.errors) {
        return { data: (parsed.data ?? null) as T | null, error: null };
      }
      if (parsed.errors?.length) {
        return { data: null, error: parsed.errors[0]?.message ?? "GraphQL error" };
      }
      if (res.status === 401 || res.status === 403) {
        return { data: null, error: "Matterport hat die Anmeldung abgelehnt (Token prüfen)" };
      }
      lastDetail = `HTTP ${res.status}: ${raw.slice(0, 200)}`;
    } catch (e) {
      clearTimeout(timeout);
      lastDetail =
        e instanceof Error && e.name === "AbortError"
          ? "Timeout nach 15 s"
          : e instanceof Error
            ? e.message
            : String(e);
    }
  }
  return { data: null, error: `Matterport-Request fehlgeschlagen${lastDetail ? ` (${lastDetail})` : ""}` };
}

export async function listRecentMatterportModels(
  options: { force?: boolean } = {},
): Promise<{ models: MatterportModel[]; error: string | null }> {
  const now = Date.now();
  if (!options.force && listCache && now - listCache.at < LIST_TTL_MS) {
    return { models: listCache.value, error: null };
  }
  type ListResponse = {
    models: { results: MatterportModel[]; nextOffset: string | null };
  };
  const all: MatterportModel[] = [];
  let offset: string | null = null;
  do {
    const offsetArg: string = offset != null ? `, offset: "${offset}"` : "";
    const gql: string = `query { models(query: "*", pageSize: 100${offsetArg}, include: [inactive], sortBy: [{field: created, order: desc}]) { totalResults results { id name description internalId state created } nextOffset } }`;
    const result: GraphResult<ListResponse> = await graphRequest<ListResponse>(gql);
    if (result.error) {
      return { models: all, error: result.error };
    }
    const results: MatterportModel[] = result.data?.models?.results ?? [];
    all.push(...results);
    offset = result.data?.models?.nextOffset ?? null;
    if (all.length >= 500) break;
  } while (offset != null);
  listCache = { value: all, at: now };
  return { models: all, error: null };
}

export async function getMatterportModelMeta(
  spaceId: string,
): Promise<{ created: string | null; state: string | null; name: string | null; error: string | null }> {
  const gql = `query getModel($id: ID!) { model(id: $id) { id name state created } }`;
  const { data, error } = await graphRequest<{
    model: { id: string; name: string | null; state: string | null; created: string | null } | null;
  }>(gql, { id: spaceId });
  if (error) {
    return { created: null, state: null, name: null, error };
  }
  const m = data?.model ?? null;
  return {
    created: m?.created ?? null,
    state: m?.state ?? null,
    name: m?.name ?? null,
    error: null,
  };
}

export type MatterportCandidate = {
  spaceId: string;
  name: string | null;
  internalId: string | null;
  state: string | null;
  created: string | null;
  /** true if a row already exists in tour_manager.tours (regardless of booking_order_no). */
  alreadyInTourManager: boolean;
};

/**
 * Returns recent Matterport spaces that are NOT linked to any booking order.
 * Filters out:
 *   - non-active spaces (state !== 'active')
 *   - spaces whose tour_manager row has booking_order_no set
 */
export async function listUnlinkedCandidates(limit = 25): Promise<{
  candidates: MatterportCandidate[];
  error: string | null;
}> {
  const { models, error } = await listRecentMatterportModels();
  if (error && models.length === 0) {
    return { candidates: [], error };
  }
  const activeModels = models.filter(
    (m) => String(m.state ?? "").toLowerCase() === "active",
  );
  if (activeModels.length === 0) {
    return { candidates: [], error };
  }
  const idList = activeModels.map((m) => String(m.id || "").trim()).filter(Boolean);
  type LinkRow = { space_id: string; booking_order_no: number | null };
  const rows = await query<LinkRow>(
    `SELECT TRIM(matterport_space_id) AS space_id, booking_order_no
     FROM tour_manager.tours
     WHERE TRIM(matterport_space_id) = ANY($1::text[])`,
    [idList],
  );
  const linkedToOrder = new Set<string>();
  const inTourManager = new Set<string>();
  for (const row of rows) {
    inTourManager.add(row.space_id);
    if (row.booking_order_no != null) {
      linkedToOrder.add(row.space_id);
    }
  }
  const candidates: MatterportCandidate[] = activeModels
    .filter((m) => !linkedToOrder.has(String(m.id || "").trim()))
    .slice(0, limit)
    .map((m) => ({
      spaceId: String(m.id || "").trim(),
      name: m.name,
      internalId: m.internalId,
      state: m.state,
      created: m.created,
      alreadyInTourManager: inTourManager.has(String(m.id || "").trim()),
    }));
  return { candidates, error };
}

export function invalidateMatterportCache() {
  credsCache = null;
  listCache = null;
}
