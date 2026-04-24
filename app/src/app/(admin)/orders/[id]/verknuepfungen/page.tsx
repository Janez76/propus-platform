import { notFound } from "next/navigation";
import Link from "next/link";
import { Box, Camera, ExternalLink, FolderOpen, Receipt } from "lucide-react";
import { query, queryOne } from "@/lib/db";
import { Section, Empty, formatCHF, formatTS } from "../_shared";
import { galleryDisplayHostPath, galleryUrl, matterportShowUrl } from "./_links";
import { CopyLinkButton } from "./copy-link-button";
import { linkGallery, linkMatterportTour, unlinkGallery, unlinkMatterportTour } from "./actions";

type TourRow = {
  matterport_space_id: string | null;
  tour_url: string | null;
  matterport_state: string | null;
  display_title: string;
};

type GalleryRow = {
  slug: string;
  friendly_slug: string | null;
  status: string;
  cloud_share_url: string | null;
};

type FolderCounts = {
  folder_count: number;
  shared_count: number;
};

type InvRow = {
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

function displayGallerySlug(g: GalleryRow | null): string {
  if (!g) return "";
  const s = (g.friendly_slug ?? "").trim();
  if (s) return s;
  return g.slug;
}

function invoiceStatusChip(
  inv: InvRow,
): { label: string; className: string } {
  if (inv.paid_at) {
    return { label: "Bezahlt", className: "bg-emerald-500/15 text-emerald-400" };
  }
  const raw = (inv.invoice_status ?? "").toLowerCase();
  if (raw === "paid" || raw === "bz") {
    return { label: "Bezahlt", className: "bg-emerald-500/15 text-emerald-400" };
  }
  if (raw === "overdue" || raw.includes("mahn") || raw === "dunning") {
    return { label: "Mahnung", className: "bg-rose-500/15 text-rose-400" };
  }
  return { label: "Offen", className: "bg-zinc-500/15 text-zinc-300" };
}

function sourceLabel(src: string): { label: string; className: string } {
  if (src === "renewal") {
    return { label: "Renewal", className: "bg-blue-500/15 text-blue-300" };
  }
  if (src === "exxas") {
    return { label: "Exxas", className: "bg-violet-500/15 text-violet-300" };
  }
  return { label: src, className: "bg-white/10 text-white/50" };
}

const btnSecondary =
  "inline-flex items-center gap-1 rounded border border-white/20 px-2.5 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10";
const btnPrimary =
  "inline-flex items-center gap-1 rounded border border-[#B68E20]/50 px-2.5 py-1.5 text-xs text-[#B68E20] transition-colors hover:bg-[#B68E20]/10";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; saved?: string }>;
};

