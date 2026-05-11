import { useEffect } from "react";
import type { ClientGalleryRow } from "../../../components/listing/types";

type SingleProps = {
  gallery: ClientGalleryRow | null;
  galleries?: undefined;
  onClose: () => void;
  onConfirm: () => void;
};

type BulkProps = {
  gallery?: undefined;
  galleries: Pick<ClientGalleryRow, "id" | "title">[];
  onClose: () => void;
  onConfirm: () => void;
};

type Props = SingleProps | BulkProps;

export function BildauswahlDeleteConfirmModal(props: Props) {
  const { onClose, onConfirm } = props;
  const galleries = props.galleries;
  const gallery = props.gallery;
  const isBulk = Array.isArray(galleries);
  const open = isBulk ? galleries.length > 0 : Boolean(gallery);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const bulkCount = isBulk ? galleries.length : 0;
  const titleText =
    isBulk
      ? `${bulkCount} Listing${bulkCount === 1 ? "" : "s"} löschen?`
      : `«${gallery!.title?.trim() || "Diese Galerie"}» löschen?`;

  const previewTitles = isBulk
    ? galleries.slice(0, 5).map((g) => g.title?.trim() || `Listing ${g.id.slice(0, 6)}`)
    : [];
  const remainingCount = isBulk ? Math.max(0, bulkCount - previewTitles.length) : 0;

  return (
    <div className="gal-admin-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="gal-admin-modal gal-admin-modal--delete gal-admin-delete-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="gal-delete-title"
        aria-describedby="gal-delete-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gal-admin-delete-modal__icon" aria-hidden={true}>
          <svg width={18} height={18} viewBox="0 0 16 16" fill="none">
            <path
              d="M8 5v4M8 11v.5"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            <path
              d="M6.8 2.5h2.4c.3 0 .5.1.7.3l4.8 8.3c.4.7-.1 1.4-.9 1.4H2.2c-.8 0-1.3-.8-.9-1.4l4.8-8.3c.2-.2.4-.3.7-.3z"
              stroke="currentColor"
              strokeWidth={1.2}
            />
          </svg>
        </div>

        <p id="gal-delete-title" className="gal-admin-delete-modal__title">
          {titleText}
        </p>
        <p id="gal-delete-desc" className="gal-admin-delete-modal__lead">
          Diese Aktion kann nicht rückgängig gemacht werden.{" "}
          {isBulk
            ? "Die ausgewählten Listings werden dauerhaft aus dem System entfernt."
            : "Die Galerie wird dauerhaft aus dem System entfernt."}
        </p>

        {isBulk ? (
          <ul
            style={{
              margin: "0 0 16px 0",
              padding: "8px 12px",
              background: "var(--paper-strip, #f5f5f4)",
              borderRadius: 6,
              fontSize: 13,
              listStyle: "disc inside",
              maxHeight: 180,
              overflowY: "auto",
            }}
          >
            {previewTitles.map((t, i) => (
              <li key={i} style={{ padding: "2px 0" }}>
                {t}
              </li>
            ))}
            {remainingCount > 0 ? (
              <li style={{ padding: "2px 0", listStyle: "none", color: "var(--fg-3)" }}>
                … und {remainingCount} weitere
              </li>
            ) : null}
          </ul>
        ) : null}

        <div className="gal-admin-delete-modal__actions">
          <button type="button" className="admin-btn admin-btn--outline" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="admin-btn admin-btn--danger" onClick={onConfirm}>
            {isBulk ? `Ja, ${bulkCount} löschen` : "Ja, löschen"}
          </button>
        </div>
      </div>
    </div>
  );
}
