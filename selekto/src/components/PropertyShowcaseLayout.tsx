import { useCallback, useEffect, useRef, useState } from "react";
import { nextcloudPublicShareFolderZipUrl } from "../demo/nextcloudShare";
import { isMp4VideoUrl } from "../demo/parsing";
import type { FloorPlanItem } from "../demo/demoTypes";
import type { GalleryItem } from "../data.ts";
import { Gallery } from "./Gallery.tsx";
import { Header } from "./Header.tsx";
import { Hero } from "./Hero.tsx";
import { ImmersiveSection } from "./ImmersiveSection.tsx";
import { Lightbox } from "./Lightbox.tsx";
import { Toast } from "./Toast.tsx";
import { usePageEnter } from "../hooks/usePageEnter.ts";
import { useTheme } from "../hooks/useTheme.ts";

export type PropertyShowcaseLayoutProps = {
  title: string;
  address: string;
  standDisplay: string;
  matterportSrc: string;
  videoUrl: string;
  gallery: GalleryItem[];
  heroSlides: string[];
  photoCount: number;
  floorPlanCount: number;
  tourCount: number;
  floorPlans: FloorPlanItem[];
  /** Magic-Link: Backpanel ausblenden */
  showBackpanel?: boolean;
  /**
   * Magic-Link: Propus-Cloud-Freigabe-URL → «Alle Medien» startet ZIP-Download des Ordners.
   * Weglassen = Demo-Modus (nur Toast).
   */
  cloudShareUrl?: string | null;
  /** Magic-Link: Kunden-Feedback zu Bildern (Lightbox) und Grundrissen */
  listingFeedback?: { galleryId: string; gallerySlug: string } | null;
  /** Query `?bild=` – öffnet Lightbox auf diesem Bild */
  clientDeepLinkImageId?: string | null;
  /** Query `?grundriss=` – öffnet Grundriss-Modal (0-basierter Index) */
  clientDeepLinkFloorIndex?: number | null;
  /**
   * Magic-Link: nach Klick auf «Alle Medien herunterladen», wenn ein ZIP über die Cloud-Freigabe gestartet wird.
   * (IndexedDB / Kunden-Log Schritt 3.)
   */
  onClientZipDownloadStarted?: () => void;
};