export default async function VerknuepfungenPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};

  const orderCheck = await queryOne<{ order_no: number }>(`
    SELECT order_no FROM booking.orders WHERE order_no = $1
  `, [id]);
  if (!orderCheck) notFound();

  const orderNo = orderCheck.order_no;

  const [tour, gallery, folderCounts, invoices] = await Promise.all([
    queryOne<TourRow>(`
      SELECT
        matterport_space_id,
        tour_url,
        matterport_state,
        COALESCE(
          NULLIF(TRIM(object_label), ''),
          NULLIF(TRIM(bezeichnung), ''),
          'Matterport-Tour'
        ) AS display_title
      FROM tour_manager.tours
      WHERE booking_order_no = $1
      LIMIT 1
    `, [orderNo]),
    queryOne<GalleryRow>(`
      SELECT slug, friendly_slug, status, cloud_share_url
      FROM tour_manager.galleries
      WHERE booking_order_no = $1
      LIMIT 1
    `, [orderNo]),
    queryOne<FolderCounts>(`
      SELECT
        COUNT(*)::int AS folder_count,
        COUNT(*) FILTER (WHERE nextcloud_share_url IS NOT NULL AND BTRIM(nextcloud_share_url) <> '')::int AS shared_count
      FROM booking.order_folder_links
      WHERE order_no = $1
        AND archived_at IS NULL
    `, [orderNo]),
    query<InvRow>(`
      SELECT
        iv.invoice_source,
        iv.id,
        iv.invoice_number,
        iv.invoice_status,
        iv.invoice_kind,
        iv.amount_chf::text AS amount_chf,
        iv.due_at,
        iv.paid_at,
        iv.created_at
      FROM tour_manager.invoices_central_v iv
      JOIN tour_manager.tours t ON t.id = iv.tour_id
      WHERE t.booking_order_no = $1
      ORDER BY iv.created_at DESC
    `, [orderNo]),
  ]);

  const gSlug = gallery ? displayGallerySlug(gallery) : null;
  const galleryLink = gSlug ? galleryUrl(gSlug) : null;
  const galleryPathDisplay = gSlug ? galleryDisplayHostPath(gSlug) : null;

  return (
    <div className="space-y-6">
      {sp.error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
          {sp.error}
        </div>
      )}
      {sp.saved === "1" && !sp.error && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
          Gespeichert.
        </div>
      )}

      <Section title="Matterport-Tour" icon={<Box className="h-4 w-4" />}>
        {tour ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-white/90">{tour.display_title}</p>
            <p className="text-xs text-white/40">
              Space-ID:{" "}
              <code className="text-white/70">{tour.matterport_space_id ?? "—"}</code>
            </p>
            {tour.matterport_state && (
              <span className="inline-flex rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">
                {tour.matterport_state}
              </span>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {tour.tour_url && (
                <a
                  href={tour.tour_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={btnPrimary}
                >
                  <ExternalLink className="h-3 w-3" />
                  Tour öffnen
                </a>
              )}
              {tour.matterport_space_id && matterportShowUrl(tour.matterport_space_id) && (
                <a
                  href={matterportShowUrl(tour.matterport_space_id) ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={btnSecondary}
                >
                  <ExternalLink className="h-3 w-3" />
                  Direct Matterport
                </a>
              )}
              <form action={unlinkMatterportTour} className="inline">
                <input type="hidden" name="order_no" value={String(orderNo)} />
                <button
                  type="submit"
                  className="rounded border border-white/15 px-2.5 py-1.5 text-xs text-rose-300/90 hover:bg-rose-500/10"
                >
                  Entknüpfen
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Empty>
              Keine Tour mit dieser Bestellung verknüpft. Slug, Space-ID oder Link eintragen und
              speichern.
            </Empty>
            <form action={linkMatterportTour} className="flex max-w-lg flex-col gap-2 sm:flex-row sm:items-end">
              <input type="hidden" name="order_no" value={String(orderNo)} />
              <label className="flex-1 text-xs text-white/50">
                Matterport (Space-ID oder URL mit ?m=…)
                <input
                  name="space_id_or_url"
                  className="mt-1 w-full rounded border border-white/15 bg-white/[0.04] px-2 py-1.5 text-sm"
                  placeholder="z. B. abc12XYZ oder https://my.matterport.com/show/?m=…"
                />
              </label>
              <button
                type="submit"
                className="shrink-0 rounded border border-[#B68E20]/50 px-3 py-1.5 text-sm text-[#B68E20] hover:bg-[#B68E20]/10"
              >
                Verknüpfen
              </button>
            </form>
          </div>
        )}
      </Section>

      <Section title="Kunden-Galerie" icon={<Camera className="h-4 w-4" />}>
        {gallery && gSlug ? (
          <div className="space-y-3">
            <p className="text-sm font-mono text-white/90">{gSlug}</p>
            {galleryPathDisplay && (
              <p className="text-xs text-white/50" title="Sichtbarer Host + Pfad (GALLERY_BASE_URL)">
                {galleryPathDisplay}
              </p>
            )}
            <span className="inline-flex rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">
              {gallery.status}
            </span>
            {gallery.cloud_share_url && (
              <p className="text-xs text-white/40 break-all">Cloud: {gallery.cloud_share_url}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {galleryLink && (
                <>
                  <a
                    href={galleryLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={btnPrimary}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Galerie öffnen
                  </a>
                  <CopyLinkButton url={galleryLink} />
                </>
              )}
              <form action={unlinkGallery} className="inline">
                <input type="hidden" name="order_no" value={String(orderNo)} />
                <button
                  type="submit"
                  className="rounded border border-white/15 px-2.5 py-1.5 text-xs text-rose-300/90 hover:bg-rose-500/10"
                >
                  Entknüpfen
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Empty>
              Keine Galerie verknüpft. Den Slug (oder freundlichen Slug) der bestehenden Galerie
              eintragen.
            </Empty>
            <form action={linkGallery} className="flex max-w-lg flex-col gap-2 sm:flex-row sm:items-end">
              <input type="hidden" name="order_no" value={String(orderNo)} />
              <label className="flex-1 text-xs text-white/50">
                Slug oder freundlicher Slug
                <input
                  name="slug"
                  className="mt-1 w-full rounded border border-white/15 bg-white/[0.04] px-2 py-1.5 text-sm"
                  placeholder="mein-listing"
                />
              </label>
              <button
                type="submit"
                className="shrink-0 rounded border border-[#B68E20]/50 px-3 py-1.5 text-sm text-[#B68E20] hover:bg-[#B68E20]/10"
              >
                Verknüpfen
              </button>
            </form>
          </div>
        )}
      </Section>

      <Section title="Kundenordner" icon={<FolderOpen className="h-4 w-4" />}>
        <p className="text-sm text-white/80">
          {(folderCounts?.folder_count ?? 0) === 0
            ? "0 Ordner verknüpft, davon 0 geteilt"
            : `${folderCounts?.folder_count ?? 0} Ordner verknüpft, davon ${
                folderCounts?.shared_count ?? 0
              } geteilt`}
        </p>
        <p className="mt-2">
          <Link
            href={`/orders/${id}/dateien`}
            className="text-sm text-[#B68E20] underline decoration-[#B68E20]/40 hover:decoration-[#B68E20]"
          >
            Alle Dateien &amp; Ordner verwalten →
          </Link>
        </p>
      </Section>

      <Section title="Rechnungen" icon={<Receipt className="h-4 w-4" />}>
        {invoices.length > 0 ? (
          <div className="space-y-2">
            {invoices.map((iv) => {
              const st = invoiceStatusChip(iv);
              const src = sourceLabel(iv.invoice_source);
              const numberLabel = iv.invoice_number ?? `ID ${iv.id}`;
              return (
                <div
                  key={`${iv.invoice_source}-${iv.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-sm font-medium text-white/90">{numberLabel}</span>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${src.className}`}>
                      {src.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <span className="text-sm tabular-nums text-white/80">{formatCHF(iv.amount_chf)}</span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}
                    >
                      {st.label}
                    </span>
                  </div>
                  <p className="w-full text-xs text-white/35">
                    {formatTS(iv.created_at)}
                    {iv.due_at && ` · Fällig ${formatTS(iv.due_at)}`}
                    {iv.invoice_kind && ` · ${iv.invoice_kind}`}
                  </p>
                </div>
              );
            })}
            <p className="pt-1 text-xs text-white/30">
              PDF-Links: in dieser Ansicht nicht verfügbar (View ohne pdf_url). Rechnungen hängen an
              der Tour, nicht direkt an der Bestellung.
            </p>
          </div>
        ) : (
          <Empty>Keine Rechnungen erfasst (über die verknüpfte Tour in der zentralen Rechnungsansicht)</Empty>
        )}
      </Section>
    </div>
  );
}
