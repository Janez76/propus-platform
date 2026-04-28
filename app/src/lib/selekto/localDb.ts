import Dexie, { type Table } from "dexie";
import { LOGO_DARK } from "../../components/selekto/brandAssets";
import type { ClientDeliveryStatus } from "./types";

/** Kunden-E-Mail: Listing / Magic Link */
export const LISTING_EMAIL_TEMPLATE_ID = "propus-listing-email-v1";
/** Rückfrage zu einem Kommentar */
export const EMAIL_TEMPLATE_FOLLOWUP_ID = "propus-email-followup-v1";
/** Hinweis: Revision / Anmerkung behoben */
export const EMAIL_TEMPLATE_REVISION_DONE_ID = "propus-email-revision-done-v1";
/** Admin: Benachrichtigung nach Picdrop-Absenden durch Kunden */
export const PICDROP_ADMIN_NOTIFY_EMAIL_TEMPLATE_ID = "propus-picdrop-admin-notify-v1";

export const KNOWN_EMAIL_TEMPLATE_IDS = [
  LISTING_EMAIL_TEMPLATE_ID,
  EMAIL_TEMPLATE_FOLLOWUP_ID,
  PICDROP_ADMIN_NOTIFY_EMAIL_TEMPLATE_ID,
] as const;

export type GalleryStatus = "active" | "inactive";

export interface LocalGallery {
  id: string;
  slug: string;
  title: string;
  /** Zeile unter dem Titel im Hero (Adresse / Objektzeile) */
  address: string | null;
  client_name: string | null;
  client_email: string | null;
  /** Kunden-Versand: offen vs. versendet (manuell gesetzt). */
  client_delivery_status: ClientDeliveryStatus;
  /** ISO-Zeitpunkt des letzten als versendet markierten Versands. */
  client_delivery_sent_at: string | null;
  client_log_email_received_at: string | null;
  client_log_gallery_opened_at: string | null;
  /** Schritt 3 Kunden-Log: Auswahl bestätigt (Picdrop) oder Download */
  client_log_files_downloaded_at: string | null;
  status: GalleryStatus;
  matterport_input: string | null;
  cloud_share_url: string | null;
  /** Öffentliche MP4-URL aus letzter Freigabe */
  video_url: string | null;
  /** JSON: { url, title }[] Grundrisse aus Freigabe */
  floor_plans_json: string | null;
  /** Picdrop: automatisch gespeicherte Auswahl (kompaktes JSON) */
  picdrop_selection_json: string | null;
  /** Bilder in Kunden- und Vorschauansicht mit PROPUS-Wasserzeichen */
  watermark_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface LocalGalleryImage {
  id: string;
  gallery_id: string;
  sort_order: number;
  enabled: boolean;
  category: string | null;
  created_at: string;
  /** Original-Dateiname (Upload) oder aus Freigabe-URL; nur Anzeige im Backpanel */
  file_name?: string | null;
  /** Lokaler Upload (optional wenn remote_src gesetzt) */
  blob?: Blob;
  /** Öffentliche Bild-URL aus Propus Cloud – kein Download nötig */
  remote_src?: string | null;
}

export interface LocalEmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/** Kundenkommentar zu Bild oder Grundriss (Revision n = n-ter Kommentar im Listing). */
export interface LocalGalleryFeedback {
  id: string;
  gallery_id: string;
  gallery_slug: string;
  asset_type: "image" | "floor_plan";
  asset_key: string;
  asset_label: string;
  body: string;
  created_at: string;
  revision: number;
  /** ISO-Zeitpunkt wenn im Backpanel «Behoben»; null = offen */
  resolved_at: string | null;
  /** `office` = Rückfrage aus dem Backpanel (erscheint im Kunden-Chat); fehlend = Kunde */
  author?: "client" | "office";
  /** JSON-Array Picdrop-Flaggen: bearbeiten | staging | retusche */
  selection_flags_json?: string | null;
}

class GalleryLocalDexie extends Dexie {
  galleries!: Table<LocalGallery, string>;
  gallery_images!: Table<LocalGalleryImage, string>;
  email_templates!: Table<LocalEmailTemplate, string>;
  gallery_feedback!: Table<LocalGalleryFeedback, string>;

