import { useCallback, useEffect, useRef, useState } from "react";
import type { GalleryFeedbackRow } from "./types";
import { listFeedbackForAsset, submitFeedback } from "../../api/listingPublic";

type Props = {
  galleryId: string;
  gallerySlug: string;
  asset_type: "image" | "floor_plan";
  asset_key: string;
  asset_label: string;
  className?: string;
};

function formatFeedbackTime(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("de-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
}

export function ClientAssetFeedbackChat({
  galleryId,
  gallerySlug,
  asset_type,
  asset_key,
  asset_label,
  className,
}: Props) {
  const [items, setItems] = useState<GalleryFeedbackRow[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const rows = await listFeedbackForAsset(galleryId, gallerySlug, { asset_type, asset_key });
    setItems(rows);
  }, [galleryId, gallerySlug, asset_type, asset_key]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Admin markiert «Behoben» im Backpanel: regelmässig neu laden (gleicher Browser / andere Registerkarte). */
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load();
    }, 12000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items]);

  async function send() {
    setErr(null);
    setBusy(true);
    try {
      await submitFeedback({
        galleryId,
        gallerySlug,
        asset_type,
        asset_key,
        asset_label,
        body: text,
      });
      setText("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`client-feedback-chat${className ? ` ${className}` : ""}`}>
      <div
        ref={threadRef}
        className="client-feedback-chat__thread"
        role="log"
        aria-label={`Kommentarverlauf zu ${asset_label}`}
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.length === 0 ? (
          <p className="client-feedback-chat__empty">Noch keine Kommentare – schreiben Sie unten die erste Nachricht.</p>
        ) : (
          items.map((m) => {
            const fromOffice = m.author === "office";
            return (
            <article
              key={m.id}
              className={
                "client-feedback-chat__msg" +
                (fromOffice ? " client-feedback-chat__msg--office" : "") +
                (m.resolved_at ? " client-feedback-chat__msg--resolved" : "")
              }
            >
              <div className="client-feedback-chat__msg-meta">
                <span className="client-feedback-chat__msg-author">
                  {fromOffice ? "Büro – Rückfrage" : "Kunde"}
                </span>
                <time className="client-feedback-chat__msg-time" dateTime={m.created_at}>
                  {formatFeedbackTime(m.created_at)}
                </time>
                {m.resolved_at ? (
                  <span className="client-feedback-chat__msg-resolved-badge" title={`Behoben ${formatFeedbackTime(m.resolved_at)}`}>
                    Behoben
                  </span>
                ) : null}
              </div>
              <div className="client-feedback-chat__msg-bubble">
                <p className="client-feedback-chat__msg-text">{m.body}</p>
                {m.resolved_at ? (
                  <p className="client-feedback-chat__msg-resolved-note">
                    Vom Büro als erledigt markiert · {formatFeedbackTime(m.resolved_at)}
                  </p>
                ) : null}
              </div>
            </article>
            );
          })
        )}
      </div>
      <div className="client-feedback-chat__composer">
        <textarea
          id={`feedback-composer-${asset_key.replace(/[^a-z0-9-]/gi, "-")}`}
          className="client-feedback-chat__input"
          rows={2}
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nutzer – Ihre Nachricht …"
          disabled={busy}
          aria-label={`Neuer Kommentar zu ${asset_label}`}
        />
        <div className="client-feedback-chat__composer-actions">
          <button
            type="button"
            className="btn btn--outline btn--sm"
            disabled={busy || !text.trim()}
            onClick={() => void send()}
          >
            {busy ? "Wird gesendet…" : "Senden"}
          </button>
        </div>
        {err ? (
          <p className="client-feedback-chat__err" role="alert">
            {err}
          </p>
        ) : null}
      </div>
    </div>
  );
}
