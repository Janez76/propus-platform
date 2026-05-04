import { Link } from "react-router-dom";
import { Image as ImageIcon } from "lucide-react";

/** Minimale Zeile für Handoff-Galerie-Karten (Listing + Selekto). */
export type HandoffGalleryListRow = {
  id: string;
  slug: string;
  title: string;
  address: string | null;
  client_name: string | null;
  client_delivery_status: "open" | "sent";
  status: "active" | "inactive";
  image_count: number;
  feedback_count?: number;
  updated_at: string;
  client_log_files_downloaded_at: string | null;
  /** Nur Selekto / Bildauswahl */
  picdrop_selected_count?: number;
};

export type HandoffGalleryCardsProps = {
  rows: HandoffGalleryListRow[];
  /** "listing" = nur Listing-Spalten; "selekto" = zusätzlich Auswahl-Spalte */
  variant: "listing" | "selekto";
  buildEditHref: (id: string) => string;
  onCopyLink: (row: HandoffGalleryListRow) => void;
  onDelete: (row: HandoffGalleryListRow) => void;
  copyFlashId: string | null;
  busyId: string | null;
  fmtDateShort: (iso: string) => string;
  /** Optional: Mehrfachauswahl aktivieren (nur Listing). */
  selectedIds?: ReadonlySet<string>;
  onToggleSelect?: (id: string) => void;
};

/**
 * Handoff `gal-grid` / `gal-card` — gemeinsam für /admin/listing und /admin/selekto.
 */
export function HandoffGalleryCards({
  rows,
  variant,
  buildEditHref,
  onCopyLink,
  onDelete,
  copyFlashId,
  busyId,
  fmtDateShort,
  selectedIds,
  onToggleSelect,
}: HandoffGalleryCardsProps) {
  const selectionEnabled = Boolean(onToggleSelect);
  return (
    <div className="gal-grid">
      {rows.map((g) => {
        const isSelected = selectedIds?.has(g.id) ?? false;
        return (
        <article
          key={g.id}
          className={`gal-card${isSelected ? " gal-card--selected" : ""}`}
          style={
            isSelected
              ? { outline: "2px solid var(--gold-600, #b8860b)", outlineOffset: -2 }
              : undefined
          }
        >
          <div
            className="gal-cover relative"
            style={{
              backgroundImage: "linear-gradient(160deg, var(--gold-50) 0%, var(--paper-strip) 50%, var(--card) 100%)",
            }}
          >
            {selectionEnabled ? (
              <label
                className="gal-card-select"
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  zIndex: 2,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.92)",
                  border: "1px solid var(--border, #d6d3d1)",
                  cursor: "pointer",
                }}
                onClick={(e) => e.stopPropagation()}
                title={isSelected ? "Auswahl aufheben" : "Auswählen"}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect?.(g.id)}
                  aria-label={`«${g.title}» auswählen`}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
              </label>
            ) : null}
            <div className="gal-cover-overlay">
              <span className="gal-pw">{g.slug}</span>
            </div>
            <div
              className="pointer-events-none flex flex-1 items-center justify-center"
              style={{ minHeight: 100, paddingTop: 24 }}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--border)] bg-white/90 text-[var(--gold-600)] shadow-sm">
                <ImageIcon className="h-7 w-7 opacity-80" />
              </div>
            </div>
          </div>
          <div className="gal-body">
            <Link to={buildEditHref(g.id)} className="gal-title hover:underline">
              {g.title}
            </Link>
            {g.address?.trim() ? <div className="text-xs text-[var(--fg-3)] line-clamp-2">{g.address.trim()}</div> : null}
            <p className="gal-customer">{g.client_name || "—"}</p>
            <div className="gal-meta">
              <span
                className={
                  g.client_delivery_status === "sent" ? "text-[var(--success)]" : "text-[var(--warn)]"
                }
              >
                {g.client_delivery_status === "sent" ? "Versand: versendet" : "Versand: offen"}
              </span>
              <span>·</span>
              <span>{g.status === "active" ? "Listing aktiv" : "Listing inaktiv"}</span>
            </div>
            {variant === "selekto" ? (
              <div className="gal-meta text-xs">
                <strong>{g.image_count}</strong> Bilder
                {g.client_log_files_downloaded_at ? (
                  <span className="ml-1 text-[var(--success)]">· Auswahl bestätigt</span>
                ) : (g.picdrop_selected_count ?? 0) > 0 ? (
                  <span className="ml-1">· Entwurf {g.picdrop_selected_count}</span>
                ) : (
                  <span className="ml-1 text-[var(--warn)]">· Auswahl offen</span>
                )}
              </div>
            ) : (
              <div className="gal-meta text-xs">
                {g.image_count} Bilder · {g.feedback_count ?? 0} offene Rev.
              </div>
            )}
            <div className="gal-foot">
              <span className="gal-expires">Aktual. {fmtDateShort(g.updated_at)}</span>
            </div>
          </div>
          <div className="gal-actions">
            <button
              type="button"
              className="icon-btn"
              title={copyFlashId === g.id ? "Kopiert" : "Link kopieren"}
              onClick={() => onCopyLink(g)}
            >
              <i
                className={copyFlashId === g.id ? "fa-solid fa-check" : "fa-solid fa-globe"}
                aria-hidden
              />
            </button>
            <Link to={buildEditHref(g.id)} className="btn-outline-gold" style={{ fontSize: 12, padding: "4px 10px" }}>
              Bearbeiten
            </Link>
            <button
              type="button"
              className="icon-btn text-red-600"
              title="Löschen"
              disabled={busyId === g.id}
              onClick={() => onDelete(g)}
            >
              <i className="fa-solid fa-trash-can" aria-hidden />
            </button>
          </div>
        </article>
        );
      })}
    </div>
  );
}