  constructor() {
    /** Eigener Store für Picdrop: leere Galerien beim ersten Start (nicht `propus_gallery_local_v1` von älteren Demos). */
    super("propus_picdrop_bildauswahl_v1");
    this.version(1).stores({
      galleries: "id, slug, updated_at, status",
      gallery_images: "id, gallery_id, sort_order",
      email_templates: "id, name, is_default",
    });
    this.version(2)
      .stores({
        galleries: "id, slug, updated_at, status",
        gallery_images: "id, gallery_id, sort_order",
        email_templates: "id, name, is_default",
      })
      .upgrade(async (tx) => {
        await tx
          .table("galleries")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.matterport_input === undefined) row.matterport_input = null;
            if (row.cloud_share_url === undefined) row.cloud_share_url = null;
          });
      });
    this.version(3)
      .stores({
        galleries: "id, slug, updated_at, status",
        gallery_images: "id, gallery_id, sort_order",
        email_templates: "id, name, is_default",
      })
      .upgrade(async (tx) => {
        await tx
          .table("gallery_images")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.remote_src === undefined) row.remote_src = null;
          });
      });
    this.version(4)
      .stores({
        galleries: "id, slug, updated_at, status",
        gallery_images: "id, gallery_id, sort_order",
        email_templates: "id, name, is_default",
      })
      .upgrade(async (tx) => {
        await tx
          .table("galleries")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.address === undefined) row.address = null;
            if (row.video_url === undefined) row.video_url = null;
            if (row.floor_plans_json === undefined) row.floor_plans_json = null;
          });
      });
    this.version(5)
      .stores({
        galleries: "id, slug, updated_at, status",
        gallery_images: "id, gallery_id, sort_order",
        email_templates: "id, name, is_default",
      })
      .upgrade(async (tx) => {
        await tx
          .table("gallery_images")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.file_name === undefined) row.file_name = null;
          });
      });
    this.version(6)
      .stores({
        galleries: "id, slug, updated_at, status",
        gallery_images: "id, gallery_id, sort_order",
        email_templates: "id, name, is_default",
      })
      .upgrade(async (tx) => {
        await tx
          .table("galleries")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.client_delivery_status === undefined) row.client_delivery_status = "open";
          });
      });
    this.version(7)
      .stores({
        galleries: "id, slug, updated_at, status",
        gallery_images: "id, gallery_id, sort_order",
        email_templates: "id, name, is_default",
        gallery_feedback: "id, gallery_id, gallery_slug, created_at, revision",
      });
    this.version(8)
      .stores({
        galleries: "id, slug, updated_at, status",
        gallery_images: "id, gallery_id, sort_order",
        email_templates: "id, name, is_default",
        gallery_feedback: "id, gallery_id, gallery_slug, created_at, revision",
      })
      .upgrade(async (tx) => {
        await tx
          .table("gallery_feedback")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.resolved_at === undefined) row.resolved_at = null;
          });
      });
    this.version(9).stores({
      galleries: "id, slug, updated_at, status",
      gallery_images: "id, gallery_id, sort_order",
      email_templates: "id, name, is_default",
      gallery_feedback: "id, gallery_id, gallery_slug, created_at, revision",
    });
    this.version(10)
      .stores({
        galleries: "id, slug, updated_at, status",
        gallery_images: "id, gallery_id, sort_order",
        email_templates: "id, name, is_default",
        gallery_feedback: "id, gallery_id, gallery_slug, created_at, revision",
      })
      .upgrade(async (tx) => {
        await tx
          .table("gallery_feedback")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.author === undefined) row.author = "client";
          });
      });
    this.version(11)
      .stores({
        galleries: "id, slug, updated_at, status",
        gallery_images: "id, gallery_id, sort_order",
        email_templates: "id, name, is_default",
        gallery_feedback: "id, gallery_id, gallery_slug, created_at, revision",
      })
      .upgrade(async (tx) => {
        await tx
          .table("galleries")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.client_delivery_sent_at === undefined) {
              row.client_delivery_sent_at =
                row.client_delivery_status === "sent" ? (row.updated_at as string) ?? null : null;
            }
          });
      });
    this.version(12)
      .stores({
        galleries: "id, slug, updated_at, status",
        gallery_images: "id, gallery_id, sort_order",
        email_templates: "id, name, is_default",
        gallery_feedback: "id, gallery_id, gallery_slug, created_at, revision",
      })
      .upgrade(async (tx) => {
        await tx
          .table("galleries")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.client_log_gallery_opened === undefined) row.client_log_gallery_opened = false;
            if (row.client_log_files_downloaded === undefined) row.client_log_files_downloaded = false;
          });
      });
    this.version(13)
      .stores({
        galleries: "id, slug, updated_at, status",
        gallery_images: "id, gallery_id, sort_order",
        email_templates: "id, name, is_default",
        gallery_feedback: "id, gallery_id, gallery_slug, created_at, revision",
      })
      .upgrade(async (tx) => {
        await tx
          .table("galleries")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            const sentAt = row.client_delivery_sent_at as string | null | undefined;
            const upd = row.updated_at as string;
            if (row.client_log_email_received_at === undefined) {
              row.client_log_email_received_at =
                row.client_delivery_status === "sent" ? sentAt ?? upd ?? null : null;
            }
            if (row.client_log_gallery_opened_at === undefined) {
              row.client_log_gallery_opened_at = row.client_log_gallery_opened === true ? upd : null;
            }
            if (row.client_log_files_downloaded_at === undefined) {
              row.client_log_files_downloaded_at = row.client_log_files_downloaded === true ? upd : null;
            }
          });
      });
    this.version(14)
      .stores({
        galleries: "id, slug, updated_at, status",
        gallery_images: "id, gallery_id, sort_order",
        email_templates: "id, name, is_default",
        gallery_feedback: "id, gallery_id, gallery_slug, created_at, revision",
      })
      .upgrade(async (tx) => {
        await tx
          .table("gallery_feedback")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.selection_flags_json === undefined) row.selection_flags_json = null;
          });
      });
    this.version(15)
      .stores({
        galleries: "id, slug, updated_at, status",
        gallery_images: "id, gallery_id, sort_order",
        email_templates: "id, name, is_default",
        gallery_feedback: "id, gallery_id, gallery_slug, created_at, revision",
      })
      .upgrade(async (tx) => {
        await tx
          .table("galleries")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.picdrop_selection_json === undefined) row.picdrop_selection_json = null;
          });
      });
    this.version(16)
      .stores({
        galleries: "id, slug, updated_at, status",
        gallery_images: "id, gallery_id, sort_order",
        email_templates: "id, name, is_default",
        gallery_feedback: "id, gallery_id, gallery_slug, created_at, revision",
      })
      .upgrade(async (tx) => {
        await tx
          .table("galleries")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            if (row.watermark_enabled === undefined) row.watermark_enabled = true;
          });
      });
  }
}

