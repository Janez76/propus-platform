const { pool } = require('./db');
const { logAction } = require('./actions');
const statusMachine = require('./status-machine');
const matterport = require('./matterport');
const { generateToken, hashToken } = require('./tokens');
const { getMatterportId } = require('./normalize');
const nodemailer = require('nodemailer');
const { createDraftMessage, getGraphConfig, sendDraftMessage, sendMailDirect, stripHtml } = require('./microsoft-graph');
const qrBill = require('./qr-bill');
const payrexxLib = require('./payrexx');
const { appendPayrexxOnlineSection } = require('./invoice-pdf-payrexx-hint');
const { getEmailTemplates, DEFAULT_EMAIL_TEMPLATES } = require('./settings');

function getSmtpTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function sendMailViaSmtp(to, subject, html, text) {
  const transporter = getSmtpTransporter();
  if (!transporter) return { success: false, error: 'SMTP nicht konfiguriert' };
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'office@propus.ch';
  try {
    await transporter.sendMail({
      from: `"Propus" <${from}>`,
      to,
      subject,
      html: html || text,
      text: text || (html ? stripHtml(html) : ''),
    });
    return { success: true, mailboxUpn: process.env.SMTP_USER };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

let outgoingSchemaEnsured = false;

async function ensureOutgoingEmailSchema() {
  if (outgoingSchemaEnsured) return;
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.outgoing_emails (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tour_id INTEGER NOT NULL REFERENCES tour_manager.tours(id) ON DELETE CASCADE,
      mailbox_upn TEXT NOT NULL,
      graph_message_id TEXT UNIQUE,
      internet_message_id TEXT,
      conversation_id TEXT,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      template_key TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      details_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_outgoing_emails_tour_id ON tour_manager.outgoing_emails(tour_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_outgoing_emails_recipient ON tour_manager.outgoing_emails(recipient_email)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_outgoing_emails_conversation ON tour_manager.outgoing_emails(conversation_id)');
  outgoingSchemaEnsured = true;
}

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (err) {
    return String(value);
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPortalUrl() {
  return (process.env.PORTAL_BASE_URL || process.env.CUSTOMER_BASE_URL || 'https://tour.propus.ch').replace(/\/$/, '') + '/portal';
}

function mergeTemplate(templateStr, placeholders, options = {}) {
  const { htmlMode = false, safeKeys = [] } = options;
  if (!templateStr || typeof templateStr !== 'string') return '';
  return templateStr.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = placeholders[key];
    if (val === undefined || val === null) return '';
    if (htmlMode && !safeKeys.includes(key)) {
      return escapeHtml(String(val));
    }
    return String(val);
  });
}

function fallbackTextFromHtml(html) {
  return stripHtml(html || '');
}

function resolveTemplateContent(templateKey, placeholders) {
  return getEmailTemplates().then((templates) => {
    const template = templates[templateKey] || {};
    const defaultTemplate = DEFAULT_EMAIL_TEMPLATES[templateKey] || {};
    const subjectRaw = template.subject || defaultTemplate.subject || '';
    const htmlRaw = template.html || defaultTemplate.html || '';
    const textRaw = template.text || defaultTemplate.text || '';
    const subject = mergeTemplate(subjectRaw, placeholders).trim();
    const html = mergeTemplate(htmlRaw, placeholders, { htmlMode: true, safeKeys: ['tourLinkHtml', 'portalLinkHtml'] }).trim();
    const text = mergeTemplate(textRaw, placeholders).trim() || fallbackTextFromHtml(html);
    return { subject, html, text };
  });
}

async function buildRenewalEmailContent(tour, options = {}) {
  const templateKey = String(options.templateKey || 'renewal_request').trim().toLowerCase();
  const objectLabel = tour.object_label || tour.bezeichnung || `Tour ${tour.id}`;
  const customerGreeting = tour.customer_contact ? `Guten Tag ${tour.customer_contact},` : 'Guten Tag,';
  const tourLink = tour.tour_url || (tour.matterport_space_id ? `https://my.matterport.com/show/?m=${tour.matterport_space_id}` : null);
  const amount = Number(tour.price || 59).toFixed(2);
  const createdAt = tour.matterport_created_at || tour.exxas_created_at || tour.created_at;
  const tourLinkHtml = tourLink
    ? `<strong>Virtueller Rundgang:</strong> <a href="${escapeHtml(tourLink)}">${escapeHtml(tourLink)}</a><br>`
    : '';
  const portalUrl = getPortalUrl();
  const placeholders = {
    objectLabel,
    customerGreeting,
    tourLinkHtml,
    tourLinkText: tourLink ? `Virtueller Rundgang: ${tourLink}` : '',
    portalUrl,
    portalLinkHtml: `<a href="${escapeHtml(portalUrl)}">Meine Touren verwalten</a>`,
    portalLinkText: `Kundenportal: ${portalUrl}`,
    createdAt: formatDate(createdAt),
    amount,
    yesUrl: options.yesUrl || '',
    noUrl: options.noUrl || '',
    termEndFormatted: formatDate(tour.canonical_term_end_date || tour.term_end_date || tour.ablaufdatum),
  };
  return resolveTemplateContent(templateKey, placeholders);
}

async function buildPaymentConfirmedEmailContent(tour, options) {
  const objectLabel = tour.object_label || tour.bezeichnung || tour.canonical_object_label || `Tour ${tour.id}`;
  const customerGreeting = tour.customer_contact ? `Guten Tag ${tour.customer_contact},` : 'Guten Tag,';
  const tourLink = tour.tour_url || (tour.matterport_space_id ? `https://my.matterport.com/show/?m=${tour.matterport_space_id}` : null);
  const termEndFormatted = formatDate(options.newTermEndDate);
  const tourLinkHtml = tourLink
    ? `<br><strong>Virtueller Rundgang:</strong> <a href="${escapeHtml(tourLink)}">${escapeHtml(tourLink)}</a>`
    : '';
  const portalUrl = getPortalUrl();
  const placeholders = {
    objectLabel,
    customerGreeting,
    tourLinkHtml,
    tourLinkText: tourLink ? `Virtueller Rundgang: ${tourLink}` : '',
    portalUrl,
    portalLinkHtml: `<a href="${escapeHtml(portalUrl)}">Meine Touren verwalten</a>`,
    portalLinkText: `Kundenportal: ${portalUrl}`,
    termEndFormatted,
  };
  return resolveTemplateContent(options.templateKey || 'payment_confirmed', placeholders);
}

async function sendPaymentConfirmedEmail(tourId, newTermEndDate, templateKey = 'payment_confirmed') {
  await ensureOutgoingEmailSchema();
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [tourId]);
  const t = tourResult.rows[0];
  if (!t) return { success: false, error: 'Tour nicht gefunden' };
  const recipientEmail = (t.customer_email || '').trim().toLowerCase();
  if (!recipientEmail) return { success: false, error: 'Tour hat keine Kunden-E-Mail' };
  const content = await buildPaymentConfirmedEmailContent(t, { newTermEndDate, templateKey });
  const mailResult = await sendGraphMailToCustomer(t, content);
  if (!mailResult.success) {
    await logAction(parseInt(tourId, 10), 'system', 'payrexx', 'SEND_PAYMENT_CONFIRMED_EMAIL_FAILED', {
      error: mailResult.error,
    }).catch(() => null);
    return mailResult;
  }
  await pool.query(
    `INSERT INTO tour_manager.outgoing_emails (
      tour_id, mailbox_upn, graph_message_id, internet_message_id, conversation_id,
      recipient_email, subject, template_key, sent_at, details_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9::jsonb)`,
    [
      tourId,
      mailResult.mailboxUpn,
      mailResult.graphMessageId,
      mailResult.internetMessageId,
      mailResult.conversationId,
      mailResult.recipientEmail,
      mailResult.subject,
      templateKey,
      JSON.stringify({ newTermEndDate }),
    ]
  );
  await logAction(parseInt(tourId, 10), 'system', 'payrexx', 'SEND_PAYMENT_CONFIRMED_EMAIL', {
    recipientEmail: mailResult.recipientEmail,
    newTermEndDate,
  }).catch(() => null);
  return mailResult;
}

async function sendGraphMailToCustomer(tour, content) {
  const config = getGraphConfig();
  const senderCandidates = config.mailboxUpns && config.mailboxUpns.length ? config.mailboxUpns : [config.mailboxUpn];
  const recipientEmail = (tour.customer_email || '').trim().toLowerCase();
  if (!recipientEmail) {
    return { success: false, error: 'Tour hat keine Kunden-E-Mail' };
  }
  let lastError = null;
  for (const mailboxUpn of senderCandidates) {
    const { message, error } = await createDraftMessage({
      mailboxUpn,
      to: recipientEmail,
      subject: content.subject,
      htmlBody: content.html,
      textBody: content.text,
    });
    if (error || !message?.id) {
      lastError = error || 'Draft konnte nicht erstellt werden';
      continue;
    }
    const sendResult = await sendDraftMessage({ mailboxUpn, messageId: message.id });
    if (!sendResult.success) {
      lastError = sendResult.error || 'Senden fehlgeschlagen';
      continue;
    }
    return {
      success: true,
      mailboxUpn,
      graphMessageId: message.id,
      conversationId: message.conversationId || null,
      internetMessageId: message.internetMessageId || null,
      recipientEmail,
      subject: content.subject,
      html: content.html,
      text: content.text || null,
    };
  }
  return { success: false, error: lastError || 'Keine Mailbox konnte die E-Mail senden' };
}

async function sendRenewalEmail(tourId, actorType = 'system', actorRef = null, options = {}) {
  await ensureOutgoingEmailSchema();
  const tour = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [tourId]);
  if (!tour.rows[0]) throw new Error('Tour nicht gefunden');
  const t = tour.rows[0];
  const templateKey = String(options.templateKey || 'renewal_request').trim().toLowerCase();
  const createActionLinks = options.createActionLinks !== undefined
    ? !!options.createActionLinks
    : templateKey === 'renewal_request';
  const setAwaitingDecision = false;
  const minHoursBetweenSends = Number.isFinite(Number(options.minHoursBetweenSends))
    ? Math.max(0, Number(options.minHoursBetweenSends))
    : 12;

  if (!statusMachine.canSendRenewalEmail(t.status)) {
    throw new Error('Status erlaubt keine Renewal-Mail');
  }

  let yesToken = null;
  let noToken = null;
  let expiresAt = null;
  let yesHash = null;
  let noHash = null;
  if (createActionLinks) {
    yesToken = generateToken();
    noToken = generateToken();
    expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    yesHash = await hashToken(yesToken);
    noHash = await hashToken(noToken);
  }

  const recentMail = await pool.query(
    `SELECT sent_at
     FROM tour_manager.outgoing_emails
     WHERE tour_id = $1
      AND template_key = $2
      AND sent_at > NOW() - ($3::numeric * INTERVAL '1 hour')
     ORDER BY sent_at DESC
     LIMIT 1`,
    [tourId, templateKey, minHoursBetweenSends]
  ).catch(() => ({ rows: [] }));
  if (recentMail.rows[0]?.sent_at) {
    throw new Error(`Für diese Tour wurde in den letzten ${minHoursBetweenSends} Stunden bereits diese Vorlage gesendet`);
  }
  const baseUrl = process.env.CUSTOMER_BASE_URL || 'https://touren.propus.ch';
  const yesUrl = createActionLinks ? `${baseUrl}/r/yes?token=${yesToken}` : '';
  const noUrl = createActionLinks ? `${baseUrl}/r/no?token=${noToken}` : '';
  const emailContent = await buildRenewalEmailContent(t, { yesUrl, noUrl, templateKey });
  const mailResult = await sendGraphMailToCustomer(t, emailContent);
  if (!mailResult.success) {
    await logAction(parseInt(tourId, 10), actorType, actorRef, 'SEND_RENEWAL_EMAIL_FAILED', {
      error: mailResult.error || 'Versand fehlgeschlagen',
    }).catch(() => null);
    throw new Error(mailResult.error || 'Verlängerungsmail konnte nicht gesendet werden');
  }
  if (createActionLinks) {
    await pool.query(
      `INSERT INTO tour_manager.customer_tokens (tour_id, token, type, expires_at)
       VALUES ($1, $2, 'YES', $3), ($1, $4, 'NO', $3)`,
      [tourId, yesHash, expiresAt, noHash]
    );
  }
  await pool.query(
    "UPDATE tour_manager.tours SET last_email_sent_at = NOW(), updated_at = NOW() WHERE id = $1",
    [tourId]
  );
  await pool.query(
    `INSERT INTO tour_manager.outgoing_emails (
      tour_id, mailbox_upn, graph_message_id, internet_message_id, conversation_id,
      recipient_email, subject, template_key, sent_at, details_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9::jsonb)`,
    [
      tourId,
      mailResult.mailboxUpn,
      mailResult.graphMessageId,
      mailResult.internetMessageId,
      mailResult.conversationId,
      mailResult.recipientEmail,
      mailResult.subject,
      templateKey,
      JSON.stringify({
        yesUrl,
        noUrl,
        createActionLinks,
        setAwaitingDecision,
        ...(options.outgoingDetails && typeof options.outgoingDetails === 'object' ? options.outgoingDetails : {}),
      }),
    ]
  );
  if (createActionLinks) {
    await pool.query(
      `INSERT INTO tour_manager.mail_log (tour_id, type, sent_at)
       VALUES ($1, 'verlaengerung_anfrage', NOW())`,
      [tourId]
    ).catch(() => null);
  }
  await logAction(parseInt(tourId, 10), actorType, actorRef, 'SEND_RENEWAL_EMAIL', {
    yesUrl,
    noUrl,
    templateKey,
    createActionLinks,
    setAwaitingDecision,
    mailboxUpn: mailResult.mailboxUpn,
    recipientEmail: mailResult.recipientEmail,
    conversationId: mailResult.conversationId,
  });
  return {
    success: true,
    yesUrl,
    noUrl,
    mailboxUpn: mailResult.mailboxUpn,
    recipientEmail: mailResult.recipientEmail,
    subject: mailResult.subject,
    html: mailResult.html || null,
    text: mailResult.text || null,
    templateKey,
  };
}

async function checkPayment(tourId) {
  const invoices = await pool.query(
    `SELECT id, invoice_status, due_at
     FROM tour_manager.renewal_invoices
     WHERE tour_id = $1
       AND invoice_status IN ('sent','overdue')`,
    [tourId]
  );
  let changed = 0;
  const now = new Date();
  for (const inv of invoices.rows) {
    if (inv.invoice_status === 'sent' && inv.due_at && new Date(inv.due_at) < now) {
      await pool.query(
        `UPDATE tour_manager.renewal_invoices
         SET invoice_status = 'overdue'
         WHERE id = $1`,
        [inv.id]
      );
      changed++;
    }
  }
  return { changed, mode: 'internal_only' };
}

async function declineTour(tourId, actorRef) {
  const tour = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [tourId]);
  if (!tour.rows[0]) throw new Error('Tour nicht gefunden');
  if (!statusMachine.canDecline(tour.rows[0].status)) {
    throw new Error('Status erlaubt keine Kündigung');
  }
  await pool.query(
    "UPDATE tour_manager.tours SET status = 'CUSTOMER_DECLINED', updated_at = NOW() WHERE id = $1",
    [tourId]
  );
  await logAction(parseInt(tourId, 10), 'admin', actorRef, 'ADMIN_DECLINE');
}

