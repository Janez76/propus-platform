/** Bildauswahl Admin JSON-API (Session-Cookie, gleiche Origin). */

const BASE = "/api/tours/admin/bildauswahl";

export type BildauswahlRow = {
  id: string;
  slug: string;
  friendly_slug: string | null;
  title: string;
  address: string | null;
  client_name: string | null;
  client_email: string | null;
  client_contact: string | null;
  client_delivery_status: "open" | "sent";
  client_delivery_sent_at: string | null;
  client_log_email_received_at: string | null;
  client_log_gallery_opened_at: string | null;
  client_log_selection_sent_at: string | null;
  status: "active" | "inactive";
  cloud_share_url: string | null;
  watermark_enabled: boolean;
  picdrop_selection_json: string | null;
  customer_id: number | null;
  customer_contact_id: number | null;
  booking_order_no: number | null;
  storage_source_type: string | null;
  storage_root_kind: string | null;
  storage_relative_path: string | null;
  created_at: string;
  updated_at: string;
};

export type BildauswahlListRow = BildauswahlRow & {
  image_count: number;
  feedback_count: number;
};

export type BildauswahlImage = {
  id: string;
  gallery_id: string;
  sort_order: number;
  enabled: boolean;
  category: string | null;
  file_name: string | null;
  remote_src: string | null;
  source_type: string | null;
  source_root_kind: string | null;
  source_path: string | null;
  created_at: string;
};

export type BildauswahlFeedbackRow = {
  id: string;
  gallery_id: string;
  gallery_slug: string;
  asset_key: string;
  asset_label: string;
  body: string;
  author: "client" | "office";
  selection_flags_json: string | null;
  revision: number;
  resolved_at: string | null;
  created_at: string;
};

export type BildauswahlNasEntry = { name: string; relativePath: string };
export type BildauswahlNasContext = {
  ok: true;
  rootKind: "customer" | "raw";
  rootPath: string;
  currentRelativePath: string;
  parentRelativePath: string | null;
  entries: BildauswahlNasEntry[];
  mediaSummary: { images: number; floorPlans: number; hasVideo: boolean };
  orderGuess: number | null;
};

async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
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

// ─── Galleries ──────────────────────────────────────────────────────────────

export async function listBildauswahl(params?: { search?: string; filter?: string; sort?: string }) {
  const sp = new URLSearchParams();
  if (params?.search) sp.set("search", params.search);
  if (params?.filter) sp.set("filter", params.filter);
  if (params?.sort) sp.set("sort", params.sort);
  const q = sp.toString();
  const data = await adminFetch<{ ok: boolean; rows: BildauswahlListRow[] }>(q ? `/?${q}` : "/");
  return data.rows;
}

export async function getBildauswahl(id: string) {
  return adminFetch<{ ok: boolean; gallery: BildauswahlRow; images: BildauswahlImage[] }>(
    `/${encodeURIComponent(id)}`,
  );
}

export async function createBildauswahl(data?: Partial<BildauswahlRow>) {
  const r = await adminFetch<{ ok: boolean; gallery: BildauswahlRow }>("/", {
    method: "POST",
    body: JSON.stringify(data ?? {}),
  });
  return r.gallery;
}

export async function updateBildauswahl(id: string, patch: Partial<BildauswahlRow>) {
  const r = await adminFetch<{ ok: boolean; gallery: BildauswahlRow }>(`/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return r.gallery;
}

export async function deleteBildauswahl(id: string) {
  await adminFetch<{ ok: boolean }>(`/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ─── Images ─────────────────────────────────────────────────────────────────

export async function listBildauswahlImages(galleryId: string) {
  const r = await adminFetch<{ ok: boolean; rows: BildauswahlImage[] }>(
    `/${encodeURIComponent(galleryId)}/images`,
  );
  return r.rows;
}

export function adminBildauswahlThumbUrl(galleryId: string, imageId: string, width = 400): string {
  return `${BASE}/${encodeURIComponent(galleryId)}/images/${encodeURIComponent(imageId)}/thumb?w=${width}`;
}

// ─── NAS ────────────────────────────────────────────────────────────────────

export function browseBildauswahlNas(rootKind: "customer" | "raw", relativePath = "") {
  const sp = new URLSearchParams({ rootKind, relativePath });
  return adminFetch<BildauswahlNasContext>(`/nas/browse?${sp.toString()}`);
}

export async function importBildauswahlFromNas(
  galleryId: string,
  source: {
    rootKind: "customer" | "raw";
    relativePath: string;
    storageSourceType?: "nas_browser" | "order_folder";
  },
) {
  return adminFetch<{ ok: boolean; added: number }>(
    `/${encodeURIComponent(galleryId)}/import-nas`,
    { method: "POST", body: JSON.stringify(source) },
  );
}

// ─── Feedback ───────────────────────────────────────────────────────────────

export async function listBildauswahlFeedback(galleryId: string) {
  const r = await adminFetch<{ ok: boolean; rows: BildauswahlFeedbackRow[] }>(
    `/${encodeURIComponent(galleryId)}/feedback`,
  );
  return r.rows;
}

export async function setBildauswahlFeedbackResolved(feedbackId: string, resolved: boolean) {
  await adminFetch<{ ok: boolean }>(`/feedback/${encodeURIComponent(feedbackId)}`, {
    method: "PATCH",
    body: JSON.stringify({ resolved }),
  });
}

// ─── E-Mail-Vorlagen ────────────────────────────────────────────────────────

export type BildauswahlEmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export async function listBildauswahlEmailTemplates() {
  const r = await adminFetch<{ ok: boolean; rows: BildauswahlEmailTemplate[] }>("/email-templates");
  return r.rows;
}

export async function saveBildauswahlEmailTemplate(id: string, subject: string, body: string) {
  await adminFetch<{ ok: boolean }>(`/email-templates/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ subject, body }),
  });
}

export async function markBildauswahlEmailSent(galleryId: string) {
  await adminFetch<{ ok: boolean }>(`/${encodeURIComponent(galleryId)}/mark-email-sent`, {
    method: "POST",
  });
}
