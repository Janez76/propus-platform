import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "../../styles/selekto/picdrop.css";

const PATH_BILDAUSWAHL_ADMIN = "/admin/bildauswahl";

export type Flag = "bearbeiten" | "staging" | "retusche";

type ChatMsg = { text: string; time: string };

export type ImageState = { flags: Flag[]; msgs: ChatMsg[] };

export type PicdropImage = {
  key: string;
  name: string;
  thumbUrl: string | null;
  /**
   * Hochaufgeloeste Variante fuer die Lightbox. Wenn nicht gesetzt, wird
   * `thumbUrl` als Fallback verwendet — die Lightbox zeigt dann nur die
   * Grid-Aufloesung, was bei Kunden mit grossen Bildschirmen pixelig wirkt.
   */
  lightboxUrl?: string | null;
  /** Weitere Nextcloud-/Freigabe-URLs, falls die erste in `<img>` scheitert */
  thumbFallbacks?: string[];
  placeholderColor: string;
};

export function emptyPicdropState(keys: string[]): Record<string, ImageState> {
  const o: Record<string, ImageState> = {};
  keys.forEach((k) => {
    o[k] = { flags: [], msgs: [] };
  });
  return o;
}

const FLAG_LABEL: Record<Flag, string> = {
  bearbeiten: "Bearbeiten",
  staging: "Staging",
  retusche: "Retusche",
};

const CHIP_CLASS: Record<Flag, string> = {
  bearbeiten: "pd-chip pd-chip--bearbeiten",
  staging: "pd-chip pd-chip--staging",
  retusche: "pd-chip pd-chip--retusche",
};

const CHIP_ICON: Record<Flag, string> = {
  bearbeiten: "fa-solid fa-pencil",
  staging: "fa-solid fa-couch",
  retusche: "fa-solid fa-wand-magic-sparkles",
};

const CARD_FLAG_CLASS: Record<Flag, string> = {
  bearbeiten: "pd-fl-bearbeiten",
  staging: "pd-fl-staging",
  retusche: "pd-fl-retusche",
};

function mergePicdropDraft(json: string | null | undefined, keys: string[]): Record<string, ImageState> {
  const base = emptyPicdropState(keys);
  if (!json?.trim()) return base;
  try {
    const raw = JSON.parse(json) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
    const o = raw as Record<string, unknown>;
    for (const k of keys) {
      const entry = o[k];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const e = entry as { f?: unknown; m?: unknown };
      const flags: Flag[] = [];
      if (Array.isArray(e.f)) {
        for (const x of e.f) {
          if (x === "bearbeiten" || x === "staging" || x === "retusche") flags.push(x);
        }
      }
      const msgs: ChatMsg[] = [];
      if (Array.isArray(e.m)) {
        for (const x of e.m) {
          if (x && typeof x === "object" && typeof (x as { t?: unknown }).t === "string") {
            const t = (x as { t: string }).t.slice(0, 4000);
            const h = typeof (x as { h?: unknown }).h === "string" ? (x as { h: string }).h : "";
            msgs.push({ text: t, time: h });
          }
        }
      }
      base[k] = { flags, msgs };
    }
  } catch {
    /* ignore */
  }
  return base;
}

