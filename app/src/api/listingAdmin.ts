/**
 * Listing/Galerie Admin JSON-API (Session-Cookie, gleiche Origin).
 */
import type {
  ClientGalleryRow,
  EmailTemplateRow,
  GalleryFeedbackRow,
  GalleryImageRow,
  GalleryListRow,
} from "../components/listing/types";

const BASE = "/api/tours/admin/galleries";

async function galleryFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Galleries
// ---------------------------------------------------------------------------

export function listGalleries(params?: { search?: string; filter?: string; sort?: string }) {
  const sp = new URLSearchParams();
  if (params?.search) sp.set("search", params.search);
  if (params?.filter) sp.set("filter", params.filter);
  if (params?.sort) sp.set("sort", params.sort);
  const q = sp.toString();
  return galleryFetch<{ ok: boolean; rows: GalleryListRow[] }>(q ? `?${q}` : "");
}

export function getGallery(id: string) {
  return galleryFetch<{
    ok: boolean;
    gallery: ClientGalleryRow;
    images: GalleryImageRow[];
    feedback: GalleryFeedbackRow[];
  }>(`/${id}`);
}

export function createGallery(data?: Partial<ClientGalleryRow>) {
  return galleryFetch<{ ok: boolean; gallery: ClientGalleryRow }>("", {
    method: "POST",
    body: JSON.stringify(data ?? {}),
  });
}

export function updateGallery(id: string, patch: Partial<ClientGalleryRow>) {
  return galleryFetch<{ ok: boolean; gallery: ClientGalleryRow }>(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteGallery(id: string) {
  return galleryFetch<{ ok: boolean }>(`/${id}`, { method: "DELETE" });
}

export function duplicateGallery(id: string) {
  return galleryFetch<{ ok: boolean; gallery: ClientGalleryRow }>(`/${id}/duplicate`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export function addGalleryImage(galleryId: string, data: Partial<GalleryImageRow>) {
  return galleryFetch<{ ok: boolean; image: GalleryImageRow }>(`/${galleryId}/images`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateImage(galleryId: string, imageId: string, patch: Partial<GalleryImageRow>) {
  return galleryFetch<{ ok: boolean; image: GalleryImageRow }>(`/${galleryId}/images/${imageId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteImage(galleryId: string, imageId: string) {
  return galleryFetch<{ ok: boolean }>(`/${galleryId}/images/${imageId}`, { method: "DELETE" });
}

export function reorderImages(galleryId: string, orderedIds: string[]) {
  return galleryFetch<{ ok: boolean }>(`/${galleryId}/images/order`, {
    method: "PUT",
    body: JSON.stringify({ orderedIds }),
  });
}

export function importImagesFromShare(galleryId: string, urls: Array<{ url: string }>) {
  return galleryFetch<{ ok: boolean; added: number }>(`/${galleryId}/import-share`, {
    method: "POST",
    body: JSON.stringify({ urls }),
  });
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function submitOfficeFeedback(
  galleryId: string,
  data: { asset_type: string; asset_key: string; asset_label: string; body: string },
) {
  return galleryFetch<{ ok: boolean; feedback: GalleryFeedbackRow }>(`/${galleryId}/feedback`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function setFeedbackResolved(galleryId: string, feedbackId: string, resolved: boolean) {
  return galleryFetch<{ ok: boolean; feedback: GalleryFeedbackRow }>(
    `/${galleryId}/feedback/${feedbackId}`,
    { method: "PATCH", body: JSON.stringify({ resolved }) },
  );
}

export function deleteFeedback(galleryId: string, feedbackId: string) {
  return galleryFetch<{ ok: boolean }>(`/${galleryId}/feedback/${feedbackId}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Email Templates
// ---------------------------------------------------------------------------

export function listEmailTemplates() {
  return galleryFetch<{ ok: boolean; rows: EmailTemplateRow[] }>("/email-templates");
}

export function saveEmailTemplate(id: string, subject: string, body: string) {
  return galleryFetch<{ ok: boolean; template: EmailTemplateRow }>(`/email-templates/${id}`, {
    method: "PUT",
    body: JSON.stringify({ subject, body }),
  });
}

// ---------------------------------------------------------------------------
// Record sent
// ---------------------------------------------------------------------------

export function recordEmailSent(galleryId: string) {
  return galleryFetch<{ ok: boolean; gallery: ClientGalleryRow }>(`/${galleryId}/record-sent`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Helpers (client-side, kept from original)
// ---------------------------------------------------------------------------

export function publicGalleryUrl(slug: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/listing/${encodeURIComponent(slug)}`;
}

export function publicGalleryDeepLink(
  slug: string,
  opts: { bild?: string | null; grundriss?: number | null },
): string {
  const base = publicGalleryUrl(slug);
  const sp = new URLSearchParams();
  if (opts.bild?.trim()) sp.set("bild", opts.bild.trim());
  if (opts.grundriss != null && Number.isFinite(opts.grundriss) && opts.grundriss >= 0) {
    sp.set("grundriss", String(Math.floor(opts.grundriss)));
  }
  const q = sp.toString();
  return q ? `${base}?${q}` : base;
}

export function displayNameForGalleryImage(img: GalleryImageRow): string {
  const fn = img.file_name?.trim();
  if (fn) return fn;
  if (img.remote_src) {
    try {
      const u = new URL(img.remote_src);
      const seg = u.pathname.split("/").filter(Boolean).pop();
      if (seg) return decodeURIComponent(seg);
    } catch { /* ignore */ }
  }
  return `Bild-${img.id.slice(0, 8)}`;
}

export const LISTING_EMAIL_TEMPLATE_ID = "propus-listing-email-v1";
export const EMAIL_TEMPLATE_FOLLOWUP_ID = "propus-email-followup-v1";
export const EMAIL_TEMPLATE_REVISION_DONE_ID = "propus-email-revision-done-v1";

export function htmlEmailToPlainText(html: string): string {
  if (typeof document === "undefined") {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  const el = document.createElement("div");
  el.innerHTML = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n");
  return (el.textContent || "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export type EmailTemplateVars = {
  gallery_link: string;
  title: string;
  customer_name: string;
  address?: string;
  feedback_body?: string;
  customer_comment?: string;
  asset_label?: string;
  direct_link?: string;
  revision?: string;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function applyTemplateVars(text: string, vars: EmailTemplateVars): string {
  const name = vars.customer_name.trim();
  const nameEsc = escapeHtml(name);
  const customer_name_line = name ? ` ${nameEsc}` : "";
  const fb = escapeHtml(vars.feedback_body ?? "");
  const cc = escapeHtml(vars.customer_comment ?? "");
  const al = escapeHtml(vars.asset_label ?? "");
  const rev = escapeHtml(vars.revision ?? "");
  const direct = (vars.direct_link ?? vars.gallery_link).trim();
  const addr = escapeHtml(vars.address ?? "");
  return text
    .replaceAll("{{gallery_link}}", vars.gallery_link)
    .replaceAll("{{title}}", escapeHtml(vars.title))
    .replaceAll("{{customer_name}}", nameEsc)
    .replaceAll("{{customer_name_line}}", customer_name_line)
    .replaceAll("{{address}}", addr)
    .replaceAll("{{feedback_body}}", fb)
    .replaceAll("{{customer_comment}}", cc)
    .replaceAll("{{asset_label}}", al)
    .replaceAll("{{direct_link}}", direct)
    .replaceAll("{{revision}}", rev);
}
