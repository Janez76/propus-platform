import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  PicdropSelectionView,
  type PicdropImage,
  type PicdropSubmissionAdapter,
} from "../../components/selekto/PicdropSelectionView";
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

function imageLabel(
  im: { id: string; category: string | null; file_name: string | null },
  index: number,
): string {
  // Wichtig fuer die Admin-Benachrichtigungsmail: dort taucht dieses Label
  // 1:1 in der Bullet-Liste auf. Wir bevorzugen den Originaldateinamen,
  // damit das Office das Bild im NAS direkt wiederfindet.
  return (
    im.file_name?.trim() ||
    im.category?.trim() ||
    `Bild ${index + 1}`
  );
}

/** Slim server-Variante, Pendant zu selekto/ClientSelektoPage aber via /api/bildauswahl. */
export function ClientBildauswahlPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const deepLinkBild = searchParams.get("bild")?.trim() || null;

  const [data, setData] = useState<BildauswahlPublicPayload | null | undefined>(undefined);

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

  /**
   * Wichtig: das Watermark wird serverseitig in sharp eingebrannt (siehe
   * tours/routes/gallery-public-api.js → ensurePublicThumb). Der Client lädt
   * fertig watermarkte JPEGs vom Server bzw. aus dem Cloudflare-Edge-Cache
   * und muss kein Canvas mehr aufmachen. Damit sind 65 Bilder sofort da
   * (browser-paralleler Image-Decode statt sequentiellem UI-Thread-Burn).
   */
  const picdropImages: PicdropImage[] = useMemo(() => {
    if (!data?.images?.length) return [];
    const sorted = [...data.images].sort((a, b) => a.sort_order - b.sort_order);
    return sorted.map((im, idx) => ({
      key: im.id,
      name: imageLabel(im, idx),
      thumbUrl: bildauswahlImageUrl(data.slug, im.id),
      placeholderColor: hashColor(im.id),
    }));
  }, [data]);

  const mediaLoading = data === undefined;

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
      /**
       * clearDraft bewusst NICHT implementiert: der Kunde soll seine letzte
       * Auswahl auch nach Reload weiter editieren können. Der Server-State
       * (gallery_feedback) wird beim Re-Submit ohnehin durch den neuen
       * Stand ersetzt — der Draft bleibt die Quelle der Wahrheit für die UI.
       */
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
      watermarkEnabled={false}
      submissionAdapter={adapter}
    />
  );
}
