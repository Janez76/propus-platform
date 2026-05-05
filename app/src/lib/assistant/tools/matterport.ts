/**
 * Matterport-Tools fuer den KI-Assistenten — read-only Zugriff auf Spaces.
 *
 * Auth: MATTERPORT_TOKEN_ID + MATTERPORT_TOKEN_SECRET (Basic), Fallback
 * MATTERPORT_API_KEY als Bearer. Identische Logik wie tours/lib/matterport.js,
 * aber TS-only und auf Read-Operationen reduziert.
 *
 * Tools:
 *   - matterport_list_spaces: alle Spaces (optional Suchbegriff)
 *   - matterport_get_space: Detail eines Spaces (inkl. Share-URL, State)
 *   - matterport_get_share_url: nur die public Share-URL eines Spaces
 *
 * Schreibzugriff (archive/unarchive/create) bleibt bewusst aussen vor —
 * diese Aktionen wuerden Matterport-Lizenzen verbrauchen und gehoeren
 * hinter eine explizite Confirmation.
 */
import type { ToolDefinition, ToolHandler } from "./index";

const MATTERPORT_GRAPHQL_URLS = [
  "https://api.matterport.com/api/models/graph",
  "https://api.matterport.com/api/graphiql/",
];

type MatterportModel = {
  id: string;
  name: string | null;
  description?: string | null;
  state: string;
  created?: string;
  modified?: string;
  visibility?: string;
  internalId?: string | null;
  publication?: {
    address?: string | null;
    url?: string | null;
    externalUrl?: string | null;
    published?: boolean | null;
    summary?: string | null;
  } | null;
};

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
    return {
      data: null,
      error: "Matterport-Credentials fehlen — MATTERPORT_TOKEN_ID und MATTERPORT_TOKEN_SECRET in .env setzen",
    };
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
      try {
        parsed = JSON.parse(raw);
      } catch {
        // HTML/leere Antwort → next URL versuchen
      }
      if (res.ok && !parsed.errors) {
        return { data: parsed.data ?? null, error: null };
      }
      if (parsed.errors?.length) {
        return { data: parsed.data ?? null, error: parsed.errors[0]?.message || "GraphQL-Fehler" };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          data: null,
          error: "Matterport lehnt die Anmeldung ab — Token-ID + Secret aus my.matterport.com → API-Token verwenden (kein SDK-Schluessel).",
        };
      }
      lastDetail = `HTTP ${res.status}: ${raw.slice(0, 200)}`;
    } catch (e) {
      clearTimeout(timeout);
      lastDetail = e instanceof Error ? e.message : String(e);
    }
  }
  return { data: null, error: `Matterport-API nicht erreichbar (${lastDetail || "kein Detail"})` };
}

function shapeSpace(m: MatterportModel) {
  return {
    id: m.id,
    name: m.name,
    state: m.state,
    address: m.publication?.address ?? null,
    shareUrl: m.publication?.url ?? null,
    externalUrl: m.publication?.externalUrl ?? null,
    published: m.publication?.published ?? null,
    created: m.created ?? null,
    modified: m.modified ?? null,
  };
}

