import { useEffect, useMemo, useState } from "react";
import {
  applyTemplateVars,
  htmlEmailToPlainText,
  listEmailTemplates,
  publicGalleryDeepLink,
  publicGalleryUrl,
  type EmailTemplateVars,
} from "../../../api/listingAdmin";
import type { ClientGalleryRow, EmailTemplateRow, GalleryFeedbackRow } from "../../../components/listing/types";
import { buildEmailPreviewSrcDoc } from "./emailPreviewShell";

function floorPlanIndexFromFeedbackAssetKey(key: string): number | null {
  const m = key.match(/floor_plan_(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

type Props = {
  gallery: ClientGalleryRow;
  feedback: GalleryFeedbackRow;
  templateId: string;
  title: string;
  onClose: () => void;
};

export function ListingFeedbackMailModal({ gallery, feedback, templateId, title, onClose }: Props) {
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [mailMsg, setMailMsg] = useState<string | null>(null);

  const vars: EmailTemplateVars = useMemo(() => {
    const link = publicGalleryUrl(gallery.slug);
    const direct =
      feedback.asset_type === "image"
        ? publicGalleryDeepLink(gallery.slug, { bild: feedback.asset_key })
        : (() => {
            const idx = floorPlanIndexFromFeedbackAssetKey(feedback.asset_key);
            return idx != null ? publicGalleryDeepLink(gallery.slug, { grundriss: idx }) : link;
          })();
    return {
      gallery_link: link,
      title: gallery.title,
      customer_name: gallery.client_name ?? "",
      feedback_body: feedback.body,
      asset_label: feedback.asset_label,
      direct_link: direct,
      revision: String(feedback.revision),
    };
  }, [gallery, feedback]);

  useEffect(() => {
    setMailMsg(null);
    void listEmailTemplates().then(({ rows }) => setTemplates(rows)).catch(() => {});
  }, [gallery.id, feedback.id, templateId]);

  const selectedTpl = templates.find((t) => t.id === templateId) ?? null;

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
    setMailMsg("Server-Versand ist in dieser Version nicht verfügbar. Bitte «E-Mail-Programm öffnen» nutzen.");
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
            <span className="admin-muted">Bitte Kunden-E-Mail in der Galerie speichern.</span>
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
