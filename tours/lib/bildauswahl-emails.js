'use strict';
/**
 * Bildauswahl: E-Mail-Vorlagen, Default-Bodies, Variablen-Substitution,
 * Versand per Microsoft Graph (sendMailDirect).
 *
 * Geteilt zwischen der Admin-API (Einladungsmail) und der Public-API
 * (Admin-Notify nach erfolgreicher Kundenauswahl).
 */

const { pool } = require('./db');
const { sendMailDirect } = require('./microsoft-graph');

const EMAIL_TPL = {
  INVITE: 'propus-bildauswahl-invite-v1',
  ADMIN_NOTIFY: 'propus-bildauswahl-admin-notify-v1',
  FOLLOWUP: 'propus-bildauswahl-followup-v1',
  REVISION_DONE: 'propus-bildauswahl-revision-done-v1',
};

const FF = "Inter,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

function defaultInviteBody() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#e8eaed;margin:0;padding:0;">
  <tr><td align="center" style="padding:32px 14px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e4e8;box-shadow:0 12px 40px rgba(15,15,15,0.07);">
      <tr><td style="height:5px;background:#141414;line-height:0;font-size:0;">&nbsp;</td></tr>
      <tr><td style="padding:36px 40px 28px;font-family:${FF};">
        <p style="margin:0 0 18px;font-size:18px;font-weight:600;color:#0f0f0f;">Guten Tag{{customer_name_line}},</p>
        <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#2a2a2a;">vielen Dank für Ihr Vertrauen. Ihre Aufnahmen zu <strong>{{title}}</strong> stehen für Sie bereit.</p>
        <p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#2a2a2a;">Bitte wählen Sie die Bilder aus, die wir für Sie fertig bearbeiten sollen. Markieren Sie die gewünschten Motive mit den Flaggen «Bearbeiten», «Staging» oder «Retusche» und bestätigen Sie Ihre Auswahl unten auf der Seite.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 26px;">
          <tr><td style="border-radius:10px;background:#141414;">
            <a href="{{gallery_link}}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 32px;font-size:15px;font-weight:600;color:#fff;text-decoration:none;font-family:${FF};">Meine Auswahl ansehen</a>
          </td></tr>
        </table>
        <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#6b6b6b;">Falls der Button nicht funktioniert:<br /><a href="{{gallery_link}}" style="color:#185fa5;word-break:break-all;">{{gallery_link}}</a></p>
        <p style="margin:0;font-size:16px;line-height:1.6;color:#2a2a2a;">Freundliche Grüsse<br /><span style="color:#6b6b6b;">Ihr Propus-Team</span></p>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

function defaultAdminNotifyBody() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#e8eaed;margin:0;padding:0;">
  <tr><td align="center" style="padding:32px 14px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e4e8;">
      <tr><td style="height:5px;background:#141414;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:32px 36px 24px;font-family:${FF};">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#7A5E10;">Benachrichtigung</p>
        <h1 style="margin:0 0 18px;font-size:20px;line-height:1.25;font-weight:700;color:#0f0f0f;">Neue Bildauswahl eingegangen</h1>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f9f9f7;border:1px solid #ececec;border-radius:10px;">
          <tr><td style="padding:14px 16px;">
            <p style="margin:0 0 6px;font-size:14px;line-height:1.5;"><strong>Kunde:</strong> {{customer_name}}</p>
            <p style="margin:0 0 6px;font-size:14px;line-height:1.5;"><strong>Projekt:</strong> {{title}}</p>
            <p style="margin:0;font-size:14px;line-height:1.5;"><strong>Bestell-Nr:</strong> {{order_no}}</p>
          </td></tr>
        </table>
        <p style="margin:18px 0 6px;font-size:12px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:0.04em;">Markierte Bilder & Kommentare</p>
        <div style="padding:12px 14px;background:#fafafa;border-radius:10px;border:1px solid #ececec;font-size:13px;line-height:1.6;color:#2a2a2a;white-space:pre-wrap;">{{file_list}}</div>
        <p style="margin:18px 0 0;font-size:13px;line-height:1.55;color:#555;"><a href="{{gallery_link}}" style="color:#185fa5;">Im Backpanel öffnen</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

