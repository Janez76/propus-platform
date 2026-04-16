import { useEffect, useMemo, useState } from "react";
import { buildEmailPreviewSrcDoc } from "../../lib/selekto/emailPreviewShell";
import {
  applyTemplateVars,
  EMAIL_TEMPLATE_REVISION_DONE_ID,
  getRevisionDoneEmailDesignDefaults,
  htmlEmailToPlainText,
  listEmailTemplates,
  publicGalleryDeepLink,
  publicGalleryUrl,
  trySendGalleryEmailViaEdge,
  type EmailTemplateVars,
} from "../../lib/selekto/galleryApi";
import type { ClientGalleryRow, EmailTemplateRow, GalleryFeedbackRow } from "../../lib/selekto/types";

type Props = {
  gallery: ClientGalleryRow;
  feedback: GalleryFeedbackRow;
  templateId: string;
  title: string;
  onClose: () => void;
};

export function SelektoFeedbackMailModal({ gallery, feedback, templateId, title, onClose }: Props) {
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [mailMsg, setMailMsg] = useState<string | null>(null);

  const vars: EmailTemplateVars = useMemo(() => {
    const link = publicGalleryUrl(gallery.slug);
    const direct =
      feedback.asset_type === "image"
        ? publicGalleryDeepLink(gallery.slug, { bild: feedback.asset_key })
        : link;
    const comment = feedback.body?.trim() ?? "";
    return {
      gallery_link: link,
      title: gallery.title?.trim() || "Ihre Bildauswahl",
      customer_name: gallery.client_name ?? "",
      address: gallery.address?.trim() ?? "",
      /** Kundenkommentar (dieses Feedback stammt aus der Kunden-Bildauswahl, nicht vom Büro). */
      customer_comment: comment || "—",
      /** Kompatibel mit älteren Vorlagen, die noch {{feedback_body}} nutzen. */
      feedback_body: comment || "—",
      asset_label: feedback.asset_label?.trim() || "—",
      direct_link: direct,
      revision: String(feedback.revision),
    };
  }, [gallery, feedback]);

  useEffect(() => {
    setMailMsg(null);
    void listEmailTemplates().then(setTemplates).catch(() => {});
  }, [gallery.id, feedback.id, templateId]);

  const selectedTpl = useMemo((): EmailTemplateRow | null => {
    const fromDb = templates.find((t) => t.id === templateId);
    if (fromDb) return fromDb;
    if (templateId === EMAIL_TEMPLATE_REVISION_DONE_ID) {
      const d = getRevisionDoneEmailDesignDefaults();
      const now = new Date().toISOString();
      return {
        id: templateId,
        name: "Revision behoben (Standard)",
        subject: d.subject,
        body: d.body,
        is_default: false,
        created_at: now,
        updated_at: now,
      };
    }
    return null;
  }, [templates, templateId]);

  function buildMailto(): string | null {
    if (!selectedTpl) return null;
    const subj = applyTemplateVars(selectedTpl.subject, vars);
    const bodyHtml = applyTemplateVars(selectedTpl.body, vars);
    const bodyPlain = htmlEmailToPlainText(bodyHtml);
    const to = gallery.client_email?.trim();
    if (!to) return null;
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(bodyPlain)}`;
  }

  async function onSendEdge() {
    if (!selectedTpl) return;
    const to = gallery.client_email?.trim();
    if (!to) {
      setMailMsg("Keine Kunden-E-Mail hinterlegt.");
      return;
    }
    const subj = applyTemplateVars(selectedTpl.subject, vars);
    const html = applyTemplateVars(selectedTpl.body, vars);
    const r = await trySendGalleryEmailViaEdge({ to, subject: subj, html });
    setMailMsg(r.message);
  }

  const previewHtml = selectedTpl ? applyTemplateVars(selectedTpl.body, vars) : "";

  return (
    <div className="gal-admin-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="gal-admin-modal gal-admin-modal--wide gal-admin-modal--mail-preview"
        role="dialog"
        aria-labelledby="gal-feedback-mail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="gal-feedback-mail-title" className="admin-subheading">
          {title}
        </h2>
        <p className="admin-muted gal-admin-spacer">
          <strong>{gallery.title}</strong> · {gallery.client_email || "Keine E-Mail"}
        </p>
        {selectedTpl ? (
          <>
            <p className="admin-muted gal-admin-spacer">
              Betreff (Vorschau): <strong>{applyTemplateVars(selectedTpl.subject, vars)}</strong>
            </p>
            <div className="gal-admin-email-preview-shell gal-admin-email-preview-shell--modal">
              <iframe
                title="E-Mail-Vorschau"
                className="gal-admin-email-preview-frame"
                sandbox=""
                srcDoc={buildEmailPreviewSrcDoc(previewHtml)}
              />
            </div>
          </>
        ) : (
          <p className="admin-muted">Vorlage nicht gefunden. Bitte unter E-Mail-Vorlagen prüfen.</p>
        )}
        {mailMsg ? <p className="admin-muted">{mailMsg}</p> : null}
        <div className="gal-admin-modal__actions">
          {buildMailto() ? (
            <a href={buildMailto()!} className="admin-btn admin-btn--primary">
              E-Mail-Programm öffnen
            </a>
          ) : (
            <span className="admin-muted">Bitte Kunden-E-Mail bei dieser Auswahl speichern.</span>
          )}
          <button type="button" className="admin-btn admin-btn--outline" onClick={() => void onSendEdge()}>
            Server-Versand (optional)
          </button>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