async function archiveTourNow(tourId, actorRef) {
  const tour = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [tourId]);
  if (!tour.rows[0]) throw new Error('Tour nicht gefunden');
  const t = tour.rows[0];
  if (!statusMachine.canArchive(t.status) && !['ACTIVE', 'EXPIRING_SOON'].includes(t.status)) {
    throw new Error('Status erlaubt keine Archivierung');
  }
  let spaceId = getMatterportId(t);
  if (spaceId && (!t.matterport_space_id || !String(t.matterport_space_id).trim())) {
    await pool.query(
      'UPDATE tour_manager.tours SET matterport_space_id = $1, updated_at = NOW() WHERE id = $2',
      [spaceId, tourId]
    );
  }
  if (spaceId) {
    await matterport.archiveSpace(spaceId);
    await pool.query(
      "UPDATE tour_manager.tours SET status = 'ARCHIVED', matterport_state = 'inactive', updated_at = NOW() WHERE id = $1",
      [tourId]
    );
  } else {
    await pool.query(
      "UPDATE tour_manager.tours SET status = 'ARCHIVED', updated_at = NOW() WHERE id = $1",
      [tourId]
    );
  }
  await logAction(parseInt(tourId, 10), 'admin', actorRef, 'ARCHIVE_SPACE');

  try {
    const actorType = actorRef === 'system' ? 'system' : 'admin';
    await sendArchiveNoticeEmail(tourId, actorType, actorRef);
  } catch (err) {
    console.warn('Archive notice email failed:', tourId, err.message);
  }
}

