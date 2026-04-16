import { useEffect, useRef, useState } from "react";
import {
  applyTemplateVars,
  htmlEmailToPlainText,
  listEmailTemplates,
  LISTING_EMAIL_TEMPLATE_ID,
  publicGalleryUrl,
  recordGalleryCustomerEmailSent,
} from "../../lib/selekto/galleryApi";
import type { ClientGalleryRow, EmailTemplateRow } from "../../lib/selekto/types";

type Props = {
  gallery: ClientGalleryRow | null;
  onClose: () => void;
  /** Nach Speichern «versendet» (z. B. Stammdaten neu laden). */
  onRecordedSent: () => void;
};

function fmtDeliveryDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "long" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function SelektoSendMailModal({ gallery, onClose, onRecordedSent }: Props) {
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [mailMsg, setMailMsg] = useState<string | null>(null);
  const [phase, setPhase] = useState<"confirm" | "sent">("confirm");
  const [sending, setSending] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!gallery) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [gallery, onClose]);

  useEffect(() => {
    if (!gallery) return;
    setMailMsg(null);
    setPhase("confirm");
    void listEmailTemplates().then(setTemplates).catch(() => {});
  }, [gallery]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  if (!gallery) return null;
  const g = gallery;

  const selectedTpl = templates.find((t) => t.id === LISTING_EMAIL_TEMPLATE_ID) ?? templates[0];
  const title = g.title?.trim() || "Diese Auswahl";

  function buildMailto(): string | null {
    if (!selectedTpl) return null;
    const link = publicGalleryUrl(g.slug);
    const subj = applyTemplateVars(selectedTpl.subject, {
      gallery_link: link,
      title: g.title,
      customer_name: g.client_name ?? "",
      address: g.address ?? "",
    });
    const bodyHtml = applyTemplateVars(selectedTpl.body, {
      gallery_link: link,
      title: g.title,
      customer_name: g.client_name ?? "",
      address: g.address ?? "",
    });
    const bodyPlain = htmlEmailToPlainText(bodyHtml);
    const to = g.client_email?.trim();
    if (!to) return null;
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(bodyPlain)}`;
  }

  function scheduleCloseAfterSent() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, 2500);
  }

  async function onJetztSenden() {
    const href = buildMailto();
    const to = g.client_email?.trim();
    if (!to || !href) {
      setMailMsg("Bitte Kunden-E-Mail bei dieser Auswahl speichern.");
      return;
    }
    if (!selectedTpl) {
      setMailMsg("Keine E-Mail-Vorlage gefunden.");
      return;
    }
    setMailMsg(null);
    setSending(true);
    try {
      await recordGalleryCustomerEmailSent(g.id);
      onRecordedSent();
    } catch {
      setMailMsg("Speichern fehlgeschlagen.");
      setSending(false);
      return;
    }
    setSending(false);
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setPhase("sent");
    scheduleCloseAfterSent();
  }

  const showResendWarning = g.client_delivery_status === "sent";
  const recipientName = (g.client_name ?? "").trim() || "—";
  const recipientEmail = (g.client_email ?? "").trim() || "—";

  return (
    <div className="gal-admin-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="gal-admin-modal gal-admin-modal--delete gal-admin-mail-send-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gal-mail-send-title"
        aria-describedby="gal-mail-send-desc"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === "confirm" ? (
          <>
            <div className="gal-admin-mail-send-modal__icon" aria-hidden={true}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="m22 6-10 7L2 6"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <p id="gal-mail-send-title" className="gal-admin-delete-modal__title">
              «{title}» – Link zur Auswahl per E-Mail senden?
            </p>
            <p id="gal-mail-send-desc" className="gal-admin-mail-send-modal__recipient">
              <span className="gal-admin-mail-send-modal__recipient-label">Empfänger</span>
              <span className="gal-admin-mail-send-modal__recipient-name">{recipientName}</span>
              <span className="gal-admin-mail-send-modal__recipient-email">{recipientEmail}</span>
            </p>
            {showResendWarning ? (
              <p className="gal-admin-mail-send-modal__resend-warn" role="status">
                {g.client_delivery_sent_at ? (
                  <>
                    Der Kunde hat den Link zur Auswahl bereits am <strong>{fmtDeliveryDate(g.client_delivery_sent_at)}</strong>{" "}
                    erhalten. Ein erneuter Versand könnte zu Verwirrung führen.
                  </>
                ) : (
                  <>
                    Für diese Auswahl ist der Versand bereits als «versendet» markiert. Ein erneuter Versand könnte zu
                    Verwirrung führen.
                  </>
                )}
              </p>
            ) : null}
            {mailMsg ? <p className="gal-admin-mail-send-modal__err">{mailMsg}</p> : null}

            <div className="gal-admin-delete-modal__actions">
              <button type="button" className="admin-btn admin-btn--outline" onClick={onClose} disabled={sending}>
                Abbrechen
              </button>
              <button
                type="button"
                className="admin-btn gal-admin-btn--mail-send"
                disabled={sending}
                onClick={() => void onJetztSenden()}
              >
                {sending ? "…" : "Jetzt senden"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="gal-admin-mail-send-modal__icon gal-admin-mail-send-modal__icon--success" aria-hidden={true}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 6L9 17l-5-5"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="gal-admin-delete-modal__title">Gesendet</p>
            <div className="gal-admin-mail-send-modal__recipient gal-admin-mail-send-modal__recipient--sent">
              <span className="gal-admin-mail-send-modal__recipient-name">{recipientName}</span>
              <span className="gal-admin-mail-send-modal__recipient-email">{recipientEmail}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
