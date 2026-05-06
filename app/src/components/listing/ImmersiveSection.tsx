import { memo, useMemo, useState } from "react";
import type { FloorPlanItem } from "./demo/demoTypes";
import { isMp4VideoUrl, resolvePlayableMp4Url } from "./demo/parsing";
import type { GalleryVideo } from "./types";
import { FloorPlanPdfThumb } from "./FloorPlanPdfThumb";

type ImmersiveSectionProps = {
  matterportSrc: string;
  videoUrl: string;
  /** Optional: mehrere Videos. Wenn nicht-leer, gewinnt es ueber `videoUrl`. */
  videos?: GalleryVideo[];
  floorPlans: FloorPlanItem[];
  /** Magic-Link: Hinweistext auf der Karte */
  listingFeedback?: { galleryId: string; gallerySlug: string } | null;
  /** Öffnet dieselbe Vollbild-Lightbox wie bei den Fotos */
  onFloorPlanOpen: (index: number) => void;
};

function MatterportCopyBar({ src }: { src: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(src);
      } else {
        const ta = document.createElement("textarea");
        ta.value = src;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* still */
    }
  };
  return (
    <div
      className="matterport-copy-bar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 10,
        padding: "8px 10px",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--color-bg-muted, #f6f5f0)",
      }}
    >
      <input
        type="text"
        value={src}
        readOnly
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Matterport-Link"
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
          background: "transparent",
          border: 0,
          outline: 0,
          color: "var(--color-text)",
        }}
      />
      <button
        type="button"
        onClick={onCopy}
        className="btn btn--outline"
        style={{
          fontSize: 12,
          padding: "4px 12px",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {copied ? (
          <>
            <i className="fa-solid fa-check mr-1.5" aria-hidden /> Kopiert
          </>
        ) : (
          <>
            <i className="fa-regular fa-copy mr-1.5" aria-hidden /> Kopieren
          </>
        )}
      </button>
    </div>
  );
}

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
  videos,
  floorPlans,
  listingFeedback = null,
  onFloorPlanOpen,
}: ImmersiveSectionProps) {
  const showMp = Boolean(matterportSrc?.trim());
  const playableVideos = useMemo(() => {
    const list = (videos ?? []).filter((v) => v?.url && isMp4VideoUrl(v.url));
    if (list.length > 0) {
      return list.map((v) => ({ title: v.title, src: resolvePlayableMp4Url(v.url) }));
    }
    if (isMp4VideoUrl(videoUrl)) {
      return [{ title: "Video", src: resolvePlayableMp4Url(videoUrl) }];
    }
    return [];
  }, [videos, videoUrl]);
  const showVid = playableVideos.length > 0;
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
                  <MatterportCopyBar src={matterportSrc} />
                </div>
              ) : null}
              {showVid ? (
                <div className="immersive-col immersive-col--video">
                  <h3 className="immersive-col__label">
                    {playableVideos.length === 1 ? "Video" : `Videos (${playableVideos.length})`}
                  </h3>
                  <div
                    className="video-stack"
                    style={{ display: "flex", flexDirection: "column", gap: 12 }}
                  >
                    {playableVideos.map((vid, idx) => (
                      <div key={`${vid.src}-${idx}`} className="video-wrap video-wrap--side">
                        {playableVideos.length > 1 ? (
                          <div
                            className="video-wrap__title"
                            style={{ fontSize: 13, color: "var(--fg-2, #555)", marginBottom: 4 }}
                          >
                            {vid.title}
                          </div>
                        ) : null}
                        <video key={vid.src} controls playsInline preload="metadata" muted>
                          <source src={vid.src} type="video/mp4" />
                          Dieses Video kann in Ihrem Browser nicht abgespielt werden.
                        </video>
                      </div>
                    ))}
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
                        <FloorPlanPdfThumb
                          remotePdfUrl={fp.url}
                          thumbUrl={fp.thumb_url}
                          label={`Vorschau ${shortLabel}`}
                        />
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