export const matterportTools: ToolDefinition[] = [
  {
    name: "matterport_list_spaces",
    description:
      "Listet Matterport-Spaces (Tours/Modelle) aus dem Propus-Konto. Optional nach Namen oder Adresse filtern. Liefert id, name, state, Share-URL je Space. Read-only — kein Archivieren/Loeschen.",
    kind: "read",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Suchbegriff fuer Name/Adresse (optional, case-insensitive Substring-Match clientseitig)" },
        include_inactive: { type: "boolean", description: "Auch archivierte Spaces einbeziehen (Default: true)" },
        limit: { type: "number", description: "Max. Anzahl Ergebnisse (Default 50, max 200)" },
      },
    },
  },
  {
    name: "matterport_get_space",
    description:
      "Liefert Details zu einem Matterport-Space anhand seiner ID: Name, Adresse, State (active/inactive/processing), Share-URL, Erstellungsdatum.",
    kind: "read",
    input_schema: {
      type: "object",
      properties: {
        space_id: { type: "string", description: "Matterport-Space-ID (z.B. 'sLnkRRfrMfv')" },
      },
      required: ["space_id"],
    },
  },
  {
    name: "matterport_get_share_url",
    description:
      "Gibt nur die oeffentliche Share-URL (my.matterport.com/show/?m=…) eines Spaces zurueck. Nuetzlich fuer Mailtexte oder Listings.",
    kind: "read",
    input_schema: {
      type: "object",
      properties: {
        space_id: { type: "string", description: "Matterport-Space-ID" },
      },
      required: ["space_id"],
    },
  },
];

export const matterportHandlers: Record<string, ToolHandler> = {
  matterport_list_spaces: async (input) => {
    const search = typeof input.search === "string" ? input.search.trim().toLowerCase() : "";
    const includeInactive = input.include_inactive !== false;
    const rawLimit = Number(input.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.trunc(rawLimit), 200) : 50;

    const includeArg = includeInactive ? ', include: [inactive]' : "";
    const collected: MatterportModel[] = [];
    let offset: string | null = null;
    type ListBlock = { nextOffset: string | null; results: MatterportModel[] };
    while (true) {
      const offsetArg: string = offset ? `, offset: "${offset}"` : "";
      const gql: string = `query { models(query: "*", pageSize: 100${offsetArg}${includeArg}, sortBy: [{field: created, order: desc}]) { totalResults nextOffset results { id name state created modified publication { address url externalUrl published } } } }`;
      const result = await graphRequest<{ models: ListBlock }>(gql);
      if (result.error) return { error: result.error };
      const block: ListBlock | undefined = result.data?.models;
      if (!block) break;
      collected.push(...(block.results || []));
      offset = block.nextOffset ?? null;
      if (!offset || collected.length >= 1000) break;
    }

    let filtered = collected;
    if (search) {
      filtered = collected.filter((m) => {
        const haystack = [
          m.name || "",
          m.publication?.address || "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      });
    }
    const trimmed = filtered.slice(0, limit);
    return {
      ok: true,
      total: filtered.length,
      returned: trimmed.length,
      spaces: trimmed.map(shapeSpace),
    };
  },

  matterport_get_space: async (input) => {
    const spaceId = typeof input.space_id === "string" ? input.space_id.trim() : "";
    if (!spaceId) return { error: "space_id ist erforderlich" };
    const gql = `query getModel($id: ID!) {
      model(id: $id) {
        id
        name
        state
        visibility
        description
        created
        modified
        publication { address url externalUrl published summary }
      }
    }`;
    const { data, error } = await graphRequest<{ model: MatterportModel | null }>(gql, { id: spaceId });
    if (error && !data?.model) return { error };
    if (!data?.model) return { error: `Matterport-Space ${spaceId} nicht gefunden` };
    return { ok: true, space: shapeSpace(data.model), warning: error || null };
  },

  matterport_get_share_url: async (input) => {
    const spaceId = typeof input.space_id === "string" ? input.space_id.trim() : "";
    if (!spaceId) return { error: "space_id ist erforderlich" };
    const gql = `query getModelUrl($id: ID!) { model(id: $id) { id name publication { url externalUrl } } }`;
    const { data, error } = await graphRequest<{ model: MatterportModel | null }>(gql, { id: spaceId });
    if (error && !data?.model) return { error };
    if (!data?.model) return { error: `Matterport-Space ${spaceId} nicht gefunden` };
    const shareUrl = data.model.publication?.url || `https://my.matterport.com/show/?m=${encodeURIComponent(spaceId)}`;
    return { ok: true, spaceId, name: data.model.name, shareUrl };
  },
};
