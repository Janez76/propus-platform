import { query as defaultQuery } from "@/lib/db";
import type { ToolDefinition, ToolHandler } from "./index";

type QueryFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
type FetchFn = typeof globalThis.fetch;

type MapsDeps = {
  query?: QueryFn;
  fetch?: FetchFn;
  apiKey?: string;
};

const DIRECTIONS_ENDPOINT = "https://maps.googleapis.com/maps/api/directions/json";
const DISTANCE_MATRIX_ENDPOINT = "https://maps.googleapis.com/maps/api/distancematrix/json";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_BATCH = 10;

function runtimeEnv(name: string): string | undefined {
  return (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
}

function getApiKey(deps: MapsDeps): string | null {
  return (
    deps.apiKey ||
    runtimeEnv("GOOGLE_MAPS_SERVER_KEY") ||
    runtimeEnv("GOOGLE_MAPS_API_KEY") ||
    null
  );
}

function text(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

function textArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const s = text(v);
    if (s) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function parseMode(value: unknown): "driving" | "transit" | "walking" | "bicycling" {
  const s = typeof value === "string" ? value.toLowerCase() : "";
  if (s === "transit" || s === "walking" || s === "bicycling") return s;
  return "driving";
}

async function fetchWithTimeout(url: string, ms: number, doFetch: FetchFn): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await doFetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
  } finally {
    clearTimeout(id);
  }
}

type DirectionsLeg = {
  distance?: { text?: string; value?: number };
  duration?: { text?: string; value?: number };
  duration_in_traffic?: { text?: string; value?: number };
  start_address?: string;
  end_address?: string;
  steps?: Array<{
    distance?: { text?: string };
    duration?: { text?: string };
    html_instructions?: string;
    travel_mode?: string;
  }>;
};

type DirectionsRoute = {
  summary?: string;
  warnings?: string[];
  overview_polyline?: { points?: string };
  legs?: DirectionsLeg[];
};

type DirectionsResponse = {
  status: string;
  error_message?: string;
  routes?: DirectionsRoute[];
};

type DistanceMatrixElement = {
  status: string;
  distance?: { text?: string; value?: number };
  duration?: { text?: string; value?: number };
  duration_in_traffic?: { text?: string; value?: number };
};

type DistanceMatrixResponse = {
  status: string;
  error_message?: string;
  origin_addresses?: string[];
  destination_addresses?: string[];
  rows?: Array<{ elements?: DistanceMatrixElement[] }>;
};

function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<div[^>]*>/gi, " — ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const mapsTools: ToolDefinition[] = [
  {
    name: "get_route",
    description:
      "Berechnet eine Route zwischen zwei Adressen via Google Directions API. " +
      "Liefert Distanz, Fahrzeit (mit/ohne Verkehr) und Schritt-für-Schritt-Anweisungen. " +
      "Adressen können freitext sein ('Bahnhofstrasse 1, Zürich') oder 'lat,lng'.",
    input_schema: {
      type: "object",
      properties: {
        origin: { type: "string", description: "Startadresse oder 'lat,lng'" },
        destination: { type: "string", description: "Zieladresse oder 'lat,lng'" },
        waypoints: {
          type: "array",
          items: { type: "string" },
          description: "Optional: Zwischenstopps (max. 8). Reihenfolge wird beibehalten.",
        },
        mode: {
          type: "string",
          description: "Reisemodus: driving (Default), transit, walking, bicycling",
        },
        departure_time: {
          type: "string",
          description: "Optional: ISO-8601 oder 'now'. Aktiviert Verkehrsschätzung.",
        },
      },
      required: ["origin", "destination"],
    },
  },
  {
    name: "get_distance_matrix",
    description:
      "Berechnet eine Distanz-/Fahrzeit-Matrix zwischen Listen von Start- und Zielorten via Google Distance Matrix API. " +
      "Nützlich um den nächstgelegenen Termin/Auftrag zu finden. Max. 10 Origins × 10 Destinations.",
    input_schema: {
      type: "object",
      properties: {
        origins: { type: "array", items: { type: "string" }, description: "Startadressen (max. 10)" },
        destinations: { type: "array", items: { type: "string" }, description: "Zieladressen (max. 10)" },
        mode: { type: "string", description: "Reisemodus: driving (Default), transit, walking, bicycling" },
        departure_time: { type: "string", description: "Optional: ISO-8601 oder 'now' für Verkehrsschätzung" },
      },
      required: ["origins", "destinations"],
    },
  },
  {
    name: "get_travel_time_for_orders",
    description:
      "Liefert Fahrzeit + Distanz von einer Startadresse zu den Adressen einer Liste von Aufträgen. " +
      "Praktisch für Fotografen-Routing (Beispiel: von Zürich HB zu den nächsten 5 offenen Aufträgen). " +
      "Sortiert nach Fahrzeit aufsteigend.",
    input_schema: {
      type: "object",
      properties: {
        start_address: { type: "string", description: "Startadresse" },
        order_ids: {
          type: "array",
          items: { type: "string" },
          description: "Liste von order_no oder Auftrags-IDs (max. 10)",
        },
        mode: { type: "string", description: "Reisemodus: driving (Default), transit, walking" },
      },
      required: ["start_address", "order_ids"],
    },
  },
];