function defaultFollowupBody() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#e8eaed;margin:0;padding:0;">
  <tr><td align="center" style="padding:32px 14px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e4e8;">
      <tr><td style="height:5px;background:#141414;">&nbsp;</td></tr>
      <tr><td style="padding:32px 36px 24px;font-family:${FF};">
        <p style="margin:0 0 14px;font-size:17px;font-weight:600;">Guten Tag{{customer_name_line}},</p>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">wir möchten auf Ihren Kommentar zum Objekt <strong>{{title}}</strong> ({{asset_label}}, Revision {{revision}}) antworten.</p>
        <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.04em;">Ihr Kommentar</p>
        <div style="padding:12px 14px;background:#f7f7f7;border-radius:10px;font-size:14px;margin-bottom:14px;">{{customer_comment}}</div>
        <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.04em;">Unsere Rückfrage</p>
        <div style="padding:12px 14px;background:#fffbeb;border-radius:10px;font-size:14px;border:1px solid #fde68a;color:#422006;margin-bottom:16px;">{{feedback_body}}</div>
        <p style="margin:18px 0 0;font-size:13px;"><a href="{{direct_link}}" style="background:#141414;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-family:${FF};">Zur Bildauswahl</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

function defaultRevisionDoneBody() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#e8eaed;margin:0;padding:0;">
  <tr><td align="center" style="padding:32px 14px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e4e8;">
      <tr><td style="height:5px;background:#141414;">&nbsp;</td></tr>
      <tr><td style="padding:32px 36px 24px;font-family:${FF};">
        <p style="margin:0 0 14px;font-size:17px;font-weight:600;">Guten Tag{{customer_name_line}},</p>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">vielen Dank für Ihre Rückmeldung zu <strong>{{title}}</strong>. Die Anmerkung zu <strong>{{asset_label}}</strong> (Revision {{revision}}) haben wir umgesetzt.</p>
        <div style="padding:12px 14px;background:#f0fdf4;border-radius:10px;font-size:14px;color:#166534;border:1px solid #bbf7d0;margin-bottom:14px;">Ihr ursprünglicher Kommentar:<br /><span style="color:#14532d;">{{customer_comment}}</span></div>
        <p style="margin:18px 0 0;font-size:13px;"><a href="{{direct_link}}" style="background:#141414;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-family:${FF};">Erneut ansehen</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

const TEMPLATE_DEFAULTS = {
  [EMAIL_TPL.INVITE]: { subject: 'Ihre Bildauswahl – {{title}}', body: defaultInviteBody },
  [EMAIL_TPL.ADMIN_NOTIFY]: { subject: 'Neue Bildauswahl eingegangen – {{title}}', body: defaultAdminNotifyBody },
  [EMAIL_TPL.FOLLOWUP]: { subject: 'Rückfrage zu Ihrer Anmerkung – {{title}}', body: defaultFollowupBody },
  [EMAIL_TPL.REVISION_DONE]: { subject: 'Anmerkung umgesetzt – {{title}}', body: defaultRevisionDoneBody },
};

/**
 * Boot-Hook: schreibt Default-Subjects/Bodies in leere Vorlagen-Zeilen.
 * Admin-Edits werden NICHT überschrieben (subject/body != '' wird behalten).
 */