async function buildArchiveNoticeEmailContent(tour) {
  const objectLabel = tour.object_label || tour.bezeichnung || tour.canonical_object_label || `Tour ${tour.id}`;
  const customerGreeting = tour.customer_contact ? `Guten Tag ${tour.customer_contact},` : 'Guten Tag,';
  const portalUrl = getPortalUrl();
  const placeholders = {
    objectLabel,
    customerGreeting,
    portalUrl,
    portalLinkHtml: `<a href="${escapeHtml(portalUrl)}">Meine Touren verwalten</a>`,
    portalLinkText: `Kundenportal: ${portalUrl}`,
  };
  return resolveTemplateContent('archive_notice', placeholders);
}

async function sendArchiveNoticeEmail(tourId, actorType = 'system', actorRef = null) {
  await ensureOutgoingEmailSchema();
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [tourId]);
  const t = tourResult.rows[0];
  if (!t) return { success: false, error: 'Tour nicht gefunden' };
  const recipientEmail = (t.customer_email || '').trim().toLowerCase();
  if (!recipientEmail) return { success: false, error: 'Tour hat keine Kunden-E-Mail' };
  const content = await buildArchiveNoticeEmailContent(t);
  let mailResult = await sendGraphMailToCustomer(t, content);
  if (!mailResult.success && getSmtpTransporter()) {
    mailResult = await sendMailViaSmtp(recipientEmail, content.subject, content.html, content.text);
    if (mailResult.success) {
      mailResult.recipientEmail = recipientEmail;
      mailResult.subject = content.subject;
      mailResult.html = content.html;
      mailResult.text = content.text;
      mailResult.graphMessageId = null;
      mailResult.conversationId = null;
      mailResult.internetMessageId = null;
    }
  }
  if (!mailResult.success) {
    await logAction(parseInt(tourId, 10), actorType, actorRef || 'portal', 'SEND_ARCHIVE_NOTICE_EMAIL_FAILED', {
      error: mailResult.error,
    }).catch(() => null);
    return mailResult;
  }
  await pool.query(
    `INSERT INTO tour_manager.outgoing_emails (
      tour_id, mailbox_upn, graph_message_id, internet_message_id, conversation_id,
      recipient_email, subject, template_key, sent_at, details_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,'archive_notice',NOW(),$8::jsonb)`,
    [
      tourId,
      mailResult.mailboxUpn,
      mailResult.graphMessageId,
      mailResult.internetMessageId,
      mailResult.conversationId,
      mailResult.recipientEmail,
      mailResult.subject,
      JSON.stringify({}),
    ]
  );
  await logAction(parseInt(tourId, 10), actorType, actorRef || 'portal', 'SEND_ARCHIVE_NOTICE_EMAIL', {
    recipientEmail: mailResult.recipientEmail,
  }).catch(() => null);
  return {
    success: true,
    ...mailResult,
    html: mailResult.html || content.html || null,
    text: mailResult.text || content.text || null,
    templateKey: 'archive_notice',
  };
}