export const galleryLocalDb = new GalleryLocalDexie();

export const LISTING_EMAIL_DEFAULT_SUBJECT = "Ihre Auswahl – {{title}}";
export const PICDROP_ADMIN_NOTIFY_DEFAULT_SUBJECT = "Neue Bildauswahl eingegangen";
export const FOLLOWUP_EMAIL_DEFAULT_SUBJECT = "Rückfrage zu Ihrem Kommentar";
export const REVISION_DONE_EMAIL_DEFAULT_SUBJECT = "Ihre Anmerkung wurde umgesetzt – {{title}}";

/** Versions-Marker: verhindert wiederholtes Überschreiben benutzerdefinierter HTML-Mails. */
const EMAIL_DESIGNED_MARKER = "propus-email-designed-v1";

const LEGACY_EMAIL_SUBJECTS = new Set([
  "Ihre Immobilien-Galerie",
  "Schön, dass wir für Sie fotografieren durften",
  "Ihre exklusive Galerie",
]);

function needsDesignedEmailUpgrade(body: string): boolean {
  const t = body.trim();
  if (!t) return true;
  if (t.includes("wir haben Ihre Bilder für Sie zusammengestellt")) return true;
  if (t.includes("Shooting gebucht") || t.includes("Mein Listing ansehen")) return true;
  /** Propus-Standard mit älterem CTA/Fliesstext → auf aktuelle Vorlage anheben (Marker bleibt gleich). */
  if (t.includes(EMAIL_DESIGNED_MARKER) && (t.includes("Zur Bildauswahl") || t.includes("Sie können nun Ihre Bilder"))) {
    return true;
  }
  if (body.includes(EMAIL_DESIGNED_MARKER)) return false;
  if (!/<table\b/i.test(t)) return true;
  return false;
}

