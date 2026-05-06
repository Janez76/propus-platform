/** Gemeinsam für Server-Load und Client-View (kein "server-only"). */
export type VerknuepfungTour = {
  matterport_space_id: string | null;
  tour_url: string | null;
  matterport_state: string | null;
  display_title: string;
  /** Manueller Anzeigename (DB: tour_manager.tours.bezeichnung). */
  bezeichnung: string | null;
  /** Sekundärer Anzeigename, wird vom Tour-Manager gepflegt (object_label). */
  object_label: string | null;
  /** Aktuelle Matterport-AccessVisibility, sofern API erreichbar; sonst null. */
  visibility: "PRIVATE" | "LINK_ONLY" | "PUBLIC" | "PASSWORD" | null;
  /** Falls Matterport-API nicht erreichbar war oder Modell archiviert: Fehlertext. */
  visibilityError: string | null;
};

export type VerknuepfungSuggestedTour = VerknuepfungTour & {
  id: number;
  customer_label: string | null;
  matterport_created_at: string | null;
  updated_at: string | null;
};

export type VerknuepfungGallery = {
  slug: string;
  friendly_slug: string | null;
  status: string;
  cloud_share_url: string | null;
};

export type VerknuepfungFolderCounts = {
  folder_count: number;
  shared_count: number;
};

export type VerknuepfungInvoice = {
  invoice_source: "renewal" | "exxas";
  id: number;
  invoice_number: string | null;
  invoice_status: string | null;
  invoice_kind: string | null;
  amount_chf: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
};

export type VerknuepfungenData = {
  orderNo: number;
  tour: VerknuepfungTour | null;
  suggestedTours: VerknuepfungSuggestedTour[];
  gallery: VerknuepfungGallery | null;
  folderCounts: VerknuepfungFolderCounts | null;
  invoices: VerknuepfungInvoice[];
};

export function displayGallerySlug(g: VerknuepfungGallery | null): string {
  if (!g) return "";
  const s = (g.friendly_slug ?? "").trim();
  if (s) return s;
  return g.slug;
}
