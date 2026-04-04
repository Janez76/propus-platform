/**
 * Listing/Galerie Public JSON-API (kein Auth).
 */
import type { GalleryFeedbackRow, PublicGalleryPayload } from "../components/listing/types";

const BASE = "/api/listing";

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

export async function getPublicGalleryBySlug(slug: string): Promise<PublicGalleryPayload | null> {
  try {
    const data = await publicFetch<PublicGalleryPayload & { ok: boolean }>(`/${encodeURIComponent(slug)}`);
    return data;
  } catch {
    return null;
  }
}

export function imageUrl(slug: string, imageId: string): string {
  return `${BASE}/${encodeURIComponent(slug)}/images/${imageId}`;
}

export function recordViewed(slug: string) {
  return publicFetch<{ ok: boolean }>(`/${encodeURIComponent(slug)}/viewed`, { method: "POST" });
}

export function recordDownloaded(slug: string) {
  return publicFetch<{ ok: boolean }>(`/${encodeURIComponent(slug)}/downloaded`, { method: "POST" });
}

export async function submitFeedback(input: {
  galleryId: string;
  gallerySlug: string;
  asset_type: "image" | "floor_plan";
  asset_key: string;
  asset_label: string;
  body: string;
}): Promise<void> {
  await publicFetch<{ ok: boolean }>(`/${encodeURIComponent(input.gallerySlug)}/feedback`, {
    method: "POST",
    body: JSON.stringify({
      asset_type: input.asset_type,
      asset_key: input.asset_key,
      asset_label: input.asset_label,
      body: input.body,
    }),
  });
}

export async function listFeedbackForAsset(
  galleryId: string,
  gallerySlug: string,
  filter: { asset_type: "image" | "floor_plan"; asset_key: string },
): Promise<GalleryFeedbackRow[]> {
  const sp = new URLSearchParams();
  sp.set("asset_type", filter.asset_type);
  sp.set("asset_key", filter.asset_key);
  const data = await publicFetch<{ ok: boolean; rows: GalleryFeedbackRow[] }>(
    `/${encodeURIComponent(gallerySlug)}/feedback?${sp.toString()}`,
  );
  return data.rows;
}