function defaultListingEmailBodyHtml(): string {
  const ff = "Inter,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
  const logo = LOGO_DARK;
  return `<!-- ${EMAIL_DESIGNED_MARKER} -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#e8eaed;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:32px 14px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e4e8;box-shadow:0 12px 40px rgba(15,15,15,0.07);">
        <tr>
          <td style="height:5px;background-color:#141414;line-height:0;font-size:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:36px 40px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="padding-bottom:22px;">
                  <img src="${logo}" alt="Propus" width="140" style="display:block;width:140px;max-width:100%;height:auto;border:0;" />
                </td>
              </tr>
            </table>
            <p style="margin:0 0 18px;font-family:${ff};font-size:18px;line-height:1.45;font-weight:600;color:#0f0f0f;letter-spacing:-0.02em;">Guten Tag{{customer_name_line}},</p>
            <p style="margin:0 0 20px;font-family:${ff};font-size:16px;line-height:1.6;color:#2a2a2a;">vielen Dank für Ihr Vertrauen. Ihre Aufnahmen zu <strong style="color:#0f0f0f;font-weight:600;">{{title}}</strong> stehen für Sie bereit.</p>
            <p style="margin:0 0 22px;font-family:${ff};font-size:16px;line-height:1.6;color:#2a2a2a;">Bitte wählen Sie die Bilder aus, die wir für Sie fertig bearbeiten sollen. Öffnen Sie dazu über den Button unten Ihre persönliche Auswahl, markieren Sie die gewünschten Motive und bestätigen Sie Ihre Auswahl. Wir setzen die Bearbeitung anschliessend um und stellen Ihnen die fertigen Bilder schnellstmöglich zu.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 26px;">
              <tr>
                <td style="border-radius:10px;background-color:#141414;">
                  <a href="{{gallery_link}}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 32px;font-family:${ff};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.02em;">Meine Auswahl ansehen</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 12px;font-family:${ff};font-size:13px;line-height:1.5;color:#6b6b6b;">Falls der Button nicht funktioniert, kopieren Sie diesen Link zu Ihrer Auswahl:<br /><a href="{{gallery_link}}" style="color:#185fa5;word-break:break-all;">{{gallery_link}}</a></p>
            <p style="margin:0 0 10px;font-family:${ff};font-size:14px;line-height:1.5;color:#5c5c5c;">Projekt</p>
            <p style="margin:0 0 26px;font-family:${ff};font-size:17px;line-height:1.45;font-weight:600;color:#0f0f0f;">{{title}}</p>
            <p style="margin:0 0 28px;font-family:${ff};font-size:16px;line-height:1.6;color:#2a2a2a;">Bei Fragen zur Auswahl oder zu einzelnen Bildern antworten Sie uns auf diese E-Mail oder wenden Sie sich an Ihren Propus-Kontakt.</p>
            <p style="margin:0;font-family:${ff};font-size:16px;line-height:1.6;color:#2a2a2a;">Freundliche Grüsse<br /><span style="color:#6b6b6b;font-size:15px;">Ihr Propus-Team</span></p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #eceef2;">
              <tr>
                <td style="padding-top:24px;">
                  <p style="margin:0 0 8px;font-family:${ff};font-size:12px;line-height:1.55;color:#8a8a8a;">Propus Immobilienmedien</p>
                  <p style="margin:0;font-family:${ff};font-size:12px;line-height:1.55;">
                    <a href="https://www.propus.ch/" style="color:#3d3d3d;text-decoration:underline;font-weight:500;">www.propus.ch</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

/** Öffentlich für «Propus-Standard laden» im Backpanel. */
export function getDefaultListingEmailBodyHtml(): string {
  return defaultListingEmailBodyHtml();
}

const EMAIL_FOLLOWUP_MARKER = "propus-email-followup-designed-v1";
const EMAIL_REVISION_DONE_MARKER = "propus-email-revision-done-designed-v1";

function defaultFollowupEmailBodyHtml(): string {
  const ff = "Inter,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
  const logo = LOGO_DARK;
  return `<!-- ${EMAIL_FOLLOWUP_MARKER} -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#e8eaed;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:32px 14px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e4e8;box-shadow:0 12px 40px rgba(15,15,15,0.07);">
        <tr><td style="height:5px;background-color:#141414;line-height:0;font-size:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:36px 40px 28px;">
            <img src="${logo}" alt="Propus" width="140" style="display:block;width:140px;max-width:100%;height:auto;border:0;margin-bottom:22px;" />
            <p style="margin:0 0 18px;font-family:${ff};font-size:18px;line-height:1.45;font-weight:600;color:#0f0f0f;">Guten Tag{{customer_name_line}},</p>
            <p style="margin:0 0 14px;font-family:${ff};font-size:16px;line-height:1.6;color:#2a2a2a;">wir möchten auf Ihren Kommentar zum Objekt <strong>{{title}}</strong> (<strong>{{asset_label}}</strong>, Revision {{revision}}) antworten. <strong>Dieselbe Rückfrage finden Sie im Listing</strong> im Kommentarbereich zu diesem Bild.</p>
            <p style="margin:0 0 8px;font-family:${ff};font-size:13px;font-weight:600;color:#5c5c5c;text-transform:uppercase;letter-spacing:0.04em;">Ihr Kommentar</p>
            <p style="margin:0 0 18px;padding:14px 16px;background:#f7f7f7;border-radius:10px;font-family:${ff};font-size:15px;line-height:1.55;color:#2a2a2a;border:1px solid #ececec;">{{customer_comment}}</p>
            <p style="margin:0 0 8px;font-family:${ff};font-size:13px;font-weight:600;color:#5c5c5c;text-transform:uppercase;letter-spacing:0.04em;">Unsere Rückfrage</p>
            <p style="margin:0 0 20px;padding:14px 16px;background:#fffbeb;border-radius:10px;font-family:${ff};font-size:15px;line-height:1.55;color:#422006;border:1px solid #fde68a;">{{feedback_body}}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 22px;">
              <tr>
                <td style="border-radius:10px;background-color:#141414;">
                  <a href="{{direct_link}}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 32px;font-family:${ff};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Zur Ansicht im Listing</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-family:${ff};font-size:15px;line-height:1.6;color:#5c5c5c;">Freundliche Grüsse<br /><span style="color:#6b6b6b;">Ihr Propus-Team</span></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function defaultRevisionDoneEmailBodyHtml(): string {
  const ff = "Inter,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
  const logo = LOGO_DARK;
  return `<!-- ${EMAIL_REVISION_DONE_MARKER} -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#e8eaed;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:32px 14px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e4e8;box-shadow:0 12px 40px rgba(15,15,15,0.07);">
        <tr><td style="height:5px;background-color:#141414;line-height:0;font-size:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:36px 40px 28px;">
            <img src="${logo}" alt="Propus" width="140" style="display:block;width:140px;max-width:100%;height:auto;border:0;margin-bottom:22px;" />
            <p style="margin:0 0 18px;font-family:${ff};font-size:18px;line-height:1.45;font-weight:600;color:#0f0f0f;">Guten Tag{{customer_name_line}},</p>
            <p style="margin:0 0 16px;font-family:${ff};font-size:16px;line-height:1.6;color:#2a2a2a;">vielen Dank für Ihre Rückmeldung zu <strong>{{title}}</strong>. Die Anmerkung zu <strong>{{asset_label}}</strong> (Revision {{revision}}) haben wir umgesetzt.</p>
            <p style="margin:0 0 20px;padding:12px 14px;background:#f0fdf4;border-radius:10px;font-family:${ff};font-size:14px;line-height:1.5;color:#166534;border:1px solid #bbf7d0;">Ihr ursprünglicher Kommentar:<br /><span style="color:#14532d;">{{customer_comment}}</span></p>
            <p style="margin:0 0 18px;font-family:${ff};font-size:13px;line-height:1.5;color:#6b6b6b;">Falls der Link nicht funktioniert, öffnen Sie die Bildauswahl über:<br /><a href="{{gallery_link}}" style="color:#185fa5;word-break:break-all;">{{gallery_link}}</a></p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 22px;">
              <tr>
                <td style="border-radius:10px;background-color:#141414;">
                  <a href="{{direct_link}}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 32px;font-family:${ff};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Listing erneut ansehen</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-family:${ff};font-size:15px;line-height:1.6;color:#5c5c5c;">Freundliche Grüsse<br /><span style="color:#6b6b6b;">Ihr Propus-Team</span></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

export function getDefaultFollowupEmailBodyHtml(): string {
  return defaultFollowupEmailBodyHtml();
}

export function getDefaultRevisionDoneEmailBodyHtml(): string {
  return defaultRevisionDoneEmailBodyHtml();
}

const EMAIL_ADMIN_NOTIFY_MARKER = "propus-email-admin-notify-designed-v1";

function defaultPicdropAdminNotifyBodyHtml(): string {
  const ff = "Inter,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
  const logo = LOGO_DARK;
  return `<!-- ${EMAIL_ADMIN_NOTIFY_MARKER} -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#e8eaed;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:32px 14px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e4e8;box-shadow:0 12px 40px rgba(15,15,15,0.07);">
        <tr><td style="height:5px;background-color:#141414;line-height:0;font-size:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:36px 40px 20px;">
            <img src="${logo}" alt="Propus" width="140" style="display:block;width:140px;max-width:100%;height:auto;border:0;margin-bottom:18px;" />
            <p style="margin:0 0 6px;font-family:${ff};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#7A5E10;">Benachrichtigung</p>
            <h1 style="margin:0 0 18px;font-family:${ff};font-size:20px;line-height:1.25;font-weight:700;color:#0f0f0f;">Neue Bildauswahl eingegangen</h1>
            <p style="margin:0 0 20px;font-family:${ff};font-size:15px;line-height:1.6;color:#2a2a2a;">Der Kunde hat die Auswahl bestätigt. Zusammenfassung:</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f9f9f7;border:1px solid #ececec;border-radius:10px;">
              <tr>
                <td style="padding:16px 18px;">
                  <p style="margin:0 0 8px;font-family:${ff};font-size:13px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.04em;">Kundendaten</p>
                  <p style="margin:0 0 6px;font-family:${ff};font-size:15px;line-height:1.5;color:#0f0f0f;"><strong>Kunde:</strong> {{customer_name}}</p>
                  <p style="margin:0;font-family:${ff};font-size:15px;line-height:1.5;color:#0f0f0f;"><strong>Projekt:</strong> {{title}}</p>
                </td>
              </tr>
            </table>
            <p style="margin:20px 0 8px;font-family:${ff};font-size:13px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.04em;">Dateien und Kommentare</p>
            <p style="margin:0;padding:14px 16px;background:#fafafa;border-radius:10px;border:1px solid #ececec;font-family:${ff};font-size:14px;line-height:1.65;color:#2a2a2a;white-space:pre-wrap;">{{Dateiliste}}</p>
            <p style="margin:22px 0 0;font-family:${ff};font-size:14px;line-height:1.55;color:#555;">Link zur Bildauswahl:<br /><a href="{{gallery_link}}" style="color:#185fa5;word-break:break-all;">{{gallery_link}}</a></p>
            <p style="margin:22px 0 0;font-family:${ff};font-size:14px;line-height:1.55;color:#5c5c5c;">Freundliche Grüsse<br /><span style="color:#8a8a8a;font-size:13px;">Automatische Benachrichtigung</span></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

export function getDefaultPicdropAdminNotifyBodyHtml(): string {
  return defaultPicdropAdminNotifyBodyHtml();
}

function newListingEmailTemplateRow(now: string): LocalEmailTemplate {
  return {
    id: LISTING_EMAIL_TEMPLATE_ID,
    name: "E-Mail an Kunden (Auswahl)",
    subject: LISTING_EMAIL_DEFAULT_SUBJECT,
    body: defaultListingEmailBodyHtml(),
    is_default: true,
    created_at: now,
    updated_at: now,
  };
}

const knownIdSet = new Set<string>([...KNOWN_EMAIL_TEMPLATE_IDS]);

/**
 * Listing-Vorlage, Rückfrage, Admin-Picdrop; entfernt unbekannte Template-IDs (inkl. alter «Revision behoben»-Zeilen).
 */
export async function ensureDefaultEmailTemplates(): Promise<void> {
  const now = new Date().toISOString();
  const all = await galleryLocalDb.email_templates.toArray();

  for (const t of all) {
    if (!knownIdSet.has(t.id)) {
      await galleryLocalDb.email_templates.delete(t.id);
    }
  }

  const fixed = await galleryLocalDb.email_templates.get(LISTING_EMAIL_TEMPLATE_ID);

  if (fixed) {
    const current = await galleryLocalDb.email_templates.get(LISTING_EMAIL_TEMPLATE_ID);
    if (current && needsDesignedEmailUpgrade(current.body)) {
      const subj = current.subject?.trim() ?? "";
      await galleryLocalDb.email_templates.update(LISTING_EMAIL_TEMPLATE_ID, {
        subject: LEGACY_EMAIL_SUBJECTS.has(subj) ? LISTING_EMAIL_DEFAULT_SUBJECT : subj || LISTING_EMAIL_DEFAULT_SUBJECT,
        body: defaultListingEmailBodyHtml(),
        updated_at: now,
      });
    }
  } else {
    const remaining = await galleryLocalDb.email_templates.toArray();
    const pick = remaining.find((t) => t.is_default) || remaining[0];
    const base = newListingEmailTemplateRow(now);
    const row: LocalEmailTemplate = pick
      ? {
          ...base,
          subject: pick.subject?.trim() || base.subject,
          body: pick.body?.trim() || base.body,
          created_at: pick.created_at || now,
          updated_at: now,
        }
      : base;
    await galleryLocalDb.email_templates.put({ ...row, id: LISTING_EMAIL_TEMPLATE_ID, updated_at: now });
  }

  if (!(await galleryLocalDb.email_templates.get(EMAIL_TEMPLATE_FOLLOWUP_ID))) {
    await galleryLocalDb.email_templates.add({
      id: EMAIL_TEMPLATE_FOLLOWUP_ID,
      name: "Rückfrage (Kommentar)",
      subject: FOLLOWUP_EMAIL_DEFAULT_SUBJECT,
      body: defaultFollowupEmailBodyHtml(),
      is_default: false,
      created_at: now,
      updated_at: now,
    });
  }

  if (!(await galleryLocalDb.email_templates.get(PICDROP_ADMIN_NOTIFY_EMAIL_TEMPLATE_ID))) {
    await galleryLocalDb.email_templates.add({
      id: PICDROP_ADMIN_NOTIFY_EMAIL_TEMPLATE_ID,
      name: "Admin: Bildauswahl eingegangen",
      subject: PICDROP_ADMIN_NOTIFY_DEFAULT_SUBJECT,
      body: defaultPicdropAdminNotifyBodyHtml(),
      is_default: false,
      created_at: now,
      updated_at: now,
    });
  }

  const listingRow = await galleryLocalDb.email_templates.get(LISTING_EMAIL_TEMPLATE_ID);
  if (listingRow?.name === "E-Mail an Kunden (Bildauswahl)") {
    await galleryLocalDb.email_templates.update(LISTING_EMAIL_TEMPLATE_ID, {
      name: "E-Mail an Kunden (Auswahl)",
      updated_at: now,
    });
  }
  if (listingRow?.subject?.trim() === "Ihre Bildauswahl – {{title}}") {
    await galleryLocalDb.email_templates.update(LISTING_EMAIL_TEMPLATE_ID, {
      subject: LISTING_EMAIL_DEFAULT_SUBJECT,
      updated_at: now,
    });
  }
}

/** @deprecated Nutze ensureDefaultEmailTemplates */
export async function ensureSingleListingEmailTemplate(): Promise<void> {
  await ensureDefaultEmailTemplates();
}

let openPromise: Promise<void> | null = null;

export function ensureGalleryLocalDb(): Promise<void> {
  if (!openPromise) {
    openPromise = (async () => {
      try {
        await galleryLocalDb.open();
        await ensureDefaultEmailTemplates();
      } catch (e) {
        openPromise = null;
        console.error("IndexedDB (Galerien):", e);
        throw e instanceof Error ? e : new Error("IndexedDB konnte nicht geöffnet werden.");
      }
    })();
  }
  return openPromise;
}
