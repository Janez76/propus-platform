/** Gemeinsam für Server-Load und Client-View (kein "server-only"). */
export type VerknuepfungTour = {
  matterport_space_id: string | null;
  tour_url: string | null;
  matterport_state: string | null;
  display_title: string;
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