async function ensureDefaultBildauswahlEmailTemplates() {
  for (const [id, { subject, body }] of Object.entries(TEMPLATE_DEFAULTS)) {
    await pool.query(
      `UPDATE tour_manager.gallery_email_templates
       SET subject = CASE WHEN COALESCE(subject, '') = '' THEN $1 ELSE subject END,
           body    = CASE WHEN COALESCE(body, '')    = '' THEN $2 ELSE body END,
           updated_at = NOW()
       WHERE id = $3 AND kind = 'bildauswahl'`,
      [subject, body(), id],
    );
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(s) {
  return String(s || '').replace(/\r\n|\n|\r/g, '<br />');
}

function applyTemplateVars(text, vars) {
  const name = (vars.customer_name || '').trim();
  const nameEsc = escapeHtml(name);
  const customerNameLine = name ? ` ${nameEsc}` : '';
  return String(text || '')
    .replaceAll('{{gallery_link}}', (vars.gallery_link || '').trim())
    .replaceAll('{{Link}}', (vars.gallery_link || '').trim())
    .replaceAll('{{title}}', escapeHtml(vars.title || ''))
    .replaceAll('{{Titel}}', escapeHtml(vars.title || ''))
    .replaceAll('{{customer_name}}', nameEsc)
    .replaceAll('{{Kundenname}}', nameEsc)
    .replaceAll('{{customer_name_line}}', customerNameLine)
    .replaceAll('{{address}}', escapeHtml(vars.address || ''))
    .replaceAll('{{order_no}}', escapeHtml(vars.order_no != null ? String(vars.order_no) : '—'))
    .replaceAll('{{file_list}}', nl2br(escapeHtml(vars.file_list || '')))
    .replaceAll('{{Dateiliste}}', nl2br(escapeHtml(vars.file_list || '')))
    .replaceAll('{{feedback_body}}', nl2br(escapeHtml(vars.feedback_body || '')))
    .replaceAll('{{customer_comment}}', nl2br(escapeHtml(vars.customer_comment || '')))
    .replaceAll('{{asset_label}}', escapeHtml(vars.asset_label || ''))
    .replaceAll('{{direct_link}}', (vars.direct_link || vars.gallery_link || '').trim())
    .replaceAll('{{revision}}', escapeHtml(vars.revision != null ? String(vars.revision) : ''));
}

async function loadTemplate(id) {
  const { rows } = await pool.query(
    `SELECT id, subject, body FROM tour_manager.gallery_email_templates WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

function notifyEmailRecipient() {
  const raw =
    process.env.BILDAUSWAHL_NOTIFY_EMAIL ||
    process.env.PICDROP_NOTIFY_EMAIL ||
    process.env.OFFICE_EMAIL ||
    '';
  return String(raw || '').trim();
}

function customerPublicUrl(gallery, siteBaseUrl) {
  /**
   * Vanity-Host: standardmäßig `selekto.propus.ch`. Override durch
   * env `BILDAUSWAHL_PUBLIC_HOST`. Wenn explizit leer, fällt der Link
   * auf `<siteBaseUrl>/bildauswahl/<slug>` zurück.
   */
  const hostOverride = (process.env.BILDAUSWAHL_PUBLIC_HOST ?? 'selekto.propus.ch').trim();
  const slug = (gallery.friendly_slug || gallery.slug || '').trim();
  if (hostOverride) {
    return `https://${hostOverride}/${encodeURIComponent(slug)}`;
  }
  const base = String(siteBaseUrl || '').replace(/\/$/, '');
  return `${base}/bildauswahl/${encodeURIComponent(slug)}`;
}

function adminEditorUrl(gallery, siteBaseUrl) {
  const base = String(siteBaseUrl || process.env.ADMIN_PANEL_URL || '').replace(/\/$/, '');
  return `${base}/admin/bildauswahl/${gallery.id}`;
}

/** Bei eingehender Kunden-Auswahl: Admin per Mail benachrichtigen. */
async function sendAdminNotifyMail({ gallery, items, siteBaseUrl }) {
  const to = notifyEmailRecipient();
  if (!to) return { skipped: 'no-recipient' };
  const tpl = await loadTemplate(EMAIL_TPL.ADMIN_NOTIFY);
  if (!tpl) return { skipped: 'no-template' };

  const lines = (items || []).map((it) => {
    const flags = Array.isArray(it.flags) && it.flags.length ? ` [${it.flags.join(', ')}]` : '';
    const body = it.body ? ` — ${String(it.body).split('\n').join(' / ')}` : '';
    return `• ${it.asset_label || 'Bild'}${flags}${body}`;
  });
  const vars = {
    gallery_link: adminEditorUrl(gallery, siteBaseUrl),
    title: gallery.title || 'Bildauswahl',
    customer_name: gallery.client_name || '—',
    address: gallery.address || '',
    order_no: gallery.booking_order_no,
    file_list: lines.join('\n'),
  };
  const subject = applyTemplateVars(tpl.subject, vars);
  const htmlBody = applyTemplateVars(tpl.body, vars);
  const r = await sendMailDirect({ to, subject, htmlBody });
  return { success: !!r.success, error: r.error || null, to };
}

/** Kunden-Einladungsmail (manuell aus Admin-Editor ausgelöst). */
async function sendInviteMail({ gallery, siteBaseUrl }) {
  const to = (gallery.client_email || '').trim();
  if (!to) throw new Error('Kunden-E-Mail fehlt.');
  const tpl = await loadTemplate(EMAIL_TPL.INVITE);
  if (!tpl) throw new Error('Vorlage nicht gefunden.');

  const galleryLink = customerPublicUrl(gallery, siteBaseUrl);
  const vars = {
    gallery_link: galleryLink,
    title: gallery.title || 'Bildauswahl',
    customer_name: gallery.client_name || '',
    address: gallery.address || '',
    order_no: gallery.booking_order_no,
  };
  const subject = applyTemplateVars(tpl.subject, vars);
  const htmlBody = applyTemplateVars(tpl.body, vars);
  const r = await sendMailDirect({ to, subject, htmlBody });
  if (!r.success) throw new Error(`Mail-Versand fehlgeschlagen: ${r.error || 'unbekannt'}`);
  return { to, subject };
}

module.exports = {
  EMAIL_TPL,
  ensureDefaultBildauswahlEmailTemplates,
  applyTemplateVars,
  sendAdminNotifyMail,
  sendInviteMail,
};
