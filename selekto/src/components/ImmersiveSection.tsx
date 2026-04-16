import { memo, useMemo } from "react";
import type { FloorPlanItem } from "../demo/demoTypes";
import { isMp4VideoUrl, resolvePlayableMp4Url } from "../demo/parsing";
import { FloorPlanPdfThumb } from "./FloorPlanPdfThumb";

type ImmersiveSectionProps = {
  matterportSrc: string;
  videoUrl: string;
  floorPlans: FloorPlanItem[];
  /** Magic-Link: Hinweistext auf der Karte */
  listingFeedback?: { galleryId: string; gallerySlug: string } | null;
  /** Öffnet dieselbe Vollbild-Lightbox wie bei den Fotos */
  onFloorPlanOpen: (index: number) => void;
};

function copyBlock(showMp: boolean, showVid: boolean, showFp: boolean) {
  if (showMp && showVid && showFp) {
    return {
      eyebrow: "Rundgang & Medien",
      title: "Rundgang, Video und Grundrisse",
      lede:
        "Virtueller Rundgang, Kurzvideo und Grundrisse – alles, was in dieser Unterlage enthalten ist.",
    };
  }
  if (showMp && showVid) {
    return {
      eyebrow: "Rundgang & Medien",
      title: "Rundgang und Video",
      lede: "3D-Rundgang und Kurzvideo – ohne weitere Medien in dieser Freigabe.",
    };
  }
  if (showMp && showFp) {
    return {
      eyebrow: "Rundgang & Medien",
      title: "Rundgang und Grundrisse",
      lede: "Virtuell durch die Räume und die PDF-Grundrisse – übersichtlich an einem Ort.",
    };
  }
  if (showVid && showFp) {
    return {
      eyebrow: "Medien",
      title: "Video und Grundrisse",
      lede: "Kurzvideo und Grundrisse – ohne 3D-Rundgang in dieser Unterlage.",
    };
  }
  if (showMp) {
    return {
      eyebrow: "Rundgang",
      title: "3D-Rundgang",
      lede: "Virtuell durch die Räume – weitere Medien (Video, PDF) sind hier nicht hinterlegt.",
    };
  }
  if (showVid) {
    return {
      eyebrow: "Medien",
      title: "Video",
      lede: "Kurzvideo zur Immobilie – ohne Rundgang oder Grundrisse in dieser Unterlage.",
    };
  }
  return {
    eyebrow: "Unterlagen",
    title: "Grundrisse",
    lede: "PDF-Grundrisse zur Immobilie – ohne Rundgang oder Video in dieser Unterlage.",
  };
}

export const ImmersiveSection = memo(function ImmersiveSection({
  matterportSrc,
  videoUrl,
  floorPlans,
  listingFeedback = null,
  onFloorPlanOpen,
}: ImmersiveSectionProps) {
  const showMp = Boolean(matterportSrc?.trim());
  const showVid = isMp4VideoUrl(videoUrl);
  const mp4Src = resolvePlayableMp4Url(videoUrl);
  const showFp = floorPlans.length > 0;

  const visible = showMp || showVid || showFp;
  const { eyebrow, title, lede } = useMemo(
    () => copyBlock(showMp, showVid, showFp),
    [showMp, showVid, showFp],
  );

  const mediaCols = (showMp ? 1 : 0) + (showVid ? 1 : 0);
  const rowClass =
    mediaCols <= 1 ? "immersive-row immersive-row--single" : "immersive-row";

  const sectionId = showMp || showVid ? "rundgang" : "grundrisse";

  if (!visible) {
    return null;
  }

  return (
    <section className="u-section" id={sectionId} aria-labelledby="immersive-title">
      <div className="u-container">
        <header className="intro-block">
          <p className="u-eyebrow">{eyebrow}</p>
          <h2 id="immersive-title">{title}</h2>
          <div className="divider-gold" aria-hidden="true" />
          <p className="intro-block__lede">{lede}</p>
        </header>

        <div className="intro-block__after">
          {mediaCols > 0 ? (
            <div className={rowClass}>
              {showMp ? (
                <div className="immersive-col immersive-col--matterport">
                  <h3 className="immersive-col__label">3D-Rundgang</h3>
                  <div className="matterport-embed">
                    <iframe
                      title="Matterport 3D-Rundgang"
                      src={matterportSrc}
                      allow="fullscreen; xr-spatial-tracking"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                </div>
              ) : null}
              {showVid ? (
                <div className="immersive-col immersive-col--video">
                  <h3 className="immersive-col__label">Video</h3>
                  <div className="video-wrap video-wrap--side">
                    <video key={mp4Src} controls playsInline preload="metadata" autoPlay muted>
                      <source src={mp4Src} type="video/mp4" />
                      Dieses Video kann in Ihrem Browser nicht abgespielt werden.
                    </video>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {showFp ? (
            <div
              className="floorplans"
              id={showMp || showVid ? "grundrisse" : undefined}
            >
              <h3 className="floorplans__heading">Grundrisse</h3>
              <p className="floorplans__lede">
                Die wichtigsten Ebenen im Überblick.
                {listingFeedback
                  ? " Klicken Sie auf einen Grundriss für die Ansicht und Ihre Anmerkungen."
                  : " Klicken Sie auf einen Grundriss für die grosse Ansicht (wie bei den Fotos)."}
              </p>
              <div className="floorplan-grid" role="list">
                {floorPlans.map((fp, index) => {
                  const shortLabel = `Grundriss ${index + 1}`;
                  return (
                    <article
                      key={`${fp.url}-${index}`}
                      className="floorplan-card floorplan-card--clickable"
                      role="listitem"
                    >
                      <button
                        type="button"
                        className="floorplan-card__hit"
                        onClick={() => onFloorPlanOpen(index)}
                      >
                        <FloorPlanPdfThumb remotePdfUrl={fp.url} label={`Vorschau ${shortLabel}`} />
                        {listingFeedback ? null : (
                          <span className="floorplan-card__hint">Grössere Ansicht</span>
                        )}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
});
