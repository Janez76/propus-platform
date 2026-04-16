import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  clearPicdropSelectionDraft,
  savePicdropSelectionDraft,
  submitPicdropGallerySelections,
  tryOpenPicdropAdminNotifyMailto,
} from "../../lib/selekto/galleryApi";
import { PATH_SELEKTO_ADMIN as PATH_LISTING_ADMIN } from "../../lib/selekto/paths";
import "../../styles/selekto/picdrop.css";

export type Flag = "bearbeiten" | "staging" | "retusche";

type ChatMsg = { text: string; time: string };

export type ImageState = { flags: Flag[]; msgs: ChatMsg[] };

export type PicdropImage = {
  key: string;
  name: string;
  thumbUrl: string | null;
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

function PicdropRasterImg({
  className,
  sources,
  alt = "",
  lazy,
  restrictDownloadGestures = false,
}: {
  className?: string;
  sources: string[];
  alt?: string;
  lazy?: boolean;
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
      loading={lazy ? "lazy" : undefined}
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onDragStart={restrictDownloadGestures ? (e) => e.preventDefault() : undefined}
      onContextMenu={restrictDownloadGestures ? (e) => e.preventDefault() : undefined}
      onError={() => setI((x) => Math.min(x + 1, sources.length - 1))}
    />
  );
}

function ThumbVisual({ img, restrictDownloadGestures }: { img: PicdropImage; restrictDownloadGestures?: boolean }) {
  const sources = useMemo(
    () => orderedThumbSources(img),
    [img.key, img.thumbUrl, (img.thumbFallbacks ?? []).join("|")],
  );
  if (sources.length > 0) {
    return (
      <PicdropRasterImg
        className="pd-thumb-img"
        sources={sources}
        alt=""
        lazy
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
}: PicdropSelectionViewProps) {
  const imageKeySig = useMemo(() => images.map((i) => i.key).join("|"), [images]);

  const [byId, setById] = useState<Record<string, ImageState>>(() =>
    mergePicdropDraft(initialPicdropDraftJson, images.map((i) => i.key)),
  );
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState("");

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
    if (!gid || submitted || loading || images.length === 0) return;
    const t = window.setTimeout(() => {
      void savePicdropSelectionDraft(gid, byId);
    }, 500);
    return () => window.clearTimeout(t);
  }, [byId, galleryId, submitted, loading, images.length]);

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

  const toggleFlag = useCallback(
    (f: Flag) => {
      if (!currentImg) return;
      setById((prev) => {
        const s = prev[currentImg.key];
        if (!s) return prev;
        const i = s.flags.indexOf(f);
        const nextFlags = i === -1 ? [...s.flags, f] : s.flags.filter((x) => x !== f);
        return { ...prev, [currentImg.key]: { ...s, flags: nextFlags } };
      });
    },
    [currentImg],
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
        await submitPicdropGallerySelections({ galleryId: gid, gallerySlug: gslug, items });
        await clearPicdropSelectionDraft(gid);
        if (customerMode) {
          void tryOpenPicdropAdminNotifyMailto({
            galleryId: gid,
            gallerySlug: gslug,
            items: items.map((it) => ({ asset_label: it.asset_label, messageLines: it.messageLines })),
          });
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
  }, [byId, customerMode, galleryId, gallerySlug, images]);

  useEffect(() => {
    if (lightboxIndex !== null) setChatDraft("");
  }, [lightboxIndex]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") navigateLb(1);
      if (e.key === "ArrowLeft") navigateLb(-1);
      if (e.key === "Escape") closeLb();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightboxIndex, navigateLb, closeLb]);

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
          <header className="pd-header pd-page-head">
            <div>
              <div className="pd-project-label">{customerMode ? "Ihre Bildauswahl · Propus" : "Bildauswahl · Propus"}</div>
              <div className="pd-project-title">{projectTitle}</div>
              {!customerMode && staffGalerieId ? (
                <div className="pd-mode-line">
                  <span className="pd-mode-badge">Vorschau</span>
                  <span className="pd-mode-id" title="Auswahl-ID">
                    {staffGalerieId.slice(0, 8)}…
                  </span>
                  <Link to="/" className="pd-mode-leave">
                    Demo-Modus
                  </Link>
                </div>
              ) : null}
            </div>
            {!customerMode ? (
              <div className="pd-header-right">
                <div className="pd-stats">
                  <span className="pd-pill pd-pill-total">{nImg} Bilder</span>
                  {stats.bearbeiten > 0 ? (
                    <span className="pd-pill pd-pill-b">{stats.bearbeiten} Bearbeiten</span>
                  ) : null}
                  {stats.staging > 0 ? (
                    <span className="pd-pill pd-pill-s">{stats.staging} Staging</span>
                  ) : null}
                  {stats.retusche > 0 ? (
                    <span className="pd-pill pd-pill-r">{stats.retusche} Retusche</span>
                  ) : null}
                </div>
                <Link to={PATH_LISTING_ADMIN} className="pd-backpanel-link">
                  <i className="fa-solid fa-table-columns" aria-hidden={true} />
                  Backpanel
                </Link>
              </div>
            ) : (
              <div className="pd-header-right">
                <div className="pd-stats">
                  <span className="pd-pill pd-pill-total">{nImg} Bilder</span>
                  {stats.bearbeiten > 0 ? (
                    <span className="pd-pill pd-pill-b">{stats.bearbeiten} Bearbeiten</span>
                  ) : null}
                  {stats.staging > 0 ? (
                    <span className="pd-pill pd-pill-s">{stats.staging} Staging</span>
                  ) : null}
                  {stats.retusche > 0 ? (
                    <span className="pd-pill pd-pill-r">{stats.retusche} Retusche</span>
                  ) : null}
                </div>
              </div>
            )}
          </header>

          {loading ? (
            <p className="pd-banner pd-banner--muted">
              {customerMode ? "Ihre Bilder werden geladen…" : "Auswahl wird geladen…"}
            </p>
          ) : null}
          {banner && !loading ? <p className="pd-banner pd-banner--warn">{banner}</p> : null}

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
                  return (
                    <button
                      key={img.key}
                      type="button"
                      className={`pd-img-card${top ? ` ${CARD_FLAG_CLASS[top]}` : ""}${
                        s.msgs.length ? " pd-has-cmt" : ""
                      }`}
                      onClick={() => openLb(idx)}
                    >
                      <div className={`pd-thumb${watermarkEnabled ? " pd-thumb--watermark" : ""}`}>
                        <ThumbVisual img={img} restrictDownloadGestures={customerMode} />
                        <div className="pd-flag-chips">
                          {s.flags.map((f) => (
                            <span key={f} className={CHIP_CLASS[f]}>
                              <i className={CHIP_ICON[f]} aria-hidden="true" />
                              {FLAG_LABEL[f]}
                            </span>
                          ))}
                        </div>
                        <div className="pd-cmt-dot">
                          <i className="fa-solid fa-comment" />
                        </div>
                      </div>
                      <div className="pd-img-name">{img.name}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {submitError ? <p className="pd-banner pd-banner--warn pd-banner--above-submit">{submitError}</p> : null}

          <div className="pd-submit-bar">
            <button
              type="button"
              className={`pd-submit-btn${submitted ? " pd-submit-btn--sent" : ""}`}
              disabled={stats.withSendableContent === 0 || submitted || nImg === 0 || submitting}
              onClick={() => void submitAll()}
            >
              {submitted ? "✓ Gesendet" : submitting ? "…" : customerMode ? "Auswahl an Propus senden" : "Auswahl absenden"}
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={`pd-lb-overlay${lightboxOpen ? " pd-open" : ""}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {currentImg && currentState ? (
          <>
            <div className="pd-lb-topbar">
              <div className="pd-lb-filename">{currentImg.name}</div>
              <button type="button" className="pd-lb-close" onClick={closeLb} aria-label="Schließen">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="pd-lb-img-wrap">
              <div className={`pd-lb-img-box${watermarkEnabled ? " pd-lb-img-box--watermark" : ""}`}>
                {(() => {
                  const lbSrc = orderedThumbSources(currentImg);
                  if (lbSrc.length > 0) {
                    return (
                      <PicdropRasterImg
                        className="pd-lb-fullimg"
                        sources={lbSrc}
                        alt=""
                        restrictDownloadGestures={customerMode}
                      />
                    );
                  }
                  return (
                    <div className="pd-lb-bg" style={{ background: currentImg.placeholderColor }}>
                      <i className="fa-solid fa-image" style={{ fontSize: 40, color: "rgba(255,255,255,0.1)" }} />
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="pd-lb-nav-row">
              <button type="button" className="pd-nav-btn" onClick={() => navigateLb(-1)} aria-label="Vorheriges Bild">
                <i className="fa-solid fa-chevron-left" />
              </button>
              <span className="pd-nav-ctr">
                {lightboxIndex! + 1} / {nImg}
              </span>
              <button type="button" className="pd-nav-btn" onClick={() => navigateLb(1)} aria-label="Nächstes Bild">
                <i className="fa-solid fa-chevron-right" />
              </button>
            </div>

            <div className="pd-lb-bottom">
              <div className="pd-lb-flags-col">
                <div className="pd-panel-title">Flaggen setzen</div>
                <div className="pd-flag-btns">
                  <button
                    type="button"
                    className={`pd-fb${currentState.flags.includes("bearbeiten") ? " pd-fb--on" : ""}`}
                    onClick={() => toggleFlag("bearbeiten")}
                  >
                    <span className="pd-fb-icon" aria-hidden="true">
                      <i className="fa-solid fa-pencil" />
                    </span>
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className={`pd-fb${currentState.flags.includes("staging") ? " pd-fb--on" : ""}`}
                    onClick={() => toggleFlag("staging")}
                  >
                    <span className="pd-fb-icon" aria-hidden="true">
                      <i className="fa-solid fa-couch" />
                    </span>
                    Staging
                  </button>
                  <button
                    type="button"
                    className={`pd-fb${currentState.flags.includes("retusche") ? " pd-fb--on" : ""}`}
                    onClick={() => toggleFlag("retusche")}
                  >
                    <span className="pd-fb-icon" aria-hidden="true">
                      <i className="fa-solid fa-wand-magic-sparkles" />
                    </span>
                    Retusche
                  </button>
                </div>
              </div>

              <div className="pd-chat-panel">
                <div className="pd-chat-panel-head">
                  <div className="pd-panel-title">Kommentare</div>
                </div>
                <div className="pd-chat-log">
                  {currentState.msgs.length === 0 ? (
                    <div className="pd-chat-empty">Noch keine Kommentare</div>
                  ) : (
                    currentState.msgs.map((m, i) => (
                      <div key={i} className="pd-chat-msg pd-own">
                        {m.text}
                        <div className="pd-chat-meta">{m.time}</div>
                      </div>
                    ))
                  )}
                </div>
                <div className="pd-chat-input-row">
                  <textarea
                    className="pd-chat-input"
                    placeholder={customerMode ? "Nachricht an Propus…" : "Nachricht…"}
                    rows={2}
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    onKeyDown={onChatKeyDown}
                  />
                  <button type="button" className="pd-chat-send" onClick={sendMsg} aria-label="Senden">
                    <i className="fa-solid fa-paper-plane" />
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
