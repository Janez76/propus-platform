import { useEffect, useRef, useState } from "react";
import type { FloorPlanItem } from "../demo/demoTypes";
import { lightboxSrcFromGallery, type GalleryItem } from "../data";
import { ClientAssetFeedbackChat } from "./ClientAssetFeedbackChat.tsx";
import { LightboxFloorPlanCanvas } from "./LightboxFloorPlanCanvas.tsx";

type LightboxBase = {
  open: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** Nur Kunden-Galerie (Magic Link): Feedback zu Bildern oder Grundrissen */
  listingFeedback?: {
    galleryId: string;
    gallerySlug: string;
  };
};

export type LightboxProps = LightboxBase &
  (
    | {
        variant: "gallery";
        gallery: GalleryItem[];
        index: number;
      }
    | {
        variant: "floorplans";
        floorPlans: FloorPlanItem[];
        index: number;
      }
  );

export function Lightbox(props: LightboxProps) {
  const { open, onClose, onPrev, onNext, listingFeedback, variant } = props;
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [feedbackPopupOpen, setFeedbackPopupOpen] = useState(false);

  const len = variant === "gallery" ? props.gallery.length : props.floorPlans.length;
  const safeIndex = len > 0 ? ((props.index % len) + len) % len : 0;

  const galleryItem = variant === "gallery" && open && len > 0 ? props.gallery[safeIndex] : undefined;
  const floorItem = variant === "floorplans" && open && len > 0 ? props.floorPlans[safeIndex] : undefined;

  const imageId = galleryItem?.imageId?.trim();
  const showFeedback =
    Boolean(listingFeedback) &&
    (variant === "gallery" ? Boolean(imageId) : Boolean(floorItem));

  useEffect(() => {
    if (!open) {
      document.documentElement.style.overflow = "";
      setFeedbackPopupOpen(false);
      return;
    }
    document.documentElement.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    setFeedbackPopupOpen(false);
  }, [safeIndex, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (feedbackPopupOpen) {
          e.preventDefault();
          setFeedbackPopupOpen(false);
          return;
        }
        onClose();
      }
      if (feedbackPopupOpen) return;
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, onPrev, onNext, feedbackPopupOpen]);

  if (!open || len === 0) return null;
  if (variant === "gallery" && !galleryItem) return null;
  if (variant === "floorplans" && !floorItem) return null;

  const ariaLabel =
    variant === "floorplans"
      ? showFeedback
        ? "Grundrissvorschau"
        : "Vollbildansicht Grundriss"
      : showFeedback
        ? "Bildvorschau"
        : "Vollbildansicht";

  const navPrevLabel = variant === "floorplans" ? "Vorheriger Grundriss" : "Vorheriges Bild";
  const navNextLabel = variant === "floorplans" ? "Nächster Grundriss" : "Nächstes Bild";

  const mainColWide = showFeedback || variant === "floorplans";

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <div className="lightbox__backdrop" tabIndex={-1} onClick={onClose} aria-hidden="true" />
      <div className="lightbox__stage">
        <div className={`lightbox__main-col${mainColWide ? " lightbox__main-col--wide" : ""}`}>
          <div className="lightbox__preview-row">
            <button
              type="button"
              className="lightbox__nav lightbox__nav--beside lightbox__nav--prev"
              onClick={onPrev}
              aria-label={navPrevLabel}
            >
              ‹
            </button>
            <figure
              className={`lightbox__figure${variant === "floorplans" ? " lightbox__figure--floor" : ""}`}
            >
              {variant === "gallery" && galleryItem ? (
                <>
                  <div className="lightbox__figure-stack">
                    <div className="lightbox__figure-head">
                      <button
                        ref={closeBtnRef}
                        type="button"
                        className="lightbox__nav lightbox__close"
                        onClick={onClose}
                        aria-label="Schließen"
                      >
                        <i className="fa-solid fa-xmark lightbox__close__fa" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="lightbox__media-wrap">
                      <img
                        className="lightbox__img"
                        src={lightboxSrcFromGallery(galleryItem.src)}
                        alt={galleryItem.label}
                      />
                    </div>
                  </div>
                  <figcaption className="lightbox__cap">{galleryItem.label}</figcaption>
                </>
              ) : variant === "floorplans" && floorItem ? (
                <>
                  <div className="lightbox__figure-stack">
                    <div className="lightbox__figure-head">
                      <button
                        ref={closeBtnRef}
                        type="button"
                        className="lightbox__nav lightbox__close"
                        onClick={onClose}
                        aria-label="Schließen"
                      >
                        <i className="fa-solid fa-xmark lightbox__close__fa" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="lightbox__media-wrap">
                      <LightboxFloorPlanCanvas
                        key={`${floorItem.url}-${safeIndex}`}
                        remotePdfUrl={floorItem.url}
                        label={floorItem.title?.trim() || `Grundriss ${safeIndex + 1}`}
                      />
                    </div>
                  </div>
                  <figcaption className="lightbox__cap">
                    {floorItem.title?.trim() || `Grundriss ${safeIndex + 1}`}
                  </figcaption>
                </>
              ) : null}
            </figure>
            <button
              type="button"
              className="lightbox__nav lightbox__nav--beside lightbox__nav--next"
              onClick={onNext}
              aria-label={navNextLabel}
            >
              ›
            </button>
          </div>
          {showFeedback && listingFeedback ? (
            <div className="lightbox__feedback-invite">
              <p className="lightbox__feedback-invite-text">
                {variant === "floorplans"
                  ? "Gibt es etwas, das Ihnen an diesem Grundriss nicht gefällt?"
                  : "Gibt es etwas, das Ihnen an diesem Bild nicht gefällt?"}
              </p>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => setFeedbackPopupOpen(true)}>
                Anmerkung schreiben
              </button>
            </div>
          ) : null}
        </div>
        <div className="lightbox__chrome" aria-hidden="true">
          <span>
            {safeIndex + 1} / {len}
          </span>
        </div>
      </div>

      {showFeedback && feedbackPopupOpen && listingFeedback && galleryItem && variant === "gallery" ? (
        <div
          className="lightbox-feedback-popup"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lightbox-feedback-popup-title"
        >
          <button
            type="button"
            className="lightbox-feedback-popup__backdrop"
            aria-label="Anmerkung schließen"
            onClick={() => setFeedbackPopupOpen(false)}
          />
          <div className="lightbox-feedback-popup__panel" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-feedback-popup__head">
              <h2 id="lightbox-feedback-popup-title" className="lightbox-feedback-popup__title">
                Anmerkung zum Bild
              </h2>
              <button
                type="button"
                className="lightbox-feedback-popup__close btn btn--icon-flat"
                onClick={() => setFeedbackPopupOpen(false)}
                aria-label="Schließen"
              >
                ×
              </button>
            </div>
            <div className="lightbox-feedback-popup__body">
              <ClientAssetFeedbackChat
                galleryId={listingFeedback.galleryId}
                gallerySlug={listingFeedback.gallerySlug}
                asset_type="image"
                asset_key={imageId!}
                asset_label={galleryItem.label}
              />
            </div>
          </div>
        </div>
      ) : null}

      {showFeedback && feedbackPopupOpen && listingFeedback && floorItem && variant === "floorplans" ? (
        <div
          className="lightbox-feedback-popup"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lightbox-floor-feedback-popup-title"
        >
          <button
            type="button"
            className="lightbox-feedback-popup__backdrop"
            aria-label="Anmerkung schließen"
            onClick={() => setFeedbackPopupOpen(false)}
          />
          <div className="lightbox-feedback-popup__panel" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-feedback-popup__head">
              <h2 id="lightbox-floor-feedback-popup-title" className="lightbox-feedback-popup__title">
                Anmerkung zum Grundriss
              </h2>
              <button
                type="button"
                className="lightbox-feedback-popup__close btn btn--icon-flat"
                onClick={() => setFeedbackPopupOpen(false)}
                aria-label="Schließen"
              >
                ×
              </button>
            </div>
            <div className="lightbox-feedback-popup__body">
              <ClientAssetFeedbackChat
                galleryId={listingFeedback.galleryId}
                gallerySlug={listingFeedback.gallerySlug}
                asset_type="floor_plan"
                asset_key={`fp:${safeIndex}`}
                asset_label={floorItem.title?.trim() || `Grundriss ${safeIndex + 1}`}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