/** Identisches Layout wie die Objekt-Demo auf `/` (Hero, Statistik, Immersive, Galerie, Download, Footer). */
export function PropertyShowcaseLayout({
  title,
  address,
  standDisplay,
  matterportSrc,
  videoUrl,
  gallery,
  heroSlides,
  photoCount,
  floorPlanCount,
  tourCount,
  floorPlans,
  showBackpanel = true,
  cloudShareUrl,
  listingFeedback = null,
  clientDeepLinkImageId = null,
  clientDeepLinkFloorIndex = null,
  onClientZipDownloadStarted,
}: PropertyShowcaseLayoutProps) {
  const { isDark, toggle } = useTheme();
  const { mainRef, footerRef } = usePageEnter();
  const deepLinkHandledRef = useRef(false);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [floorLightboxOpen, setFloorLightboxOpen] = useState(false);
  const [floorLightboxIndex, setFloorLightboxIndex] = useState(0);

  const hasMp4Video = isMp4VideoUrl(videoUrl);

  useEffect(() => {
    setLightboxIndex((i) => {
      if (gallery.length === 0) return 0;
      return Math.min(i, gallery.length - 1);
    });
  }, [gallery.length]);

  const handleDownloadAll = useCallback(() => {
    if (cloudShareUrl === undefined) {
      setToast("Ihr Download wird vorbereitet.");
      window.setTimeout(() => setToast(null), 3200);
      return;
    }
    const trimmed = (cloudShareUrl ?? "").trim();
    if (!trimmed) {
      setToast("Kein Cloud-Freigabe-Link hinterlegt. Bitte im Backpanel speichern.");
      window.setTimeout(() => setToast(null), 4500);
      return;
    }
    const zipUrl = nextcloudPublicShareFolderZipUrl(trimmed);
    if (!zipUrl) {
      setToast("Freigabe-Link wird nicht als Nextcloud-URL erkannt.");
      window.setTimeout(() => setToast(null), 4500);
      return;
    }
    setToast("ZIP-Download startet …");
    const a = document.createElement("a");
    a.href = zipUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    onClientZipDownloadStarted?.();
    window.setTimeout(() => setToast(null), 3500);
  }, [cloudShareUrl, onClientZipDownloadStarted]);

  const openLightbox = useCallback((index: number) => {
    setFloorLightboxOpen(false);
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  const openFloorLightbox = useCallback((index: number) => {
    setLightboxOpen(false);
    setFloorLightboxIndex(index);
    setFloorLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  const closeFloorLightbox = useCallback(() => setFloorLightboxOpen(false), []);

  const prevLightbox = useCallback(() => {
    if (gallery.length === 0) return;
    setLightboxIndex((i) => (i - 1 + gallery.length) % gallery.length);
  }, [gallery.length]);

  const nextLightbox = useCallback(() => {
    if (gallery.length === 0) return;
    setLightboxIndex((i) => (i + 1) % gallery.length);
  }, [gallery.length]);

  const prevFloorLightbox = useCallback(() => {
    if (floorPlans.length === 0) return;
    setFloorLightboxIndex((i) => (i - 1 + floorPlans.length) % floorPlans.length);
  }, [floorPlans.length]);

  const nextFloorLightbox = useCallback(() => {
    if (floorPlans.length === 0) return;
    setFloorLightboxIndex((i) => (i + 1) % floorPlans.length);
  }, [floorPlans.length]);

  useEffect(() => {
    deepLinkHandledRef.current = false;
  }, [clientDeepLinkImageId, clientDeepLinkFloorIndex]);

  useEffect(() => {
    if (!listingFeedback || deepLinkHandledRef.current) return;
    const bild = clientDeepLinkImageId?.trim();
    if (bild) {
      const idx = gallery.findIndex((it) => it.imageId === bild);
      if (idx >= 0) {
        deepLinkHandledRef.current = true;
        setLightboxIndex(idx);
        setLightboxOpen(true);
        window.requestAnimationFrame(() => {
          document.getElementById("galerie")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return;
    }
    if (clientDeepLinkFloorIndex != null && floorPlans[clientDeepLinkFloorIndex]) {
      deepLinkHandledRef.current = true;
      setLightboxOpen(false);
      setFloorLightboxIndex(clientDeepLinkFloorIndex);
      setFloorLightboxOpen(true);
    }
  }, [listingFeedback, clientDeepLinkImageId, clientDeepLinkFloorIndex, gallery, floorPlans]);

  return (
    <>
      <a className="skip-link" href="#main">
        Zum Inhalt
      </a>

      <Header isDark={isDark} onToggleTheme={toggle} showBackpanel={showBackpanel} />

      <main id="main" ref={mainRef}>
        <Hero
          title={title}
          address={address}
          standDisplay={standDisplay}
          photoCount={photoCount}
          videoCount={hasMp4Video ? 1 : 0}
          floorPlanCount={floorPlanCount}
          tourCount={tourCount}
          heroSlides={heroSlides}
          onDownload={handleDownloadAll}
        />

        <ImmersiveSection
          matterportSrc={matterportSrc}
          videoUrl={videoUrl}
          floorPlans={floorPlans}
          listingFeedback={listingFeedback}
          onFloorPlanOpen={(index) => openFloorLightbox(index)}
        />

        <section className="value" id="galerie" aria-labelledby="gallery-title">
          <div className="u-container">
            <header className="intro-block">
              <p className="u-eyebrow">Immobilienfotografie</p>
              <h2 id="gallery-title">Fotos</h2>
              <div className="divider-gold" aria-hidden="true" />
              <p className="intro-block__lede">
                Schauen Sie sich die Aufnahmen in Ruhe an – ein Klick öffnet die volle Bildansicht.
              </p>
            </header>
            <Gallery items={gallery} onOpen={openLightbox} clientQuiet={Boolean(listingFeedback)} />
          </div>
        </section>

        <section className="u-section" id="download" aria-labelledby="download-title">
          <div className="u-container">
            <header className="intro-block">
              <p className="u-eyebrow">Alles zusammen</p>
              <h2 id="download-title">Download</h2>
              <div className="divider-gold" aria-hidden="true" />
              <p className="intro-block__lede">
                Sämtliche Fotos und dazugehörige Unterlagen erhalten Sie gebündelt in einem Paket.
              </p>
            </header>
            <div className="download-actions">
              <button type="button" className="btn btn--outline btn--xl" onClick={handleDownloadAll}>
                Alle Medien herunterladen
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer" role="contentinfo" ref={footerRef}>
        <div className="u-container site-footer__inner">
          <p>
            Bereitgestellt von{" "}
            <a
              className="site-footer__brand-link"
              href="https://www.propus.ch/"
              target="_blank"
              rel="noreferrer"
            >
              Propus Real Estate Photography
            </a>
          </p>
        </div>
      </footer>

      <Lightbox
        open={lightboxOpen}
        variant="gallery"
        gallery={gallery}
        index={lightboxIndex}
        onClose={closeLightbox}
        onPrev={prevLightbox}
        onNext={nextLightbox}
        listingFeedback={listingFeedback ?? undefined}
      />

      {floorPlans.length > 0 ? (
        <Lightbox
          open={floorLightboxOpen}
          variant="floorplans"
          floorPlans={floorPlans}
          index={floorLightboxIndex}
          onClose={closeFloorLightbox}
          onPrev={prevFloorLightbox}
          onNext={nextFloorLightbox}
          listingFeedback={listingFeedback ?? undefined}
        />
      ) : null}

      <Toast message={toast} />
    </>
  );
}
