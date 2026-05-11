import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PicdropSelectionView, type PicdropImage } from "../../components/selekto/PicdropSelectionView";
import {
  getOrCreateWatermarkedThumb,
  getPublicGalleryBySlug,
  getThumbSourcesForImage,
  recordGalleryClientViewed,
  revokeBlobUrlForImage,
} from "../../lib/selekto/galleryApi";
import type { PublicGalleryPayload } from "../../lib/selekto/types";

function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 26% 34%)`;
}

function imageLabelFromPayload(im: { id: string; category: string | null }, index: number): string {
  const cat = im.category?.trim();
  if (cat) return cat;
  return `Bild ${index + 1}`;
}

export function ClientSelektoPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const deepLinkBild = searchParams.get("bild")?.trim() || null;

  const [data, setData] = useState<PublicGalleryPayload | null | undefined>(undefined);
  const [urls, setUrls] = useState<Record<string, string[]>>({});
  const [mediaLoading, setMediaLoading] = useState(true);
  /** Wenn Einbrennen scheitert (z. B. CORS), CSS-Wasserzeichen in Picdrop nutzen. */
  const [wmBurnUseCssOverlay, setWmBurnUseCssOverlay] = useState(false);
  const prevLoadedIdsRef = useRef<string[]>([]);
  const wmBlobUrlsRef = useRef<string[]>([]);

  const revokeClientWmBlobs = useCallback(() => {
    for (const u of wmBlobUrlsRef.current) {
      if (u.startsWith("blob:")) URL.revokeObjectURL(u);
    }
    wmBlobUrlsRef.current = [];
  }, []);

  const load = useCallback(async () => {
    if (!slug) {
      for (const id of prevLoadedIdsRef.current) {
        revokeBlobUrlForImage(id);
      }
      revokeClientWmBlobs();
      prevLoadedIdsRef.current = [];
      setData(null);
      return;
    }
    for (const id of prevLoadedIdsRef.current) {
      revokeBlobUrlForImage(id);
    }
    revokeClientWmBlobs();
    prevLoadedIdsRef.current = [];
    const row = await getPublicGalleryBySlug(slug);
    prevLoadedIdsRef.current = row?.images.map((i) => i.id) ?? [];
    setData(row);
  }, [slug, revokeClientWmBlobs]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data?.id) return;
    void recordGalleryClientViewed(data.id);
  }, [data?.id]);

  useEffect(() => {
    return () => {
      for (const id of prevLoadedIdsRef.current) {
        revokeBlobUrlForImage(id);
      }
      for (const u of wmBlobUrlsRef.current) {
        if (u.startsWith("blob:")) URL.revokeObjectURL(u);
      }
      wmBlobUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    if (data.images.length === 0) {
      revokeClientWmBlobs();
      setUrls({});
      setWmBurnUseCssOverlay(false);
      setMediaLoading(false);
      return;
    }
    let cancelled = false;
    setMediaLoading(true);
    revokeClientWmBlobs();
    setWmBurnUseCssOverlay(false);
    setUrls({});

    const shareRef = data.cloud_share_url ?? null;
    const wmOn = data.watermark_enabled !== false;

    (async () => {
      const rawByImage = new Map<string, string[]>();
      await Promise.all(
        data.images.map(async (im) => {
          const list = await getThumbSourcesForImage(im.id, shareRef);
          if (list.length) rawByImage.set(im.id, list);
        }),
      );
      if (cancelled) return;

      /** Bilder ohne Watermark sofort anzeigen — keine sequentielle Schleife mehr. */
      if (!wmOn) {
        const next: Record<string, string[]> = {};
        for (const [id, list] of rawByImage) next[id] = list;
        setUrls(next);
        setWmBurnUseCssOverlay(false);
        setMediaLoading(false);
        return;
      }

      /**
       * Mit Watermark: Cache-Hits sind quasi instant, Misses laufen parallel.
       * Jedes Bild aktualisiert seine Karte einzeln (progressive Anzeige), damit
       * die Galerie nicht erst nach dem letzten Bild «aufhört zu spinnen».
       */
      let pending = data.images.length;
      let anyFail = false;
      const settleOne = () => {
        pending -= 1;
        if (pending <= 0 && !cancelled) {
          setWmBurnUseCssOverlay(anyFail);
          setMediaLoading(false);
        }
      };

      await Promise.all(
        data.images.map(async (im) => {
          const list = rawByImage.get(im.id);
          if (!list?.length) {
            settleOne();
            return;
          }
          const first = list[0];
          const burned = await getOrCreateWatermarkedThumb(im.id, first);
          if (cancelled) {
            if (burned?.startsWith("blob:")) URL.revokeObjectURL(burned);
            return;
          }
          if (burned) {
            wmBlobUrlsRef.current.push(burned);
            setUrls((prev) => ({ ...prev, [im.id]: [burned] }));
          } else {
            anyFail = true;
            /** Fallback: ungewaschene Quelle anzeigen, CSS-Overlay-Watermark übernimmt. */
            setUrls((prev) => ({ ...prev, [im.id]: list }));
          }
          settleOne();
        }),
      );
    })();
    return () => {
      cancelled = true;
      revokeClientWmBlobs();
    };
  }, [data, revokeClientWmBlobs]);

  const picdropImages: PicdropImage[] = useMemo(() => {
    if (!data?.images?.length) return [];
    const sorted = [...data.images].sort((a, b) =>
      a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : 0,
    );
    return sorted.map((im, idx) => {
      const list = urls[im.id];
      const primary = list?.[0]?.trim() || "";
      return {
        key: im.id,
        name: imageLabelFromPayload(im, idx),
        thumbUrl: primary || null,
        thumbFallbacks: list && list.length > 1 ? list.slice(1) : undefined,
        placeholderColor: hashColor(im.id),
      };
    });
  }, [data, urls]);

  useEffect(() => {
    const metaRobots = document.createElement("meta");
    metaRobots.name = "robots";
    metaRobots.content = "noindex, nofollow, noarchive";
    document.head.appendChild(metaRobots);
    const prevTitle = document.title;
    document.title = data?.title ? `${data.title} · Propus` : "Bildauswahl · Propus";
    return () => {
      metaRobots.remove();
      document.title = prevTitle;
    };
  }, [data]);

  if (data === undefined) {
    return (
      <PicdropSelectionView
        projectTitle="…"
        images={[]}
        loading={true}
        customerMode={true}
      />
    );
  }

  if (!data) {
    return (
      <div className="pd-page" style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "36rem", margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.25rem" }}>Bildauswahl</h1>
        <p style={{ color: "#666" }}>Dieser Link ist nicht verfügbar oder die Auswahl wurde deaktiviert.</p>
      </div>
    );
  }

  return (
    <PicdropSelectionView
      projectTitle={data.title}
      images={picdropImages}
      loading={mediaLoading}
      customerMode={true}
      initialOpenImageKey={deepLinkBild}
      galleryId={data.id}
      gallerySlug={slug ?? null}
      initialPicdropDraftJson={data.picdrop_selection_json ?? null}
      watermarkEnabled={wmBurnUseCssOverlay}
    />
  );
}