function orderedThumbSources(img: PicdropImage): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of [img.thumbUrl, ...(img.thumbFallbacks ?? [])]) {
    const t = u?.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function orderedLightboxSources(img: PicdropImage): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // Bevorzugt die hochaufgeloeste Lightbox-Variante; faellt auf thumbUrl
  // zurueck wenn der Aufrufer keine separate Lightbox-URL liefert.
  for (const u of [img.lightboxUrl, img.thumbUrl, ...(img.thumbFallbacks ?? [])]) {
    const t = u?.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function PicdropRasterImg({
  className,
  sources,
  alt = "",
  lazy,
  priority = false,
  restrictDownloadGestures = false,
}: {
  className?: string;
  sources: string[];
  alt?: string;
  lazy?: boolean;
  /**
   * Erste Reihe sichtbarer Bilder: `priority` schaltet `fetchpriority="high"` ein,
   * damit der Browser sie vor anderen Netz-Resourcen anfordert. Spuerbar bei
   * 65+ Bildern, weil sonst der HTTP/2-Stream-Pool fair-verteilt und die ersten
   * Kacheln keine sichtbare Beschleunigung haben.
   */
  priority?: boolean;
  /** Kunden-Magic-Link: Kontextmenü / Ziehen abschwächen (kein technischer Kopierschutz). */
  restrictDownloadGestures?: boolean;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
  }, [sources.join("|")]);
  if (sources.length === 0) return null;
  return (
    <img
      className={className}
      src={sources[Math.min(i, sources.length - 1)]}
      alt={alt}
      loading={lazy ? "lazy" : "eager"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onDragStart={restrictDownloadGestures ? (e) => e.preventDefault() : undefined}
      onContextMenu={restrictDownloadGestures ? (e) => e.preventDefault() : undefined}
      onError={() => setI((x) => Math.min(x + 1, sources.length - 1))}
    />
  );
}

/**
 * Anzahl Bilder, die ohne Lazy-Loading geladen werden und `fetchpriority=high`
 * bekommen. 9 entspricht 3 Reihen auf Desktop (3 Spalten) / 4-5 Reihen mobil —
 * also typischerweise alles im initialen Viewport plus Buffer.
 */
const PD_EAGER_PREFETCH = 9;

function ThumbVisual({
  img,
  index = 0,
  restrictDownloadGestures,
}: {
  img: PicdropImage;
  index?: number;
  restrictDownloadGestures?: boolean;
}) {
  const sources = useMemo(
    () => orderedThumbSources(img),
    [img.key, img.thumbUrl, (img.thumbFallbacks ?? []).join("|")],
  );
  const aboveFold = index < PD_EAGER_PREFETCH;
  if (sources.length > 0) {
    return (
      <PicdropRasterImg
        className="pd-thumb-img"
        sources={sources}
        alt=""
        lazy={!aboveFold}
        priority={aboveFold}
        restrictDownloadGestures={restrictDownloadGestures}
      />
    );
  }
  return (
    <div className="pd-thumb-bg" style={{ background: img.placeholderColor }}>
      <i className="fa-solid fa-image" style={{ fontSize: 22, color: "rgba(255,255,255,0.18)" }} />
    </div>
  );
}

/**
 * Optionaler Adapter, der die IndexedDB-basierten Submit/Draft-Funktionen
 * ueberschreibt. Wird vom server-backed Bildauswahl-Modul genutzt, damit
 * der View weiterverwendet werden kann ohne IndexedDB-Abhaengigkeit.
 */
export type PicdropSubmissionAdapter = {
  submit: (items: Array<{
    asset_key: string;
    asset_label: string;
    flags: readonly Flag[];
    messageLines: readonly string[];
  }>) => Promise<void>;
  saveDraft?: (state: Record<string, ImageState>) => Promise<void>;
  clearDraft?: () => Promise<void>;
  onAdminNotify?: (items: Array<{ asset_label: string; messageLines: readonly string[] }>) => void;
};

export type PicdropSelectionViewProps = {
  projectTitle: string;
  images: PicdropImage[];
  loading?: boolean;
  banner?: string | null;
  /** Admin-Startseite mit ?galerie=… */
  staffGalerieId?: string | null;
  /** Magic-Link-Kunde: kein Backpanel, höfliche Ansprache */
  customerMode?: boolean;
  /** z. B. Query ?bild=image-uuid — Lightbox einmal öffnen */
  initialOpenImageKey?: string | null;
  /** Magic-Link: Galerie in IndexedDB — «Senden» speichert Feedback fürs Backpanel */
  galleryId?: string | null;
  gallerySlug?: string | null;
  /** Aus IndexedDB wiederhergestellter Entwurf (automatisch gespeichert) */
  initialPicdropDraftJson?: string | null;
  /** PROPUS-Wasserzeichen auf Raster und Lightbox (Standard: an) */
  watermarkEnabled?: boolean;
  /** Wenn gesetzt: ersetzt IndexedDB-Submit/Draft durch eigene Callbacks (server-backed). */
  submissionAdapter?: PicdropSubmissionAdapter;
  /**
   * Optional fuer die Lightbox-Top-Bar (editorial dark layout):
   * Kundenname und Bestell-Nr. werden links als kleine Marken-Zeile angezeigt,
   * Adresse darunter unter dem Titel. Falls leer, faellt die Topbar elegant
   * auf nur PROPUS + Titel zurueck.
   */
  customerName?: string | null;
  orderNo?: string | null;
  address?: string | null;
};

export function PicdropSelectionView({
  projectTitle,
  images,
  loading = false,
  banner = null,
  staffGalerieId = null,
  customerMode = false,
  initialOpenImageKey = null,
  galleryId = null,
  gallerySlug = null,
  initialPicdropDraftJson = null,
  watermarkEnabled = true,
  submissionAdapter = undefined,
  customerName = null,
  orderNo = null,
  address = null,
}: PicdropSelectionViewProps) {
  const [commentPanelOpen, setCommentPanelOpen] = useState(false);
  // Body-Scroll lock waehrend Lightbox offen — Mobile Safari rutscht sonst.
  // Wird per useEffect unten gesteuert.
  const imageKeySig = useMemo(() => images.map((i) => i.key).join("|"), [images]);

  const [byId, setById] = useState<Record<string, ImageState>>(() =>
    mergePicdropDraft(initialPicdropDraftJson, images.map((i) => i.key)),
  );
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  /**
   * Grid-Filter — entspricht den Tab-Pillen im neuen Paper-Header.
   * "none" zeigt nur Bilder ohne Markierung.
   */
  const [filter, setFilter] = useState<"all" | Flag | "none">("all");

  const touchStartX = useRef<number | null>(null);
  const deepLinkConsumedRef = useRef(false);

  useEffect(() => {
    const keys = images.map((i) => i.key);
    setById(mergePicdropDraft(initialPicdropDraftJson, keys));
    setSubmitted(false);
    setSubmitError(null);
    setLightboxIndex(null);
    deepLinkConsumedRef.current = false;
  }, [imageKeySig, images, initialPicdropDraftJson]);

  useEffect(() => {
    if (loading || images.length === 0 || !initialOpenImageKey?.trim() || deepLinkConsumedRef.current) return;
    const idx = images.findIndex((i) => i.key === initialOpenImageKey.trim());
    if (idx >= 0) {
      setLightboxIndex(idx);
      deepLinkConsumedRef.current = true;
    }
  }, [loading, images, initialOpenImageKey, imageKeySig]);

  const stats = useMemo(() => {
    const vals = Object.values(byId);
    const bearbeiten = vals.filter((s) => s.flags.includes("bearbeiten")).length;
    const staging = vals.filter((s) => s.flags.includes("staging")).length;
    const retusche = vals.filter((s) => s.flags.includes("retusche")).length;
    const marked = vals.filter((s) => s.flags.length > 0).length;
    const withSendableContent = vals.filter((s) => s.flags.length > 0 || s.msgs.length > 0).length;
    return { bearbeiten, staging, retusche, marked, withSendableContent };
  }, [byId]);

  useEffect(() => {
    const gid = galleryId?.trim();
    if (!gid || loading || images.length === 0) return;
    /**
     * Auto-Save des Picdrop-Entwurfs — auch NACH einer Submission, damit
     * der Kunde weiter editieren kann und seine Aenderungen bei Reload
     * sichtbar bleiben. Beim erneuten "Auswahl aktualisieren" werden die
     * server-seitigen Feedback-Rows ohnehin neu erzeugt.
     */
    if (!submissionAdapter?.saveDraft) return;
    const t = window.setTimeout(() => {
      void submissionAdapter.saveDraft?.(byId);
    }, 500);
    return () => window.clearTimeout(t);
  }, [byId, galleryId, loading, images.length, submissionAdapter]);

  const openLb = useCallback((idx: number) => {
    setLightboxIndex(idx);
  }, []);

  const closeLb = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const navigateLb = useCallback(
    (dir: number) => {
      setLightboxIndex((cur) => {
        if (cur === null) return cur;
        const n = images.length;
        if (n === 0) return cur;
        return (cur + dir + n) % n;
      });
    },
    [images.length],
  );

  const currentImg = lightboxIndex !== null && images.length ? images[lightboxIndex] : null;
  const currentState = currentImg ? byId[currentImg.key] : null;

  /**
   * Setzt die Flagge fuer ein Bild radio-style:
   *   aktiv klicken  → abwaehlen (keine Markierung)
   *   inaktiv klicken → ersetzt aktuelle Markierung mit f
   * Ein Bild traegt damit immer genau 0 oder 1 Flag — passt zu Chip und
   * Side-Stripe pro Karte.
   */
  const setImageFlag = useCallback((key: string, f: Flag) => {
    setById((prev) => {
      const s = prev[key];
      if (!s) return prev;
      const isActive = s.flags.includes(f);
      return { ...prev, [key]: { ...s, flags: isActive ? [] : [f] } };
    });
  }, []);

  const toggleFlag = useCallback(
    (f: Flag) => {
      if (!currentImg) return;
      setImageFlag(currentImg.key, f);
    },
    [currentImg, setImageFlag],
  );

  const sendMsg = useCallback(() => {
    if (!currentImg) return;
    const txt = chatDraft.trim();
    if (!txt) return;
    const time = new Date().toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
    setById((prev) => {
      const s = prev[currentImg.key];
      if (!s) return prev;
      return {
        ...prev,
        [currentImg.key]: { ...s, msgs: [...s.msgs, { text: txt, time }] },
      };
    });
    setChatDraft("");
  }, [currentImg, chatDraft]);

  /**
   * Kommentar entfernen — wirkt im lokalen Draft. Nach erneutem "Auswahl
   * aktualisieren" wird die server-seitige Persistenz ohnehin durch den
   * neuen Stand ersetzt (DELETE + INSERT in submitPicdropSelection), der
   * Kunde sieht seinen Kommentar also dauerhaft verschwinden.
   */
  const deleteMsg = useCallback((msgIndex: number) => {
    if (!currentImg) return;
    setById((prev) => {
      const s = prev[currentImg.key];
      if (!s) return prev;
      if (msgIndex < 0 || msgIndex >= s.msgs.length) return prev;
      const nextMsgs = s.msgs.slice();
      nextMsgs.splice(msgIndex, 1);
      return { ...prev, [currentImg.key]: { ...s, msgs: nextMsgs } };
    });
  }, [currentImg]);

  const onChatKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMsg();
      }
    },
    [sendMsg],
  );

  const submitAll = useCallback(async () => {
    const gid = galleryId?.trim();
    const gslug = gallerySlug?.trim();
    if (gid && gslug) {
      setSubmitting(true);
      setSubmitError(null);
      try {
        const items = images
          .map((img) => {
            const s = byId[img.key];
            if (!s || (s.flags.length === 0 && s.msgs.length === 0)) return null;
            return {
              asset_key: img.key,
              asset_label: img.name,
              flags: s.flags,
              messageLines: s.msgs.map((m) => m.text),
            };
          })
          .filter((x): x is NonNullable<typeof x> => x != null);
        if (!submissionAdapter) {
          throw new Error('submissionAdapter fehlt — der View benoetigt server-seitige Persistenz.');
        }
        await submissionAdapter.submit(items);
        if (submissionAdapter.clearDraft) await submissionAdapter.clearDraft();
        if (customerMode && submissionAdapter.onAdminNotify) {
          submissionAdapter.onAdminNotify(
            items.map((it) => ({ asset_label: it.asset_label, messageLines: it.messageLines })),
          );
        }
        setSubmitted(true);
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : "Senden fehlgeschlagen.");
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setSubmitted(true);
  }, [byId, customerMode, galleryId, gallerySlug, images, submissionAdapter]);

  useEffect(() => {
    if (lightboxIndex !== null) setChatDraft("");
  }, [lightboxIndex]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      // Tastatur-Navigation deaktivieren waehrend Kunde im Kommentar-Feld tippt.
      const target = e.target as HTMLElement | null;
      const inEditable =
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "INPUT" ||
        target?.isContentEditable;
      if (e.key === "Escape") {
        // Erst Panel schliessen, danach Lightbox — wie Photoshop/Apple.
        if (commentPanelOpen) setCommentPanelOpen(false);
        else closeLb();
        return;
      }
      if (inEditable) return;
      if (e.key === "ArrowRight") navigateLb(1);
      if (e.key === "ArrowLeft") navigateLb(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightboxIndex, navigateLb, closeLb, commentPanelOpen]);

  // Beim Bildwechsel das Kommentar-Panel schliessen — die Nachrichten gehoeren
  // zum vorherigen Bild und der Kunde soll bewusst neu oeffnen.
  useEffect(() => {
    setCommentPanelOpen(false);
  }, [lightboxIndex]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(dx) > 50) navigateLb(dx < 0 ? 1 : -1);
    },
    [navigateLb],
  );

  const lightboxOpen = lightboxIndex !== null;
  const nImg = images.length;

  return (
    <div className={`pd-root-wrap${customerMode ? " pd-customer-mode" : ""}${lightboxOpen ? " pd-lb-open" : ""}`}>
      {!lightboxOpen ? (
        <div className="pd-page">
          {/* Brand-Strip */}
          <div className="pd-brand-strip">
            <span className="pd-brand-mark2">PROPUS</span>
            {orderNo || customerName ? (
              <span className="pd-brand-context2">
                {orderNo ? (
                  <>
                    Auftrag #<strong>{orderNo}</strong>
                  </>
                ) : null}
                {orderNo && customerName ? " · " : null}
                {customerName ? <strong>{customerName}</strong> : null}
              </span>
            ) : (
              <span className="pd-brand-context2">
                {customerMode ? "Ihre Bildauswahl" : "Bildauswahl"}
              </span>
            )}
          </div>

          {/* Hero */}
          <section className="pd-hero">
            <div className="pd-hero-eyebrow">{customerMode ? "Ihre Bildauswahl" : "Bildauswahl"}</div>
            <h1 className="pd-hero-title">{projectTitle}</h1>
            <p className="pd-hero-sub">
              {customerMode
                ? "Markieren Sie die Bilder, die wir bearbeiten, stagen oder retuschieren sollen. Klicken Sie ein Bild fuer Details und Kommentare an unser Team."
                : "Markieren Sie die Bilder, die bearbeitet, gestagt oder retuschiert werden sollen."}
            </p>
            <div className="pd-hero-tick" aria-hidden />
            {!customerMode && staffGalerieId ? (
              <div className="pd-mode-line" style={{ marginTop: 18 }}>
                <span className="pd-mode-badge">Vorschau</span>
                <span className="pd-mode-id" title="Auswahl-ID">
                  {staffGalerieId.slice(0, 8)}…
                </span>
                <Link to="/" className="pd-mode-leave">
                  Demo-Modus
                </Link>
              </div>
            ) : null}
            {!customerMode ? (
              <div style={{ marginTop: 24 }}>
                <Link to={PATH_BILDAUSWAHL_ADMIN} className="pd-backpanel-link">
                  <i className="fa-solid fa-table-columns" aria-hidden />
                  Backpanel
                </Link>
              </div>
            ) : null}
          </section>

          {/* Metrics */}
          {nImg > 0 ? (
            <section className="pd-metrics">
              <div className="pd-metric">
                <span className="pd-metric-num">{String(nImg).padStart(2, "0")}</span>
                <span className="pd-metric-label">
                  <i className="fa-solid fa-images" aria-hidden /> Bilder gesamt
                </span>
              </div>
              <div className="pd-metric is-bearbeiten">
                <span className="pd-metric-num">{String(stats.bearbeiten).padStart(2, "0")}</span>
                <span className="pd-metric-label">
                  <i className="fa-solid fa-pen" aria-hidden /> Bearbeiten
                </span>
              </div>
              <div className="pd-metric is-staging">
                <span className="pd-metric-num">{String(stats.staging).padStart(2, "0")}</span>
                <span className="pd-metric-label">
                  <i className="fa-solid fa-couch" aria-hidden /> Staging
                </span>
              </div>
              <div className="pd-metric is-retusche">
                <span className="pd-metric-num">{String(stats.retusche).padStart(2, "0")}</span>
                <span className="pd-metric-label">
                  <i className="fa-solid fa-wand-magic-sparkles" aria-hidden /> Retusche
                </span>
              </div>
              <div className="pd-metric">
                <span className="pd-metric-num">{String(nImg - stats.marked).padStart(2, "0")}</span>
                <span className="pd-metric-label">
                  <i className="fa-regular fa-circle" aria-hidden /> Ohne Markierung
                </span>
              </div>
            </section>
          ) : null}

          {/* Filter-Tabs */}
          {nImg > 0 ? (
            <div className="pd-filter-bar" role="tablist" aria-label="Filter">
              {(
                [
                  ["all", "Alle Bilder", null, nImg],
                  ["bearbeiten", "Bearbeiten", "fa-pen", stats.bearbeiten],
                  ["staging", "Staging", "fa-couch", stats.staging],
                  ["retusche", "Retusche", "fa-wand-magic-sparkles", stats.retusche],
                  ["none", "Ohne Markierung", "fa-regular fa-circle", nImg - stats.marked],
                ] as const
              ).map(([key, label, icon, count]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  className={`pd-filter-tab${filter === key ? " is-active" : ""}`}
                  data-filter={key}
                  onClick={() => setFilter(key as typeof filter)}
                >
                  {icon ? <i className={icon.startsWith("fa-regular") ? icon : `fa-solid ${icon}`} aria-hidden /> : null}
                  {label}
                  <span className="pd-filter-count">{count}</span>
                </button>
              ))}
            </div>
          ) : null}

          {loading ? (
            <p className="pd-banner pd-banner--muted">
              {customerMode ? "Ihre Bilder werden geladen…" : "Auswahl wird geladen…"}
            </p>
          ) : null}
          {banner && !loading ? <p className="pd-banner pd-banner--warn">{banner}</p> : null}

          {/* Grid */}
          <div className="pd-page-main">
            {nImg === 0 && !loading ? (
              <p className="pd-empty-gallery">
                {customerMode
                  ? "Für diese Auswahl liegen noch keine Bilder vor. Bitte später erneut versuchen oder Propus kontaktieren."
                  : "Keine Bilder zum Anzeigen."}
              </p>
            ) : (
              <div className="pd-grid">
                {images.map((img, idx) => {
                  const s = byId[img.key];
                  if (!s) return null;
                  const top = s.flags[0];
                  // Filter: aktiv-flag muss zur Filter-Wahl passen.
                  if (filter !== "all") {
                    if (filter === "none" && top) return null;
                    if (filter !== "none" && top !== filter) return null;
                  }
                  return (
                    <article
                      key={img.key}
                      className={`pd-img-card${top ? ` ${CARD_FLAG_CLASS[top]}` : ""}${
                        s.msgs.length ? " pd-has-cmt" : ""
                      }`}
                      onClick={() => openLb(idx)}
                    >
                      <div className={`pd-thumb${watermarkEnabled ? " pd-thumb--watermark" : ""}`}>
                        <ThumbVisual img={img} index={idx} restrictDownloadGestures={customerMode} />
                        {top ? (
                          <div className="pd-flag-chips">
                            <span className={CHIP_CLASS[top]}>
                              <i className={CHIP_ICON[top]} aria-hidden="true" />
                              {FLAG_LABEL[top]}
                            </span>
                          </div>
                        ) : null}
                        {s.msgs.length > 0 ? (
                          <div className="pd-cmt-dot" title={`${s.msgs.length} Kommentar${s.msgs.length === 1 ? "" : "e"}`}>
                            <i className="fa-solid fa-comment" />
                          </div>
                        ) : null}
                        {/* Quick-Flag-Overlay (Hover) */}
                        <div
                          className="pd-card-actions"
                          onClick={(e) => e.stopPropagation()}
                          role="group"
                          aria-label="Schnellmarkierung"
                        >
                          {(["bearbeiten", "staging", "retusche"] as const).map((f) => (
                            <button
                              key={f}
                              type="button"
                              className={`pd-quick-flag${top === f ? " is-active" : ""}`}
                              data-flag={f}
                              onClick={(e) => {
                                e.stopPropagation();
                                setImageFlag(img.key, f);
                              }}
                              title={FLAG_LABEL[f]}
                              aria-label={`${FLAG_LABEL[f]} markieren`}
                              aria-pressed={top === f}
                            >
                              <i className={CHIP_ICON[f]} aria-hidden />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="pd-img-name">
                        <span className="pd-card-num">
                          {String(idx + 1).padStart(2, "0")}
                          <span className="pd-card-num-tot">/{String(nImg).padStart(2, "0")}</span>
                        </span>
                        <span className="pd-card-filename" title={img.name}>{img.name}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {submitError ? <p className="pd-banner pd-banner--warn pd-banner--above-submit">{submitError}</p> : null}

          {/* Sticky Submit-Bar */}
          {nImg > 0 ? (
            <div className="pd-submit-bar">
              <div className="pd-submit-bar-inner">
                <div className="pd-submit-status">
                  <div className="pd-submit-status-item">
                    <span className="pd-submit-status-num">{stats.marked}</span>
                    <span>von {nImg} {nImg === 1 ? "Bild" : "Bildern"} markiert</span>
                  </div>
                  <span className="pd-submit-divider" aria-hidden />
                  {submitted ? (
                    <span className="pd-submit-hint">
                      <span className="pd-adot" aria-hidden />
                      Auswahl gesendet. Sie koennen sie weiter bearbeiten und erneut absenden.
                    </span>
                  ) : nImg - stats.marked > 0 ? (
                    <span className="pd-submit-warning">
                      <i className="fa-solid fa-circle-info" aria-hidden />
                      <span>
                        {nImg - stats.marked}{" "}
                        {nImg - stats.marked === 1 ? "Bild noch ohne Markierung" : "Bilder noch ohne Markierung"}
                      </span>
                    </span>
                  ) : (
                    <span className="pd-submit-warning is-ok">
                      <i className="fa-solid fa-circle-check" aria-hidden />
                      <span>Alle Bilder markiert — bereit zum Senden</span>
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className={`pd-submit-btn${submitted ? " pd-submit-btn--sent" : ""}`}
                  disabled={stats.withSendableContent === 0 || nImg === 0 || submitting}
                  onClick={() => void submitAll()}
                >
                  {submitting
                    ? "Senden …"
                    : submitted
                      ? "Auswahl aktualisieren"
                      : customerMode
                        ? "Auswahl an Propus senden"
                        : "Auswahl absenden"}
                  <span className="pd-submit-btn-arrow" aria-hidden />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={`pd-lb-overlay${lightboxOpen ? " pd-open" : ""}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {currentImg && currentState ? (
          <>
            {/* ── Topbar: Marke · Projekt · Schliessen ─────────────────── */}
            <div className="pd-lb-topbar">
              <div className="pd-lb-brand">
                <span className="pd-lb-brand-mark">PROPUS</span>
                {orderNo || customerName ? (
                  <>
                    <span className="pd-lb-brand-divider" aria-hidden />
                    <span className="pd-lb-brand-context">
                      {orderNo ? (
                        <>
                          Bestell-Nr. <strong>{orderNo}</strong>
                        </>
                      ) : null}
                      {orderNo && customerName ? " · " : null}
                      {customerName ? <strong>{customerName}</strong> : null}
                    </span>
                  </>
                ) : null}
              </div>
              <div className="pd-lb-project-meta">
                <span className="pd-lb-project-eyebrow">Bildauswahl</span>
                <span className="pd-lb-project-title">{projectTitle || address || ""}</span>
              </div>
              <div className="pd-lb-topbar-actions">
                <button
                  type="button"
                  className="pd-lb-close"
                  onClick={closeLb}
                  aria-label="Schliessen"
                  title="Schliessen"
                >
                  <i className="fa-solid fa-xmark" aria-hidden />
                </button>
              </div>
            </div>

            {/* ── Stage: Pfeile + Bild mit Editorial-Corner-Brackets ───── */}
            <div className="pd-lb-stage">
              <button
                type="button"
                className="pd-lb-nav-arrow"
                onClick={() => navigateLb(-1)}
                aria-label="Vorheriges Bild"
              >
                <i className="fa-solid fa-chevron-left" aria-hidden />
              </button>
              <div className="pd-lb-image-wrap">
                <div className={`pd-lb-image-frame${watermarkEnabled ? " is-watermark" : ""}`}>
                  <span className="pd-lb-corner tl" aria-hidden />
                  <span className="pd-lb-corner tr" aria-hidden />
                  <span className="pd-lb-corner bl" aria-hidden />
                  <span className="pd-lb-corner br" aria-hidden />
                  {(() => {
                    const lbSrc = orderedLightboxSources(currentImg);
                    if (lbSrc.length > 0) {
                      return (
                        <PicdropRasterImg
                          sources={lbSrc}
                          alt=""
                          restrictDownloadGestures={customerMode}
                        />
                      );
                    }
                    return (
                      <div className="pd-lb-bg" style={{ background: currentImg.placeholderColor }}>
                        <i
                          className="fa-solid fa-image"
                          style={{ fontSize: 40, color: "rgba(255,255,255,0.18)" }}
                          aria-hidden
                        />
                      </div>
                    );
                  })()}
                </div>
              </div>
              <button
                type="button"
                className="pd-lb-nav-arrow"
                onClick={() => navigateLb(1)}
                aria-label="Naechstes Bild"
              >
                <i className="fa-solid fa-chevron-right" aria-hidden />
              </button>
            </div>

            {/* ── Control bar: Counter · Flag-Pills · Comment-Toggle ──── */}
            <div className="pd-lb-controlbar">
              <div className="pd-lb-meta-left">
                <div className="pd-lb-counter-row">
                  <span className="pd-lb-counter-num">
                    <em>{String((lightboxIndex ?? 0) + 1).padStart(2, "0")}</em>
                    /{String(nImg).padStart(2, "0")}
                  </span>
                  <span className="pd-lb-counter-total">Bilder im Set</span>
                </div>
                <div className="pd-lb-filename-row">
                  <span className="pd-lb-gold-tick" aria-hidden />
                  <span>{currentImg.name}</span>
                </div>
              </div>

              <div className="pd-lb-flag-group">
                <span className="pd-lb-flag-label">Flagge setzen</span>
                <div className="pd-lb-flag-pills">
                  {(["bearbeiten", "staging", "retusche"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`pd-lb-flag-pill${currentState.flags.includes(f) ? " is-active" : ""}`}
                      data-flag={f}
                      onClick={() => toggleFlag(f)}
                      aria-pressed={currentState.flags.includes(f)}
                    >
                      <i className={`icon ${CHIP_ICON[f]}`} aria-hidden />
                      <span>{FLAG_LABEL[f]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pd-lb-meta-right">
                <button
                  type="button"
                  className="pd-lb-comment-toggle"
                  onClick={() => setCommentPanelOpen((o) => !o)}
                  aria-expanded={commentPanelOpen}
                  aria-controls="pd-lb-comment-panel"
                >
                  <i className="fa-regular fa-comment" aria-hidden />
                  <span>Kommentar</span>
                  <span
                    className={`pd-lb-comment-badge${currentState.msgs.length === 0 ? " is-empty" : ""}`}
                  >
                    {currentState.msgs.length}
                  </span>
                </button>
              </div>
            </div>

            {/* ── Thumbnail strip ──────────────────────────────────────── */}
            <div className="pd-lb-thumbstrip" role="tablist" aria-label="Bilder">
              {images.map((img, idx) => {
                const isActive = idx === lightboxIndex;
                const s = byId[img.key];
                const topFlag: Flag | undefined = s?.flags[0];
                const thumbSrc = orderedThumbSources(img)[0] ?? null;
                return (
                  <button
                    key={img.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`pd-lb-thumb${isActive ? " is-active" : ""}`}
                    onClick={() => setLightboxIndex(idx)}
                    aria-label={`Bild ${idx + 1}: ${img.name}`}
                    title={img.name}
                  >
                    {thumbSrc ? (
                      <img src={thumbSrc} alt="" loading="lazy" />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          background: img.placeholderColor,
                        }}
                      />
                    )}
                    {topFlag ? <span className={`pd-lb-thumb-dot pd-lb-thumb-dot--${topFlag}`} aria-hidden /> : null}
                  </button>
                );
              })}
            </div>

            {/* ── Slide-in Kommentar-Panel ─────────────────────────────── */}
            <div
              className={`pd-lb-comment-backdrop${commentPanelOpen ? " is-show" : ""}`}
              onClick={() => setCommentPanelOpen(false)}
              aria-hidden
            />
            <aside
              id="pd-lb-comment-panel"
              className={`pd-lb-comment-panel${commentPanelOpen ? " is-open" : ""}`}
              aria-hidden={!commentPanelOpen}
            >
              <button
                type="button"
                className="pd-lb-comment-panel-close"
                onClick={() => setCommentPanelOpen(false)}
                aria-label="Schliessen"
                title="Schliessen"
              >
                <i className="fa-solid fa-xmark" aria-hidden />
              </button>
              <header className="pd-lb-comment-panel-header">
                <div className="pd-lb-comment-panel-eyebrow">Kommentare</div>
                <div className="pd-lb-comment-panel-title">{currentImg.name}</div>
                <div className="pd-lb-comment-panel-goldline" aria-hidden />
              </header>
              <div className="pd-lb-comment-list">
                {currentState.msgs.length === 0 ? (
                  <div className="pd-lb-comment-empty">
                    <div className="pd-lb-comment-empty-icon">
                      <i className="fa-regular fa-comment" aria-hidden />
                    </div>
                    <p>Noch keine Kommentare</p>
                    <small>Schreiben Sie eine Notiz an das Propus-Team.</small>
                  </div>
                ) : (
                  currentState.msgs.map((m, i) => (
                    <div key={i} className="pd-lb-comment-item">
                      <div className="pd-lb-comment-item-meta">
                        <strong>{customerMode ? "Sie" : "Notiz"}</strong>
                        <span className="pd-lb-comment-item-time">{m.time}</span>
                        <button
                          type="button"
                          className="pd-lb-comment-item-del"
                          onClick={() => deleteMsg(i)}
                          aria-label="Kommentar loeschen"
                          title="Kommentar loeschen"
                        >
                          <i className="fa-solid fa-trash-can" aria-hidden />
                        </button>
                      </div>
                      <div className="pd-lb-comment-item-body">{m.text}</div>
                    </div>
                  ))
                )}
              </div>
              <div className="pd-lb-comment-compose">
                <textarea
                  className="pd-lb-comment-input"
                  rows={3}
                  placeholder={customerMode ? "Nachricht an Propus …" : "Nachricht …"}
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  onKeyDown={onChatKeyDown}
                />
                <div className="pd-lb-comment-compose-actions">
                  <span className="pd-lb-comment-compose-hint">
                    {customerMode ? "Sichtbar fuer Propus-Team" : "Interne Notiz"}
                  </span>
                  <button
                    type="button"
                    className="pd-lb-comment-send"
                    onClick={sendMsg}
                    disabled={!chatDraft.trim()}
                  >
                    Senden
                    <i className="fa-solid fa-arrow-right" aria-hidden />
                  </button>
                </div>
              </div>
            </aside>
          </>
        ) : null}
      </div>
    </div>
  );
}
