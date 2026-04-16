import { useEffect } from "react";
import type { ClientGalleryRow } from "../../lib/selekto/types";

type Props = {
  gallery: ClientGalleryRow | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function SelektoDeleteConfirmModal({ gallery, onClose, onConfirm }: Props) {
  useEffect(() => {
    if (!gallery) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [gallery, onClose]);

  if (!gallery) return null;

  const title = gallery.title?.trim() || "Diese Galerie";

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
          «{title}» löschen?
        </p>
        <p id="gal-delete-desc" className="gal-admin-delete-modal__lead">
          Diese Aktion kann nicht rückgängig gemacht werden. Die Galerie wird dauerhaft aus dem System entfernt.
        </p>

        <div className="gal-admin-delete-modal__actions">
          <button type="button" className="admin-btn admin-btn--outline" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="admin-btn admin-btn--danger" onClick={onConfirm}>
            Ja, löschen
          </button>
        </div>
      </div>
    </div>
  );
}
