/**
 * Matterport-Tools fuer den KI-Assistenten — Read + minimal-Write auf Spaces.
 *
 * Auth: MATTERPORT_TOKEN_ID + MATTERPORT_TOKEN_SECRET (Basic), Fallback
 * MATTERPORT_API_KEY als Bearer. Identische Logik wie tours/lib/matterport.js,
 * aber TS-only.
 *
 * Read-Tools:
 *   - matterport_list_spaces: alle Spaces (optional Suchbegriff)
 *   - matterport_get_space: Detail eines Spaces (inkl. Share-URL, State, Visibility)
 *   - matterport_get_share_url: nur die public Share-URL eines Spaces
 *
 * Write-Tools (kind: "write", requiresConfirmation: true):
 *   - matterport_rename_space: Titel/Namen eines Spaces aendern (patchModel)
 *   - matterport_set_visibility: Sichtbarkeit setzen
 *       (private / password_protected / unlisted / public)
 *
 * Lizenz-relevante Schreibaktionen (archive/unarchive/create) bleiben bewusst
 * aussen vor — die laufen ueber den Tours-Background-Worker mit eigener
 * Bestellungs-Logik (siehe tours/lib/matterport.js).
 */
import { query as defaultQuery } from "@/lib/db";
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
    visibility: m.visibility ?? null,
    address: m.publication?.address ?? null,
    shareUrl: m.publication?.url ?? null,
    externalUrl: m.publication?.externalUrl ?? null,
    published: m.publication?.published ?? null,
    created: m.created ?? null,
    modified: m.modified ?? null,
  };
}

