import { Link } from "react-router-dom";
import { Image as ImageIcon, FolderOpen } from "lucide-react";

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
  /** Erstes Bild der Galerie für die Cover-Vorschau (Listing). */
  cover_image_id?: string | null;
  /** NAS-Quelle gesetzt → Ordner-Indikator anzeigen (Listing). */
  storage_source_type?: "share_link" | "order_folder" | "nas_browser" | null;
  storage_relative_path?: string | null;
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

function folderTail(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.replace(/\/+$/, "");
  if (!trimmed) return null;
  const parts = trimmed.split(/[\\/]/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts[parts.length - 1];
}

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
        const coverSrc = g.cover_image_id
          ? `/api/tours/admin/galleries/${g.id}/images/${g.cover_image_id}/thumb?w=600`
          : null;
        const folderName = folderTail(g.storage_relative_path);
        const titleText = g.title?.trim() || "";
        const addressText = g.address?.trim() || "";
        const customerText = g.client_name?.trim() || "";
        // Wenn der Titel leer ist, zeigen wir die Adresse als Titel-Ersatz —
        // sonst "Ohne Titel" als dezenter Platzhalter.
        const displayTitle = titleText || addressText || "Ohne Titel";
        const showSeparateAddress = Boolean(titleText && addressText);
        const titleIsPlaceholder = !titleText && !addressText;
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
                backgroundImage:
                  "linear-gradient(160deg, var(--gold-50) 0%, var(--paper-strip) 50%, var(--card) 100%)",
              }}
            >
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                aria-hidden
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--border)] bg-white/90 text-[var(--gold-600)] shadow-sm">
                  <ImageIcon className="h-7 w-7 opacity-80" />
                </div>
              </div>
              {coverSrc ? (
                <img
                  src={coverSrc}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}

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

              {variant === "listing" && g.storage_source_type ? (
                <div
                  className="gal-cover-folder"
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    zIndex: 2,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    maxWidth: "calc(100% - 56px)",
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.92)",
                    border: "1px solid var(--border, #d6d3d1)",
                    color: "var(--fg-2)",
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: "0.02em",
                    backdropFilter: "blur(6px)",
                  }}
                  title={g.storage_relative_path ?? "Ordner verbunden"}
                >
                  <FolderOpen className="h-3 w-3 shrink-0" aria-hidden />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {folderName ?? "Ordner"}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="gal-body" style={{ minHeight: 132, display: "flex", flexDirection: "column" }}>
              <Link
                to={buildEditHref(g.id)}
                className="gal-title hover:underline"
                style={titleIsPlaceholder ? { color: "var(--fg-3)", fontStyle: "italic" } : undefined}
                title={displayTitle}
              >
                {displayTitle}
              </Link>
              {showSeparateAddress ? (
                <div className="text-xs text-[var(--fg-3)] line-clamp-2">{addressText}</div>
              ) : null}
              {customerText ? <p className="gal-customer">{customerText}</p> : null}
              <div
                className="gal-meta"
                style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}
              >
                <span
                  className={
                    "gal-admin-listing-pill gal-admin-badge " +
                    (g.client_delivery_status === "sent"
                      ? "gal-admin-badge--delivery-sent"
                      : "gal-admin-badge--delivery-open")
                  }
                >
                  {g.client_delivery_status === "sent" ? "Versendet" : "Offen"}
                </span>
                <span
                  className={
                    "gal-admin-listing-pill gal-admin-badge " +
                    (g.status === "active" ? "gal-admin-badge--ok" : "gal-admin-badge--off")
                  }
                >
                  {g.status === "active" ? "Aktiv" : "Deaktiviert"}
                </span>
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
                  {g.image_count > 0 ? (
                    <>
                      {g.image_count} Bild{g.image_count === 1 ? "" : "er"}
                    </>
                  ) : (
                    <span className="text-[var(--fg-3)] italic">Noch keine Bilder</span>
                  )}
                  {(g.feedback_count ?? 0) > 0 ? (
                    <>
                      {" · "}
                      <span className="text-[var(--warn)]">
                        {g.feedback_count} offene Rev.
                      </span>
                    </>
                  ) : null}
                </div>
              )}
              <div className="gal-foot" style={{ marginTop: "auto" }}>
                <span className="gal-expires">Aktual. {fmtDateShort(g.updated_at)}</span>
              </div>
            </div>
            <div className="gal-actions">
              <button
                type="button"
                className="icon-btn"
                title={copyFlashId === g.id ? "Kopiert" : "Link kopieren"}
                aria-label={copyFlashId === g.id ? "Link kopiert" : "Link kopieren"}
                onClick={() => onCopyLink(g)}
              >
                <i
                  className={copyFlashId === g.id ? "fa-solid fa-check" : "fa-solid fa-globe"}
                  aria-hidden
                />
              </button>
              <Link
                to={buildEditHref(g.id)}
                className="btn-outline-gold"
                style={{ fontSize: 12, padding: "4px 10px" }}
              >
                Bearbeiten
              </Link>
              <button
                type="button"
                className="icon-btn text-red-600"
                title="Löschen"
                aria-label="Listing löschen"
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
