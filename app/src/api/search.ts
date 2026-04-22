/**
 * Globale Admin-Suche — /api/tours/admin/search?q=...
 * Ergebnis-Shape: Gruppen (Kunden/Touren/Rechnungen/Galerien/Tickets) mit Items,
 * die direkt per href angesprungen werden können.
 */

export type SearchItemIcon =
  | "users"
  | "home"
  | "receipt"
  | "images"
  | "message"
  | "link";

export interface SearchItem {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  icon?: SearchItemIcon;
}

export interface SearchGroup {
  id: string;
  label: string;
  items: SearchItem[];
}

export interface SearchResponse {
  ok: true;
  q: string;
  groups: SearchGroup[];
}

const BASE = "/api/tours/admin/search";

export async function globalSearch(
  q: string,
  opts?: { limit?: number; signal?: AbortSignal },
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q });
  if (opts?.limit) params.set("limit", String(opts.limit));
  const res = await fetch(`${BASE}?${params.toString()}`, {
    credentials: "include",
    signal: opts?.signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as SearchResponse;
}
