import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  PicdropSelectionView,
  type PicdropImage,
  type PicdropSubmissionAdapter,
} from "../../components/selekto/PicdropSelectionView";
import { tryCreateWatermarkedBlobUrl } from "../../lib/selekto/clientWatermarkImage";
import {
  bildauswahlImageUrl,
  getPublicBildauswahlBySlug,
  recordBildauswahlViewed,
  saveBildauswahlDraft,
  submitBildauswahlSelection,
  type BildauswahlPublicPayload,
} from "../../api/bildauswahlPublic";

function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 26% 34%)`;
}

function imageLabel(im: { id: string; category: string | null }, index: number): string {
  return im.category?.trim() || `Bild ${index + 1}`;
}

/** Slim server-Variante, Pendant zu selekto/ClientSelektoPage aber via /api/bildauswahl. */
export function ClientBildauswahlPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const deepLinkBild = searchParams.get("bild")?.trim() || null;

  const [data, setData] = useState<BildauswahlPublicPayload | null | undefined>(undefined);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [urls, setUrls] = useState<Record<string, string[]>>({});
  const [wmBurnUseCssOverlay, setWmBurnUseCssOverlay] = useState(false);
  const wmBlobUrlsRef = useRef<string[]>([]);

  const revokeWmBlobs = useCallback(() => {
    for (const u of wmBlobUrlsRef.current) {
      if (u.startsWith("blob:")) URL.revokeObjectURL(u);
    }
    wmBlobUrlsRef.current = [];
  }, []);

  // Daten laden
  useEffect(() => {
    if (!slug) {
      setData(null);
      return;
    }
    void (async () => {
      const row = await getPublicBildauswahlBySlug(slug);
      setData(row);
    })();
  }, [slug]);

  // Beim Öffnen melden
  useEffect(() => {
    if (!slug || !data) return;
    void recordBildauswahlViewed(slug).catch(() => {});
  }, [slug, data]);

  // Bilder + Watermark
  useEffect(() => {
    if (!data) return;
    if (data.images.length === 0) {
      revokeWmBlobs();
      setUrls({});
      setMediaLoading(false);
      return;
    }
    let cancelled = false;
    setMediaLoading(true);
    revokeWmBlobs();
    setUrls({});
    setWmBurnUseCssOverlay(false);

    const wmOn = data.watermark_enabled !== false;
    const items = data.images.map((im) => ({
      id: im.id,
      src: bildauswahlImageUrl(data.slug, im.id, 1200),
    }));

    if (!wmOn) {
      const next: Record<string, string[]> = {};
      for (const it of items) next[it.id] = [it.src];
      setUrls(next);
      setMediaLoading(false);
      return;
    }

    let pending = items.length;
    let anyFail = false;
    const settleOne = () => {
      pending -= 1;
      if (pending <= 0 && !cancelled) {
        setWmBurnUseCssOverlay(anyFail);
        setMediaLoading(false);
      }
    };

    void Promise.all(
      items.map(async (it) => {
        const burned = await tryCreateWatermarkedBlobUrl(it.src);
        if (cancelled) {
          if (burned?.startsWith("blob:")) URL.revokeObjectURL(burned);
          return;
        }
        if (burned) {
          wmBlobUrlsRef.current.push(burned);
          setUrls((prev) => ({ ...prev, [it.id]: [burned] }));
        } else {
          anyFail = true;
          setUrls((prev) => ({ ...prev, [it.id]: [it.src] }));
        }
        settleOne();
      }),
    );

    return () => {
      cancelled = true;
      revokeWmBlobs();
    };
  }, [data, revokeWmBlobs]);

  useEffect(() => () => revokeWmBlobs(), [revokeWmBlobs]);

  const picdropImages: PicdropImage[] = useMemo(() => {
    if (!data?.images?.length) return [];
    const sorted = [...data.images].sort((a, b) => a.sort_order - b.sort_order);
    return sorted.map((im, idx) => {
      const list = urls[im.id];
      return {
        key: im.id,
        name: imageLabel(im, idx),
        thumbUrl: list?.[0] || null,
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

  // Submission-Adapter (server-API statt IndexedDB)
  const adapter: PicdropSubmissionAdapter | undefined = useMemo(() => {
    if (!data || !slug) return undefined;
    return {
      submit: async (items) => {
        await submitBildauswahlSelection(slug, items);
      },
      saveDraft: async (byId) => {
        const slim: Record<string, { f: string[]; m: Array<{ t: string; h: string }> }> = {};
        for (const [k, s] of Object.entries(byId)) {
          const f = s.flags.filter((x): x is "bearbeiten" | "staging" | "retusche" =>
            x === "bearbeiten" || x === "staging" || x === "retusche",
          );
          const m = s.msgs.map((x) => ({ t: x.text.slice(0, 4000), h: x.time }));
          if (f.length === 0 && m.length === 0) continue;
          slim[k] = { f, m };
        }
        const json = Object.keys(slim).length === 0 ? null : JSON.stringify(slim);
        await saveBildauswahlDraft(slug, json);
      },
      clearDraft: async () => {
        await saveBildauswahlDraft(slug, null);
      },
    };
  }, [data, slug]);

  if (data === undefined) {
    return (
      <PicdropSelectionView projectTitle="…" images={[]} loading customerMode />
    );
  }
  if (!data) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "36rem", margin: "0 auto" }}>
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
      customerMode
      initialOpenImageKey={deepLinkBild}
      galleryId={data.id}
      gallerySlug={slug ?? null}
      initialPicdropDraftJson={data.picdrop_selection_json ?? null}
      watermarkEnabled={wmBurnUseCssOverlay}
      submissionAdapter={adapter}
    />
  );
}
