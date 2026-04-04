import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  applyTemplateVars,
  EMAIL_TEMPLATE_FOLLOWUP_ID,
  htmlEmailToPlainText,
  listEmailTemplates,
  publicGalleryDeepLink,
  publicGalleryUrl,
  submitOfficeFeedback,
  type EmailTemplateVars,
} from "../../../api/listingAdmin";
import type { ClientGalleryRow, EmailTemplateRow, GalleryFeedbackRow } from "../../../components/listing/types";

function floorPlanIndexFromFeedbackAssetKey(key: string): number | null {
  const m = key.match(/floor_plan_(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

type Props = {
  gallery: ClientGalleryRow;
  /** Offener Kundenkommentar, zu dem Sie eine Rückfrage stellen */
  customerComment: GalleryFeedbackRow;
  onClose: () => void;
  onSaved: () => void;
};

export function ListingRueckfrageModal({ gallery, customerComment, onClose, onSaved }: Props) {
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okNotice, setOkNotice] = useState<string | null>(null);

  const selectedTpl = templates.find((t) => t.id === EMAIL_TEMPLATE_FOLLOWUP_ID) ?? null;

  const vars: EmailTemplateVars = useMemo(() => {
    const link = publicGalleryUrl(gallery.slug);
    const direct =
      customerComment.asset_type === "image"
        ? publicGalleryDeepLink(gallery.slug, { bild: customerComment.asset_key })
        : (() => {
            const idx = floorPlanIndexFromFeedbackAssetKey(customerComment.asset_key);
            return idx != null ? publicGalleryDeepLink(gallery.slug, { grundriss: idx }) : link;
          })();
    const trimmed = text.trim();
    return {
      gallery_link: link,
      title: gallery.title,
      customer_name: gallery.client_name ?? "",
      feedback_body: trimmed || "…",
      customer_comment: customerComment.body,
      asset_label: customerComment.asset_label,
      direct_link: direct,
      revision: String(customerComment.revision),
    };
  }, [gallery, customerComment, text]);

  useEffect(() => {
    setErr(null);
    setOkNotice(null);
    void listEmailTemplates().then(({ rows }) => setTemplates(rows)).catch(() => {});
  }, [gallery.id, customerComment.id]);

  function buildMailto(): string | null {
    if (!selectedTpl) return null;
    const subj = applyTemplateVars(selectedTpl.subject, vars);
    const bodyHtml = applyTemplateVars(selectedTpl.body, vars);
    const bodyPlain = htmlEmailToPlainText(bodyHtml);
    const to = gallery.client_email?.trim();
    if (!to) return null;
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(bodyPlain)}`;
  }

  function openMailto(href: string) {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function onSubmit() {
    const t = text.trim();
    if (!t) {
      setErr("Bitte Ihre Rückfrage formulieren (z. B. «Was meinen Sie genau mit …?»).");
      return;
    }
    setErr(null);
    setOkNotice(null);
    setBusy(true);
    try {
      await submitOfficeFeedback(gallery.id, {
        asset_type: customerComment.asset_type,
        asset_key: customerComment.asset_key,
        asset_label: customerComment.asset_label,
        body: t,
      });
      onSaved();
      const mail = buildMailto();
      if (mail) {
        openMailto(mail);
        onClose();
      } else {
        setOkNotice(
          "Rückfrage wurde im Listing gespeichert. Es ist keine Kunden-E-Mail hinterlegt – bitte die Adresse in der Galerie nachtragen oder den Kunden manuell informieren. Sie können dieses Fenster schließen.",
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  const modal = (
    <div className="gal-admin-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="gal-admin-modal gal-admin-modal--wide"
        role="dialog"
        aria-labelledby="gal-rueckfrage-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="gal-rueckfrage-title" className="admin-subheading">
          Rückfrage an den Kunden
        </h2>
        <p className="admin-muted gal-admin-spacer">
          Der Text erscheint im <strong>Kommentarbereich</strong> im Kunden-Listing (gleiches Bild oder Grundriss).
        </p>
        <p className="gal-admin-rueckfrage-mail-hint">
          Der Kunde erhält <strong>zusätzlich eine E-Mail</strong>. Nach «Absenden» öffnet sich Ihr E-Mail-Programm mit dem Entwurf, sofern eine Kunden-E-Mail bei der Galerie gespeichert ist.
        </p>
        <p className="admin-muted gal-admin-spacer">
          <strong>{gallery.title}</strong> · {gallery.client_email || "Keine E-Mail"}
        </p>

        <div className="admin-field">
          <label htmlFor="gal-rueckfrage-text">Ihre Rückfrage</label>
          <textarea
            id="gal-rueckfrage-text"
            className="gal-admin-email-html-textarea"
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="z. B. Was meinen Sie genau mit «zu dunkel» – den Vordergrund oder den Himmel?"
            maxLength={4000}
            disabled={busy}
          />
        </div>

        {customerComment.body ? (
          <details className="gal-admin-rueckfrage-context">
            <summary className="admin-muted">Zugehöriger Kundenkommentar anzeigen</summary>
            <p className="gal-admin-rueckfrage-context__quote">{customerComment.body}</p>
          </details>
        ) : null}

        {err ? (
          <p className="admin-msg admin-msg--err" role="alert">
            {err}
          </p>
        ) : null}
        {okNotice ? <p className="admin-msg admin-msg--ok">{okNotice}</p> : null}

        {!selectedTpl ? (
          <p className="admin-msg admin-msg--err gal-admin-spacer" role="alert">
            Vorlage «Rückfrage» fehlt – bitte unter E-Mail-Vorlagen anlegen. Der Text wird trotzdem im Listing gespeichert; ohne Vorlage kein E-Mail-Entwurf.
          </p>
        ) : null}

        <div className="gal-admin-modal__actions">
          <button type="button" className="admin-btn admin-btn--primary" disabled={busy || !text.trim()} onClick={() => void onSubmit()}>
            {busy ? "Wird gesendet…" : "Absenden"}
          </button>
          <button type="button" className="admin-btn admin-btn--ghost" disabled={busy} onClick={onClose}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
