/** Bildauswahl Public JSON-API (Kunden-Magic-Link, kein Auth). */

const BASE = "/api/bildauswahl";

export type BildauswahlPublicImage = {
  id: string;
  category: string | null;
  file_name: string | null;
  sort_order: number;
};

export type BildauswahlPublicPayload = {
  id: string;
  slug: string;
  title: string;
  address: string | null;
  client_name: string | null;
  updated_at: string;
  watermark_enabled: boolean;
  picdrop_selection_json: string | null;
  images: BildauswahlPublicImage[];
};

async function publicFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getPublicBildauswahlBySlug(
  slug: string,
): Promise<BildauswahlPublicPayload | null> {
  try {
    const data = await publicFetch<BildauswahlPublicPayload & { ok: boolean }>(
      `/${encodeURIComponent(slug)}`,
    );
    return data;
  } catch {
    return null;
  }
}

/**
 * Resized thumbnail (server-side sharp + Disk-Cache + Cloudflare Edge-Cache).
 *
 * Default: 600px WebP — der Grid-Anwendungsfall. WebP ist ~30-40% kleiner
 * als JPEG bei vergleichbarer visueller Qualitaet, 600px entspricht ~350px
 * CSS-Breite auf Retina-Displays. Fuer die Lightbox erhoeht der Aufrufer
 * auf 1200 oder 1680. Browser-Support fuer WebP liegt bei >97%.
 *
 * Format-Parameter ist optional und wird als `fmt=webp` an die API uebergeben;
 * der Cache-Key auf VPS und Cloudflare bleibt damit pro Variante stabil.
 */
export type BildauswahlImageFormat = "webp" | "jpg";
export function bildauswahlImageUrl(
  slug: string,
  imageId: string,
  width: 400 | 600 | 800 | 1200 | 1680 = 600,
  format: BildauswahlImageFormat = "webp",
): string {
  return `${BASE}/${encodeURIComponent(slug)}/images/${imageId}?w=${width}&fmt=${format}`;
}

export function recordBildauswahlViewed(slug: string) {
  return publicFetch<{ ok: boolean }>(`/${encodeURIComponent(slug)}/viewed`, { method: "POST" });
}

export function saveBildauswahlDraft(slug: string, picdrop_selection_json: string | null) {
  return publicFetch<{ ok: boolean }>(`/${encodeURIComponent(slug)}/draft`, {
    method: "POST",
    body: JSON.stringify({ picdrop_selection_json }),
  });
}

export type ClientSelectionItem = {
  asset_key: string;
  asset_label: string;
  flags: readonly ("bearbeiten" | "staging" | "retusche")[];
  messageLines: readonly string[];
};

export function submitBildauswahlSelection(slug: string, items: readonly ClientSelectionItem[]) {
  return publicFetch<{ ok: boolean }>(`/${encodeURIComponent(slug)}/selection`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}
