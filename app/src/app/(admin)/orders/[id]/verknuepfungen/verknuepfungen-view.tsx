"use client";

import Link from "next/link";
import { Box, Camera, ExternalLink, FolderOpen, Receipt } from "lucide-react";
import { Section, Empty, formatCHF, formatTS } from "../_shared";
import { galleryDisplayHostPath, galleryUrl, matterportShowUrl } from "./_links";
import { CopyLinkButton } from "./copy-link-button";
import { linkGallery, linkMatterportTour, unlinkGallery, unlinkMatterportTour } from "./actions";
import {
  displayGallerySlug,
  type VerknuepfungenData,
} from "@/lib/repos/orders/verknuepfungenTypes";

function invoiceStatusChip(
  inv: VerknuepfungenData["invoices"][0],
): { label: string; className: string } {
  if (inv.paid_at) {
    return { label: "Bezahlt", className: "bg-[#E6F2E3] text-[#1F5C20] border border-[#2A7A2A]/30" };
  }
  const raw = (inv.invoice_status ?? "").toLowerCase();
  if (raw === "paid" || raw === "bz") {
    return { label: "Bezahlt", className: "bg-[#E6F2E3] text-[#1F5C20] border border-[#2A7A2A]/30" };
  }
  if (raw === "overdue" || raw.includes("mahn") || raw === "dunning") {
    return { label: "Mahnung", className: "bg-[#F8E0DB] text-[#8A2515] border border-[#B4311B]/30" };
  }
  return { label: "Offen", className: "bg-[#FBEED4] text-[#8A5710] border border-[#B87514]/30" };
}

function sourceLabel(src: string): { label: string; className: string } {
  if (src === "renewal") {
    return { label: "Renewal", className: "bg-[#DFEBF5] text-[#244865] border border-[#2E5A7A]/30" };
  }
  if (src === "exxas") {
    return { label: "Exxas", className: "bg-[#EDE5FA] text-[#4A2F8E] border border-[#7C5BC9]/30" };
  }
  return { label: src, className: "bg-[var(--paper-strip)] text-[var(--ink-3)] border border-[var(--border)]" };
}

const btnSecondary = "bd-btn-ghost";
const btnPrimary = "bd-btn-outline-gold";

type Sp = { error?: string; saved?: string };

export function VerknuepfungenView({
  orderId,
  data,
  searchParams: sp = {},
}: {
  orderId: string;
  data: VerknuepfungenData;
  searchParams?: Sp;
}) {
  const { orderNo, tour, gallery, folderCounts, invoices } = data;
  const gSlug = gallery ? displayGallerySlug(gallery) : null;
  const galleryLink = gSlug ? galleryUrl(gSlug) : null;
  const galleryPathDisplay = gSlug ? galleryDisplayHostPath(gSlug) : null;

  return (
    <div className="space-y-6">
      {sp.error && (
        <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-4 py-2 text-sm text-[#8A2515]">
          {sp.error}
        </div>
      )}
      {sp.saved === "1" && !sp.error && (
        <div className="rounded-lg border border-[var(--success)]/30 bg-[var(--success-bg)] px-4 py-2 text-sm text-[#1F5C20]">
          Gespeichert.
        </div>
      )}

      <Section title="Matterport-Tour" icon={<Box className="h-4 w-4" />}>
        {tour ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-[var(--ink)]">{tour.display_title}</p>
            <p className="text-xs text-[var(--ink-3)]">
              Space-ID:{" "}
              <code className="text-[var(--ink-2)] font-mono">{tour.matterport_space_id ?? "—"}</code>
            </p>
            {tour.matterport_state && (
              <span className="inline-flex rounded-full bg-[var(--paper-strip)] border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--ink-3)]">
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
                  className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs text-[var(--danger)] hover:border-[var(--danger)]"
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
            <form
              action={linkMatterportTour}
              className="flex max-w-lg flex-col gap-2 sm:flex-row sm:items-end"
            >
              <input type="hidden" name="order_no" value={String(orderNo)} />
              <label className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                Matterport (Space-ID oder URL mit ?m=…)
                <input
                  name="space_id_or_url"
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-2 py-1.5 text-sm focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20"
                  placeholder="z. B. abc12XYZ oder https://my.matterport.com/show/?m=…"
                />
              </label>
              <button
                type="submit"
                className="bd-btn-outline-gold shrink-0"
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
            <p className="text-sm font-mono text-[var(--ink)]">{gSlug}</p>
            {galleryPathDisplay && (
              <p className="text-xs text-[var(--ink-3)]" title="Sichtbarer Host + Pfad (GALLERY_BASE_URL)">
                {galleryPathDisplay}
              </p>
            )}
            <span className="inline-flex rounded-full bg-[var(--paper-strip)] border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--ink-3)]">
              {gallery.status}
            </span>
            {gallery.cloud_share_url && (
              <p className="text-xs text-[var(--ink-3)] break-all">Cloud: {gallery.cloud_share_url}</p>
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
                  className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs text-[var(--danger)] hover:border-[var(--danger)]"
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
            <form
              action={linkGallery}
              className="flex max-w-lg flex-col gap-2 sm:flex-row sm:items-end"
            >
              <input type="hidden" name="order_no" value={String(orderNo)} />
              <label className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                Slug oder freundlicher Slug
                <input
                  name="slug"
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--paper-strip)] px-2 py-1.5 text-sm focus:bg-white focus:border-[var(--gold-500)] focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]/20"
                  placeholder="mein-listing"
                />
              </label>
              <button
                type="submit"
                className="bd-btn-outline-gold shrink-0"
              >
                Verknüpfen
              </button>
            </form>
          </div>
        )}
      </Section>

      <Section title="Kundenordner" icon={<FolderOpen className="h-4 w-4" />}>
        <p className="text-sm text-[var(--ink-2)]">
          {(folderCounts?.folder_count ?? 0) === 0
            ? "0 Ordner verknüpft, davon 0 geteilt"
            : `${folderCounts?.folder_count ?? 0} Ordner verknüpft, davon ${
                folderCounts?.shared_count ?? 0
              } geteilt`}
        </p>
        <p className="mt-2">
          <Link
            href={`/orders/${orderId}/dateien`}
            className="text-sm font-semibold text-[var(--gold-700)] underline decoration-[var(--gold-300)] hover:decoration-[var(--gold-600)]"
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
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--paper-strip)] px-4 py-3"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--ink)] font-mono">{numberLabel}</span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${src.className}`}
                    >
                      {src.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <span className="text-sm tabular-nums font-semibold text-[var(--ink)] font-mono">
                      {formatCHF(iv.amount_chf)}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${st.className}`}
                    >
                      {st.label}
                    </span>
                  </div>
                  <p className="w-full text-xs text-[var(--ink-3)] font-mono">
                    {formatTS(iv.created_at)}
                    {iv.due_at && ` · Fällig ${formatTS(iv.due_at)}`}
                    {iv.invoice_kind && ` · ${iv.invoice_kind}`}
                  </p>
                </div>
              );
            })}
            <p className="pt-1 text-xs text-[var(--ink-3)]">
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
