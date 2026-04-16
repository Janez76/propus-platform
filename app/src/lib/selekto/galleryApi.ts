import { customAlphabet } from "nanoid";
import { manifestToGalleryItems } from "../../components/selekto/demo/demoTypes";
import { fetchManifestFromUrl } from "../../components/selekto/demo/fetchManifest";
import {
  listMediaFromNextcloudPublicShare,
  nextcloudThumbUrlCandidates,
  parseNextcloudPublicShareUrl,
} from "../../components/selekto/demo/nextcloudShare";
import { randomUUID } from "./randomId";
import { pathClientSelekto as pathClientGallery } from "./paths";
import {
  EMAIL_TEMPLATE_FOLLOWUP_ID,
  EMAIL_TEMPLATE_REVISION_DONE_ID,
  ensureGalleryLocalDb,
  FOLLOWUP_EMAIL_DEFAULT_SUBJECT,
  galleryLocalDb,
  getDefaultFollowupEmailBodyHtml,
  getDefaultListingEmailBodyHtml,
  getDefaultPicdropAdminNotifyBodyHtml,
  getDefaultRevisionDoneEmailBodyHtml,
  KNOWN_EMAIL_TEMPLATE_IDS,
  LISTING_EMAIL_DEFAULT_SUBJECT,
  LISTING_EMAIL_TEMPLATE_ID,
  PICDROP_ADMIN_NOTIFY_DEFAULT_SUBJECT,
  PICDROP_ADMIN_NOTIFY_EMAIL_TEMPLATE_ID,
  REVISION_DONE_EMAIL_DEFAULT_SUBJECT,
} from "./localDb";
import type {
  ClientGalleryRow,
  EmailTemplateRow,
  GalleryFeedbackRow,
  GalleryImageRow,
  PublicGalleryPayload,
} from "./types";

const slugNano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 22);

function lastPathSegmentDecoded(pathOrFile: string): string {
  const dec = (() => {
    try {
      return decodeURIComponent(pathOrFile.trim());
    } catch {
      return pathOrFile.trim();
    }
  })();
  const parts = dec.replace(/\/+$/, "").split("/").filter(Boolean);
  return parts.pop() ?? "";
}

/**
 * Dateiname aus URL (Freigabe-Links: oft `…/s/…/download?files=…` — nicht den Pfadteil «download» zeigen).
 */
function fileNameFromUrl(url: string): string {
  const tryDecodeSeg = (seg: string) => {
    try {
      return decodeURIComponent(seg);
    } catch {
      return seg;
    }
  };

  try {
    const u = new URL(url);
    const filesQ = u.searchParams.get("files")?.trim();
    if (filesQ) {
      const leaf = lastPathSegmentDecoded(filesQ);
      if (leaf && !/^download$/i.test(leaf)) return leaf;
    }
    const pathQ = u.searchParams.get("path")?.trim();
    if (pathQ) {
      const leaf = lastPathSegmentDecoded(pathQ);
      if (leaf && !/^download$/i.test(leaf)) return leaf;
    }

    const pRaw = u.pathname.replace(/\/+$/, "");
    const isNcBareShareDownload =
      /\/s\/[A-Za-z0-9]+\/download$/i.test(pRaw) || /\/index\.php\/s\/[A-Za-z0-9]+\/download$/i.test(pRaw);
    if (isNcBareShareDownload && !filesQ && !pathQ) {
      return "";
    }

    const segs = u.pathname.split("/").filter(Boolean);
    let i = segs.length - 1;
    while (i >= 0 && /^(download|index\.php)$/i.test(segs[i] ?? "")) {
      i -= 1;
    }
    if (i < 0) return "";
    const seg = segs[i]!;
    const out = tryDecodeSeg(seg);
    if (!out || /^download$/i.test(out)) return "";
    return out;
  } catch {
    const q = url.split("?")[0] ?? url;
    const i = q.lastIndexOf("/");
    const seg = i >= 0 ? q.slice(i + 1) : q;
    try {
      const d = decodeURIComponent(seg) || seg;
      return /^download$/i.test(d) ? "" : d || "";
    } catch {
      return /^download$/i.test(seg) ? "" : seg || "";
    }
  }
}

/** Anzeige-Dateiname im Backpanel (gespeichert oder aus URL / Fallback). */
export function displayNameForGalleryImage(img: GalleryImageRow): string {
  const fn = img.file_name?.trim();
  if (fn) return fn;
  if (img.remote_src) {
    const fromUrl = fileNameFromUrl(img.remote_src).trim();
    if (fromUrl) return fromUrl;
  }
  return `Bild-${img.id.slice(0, 8)}`;
}

/** object URLs für Bilder (IndexedDB-Blobs); bei Löschen widerrufen */
const blobUrlCache = new Map<string, string>();

export function newGallerySlug(): string {
  return slugNano();
}

