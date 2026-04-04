import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PropertyShowcaseLayout } from "../../components/listing/PropertyShowcaseLayout";
import { Header } from "../../components/listing/Header";
import { heroSlidesFromGallery } from "../../components/listing/demo/parsing";
import type { GalleryItem } from "../../components/listing/data";
import { useTheme } from "../../components/listing/hooks/useTheme";
import {
  getPublicGalleryBySlug,
  imageUrl,
  recordDownloaded,
  recordViewed,
} from "../../api/listingPublic";
import type { PublicGalleryPayload } from "../../components/listing/types";

function dateOnlyFromIso(iso: string): string {
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "long" }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function ClientListingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const deepLinkBild = searchParams.get("bild")?.trim() || null;
  const grundrissRaw = searchParams.get("grundriss");
  const deepLinkGrundriss =
    grundrissRaw != null && grundrissRaw !== ""
      ? (() => {
          const n = Number.parseInt(grundrissRaw, 10);
          return Number.isFinite(n) && n >= 0 ? n : null;
        })()
      : null;
  const { isDark, toggle } = useTheme();

  const [data, setData] = useState<PublicGalleryPayload | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (!slug) {
      setData(null);
      return;
    }
    const row = await getPublicGalleryBySlug(slug);
    setData(row);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data?.id || !slug) return;
    void recordViewed(slug);
  }, [data?.id, slug]);

  useEffect(() => {
    const metaRobots = document.createElement("meta");
    metaRobots.name = "robots";
    metaRobots.content = "noindex, nofollow, noarchive";
    document.head.appendChild(metaRobots);
    const prevTitle = document.title;
    document.title = data?.title ? `${data.title} – Propus` : "Galerie – Propus";
    return () => {
      metaRobots.remove();
      document.title = prevTitle;
    };
  }, [data]);

  const galleryItems: GalleryItem[] = useMemo(() => {
    if (!data?.images?.length || !slug) return [];
    let n = 0;
    return data.images.map((im) => {
      n += 1;
      const cat = im.category?.trim();
      return {
        src: imageUrl(slug, im.id),
        label: cat || `Bild ${n}`,
        imageId: im.id,
      };
    });
  }, [data, slug]);

  const heroSlides = useMemo(() => heroSlidesFromGallery(galleryItems, 4), [galleryItems]);

  const onZipDownloadStarted = useCallback(() => {
    if (slug) void recordDownloaded(slug);
  }, [slug]);

  const shell = (inner: ReactNode) => (
    <>
      <a className="skip-link" href="#main">
        Zum Inhalt
      </a>
      <Header isDark={isDark} onToggleTheme={toggle} showBackpanel={false} />
      {inner}
    </>
  );

  if (data === undefined) {
    return shell(
      <main id="main">
        <section className="value">
          <div className="u-container">
            <p className="intro-block__lede" style={{ marginTop: "2rem" }}>
              Laden…
            </p>
          </div>
        </section>
      </main>,
    );
  }

  if (!data) {
    return shell(
      <main id="main">
        <section className="value">
          <div className="u-container">
            <header className="intro-block">
              <h2>Galerie</h2>
              <div className="divider-gold" aria-hidden="true" />
              <p className="intro-block__lede">Diese Galerie ist nicht verfügbar oder wurde deaktiviert.</p>
            </header>
          </div>
        </section>
      </main>,
    );
  }

  const address = data.address?.trim() || "\u00a0";
  const standDisplay = dateOnlyFromIso(data.updated_at);

  return (
    <PropertyShowcaseLayout
      title={data.title}
      address={address}
      standDisplay={standDisplay}
      matterportSrc={data.matterport_src}
      videoUrl={data.video_url}
      gallery={galleryItems}
      heroSlides={heroSlides}
      photoCount={galleryItems.length}
      floorPlanCount={data.floor_plans.length}
      tourCount={data.matterport_src.trim() ? 1 : 0}
      floorPlans={data.floor_plans}
      showBackpanel={false}
      cloudShareUrl={data.cloud_share_url}
      onClientZipDownloadStarted={onZipDownloadStarted}
      listingFeedback={slug ? { galleryId: data.id, gallerySlug: slug } : null}
      clientDeepLinkImageId={deepLinkBild}
      clientDeepLinkFloorIndex={deepLinkGrundriss}
    />
  );
}