export function createMapsHandlers(deps: MapsDeps = {}): Record<string, ToolHandler> {
  const runQuery = deps.query || defaultQuery;
  const doFetch = deps.fetch || globalThis.fetch;

  return {
    get_route: async (input: Record<string, unknown>) => {
      const apiKey = getApiKey(deps);
      if (!apiKey) {
        return {
          error:
            "GOOGLE_MAPS_SERVER_KEY (oder GOOGLE_MAPS_API_KEY) nicht konfiguriert. Directions API muss im Google-Cloud-Projekt aktiviert sein.",
        };
      }

      const origin = text(input.origin);
      const destination = text(input.destination);
      if (!origin || !destination) return { error: "origin und destination sind erforderlich" };

      const mode = parseMode(input.mode);
      const waypoints = textArray(input.waypoints, 8);
      const departureTime = text(input.departure_time);

      const params = new URLSearchParams({
        origin,
        destination,
        mode,
        language: "de",
        region: "ch",
        units: "metric",
        key: apiKey,
      });
      if (waypoints.length > 0) params.set("waypoints", waypoints.join("|"));
      if (departureTime) {
        if (departureTime === "now") {
          params.set("departure_time", "now");
        } else {
          const ms = Date.parse(departureTime);
          if (Number.isFinite(ms)) params.set("departure_time", String(Math.floor(ms / 1000)));
        }
      }

      try {
        const res = await fetchWithTimeout(
          `${DIRECTIONS_ENDPOINT}?${params.toString()}`,
          REQUEST_TIMEOUT_MS,
          doFetch,
        );
        if (!res.ok) return { error: `Directions API HTTP ${res.status}` };
        const data = (await res.json()) as DirectionsResponse;
        if (data.status !== "OK") {
          return { error: `Directions API: ${data.status}${data.error_message ? ` — ${data.error_message}` : ""}` };
        }
        const route = data.routes?.[0];
        if (!route) return { error: "Keine Route gefunden" };

        const legs = (route.legs || []).map((leg) => ({
          distanceText: leg.distance?.text ?? null,
          distanceMeters: leg.distance?.value ?? null,
          durationText: leg.duration?.text ?? null,
          durationSeconds: leg.duration?.value ?? null,
          durationInTrafficText: leg.duration_in_traffic?.text ?? null,
          durationInTrafficSeconds: leg.duration_in_traffic?.value ?? null,
          startAddress: leg.start_address ?? null,
          endAddress: leg.end_address ?? null,
          stepCount: leg.steps?.length ?? 0,
        }));

        const totalDistance = legs.reduce((s, l) => s + (l.distanceMeters || 0), 0);
        const totalDuration = legs.reduce((s, l) => s + (l.durationSeconds || 0), 0);

        // Nur die Schritte des ersten/einzigen Beins kompakt rausgeben — sonst wird's zu lang.
        const steps = (route.legs?.[0]?.steps || []).slice(0, 25).map((step) => ({
          instruction: stripHtml(step.html_instructions),
          distance: step.distance?.text ?? null,
          duration: step.duration?.text ?? null,
          mode: step.travel_mode ?? null,
        }));

        return {
          summary: route.summary ?? null,
          warnings: route.warnings || [],
          totalDistanceMeters: totalDistance,
          totalDurationSeconds: totalDuration,
          legs,
          steps,
          overviewPolyline: route.overview_polyline?.points ?? null,
          attribution: "Routing: Google Maps Directions",
        };
      } catch (err) {
        return { error: `Directions API Fehler: ${err instanceof Error ? err.message : String(err)}` };
      }
    },

    get_distance_matrix: async (input: Record<string, unknown>) => {
      const apiKey = getApiKey(deps);
      if (!apiKey) {
        return { error: "GOOGLE_MAPS_SERVER_KEY (oder GOOGLE_MAPS_API_KEY) nicht konfiguriert" };
      }

      const origins = textArray(input.origins, MAX_BATCH);
      const destinations = textArray(input.destinations, MAX_BATCH);
      if (origins.length === 0 || destinations.length === 0) {
        return { error: "origins und destinations dürfen nicht leer sein" };
      }
      const mode = parseMode(input.mode);
      const departureTime = text(input.departure_time);

      const params = new URLSearchParams({
        origins: origins.join("|"),
        destinations: destinations.join("|"),
        mode,
        language: "de",
        region: "ch",
        units: "metric",
        key: apiKey,
      });
      if (departureTime) {
        if (departureTime === "now") {
          params.set("departure_time", "now");
        } else {
          const ms = Date.parse(departureTime);
          if (Number.isFinite(ms)) params.set("departure_time", String(Math.floor(ms / 1000)));
        }
      }

      try {
        const res = await fetchWithTimeout(
          `${DISTANCE_MATRIX_ENDPOINT}?${params.toString()}`,
          REQUEST_TIMEOUT_MS,
          doFetch,
        );
        if (!res.ok) return { error: `Distance Matrix HTTP ${res.status}` };
        const data = (await res.json()) as DistanceMatrixResponse;
        if (data.status !== "OK") {
          return { error: `Distance Matrix: ${data.status}${data.error_message ? ` — ${data.error_message}` : ""}` };
        }

        const matrix = (data.rows || []).map((row, i) => ({
          origin: data.origin_addresses?.[i] ?? origins[i],
          cells: (row.elements || []).map((el, j) => ({
            destination: data.destination_addresses?.[j] ?? destinations[j],
            status: el.status,
            distanceText: el.distance?.text ?? null,
            distanceMeters: el.distance?.value ?? null,
            durationText: el.duration?.text ?? null,
            durationSeconds: el.duration?.value ?? null,
            durationInTrafficSeconds: el.duration_in_traffic?.value ?? null,
          })),
        }));

        return {
          originCount: origins.length,
          destinationCount: destinations.length,
          matrix,
          attribution: "Routing: Google Maps Distance Matrix",
        };
      } catch (err) {
        return { error: `Distance Matrix Fehler: ${err instanceof Error ? err.message : String(err)}` };
      }
    },

    get_travel_time_for_orders: async (input: Record<string, unknown>) => {
      const apiKey = getApiKey(deps);
      if (!apiKey) {
        return { error: "GOOGLE_MAPS_SERVER_KEY (oder GOOGLE_MAPS_API_KEY) nicht konfiguriert" };
      }

      const startAddress = text(input.start_address);
      if (!startAddress) return { error: "start_address ist erforderlich" };

      const ids = textArray(input.order_ids, MAX_BATCH);
      if (ids.length === 0) return { error: "order_ids ist erforderlich" };

      const numericIds: number[] = [];
      const stringIds: string[] = [];
      for (const id of ids) {
        const n = Number(id);
        if (Number.isInteger(n) && n > 0) numericIds.push(n);
        else stringIds.push(id);
      }

      const orders = await runQuery<{
        order_no: number;
        address: string | null;
      }>(
        `SELECT order_no, COALESCE(address, '') AS address
         FROM booking.orders
         WHERE (CARDINALITY($1::int[]) > 0 AND order_no = ANY($1::int[]))
            OR (CARDINALITY($2::text[]) > 0 AND id::text = ANY($2::text[]))
         LIMIT 10`,
        [numericIds, stringIds],
      );

      if (orders.length === 0) return { error: "Keine Aufträge gefunden" };

      const destinations = orders.map((o) => o.address || "").filter((a) => a.length > 0);
      if (destinations.length === 0) return { error: "Aufträge haben keine Adressen" };

      const mode = parseMode(input.mode);
      const params = new URLSearchParams({
        origins: startAddress,
        destinations: destinations.join("|"),
        mode,
        language: "de",
        region: "ch",
        units: "metric",
        key: apiKey,
      });

      try {
        const res = await fetchWithTimeout(
          `${DISTANCE_MATRIX_ENDPOINT}?${params.toString()}`,
          REQUEST_TIMEOUT_MS,
          doFetch,
        );
        if (!res.ok) return { error: `Distance Matrix HTTP ${res.status}` };
        const data = (await res.json()) as DistanceMatrixResponse;
        if (data.status !== "OK") {
          return { error: `Distance Matrix: ${data.status}${data.error_message ? ` — ${data.error_message}` : ""}` };
        }

        const elements = data.rows?.[0]?.elements || [];
        const items = orders
          .map((o, i) => {
            const el = elements[i];
            if (!el || el.status !== "OK") {
              return {
                orderNo: o.order_no,
                address: o.address,
                status: el?.status || "MISSING",
                distanceText: null,
                durationText: null,
                durationSeconds: null,
              };
            }
            return {
              orderNo: o.order_no,
              address: o.address,
              status: el.status,
              distanceText: el.distance?.text ?? null,
              durationText: el.duration?.text ?? null,
              durationSeconds: el.duration?.value ?? null,
            };
          })
          .sort((a, b) => {
            const av = a.durationSeconds ?? Number.POSITIVE_INFINITY;
            const bv = b.durationSeconds ?? Number.POSITIVE_INFINITY;
            return av - bv;
          });

        return {
          startAddress,
          mode,
          count: items.length,
          orders: items,
          attribution: "Routing: Google Maps Distance Matrix",
        };
      } catch (err) {
        return { error: `Distance Matrix Fehler: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}

export const mapsHandlers = createMapsHandlers();