export function publicGalleryUrl(slug: string): string {
  const base =
    (process.env.NEXT_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}${pathClientGallery(slug)}`;
}

/** Deep-Link: öffnet die Kunden-Bildauswahl direkt mit einem Bild (?bild=…). */
export function publicGalleryDeepLink(slug: string, opts: { bild?: string | null }): string {
  const base = publicGalleryUrl(slug);
  const sp = new URLSearchParams();
  const b = opts.bild?.trim();
  if (b) sp.set("bild", b);
  const q = sp.toString();
  return q ? `${base}?${q}` : base;
}

export {
  EMAIL_TEMPLATE_FOLLOWUP_ID,
  EMAIL_TEMPLATE_REVISION_DONE_ID,
  LISTING_EMAIL_TEMPLATE_ID,
  PICDROP_ADMIN_NOTIFY_EMAIL_TEMPLATE_ID,
};

/**
 * Öffentliche Bild-URLs (Nextcloud: mehrere Kandidaten, weil Server `path`/`files` unterschiedlich erwarten).
 * `shareUrlOverride`: wenn gesetzt (auch `null`), wird keine Galerie aus der DB gelesen.
 */
export async function getThumbSourcesForImage(
  imageId: string,
  shareUrlOverride?: string | null,
): Promise<string[]> {
  await ensureGalleryLocalDb();
  const row = await galleryLocalDb.gallery_images.get(imageId);
  if (!row) return [];
  const remote = row.remote_src?.trim();
  if (remote) {
    let shareUrl: string | null;
    if (shareUrlOverride !== undefined) {
      shareUrl = shareUrlOverride?.trim() || null;
    } else {
      const g = await galleryLocalDb.galleries.get(row.gallery_id);
      shareUrl = g?.cloud_share_url?.trim() || null;
    }
    return nextcloudThumbUrlCandidates(shareUrl, remote);
  }
  const hit = blobUrlCache.get(imageId);
  if (hit) return [hit];
  if (!row.blob || row.blob.size === 0) return [];
  const url = URL.createObjectURL(row.blob);
  blobUrlCache.set(imageId, url);
  return [url];
}

export async function getBlobUrlForImage(imageId: string): Promise<string> {
  const xs = await getThumbSourcesForImage(imageId);
  return xs[0] ?? "";
}

export function revokeBlobUrlForImage(imageId: string): void {
  const u = blobUrlCache.get(imageId);
  if (u?.startsWith("blob:")) {
    URL.revokeObjectURL(u);
  }
  blobUrlCache.delete(imageId);
}

export async function getPublicGalleryBySlug(slug: string): Promise<PublicGalleryPayload | null> {
  await ensureGalleryLocalDb();
  const g = await galleryLocalDb.galleries.where("slug").equals(slug).first();
  if (!g || g.status !== "active") return null;
  const imgs = await galleryLocalDb.gallery_images.where("gallery_id").equals(g.id).toArray();
  imgs.sort((a, b) =>
    a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.created_at.localeCompare(b.created_at),
  );
  const enabled = imgs.filter((i) => i.enabled);
  return {
    id: g.id,
    title: g.title,
    address: g.address ?? null,
    client_name: g.client_name,
    updated_at: g.updated_at,
    cloud_share_url: g.cloud_share_url ?? null,
    matterport_src: "",
    video_url: "",
    floor_plans: [],
    images: enabled.map((i) => ({
      id: i.id,
      category: i.category,
      sort_order: i.sort_order,
    })),
    picdrop_selection_json: g.picdrop_selection_json ?? null,
    watermark_enabled: g.watermark_enabled !== false,
  };
}

export type GalleryListRow = ClientGalleryRow & {
  image_count: number;
  /** Bilder mit Picdrop-Flaggen und/oder Kommentar im gespeicherten Entwurf */
  picdrop_selected_count: number;
};

/** Zählt Einträge in `picdrop_selection_json` (kompakt `{ id: { f, m } }`). */
function countPicdropDraftSelections(json: string | null | undefined): number {
  const raw = json?.trim();
  if (!raw) return 0;
  try {
    const o = JSON.parse(raw) as Record<string, { f?: unknown; m?: unknown }>;
    if (!o || typeof o !== "object") return 0;
    let n = 0;
    for (const v of Object.values(o)) {
      const nf = Array.isArray(v?.f) ? v.f.length : 0;
      const nm = Array.isArray(v?.m) ? v.m.length : 0;
      if (nf > 0 || nm > 0) n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}

function countOpenFeedbackForGallery(galleryId: string): Promise<number> {
  return galleryLocalDb.gallery_feedback
    .where("gallery_id")
    .equals(galleryId)
    .filter((r) => {
      if (r.resolved_at != null) return false;
      const auth = r.author ?? "client";
      return auth !== "office";
    })
    .count();
}

export async function listGalleries(): Promise<GalleryListRow[]> {
  await ensureGalleryLocalDb();
  const all = await galleryLocalDb.galleries.orderBy("updated_at").reverse().toArray();
  const withCounts = await Promise.all(
    all.map(async (row) => {
      const n = await galleryLocalDb.gallery_images.where("gallery_id").equals(row.id).count();
      const picdrop_selected_count = countPicdropDraftSelections(row.picdrop_selection_json);
      return { ...toClientGalleryRow(row), image_count: n, picdrop_selected_count };
    }),
  );
  return withCounts;
}

/** Anzahl noch offener (nicht behobener) Kommentare pro Galerie. */
export async function countGalleryFeedback(galleryId: string): Promise<number> {
  await ensureGalleryLocalDb();
  return countOpenFeedbackForGallery(galleryId);
}

export async function listGalleryFeedback(galleryId: string): Promise<GalleryFeedbackRow[]> {
  await ensureGalleryLocalDb();
  const rows = await galleryLocalDb.gallery_feedback.where("gallery_id").equals(galleryId).toArray();
  rows.sort((a, b) => a.revision - b.revision);
  return rows.map((r) => ({
    id: r.id,
    gallery_id: r.gallery_id,
    gallery_slug: r.gallery_slug,
    asset_type: r.asset_type,
    asset_key: r.asset_key,
    asset_label: r.asset_label,
    selection_flags_json: r.selection_flags_json ?? null,
    body: r.body,
    created_at: r.created_at,
    revision: r.revision,
    resolved_at: r.resolved_at ?? null,
    author: r.author ?? "client",
  }));
}

/** Kunden-UI: nur Einträge zu genau diesem Bild, chronologisch (älteste zuerst). */
export async function listGalleryFeedbackForAsset(
  galleryId: string,
  filter: { asset_type: "image" | "floor_plan"; asset_key: string },
): Promise<GalleryFeedbackRow[]> {
  await ensureGalleryLocalDb();
  const rows = await galleryLocalDb.gallery_feedback.where("gallery_id").equals(galleryId).toArray();
  const filtered = rows.filter(
    (r) => r.asset_type === filter.asset_type && r.asset_key === filter.asset_key,
  );
  filtered.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return filtered.map((r) => ({
    id: r.id,
    gallery_id: r.gallery_id,
    gallery_slug: r.gallery_slug,
    asset_type: r.asset_type,
    asset_key: r.asset_key,
    asset_label: r.asset_label,
    selection_flags_json: r.selection_flags_json ?? null,
    body: r.body,
    created_at: r.created_at,
    revision: r.revision,
    resolved_at: r.resolved_at ?? null,
    author: r.author ?? "client",
  }));
}

/** Backpanel: Kommentar als erledigt markieren (oder wieder öffnen). */
export async function setGalleryFeedbackResolved(feedbackId: string, resolved: boolean): Promise<void> {
  await ensureGalleryLocalDb();
  const row = await galleryLocalDb.gallery_feedback.get(feedbackId);
  if (!row) throw new Error("Kommentar nicht gefunden.");
  await galleryLocalDb.gallery_feedback.update(feedbackId, {
    resolved_at: resolved ? new Date().toISOString() : null,
  });
}

/** Backpanel: Kundenkommentar endgültig löschen. */
export async function deleteGalleryFeedback(feedbackId: string): Promise<void> {
  await ensureGalleryLocalDb();
  const row = await galleryLocalDb.gallery_feedback.get(feedbackId);
  if (!row) throw new Error("Kommentar nicht gefunden.");
  await galleryLocalDb.gallery_feedback.delete(feedbackId);
}

/** Kunden-Seite: Kommentar zu einem Bild (Revision = fortlaufend pro Listing). */
export async function submitGalleryAssetFeedback(input: {
  galleryId: string;
  gallerySlug: string;
  asset_type: "image" | "floor_plan";
  asset_key: string;
  asset_label: string;
  body: string;
}): Promise<void> {
  await ensureGalleryLocalDb();
  const g = await galleryLocalDb.galleries.get(input.galleryId);
  if (!g || g.slug !== input.gallerySlug) {
    throw new Error("Galerie unbekannt oder Link ungültig.");
  }
  if (g.status !== "active") {
    throw new Error("Diese Galerie ist nicht mehr aktiv.");
  }
  const text = input.body.trim();
  if (!text) throw new Error("Bitte einen Kommentar eingeben.");
  if (text.length > 4000) throw new Error("Kommentar ist zu lang (max. 4000 Zeichen).");
  const n = await galleryLocalDb.gallery_feedback.where("gallery_id").equals(input.galleryId).count();
  const revision = n + 1;
  const now = new Date().toISOString();
  await galleryLocalDb.gallery_feedback.add({
    id: randomUUID(),
    gallery_id: input.galleryId,
    gallery_slug: input.gallerySlug,
    asset_type: input.asset_type,
    asset_key: input.asset_key,
    asset_label: input.asset_label.trim() || "Medium",
    body: text,
    created_at: now,
    revision,
    resolved_at: null,
    author: "client",
    selection_flags_json: null,
  });
}

export type PicdropSelectionFlag = "bearbeiten" | "staging" | "retusche";

/** Picdrop-Kunde: je markiertem Bild einen Eintrag (Flaggen + zusammengeführte Chatzeilen als Kommentar). */
export async function submitPicdropGallerySelections(input: {
  galleryId: string;
  gallerySlug: string;
  items: Array<{
    asset_key: string;
    asset_label: string;
    flags: readonly PicdropSelectionFlag[];
    messageLines: readonly string[];
  }>;
}): Promise<void> {
  await ensureGalleryLocalDb();
  const g = await galleryLocalDb.galleries.get(input.galleryId);
  const slug = input.gallerySlug.trim();
  if (!g || g.slug !== slug) {
    throw new Error("Galerie unbekannt oder Link ungültig.");
  }
  if (g.status !== "active") {
    throw new Error("Diese Galerie ist nicht mehr aktiv.");
  }
  const filtered = input.items.filter(
    (it) => it.flags.length > 0 || it.messageLines.some((l) => l.trim()),
  );
  if (filtered.length === 0) {
    throw new Error("Nichts zu senden.");
  }
  const now = new Date().toISOString();
  for (const item of filtered) {
    const body = item.messageLines.map((l) => l.trim()).filter(Boolean).join("\n").trim();
    const hasFlags = item.flags.length > 0;
    if (!hasFlags && !body) continue;
    if (body.length > 4000) {
      throw new Error("Kommentar ist zu lang (max. 4000 Zeichen).");
    }
    const n = await galleryLocalDb.gallery_feedback.where("gallery_id").equals(input.galleryId).count();
    const revision = n + 1;
    await galleryLocalDb.gallery_feedback.add({
      id: randomUUID(),
      gallery_id: input.galleryId,
      gallery_slug: slug,
      asset_type: "image",
      asset_key: item.asset_key,
      asset_label: item.asset_label.trim() || "Bild",
      body: body || "",
      created_at: now,
      revision,
      resolved_at: null,
      author: "client",
      selection_flags_json: hasFlags ? JSON.stringify([...item.flags]) : null,
    });
  }
  await recordGalleryClientSelectionConfirmed(input.galleryId);
}

const PICDROP_FLAG_KEYS = new Set(["bearbeiten", "staging", "retusche"]);

/** Picdrop: Auswahl lokal in der Galerie-Zeile zwischenspeichern (debounced vom Client). */
export async function savePicdropSelectionDraft(
  galleryId: string,
  byId: Record<string, { flags: readonly string[]; msgs: readonly { text: string; time: string }[] }>,
): Promise<void> {
  await ensureGalleryLocalDb();
  const g = await galleryLocalDb.galleries.get(galleryId);
  if (!g || g.status !== "active") return;
  const slim: Record<string, { f: string[]; m: Array<{ t: string; h: string }> }> = {};
  for (const [k, s] of Object.entries(byId)) {
    const f = s.flags.filter((x): x is "bearbeiten" | "staging" | "retusche" => PICDROP_FLAG_KEYS.has(x));
    const m = s.msgs.map((x) => ({ t: x.text.slice(0, 4000), h: x.time }));
    if (f.length === 0 && m.length === 0) continue;
    slim[k] = { f, m };
  }
  const json = Object.keys(slim).length === 0 ? null : JSON.stringify(slim);
  await galleryLocalDb.galleries.update(galleryId, {
    picdrop_selection_json: json,
    updated_at: new Date().toISOString(),
  });
}

export async function clearPicdropSelectionDraft(galleryId: string): Promise<void> {
  await ensureGalleryLocalDb();
  await galleryLocalDb.galleries.update(galleryId, {
    picdrop_selection_json: null,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Backpanel: Rückfrage an den Kunden – erscheint im Kommentarverlauf am selben Bild
 * (ohne erneute Slug-Prüfung wie bei der Kunden-UI).
 */
export async function submitOfficeFollowupComment(input: {
  galleryId: string;
  gallerySlug: string;
  asset_type: "image" | "floor_plan";
  asset_key: string;
  asset_label: string;
  body: string;
}): Promise<void> {
  await ensureGalleryLocalDb();
  const g = await galleryLocalDb.galleries.get(input.galleryId);
  if (!g) throw new Error("Galerie nicht gefunden.");
  const text = input.body.trim();
  if (!text) throw new Error("Bitte eine Rückfrage eingeben.");
  if (text.length > 4000) throw new Error("Text ist zu lang (max. 4000 Zeichen).");
  const n = await galleryLocalDb.gallery_feedback.where("gallery_id").equals(input.galleryId).count();
  const revision = n + 1;
  const now = new Date().toISOString();
  await galleryLocalDb.gallery_feedback.add({
    id: randomUUID(),
    gallery_id: input.galleryId,
    gallery_slug: input.gallerySlug.trim() || g.slug,
    asset_type: input.asset_type,
    asset_key: input.asset_key,
    asset_label: input.asset_label.trim() || "Medium",
    body: text,
    created_at: now,
    revision,
    resolved_at: null,
    author: "office",
    selection_flags_json: null,
  });
}

function toClientGalleryRow(g: import("./localDb.ts").LocalGallery): ClientGalleryRow {
  return {
    id: g.id,
    slug: g.slug,
    title: g.title,
    address: g.address ?? null,
    client_name: g.client_name,
    client_email: g.client_email,
    client_delivery_status: g.client_delivery_status ?? "open",
    client_delivery_sent_at: g.client_delivery_sent_at ?? null,
    client_log_email_received_at: g.client_log_email_received_at ?? null,
    client_log_gallery_opened_at: g.client_log_gallery_opened_at ?? null,
    client_log_files_downloaded_at: g.client_log_files_downloaded_at ?? null,
    status: g.status,
    matterport_input: g.matterport_input ?? null,
    cloud_share_url: g.cloud_share_url ?? null,
    picdrop_selection_json: g.picdrop_selection_json ?? null,
    watermark_enabled: g.watermark_enabled !== false,
    created_at: g.created_at,
    updated_at: g.updated_at,
  };
}

function toGalleryImageRow(i: import("./localDb.ts").LocalGalleryImage): GalleryImageRow {
  return {
    id: i.id,
    gallery_id: i.gallery_id,
    storage_path: i.id,
    sort_order: i.sort_order,
    enabled: i.enabled,
    category: i.category,
    created_at: i.created_at,
    file_name: i.file_name?.trim() || null,
    remote_src: i.remote_src?.trim() || null,
  };
}

export async function getGallery(id: string): Promise<ClientGalleryRow | null> {
  await ensureGalleryLocalDb();
  const g = await galleryLocalDb.galleries.get(id);
  return g ? toClientGalleryRow(g) : null;
}

/** Verhindert doppelte Entwürfe bei React StrictMode (useEffect 2×) oder Doppelklick. */
let createGalleryDraftInFlight: Promise<ClientGalleryRow> | null = null;

async function performCreateGalleryDraft(): Promise<ClientGalleryRow> {
  await ensureGalleryLocalDb();
  const now = new Date().toISOString();
  const id = randomUUID();
  const slug = newGallerySlug();
  const row = {
    id,
    slug,
    title: "Neue Auswahl",
    address: null,
    client_name: null,
    client_email: null,
    client_delivery_status: "open" as const,
    client_delivery_sent_at: null,
    client_log_email_received_at: null,
    client_log_gallery_opened_at: null,
    client_log_files_downloaded_at: null,
    status: "active" as const,
    matterport_input: null,
    cloud_share_url: null,
    video_url: null,
    floor_plans_json: null,
    picdrop_selection_json: null,
    watermark_enabled: true,
    created_at: now,
    updated_at: now,
  };
  await galleryLocalDb.galleries.add(row);
  return toClientGalleryRow(row);
}

export async function createGalleryDraft(): Promise<ClientGalleryRow> {
  if (createGalleryDraftInFlight) return createGalleryDraftInFlight;
  const p = performCreateGalleryDraft();
  createGalleryDraftInFlight = p;
  void p.finally(() => {
    if (createGalleryDraftInFlight === p) createGalleryDraftInFlight = null;
  });
  return p;
}

async function slugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const g = await galleryLocalDb.galleries.where("slug").equals(slug).first();
  return Boolean(g && g.id !== excludeId);
}

export async function updateGallery(
  id: string,
  patch: Partial<
    Pick<
      ClientGalleryRow,
      | "title"
      | "address"
      | "client_name"
      | "client_email"
      | "status"
      | "slug"
      | "matterport_input"
      | "cloud_share_url"
      | "client_log_email_received_at"
      | "client_log_gallery_opened_at"
      | "client_log_files_downloaded_at"
      | "watermark_enabled"
    >
  >,
): Promise<void> {
  await ensureGalleryLocalDb();
  let next = { ...patch };
  if (next.address !== undefined) {
    const a = next.address;
    next = { ...next, address: a == null ? null : a.trim() || null };
  }
  if (next.slug !== undefined) {
    const s = next.slug.trim();
    if (await slugTaken(s, id)) {
      throw new Error("Dieser Link-Code (Slug) ist bereits vergeben.");
    }
    next = { ...next, slug: s };
  }
  if (next.matterport_input !== undefined) {
    const v = next.matterport_input;
    next = { ...next, matterport_input: v == null ? null : v.trim() || null };
  }
  if (next.cloud_share_url !== undefined) {
    const u = next.cloud_share_url;
    next = { ...next, cloud_share_url: u == null ? null : u.trim() || null };
  }
  const now = new Date().toISOString();
  await galleryLocalDb.galleries.update(id, { ...next, updated_at: now });
}

/** Nur nach Kunden-E-Mail (mailto oder erfolgreicher Server-Versand). Nicht manuell im UI setzbar. */
export async function recordGalleryCustomerEmailSent(id: string): Promise<void> {
  await ensureGalleryLocalDb();
  const now = new Date().toISOString();
  await galleryLocalDb.galleries.update(id, {
    client_delivery_status: "sent",
    client_delivery_sent_at: now,
    client_log_email_received_at: now,
    updated_at: now,
  });
}

/**
 * Öffentliche Galerie geladen: Schritt «Galerie geöffnet» einmal setzen.
 * Nur wenn «E-Mail erhalten» schon gesetzt ist und der Zeitstempel noch leer.
 */
export async function recordGalleryClientViewed(id: string): Promise<void> {
  await ensureGalleryLocalDb();
  const row = await galleryLocalDb.galleries.get(id);
  if (!row || row.status !== "active") return;
  if (!row.client_log_email_received_at) return;
  if (row.client_log_gallery_opened_at) return;
  const now = new Date().toISOString();
  await galleryLocalDb.galleries.update(id, {
    client_log_gallery_opened_at: now,
    updated_at: now,
  });
}

/**
 * Kunden-Log Schritt 3: Auswahl bestätigt (Picdrop «Senden») oder «Alle Medien heruntergeladen» (ZIP).
 * Schritt 3 wird immer gesetzt, sobald die Aktion gültig ist — auch wenn Schritt 2 (Galerie geöffnet)
 * nie geloggt wurde (z. B. Magic-Link ohne «E-Mail erhalten» im Backpanel).
 */
export async function recordGalleryClientFilesDownloaded(id: string): Promise<void> {
  await recordGalleryClientSelectionConfirmed(id);
}

/** @internal Wiederverwendung für ZIP-Download und Picdrop-Absenden */
async function recordGalleryClientSelectionConfirmed(id: string): Promise<void> {
  await ensureGalleryLocalDb();
  const row = await galleryLocalDb.galleries.get(id);
  if (!row || row.status !== "active") return;
  if (row.client_log_files_downloaded_at) return;
  const now = new Date().toISOString();
  const patch: {
    client_log_files_downloaded_at: string;
    updated_at: string;
    client_log_gallery_opened_at?: string;
  } = {
    client_log_files_downloaded_at: now,
    updated_at: now,
  };
  // Picdrop/ZIP setzen Schritt 3 — fehlenden Schritt 2 auffüllen (ohne Schritt 2 hätte der Kunde die UI nicht absenden können).
  if (!row.client_log_gallery_opened_at) {
    patch.client_log_gallery_opened_at = now;
  }
  await galleryLocalDb.galleries.update(id, patch);
}

export async function listGalleryImages(galleryId: string): Promise<GalleryImageRow[]> {
  await ensureGalleryLocalDb();
  const imgs = await galleryLocalDb.gallery_images.where("gallery_id").equals(galleryId).toArray();
  imgs.sort((a, b) =>
    a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.created_at.localeCompare(b.created_at),
  );
  return imgs.map(toGalleryImageRow);
}

export async function uploadGalleryFiles(galleryId: string, files: File[]): Promise<void> {
  await ensureGalleryLocalDb();
  const existing = await galleryLocalDb.gallery_images.where("gallery_id").equals(galleryId).toArray();
  let orderBase = existing.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1;
  const now = new Date().toISOString();

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const id = randomUUID();
    await galleryLocalDb.gallery_images.add({
      id,
      gallery_id: galleryId,
      sort_order: orderBase++,
      enabled: true,
      category: null,
      created_at: now,
      file_name: file.name,
      blob: file,
    });
  }
  await galleryLocalDb.galleries.update(galleryId, { updated_at: now });
}

/**
 * Bilder aus Propus-/Nextcloud-Freigabe: nur Bild-URLs speichern (kein Download, kein Datei-Upload nötig).
 * PDF-Grundrisse, Video und Matterport werden nicht übernommen.
 */
export async function importGalleryImagesFromPropusShare(
  galleryId: string,
  sharePageUrl: string,
): Promise<{ ok: true; added: number; message: string } | { ok: false; message: string }> {
  const trimmed = sharePageUrl.trim();
  if (!trimmed) {
    return { ok: false, message: "Bitte einen Freigabe-Link einfügen." };
  }
  let importedImages: { src: string; label: string }[] = [];
  let successMessage = "Freigabe gespeichert.";

  const nc = await listMediaFromNextcloudPublicShare(trimmed);
  if (nc.ok && nc.images.length > 0) {
    importedImages = nc.images.map((x) => ({ src: x.src, label: x.label }));
    const n = importedImages.length;
    successMessage = `${n} Bild${n === 1 ? "" : "er"} aus der Freigabe übernommen.`;
  }

  if (importedImages.length === 0) {
    const json = await fetchManifestFromUrl(trimmed);
    if (!json) {
      return {
        ok: false,
        message: parseNextcloudPublicShareUrl(trimmed)
          ? nc.ok
            ? "In der Freigabe wurden keine Bilder gefunden und kein JSON-Manifest."
            : nc.message
          : "Kein JSON gefunden oder CORS blockiert. Die Datei muss mit Access-Control-Allow-Origin ausgeliefert werden, oder Sie tragen die Bild-URLs manuell ein.",
      };
    }

    const gallery = manifestToGalleryItems(json);
    if (gallery.length === 0) {
      return {
        ok: false,
        message:
          json.images !== undefined || json.gallery !== undefined
            ? "Manifest enthält keine gültigen Bild-URLs."
            : "JSON enthält kein gültiges images[] oder gallery[].",
      };
    }

    importedImages = gallery.map((g) => ({ src: g.src, label: g.label }));
    const n = importedImages.length;
    successMessage = `${n} Bild${n === 1 ? "" : "er"} aus Manifest übernommen.`;
  }

  await ensureGalleryLocalDb();
  const existing = await galleryLocalDb.gallery_images.where("gallery_id").equals(galleryId).toArray();
  let orderBase = existing.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1;
  const now = new Date().toISOString();
  let added = 0;

  for (const item of importedImages) {
    const src = (item.src || "").trim();
    if (!/^https?:\/\//i.test(src)) continue;
    const id = randomUUID();
    const label = (item.label || "").trim().slice(0, 120) || null;
    await galleryLocalDb.gallery_images.add({
      id,
      gallery_id: galleryId,
      sort_order: orderBase++,
      enabled: true,
      category: label,
      created_at: now,
      file_name: fileNameFromUrl(src),
      remote_src: src,
    });
    added++;
  }

  await galleryLocalDb.galleries.update(galleryId, {
    updated_at: now,
    cloud_share_url: trimmed,
    video_url: null,
    floor_plans_json: null,
  });

  return {
    ok: true,
    added,
    message: successMessage,
  };
}

export async function updateImage(
  id: string,
  patch: Partial<Pick<GalleryImageRow, "enabled" | "category" | "sort_order">>,
): Promise<void> {
  await ensureGalleryLocalDb();
  await galleryLocalDb.gallery_images.update(id, patch);
  const row = await galleryLocalDb.gallery_images.get(id);
  if (row) {
    await galleryLocalDb.galleries.update(row.gallery_id, { updated_at: new Date().toISOString() });
  }
}

export async function reorderImages(galleryId: string, orderedIds: string[]): Promise<void> {
  await ensureGalleryLocalDb();
  const now = new Date().toISOString();
  for (let i = 0; i < orderedIds.length; i++) {
    await galleryLocalDb.gallery_images.update(orderedIds[i], { sort_order: i });
  }
  await galleryLocalDb.galleries.update(galleryId, { updated_at: now });
}

export async function deleteImageRow(img: GalleryImageRow): Promise<void> {
  await ensureGalleryLocalDb();
  revokeBlobUrlForImage(img.id);
  await galleryLocalDb.gallery_images.delete(img.id);
  await galleryLocalDb.galleries.update(img.gallery_id, { updated_at: new Date().toISOString() });
}

export async function deleteGallery(galleryId: string): Promise<void> {
  await ensureGalleryLocalDb();
  const imgs = await galleryLocalDb.gallery_images.where("gallery_id").equals(galleryId).toArray();
  for (const i of imgs) {
    revokeBlobUrlForImage(i.id);
  }
  await galleryLocalDb.gallery_images.where("gallery_id").equals(galleryId).delete();
  await galleryLocalDb.gallery_feedback.where("gallery_id").equals(galleryId).delete();
  await galleryLocalDb.galleries.delete(galleryId);
}

export async function duplicateGallery(sourceId: string): Promise<ClientGalleryRow> {
  await ensureGalleryLocalDb();
  const src = await galleryLocalDb.galleries.get(sourceId);
  if (!src) throw new Error("Galerie nicht gefunden.");
  const imgs = await galleryLocalDb.gallery_images.where("gallery_id").equals(sourceId).toArray();
  imgs.sort((a, b) =>
    a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.created_at.localeCompare(b.created_at),
  );
  const now = new Date().toISOString();
  const newId = randomUUID();
  const newSlug = newGallerySlug();
  await galleryLocalDb.galleries.add({
    id: newId,
    slug: newSlug,
    title: `${src.title} (Kopie)`,
    address: src.address ?? null,
    client_name: src.client_name,
    client_email: src.client_email,
    client_delivery_status: "open",
    client_delivery_sent_at: null,
    client_log_email_received_at: null,
    client_log_gallery_opened_at: null,
    client_log_files_downloaded_at: null,
    status: "inactive",
    matterport_input: src.matterport_input ?? null,
    cloud_share_url: src.cloud_share_url ?? null,
    video_url: src.video_url ?? null,
    floor_plans_json: src.floor_plans_json ?? null,
    picdrop_selection_json: src.picdrop_selection_json ?? null,
    watermark_enabled: src.watermark_enabled !== false,
    created_at: now,
    updated_at: now,
  });

  for (const im of imgs) {
    const nid = randomUUID();
    const rs = im.remote_src?.trim();
    if (rs) {
      await galleryLocalDb.gallery_images.add({
        id: nid,
        gallery_id: newId,
        sort_order: im.sort_order,
        enabled: im.enabled,
        category: im.category,
        created_at: now,
        file_name: im.file_name?.trim() || fileNameFromUrl(rs),
        remote_src: rs,
      });
    } else if (im.blob && im.blob.size > 0) {
      const copyBlob = im.blob.slice(0, im.blob.size, im.blob.type);
      await galleryLocalDb.gallery_images.add({
        id: nid,
        gallery_id: newId,
        sort_order: im.sort_order,
        enabled: im.enabled,
        category: im.category,
        created_at: now,
        file_name: im.file_name?.trim() || null,
        blob: copyBlob,
      });
    }
  }

  const g = await galleryLocalDb.galleries.get(newId);
  return toClientGalleryRow(g!);
}

/** Standard-Layout (Betreff + HTML) zum Zurücksetzen in den E-Mail-Einstellungen. */
export function getListingEmailDesignDefaults(): { subject: string; body: string } {
  return {
    subject: LISTING_EMAIL_DEFAULT_SUBJECT,
    body: getDefaultListingEmailBodyHtml(),
  };
}

export function getFollowupEmailDesignDefaults(): { subject: string; body: string } {
  return {
    subject: FOLLOWUP_EMAIL_DEFAULT_SUBJECT,
    body: getDefaultFollowupEmailBodyHtml(),
  };
}

export function getRevisionDoneEmailDesignDefaults(): { subject: string; body: string } {
  return {
    subject: REVISION_DONE_EMAIL_DEFAULT_SUBJECT,
    body: getDefaultRevisionDoneEmailBodyHtml(),
  };
}

export function getPicdropAdminNotifyEmailDesignDefaults(): { subject: string; body: string } {
  return {
    subject: PICDROP_ADMIN_NOTIFY_DEFAULT_SUBJECT,
    body: getDefaultPicdropAdminNotifyBodyHtml(),
  };
}

export function getEmailDesignDefaultsForTemplateId(id: string): { subject: string; body: string } | null {
  if (id === LISTING_EMAIL_TEMPLATE_ID) return getListingEmailDesignDefaults();
  if (id === EMAIL_TEMPLATE_FOLLOWUP_ID) return getFollowupEmailDesignDefaults();
  if (id === PICDROP_ADMIN_NOTIFY_EMAIL_TEMPLATE_ID) return getPicdropAdminNotifyEmailDesignDefaults();
  return null;
}

export async function listEmailTemplates(): Promise<EmailTemplateRow[]> {
  await ensureGalleryLocalDb();
  const rows = await galleryLocalDb.email_templates.orderBy("name").toArray();
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
    is_default: t.is_default,
    created_at: t.created_at,
    updated_at: t.updated_at,
  }));
}

/** Speichert eine der konfigurierten E-Mail-Vorlagen (HTML-Body, Platzhalter s. `applyTemplateVars`). */
export async function saveEmailTemplate(row: { id: string; subject: string; body: string }): Promise<void> {
  await ensureGalleryLocalDb();
  if (!(KNOWN_EMAIL_TEMPLATE_IDS as readonly string[]).includes(row.id)) {
    throw new Error("Unbekannte Vorlagen-ID.");
  }
  const now = new Date().toISOString();
  const name =
    row.id === LISTING_EMAIL_TEMPLATE_ID
      ? "E-Mail an Kunden (Auswahl)"
      : row.id === EMAIL_TEMPLATE_FOLLOWUP_ID
        ? "Rückfrage (Kommentar)"
        : "Admin: Bildauswahl eingegangen";
  const existing = await galleryLocalDb.email_templates.get(row.id);
  if (existing) {
    await galleryLocalDb.email_templates.update(row.id, {
      subject: row.subject.trim(),
      body: row.body,
      updated_at: now,
    });
  } else {
    await galleryLocalDb.email_templates.add({
      id: row.id,
      name,
      subject: row.subject.trim(),
      body: row.body,
      is_default: row.id === LISTING_EMAIL_TEMPLATE_ID,
      created_at: now,
      updated_at: now,
    });
  }
}

/** Für mailto: Klartext aus HTML (Absätze/Links lesbar). */
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

function escapeHtmlForTemplate(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Platzhalter: {{customer_comment}} (Kundenkommentar), {{feedback_body}} (Büro-Text bei Rückfrage; bei «Revision behoben» gleichbedeutend mit Kundenkommentar) */
export type EmailTemplateVars = {
  gallery_link: string;
  title: string;
  customer_name: string;
  /** Objektadresse / Unterzeile (optional, z. B. `{{address}}` in Vorlagen). */
  address?: string;
  /** Mehrzeilige Liste (Admin-Mail), HTML-sicher escaped */
  file_list?: string;
  feedback_body?: string;
  customer_comment?: string;
  asset_label?: string;
  direct_link?: string;
  revision?: string;
};

export function applyTemplateVars(text: string, vars: EmailTemplateVars): string {
  const name = vars.customer_name.trim();
  const nameEsc = escapeHtmlForTemplate(name);
  const customer_name_line = name ? ` ${nameEsc}` : "";
  const nl2br = (s: string) => s.replace(/\r\n|\n|\r/g, "<br />");
  const fb = nl2br(escapeHtmlForTemplate(vars.feedback_body ?? ""));
  const cc = nl2br(escapeHtmlForTemplate(vars.customer_comment ?? ""));
  const al = escapeHtmlForTemplate(vars.asset_label ?? "");
  const rev = escapeHtmlForTemplate(vars.revision ?? "");
  const direct = (vars.direct_link ?? vars.gallery_link).trim();
  const addr = escapeHtmlForTemplate(vars.address ?? "");
  const titleEsc = escapeHtmlForTemplate(vars.title);
  const fileList = nl2br(vars.file_list ?? "");
  const gl = vars.gallery_link.trim();
  return text
    .replaceAll("{{gallery_link}}", gl)
    .replaceAll("{{Link}}", gl)
    .replaceAll("{{title}}", titleEsc)
    .replaceAll("{{Titel}}", titleEsc)
    .replaceAll("{{customer_name}}", nameEsc)
    .replaceAll("{{Kundenname}}", nameEsc)
    .replaceAll("{{customer_name_line}}", customer_name_line)
    .replaceAll("{{address}}", addr)
    .replaceAll("{{file_list}}", fileList)
    .replaceAll("{{Dateiliste}}", fileList)
    .replaceAll("{{feedback_body}}", fb)
    .replaceAll("{{customer_comment}}", cc)
    .replaceAll("{{asset_label}}", al)
    .replaceAll("{{direct_link}}", direct)
    .replaceAll("{{revision}}", rev);
}

function picdropNotifyEmailEnv(): string {
  const v = process.env.NEXT_PUBLIC_PICDROP_NOTIFY_EMAIL;
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Öffnet nach Picdrop-Absenden ein mailto an den Admin (Vorlage «Admin: Bildauswahl eingegangen»),
 * sofern `NEXT_PUBLIC_PICDROP_NOTIFY_EMAIL` gesetzt ist.
 */
export async function tryOpenPicdropAdminNotifyMailto(input: {
  galleryId: string;
  gallerySlug: string;
  items: Array<{ asset_label: string; messageLines: readonly string[] }>;
}): Promise<void> {
  const to = picdropNotifyEmailEnv();
  if (!to) return;
  await ensureGalleryLocalDb();
  const tpl = await galleryLocalDb.email_templates.get(PICDROP_ADMIN_NOTIFY_EMAIL_TEMPLATE_ID);
  const g = await galleryLocalDb.galleries.get(input.galleryId);
  if (!tpl || !g || g.slug !== input.gallerySlug.trim()) return;

  const link = publicGalleryUrl(g.slug);
  const lines = input.items.map((it) => {
    const label = (it.asset_label || "Bild").trim() || "Bild";
    const c = it.messageLines.map((l) => l.trim()).filter(Boolean).join(" ");
    return `${label}: ${c || "Kein Kommentar"}`;
  });
  const fileList = escapeHtmlForTemplate(lines.join("\n"));

  const vars: EmailTemplateVars = {
    gallery_link: link,
    title: g.title?.trim() || "Auswahl",
    customer_name: g.client_name?.trim() || "—",
    address: g.address?.trim() || "",
    file_list: fileList,
  };
  const subj = applyTemplateVars(tpl.subject, vars);
  const bodyHtml = applyTemplateVars(tpl.body, vars);
  const bodyPlain = htmlEmailToPlainText(bodyHtml);
  const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(bodyPlain)}`;
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function trySendGalleryEmailViaEdge(_payload: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; message: string }> {
  void _payload;
  return {
    ok: false,
    message:
      "Lokaler Modus: kein Server-Versand. Bitte «E-Mail-Programm öffnen» nutzen oder später einen eigenen Dienst anbinden.",
  };
}