const VISIBILITY_VALUES = ["private", "password_protected", "unlisted", "public"] as const;
type VisibilityValue = (typeof VISIBILITY_VALUES)[number];

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
  {
    name: "matterport_rename_space",
    description:
      "Aendert den Titel/Namen eines Matterport-Spaces (erscheint im Player, in Listen und in der Matterport-UI). Die Share-URL bleibt unveraendert. Erfordert User-Bestaetigung.",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        space_id: { type: "string", description: "Matterport-Space-ID" },
        name: {
          type: "string",
          description: "Neuer Titel/Name (wird getrimmt, leer ist nicht erlaubt)",
        },
      },
      required: ["space_id", "name"],
    },
  },
  {
    name: "matterport_set_visibility",
    description:
      "Setzt die Sichtbarkeit eines Matterport-Spaces. Werte: 'private' = nur Konto-Mitarbeiter, 'password_protected' = mit Passwort, 'unlisted' = jeder mit dem Link, 'public' = oeffentlich + Suchmaschinen. Bei 'password_protected' muss `password` mitgegeben werden. Erfordert User-Bestaetigung.",
    kind: "write",
    requiresConfirmation: true,
    input_schema: {
      type: "object",
      properties: {
        space_id: { type: "string", description: "Matterport-Space-ID" },
        visibility: {
          type: "string",
          enum: [...VISIBILITY_VALUES],
          description: "Eine von: private, password_protected, unlisted, public",
        },
        password: {
          type: "string",
          description: "Passwort, nur erforderlich bei visibility='password_protected'. Bei anderen Werten ignoriert.",
        },
      },
      required: ["space_id", "visibility"],
    },
  },
  {
    name: "matterport_live_status_for_orders",
    description:
      "Prüft live in Matterport, welche Spaces zu den Aufträgen eines Datums gehören und wie ihr aktueller Status ist. Joint booking.orders mit tour_manager.tours per booking_order_no und ruft pro gefundenem matterport_space_id direkt die Matterport-GraphQL-API auf (state, visibility, shareUrl, lastModified). Standard: heute. Nutze dieses Tool wenn der User 'live' sagt im Zusammenhang mit Touren / Aufträgen / Matterport.",
    kind: "read",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "ISO-Datum YYYY-MM-DD (Default: heute)" },
        order_no: { type: "number", description: "Optional: nur ein einzelner Auftrag (überschreibt date)" },
      },
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

  matterport_rename_space: async (input) => {
    const spaceId = typeof input.space_id === "string" ? input.space_id.trim() : "";
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!spaceId) return { error: "space_id ist erforderlich" };
    if (!name) return { error: "name darf nicht leer sein" };

    const gql = `mutation($id: ID!, $name: String!) {
      patchModel(id: $id, patch: { name: $name }) { id name }
    }`;
    const { data, error } = await graphRequest<{ patchModel: { id: string; name: string } | null }>(
      gql,
      { id: spaceId, name },
    );
    if (error && !data?.patchModel) return { error };
    if (!data?.patchModel) return { error: `Umbenennung fehlgeschlagen fuer ${spaceId}` };
    const shareUrl = `https://my.matterport.com/show/?m=${encodeURIComponent(data.patchModel.id)}`;
    return { ok: true, spaceId: data.patchModel.id, name: data.patchModel.name, shareUrl };
  },

  matterport_set_visibility: async (input) => {
    const spaceId = typeof input.space_id === "string" ? input.space_id.trim() : "";
    const visibilityRaw = typeof input.visibility === "string" ? input.visibility.trim().toLowerCase() : "";
    const password = typeof input.password === "string" && input.password.length > 0 ? input.password : null;
    if (!spaceId) return { error: "space_id ist erforderlich" };
    if (!(VISIBILITY_VALUES as readonly string[]).includes(visibilityRaw)) {
      return { error: `visibility muss einer von ${VISIBILITY_VALUES.join(", ")} sein` };
    }
    const visibility = visibilityRaw as VisibilityValue;
    if (visibility === "password_protected" && !password) {
      return { error: "password ist erforderlich bei visibility=password_protected" };
    }

    const gql = `mutation($id: ID!, $vis: ModelAccessVisibility!, $pw: String) {
      updateModelAccessVisibility(id: $id, visibility: $vis, password: $pw) { id visibility }
    }`;
    const { data, error } = await graphRequest<{
      updateModelAccessVisibility: { id: string; visibility: string } | null;
    }>(gql, { id: spaceId, vis: visibility, pw: password });
    if (error && !data?.updateModelAccessVisibility) return { error };
    if (!data?.updateModelAccessVisibility) {
      return { error: `Sichtbarkeit setzen fehlgeschlagen fuer ${spaceId}` };
    }
    return {
      ok: true,
      spaceId: data.updateModelAccessVisibility.id,
      visibility: data.updateModelAccessVisibility.visibility,
    };
  },

  matterport_live_status_for_orders: async (input) => {
    const orderNoInput = Number(input.order_no);
    const singleOrder = Number.isFinite(orderNoInput) && orderNoInput > 0 ? Math.trunc(orderNoInput) : null;
    const dateInput = typeof input.date === "string" ? input.date.trim() : "";
    const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
    const dateFilter = isoDateRe.test(dateInput) ? dateInput : null;

    type Row = {
      order_no: number;
      status: string | null;
      address: string | null;
      scheduled_date: string | null;
      scheduled_time: string | null;
      customer_name: string | null;
      photographer_name: string | null;
      services: Record<string, unknown> | null;
      tour_id: number | null;
      matterport_space_id: string | null;
      tour_url: string | null;
    };

    let rows: Row[];
    if (singleOrder) {
      rows = await defaultQuery<Row>(
        `SELECT o.order_no, o.status, o.address,
                NULLIF(o.schedule->>'date', '') AS scheduled_date,
                NULLIF(o.schedule->>'time', '') AS scheduled_time,
                COALESCE(o.billing->>'name', o.billing->>'company') AS customer_name,
                COALESCE(o.photographer->>'name', o.photographer->>'key') AS photographer_name,
                o.services::jsonb AS services,
                t.id AS tour_id, t.matterport_space_id, t.tour_url
         FROM booking.orders o
         LEFT JOIN tour_manager.tours t ON t.booking_order_no = o.order_no
         WHERE o.order_no = $1
         LIMIT 1`,
        [singleOrder],
      );
    } else {
      const dateExpr = dateFilter ? "$1::date" : "CURRENT_DATE";
      const params = dateFilter ? [dateFilter] : [];
      rows = await defaultQuery<Row>(
        `SELECT o.order_no, o.status, o.address,
                NULLIF(o.schedule->>'date', '') AS scheduled_date,
                NULLIF(o.schedule->>'time', '') AS scheduled_time,
                COALESCE(o.billing->>'name', o.billing->>'company') AS customer_name,
                COALESCE(o.photographer->>'name', o.photographer->>'key') AS photographer_name,
                o.services::jsonb AS services,
                t.id AS tour_id, t.matterport_space_id, t.tour_url
         FROM booking.orders o
         LEFT JOIN tour_manager.tours t ON t.booking_order_no = o.order_no
         WHERE NULLIF(o.schedule->>'date', '')::date = ${dateExpr}
         ORDER BY NULLIF(o.schedule->>'time', '') NULLS LAST, o.order_no ASC`,
        params,
      );
    }

    const liveQuery = `query getModel($id: ID!) {
      model(id: $id) {
        id name state visibility modified created
        publication { url externalUrl published address }
      }
    }`;

    const orders = await Promise.all(
      rows.map(async (r) => {
        const services = r.services && typeof r.services === "object"
          ? Object.keys(r.services).filter((k) => {
              const v = (r.services as Record<string, unknown>)[k];
              return v === true || (typeof v === "number" && v > 0);
            })
          : [];

        const base = {
          orderNo: r.order_no,
          status: r.status,
          address: r.address,
          scheduledDate: r.scheduled_date,
          scheduledTime: r.scheduled_time,
          customerName: r.customer_name,
          photographer: r.photographer_name,
          services,
          tourId: r.tour_id,
          matterportSpaceId: r.matterport_space_id,
        };

        if (!r.matterport_space_id) {
          return {
            ...base,
            matterport: null,
            note: "Kein verknüpfter Matterport-Space (booking_order_no in tour_manager.tours nicht gefunden oder Tour ohne Space-ID).",
          };
        }

        const { data, error } = await graphRequest<{ model: MatterportModel | null }>(
          liveQuery,
          { id: r.matterport_space_id },
        );

        if (!data?.model) {
          return {
            ...base,
            matterport: { error: error || "Space in Matterport nicht gefunden" },
          };
        }

        const m = data.model;
        return {
          ...base,
          matterport: {
            spaceId: m.id,
            name: m.name,
            state: m.state,
            visibility: m.visibility ?? null,
            published: m.publication?.published ?? null,
            shareUrl: m.publication?.url ?? `https://my.matterport.com/show/?m=${encodeURIComponent(m.id)}`,
            address: m.publication?.address ?? null,
            modified: m.modified ?? null,
            created: m.created ?? null,
          },
        };
      }),
    );

    return {
      ok: true,
      filter: singleOrder ? { orderNo: singleOrder } : { date: dateFilter || "today" },
      total: orders.length,
      withMatterportSpace: orders.filter((o) => o.matterportSpaceId).length,
      orders,
    };
  },
};