async function generateInvoicePdfBuffer(invoice, tour) {
  const { generateInvoicePdfBuffer: centralGenerate } = require('./renewal-invoice-pdf');
  return centralGenerate(invoice, tour);
}

async function sendInvoiceWithQrEmail(tourId, invoiceId) {
  await ensureOutgoingEmailSchema();
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [tourId]);
  const t = tourResult.rows[0];
  if (!t) return { success: false, error: 'Tour nicht gefunden' };
  const invResult = await pool.query(
    'SELECT * FROM tour_manager.renewal_invoices WHERE id = $1 AND tour_id = $2',
    [invoiceId, tourId]
  );
  const invoice = invResult.rows[0];
  if (!invoice) return { success: false, error: 'Rechnung nicht gefunden' };
  const recipientEmail = (t.customer_email || '').trim().toLowerCase();
  if (!recipientEmail) return { success: false, error: 'Tour hat keine Kunden-E-Mail' };

  const isReactivation = invoice.invoice_kind === 'portal_reactivation';
  const actionLabel = isReactivation ? 'Reaktivierung' : 'Verlängerung';
  const objectLabel = t.object_label || t.bezeichnung || t.canonical_object_label || `Tour ${t.id}`;
  const customerGreeting = t.customer_contact ? `Guten Tag ${t.customer_contact},` : 'Guten Tag,';
  const tourLink = t.tour_url || (t.matterport_space_id ? `https://my.matterport.com/show/?m=${t.matterport_space_id}` : null);
  const tourLinkHtml = tourLink ? `<strong>Virtueller Rundgang:</strong> <a href="${escapeHtml(tourLink)}">${escapeHtml(tourLink)}</a><br>` : '';
  const portalUrl = getPortalUrl();
  const amountCHF = Number(invoice.amount_chf || 0).toFixed(2);
  const dueDateFormatted = invoice.due_at ? new Date(invoice.due_at).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

  const content = await resolveTemplateContent('portal_invoice_sent', {
    objectLabel,
    customerGreeting,
    actionLabel,
    amountCHF,
    dueDateFormatted,
    tourLinkHtml,
    tourLinkText: tourLink ? `Virtueller Rundgang: ${tourLink}` : '',
    portalUrl,
    portalLinkHtml: `<a href="${escapeHtml(portalUrl)}">Meine Touren verwalten</a>`,
    portalLinkText: `Kundenportal: ${portalUrl}`,
  });

  let pdfBuffer = null;
  try {
    pdfBuffer = await generateInvoicePdfBuffer(invoice, t);
  } catch (err) {
    console.warn('sendInvoiceWithQrEmail: PDF generation failed', err.message);
  }

  const invLabel = invoice.invoice_number || `Rechnung-${invoice.id}`;
  const attachments = pdfBuffer
    ? [{ filename: `${invLabel}.pdf`, contentType: 'application/pdf', content: pdfBuffer }]
    : [];

  const config = getGraphConfig();
  const senderCandidates = config.mailboxUpns && config.mailboxUpns.length ? config.mailboxUpns : [config.mailboxUpn];
  let mailResult = { success: false, error: 'Keine Mailbox verfügbar' };
  for (const mailboxUpn of senderCandidates) {
    const r = await sendMailDirect({
      mailboxUpn,
      to: recipientEmail,
      subject: content.subject,
      htmlBody: content.html,
      textBody: content.text,
      attachments,
    });
    if (r.success) {
      mailResult = { success: true, mailboxUpn, recipientEmail, subject: content.subject, graphMessageId: null, conversationId: null, internetMessageId: null };
      break;
    }
    mailResult = r;
  }

  if (!mailResult.success && getSmtpTransporter()) {
    const transporter = getSmtpTransporter();
    const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'office@propus.ch';
    try {
      await transporter.sendMail({
        from: `"Propus" <${from}>`,
        to: recipientEmail,
        subject: content.subject,
        html: content.html || content.text,
        text: content.text || stripHtml(content.html || ''),
        attachments: pdfBuffer ? [{ filename: `${invLabel}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }] : [],
      });
      mailResult = { success: true, mailboxUpn: process.env.SMTP_USER, recipientEmail, subject: content.subject, graphMessageId: null, conversationId: null, internetMessageId: null };
    } catch (err) {
      mailResult = { success: false, error: err.message };
    }
  }

  if (!mailResult.success) {
    await logAction(parseInt(tourId, 10), 'system', 'portal', 'SEND_INVOICE_QR_EMAIL_FAILED', { error: mailResult.error, invoiceId }).catch(() => null);
    return mailResult;
  }

  await pool.query(
    `INSERT INTO tour_manager.outgoing_emails (
      tour_id, mailbox_upn, graph_message_id, internet_message_id, conversation_id,
      recipient_email, subject, template_key, sent_at, details_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,'portal_invoice_sent',NOW(),$8::jsonb)`,
    [tourId, mailResult.mailboxUpn, mailResult.graphMessageId, mailResult.internetMessageId, mailResult.conversationId, mailResult.recipientEmail, mailResult.subject, JSON.stringify({ invoiceId, isReactivation, amountCHF })]
  );
  await logAction(parseInt(tourId, 10), 'system', 'portal', 'SEND_INVOICE_QR_EMAIL', { recipientEmail, invoiceId, isReactivation }).catch(() => null);
  return mailResult;
}

module.exports = {
  buildRenewalEmailContent,
  buildPaymentConfirmedEmailContent,
  sendRenewalEmail,
  sendPaymentConfirmedEmail,
  sendArchiveNoticeEmail,
  sendInvoiceWithQrEmail,
  checkPayment,
  declineTour,
  archiveTourNow,
};
