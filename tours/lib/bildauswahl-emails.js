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
const FF_MONO = "'JetBrains Mono','SFMono-Regular',Consolas,'Liberation Mono',monospace";

/**
 * Visuelle Farbpaare fuer die Flag-Chips in der Admin-Notify-Mail. Die
 * Tokens spiegeln die Frontend-Farben (gold/olive/rotviolett) und sind
 * mit Outlook/Gmail Light-Mode getestet — keine CSS-Vars, alles inline,
 * keine Farbe darf dunkler werden als die Schrift, sonst leidet die
 * Lesbarkeit im Dark-Mode-Auto-Fix einiger Clients.
 */
const FLAG_PALETTE = {
  bearbeiten: { bg: '#F4F1EA', fg: '#8A6A18', label: 'bearbeiten' },
  staging:    { bg: '#EEEAE0', fg: '#3F5A2E', label: 'staging' },
  retusche:   { bg: '#EDE6F3', fg: '#5B3A8A', label: 'retusche' },
};

const FLAG_HUMAN = {
  bearbeiten: 'zur Bearbeitung',
  staging: 'Staging',
  retusche: 'Retusche',
};

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
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="de">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>{{headline}}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; border-collapse:collapse; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; display:block; }
    body { margin:0 !important; padding:0 !important; width:100% !important; background:#EEEAE0; }
    @media only screen and (max-width: 620px) {
      .container { width:100% !important; }
      .px { padding-left:24px !important; padding-right:24px !important; }
      .h1 { font-size:24px !important; line-height:32px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background:#EEEAE0;">
  <div style="display:none; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all;">{{preheader}}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEEAE0;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#F4F1EA;">
          <tr>
            <td class="px" style="padding:36px 48px 28px 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="font-family:${FF};font-size:14px;font-weight:700;letter-spacing:2px;color:#141413;text-transform:uppercase;">PROPUS</td>
                  <td align="right" style="font-family:${FF};font-size:11px;font-weight:500;letter-spacing:1.5px;color:#8A8478;text-transform:uppercase;">Backpanel</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:0 48px 14px 48px;">
              <p style="margin:0;font-family:${FF};font-size:11px;font-weight:600;letter-spacing:2.5px;color:#B68E20;text-transform:uppercase;">{{eyebrow}}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;"><tr><td style="width:70px;height:1px;background:#C5A073;font-size:0;line-height:0;">&nbsp;</td></tr></table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:18px 48px 8px 48px;">
              <h1 class="h1" style="margin:0;font-family:${FF};font-size:28px;line-height:36px;font-weight:700;color:#141413;letter-spacing:-0.4px;">{{headline}}</h1>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:8px 48px 28px 48px;">
              <p style="margin:0;font-family:${FF};font-size:15px;line-height:24px;color:#5B564C;">{{lead}}</p>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:0 48px 28px 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E5DFD2;">
                <tr><td style="padding:20px 24px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr><td style="padding:6px 0;font-family:${FF};font-size:13px;line-height:20px;color:#141413;">
                      <span style="display:inline-block;min-width:96px;color:#8A8478;font-weight:500;letter-spacing:0.3px;">Kunde</span><span style="font-weight:600;">{{customer_name}}</span>
                    </td></tr>
                    <tr><td style="padding:6px 0;font-family:${FF};font-size:13px;line-height:20px;color:#141413;border-top:1px solid #F0EAD9;">
                      <span style="display:inline-block;min-width:96px;color:#8A8478;font-weight:500;letter-spacing:0.3px;">Projekt</span><span style="font-weight:600;">{{title}}</span>
                    </td></tr>
                    <tr><td style="padding:6px 0;font-family:${FF};font-size:13px;line-height:20px;color:#141413;border-top:1px solid #F0EAD9;">
                      <span style="display:inline-block;min-width:96px;color:#8A8478;font-weight:500;letter-spacing:0.3px;">Bestell-Nr.</span><span style="font-weight:600;">{{order_no}}</span>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:0 48px 14px 48px;">
              <p style="margin:0;font-family:${FF};font-size:11px;font-weight:600;letter-spacing:2px;color:#B68E20;text-transform:uppercase;">Markierte Bilder &amp; Kommentare</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;"><tr><td style="width:70px;height:1px;background:#C5A073;font-size:0;line-height:0;">&nbsp;</td></tr></table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:6px 48px 32px 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E5DFD2;">
                <tr><td style="padding:8px 24px;">{{items_html}}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:0 48px 28px 48px;">
              <p style="margin:0;font-family:${FF};font-size:13px;line-height:22px;color:#8A8478;">{{summary_line}}</p>
            </td>
          </tr>
          <tr>
            <td class="px" align="left" style="padding:0 48px 12px 48px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{gallery_link}}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="0%" stroke="f" fillcolor="#141413">
                <w:anchorlock/>
                <center style="color:#F4F1EA;font-family:Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:1px;">IM BACKPANEL OEFFNEN</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a href="{{gallery_link}}" style="display:inline-block;background:#141413;color:#F4F1EA;font-family:${FF};font-size:13px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;text-decoration:none;padding:16px 32px;border:1px solid #141413;mso-hide:all;">Im Backpanel oeffnen</a>
              <!--<![endif]-->
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:8px 48px 40px 48px;">
              <p style="margin:0;font-family:${FF};font-size:12px;line-height:20px;color:#8A8478;">Oder direkt zur Auswahl: <a href="{{gallery_link}}" style="color:#B68E20;text-decoration:underline;font-weight:500;">{{gallery_link}}</a></p>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:0 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;background:#E5DFD2;font-size:0;line-height:0;">&nbsp;</td></tr></table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:24px 48px 36px 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="font-family:${FF};font-size:11px;line-height:18px;color:#8A8478;">
                  <strong style="color:#141413;font-weight:600;letter-spacing:0.4px;">Propus GmbH</strong> &middot; Untere Roostmatt 8 &middot; 6300 Zug<br />
                  <a href="https://propus.ch" style="color:#8A8478;text-decoration:none;">propus.ch</a> &middot; <a href="mailto:office@propus.ch" style="color:#8A8478;text-decoration:none;">office@propus.ch</a>
                </td></tr>
                <tr><td style="padding-top:14px;font-family:${FF};font-size:10px;line-height:16px;color:#A8A296;letter-spacing:0.3px;">Diese Nachricht wurde automatisch vom Propus Backpanel generiert.</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Eine Bilder-Zeile pro Item: Dateiname (mono) + Flag-Chip + optionaler
 * Kunden-Kommentar als gold-akzentuierte Quote. Trennlinie zur naechsten
 * Zeile wird via inline `border-bottom` gezeichnet — alle Outlook-/Gmail-
 * Tests gruen.
 */
function renderItemRow(item, isLast) {
  const flag = Array.isArray(item.flags) && item.flags.length > 0 ? item.flags[0] : null;
  const palette = flag && FLAG_PALETTE[flag] ? FLAG_PALETTE[flag] : null;
  const chipHtml = palette
    ? `<span style="display:inline-block;padding:2px 8px;background:${palette.bg};color:${palette.fg};font-family:${FF};font-size:11px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;">${escapeHtml(palette.label)}</span>`
    : '';
  const commentHtml = (item.body || '').trim()
    ? `<div style="margin-top:6px;font-family:${FF};font-size:13px;line-height:20px;color:#5B564C;font-style:italic;border-left:2px solid #C5A073;padding:2px 0 2px 10px;">&bdquo;${nl2br(escapeHtml(item.body))}&ldquo;</div>`
    : '';
  const border = isLast ? '' : 'border-bottom:1px solid #F0EAD9;';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:12px 0;font-family:${FF_MONO};font-size:13px;line-height:20px;color:#141413;${border}"><span style="font-weight:600;">${escapeHtml(item.asset_label || 'Bild')}</span>${chipHtml ? '&nbsp;' + chipHtml : ''}${commentHtml}</td></tr></table>`;
}

function renderItemsHtml(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<p style="margin:8px 0;font-family:${FF};font-size:13px;color:#8A8478;font-style:italic;">Keine Bilder markiert.</p>`;
  }
  return items.map((it, i) => renderItemRow(it, i === items.length - 1)).join('\n');
}

function renderSummaryLine(items) {
  const counts = { bearbeiten: 0, staging: 0, retusche: 0 };
  for (const it of items || []) {
    for (const f of (Array.isArray(it.flags) ? it.flags : [])) {
      if (Object.prototype.hasOwnProperty.call(counts, f)) counts[f] += 1;
    }
  }
  const total = Array.isArray(items) ? items.length : 0;
  const parts = [`Insgesamt ${total} Bild${total === 1 ? '' : 'er'}`];
  if (counts.bearbeiten) parts.push(`${counts.bearbeiten} ${FLAG_HUMAN.bearbeiten}`);
  if (counts.staging)    parts.push(`${counts.staging} ${FLAG_HUMAN.staging}`);
  if (counts.retusche)   parts.push(`${counts.retusche} ${FLAG_HUMAN.retusche}`);
  return parts.join(' · ');
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
  [EMAIL_TPL.ADMIN_NOTIFY]: { subject: '{{headline}} – {{title}}', body: defaultAdminNotifyBody },
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
  const customerNameOrDash = nameEsc || '—';
  return String(text || '')
    .replaceAll('{{gallery_link}}', (vars.gallery_link || '').trim())
    .replaceAll('{{Link}}', (vars.gallery_link || '').trim())
    .replaceAll('{{title}}', escapeHtml(vars.title || ''))
    .replaceAll('{{Titel}}', escapeHtml(vars.title || ''))
    .replaceAll('{{customer_name}}', customerNameOrDash)
    .replaceAll('{{Kundenname}}', customerNameOrDash)
    .replaceAll('{{customer_name_line}}', customerNameLine)
    .replaceAll('{{address}}', escapeHtml(vars.address || ''))
    .replaceAll('{{order_no}}', escapeHtml(vars.order_no != null && String(vars.order_no).trim() ? String(vars.order_no) : '—'))
    .replaceAll('{{file_list}}', nl2br(escapeHtml(vars.file_list || '')))
    .replaceAll('{{Dateiliste}}', nl2br(escapeHtml(vars.file_list || '')))
    .replaceAll('{{feedback_body}}', nl2br(escapeHtml(vars.feedback_body || '')))
    .replaceAll('{{customer_comment}}', nl2br(escapeHtml(vars.customer_comment || '')))
    .replaceAll('{{asset_label}}', escapeHtml(vars.asset_label || ''))
    .replaceAll('{{direct_link}}', (vars.direct_link || vars.gallery_link || '').trim())
    .replaceAll('{{revision}}', escapeHtml(vars.revision != null ? String(vars.revision) : ''))
    // Admin-Notify-Mail spezifisch
    .replaceAll('{{eyebrow}}', escapeHtml(vars.eyebrow || ''))
    .replaceAll('{{headline}}', escapeHtml(vars.headline || ''))
    .replaceAll('{{lead}}', escapeHtml(vars.lead || ''))
    .replaceAll('{{preheader}}', escapeHtml(vars.preheader || ''))
    .replaceAll('{{summary_line}}', escapeHtml(vars.summary_line || ''))
    // `items_html` ist absichtlich roh — wird serverseitig aus den vertrauten
    // gallery_feedback-Rows gebaut, kein Benutzer-HTML.
    .replaceAll('{{items_html}}', vars.items_html || '');
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

/**
 * Bei eingehender Kunden-Auswahl: Admin per Mail benachrichtigen.
 * `isUpdate=true` praefixiert den Subject mit "Aktualisiert:" — der Admin
 * sieht damit direkt im Postfach, dass eine vorherige Auswahl ersetzt wurde.
 */
async function sendAdminNotifyMail({ gallery, items, siteBaseUrl, isUpdate = false }) {
  const to = notifyEmailRecipient();
  if (!to) return { skipped: 'no-recipient' };
  const tpl = await loadTemplate(EMAIL_TPL.ADMIN_NOTIFY);
  if (!tpl) return { skipped: 'no-template' };

  /**
   * Plain-Text-Variante fuer Clients, die kein HTML rendern — bleibt ein
   * Bullet-List. HTML-Variante (items_html) ist die hochwertige Tabelle mit
   * Flag-Chips und gold-akzentuierten Kommentar-Quotes.
   */
  const lines = (items || []).map((it) => {
    const flags = Array.isArray(it.flags) && it.flags.length ? ` [${it.flags.join(', ')}]` : '';
    const body = it.body ? ` — ${String(it.body).split('\n').join(' / ')}` : '';
    return `• ${it.asset_label || 'Bild'}${flags}${body}`;
  });

  const eyebrow = isUpdate ? 'Aktualisierung' : 'Benachrichtigung';
  const headline = isUpdate ? 'Bildauswahl aktualisiert' : 'Neue Bildauswahl eingegangen';
  const lead = isUpdate
    ? 'Der Kunde hat seine Auswahl angepasst. Die aktuelle Version steht im Backpanel zur weiteren Bearbeitung bereit.'
    : 'Ein Kunde hat soeben Bilder zur Bearbeitung markiert. Die Auswahl steht im Backpanel zur weiteren Bearbeitung bereit.';
  const preheader = isUpdate
    ? 'Der Kunde hat seine Bildauswahl im Propus Backpanel aktualisiert.'
    : 'Eine neue Bildauswahl wurde im Propus Backpanel hinterlegt.';

  const vars = {
    gallery_link: adminEditorUrl(gallery, siteBaseUrl),
    title: gallery.title || 'Bildauswahl',
    customer_name: gallery.client_name || '',
    address: gallery.address || '',
    order_no: gallery.booking_order_no,
    file_list: lines.join('\n'),
    eyebrow,
    headline,
    lead,
    preheader,
    items_html: renderItemsHtml(items),
    summary_line: renderSummaryLine(items),
  };
  const subject = applyTemplateVars(tpl.subject, vars);
  const htmlBody = applyTemplateVars(tpl.body, vars);
  const r = await sendMailDirect({ to, subject, htmlBody });
  return { success: !!r.success, error: r.error || null, to, subject };
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
