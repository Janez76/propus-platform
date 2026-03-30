const express = require('express');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const { pool } = require('../lib/db');
const userProfiles = require('../lib/user-profiles');
const portalTeam = require('../lib/portal-team');
const { isLogtoEnabled } = require('../../auth/logto-config');

function getBookingPortalSyncModules() {
  try {
    const br = path.join(__dirname, '..', '..', 'booking');
    return {
      portalRbac: require(path.join(br, 'portal-rbac-sync')),
      logtoRole: require(path.join(br, 'logto-role-sync')),
      logtoWs: require(path.join(br, 'logto-portal-workspace-sync')),
    };
  } catch {
    return null;
  }
}

async function runExternPortalSync(ownerEmail, memberEmail) {
  const m = getBookingPortalSyncModules();
  if (!m) return;
  try {
    await m.portalRbac.syncPortalTeamMemberAdminRbac(ownerEmail, memberEmail);
    const cnt = await m.portalRbac.countActivePortalAdminWorkspaces(memberEmail);
    if (cnt > 0) await m.logtoRole.syncSystemRoleToLogto(memberEmail, 'customer_admin', 'add');
    else await m.logtoRole.syncSystemRoleToLogto(memberEmail, 'customer_admin', 'remove');
    const row = await pool.query(
      `SELECT role, status FROM tour_manager.portal_team_members
       WHERE LOWER(TRIM(owner_email)) = $1 AND LOWER(TRIM(member_email)) = $2
       LIMIT 1`,
      [String(ownerEmail).trim().toLowerCase(), String(memberEmail).trim().toLowerCase()]
    );
    const t = row.rows[0];
    if (t && String(t.status) === 'active') {
      await m.logtoWs.ensureWorkspaceOrganizationForOwner(ownerEmail);
      await m.logtoWs.syncWorkspaceOwnerToLogtoOrg(ownerEmail);
      await m.logtoWs.syncPortalMemberToLogtoOrg(ownerEmail, memberEmail, portalTeam.normalizeMemberRole(t.role));
    } else {
      await m.logtoWs.removePortalMemberFromLogtoOrg(ownerEmail, memberEmail);
    }
  } catch (e) {
    console.warn('[admin extern portal sync]', e.message);
  }
}

const profileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|pjpeg|png|gif|webp)$/i.test(file.mimetype || '');
    cb(null, ok);
  },
});
const bankDataUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const mt = String(file.mimetype || '').toLowerCase();
    const ok = name.endsWith('.xml') || name.endsWith('.csv') || mt.includes('xml') || mt.includes('csv') || mt === 'text/plain';
    cb(null, ok);
  },
});
const { logAction } = require('../lib/actions');
const matterport = require('../lib/matterport');
const tourActions = require('../lib/tour-actions');
const {
  getDashboardWidgets,
  saveDashboardWidgets,
  getAiPromptSettings,
  saveAiPromptSettings,
  getMatterportApiCredentials,
  saveMatterportApiCredentials,
  getAutomationSettings,
  saveAutomationSettings,
  getEmailTemplates,
  saveEmailTemplates,
  DEFAULT_EMAIL_TEMPLATES,
} = require('../lib/settings');
const { extractMatterportId, getMatterportId, normalizeTourRow } = require('../lib/normalize');
const {
  getActionDefinition,
  getRiskDefinition,
  listActionDefinitions,
  listRiskDefinitions,
} = require('../lib/admin-actions-schema');
const exxas = require('../lib/exxas');
const customerLookup = require('../lib/customer-lookup');
const bankImport = require('../lib/bank-import');
const {
  createDraftMessage,
  createReplyDraft,
  getGraphConfig,
  fetchMailboxMessages,
  graphRequest,
  moveMessageToFolder,
  sendMailDirect,
  sendDraftMessage,
  stripHtml,
} = require('../lib/microsoft-graph');
const { chatWithAi, getAiConfig } = require('../lib/ai');
const {
  buildBulletSection,
  classifyReadIntent,
  compactText,
} = require('../lib/admin-agent');
const { buildSuggestionGroups } = require('../lib/suggestion-groups');
const {
  approveSuggestion,
  ensureSchema: ensureSuggestionSchema,
  getCustomerLinkSuggestionsForTour,
  getSuggestionById,
  getSuggestionStats,
  getInvoiceLinkSuggestionsForTour,
  listSuggestions,
  rejectSuggestion,
  syncInvoiceSuggestions,
  syncMailboxSuggestions,
} = require('../lib/suggestions');
const {
  EXTENSION_PRICE_CHF,
  REACTIVATION_PRICE_CHF,
  getInitialTermEndDate,
  toIsoDate,
  getSubscriptionWindowFromStart,
} = require('../lib/subscriptions');
const qrBill = require('../lib/qr-bill');
const {
  changeOwnAdminEmail,
  changeOwnAdminPassword,
  createAdminInvite,
  deleteAdminUserById,
  ensureAdminTeamSchema,
  isKnownAdminAccessEmail,
  listAdminAccessUsers,
  listPendingAdminInvites,
  revokeInviteById,
  setAdminUserActive,
  updateAdminUserById,
} = require('../lib/admin-team');
const ALLOWED_VISIBILITIES = ['PRIVATE', 'LINK_ONLY', 'PUBLIC', 'PASSWORD'];
let bankImportSchemaEnsured = false;

function extractIdsFromAdminPath(pathValue) {
  const path = String(pathValue || '');
  const tourMatch = path.match(/\/admin\/tours\/(\d+)/);
  const suggestionMatch = path.match(/\/admin\/suggestions\/([a-f0-9-]{20,})/i);
  return {
    tourId: tourMatch?.[1] ? parseInt(tourMatch[1], 10) : null,
    suggestionId: suggestionMatch?.[1] || null,
  };
}

async function resolveSidebarChatContext({ path }) {
  const { tourId: pathTourId, suggestionId } = extractIdsFromAdminPath(path);
  let suggestion = null;
  let tour = null;
  let effectiveTourId = pathTourId || null;

  if (suggestionId) {
    suggestion = await getSuggestionById(suggestionId).catch(() => null);
    if (suggestion?.tour_id) {
      effectiveTourId = effectiveTourId || suggestion.tour_id;
    }
  }

  if (effectiveTourId) {
    const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [effectiveTourId]).catch(() => ({ rows: [] }));
    tour = normalizeTourRow(tourResult.rows[0] || null);
  }

  return {
    suggestion,
    tour,
    effectiveTourId: tour?.id || effectiveTourId || null,
    suggestionId: suggestion?.id || suggestionId || null,
  };
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('de-CH');
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(value) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return null;
  return `CHF ${numeric.toFixed(2)}`;
}

const ALLOWED_PAYMENT_METHODS = new Set(['bank_transfer', 'cash', 'twint', 'card', 'payrexx', 'other']);

function normalizePaymentMethod(value) {
  const key = String(value || '').trim().toLowerCase();
  return ALLOWED_PAYMENT_METHODS.has(key) ? key : 'other';
}

function paymentMethodLabel(value) {
  const labels = {
    bank_transfer: 'Überweisung',
    cash: 'Bar',
    twint: 'TWINT',
    card: 'Karte',
    payrexx: 'Payrexx',
    other: 'Sonstige',
  };
  const key = normalizePaymentMethod(value);
  return labels[key] || 'Sonstige';
}

function computeManualInvoiceDueDateIso(tour, hasExistingInvoices) {
  const isReactivation = String(tour?.status || '').toUpperCase() === 'ARCHIVED';
  const todayIso = toIsoDate(new Date());
  if (isReactivation) return todayIso;
  if (!hasExistingInvoices) {
    // Erste Rechnung: 6 Monate nach Tour-Erstellung
    const baseDate = tour?.matterport_created_at || tour?.created_at || null;
    const firstWindow = getSubscriptionWindowFromStart(baseDate);
    if (firstWindow.endIso) return firstWindow.endIso;
  }
  // Verlängerung: fällig am aktuellen Abo-Ende
  const termEnd = tour?.canonical_term_end_date || tour?.term_end_date || tour?.ablaufdatum || null;
  if (termEnd) return toIsoDate(termEnd);
  return todayIso;
}

async function ensureBankImportSchema() {
  if (bankImportSchemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.bank_import_runs (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT,
      source_format VARCHAR(16) NOT NULL,
      file_name TEXT,
      total_rows INT NOT NULL DEFAULT 0,
      exact_rows INT NOT NULL DEFAULT 0,
      review_rows INT NOT NULL DEFAULT 0,
      none_rows INT NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.bank_import_transactions (
      id BIGSERIAL PRIMARY KEY,
      run_id BIGINT NOT NULL REFERENCES tour_manager.bank_import_runs(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      booking_date DATE,
      value_date DATE,
      amount_chf NUMERIC(10,2),
      currency VARCHAR(3),
      reference_raw TEXT,
      reference_digits TEXT,
      debtor_name TEXT,
      purpose TEXT,
      match_status VARCHAR(16) NOT NULL DEFAULT 'none',
      confidence INT NOT NULL DEFAULT 0,
      match_reason TEXT,
      matched_invoice_id UUID,
      matched_tour_id INT,
      raw_json JSONB
    )
  `);
  bankImportSchemaEnsured = true;
}

function toImportIso(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

async function applyImportedPayment(invoiceId, actorEmail, details = {}) {
  const invoiceRes = await pool.query(
    `SELECT id, tour_id, invoice_number, invoice_kind, subscription_end_at
     FROM tour_manager.renewal_invoices
     WHERE id = $1
     LIMIT 1`,
    [invoiceId]
  );
  const inv = invoiceRes.rows[0];
  if (!inv) return false;
  const paidAtIso = toImportIso(details.bookingDate) || toIsoDate(new Date());
  const note = String(details.note || '').trim() || 'Bankimport';
  await pool.query(
    `UPDATE tour_manager.renewal_invoices
     SET invoice_status = 'paid',
         paid_at = $2::date,
         payment_method = 'bank_transfer',
         payment_source = 'bank_import',
         payment_note = CASE
           WHEN COALESCE(payment_note, '') = '' THEN $3
           ELSE payment_note || E'\n' || $3
         END,
         recorded_by = $4,
         recorded_at = NOW()
     WHERE id = $1`,
    [invoiceId, paidAtIso, note, actorEmail || 'admin']
  );

  if (inv.subscription_end_at) {
    const endIso = toImportIso(inv.subscription_end_at);
    if (endIso) {
      await pool.query(
        `UPDATE tour_manager.tours
         SET status = 'ACTIVE',
             term_end_date = $2::date,
             ablaufdatum = $2::date,
             updated_at = NOW()
         WHERE id = $1`,
        [inv.tour_id, endIso]
      );

      if (inv.invoice_kind === 'portal_reactivation') {
        const tourMpRes = await pool.query(
          `SELECT matterport_space_id FROM tour_manager.tours WHERE id = $1 LIMIT 1`,
          [inv.tour_id]
        );
        const spaceId = tourMpRes.rows[0]?.matterport_space_id;
        if (spaceId) {
          matterport.unarchiveSpace(spaceId).then((mpResult) => {
            if (mpResult?.success) {
              pool.query(
                `UPDATE tour_manager.tours SET matterport_state = 'active', updated_at = NOW() WHERE id = $1`,
                [inv.tour_id]
              ).catch(() => null);
            }
          }).catch((err) => {
            console.warn('applyImportedPayment: unarchiveSpace failed', inv.tour_id, err.message);
          });
        }
      }

      const templateKey = inv.invoice_kind === 'portal_reactivation' ? 'reactivation_confirmed' : 'extension_confirmed';
      tourActions.sendPaymentConfirmedEmail(inv.tour_id, endIso, templateKey).catch((err) => {
        console.warn('applyImportedPayment: sendPaymentConfirmedEmail failed', inv.tour_id, err.message);
      });
    }
  }

  await logAction(inv.tour_id, 'admin', actorEmail || 'admin', 'INVOICE_MARK_PAID_BANK_IMPORT', {
    invoice_id: inv.id,
    invoice_number: inv.invoice_number || null,
    paid_at: paidAtIso,
    note,
  });
  return true;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mergeTemplate(templateStr, placeholders, { htmlMode = false } = {}) {
  return String(templateStr || '').replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = placeholders?.[key];
    if (val === undefined || val === null) return '';
    const str = String(val);
    return htmlMode ? escapeHtml(str) : str;
  });
}

const TOUR_STATUS_LABELS = {
  ACTIVE: 'Aktiv',
  EXPIRING_SOON: 'Läuft bald ab',
  CUSTOMER_ACCEPTED_AWAITING_PAYMENT: 'Wartet auf Zahlung',
  CUSTOMER_DECLINED: 'Keine Verlängerung',
  ARCHIVED: 'Archiviert',
  AWAITING_CUSTOMER_DECISION: 'Wartet auf Kunde',
  EXPIRED_PENDING_ARCHIVE: 'Abgelaufen',
};

function getTourStatusLabel(status) {
  const key = String(status || '').trim();
  if (!key) return '-';
  return TOUR_STATUS_LABELS[key] || key.replace(/_/g, ' ');
}

function getDisplayedTourStatus(tour, liveMatterportState = null) {
  const workflowStatus = String(tour?.status || '').trim() || 'ACTIVE';
  const matterportState = String(liveMatterportState || tour?.matterport_state || '').trim().toLowerCase();

  if (workflowStatus === 'ARCHIVED' || matterportState === 'inactive') {
    return {
      code: 'ARCHIVED',
      label: 'Archiviert',
      note: workflowStatus !== 'ARCHIVED' ? `Lokaler Workflow: ${getTourStatusLabel(workflowStatus)}` : null,
    };
  }

  return {
    code: workflowStatus,
    label: getTourStatusLabel(workflowStatus),
    note: null,
  };
}

function getAllowedChatModels() {
  return ['gpt-5.4', 'gpt-5-mini', 'gpt-4.1'];
}

function pickFirstNonEmptyText(values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return null;
}

function resolveStoredEmailBody(suggestion, details = {}) {
  const emailDetails = details?.email || {};
  const raw = suggestion?.email_raw_json && typeof suggestion.email_raw_json === 'object'
    ? suggestion.email_raw_json
    : {};
  const rawBodyContent = raw?.body?.content || raw?.body?.Content || null;
  const rawContentType = String(raw?.body?.contentType || raw?.body?.ContentType || '').toLowerCase();
  const rawBodyText = rawBodyContent
    ? (rawContentType === 'html' ? stripHtml(rawBodyContent) : String(rawBodyContent).trim())
    : null;

  return pickFirstNonEmptyText([
    suggestion?.body_text,
    suggestion?.body_preview,
    emailDetails.body_text,
    emailDetails.body_preview,
    emailDetails.bodyText,
    emailDetails.bodyPreview,
    rawBodyText,
    raw?.bodyPreview,
    raw?.preview,
  ]) || '-';
}

function resolveStoredEmailArtifacts(suggestion, details = {}) {
  const emailDetails = details?.email || {};
  const raw = suggestion?.email_raw_json && typeof suggestion.email_raw_json === 'object'
    ? suggestion.email_raw_json
    : {};
  const rawBodyContent = raw?.body?.content || raw?.body?.Content || null;
  const rawContentType = String(raw?.body?.contentType || raw?.body?.ContentType || '').toLowerCase() || null;
  return {
    bodyText: resolveStoredEmailBody(suggestion, details),
    bodyHtml: rawContentType === 'html' && rawBodyContent ? String(rawBodyContent) : null,
    contentType: rawContentType,
    raw,
    mailboxUpn: suggestion?.mailbox_upn || emailDetails.mailbox_upn || null,
  };
}

async function enrichStoredEmailArtifacts(suggestion, details = {}) {
  const artifacts = resolveStoredEmailArtifacts(suggestion, details);
  const hasBody = artifacts.bodyText && artifacts.bodyText !== '-';
  if (hasBody) return { ...artifacts, notice: null };

  // Versuche Body live aus Exchange nachzuladen
  const raw = artifacts.raw || {};
  const mailboxUpn = artifacts.mailboxUpn || raw?.mailbox_upn || null;
  const graphMessageId = raw?.id || suggestion?.graph_message_id || null;

  if (!mailboxUpn || !graphMessageId) {
    return {
      ...artifacts,
      notice: 'Kein Mail-Body lokal gespeichert und keine Exchange-Referenz vorhanden.',
    };
  }

  const qs = new URLSearchParams({
    '$select': 'id,subject,receivedDateTime,bodyPreview,body',
  });
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxUpn)}/messages/${encodeURIComponent(graphMessageId)}?${qs.toString()}`;
  const { data, error } = await graphRequest(url, { method: 'GET' });

  if (error) {
    return {
      ...artifacts,
      notice: `Exchange-Abruf fehlgeschlagen: ${error}`,
    };
  }

  const liveContentType = String(data?.body?.contentType || '').toLowerCase() || null;
  const liveHtml = data?.body?.content ? String(data.body.content) : null;
  const liveText = liveHtml
    ? (liveContentType === 'html' ? stripHtml(liveHtml) : liveHtml.trim())
    : (String(data?.bodyPreview || '').trim() || null);

  if (liveText) {
    return {
      ...artifacts,
      bodyText: liveText,
      bodyHtml: liveContentType === 'html' ? liveHtml : artifacts.bodyHtml,
      contentType: liveContentType || artifacts.contentType,
      notice: null,
    };
  }

  return {
    ...artifacts,
    notice: 'Exchange liefert für diese Mail keinen lesbaren Inhalt. Wahrscheinlich fehlt die Graph-Berechtigung Mail.Read mit Admin Consent.',
  };
}

async function loadTourById(tourId) {
  if (!tourId) return null;
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [tourId]).catch(() => ({ rows: [] }));
  return normalizeTourRow(tourResult.rows[0] || null);
}

function buildDeclineWorkflowState(tour, exxasInvoices = []) {
  const matterportSpaceId = tour?.canonical_matterport_space_id || null;
  const contractId = tour?.canonical_exxas_contract_id || null;
  const customerRef = String(tour?.kunde_ref || '').trim() || null;
  const normalizedInvoices = Array.isArray(exxasInvoices) ? exxasInvoices : [];
  const openInvoices = normalizedInvoices.filter((row) => row?.exxas_status !== 'bz');
  const preferredInvoice = openInvoices[0] || normalizedInvoices[0] || null;
  const dueDate = preferredInvoice?.zahlungstermin ? new Date(preferredInvoice.zahlungstermin) : null;
  const isOverdue = !!(preferredInvoice && preferredInvoice.exxas_status !== 'bz' && dueDate && dueDate < new Date());
  const matterportState = String(tour?.matterport_state || '').trim().toLowerCase();
  const matterportStateLabel = !matterportSpaceId
    ? 'Nicht verknüpft'
    : ({
        active: 'Aktiv',
        inactive: 'Archiviert',
        processing: 'In Bearbeitung',
        pending: 'Ausstehend',
        staging: 'Upload',
        failed: 'Fehler',
      }[matterportState] || 'Unbekannt');
  const contractStateLabel = contractId ? 'Verknüpft' : 'Keine Abo-ID';
  const customerStateLabel = customerRef ? 'Verknüpft' : 'Keine Kunden-ID';
  const invoiceStateLabel = !preferredInvoice
    ? 'Keine passende Rechnung'
    : preferredInvoice.exxas_status === 'bz'
      ? 'Bezahlt'
      : isOverdue
        ? 'Offen / überfällig'
        : (preferredInvoice.sv_status || preferredInvoice.exxas_status || 'Offen');
  return {
    enabled: !!tour?.id,
    matterportSpaceId,
    contractId,
    hasMatterport: !!matterportSpaceId,
    hasContract: !!contractId,
    hasCustomer: !!customerRef,
    isMatterportArchived: matterportState === 'inactive',
    matterportStateLabel,
    contractStateLabel,
    customerStateLabel,
    invoiceStateLabel,
    tourStatusLabel: tour?.status || '-',
    customerIntentLabel: tour?.customer_intent || null,
    customerRef,
    customerId: customerRef,
    customerName: tour?.canonical_customer_name || tour?.customer_name || null,
    exxasInvoices: normalizedInvoices,
    openInvoices,
    preferredInvoice,
    preferredInvoiceDocumentId: preferredInvoice?.exxas_document_id || null,
  };
}

async function enrichDeclineWorkflowState(declineWorkflow) {
  if (!declineWorkflow?.hasCustomer || !declineWorkflow.customerId) return declineWorkflow;
  const liveCustomer = await exxas.resolveCustomerIdentity(declineWorkflow.customerId, {
    customerName: declineWorkflow.customerName,
  }).catch(() => ({ customer: null, error: null }));
  if (liveCustomer?.customer) {
    return {
      ...declineWorkflow,
      customerId: liveCustomer.customer.id || declineWorkflow.customerId,
      customerNumber: liveCustomer.customer.nummer || declineWorkflow.customerRef,
      customerName: liveCustomer.customer.firmenname || declineWorkflow.customerName,
      customerStateLabel: liveCustomer.customer.active ? 'Aktiv' : 'Deaktiviert',
      customerLiveState: liveCustomer.customer.active ? 'active' : 'inactive',
    };
  }
  return {
    ...declineWorkflow,
    customerStateLabel: liveCustomer?.error ? 'Nicht gefunden / Fehler' : declineWorkflow.customerStateLabel,
    customerLiveState: liveCustomer?.error ? 'unknown' : null,
    customerError: liveCustomer?.error || null,
  };
}

function buildDeclineReplyEmail(suggestion, tour) {
  const customerName = suggestion?.from_name || tour?.customer_contact || tour?.canonical_customer_name || '';
  const greeting = customerName ? `Guten Tag ${escapeHtml(customerName)},` : 'Guten Tag,';
  const objectLabel = tour?.canonical_object_label || suggestion?.object_label || suggestion?.bezeichnung || `Tour ${tour?.id || suggestion?.tour_id || ''}`;
  const subject = suggestion?.email_subject && /^re:/i.test(String(suggestion.email_subject).trim())
    ? suggestion.email_subject
    : `Re: ${suggestion?.email_subject || `Virtueller Rundgang – ${objectLabel}`}`;
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;">
      <p>${greeting}</p>
      <p>vielen Dank für Ihre Nachricht.</p>
      <p>Wir haben vermerkt, dass der virtuelle Rundgang <strong>${escapeHtml(objectLabel)}</strong> abgeschaltet werden soll und werden die Tour entsprechend archivieren.</p>
      <p>Falls Sie den Rundgang später wieder aktivieren oder auf ein eigenes Matterport-Konto übertragen möchten, genügt eine kurze Nachricht.</p>
      <p>Freundliche Grüsse<br>Propus</p>
    </div>
  `.trim();
  return { subject, html };
}

async function storeManualOutgoingEmail(tourId, payload = {}) {
  await ensureSuggestionSchema();
  await pool.query(
    `INSERT INTO tour_manager.outgoing_emails (
      tour_id, mailbox_upn, graph_message_id, internet_message_id, conversation_id,
      recipient_email, subject, template_key, sent_at, details_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::jsonb)`,
    [
      tourId,
      payload.mailboxUpn || getGraphConfig().mailboxUpn,
      payload.graphMessageId || null,
      payload.internetMessageId || null,
      payload.conversationId || null,
      payload.recipientEmail || null,
      payload.subject || 'Antwort an Kunde',
      payload.templateKey || 'manual_reply',
      payload.sentAt || new Date().toISOString(),
      JSON.stringify(payload.details || {}),
    ]
  );
}

async function resolveTourFromTargets(targets, context = {}) {
  if (targets?.tourId) {
    const explicitTour = await loadTourById(targets.tourId);
    if (explicitTour) return explicitTour;
  }

  if (targets?.matterportSpaceId) {
    const matterportMatch = await pool.query(
      `SELECT * FROM tour_manager.tours
       WHERE matterport_space_id = $1 OR tour_url ILIKE $2
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1`,
      [targets.matterportSpaceId, `%${targets.matterportSpaceId}%`]
    ).catch(() => ({ rows: [] }));
    if (matterportMatch.rows[0]) return normalizeTourRow(matterportMatch.rows[0]);
  }

  if (targets?.invoiceNumber) {
    const invoiceMatch = await pool.query(
      `SELECT t.*
       FROM tour_manager.exxas_invoices e
       JOIN tour_manager.tours t ON t.id = e.tour_id
       WHERE LOWER(COALESCE(e.nummer, '')) = LOWER($1)
       ORDER BY t.updated_at DESC NULLS LAST
       LIMIT 1`,
      [targets.invoiceNumber]
    ).catch(() => ({ rows: [] }));
    if (invoiceMatch.rows[0]) return normalizeTourRow(invoiceMatch.rows[0]);
  }

  if (targets?.email) {
    const emailMatch = await pool.query(
      `SELECT *
       FROM tour_manager.tours
       WHERE LOWER(COALESCE(customer_email, '')) = LOWER($1)
          OR LOWER(COALESCE(customer_contact, '')) = LOWER($1)
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1`,
      [targets.email]
    ).catch(() => ({ rows: [] }));
    if (emailMatch.rows[0]) return normalizeTourRow(emailMatch.rows[0]);
  }

  if (targets?.objectQuery) {
    const objectNeedle = `%${targets.objectQuery}%`;
    const normalizedNeedle = `%${targets.objectQuery.toLowerCase()}%`;
    const objectMatch = await pool.query(
      `SELECT *,
              CASE
                WHEN LOWER(COALESCE(object_label, '')) = LOWER($1) THEN 500
                WHEN LOWER(COALESCE(bezeichnung, '')) = LOWER($1) THEN 490
                WHEN LOWER(COALESCE(object_label, '')) LIKE LOWER($2) THEN 420
                WHEN LOWER(COALESCE(bezeichnung, '')) LIKE LOWER($2) THEN 410
                WHEN LOWER(COALESCE(customer_name, '')) LIKE LOWER($2) THEN 260
                WHEN LOWER(COALESCE(kunde_ref, '')) LIKE LOWER($2) THEN 250
                WHEN LOWER(COALESCE(customer_contact, '')) LIKE LOWER($2) THEN 240
                WHEN LOWER(COALESCE(tour_url, '')) LIKE LOWER($3) THEN 200
                ELSE 0
              END AS match_score
       FROM tour_manager.tours
       WHERE LOWER(COALESCE(object_label, '')) LIKE LOWER($2)
          OR LOWER(COALESCE(bezeichnung, '')) LIKE LOWER($2)
          OR LOWER(COALESCE(customer_name, '')) LIKE LOWER($2)
          OR LOWER(COALESCE(kunde_ref, '')) LIKE LOWER($2)
          OR LOWER(COALESCE(customer_contact, '')) LIKE LOWER($2)
          OR LOWER(COALESCE(tour_url, '')) LIKE LOWER($3)
       ORDER BY match_score DESC, updated_at DESC NULLS LAST
       LIMIT 1`,
      [targets.objectQuery, objectNeedle, normalizedNeedle]
    ).catch(() => ({ rows: [] }));
    if (objectMatch.rows[0]) return normalizeTourRow(objectMatch.rows[0]);
  }

  if (context?.tour) return context.tour;
  if (context?.effectiveTourId) {
    return loadTourById(context.effectiveTourId);
  }
  return null;
}

async function resolveSuggestionFromTargets(targets, context = {}) {
  if (targets?.suggestionId) {
    return getSuggestionById(targets.suggestionId).catch(() => null);
  }
  if (context?.suggestion) return context.suggestion;
  if (context?.suggestionId) {
    return getSuggestionById(context.suggestionId).catch(() => null);
  }
  return null;
}

function summarizeInvoiceRow(row) {
  const status = row.exxas_status === 'bz' ? 'bezahlt' : (row.sv_status || row.exxas_status || 'offen');
  const due = row.zahlungstermin ? `, fällig ${formatDate(row.zahlungstermin)}` : '';
  const amount = formatCurrency(row.preis_brutto);
  return [
    row.nummer || row.exxas_document_id || 'ohne Nummer',
    amount,
    `(${status}${due})`,
  ].filter(Boolean).join(' ');
}

async function fetchExchangeSummaryForEmail(email) {
  if (!email) return { sections: [], mailHits: [] };
  const graphConfig = getGraphConfig();
  const mailHits = [];

  for (const mailbox of graphConfig.mailboxUpns.slice(0, 2)) {
    // eslint-disable-next-line no-await-in-loop
    const inboxRes = await fetchMailboxMessages({ mailboxUpn: mailbox, folder: 'inbox', top: 25 }).catch(() => ({ messages: [], error: null }));
    if (Array.isArray(inboxRes.messages)) {
      inboxRes.messages
        .filter((msg) => String(msg.fromEmail || '').toLowerCase() === String(email).toLowerCase())
        .slice(0, 2)
        .forEach((msg) => {
          mailHits.push(`Inbox ${mailbox}: ${compactText(msg.subject || '(kein Betreff)')} am ${formatDateTime(msg.receivedAt)}`);
        });
    }

    // eslint-disable-next-line no-await-in-loop
    const sentRes = await fetchMailboxMessages({ mailboxUpn: mailbox, folder: 'sentitems', top: 20 }).catch(() => ({ messages: [], error: null }));
    if (Array.isArray(sentRes.messages)) {
      sentRes.messages
        .filter((msg) => Array.isArray(msg.toRecipients) && msg.toRecipients.some((rec) => String(rec.address || '').toLowerCase() === String(email).toLowerCase()))
        .slice(0, 2)
        .forEach((msg) => {
          mailHits.push(`Gesendet ${mailbox}: ${compactText(msg.subject || '(kein Betreff)')} am ${formatDateTime(msg.sentAt)}`);
        });
    }
  }

  return {
    sections: [buildBulletSection('exchange', mailHits)],
    mailHits,
  };
}

async function searchToursByNeedle(needle, limit = 8) {
  const text = compactText(needle);
  if (text.length < 2) return [];
  const like = `%${text.toLowerCase()}%`;
  const result = await pool.query(
    `SELECT *,
            CASE
              WHEN LOWER(COALESCE(customer_name, '')) = LOWER($1) THEN 600
              WHEN LOWER(COALESCE(kunde_ref, '')) = LOWER($1) THEN 590
              WHEN LOWER(COALESCE(object_label, '')) = LOWER($1) THEN 580
              WHEN LOWER(COALESCE(bezeichnung, '')) = LOWER($1) THEN 570
              WHEN LOWER(COALESCE(customer_contact, '')) = LOWER($1) THEN 560
              WHEN LOWER(COALESCE(customer_email, '')) = LOWER($1) THEN 550
              WHEN LOWER(COALESCE(customer_name, '')) LIKE LOWER($2) THEN 420
              WHEN LOWER(COALESCE(kunde_ref, '')) LIKE LOWER($2) THEN 410
              WHEN LOWER(COALESCE(object_label, '')) LIKE LOWER($2) THEN 400
              WHEN LOWER(COALESCE(bezeichnung, '')) LIKE LOWER($2) THEN 390
              WHEN LOWER(COALESCE(customer_contact, '')) LIKE LOWER($2) THEN 380
              WHEN LOWER(COALESCE(customer_email, '')) LIKE LOWER($2) THEN 370
              ELSE 0
            END AS match_score
     FROM tour_manager.tours
     WHERE LOWER(COALESCE(customer_name, '')) LIKE LOWER($2)
        OR LOWER(COALESCE(kunde_ref, '')) LIKE LOWER($2)
        OR LOWER(COALESCE(object_label, '')) LIKE LOWER($2)
        OR LOWER(COALESCE(bezeichnung, '')) LIKE LOWER($2)
        OR LOWER(COALESCE(customer_contact, '')) LIKE LOWER($2)
        OR LOWER(COALESCE(customer_email, '')) LIKE LOWER($2)
     ORDER BY match_score DESC, updated_at DESC NULLS LAST
     LIMIT $3`,
    [text, like, limit]
  ).catch(() => ({ rows: [] }));
  return result.rows.map((row) => normalizeTourRow(row));
}

async function searchInvoicesByNeedle(needle, limit = 6) {
  const text = compactText(needle);
  if (text.length < 2) return [];
  const like = `%${text.toLowerCase()}%`;
  const result = await pool.query(
    `SELECT id, nummer, exxas_document_id, kunde_name, bezeichnung, exxas_status, sv_status, zahlungstermin, dok_datum, preis_brutto, tour_id
     FROM tour_manager.exxas_invoices
     WHERE LOWER(COALESCE(nummer, '')) LIKE LOWER($1)
        OR LOWER(COALESCE(kunde_name, '')) LIKE LOWER($1)
        OR LOWER(COALESCE(bezeichnung, '')) LIKE LOWER($1)
        OR LOWER(COALESCE(ref_kunde::text, '')) LIKE LOWER($1)
        OR LOWER(COALESCE(ref_vertrag::text, '')) LIKE LOWER($1)
     ORDER BY COALESCE(dok_datum, zahlungstermin) DESC NULLS LAST, synced_at DESC NULLS LAST
     LIMIT $2`,
    [like, limit]
  ).catch(() => ({ rows: [] }));
  return result.rows;
}

async function buildDirectReadResponse(intent, context = {}) {
  const sections = [];
  const targets = intent?.targets || {};
  const tour = await resolveTourFromTargets(targets, context);
  const suggestion = await resolveSuggestionFromTargets(targets, context);

  if (tour) {
    const invoiceRows = await pool.query(
      `SELECT nummer, exxas_document_id, exxas_status, sv_status, zahlungstermin, dok_datum, preis_brutto
       FROM tour_manager.exxas_invoices
       WHERE tour_id = $1
          OR ($2::text IS NOT NULL AND ref_vertrag = $2::text)
       ORDER BY COALESCE(dok_datum, zahlungstermin) DESC NULLS LAST
       LIMIT 6`,
      [tour.id, tour.canonical_exxas_contract_id || null]
    ).catch(() => ({ rows: [] }));
    const localLines = [
      `Tour ${tour.id}: ${tour.canonical_object_label || tour.bezeichnung || '-'}`,
      `Kunde: ${tour.canonical_customer_name || tour.customer_name || tour.kunde_ref || '-'}`,
      `Status: ${tour.status || '-'}`,
      tour.canonical_term_end_date ? `Vertragsende: ${formatDate(tour.canonical_term_end_date)}` : null,
      tour.customer_email ? `E-Mail: ${tour.customer_email}` : null,
      invoiceRows.rows.length ? `Rechnungen: ${invoiceRows.rows.map(summarizeInvoiceRow).join(' | ')}` : 'Rechnungen: keine lokal verknüpften Rechnungen gefunden',
    ];
    sections.push(buildBulletSection('local', localLines));

    if (tour.canonical_matterport_space_id && (intent?.wantsMatterport || intent?.wantsExxas || !targets.email)) {
      const matterportLive = await matterport.getModel(tour.canonical_matterport_space_id).catch(() => ({ model: null, error: 'Matterport Fehler' }));
      sections.push(buildBulletSection('matterport', matterportLive?.model
        ? [
          `Modell: ${matterportLive.model.name || tour.canonical_matterport_space_id}`,
          `Status: ${matterportLive.model.state || '-'}`,
          `Erstellt: ${formatDate(matterportLive.model.created)}`,
          matterportLive.model.publication?.address ? `Adresse: ${compactText(matterportLive.model.publication.address)}` : null,
        ]
        : [matterportLive?.error || 'Keine Live-Daten verfügbar']));
    }

    if (intent?.wantsExxas || targets.invoiceNumber || targets.exxasCustomerId || /zahlung|rechnung|offen|fällig|faellig|abo|vertrag/i.test(targets.normalized || '')) {
      const exxasLines = [];
      if (targets.exxasCustomerId || tour.kunde_ref) {
        const customerId = targets.exxasCustomerId || String(tour.kunde_ref);
        const [customerRes, contactsRes] = await Promise.all([
          exxas.getCustomer(customerId).catch(() => ({ customer: null, error: 'Exxas Kunde nicht abrufbar' })),
          exxas.getContactsForCustomer(customerId).catch(() => ({ contacts: [], error: 'Exxas Kontakte nicht abrufbar' })),
        ]);
        if (customerRes.customer) {
          exxasLines.push(`Kunde: ${customerRes.customer.firmenname || '-'} (#${customerRes.customer.nummer || customerRes.customer.id})`);
          if (customerRes.customer.email) exxasLines.push(`Kunden-E-Mail: ${customerRes.customer.email}`);
        } else if (customerRes.error) {
          exxasLines.push(customerRes.error);
        }
        if (contactsRes.contacts?.length) {
          exxasLines.push(`Kontakte: ${contactsRes.contacts.slice(0, 3).map((ct) => `${ct.name || '-'}${ct.email ? ` <${ct.email}>` : ''}`).join(' | ')}`);
        }
      }
      for (const row of invoiceRows.rows.slice(0, 3)) {
        if (!row.exxas_document_id) continue;
        // eslint-disable-next-line no-await-in-loop
        const liveDetails = await exxas.getInvoiceDetails(row.exxas_document_id).catch(() => ({ success: false }));
        if (liveDetails?.success) {
          exxasLines.push(`Rechnung ${liveDetails.number || liveDetails.id}: Live-Status ${liveDetails.status}`);
        }
      }
      sections.push(buildBulletSection('exxas', exxasLines.length ? exxasLines : ['Keine passenden Live-Daten gefunden']));
    }
  }

  if (!tour && targets.invoiceNumber) {
    const invoiceMatch = await pool.query(
      `SELECT e.*, t.id AS tour_id, COALESCE(t.object_label, t.bezeichnung) AS tour_label
       FROM tour_manager.exxas_invoices e
       LEFT JOIN tour_manager.tours t ON t.id = e.tour_id
       WHERE LOWER(COALESCE(e.nummer, '')) = LOWER($1)
       ORDER BY e.dok_datum DESC NULLS LAST, e.synced_at DESC NULLS LAST
       LIMIT 1`,
      [targets.invoiceNumber]
    ).catch(() => ({ rows: [] }));
    if (invoiceMatch.rows[0]) {
      const row = invoiceMatch.rows[0];
      sections.push(buildBulletSection('local', [
        `Rechnung ${row.nummer || row.exxas_document_id || targets.invoiceNumber}`,
        `Kunde: ${row.kunde_name || '-'}`,
        `Status: ${row.exxas_status === 'bz' ? 'bezahlt' : (row.sv_status || row.exxas_status || 'offen')}`,
        row.zahlungstermin ? `Fällig: ${formatDate(row.zahlungstermin)}` : null,
        row.tour_id ? `Tour: ${row.tour_label || `Tour ${row.tour_id}`}` : 'Tour: nicht verknüpft',
      ]));
      if (row.exxas_document_id) {
        const liveDetails = await exxas.getInvoiceDetails(row.exxas_document_id).catch(() => ({ success: false }));
        sections.push(buildBulletSection('exxas', liveDetails?.success
          ? [
            `Rechnung ${liveDetails.number || liveDetails.id}`,
            `Live-Status: ${liveDetails.status}`,
          ]
          : ['Keine Live-Details zur Rechnung verfügbar']));
      }
    }
  }

  if (targets.exxasCustomerId && !tour) {
    const [customerRes, contactsRes] = await Promise.all([
      exxas.getCustomer(targets.exxasCustomerId).catch(() => ({ customer: null, error: 'Exxas Kunde nicht abrufbar' })),
      exxas.getContactsForCustomer(targets.exxasCustomerId).catch(() => ({ contacts: [], error: 'Exxas Kontakte nicht abrufbar' })),
    ]);
    const exxasLines = [];
    if (customerRes.customer) {
      exxasLines.push(`Kunde: ${customerRes.customer.firmenname || '-'} (#${customerRes.customer.nummer || customerRes.customer.id})`);
      if (customerRes.customer.email) exxasLines.push(`E-Mail: ${customerRes.customer.email}`);
    } else if (customerRes.error) {
      exxasLines.push(customerRes.error);
    }
    if (contactsRes.contacts?.length) {
      exxasLines.push(`Kontakte: ${contactsRes.contacts.slice(0, 5).map((ct) => `${ct.name || '-'}${ct.email ? ` <${ct.email}>` : ''}`).join(' | ')}`);
    }
    sections.push(buildBulletSection('exxas', exxasLines));
  }

  if (targets.matterportSpaceId && !tour) {
    const matterportLive = await matterport.getModel(targets.matterportSpaceId).catch(() => ({ model: null, error: 'Matterport Fehler' }));
    sections.push(buildBulletSection('matterport', matterportLive?.model
      ? [
        `Modell: ${matterportLive.model.name || targets.matterportSpaceId}`,
        `Status: ${matterportLive.model.state || '-'}`,
        `Erstellt: ${formatDate(matterportLive.model.created)}`,
        matterportLive.model.publication?.address ? `Adresse: ${compactText(matterportLive.model.publication.address)}` : null,
      ]
      : [matterportLive?.error || 'Kein Matterport-Modell gefunden']));
  }

  if (targets.email) {
    const mailSummary = await fetchExchangeSummaryForEmail(targets.email);
    sections.push(...mailSummary.sections);
  }

  if (suggestion) {
    sections.push(buildBulletSection('local', [
      `Vorschlag ${suggestion.id}: ${suggestion.suggestion_type}`,
      `Aktion: ${suggestion.suggested_action}`,
      `Status: ${suggestion.status}`,
      suggestion.reason ? `Begründung: ${compactText(suggestion.reason)}` : null,
    ]));
  }

  if (!tour && !suggestion) {
    const genericNeedle = targets.objectQuery || targets.raw || '';
    if (genericNeedle && compactText(genericNeedle).length >= 2) {
      const [tourMatches, invoiceMatches, exxasSearch] = await Promise.all([
        searchToursByNeedle(genericNeedle, 8),
        searchInvoicesByNeedle(genericNeedle, 6),
        exxas.searchCustomers(genericNeedle).catch(() => ({ customers: [], error: null })),
      ]);

      if (tourMatches.length) {
        sections.push(buildBulletSection('local', [
          `Gefundene Touren zu "${compactText(genericNeedle)}":`,
          ...tourMatches.map((row) => {
            const label = row.canonical_object_label || row.object_label || row.bezeichnung || `Tour ${row.id}`;
            const customer = row.canonical_customer_name || row.customer_name || row.kunde_ref || '-';
            const termEnd = row.canonical_term_end_date ? `, Vertragsende ${formatDate(row.canonical_term_end_date)}` : '';
            return `Tour ${row.id}: ${label} · Kunde ${customer} · Status ${row.status || '-'}${termEnd}`;
          }),
        ]));
      }

      if (invoiceMatches.length) {
        sections.push(buildBulletSection('local', [
          `Gefundene Rechnungen zu "${compactText(genericNeedle)}":`,
          ...invoiceMatches.map((row) => {
            const status = row.exxas_status === 'bz' ? 'bezahlt' : (row.sv_status || row.exxas_status || 'offen');
            const linked = row.tour_id ? `, Tour ${row.tour_id}` : ', nicht verknüpft';
            return `${row.nummer || row.exxas_document_id || 'ohne Nummer'} · ${row.kunde_name || '-'} · ${status}${linked}`;
          }),
        ]));
      }

      if (exxasSearch?.customers?.length) {
        sections.push(buildBulletSection('exxas', [
          `Exxas-Kundentreffer zu "${compactText(genericNeedle)}":`,
          ...exxasSearch.customers.slice(0, 6).map((customer) => (
            `${customer.firmenname || '-'} (#${customer.nummer || customer.id || '-'})${customer.email ? ` · ${customer.email}` : ''}`
          )),
        ]));
      } else if (!tourMatches.length && !invoiceMatches.length && exxasSearch?.error) {
        sections.push(buildBulletSection('exxas', [exxasSearch.error]));
      }
    }
  }

  const answer = sections.filter(Boolean).join('\n\n');
  return answer || 'Ich habe aktuell keine passenden Treffer gefunden. Nenne gern einen Namen, eine Adresse, eine E-Mail, eine Rechnungsnummer oder einen Matterport-Link, dann suche ich direkt in Touren, Rechnungen, Kunden, Exchange und Exxas.';
}

async function resolveActionTarget(actionType, context = {}, targets = {}) {
  const tour = await resolveTourFromTargets(targets, context);
  const suggestion = await resolveSuggestionFromTargets(targets, context);

  switch (actionType) {
    case 'send_renewal_email':
    case 'check_payment':
    case 'decline_tour':
    case 'archive_tour':
      if (!tour?.id) return null;
      return { type: actionType, tourId: tour.id };
    case 'unarchive_matterport':
      if (tour?.id) return { type: actionType, tourId: tour.id };
      return null;
    case 'approve_suggestion':
    case 'reject_suggestion':
      if (!suggestion?.id) return null;
      return { type: actionType, suggestionId: suggestion.id };
    case 'sync_mail_suggestions':
    case 'sync_invoice_suggestions':
      return { type: actionType };
    default:
      return null;
  }
}

function buildActionPreview(action, context = {}) {
  const tourLabel = context?.tour?.canonical_object_label || context?.tour?.object_label || context?.tour?.bezeichnung || (context?.effectiveTourId ? `Tour ${context.effectiveTourId}` : 'diese Tour');
  const actionMeta = getActionDefinition(action?.type);
  switch (action?.type) {
    case 'send_renewal_email':
      return `Ich kann jetzt die Verlängerungsmail für ${tourLabel} senden. Soll ich das ausführen?`;
    case 'check_payment':
      return `Ich kann jetzt die Zahlung für ${tourLabel} prüfen. Soll ich das ausführen?`;
    case 'decline_tour':
      return `Ich kann ${tourLabel} jetzt als nicht verlängern markieren. Soll ich das ausführen?`;
    case 'archive_tour':
      return `Ich kann ${tourLabel} jetzt archivieren. Soll ich das ausführen?`;
    case 'unarchive_matterport':
      return `Ich kann die Matterport-Tour von ${tourLabel} jetzt reaktivieren. Soll ich das ausführen?`;
    case 'approve_suggestion':
      return `Ich kann den aktuellen KI-Vorschlag jetzt bestätigen und anwenden. Soll ich das ausführen?`;
    case 'reject_suggestion':
      return `Ich kann den aktuellen KI-Vorschlag jetzt ablehnen. Soll ich das ausführen?`;
    case 'sync_mail_suggestions':
      return 'Ich kann jetzt die Mail-Vorschläge neu synchronisieren. Soll ich das ausführen?';
    case 'sync_invoice_suggestions':
      return 'Ich kann jetzt die Rechnungsvorschläge neu berechnen. Soll ich das ausführen?';
    default:
      return actionMeta ? `Ich kann jetzt „${actionMeta.label}“ ausführen. Soll ich das machen?` : null;
  }
}

function detectSidebarActionRequest(message, context = {}) {
  const text = compactText(message).toLowerCase();
  if (!text) return null;

  const hasTour = !!context?.effectiveTourId;
  const hasSuggestion = !!context?.suggestionId;

  if (/(verlaengerungsmail|verlängerungsmail|mail senden|erneut senden|renewal mail)/.test(text) && hasTour) {
    return { type: 'send_renewal_email', tourId: context.effectiveTourId };
  }
  if (/(zahlung pruefen|zahlung prüfen|payment check|bezahlt.*pruefen|bezahlt.*prüfen)/.test(text) && hasTour) {
    return { type: 'check_payment', tourId: context.effectiveTourId };
  }
  if (/(archivier|tour archivieren|jetzt archivieren)/.test(text) && hasTour) {
    return { type: 'archive_tour', tourId: context.effectiveTourId };
  }
  if (/(reaktivier|unarchiv|matterport.*aktivieren)/.test(text) && hasTour) {
    return { type: 'unarchive_matterport', tourId: context.effectiveTourId };
  }
  if (/(nicht verlaengern|nicht verlängern|kuendigen|kündigen|ablehnen)/.test(text) && hasTour) {
    return { type: 'decline_tour', tourId: context.effectiveTourId };
  }
  if (/(vorschlag bestaetigen|vorschlag bestätigen|ki-vorschlag bestaetigen|ki-vorschlag bestätigen|anwenden)/.test(text) && hasSuggestion) {
    return { type: 'approve_suggestion', suggestionId: context.suggestionId };
  }
  if (/(vorschlag ablehnen|ki-vorschlag ablehnen|verwerfen)/.test(text) && hasSuggestion) {
    return { type: 'reject_suggestion', suggestionId: context.suggestionId };
  }
  if (/(mail-vorschlaege synchronisieren|mail-vorschläge synchronisieren|mails synchronisieren|exchange abrufen)/.test(text)) {
    return { type: 'sync_mail_suggestions' };
  }
  if (/(rechnungsvorschlaege synchronisieren|rechnungsvorschläge synchronisieren|rechnungen synchronisieren)/.test(text)) {
    return { type: 'sync_invoice_suggestions' };
  }
  return null;
}

async function executeSidebarAction(action, reviewerRef) {
  const actionDefinition = getActionDefinition(action?.type);
  if (!actionDefinition) {
    throw new Error('Diese Aktion ist nicht freigegeben');
  }
  switch (action?.type) {
    case 'send_renewal_email': {
      const result = await tourActions.sendRenewalEmail(action.tourId, 'admin', reviewerRef);
      return { ok: true, message: `Verlängerungsmail wurde gesendet an ${result.recipientEmail || 'den Kunden'}.` };
    }
    case 'check_payment': {
      const result = await tourActions.checkPayment(action.tourId);
      return { ok: true, message: result.changed ? `Zahlungsprüfung abgeschlossen, ${result.changed} Änderung(en) erkannt.` : 'Zahlungsprüfung abgeschlossen, keine Änderung erkannt.' };
    }
    case 'decline_tour': {
      await tourActions.declineTour(action.tourId, reviewerRef);
      return { ok: true, message: 'Die Tour wurde als nicht verlängern markiert.' };
    }
    case 'archive_tour': {
      await tourActions.archiveTourNow(action.tourId, reviewerRef);
      return { ok: true, message: 'Die Tour wurde archiviert.' };
    }
    case 'unarchive_matterport': {
      const tourResult = await pool.query('SELECT matterport_space_id FROM tour_manager.tours WHERE id = $1', [action.tourId]);
      if (!tourResult.rows[0]?.matterport_space_id) throw new Error('Tour hat keine Matterport-Verknüpfung');
      const result = await matterport.unarchiveSpace(tourResult.rows[0].matterport_space_id);
      if (!result.success) throw new Error(result.error || 'Reaktivierung fehlgeschlagen');
      await pool.query(`UPDATE tour_manager.tours SET matterport_state = 'active', updated_at = NOW() WHERE id = $1`, [action.tourId]);
      return { ok: true, message: 'Die Matterport-Tour wurde reaktiviert.' };
    }
    case 'approve_suggestion': {
      await approveSuggestion(action.suggestionId, reviewerRef || null);
      return { ok: true, message: 'Der KI-Vorschlag wurde bestätigt und angewendet.' };
    }
    case 'reject_suggestion': {
      await rejectSuggestion(action.suggestionId, reviewerRef || null);
      return { ok: true, message: 'Der KI-Vorschlag wurde abgelehnt.' };
    }
    case 'sync_mail_suggestions': {
      const result = await syncMailboxSuggestions();
      if (result.error) throw new Error(result.error);
      return { ok: true, message: `Mail-Vorschläge synchronisiert. Verarbeitet: ${result.processed || 0}, Vorschläge: ${result.suggestions || 0}.` };
    }
    case 'sync_invoice_suggestions': {
      const result = await syncInvoiceSuggestions();
      return { ok: true, message: `Rechnungsvorschläge neu berechnet. Offen: ${result?.open || result?.suggestions || 'aktualisiert'}.` };
    }
    default:
      throw new Error('Diese Aktion wird noch nicht unterstützt');
  }
}

async function buildSidebarChatContext({ activePage, path, userMessage }) {
  const contextParts = [
    `Admin-Bereich: ${activePage || 'unbekannt'}`,
    `Aktuelle URL: ${path || '/admin'}`,
    'Rolle: Assistent fuer Touren, Exxas-Rechnungen, Matterport und Kundenmails.',
    'Nutze Live-Daten wenn vorhanden und sage klar dazu, ob etwas aus Datenbank, Matterport, Exxas oder Exchange kommt.',
  ];

  const { suggestion, tour, effectiveTourId } = await resolveSidebarChatContext({ path });

  if (suggestion) {
    contextParts.push(`Aktueller Vorschlag: ${suggestion.id} (${suggestion.suggestion_type})`);
    if (suggestion.email_subject) contextParts.push(`Vorschlag Mail-Betreff: ${compactText(suggestion.email_subject)}`);
    if (suggestion.from_email) contextParts.push(`Vorschlag Absender: ${suggestion.from_email}`);
    if (suggestion.reason) contextParts.push(`Vorschlag KI-Begruendung: ${compactText(suggestion.reason)}`);
  }

  const statsQueries = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS cnt FROM tour_manager.tours').catch(() => ({ rows: [{ cnt: 0 }] })),
    pool.query("SELECT COUNT(*)::int AS cnt FROM tour_manager.ai_suggestions WHERE status = 'open'").catch(() => ({ rows: [{ cnt: 0 }] })),
    pool.query("SELECT COUNT(*)::int AS cnt FROM tour_manager.exxas_invoices WHERE exxas_status != 'bz'").catch(() => ({ rows: [{ cnt: 0 }] })),
    pool.query("SELECT COUNT(*)::int AS cnt FROM tour_manager.incoming_emails WHERE processing_status IN ('new','matched','suggested')").catch(() => ({ rows: [{ cnt: 0 }] })),
  ]);
  contextParts.push(`Projektstatus: ${statsQueries[0].rows[0]?.cnt || 0} Touren, ${statsQueries[1].rows[0]?.cnt || 0} offene KI-Vorschlaege, ${statsQueries[2].rows[0]?.cnt || 0} offene Exxas-Rechnungen, ${statsQueries[3].rows[0]?.cnt || 0} neue/aktive eingehende Mails.`);

  if (tour) {
    contextParts.push(`Aktuelle Tour: ${tour.canonical_object_label || tour.object_label || tour.bezeichnung || `Tour ${tour.id}`} (ID ${tour.id})`);
    contextParts.push(`Kunde: ${tour.canonical_customer_name || tour.customer_name || tour.kunde_ref || '-'}`);
    if (tour.customer_email || tour.customer_contact) {
      contextParts.push(`Kontakt: ${tour.customer_email || tour.customer_contact}`);
    }
    if (tour.status) contextParts.push(`Tourstatus: ${tour.status}`);
    if (tour.canonical_term_end_date) contextParts.push(`Vertragsende: ${new Date(tour.canonical_term_end_date).toLocaleDateString('de-CH')}`);
    if (tour.canonical_matterport_space_id) contextParts.push(`Matterport-ID: ${tour.canonical_matterport_space_id}`);
    if (tour.canonical_exxas_contract_id) contextParts.push(`Exxas-Vertrag/Abo: ${tour.canonical_exxas_contract_id}`);

    const [localIncoming, localOutgoing, localInvoices] = await Promise.all([
      pool.query(
        `SELECT subject, from_email, received_at, body_preview
         FROM tour_manager.incoming_emails
         WHERE matched_tour_id = $1
         ORDER BY received_at DESC NULLS LAST, created_at DESC
         LIMIT 6`,
        [tour.id]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT subject, recipient_email, sent_at, template_key
         FROM tour_manager.outgoing_emails
         WHERE tour_id = $1
         ORDER BY sent_at DESC NULLS LAST, created_at DESC
         LIMIT 6`,
        [tour.id]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT exxas_document_id, nummer, exxas_status, sv_status, zahlungstermin, dok_datum, preis_brutto
         FROM tour_manager.exxas_invoices
         WHERE tour_id = $1
            OR ($2::text IS NOT NULL AND ref_vertrag = $2::text)
         ORDER BY COALESCE(dok_datum, zahlungstermin) DESC NULLS LAST
         LIMIT 6`,
        [tour.id, tour.canonical_exxas_contract_id || null]
      ).catch(() => ({ rows: [] })),
    ]);

    if (localIncoming.rows.length) {
      const incomingSummary = localIncoming.rows.map((row) => (
        `${new Date(row.received_at).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}: ${compactText(row.subject || '(kein Betreff)')} von ${row.from_email || '-'}`
      )).join(' | ');
      contextParts.push(`Lokale eingehende Mails zur Tour: ${incomingSummary}`);
    }

    if (localOutgoing.rows.length) {
      const outgoingSummary = localOutgoing.rows.map((row) => (
        `${new Date(row.sent_at).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}: ${compactText(row.subject || row.template_key || '(ohne Betreff)')} an ${row.recipient_email || '-'}`
      )).join(' | ');
      contextParts.push(`Lokale gesendete Mails zur Tour: ${outgoingSummary}`);
    }

    if (localInvoices.rows.length) {
      const invoiceSummary = localInvoices.rows.map((row) => {
        const number = row.nummer || row.exxas_document_id || '?';
        const amount = row.preis_brutto ? `CHF ${parseFloat(row.preis_brutto).toFixed(2)}` : '';
        const status = row.exxas_status === 'bz' ? 'bezahlt' : (row.sv_status || row.exxas_status || 'offen');
        const due = row.zahlungstermin ? `, faellig ${new Date(row.zahlungstermin).toLocaleDateString('de-CH')}` : '';
        return `${number} ${amount}`.trim() + ` (${status}${due})`;
      }).join(' | ');
      contextParts.push(`Lokale Exxas-Rechnungen zur Tour: ${invoiceSummary}`);

      const liveInvoiceChecks = [];
      for (const row of localInvoices.rows.slice(0, 3)) {
        if (!row.exxas_document_id) continue;
        // Live-Details je Rechnung begrenzen, damit der Chat schnell bleibt.
        // Exxas kann je nach Installation unvollstaendig antworten, deshalb nur best effort.
        // eslint-disable-next-line no-await-in-loop
        const liveDetails = await exxas.getInvoiceDetails(row.exxas_document_id).catch(() => ({ success: false }));
        if (liveDetails?.success) {
          liveInvoiceChecks.push(`${liveDetails.number || liveDetails.id}: Live-Status ${liveDetails.status}`);
        }
      }
      if (liveInvoiceChecks.length) {
        contextParts.push(`Exxas live geprueft: ${liveInvoiceChecks.join(' | ')}`);
      }
    }

    if (tour.canonical_matterport_space_id) {
      const matterportLive = await matterport.getModel(tour.canonical_matterport_space_id).catch(() => ({ model: null, error: 'Matterport Fehler' }));
      if (matterportLive?.model) {
        contextParts.push(
          `Matterport live: ${matterportLive.model.name || tour.canonical_matterport_space_id}, Status ${matterportLive.model.state || '-'}, erstellt ${matterportLive.model.created ? new Date(matterportLive.model.created).toLocaleDateString('de-CH') : '-'}`
        );
        if (matterportLive.model.publication?.address) {
          contextParts.push(`Matterport Adresse live: ${compactText(matterportLive.model.publication.address)}`);
        }
      } else if (matterportLive?.error) {
        contextParts.push(`Matterport live Fehler: ${matterportLive.error}`);
      }
    }

    const exxasSearchTerm = compactText(tour.canonical_customer_name || tour.customer_name || '');
    if (exxasSearchTerm && exxasSearchTerm.length >= 2) {
      const exxasSearch = await exxas.searchCustomers(exxasSearchTerm).catch(() => ({ customers: [], error: 'Exxas Suche fehlgeschlagen' }));
      if (exxasSearch?.customers?.length) {
        const topCustomers = exxasSearch.customers.slice(0, 3).map((c) => `${c.firmenname || '-'} (#${c.nummer || c.id})${c.email ? `, ${c.email}` : ''}`);
        contextParts.push(`Exxas live Kundentreffer: ${topCustomers.join(' | ')}`);
      } else if (exxasSearch?.error) {
        contextParts.push(`Exxas live Suche Fehler: ${exxasSearch.error}`);
      }
    }

    const graphConfig = getGraphConfig();
    const mailNeedle = String(tour.customer_email || '').trim().toLowerCase();
    if (mailNeedle) {
      const liveMailHits = [];
      for (const mailbox of graphConfig.mailboxUpns.slice(0, 2)) {
        // Inbox
        // eslint-disable-next-line no-await-in-loop
        const inboxRes = await fetchMailboxMessages({ mailboxUpn: mailbox, folder: 'inbox', top: 25 }).catch(() => ({ messages: [], error: null }));
        if (Array.isArray(inboxRes.messages)) {
          const inboxMatches = inboxRes.messages.filter((msg) => String(msg.fromEmail || '').toLowerCase() === mailNeedle).slice(0, 2);
          inboxMatches.forEach((msg) => {
            liveMailHits.push(`Exchange live Inbox ${mailbox}: ${compactText(msg.subject || '(kein Betreff)')} am ${msg.receivedAt ? new Date(msg.receivedAt).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}`);
          });
        }
        // Sent
        // eslint-disable-next-line no-await-in-loop
        const sentRes = await fetchMailboxMessages({ mailboxUpn: mailbox, folder: 'sentitems', top: 20 }).catch(() => ({ messages: [], error: null }));
        if (Array.isArray(sentRes.messages)) {
          const sentMatches = sentRes.messages
            .filter((msg) => Array.isArray(msg.toRecipients) && msg.toRecipients.some((rec) => String(rec.address || '').toLowerCase() === mailNeedle))
            .slice(0, 2);
          sentMatches.forEach((msg) => {
            liveMailHits.push(`Exchange live Sent ${mailbox}: ${compactText(msg.subject || '(kein Betreff)')} am ${msg.sentAt ? new Date(msg.sentAt).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}`);
          });
        }
      }
      if (liveMailHits.length) {
        contextParts.push(liveMailHits.join(' | '));
      }
    }
  }

  const freeformQuery = compactText(userMessage);
  if (freeformQuery.length >= 3 && !tour) {
    const exxasSearch = await exxas.searchCustomers(freeformQuery.slice(0, 80)).catch(() => ({ customers: [], error: null }));
    if (exxasSearch?.customers?.length) {
      const topCustomers = exxasSearch.customers.slice(0, 3).map((c) => `${c.firmenname || '-'} (#${c.nummer || c.id})`);
      contextParts.push(`Exxas live Suchtreffer zur Frage: ${topCustomers.join(' | ')}`);
    }
  }

  return contextParts.join('. ');
}

router.get('/', (req, res) => res.redirect('/admin/dashboard'));

router.get('/dashboard', async (req, res) => {
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_is_own BOOLEAN');

  const [
    matterportResult,
    linkedResult,
    recentToursRaw,
    expiringSoonRowsRaw,
  ] = await Promise.all([
    matterport.listModels(),
    pool.query(`
      SELECT DISTINCT TRIM(matterport_space_id) AS space_id
      FROM tour_manager.tours
      WHERE matterport_space_id IS NOT NULL
        AND TRIM(matterport_space_id) != ''
    `),
    pool.query(`
      SELECT t.*,
        (COALESCE(t.term_end_date, t.ablaufdatum) - CURRENT_DATE)::int AS days_until_expiry
      FROM tour_manager.tours t
      ORDER BY t.created_at DESC NULLS LAST, t.id DESC
      LIMIT 5
    `),
    pool.query(`
      SELECT t.*,
        (COALESCE(t.term_end_date, t.ablaufdatum) - CURRENT_DATE)::int AS days_until_expiry
      FROM tour_manager.tours t
      WHERE t.status IN ('ACTIVE','EXPIRING_SOON')
        AND COALESCE(t.term_end_date, t.ablaufdatum) IS NOT NULL
      ORDER BY COALESCE(t.term_end_date, t.ablaufdatum) ASC
      LIMIT 5
    `),
  ]);

  const linkedSpaceIds = new Set(
    linkedResult.rows
      .map((row) => String(row.space_id || '').trim())
      .filter(Boolean)
  );
  const openMatterportSpaces = (matterportResult.results || [])
    .filter((model) => String(model.state || '').toLowerCase() === 'active')
    .filter((model) => !linkedSpaceIds.has(String(model.id || '').trim()))
    .sort((a, b) => {
      const ta = a?.created ? new Date(a.created).getTime() : 0;
      const tb = b?.created ? new Date(b.created).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 5);
  const recentTours = recentToursRaw.rows.map(normalizeTourRow);
  const expiringSoonTours = expiringSoonRowsRaw.rows.map(normalizeTourRow);

  res.render('admin/dashboard', {
    openMatterportSpaces,
    recentTours,
    expiringSoonTours,
    activePage: 'dashboard',
  });
});

router.get('/ai-chat', async (req, res) => {
  const rawEmail = String(req.session?.admin?.email || '').trim().toLowerCase();
  const emailLocal = rawEmail.includes('@') ? rawEmail.split('@')[0] : rawEmail;
  const adminName = emailLocal
    ? emailLocal
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : 'Admin';
  res.render('admin/ai-chat', {
    activePage: 'aiChat',
    allowedModels: getAllowedChatModels(),
    defaultModel: getAiConfig().model || 'gpt-5.4',
    adminName,
  });
});

router.use('/suggestions', (req, res) => {
  return res.status(404).send('Nicht gefunden');
});

router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const like = `%${q.toLowerCase()}%`;
  const results = [];

  const tours = await pool.query(`
    SELECT id,
      COALESCE(customer_name, kunde_ref) AS name,
      COALESCE(object_label, bezeichnung) AS label,
      customer_email,
      status,
      COALESCE(term_end_date, ablaufdatum) AS ablaufdatum
    FROM tour_manager.tours
    WHERE LOWER(COALESCE(customer_name,'')) LIKE $1
       OR LOWER(COALESCE(kunde_ref,'')) LIKE $1
       OR LOWER(COALESCE(object_label,'')) LIKE $1
       OR LOWER(COALESCE(bezeichnung,'')) LIKE $1
       OR LOWER(COALESCE(customer_email,'')) LIKE $1
       OR LOWER(COALESCE(customer_contact,'')) LIKE $1
       OR LOWER(COALESCE(matterport_space_id,'')) LIKE $1
       OR LOWER(COALESCE(exxas_abo_id::text,'')) LIKE $1
    ORDER BY COALESCE(customer_name, kunde_ref) ASC
    LIMIT 8
  `, [like]);
  for (const t of tours.rows) {
    results.push({
      type: 'tour',
      id: t.id,
      title: [t.name, t.label].filter(Boolean).join(' – '),
      sub: t.customer_email || '',
      status: t.status,
      url: `/admin/tours/${t.id}`,
    });
  }

  const invoices = await pool.query(`
    SELECT id, nummer, kunde_name, bezeichnung, betrag, status
    FROM tour_manager.exxas_invoices
    WHERE LOWER(COALESCE(kunde_name,'')) LIKE $1
       OR LOWER(COALESCE(bezeichnung,'')) LIKE $1
       OR LOWER(COALESCE(nummer,'')) LIKE $1
    ORDER BY kunde_name ASC
    LIMIT 4
  `, [like]).catch(() => ({ rows: [] }));
  for (const inv of invoices.rows) {
    results.push({
      type: 'invoice',
      id: inv.id,
      title: [inv.nummer, inv.kunde_name].filter(Boolean).join(' – '),
      sub: inv.bezeichnung || '',
      status: inv.status,
      url: `/admin/invoices`,
    });
  }

  res.json(results);
});

/** Einstellungen: APIs, Dashboard-Widgets, Sync */
router.get('/settings', async (req, res) => {
  const [widgets, aiPromptSettings, matterportStored] = await Promise.all([
    getDashboardWidgets(),
    getAiPromptSettings(),
    getMatterportApiCredentials(),
  ]);
  const exxasBase = (process.env.EXXAS_BASE_URL || 'https://api.exxas.net').replace(/\/$/, '');
  const aiConfig = getAiConfig();
  res.render('admin/settings', {
    widgets,
    aiPromptSettings,
    matterportStored: {
      tokenId: matterportStored.tokenId || '',
      hasSecret: !!matterportStored.tokenSecret,
    },
    aiConfig,
    allowedChatModels: getAllowedChatModels(),
    actionDefinitions: listActionDefinitions(),
    riskDefinitions: listRiskDefinitions(),
    exxasBase,
    saved: req.query.saved === '1',
    activePage: 'settings',
  });
});

router.post('/settings', async (req, res) => {
  const body = req.body || {};
  const widgetKeys = [
    'total', 'expiringSoon', 'awaitingPayment', 'active', 'declined',
    'archived', 'unlinked', 'fremdeTouren', 'invoicesOffen', 'invoicesUeberfaellig', 'invoicesBezahlt',
  ];
  const widgets = {};
  for (const k of widgetKeys) {
    widgets[k] = !!body[k];
  }
  await saveMatterportApiCredentials({
    clearStored: body.matterport_clear_stored === '1',
    tokenId: body.matterportTokenId,
    tokenSecret: body.matterportTokenSecret,
  });
  matterport.invalidateMatterportCredentialsCache();
  await Promise.all([
    saveDashboardWidgets(widgets),
    saveAiPromptSettings({
      mailSystemPrompt: body.mailSystemPrompt || '',
    }),
  ]);
  res.redirect('/admin/settings?saved=1');
});

/** E-Mail-Templates anzeigen und bearbeiten */
router.get('/email-templates', async (req, res) => {
  const templates = await getEmailTemplates();
  const sharedPlaceholders = ['objectLabel', 'customerGreeting', 'tourLinkHtml', 'tourLinkText', 'termEndFormatted', 'portalUrl', 'portalLinkHtml', 'portalLinkText'];
  res.render('admin/email-templates', {
    templates,
    defaultTemplates: DEFAULT_EMAIL_TEMPLATES,
    placeholderHints: {
      renewal_request: [...sharedPlaceholders, 'createdAt', 'amount', 'yesUrl', 'noUrl'],
      payment_confirmed: sharedPlaceholders,
      expiry_reminder: sharedPlaceholders,
      extension_confirmed: sharedPlaceholders,
      reactivation_confirmed: sharedPlaceholders,
      archive_notice: sharedPlaceholders,
      payment_failed: sharedPlaceholders,
      team_invite: ['inviteLink', 'invitedByEmail', 'appName'],
    },
    saved: req.query.saved === '1',
    activePage: 'emailTemplates',
  });
});

router.post('/email-templates', async (req, res) => {
  const body = req.body || {};
  const templates = {};
  for (const key of Object.keys(DEFAULT_EMAIL_TEMPLATES)) {
    const subj = body[`${key}_subject`];
    const html = body[`${key}_html`];
    const text = body[`${key}_text`];
    const def = DEFAULT_EMAIL_TEMPLATES[key];
    templates[key] = {
      subject: typeof subj === 'string' ? (subj.trim() || def?.subject) : def?.subject,
      html: typeof html === 'string' ? (html.trim() || def?.html) : def?.html,
      text: typeof text === 'string' ? (text.trim() || def?.text) : def?.text,
    };
  }
  await saveEmailTemplates(templates);
  res.redirect('/admin/email-templates?saved=1');
});

function teamAvatarInitials(value) {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length) return parts.map((part) => part.charAt(0).toUpperCase()).join('');
  const emailLocal = String(value || '').split('@')[0] || '';
  return emailLocal.slice(0, 2).toUpperCase() || 'P';
}

/** Listenansicht: nur Anzeigename, keine E-Mail. */
function teamMemberListTitle(name) {
  const n = String(name || '').trim();
  return n || '—';
}

/** Einladung in der Liste ohne vollständige E-Mail (nur lokaler Teil + @…) */
function teamInviteListLabel(email) {
  const e = String(email || '').trim();
  const at = e.indexOf('@');
  if (at <= 0) return e || '—';
  return `${e.slice(0, at)}@…`;
}

router.get('/portal-roles', async (req, res) => {
  await portalTeam.ensurePortalTeamSchema();
  const tab = req.query.tab === 'extern' ? 'extern' : 'intern';
  const staffRows = await portalTeam.listPortalStaffRoles();

  // Externe Kunden-Admins: alle aktiven 'admin'-Mitglieder aller Workspaces
  let externRows = [];
  try {
    const r = await pool.query(`
      SELECT
        m.owner_email,
        m.member_email,
        m.display_name,
        m.role,
        m.status,
        m.accepted_at,
        m.created_at,
        COALESCE(NULLIF(trim(c.name),''), c.company, m.owner_email) AS customer_name,
        c.id AS customer_id
      FROM tour_manager.portal_team_members m
      LEFT JOIN core.customers c ON LOWER(c.email) = LOWER(m.owner_email)
      WHERE m.role IN ('admin', 'inhaber')
        AND m.status = 'active'
      ORDER BY LOWER(m.owner_email), m.role DESC, LOWER(m.member_email)
    `);
    externRows = r.rows;
  } catch (_) { /* Tabelle existiert noch nicht – kein Problem */ }

  // Alle Workspace-Inhaber (owner_email aus tours) für "Kunden-Admin setzen"-Form
  let ownerList = [];
  try {
    const owR = await pool.query(`
      SELECT DISTINCT ON (LOWER(TRIM(t.customer_email)))
        LOWER(TRIM(t.customer_email)) AS owner_email,
        CASE
          WHEN trim(coalesce(c_ref.name,'')) <> '' THEN trim(c_ref.name)
          WHEN trim(coalesce(c_ref.company,'')) <> '' THEN trim(c_ref.company)
          WHEN trim(coalesce(c.name,'')) <> '' THEN trim(c.name)
          WHEN trim(coalesce(c.company,'')) <> '' THEN trim(c.company)
          WHEN trim(coalesce(t.customer_name,'')) <> '' THEN trim(t.customer_name)
          WHEN trim(coalesce(t.kunde_ref::text,'')) <> '' THEN trim(t.kunde_ref::text)
          ELSE LOWER(TRIM(t.customer_email))
        END AS customer_name,
        CASE
          WHEN trim(coalesce(c_ref.company,'')) <> '' THEN trim(c_ref.company)
          WHEN trim(coalesce(c_ref.name,'')) <> '' THEN trim(c_ref.name)
          WHEN trim(coalesce(c.company,'')) <> '' THEN trim(c.company)
          WHEN trim(coalesce(c.name,'')) <> '' THEN trim(c.name)
          WHEN trim(coalesce(t.customer_name,'')) <> '' THEN trim(t.customer_name)
          ELSE NULL
        END AS firma,
        COALESCE(c_ref.id, c.id) AS customer_id
      FROM tour_manager.tours t
      LEFT JOIN core.customers c ON LOWER(c.email) = LOWER(t.customer_email)
      LEFT JOIN core.customers c_ref ON trim(c_ref.customer_number) = trim(CAST(t.kunde_ref AS text))
      WHERE t.customer_email IS NOT NULL AND trim(t.customer_email) <> ''
      ORDER BY LOWER(TRIM(t.customer_email)),
               CASE WHEN trim(coalesce(c_ref.name,'')) <> ''
                      OR trim(coalesce(c_ref.company,'')) <> ''
                      OR trim(coalesce(c.name,'')) <> ''
                      OR trim(coalesce(c.company,'')) <> ''
                      OR trim(coalesce(t.customer_name,'')) <> ''
                    THEN 0 ELSE 1 END
      LIMIT 300
    `);
    // Deduplizierung: pro customer_id oder Firmenname nur einen Eintrag
    const seen = new Map();
    for (const row of owR.rows) {
      const key = row.customer_id
        ? `cid:${row.customer_id}`
        : `name:${(row.customer_name || row.owner_email).toLowerCase()}`;
      if (!seen.has(key)) {
        seen.set(key, row);
      } else {
        // Existierenden Eintrag bevorzugen wenn er besseren Namen hat
        const existing = seen.get(key);
        if (!existing.firma && row.firma) seen.set(key, row);
      }
    }
    ownerList = [...seen.values()].sort((a, b) => {
      const aHas = a.firma ? 0 : 1;
      const bHas = b.firma ? 0 : 1;
      if (aHas !== bHas) return aHas - bHas;
      return (a.customer_name || '').localeCompare(b.customer_name || '', 'de');
    });
  } catch (err) {
    console.error('[portal-roles ownerList]', err.message);
  }

  const admin = req.session?.admin || {};
  res.render('admin/portal-roles', {
    activePage: 'portalRoles',
    adminName: admin.email || '',
    adminSidebarDisplayName: admin.displayName || admin.email || '',
    adminSidebarOrganization: admin.organization || 'Propus GmbH',
    adminSidebarHasProfilePhoto: admin.hasProfilePhoto || false,
    adminSidebarPhotoVersion: admin.photoVersion || 0,
    staffRows,
    externRows,
    ownerList,
    tab,
    logtoPortalEnabled: isLogtoEnabled('PROPUS_TOURS_PORTAL'),
    saved: req.query.saved === '1',
    removed: req.query.removed === '1',
    externSaved: req.query.externSaved === '1',
    externRemoved: req.query.externRemoved === '1',
    error: req.query.error || null,
  });
});

router.post('/portal-roles/add', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    const inviter = String(req.session?.admin?.email || req.session?.adminEmail || '').trim().toLowerCase();
    await portalTeam.addPortalStaffRole(email, portalTeam.ROLE_TOUR_MANAGER, inviter || null);
    return res.redirect('/admin/portal-roles?saved=1');
  } catch (e) {
    return res.redirect(`/admin/portal-roles?error=${encodeURIComponent(e.message || 'Fehler')}`);
  }
});

router.post('/portal-roles/remove', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    await portalTeam.removePortalStaffRole(email, portalTeam.ROLE_TOUR_MANAGER);
    return res.redirect('/admin/portal-roles?removed=1');
  } catch (e) {
    return res.redirect(`/admin/portal-roles?error=${encodeURIComponent(e.message || 'Fehler')}`);
  }
});

// Extern: Kunden-Admin direkt setzen (member_email als 'admin' in owner-Workspace eintragen)
// GET /admin/portal-roles/extern-contacts?owner_email=... – JSON: Kontakte für Firma-Dropdown
router.get('/portal-roles/extern-contacts', async (req, res) => {
  const ownerEmail = String(req.query.owner_email || '').trim().toLowerCase();
  const customerId = Number.parseInt(String(req.query.customer_id || ''), 10);
  if (!ownerEmail && !Number.isInteger(customerId)) return res.json({ contacts: [] });

  /** Hilfsfunktion: dedupliziert nach E-Mail; bereits gesehene überspringen */
  function mergeContacts(base, additions) {
    const seen = new Set(base.map(c => c.email));
    for (const c of additions) {
      if (c.email && !seen.has(c.email)) {
        seen.add(c.email);
        base.push(c);
      }
    }
    return base;
  }

  /** Lädt aktive portal_team_members für einen Workspace */
  async function loadPortalMembers(ownerEmailNorm) {
    if (!ownerEmailNorm) return [];
    try {
      const pm = await pool.query(
        `SELECT
           LOWER(TRIM(member_email)) AS email,
           COALESCE(NULLIF(TRIM(display_name),''), LOWER(TRIM(member_email))) AS name,
           CASE role
             WHEN 'admin'   THEN 'Kunden-Admin'
             WHEN 'inhaber' THEN 'Inhaber'
             ELSE 'Mitarbeiter'
           END AS position
         FROM tour_manager.portal_team_members
         WHERE LOWER(TRIM(owner_email)) = $1
           AND status = 'active'
           AND member_email IS NOT NULL AND TRIM(member_email) <> ''
         ORDER BY member_email`,
        [ownerEmailNorm]
      );
      return pm.rows
        .map(row => ({
          email: String(row.email || '').trim().toLowerCase(),
          name: String(row.name || '').trim(),
          position: String(row.position || '').trim(),
        }))
        .filter(c => c.email);
    } catch (_) {
      return [];
    }
  }

  try {
    // 1. Suche customer: zuerst per ID, dann per E-Mail
    let customer = null;
    if (Number.isInteger(customerId)) {
      const r = await pool.query(
        `SELECT id, name, company, email FROM core.customers WHERE id = $1`,
        [customerId]
      );
      customer = r.rows[0] || null;
    }
    if (!customer && ownerEmail) {
      const r = await pool.query(
        `SELECT id, name, company, email FROM core.customers WHERE LOWER(email) = $1`,
        [ownerEmail]
      );
      customer = r.rows[0] || null;
    }

    // 2. Kein core.customers-Eintrag: owner_email + gleiche Firma aus tours + Portal-Mitglieder
    if (!customer) {
      if (!ownerEmail) return res.json({ contacts: [] });
      const base = [{
        email: ownerEmail,
        name: ownerEmail,
        position: 'Workspace-Inhaber',
      }];
      // Weitere E-Mails derselben Firma (gleicher customer_name in tours, kein core.customers-Link)
      try {
        const nameRow = await pool.query(
          `SELECT DISTINCT trim(t.customer_name) AS customer_name
           FROM tour_manager.tours t
           LEFT JOIN core.customers c ON LOWER(c.email) = LOWER(t.customer_email)
           WHERE LOWER(TRIM(t.customer_email)) = $1
             AND t.customer_name IS NOT NULL AND trim(t.customer_name) <> ''
             AND c.id IS NULL
           LIMIT 1`,
          [ownerEmail]
        );
        const firmName = nameRow.rows[0]?.customer_name || null;
        if (firmName) {
          const siblingsRow = await pool.query(
            `SELECT DISTINCT LOWER(TRIM(t.customer_email)) AS email
             FROM tour_manager.tours t
             LEFT JOIN core.customers c ON LOWER(c.email) = LOWER(t.customer_email)
             WHERE LOWER(trim(t.customer_name)) = LOWER($1)
               AND LOWER(TRIM(t.customer_email)) <> $2
               AND t.customer_email IS NOT NULL AND TRIM(t.customer_email) <> ''
               AND c.id IS NULL
             LIMIT 50`,
            [firmName, ownerEmail]
          );
          for (const r of siblingsRow.rows) {
            if (r.email && !base.some(b => b.email === r.email)) {
              base.push({ email: r.email, name: r.email, position: 'Kontakt dieser Firma' });
            }
          }
        }
      } catch (_) { /* ignorieren */ }
      const portalMembers = await loadPortalMembers(ownerEmail);
      return res.json({ contacts: mergeContacts(base, portalMembers) });
    }

    // 3. Ansprechpartner aus core.customer_contacts laden
    const r = await pool.query(
      `SELECT cc.id, cc.name, cc.email, cc.role AS position
       FROM core.customer_contacts cc
       WHERE cc.customer_id = $1
         AND cc.email IS NOT NULL AND trim(cc.email) <> ''
       ORDER BY cc.name ASC`,
      [customer.id]
    );
    const contacts = r.rows.map(row => ({
      email: String(row.email || '').trim().toLowerCase(),
      name: String(row.name || '').trim(),
      position: String(row.position || '').trim(),
    })).filter(c => c.email);

    // 4. Workspace-Inhaber (owner_email) an erster Stelle
    const ownerEmailNorm = String(ownerEmail || customer.email || '').trim().toLowerCase();
    const ownerName = String(customer.name || customer.company || '').trim();
    if (ownerEmailNorm && !contacts.some((c) => c.email === ownerEmailNorm)) {
      contacts.unshift({
        email: ownerEmailNorm,
        name: ownerName || ownerEmailNorm,
        position: customer.company ? 'Hauptkontakt' : 'Workspace-Inhaber',
      });
    }

    // 5. Kunden-E-Mail aus core.customers anbieten wenn abweichend von owner_email
    const customerEmailNorm = String(customer.email || '').trim().toLowerCase();
    if (customerEmailNorm && customerEmailNorm !== ownerEmailNorm && !contacts.some((c) => c.email === customerEmailNorm)) {
      contacts.push({
        email: customerEmailNorm,
        name: ownerName || customerEmailNorm,
        position: 'Hauptkontakt',
      });
    }

    // 6. Aktive Portal-Team-Mitglieder ergänzen (dedupliziert)
    const portalMembers = await loadPortalMembers(ownerEmailNorm || ownerEmail);
    mergeContacts(contacts, portalMembers);

    res.json({ contacts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/portal-roles/extern-set', async (req, res) => {
  try {
    const ownerEmail = String(req.body?.owner_email || '').trim().toLowerCase();
    const memberEmail = String(req.body?.member_email || '').trim().toLowerCase();
    if (!ownerEmail || !memberEmail) throw new Error('owner_email und member_email erforderlich.');
    if (!memberEmail.includes('@')) throw new Error('Ungültige E-Mail-Adresse.');

    await portalTeam.ensurePortalTeamSchema();
    // Upsert: als aktiven Admin eintragen (accepted = jetzt)
    await pool.query(`
      INSERT INTO tour_manager.portal_team_members
        (owner_email, member_email, role, status, accepted_at, created_at)
      VALUES ($1, $2, 'admin', 'active', NOW(), NOW())
      ON CONFLICT (lower(owner_email), lower(member_email)) DO UPDATE
        SET role = 'admin', status = 'active', accepted_at = COALESCE(tour_manager.portal_team_members.accepted_at, NOW())
    `, [ownerEmail, memberEmail]);

    await runExternPortalSync(ownerEmail, memberEmail);
    return res.redirect('/admin/portal-roles?tab=extern&externSaved=1');
  } catch (e) {
    return res.redirect(`/admin/portal-roles?tab=extern&error=${encodeURIComponent(e.message || 'Fehler')}`);
  }
});

// Extern: Kunden-Admin-Rolle entfernen / auf mitarbeiter zurückstufen
router.post('/portal-roles/extern-remove', async (req, res) => {
  try {
    const ownerEmail = String(req.body?.owner_email || '').trim().toLowerCase();
    const memberEmail = String(req.body?.member_email || '').trim().toLowerCase();
    if (!ownerEmail || !memberEmail) throw new Error('Fehlende Parameter.');

    await pool.query(`
      UPDATE tour_manager.portal_team_members
      SET role = 'mitarbeiter'
      WHERE LOWER(owner_email) = $1 AND LOWER(member_email) = $2
    `, [ownerEmail, memberEmail]);

    await runExternPortalSync(ownerEmail, memberEmail);
    return res.redirect('/admin/portal-roles?tab=extern&externRemoved=1');
  } catch (e) {
    return res.redirect(`/admin/portal-roles?tab=extern&error=${encodeURIComponent(e.message || 'Fehler')}`);
  }
});

router.get('/team', async (req, res) => {
  await ensureAdminTeamSchema();
  const [users, pendingInvites] = await Promise.all([
    listAdminAccessUsers(),
    listPendingAdminInvites(),
  ]);
  res.render('admin/team', {
    users,
    pendingInvites,
    invited: req.query.invited === '1',
    accepted: req.query.accepted === '1',
    updated: req.query.updated === '1',
    edited: req.query.edited === '1',
    deleted: req.query.deleted === '1',
    revoked: req.query.revoked === '1',
    inviteError: req.query.error || null,
    activePage: 'team',
    getInitials: teamAvatarInitials,
    teamMemberListTitle,
    teamInviteListLabel,
  });
});

router.post('/team/invite', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const expiresDays = Math.max(1, parseInt(String(req.body?.expiresDays || '7'), 10) || 7);
  if (!email || !email.includes('@')) {
    return res.redirect('/admin/team?error=invalid_email');
  }
  try {
    await ensureAdminTeamSchema();
    const invitedByEmail = String(req.session?.admin?.email || '').trim().toLowerCase() || 'admin@propus.ch';
    const invite = await createAdminInvite(email, invitedByEmail, expiresDays);
    const templates = await getEmailTemplates();
    const template = templates.team_invite || DEFAULT_EMAIL_TEMPLATES.team_invite;
    const appBaseUrl = String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
    const fallbackBaseUrl = `${req.protocol}://${req.get('host')}`;
    const baseUrl = appBaseUrl || fallbackBaseUrl;
    const inviteLink = `${baseUrl}/accept-invite?token=${encodeURIComponent(invite.token)}`;
    const placeholders = {
      inviteLink,
      invitedByEmail,
      appName: 'Propus Tour Manager',
    };
    const subject = mergeTemplate(template?.subject, placeholders).trim() || 'Einladung zum Admin-Team';
    const html = mergeTemplate(template?.html, placeholders, { htmlMode: true }).trim();
    const text = mergeTemplate(template?.text, placeholders).trim();
    const mailResult = await sendMailDirect({
      mailboxUpn: getGraphConfig().mailboxUpn,
      to: email,
      subject,
      htmlBody: html || null,
      textBody: text || null,
    });
    if (!mailResult.success) {
      return res.redirect('/admin/team?error=invite_mail_failed');
    }
    return res.redirect('/admin/team?invited=1');
  } catch (err) {
    return res.redirect('/admin/team?error=invite_failed');
  }
});

router.post('/team/:email/toggle', async (req, res) => {
  const email = String(req.params?.email || '').trim().toLowerCase();
  const action = String(req.body?.action || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.redirect('/admin/team?error=invalid_email');
  }
  if (!['enable', 'disable'].includes(action)) {
    return res.redirect('/admin/team?error=invalid_action');
  }
  const ok = await setAdminUserActive(email, action === 'enable');
  if (!ok) {
    return res.redirect('/admin/team?error=user_not_found');
  }
  return res.redirect('/admin/team?updated=1');
});

router.post('/team/invites/:id/revoke', async (req, res) => {
  const ok = await revokeInviteById(req.params.id);
  if (!ok) return res.redirect('/admin/team?error=invite_not_found');
  return res.redirect('/admin/team?revoked=1');
});

router.post('/team/users/:id/update', async (req, res) => {
  const userId = parseInt(String(req.params?.id || ''), 10);
  if (!Number.isFinite(userId)) return res.redirect('/admin/team?error=invalid_user');

  const email = String(req.body?.email || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim();
  const rawPassword = String(req.body?.password || '');
  const password = rawPassword && rawPassword !== '********' ? rawPassword : '';

  const result = await updateAdminUserById(userId, {
    email,
    name,
    password,
  });

  if (!result.ok) return res.redirect(`/admin/team?error=${encodeURIComponent(result.code || 'update_failed')}`);

  const currentEmail = String(req.session?.admin?.email || req.session?.adminEmail || '').trim().toLowerCase();
  const previousEmail = String(result.previousEmail || '').toLowerCase();
  const updatedEmail = String(result.email || '').toLowerCase();
  if (currentEmail && (currentEmail === previousEmail || currentEmail === updatedEmail)) {
    if (req.session?.admin) req.session.admin.email = result.email;
    if (req.session) req.session.adminEmail = result.email;
  }
  return res.redirect('/admin/team?edited=1');
});

router.post('/team/users/:id/delete', async (req, res) => {
  const userId = parseInt(String(req.params?.id || ''), 10);
  if (!Number.isFinite(userId)) return res.redirect('/admin/team?error=invalid_user');

  const result = await deleteAdminUserById(userId);
  if (!result.ok) return res.redirect(`/admin/team?error=${encodeURIComponent(result.code || 'delete_failed')}`);

  const currentEmail = String(req.session?.admin?.email || req.session?.adminEmail || '').trim().toLowerCase();
  if (currentEmail && currentEmail === String(result.email || '').toLowerCase()) {
    req.session.destroy(() => null);
    return res.redirect('/login');
  }
  return res.redirect('/admin/team?deleted=1');
});

router.get('/automations', async (req, res) => {
  const [automationSettings, templates] = await Promise.all([
    getAutomationSettings(),
    getEmailTemplates(),
  ]);
  res.render('admin/automations', {
    automationSettings,
    templates,
    saved: req.query.saved === '1',
    activePage: 'automations',
  });
});

router.post('/automations', async (req, res) => {
  const body = req.body || {};
  await saveAutomationSettings({
    expiringMailEnabled: !!body.expiringMailEnabled,
    expiringMailLeadDays: body.expiringMailLeadDays,
    expiringMailTemplateKey: body.expiringMailTemplateKey,
    expiringMailCooldownDays: body.expiringMailCooldownDays,
    expiringMailBatchLimit: body.expiringMailBatchLimit,
    expiringMailCreateActionLinks: !!body.expiringMailCreateActionLinks,
    expiryPolicyEnabled: !!body.expiryPolicyEnabled,
    expirySetPendingAfterDays: body.expirySetPendingAfterDays,
    expiryLockMatterportOnPending: !!body.expiryLockMatterportOnPending,
    expiryArchiveAfterDays: body.expiryArchiveAfterDays,
    paymentCheckEnabled: !!body.paymentCheckEnabled,
    paymentCheckBatchLimit: body.paymentCheckBatchLimit,
    matterportAutoLinkEnabled: !!body.matterportAutoLinkEnabled,
    matterportAutoLinkBatchLimit: body.matterportAutoLinkBatchLimit,
    matterportStatusSyncEnabled: !!body.matterportStatusSyncEnabled,
    matterportStatusSyncBatchLimit: body.matterportStatusSyncBatchLimit,
  });
  res.redirect('/admin/automations?saved=1');
});

/** Globaler KI-Chat aus der Sidebar (alle Admin-Seiten) */
router.post('/chat-assistant', async (req, res) => {
  const userMessage = String(req.body?.message || '').trim();
  if (!userMessage) {
    return res.status(400).json({ error: 'Keine Frage angegeben' });
  }

  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-12) : [];
  const requestedModel = String(req.body?.model || '').trim();
  const ALLOWED_MODELS = getAllowedChatModels();
  const aiConfig = getAiConfig();
  const chosenModel = ALLOWED_MODELS.includes(requestedModel)
    ? requestedModel
    : (aiConfig.model || 'gpt-5.4');
  const resolvedContext = await resolveSidebarChatContext({
    path: req.body?.path || req.originalUrl || '/admin',
  });
  const intent = classifyReadIntent(userMessage, resolvedContext);

  if (intent.mode === 'read') {
    const answer = await buildDirectReadResponse(intent, resolvedContext);
    return res.json({ answer, model: 'direct-read' });
  }

  if (intent.mode === 'write') {
    const actionProposal = await resolveActionTarget(intent.actionType, resolvedContext, intent.targets);
    if (!actionProposal) {
      return res.status(400).json({
        error: 'Ich habe die Aktion erkannt, aber kein eindeutiges Zielobjekt. Bitte nenne z. B. `tour 123` oder `vorschlag <id>`.',
      });
    }
    const previewContext = actionProposal.tourId
      ? { ...resolvedContext, tour: await loadTourById(actionProposal.tourId), effectiveTourId: actionProposal.tourId }
      : resolvedContext;
    const confirmationText = buildActionPreview(actionProposal, previewContext);
    const actionDefinition = getActionDefinition(actionProposal.type);
    const riskDefinition = getRiskDefinition(actionDefinition?.riskLevel);
    if (req.session) {
      req.session.pendingAdminChatAction = {
        ...actionProposal,
        createdAt: Date.now(),
      };
    }
    return res.json({
      answer: confirmationText || 'Ich kann diese Aktion ausführen. Soll ich das machen?',
      model: chosenModel,
      proposedAction: {
        type: actionProposal.type,
        labelShort: actionDefinition?.label || actionProposal.type,
        label: confirmationText || actionProposal.type,
        riskLevel: actionDefinition?.riskLevel || null,
        riskLabel: riskDefinition?.label || null,
        needsConfirmation: actionDefinition?.needsConfirmation !== false,
      },
      needsConfirmation: actionDefinition?.needsConfirmation !== false,
    });
  }

  const systemContext = await buildSidebarChatContext({
    activePage: req.body?.activePage,
    path: req.body?.path || req.originalUrl || '/admin',
    userMessage,
  });

  const { answer, error } = await chatWithAi({
    systemContext,
    history,
    userMessage,
    model: chosenModel,
  });

  if (error) {
    return res.status(500).json({ error });
  }

  return res.json({ answer, model: chosenModel });
});

router.post('/chat-assistant/confirm', async (req, res) => {
  const pendingAction = req.session?.pendingAdminChatAction || null;
  if (!pendingAction) {
    return res.status(400).json({ error: 'Keine bestaetigte Aktion vorhanden' });
  }
  if (pendingAction.createdAt && (Date.now() - pendingAction.createdAt) > (10 * 60 * 1000)) {
    if (req.session) delete req.session.pendingAdminChatAction;
    return res.status(400).json({ error: 'Die Aktionsfreigabe ist abgelaufen' });
  }
  try {
    const result = await executeSidebarAction(pendingAction, req.session?.admin?.email || null);
    if (req.session) delete req.session.pendingAdminChatAction;
    return res.json({ ok: true, answer: result.message || 'Aktion ausgefuehrt.' });
  } catch (err) {
    if (req.session) delete req.session.pendingAdminChatAction;
    return res.status(400).json({ error: err.message });
  }
});

router.post('/chat-assistant/cancel', async (req, res) => {
  if (req.session) delete req.session.pendingAdminChatAction;
  return res.json({ ok: true, answer: 'Aktion verworfen.' });
});

router.post('/tours/:id/archive-matterport', async (req, res) => {
  try {
    const tour = await loadTourById(req.params.id);
    if (!tour) {
      return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });
    }
    const spaceId = tour.canonical_matterport_space_id;
    if (!spaceId) {
      return res.status(400).json({ ok: false, error: 'Tour hat keine Matterport-Verknüpfung' });
    }
    const result = await matterport.archiveSpace(spaceId);
    if (!result.success) {
      return res.status(400).json({ ok: false, error: result.error || 'Archivierung fehlgeschlagen' });
    }
    await pool.query(
      `UPDATE tour_manager.tours
       SET status = 'ARCHIVED',
           matterport_state = 'inactive',
           updated_at = NOW()
       WHERE id = $1`,
      [tour.id]
    );
    await logAction(tour.id, 'admin', req.session?.admin?.email || null, 'ARCHIVE_SPACE', {
      source: 'decline_workflow',
      matterport_space_id: spaceId,
    });
    return res.json({ ok: true, message: 'Matterport-Tour wurde archiviert.' });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/tours/:id/exxas-cancel-subscription', async (req, res) => {
  try {
    const tour = await loadTourById(req.params.id);
    if (!tour) {
      return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });
    }
    const contractId = tour.canonical_exxas_contract_id;
    if (!contractId) {
      return res.status(400).json({ ok: false, error: 'Tour hat keine Exxas-Abo-ID' });
    }
    const result = await exxas.cancelSubscription(contractId);
    if (!result.success) {
      return res.status(400).json({ ok: false, error: result.error, attempts: result.attempts || [] });
    }
    await logAction(tour.id, 'admin', req.session?.admin?.email || null, 'EXXAS_CANCEL_SUBSCRIPTION', {
      source: 'decline_workflow',
      contract_id: contractId,
      endpoint: result.endpoint || null,
      method: result.method || null,
    });
    return res.json({ ok: true, message: 'Exxas-Abo wurde deaktiviert.', endpoint: result.endpoint || null });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/tours/:id/exxas-deactivate-customer', async (req, res) => {
  try {
    const tour = await loadTourById(req.params.id);
    if (!tour) {
      return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });
    }
    const customerRef = String(tour.kunde_ref || '').trim();
    if (!customerRef) {
      return res.status(400).json({ ok: false, error: 'Tour hat keine Exxas-Kunden-ID' });
    }
    const resolvedCustomer = await exxas.resolveCustomerIdentity(customerRef, {
      customerName: tour.customer_name,
      customerEmail: tour.customer_email,
    });
    if (!resolvedCustomer?.customer?.id) {
      return res.status(400).json({ ok: false, error: resolvedCustomer?.error || 'Exxas-Kunde konnte nicht sicher aufgelöst werden' });
    }
    const customerId = resolvedCustomer.customer.id;
    const result = await exxas.deactivateCustomer(customerId);
    if (!result.success) {
      return res.status(400).json({ ok: false, error: result.error, attempts: result.attempts || [] });
    }
    await logAction(tour.id, 'admin', req.session?.admin?.email || null, 'EXXAS_DEACTIVATE_CUSTOMER', {
      source: 'decline_workflow',
      customer_id: customerId,
      endpoint: result.endpoint || null,
      method: result.method || null,
    });
    return res.json({ ok: true, message: 'Exxas-Kundenanlage wurde deaktiviert.', endpoint: result.endpoint || null });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/tours/:id/exxas-cancel-invoice', async (req, res) => {
  try {
    const tour = await loadTourById(req.params.id);
    if (!tour) {
      return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });
    }
    const invoiceLookup = await pool.query(
      `SELECT *
       FROM tour_manager.exxas_invoices
       WHERE (tour_id = $1 OR ($2::text IS NOT NULL AND ref_vertrag = $2::text))
         AND ($3::text IS NULL OR exxas_document_id = $3::text OR nummer = $3::text)
       ORDER BY CASE WHEN exxas_status = 'bz' THEN 1 ELSE 0 END ASC,
                COALESCE(dok_datum, zahlungstermin) DESC NULLS LAST,
                synced_at DESC NULLS LAST
       LIMIT 1`,
      [
        tour.id,
        tour.canonical_exxas_contract_id || null,
        String(req.body?.invoiceId || req.body?.exxasDocumentId || '').trim() || null,
      ]
    );
    const invoice = invoiceLookup.rows[0] || null;
    if (!invoice) {
      return res.status(400).json({ ok: false, error: 'Keine passende Exxas-Rechnung gefunden' });
    }
    const exxasInvoiceId = invoice.exxas_document_id || invoice.nummer || null;
    if (!exxasInvoiceId) {
      return res.status(400).json({ ok: false, error: 'Exxas-Rechnungsreferenz fehlt' });
    }
    const result = await exxas.cancelInvoice(exxasInvoiceId);
    if (!result.success) {
      return res.status(400).json({ ok: false, error: result.error, attempts: result.attempts || [] });
    }
    await logAction(tour.id, 'admin', req.session?.admin?.email || null, 'EXXAS_CANCEL_INVOICE', {
      source: 'decline_workflow',
      invoice_id: exxasInvoiceId,
      invoice_number: invoice.nummer || null,
      endpoint: result.endpoint || null,
      method: result.method || null,
    });
    return res.json({
      ok: true,
      message: `Exxas-Rechnung ${invoice.nummer || exxasInvoiceId} wurde storniert.`,
      endpoint: result.endpoint || null,
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

const SORT_COLUMNS = {
  customer: 'COALESCE(t.customer_name, t.kunde_ref, \'\'), COALESCE(t.object_label, t.bezeichnung, \'\')',
  ablaufdatum: 'COALESCE(t.term_end_date, t.ablaufdatum)',
  matterport_created: 'COALESCE(t.matterport_created_at, t.created_at)',
  days: '(COALESCE(t.term_end_date, t.ablaufdatum) - CURRENT_DATE)::int',
  status: 't.status',
};

router.get('/tours', async (req, res) => {
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_is_own BOOLEAN');
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS customer_verified BOOLEAN NOT NULL DEFAULT FALSE');
  const { status, expiringSoon, awaitingPayment, unlinkedOnly, fremdeOnly, activeRunning, unverifiedOnly, verifiedOnly, invoiceOpenOnly, invoiceOverdueOnly, noCustomerOnly, sort, order, q: search } = req.query;
  const pageSize = 10;
  const requestedPage = Math.max(parseInt(req.query.page, 10) || 1, 1);
  let baseQ = `FROM tour_manager.tours t WHERE 1=1`;
  const filterParams = [];
  let i = 1;
  if (activeRunning === '1') {
    baseQ += ` AND t.status IN ('ACTIVE','EXPIRING_SOON')`;
  } else if (status) {
    baseQ += ` AND t.status = $${i++}`;
    filterParams.push(status);
  }
  if (expiringSoon === '1') {
    baseQ += ` AND COALESCE(t.term_end_date, t.ablaufdatum) BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`;
  }
  if (awaitingPayment === '1') {
    baseQ += ` AND t.status = 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT'`;
  }
  if (invoiceOpenOnly === '1') {
    baseQ += ` AND EXISTS (
      SELECT 1
      FROM tour_manager.exxas_invoices e
      WHERE (e.tour_id = t.id OR (
        TRIM(COALESCE(t.exxas_subscription_id::text, t.exxas_abo_id::text, '')) != ''
        AND TRIM(COALESCE(e.ref_vertrag, '')) = TRIM(COALESCE(t.exxas_subscription_id::text, t.exxas_abo_id::text))
      ))
      AND e.exxas_status != 'bz'
    )`;
  }
  if (invoiceOverdueOnly === '1') {
    baseQ += ` AND EXISTS (
      SELECT 1
      FROM tour_manager.exxas_invoices e
      WHERE (e.tour_id = t.id OR (
        TRIM(COALESCE(t.exxas_subscription_id::text, t.exxas_abo_id::text, '')) != ''
        AND TRIM(COALESCE(e.ref_vertrag, '')) = TRIM(COALESCE(t.exxas_subscription_id::text, t.exxas_abo_id::text))
      ))
      AND e.exxas_status != 'bz'
      AND e.zahlungstermin < CURRENT_DATE
    )`;
  }
  if (unlinkedOnly === '1') {
    baseQ += ` AND t.status IN ('ACTIVE','EXPIRING_SOON') AND (t.matterport_space_id IS NULL OR TRIM(t.matterport_space_id) = '') AND (t.tour_url IS NULL OR t.tour_url = '' OR t.tour_url !~ '[?&]m=[a-zA-Z0-9_-]+')`;
  }
  if (fremdeOnly === '1') {
    baseQ += ` AND t.matterport_is_own = false`;
  }
  if (unverifiedOnly === '1') {
    baseQ += ` AND t.customer_verified = FALSE`;
  }
  if (verifiedOnly === '1') {
    baseQ += ` AND t.customer_verified = TRUE`;
  }
  if (noCustomerOnly === '1') {
    baseQ += ` AND (t.customer_email IS NULL OR TRIM(t.customer_email) = '')
               AND (t.customer_name IS NULL OR TRIM(t.customer_name) = '')
               AND (t.customer_contact IS NULL OR TRIM(t.customer_contact) = '')
               AND (t.kunde_ref IS NULL OR TRIM(t.kunde_ref) = '')`;
  }
  const searchQuery = String(search || '').trim();
  if (searchQuery) {
    const needle = `%${searchQuery.toLowerCase()}%`;
    baseQ += ` AND (
      LOWER(COALESCE(t.customer_name, '')) LIKE $${i}
      OR LOWER(COALESCE(t.kunde_ref, '')) LIKE $${i}
      OR LOWER(COALESCE(t.customer_email, '')) LIKE $${i}
      OR LOWER(COALESCE(t.customer_contact, '')) LIKE $${i}
      OR LOWER(COALESCE(t.object_label, '')) LIKE $${i}
      OR LOWER(COALESCE(t.bezeichnung, '')) LIKE $${i}
      OR LOWER(COALESCE(t.exxas_subscription_id::text, t.exxas_abo_id::text, '')) LIKE $${i}
      OR LOWER(COALESCE(t.matterport_space_id, '')) LIKE $${i}
    )`;
    filterParams.push(needle);
    i += 1;
  }
  const totalCountRes = await pool.query(`SELECT COUNT(*)::int AS cnt ${baseQ}`, filterParams);
  const totalItems = totalCountRes.rows[0]?.cnt || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const sortCol = SORT_COLUMNS[sort] ? sort : 'ablaufdatum';
  const sortDir = (order === 'desc') ? 'DESC' : 'ASC';
  const orderExpr = SORT_COLUMNS[sortCol] || SORT_COLUMNS.ablaufdatum;
  const verifiedLast = (unverifiedOnly !== '1' && verifiedOnly !== '1') ? 'CASE WHEN t.customer_verified = TRUE THEN 1 ELSE 0 END ASC, ' : '';
  let q = `SELECT t.*,
    (COALESCE(t.term_end_date, t.ablaufdatum) - CURRENT_DATE)::int as days_until_expiry
    ${baseQ}
    ORDER BY ${verifiedLast}${orderExpr} ${sortDir} NULLS LAST`;
  const params = [...filterParams];
  q += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(pageSize, offset);
  const r = await pool.query(q, params);
  const normalizedTourRows = r.rows.map(normalizeTourRow);
  const [
    counts,
    expiring,
    unlinked,
    fremde,
    noCustomer,
    invOffen,
    invBezahlt,
    invUeberfaellig,
    matterportModels,
  ] = await Promise.all([
    pool.query(`
      SELECT status, COUNT(*)::int as cnt FROM tour_manager.tours
      GROUP BY status
    `),
    pool.query(`
      SELECT COUNT(*)::int as cnt FROM tour_manager.tours t
      WHERE COALESCE(t.term_end_date, t.ablaufdatum) BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
    `),
    pool.query(`
      SELECT COUNT(*)::int as cnt FROM tour_manager.tours t
      WHERE t.status IN ('ACTIVE','EXPIRING_SOON')
        AND (t.matterport_space_id IS NULL OR TRIM(t.matterport_space_id) = '')
        AND (t.tour_url IS NULL OR t.tour_url = '' OR t.tour_url !~ '[?&]m=[a-zA-Z0-9_-]+')
    `),
    pool.query(`
      SELECT COUNT(*)::int as cnt FROM tour_manager.tours t
      WHERE t.matterport_is_own = false
    `),
    pool.query(`
      SELECT COUNT(*)::int as cnt FROM tour_manager.tours t
      WHERE (t.customer_email IS NULL OR TRIM(t.customer_email) = '')
        AND (t.customer_name IS NULL OR TRIM(t.customer_name) = '')
        AND (t.customer_contact IS NULL OR TRIM(t.customer_contact) = '')
        AND (t.kunde_ref IS NULL OR TRIM(t.kunde_ref) = '')
    `),
    pool.query(`
      SELECT COUNT(*)::int as cnt
      FROM tour_manager.exxas_invoices
      WHERE exxas_status != 'bz'
        AND (zahlungstermin IS NULL OR zahlungstermin >= CURRENT_DATE)
    `),
    pool.query(`
      SELECT COUNT(*)::int as cnt FROM tour_manager.exxas_invoices WHERE exxas_status = 'bz'
    `),
    pool.query(`
      SELECT COUNT(*)::int as cnt FROM tour_manager.exxas_invoices
      WHERE exxas_status != 'bz' AND zahlungstermin < CURRENT_DATE
    `),
    matterport.listModels(),
  ]);
  const stats = Object.fromEntries(counts.rows.map(c => [c.status, c.cnt]));
  stats.expiringSoon = expiring.rows[0]?.cnt || 0;
  stats.unlinkedActive = unlinked.rows[0]?.cnt || 0;
  stats.fremdeTouren = fremde.rows[0]?.cnt || 0;
  stats.total = counts.rows.reduce((s, c) => s + c.cnt, 0);
  // Dashboard soll die echten Matterport-Spaces zeigen, nicht nur Exxas-Vertragsstatus.
  const mpModels = matterportModels?.results || [];
  const hasMatterportStats = !matterportModels?.error && mpModels.length > 0;
  const mpStateById = new Map(mpModels.map((m) => [m.id, m.state || null]));
  const tourIds = normalizedTourRows.map((tour) => tour.id);
  const contractIds = normalizedTourRows.map((tour) => tour.canonical_exxas_contract_id).filter(Boolean);
  const [invoiceMatches, outgoingRenewalStats, incomingMailStats] = await Promise.all([
    tourIds.length
      ? pool.query(
          `SELECT exxas_document_id, tour_id, ref_vertrag, exxas_status, zahlungstermin, dok_datum, synced_at, nummer
           FROM tour_manager.exxas_invoices
           WHERE tour_id = ANY($1::int[])
              OR ref_vertrag = ANY($2::text[])`,
          [tourIds, contractIds]
        ).catch(() => ({ rows: [] }))
      : { rows: [] },
    tourIds.length
      ? pool.query(
          `SELECT tour_id, COUNT(*)::int AS cnt
           FROM tour_manager.outgoing_emails
           WHERE template_key = 'renewal_request'
             AND tour_id = ANY($1::int[])
           GROUP BY tour_id`,
          [tourIds]
        ).catch(() => ({ rows: [] }))
      : { rows: [] },
    tourIds.length
      ? pool.query(
          `SELECT matched_tour_id AS tour_id, COUNT(*)::int AS cnt
           FROM tour_manager.incoming_emails
           WHERE matched_tour_id = ANY($1::int[])
           GROUP BY matched_tour_id`,
          [tourIds]
        ).catch(() => ({ rows: [] }))
      : { rows: [] },
  ]);
  const outgoingRenewalCountByTourId = new Map(outgoingRenewalStats.rows.map((row) => [row.tour_id, row.cnt]));
  const incomingMailCountByTourId = new Map(incomingMailStats.rows.map((row) => [row.tour_id, row.cnt]));
  const invoiceRowsByTourId = new Map();
  const dedupeInvoiceKeyByTourId = new Map();
  for (const tour of normalizedTourRows) {
    invoiceRowsByTourId.set(tour.id, []);
    dedupeInvoiceKeyByTourId.set(tour.id, new Set());
  }
  for (const row of invoiceMatches.rows) {
    for (const tour of normalizedTourRows) {
      if (!(row.tour_id === tour.id || (tour.canonical_exxas_contract_id && row.ref_vertrag === String(tour.canonical_exxas_contract_id)))) {
        continue;
      }
      const dedupeKey = `${row.exxas_document_id || row.nummer || ''}`;
      const seen = dedupeInvoiceKeyByTourId.get(tour.id);
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      invoiceRowsByTourId.get(tour.id).push(row);
    }
  }
  const today = new Date();
  const toursWithLiveMatterportState = normalizedTourRows.map((tour) => {
    const mpId = tour.canonical_matterport_space_id;
    let liveMatterportState = tour.matterport_state || null;
    if (mpId && mpStateById.has(mpId)) {
      liveMatterportState = mpStateById.get(mpId);
    } else if (mpId && !mpStateById.has(mpId) && tour.matterport_is_own !== false) {
      liveMatterportState = 'unknown';
    }
    const relatedInvoices = invoiceRowsByTourId.get(tour.id) || [];
    const exxasPaid = relatedInvoices.filter((row) => row.exxas_status === 'bz');
    const exxasOpen = relatedInvoices.filter((row) => row.exxas_status !== 'bz');
    const exxasOverdue = exxasOpen.filter((row) => row.zahlungstermin && new Date(row.zahlungstermin) < today);
    const hasCustomerConnection = !!(tour.kunde_ref || tour.customer_name || tour.customer_email || tour.customer_contact);
    const hasRenewalMail = !!(outgoingRenewalCountByTourId.get(tour.id) || tour.last_email_sent_at);
    const hasCustomerReply = !!((incomingMailCountByTourId.get(tour.id) || 0) > 0 || tour.customer_intent || tour.customer_transfer_requested || tour.customer_billing_attention);
    const expiryDate = tour.canonical_term_end_date || tour.term_end_date || tour.ablaufdatum;
    const expiryIn30Days = expiryDate
      ? (new Date(expiryDate) >= new Date(today.getFullYear(), today.getMonth(), today.getDate())
        && new Date(expiryDate) <= new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30))
      : false;
    const needsRenewalMail = ['ACTIVE', 'EXPIRING_SOON'].includes(tour.status) && expiryIn30Days && !hasRenewalMail;
    const waitingCustomerReply = tour.status === 'AWAITING_CUSTOMER_DECISION' && hasRenewalMail && !hasCustomerReply;
    const awaitingPaymentWithoutInvoice = tour.status === 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT' && exxasOpen.length === 0 && exxasPaid.length === 0;
    let invoiceStatusTone = 'none';
    let invoiceStatusLabel = 'Keine Rechnung';
    if (exxasOpen.length > 0 || exxasPaid.length > 0) {
      if (exxasOverdue.length > 0) {
        invoiceStatusTone = 'danger';
        invoiceStatusLabel = 'Nicht bezahlt';
      } else if (exxasOpen.length > 0) {
        invoiceStatusTone = 'warning';
        invoiceStatusLabel = 'Rechnung offen';
      } else {
        invoiceStatusTone = 'success';
        invoiceStatusLabel = 'Bezahlt';
      }
    }

    return {
      ...tour,
      live_matterport_state: liveMatterportState,
      displayed_status: getDisplayedTourStatus(tour, liveMatterportState).code,
      displayed_status_label: getDisplayedTourStatus(tour, liveMatterportState).label,
      displayed_status_note: getDisplayedTourStatus(tour, liveMatterportState).note,
      exxas_paid_count: exxasPaid.length,
      exxas_open_count: exxasOpen.length,
      exxas_overdue_count: exxasOverdue.length,
      has_customer_connection: hasCustomerConnection,
      has_renewal_mail: hasRenewalMail,
      incoming_mail_count: incomingMailCountByTourId.get(tour.id) || 0,
      needs_renewal_mail: needsRenewalMail,
      waiting_customer_reply: waitingCustomerReply,
      awaiting_payment_without_invoice: awaitingPaymentWithoutInvoice,
      invoice_status_tone: invoiceStatusTone,
      invoice_status_label: invoiceStatusLabel,
    };
  });
  stats.noCustomer = noCustomer.rows[0]?.cnt || 0;
  stats.activeRunning = hasMatterportStats
    ? mpModels.filter((m) => m.state === 'active').length
    : ((stats.ACTIVE || 0) + (stats.EXPIRING_SOON || 0));
  stats.archivedMatterport = hasMatterportStats
    ? mpModels.filter((m) => m.state === 'inactive').length
    : (stats.ARCHIVED || 0);
  stats.invoicesOffen = invOffen.rows[0]?.cnt || 0;
  stats.invoicesBezahlt = invBezahlt.rows[0]?.cnt || 0;
  stats.invoicesUeberfaellig = invUeberfaellig.rows[0]?.cnt || 0;
  stats.invoicesOpenTotal = stats.invoicesOffen + stats.invoicesUeberfaellig;
  const dashboardWidgets = await getDashboardWidgets();
  res.render('admin/tours-list', {
    tours: toursWithLiveMatterportState,
    filters: { status, expiringSoon, awaitingPayment, unlinkedOnly, fremdeOnly, activeRunning, unverifiedOnly, verifiedOnly, invoiceOpenOnly, invoiceOverdueOnly, noCustomerOnly, q: searchQuery },
    sort: sortCol,
    order: order === 'desc' ? 'desc' : 'asc',
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
    },
    stats,
    dashboardWidgets,
    activePage: 'tours',
  });
});

router.post('/tours/:id/set-tour-url', async (req, res) => {
  const { id } = req.params;
  let tour_url = (req.body.tour_url || '').trim() || null;
  if (tour_url && !tour_url.toLowerCase().includes('my.matterport.com')) {
    tour_url = null;
  }
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_is_own BOOLEAN');
  await pool.query(
    `UPDATE tour_manager.tours SET tour_url = $1, matterport_is_own = NULL, updated_at = NOW() WHERE id = $2`,
    [tour_url, id]
  );
  res.redirect(`/admin/tours/${id}?tourUrlSaved=1`);
});

router.post('/tours/:id/set-name', async (req, res) => {
  const { id } = req.params;
  const name = String(req.body?.name || '').trim();
  const syncMatterport = req.body?.syncMatterport === '1';
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [id]);
  if (!tourResult.rows[0]) {
    return res.status(404).send('Tour nicht gefunden');
  }
  const bezeichnungVal = name || null;
  await pool.query(
    `UPDATE tour_manager.tours SET bezeichnung = $1, object_label = $1, updated_at = NOW() WHERE id = $2`,
    [bezeichnungVal, id]
  );

  let nameSyncFailed = false;
  if (syncMatterport && name) {
    const tourRow = normalizeTourRow(tourResult.rows[0]);
    const spaceId = tourRow.canonical_matterport_space_id || tourRow.matterport_space_id || null;
    if (spaceId) {
      const result = await matterport.patchModelName(spaceId, name);
      if (!result.success) nameSyncFailed = true;
    } else {
      nameSyncFailed = true;
    }
  }

  const qs = new URLSearchParams();
  qs.set('nameSaved', '1');
  if (nameSyncFailed) qs.set('nameSyncFailed', '1');
  return res.redirect(`/admin/tours/${id}?${qs.toString()}`);
});

router.post('/tours/:id/set-start-sweep', async (req, res) => {
  const { id } = req.params;
  const sweep = String(req.body?.start_sweep || '').trim() || null;
  const exists = await pool.query('SELECT id FROM tour_manager.tours WHERE id = $1 LIMIT 1', [id]);
  if (!exists.rows[0]) {
    return res.status(404).send('Tour nicht gefunden');
  }
  await pool.query(
    `UPDATE tour_manager.tours SET matterport_start_sweep = $1, updated_at = NOW() WHERE id = $2`,
    [sweep, id]
  );
  return res.redirect(`/admin/tours/${id}?startSweepSaved=1`);
});

router.post('/tours/:id/set-verified', async (req, res) => {
  const { id } = req.params;
  const verified = req.body.verified === '1';
  await pool.query(
    `UPDATE tour_manager.tours SET customer_verified = $1, updated_at = NOW() WHERE id = $2`,
    [verified, id]
  );
  res.redirect(`/admin/tours/${id}?verifiedSaved=1`);
});

router.post('/tours/:id/visibility', async (req, res) => {
  const { id } = req.params;
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [id]);
  const tourRow = normalizeTourRow(tourResult.rows[0] || null);
  if (!tourRow) {
    return res.status(404).send('Tour nicht gefunden');
  }

  const spaceId = tourRow.canonical_matterport_space_id || tourRow.matterport_space_id || null;
  if (!spaceId) {
    return res.redirect(`/admin/tours/${id}?visibilityError=no_matterport`);
  }

  const visibility = String(req.body?.visibility || '').toUpperCase();
  if (!ALLOWED_VISIBILITIES.includes(visibility)) {
    return res.redirect(`/admin/tours/${id}?visibilityError=invalid_visibility`);
  }

  const password = visibility === 'PASSWORD'
    ? (String(req.body?.password || '').trim() || null)
    : undefined;

  const result = await matterport.setVisibility(spaceId, visibility, password);
  if (!result.success) {
    console.warn('admin setVisibility error:', result.error);
    return res.redirect(`/admin/tours/${id}?visibilityError=visibility_failed`);
  }

  await logAction(id, 'admin', req.session?.admin?.username || 'admin', 'ADMIN_VISIBILITY', {
    visibility,
    hasPassword: !!password,
    spaceId,
  });

  return res.redirect(`/admin/tours/${id}?visibilitySaved=1`);
});

/** Rechnungsübersicht: interne Verlängerungsrechnungen */
router.get('/invoices', async (req, res) => {
  const { status } = req.query;
  return handleRenewalInvoices(req, res, status);
});

async function handleRenewalInvoices(req, res, status) {
  let q = `
    SELECT i.*,
      COALESCE(t.object_label, t.bezeichnung) AS tour_object_label,
      COALESCE(t.customer_name, t.kunde_ref) AS tour_customer_name,
      COALESCE(t.exxas_subscription_id, t.exxas_abo_id) AS tour_contract_id,
      t.last_email_sent_at
    FROM tour_manager.renewal_invoices i
    JOIN tour_manager.tours t ON t.id = i.tour_id
    WHERE 1=1
  `;
  const params = [];
  if (status === 'offen') {
    q += ` AND i.invoice_status IN ('sent','overdue')`;
  } else if (status === 'bezahlt') {
    q += ` AND i.invoice_status = 'paid'`;
  } else if (status === 'ueberfaellig') {
    q += ` AND i.invoice_status = 'overdue'`;
  } else if (status === 'entwurf') {
    q += ` AND i.invoice_status = 'draft'`;
  }
  q += ` ORDER BY COALESCE(i.paid_at, i.sent_at, i.created_at) DESC NULLS LAST, i.created_at DESC`;
  const invoices = await pool.query(q, params);
  const stats = await pool.query(`
    SELECT invoice_status, COUNT(*)::int as cnt FROM tour_manager.renewal_invoices GROUP BY invoice_status
  `);
  const statusCounts = Object.fromEntries(stats.rows.map(r => [r.invoice_status, r.cnt]));
  res.render('admin/invoices', {
    invoices: invoices.rows,
    filters: { status, source: 'renewal' },
    stats: {
      offen: (statusCounts.sent || 0) + (statusCounts.overdue || 0),
      ueberfaellig: statusCounts.overdue || 0,
      bezahlt: statusCounts.paid || 0,
      entwurf: statusCounts.draft || 0,
    },
    source: 'renewal',
    activePage: 'invoices',
  });
}

router.get('/bank-import', async (req, res) => {
  await ensureBankImportSchema();
  const runsRes = await pool.query(
    `SELECT *
     FROM tour_manager.bank_import_runs
     ORDER BY created_at DESC
     LIMIT 30`
  );
  const reviewRes = await pool.query(
    `SELECT t.*,
            i.invoice_number,
            i.amount_chf AS invoice_amount_chf,
            i.invoice_status,
            tr.customer_email,
            COALESCE(tr.object_label, tr.bezeichnung) AS tour_label
     FROM tour_manager.bank_import_transactions t
     LEFT JOIN tour_manager.renewal_invoices i ON i.id = t.matched_invoice_id
     LEFT JOIN tour_manager.tours tr ON tr.id = COALESCE(t.matched_tour_id, i.tour_id)
     WHERE t.match_status = 'review'
     ORDER BY t.created_at DESC
     LIMIT 120`
  );
  res.render('admin/bank-import', {
    runs: runsRes.rows,
    reviewRows: reviewRes.rows,
    uploaded: req.query.uploaded === '1',
    activePage: 'invoices',
  });
});

router.post('/bank-import/upload', bankDataUpload.single('bankFile'), async (req, res) => {
  await ensureBankImportSchema();
  if (!req.file?.buffer) {
    return res.redirect('/admin/bank-import?error=' + encodeURIComponent('Keine Datei hochgeladen.'));
  }
  const sourceFormat = String(req.file.originalname || '').toLowerCase().endsWith('.csv') ? 'csv' : 'camt054';
  let transactions = [];
  try {
    const text = req.file.buffer.toString('utf8');
    transactions = sourceFormat === 'csv' ? bankImport.parseCsv(text) : bankImport.parseCamt054(text);
  } catch (err) {
    return res.redirect('/admin/bank-import?error=' + encodeURIComponent(`Datei konnte nicht gelesen werden: ${err.message}`));
  }
  if (!transactions.length) {
    return res.redirect('/admin/bank-import?error=' + encodeURIComponent('Keine Buchungen in der Datei gefunden.'));
  }

  const actorEmail = req.session?.admin?.email || req.session?.admin?.username || 'admin';
  const runInsert = await pool.query(
    `INSERT INTO tour_manager.bank_import_runs (created_by, source_format, file_name)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [actorEmail, sourceFormat, req.file.originalname || null]
  );
  const runId = runInsert.rows[0].id;

  const invoiceRows = await pool.query(
    `SELECT id, tour_id, invoice_number, amount_chf, invoice_status, subscription_end_at
     FROM tour_manager.renewal_invoices
     WHERE invoice_status IN ('sent','overdue','draft','paid')
     ORDER BY created_at DESC`
  );
  const invoiceIndex = bankImport.buildOpenInvoiceIndex(invoiceRows.rows);

  let exactRows = 0;
  let reviewRows = 0;
  let noneRows = 0;
  for (const tx of transactions) {
    const match = bankImport.matchTransaction(tx, invoiceIndex);
    if (match.matchStatus === 'exact') exactRows += 1;
    else if (match.matchStatus === 'review') reviewRows += 1;
    else noneRows += 1;

    const note = `Bankimport #${runId}: ${tx.referenceRaw || '-'} / ${tx.amount ?? '-'}`;
    let finalStatus = match.matchStatus;
    if (match.matchStatus === 'exact' && match.invoice?.id) {
      const ok = await applyImportedPayment(match.invoice.id, actorEmail, {
        bookingDate: tx.bookingDate,
        note,
      });
      if (!ok) finalStatus = 'review';
    }

    await pool.query(
      `INSERT INTO tour_manager.bank_import_transactions (
        run_id, booking_date, value_date, amount_chf, currency,
        reference_raw, reference_digits, debtor_name, purpose,
        match_status, confidence, match_reason, matched_invoice_id, matched_tour_id, raw_json
      ) VALUES (
        $1, $2::date, $3::date, $4::numeric, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13::uuid, $14, $15::jsonb
      )`,
      [
        runId,
        bankImport.toIsoDate(tx.bookingDate),
        bankImport.toIsoDate(tx.valueDate),
        tx.amount ?? null,
        tx.currency || 'CHF',
        tx.referenceRaw || null,
        bankImport.digitsOnly(tx.referenceRaw),
        tx.debtorName || null,
        tx.purpose || null,
        finalStatus,
        match.confidence,
        match.reason,
        match.invoice?.id || null,
        match.invoice?.tourId || null,
        JSON.stringify(tx.raw || {}),
      ]
    );
  }

  await pool.query(
    `UPDATE tour_manager.bank_import_runs
     SET total_rows = $2,
         exact_rows = $3,
         review_rows = $4,
         none_rows = $5
     WHERE id = $1`,
    [runId, transactions.length, exactRows, reviewRows, noneRows]
  );

  return res.redirect('/admin/bank-import?uploaded=1');
});

router.post('/bank-import/transactions/:id/confirm', async (req, res) => {
  await ensureBankImportSchema();
  const txId = parseInt(String(req.params.id || ''), 10);
  if (!Number.isFinite(txId)) return res.redirect('/admin/bank-import?error=' + encodeURIComponent('Ungültige Transaktion.'));
  const invoiceId = String(req.body?.invoiceId || '').trim();
  if (!invoiceId) return res.redirect('/admin/bank-import?error=' + encodeURIComponent('Rechnung fehlt.'));

  const actorEmail = req.session?.admin?.email || req.session?.admin?.username || 'admin';
  const txRes = await pool.query(
    `SELECT * FROM tour_manager.bank_import_transactions WHERE id = $1 LIMIT 1`,
    [txId]
  );
  const tx = txRes.rows[0];
  if (!tx) return res.redirect('/admin/bank-import?error=' + encodeURIComponent('Transaktion nicht gefunden.'));
  await applyImportedPayment(invoiceId, actorEmail, {
    bookingDate: tx.booking_date,
    note: `Bankimport #${tx.run_id}: ${tx.reference_raw || '-'}`,
  });
  await pool.query(
    `UPDATE tour_manager.bank_import_transactions
     SET match_status = 'exact',
         matched_invoice_id = $2::uuid,
         match_reason = COALESCE(match_reason, '') || ' | manuell bestätigt',
         confidence = GREATEST(confidence, 95)
     WHERE id = $1`,
    [txId, invoiceId]
  );
  return res.redirect('/admin/bank-import');
});

router.post('/bank-import/transactions/:id/ignore', async (req, res) => {
  await ensureBankImportSchema();
  const txId = parseInt(String(req.params.id || ''), 10);
  if (!Number.isFinite(txId)) return res.redirect('/admin/bank-import?error=' + encodeURIComponent('Ungültige Transaktion.'));
  await pool.query(
    `UPDATE tour_manager.bank_import_transactions
     SET match_status = 'ignored',
         match_reason = COALESCE(match_reason, '') || ' | ignoriert'
     WHERE id = $1`,
    [txId]
  );
  return res.redirect('/admin/bank-import');
});

router.post('/tours/:id/invoices/create-manual', async (req, res) => {
  await ensureSuggestionSchema();
  const tourId = parseInt(req.params.id, 10);
  if (!Number.isFinite(tourId)) return res.redirect('/admin/tours?error=ungueltig');

  const invoiceNumber = String(req.body?.invoiceNumber || '').trim() || null;
  const amountRaw = String(req.body?.amountChf || '').trim();
  const amountChf = Number.parseFloat(amountRaw.replace(',', '.'));
  const dueAtRaw = String(req.body?.dueAt || '').trim();
  const note = String(req.body?.paymentNote || '').trim() || null;
  const markPaidNow =
    req.body?.markPaidNow === '1' || req.body?.markPaidNow === 'on' || req.body?.markPaidNow === 'true';

  if (!Number.isFinite(amountChf) || amountChf <= 0) {
    return res.redirect(`/admin/tours/${tourId}?error=` + encodeURIComponent('Betrag ist ungültig.'));
  }
  const dueAtInputIso = dueAtRaw ? toIsoDate(dueAtRaw) : null;
  if (dueAtRaw && !dueAtInputIso) {
    return res.redirect(`/admin/tours/${tourId}?error=` + encodeURIComponent('Fälligkeitsdatum ist ungültig.'));
  }
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [tourId]);
  const tourRaw = tourResult.rows[0];
  if (!tourRaw) {
    return res.redirect('/admin/tours?error=' + encodeURIComponent('Tour nicht gefunden.'));
  }
  const tour = normalizeTourRow(tourRaw);
  const existingInvoicesResult = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM tour_manager.renewal_invoices
     WHERE tour_id = $1`,
    [tourId]
  );
  const hasExistingInvoices = (existingInvoicesResult.rows[0]?.cnt || 0) > 0;
  const dueAtIso = dueAtInputIso || computeManualInvoiceDueDateIso(tour, hasExistingInvoices);

  let status = 'sent';
  let paidAtIso = null;
  let paymentMethod = null;
  let subscriptionStartIso = null;
  let subscriptionEndIso = null;
  if (markPaidNow) {
    status = 'paid';
    const paidAtRaw = String(req.body?.paidAt || '').trim();
    const subscriptionStartRaw = String(req.body?.subscriptionStartAt || '').trim();
    const paymentMethodRaw = String(req.body?.paymentMethod || '').trim().toLowerCase();
    if (!ALLOWED_PAYMENT_METHODS.has(paymentMethodRaw)) {
      return res.redirect(`/admin/tours/${tourId}?error=` + encodeURIComponent('Zahlungsart ist ungültig.'));
    }
    const subWindow = getSubscriptionWindowFromStart(subscriptionStartRaw);
    if (!subWindow.startIso || !subWindow.endIso) {
      return res.redirect(`/admin/tours/${tourId}?error=` + encodeURIComponent('Abo gültig ab ist ungültig.'));
    }
    paidAtIso = toIsoDate(paidAtRaw || subscriptionStartRaw);
    if (!paidAtIso) {
      return res.redirect(`/admin/tours/${tourId}?error=` + encodeURIComponent('Bezahlt am ist ungültig.'));
    }
    paymentMethod = paymentMethodRaw;
    subscriptionStartIso = subWindow.startIso;
    subscriptionEndIso = subWindow.endIso;
  }

  const inserted = await pool.query(
    `INSERT INTO tour_manager.renewal_invoices (
       tour_id, invoice_number, invoice_status, amount_chf, due_at,
       sent_at, paid_at, payment_method, payment_source, payment_note,
       recorded_by, recorded_at, subscription_start_at, subscription_end_at, invoice_kind
     ) VALUES (
       $1, $2, $3, $4::numeric, $5::date,
       CASE WHEN $3 IN ('sent','paid') THEN NOW() ELSE NULL END,
       $6::date, $7, 'manual', $8,
       $9, NOW(), $10::date, $11::date, 'manual_extension'
     )
     RETURNING id`,
    [
      tourId,
      invoiceNumber,
      status,
      amountChf,
      dueAtIso,
      paidAtIso,
      paymentMethod,
      note,
      req.session?.admin?.email || req.session?.admin?.username || 'admin',
      subscriptionStartIso,
      subscriptionEndIso,
    ]
  );

  if (markPaidNow && subscriptionEndIso) {
    await pool.query(
      `UPDATE tour_manager.tours
       SET status = 'ACTIVE',
           term_end_date = $2::date,
           ablaufdatum = $2::date,
           updated_at = NOW()
       WHERE id = $1`,
      [tourId, subscriptionEndIso]
    );
  }

  await logAction(tourId, 'admin', req.session?.admin?.email || 'admin', 'INVOICE_CREATE_MANUAL', {
    invoice_id: inserted.rows[0]?.id || null,
    invoice_number: invoiceNumber,
    amount_chf: amountChf,
    due_at: dueAtIso,
    mark_paid_now: markPaidNow,
    paid_at: paidAtIso,
    payment_method: paymentMethod,
    payment_method_label: paymentMethod ? paymentMethodLabel(paymentMethod) : null,
    subscription_start_at: subscriptionStartIso,
    subscription_end_at: subscriptionEndIso,
    note,
  });

  const qs = new URLSearchParams();
  qs.set('invoiceCreated', '1');
  if (markPaidNow) qs.set('paymentSaved', '1');
  return res.redirect(`/admin/tours/${tourId}?${qs.toString()}`);
});

router.post('/tours/:id/invoices/:invoiceId/mark-paid-manual', async (req, res) => {
  await ensureSuggestionSchema();
  const tourId = parseInt(req.params.id, 10);
  const invoiceId = parseInt(req.params.invoiceId, 10);
  if (!Number.isFinite(tourId) || !Number.isFinite(invoiceId)) {
    return res.redirect('/admin/tours?error=ungueltig');
  }

  const subscriptionStartRaw = String(req.body?.subscriptionStartAt || '').trim();
  const paidAtRaw = String(req.body?.paidAt || '').trim();
  const note = String(req.body?.paymentNote || '').trim() || null;
  const paymentMethodRaw = String(req.body?.paymentMethod || '').trim().toLowerCase();
  if (!ALLOWED_PAYMENT_METHODS.has(paymentMethodRaw)) {
    return res.redirect(`/admin/tours/${tourId}?error=` + encodeURIComponent('Zahlungsart ist ungültig.'));
  }
  const paymentMethod = paymentMethodRaw;
  const amountRaw = String(req.body?.amountChf || '').trim();
  const amountChf = amountRaw ? Number.parseFloat(amountRaw.replace(',', '.')) : null;

  const subWindow = getSubscriptionWindowFromStart(subscriptionStartRaw);
  if (!subWindow.startIso || !subWindow.endIso) {
    return res.redirect(`/admin/tours/${tourId}?error=` + encodeURIComponent('Abo gültig ab ist ungültig.'));
  }
  const paidAtIso = toIsoDate(paidAtRaw || subscriptionStartRaw);
  if (!paidAtIso) {
    return res.redirect(`/admin/tours/${tourId}?error=` + encodeURIComponent('Bezahlt am ist ungültig.'));
  }
  if (amountChf !== null && !Number.isFinite(amountChf)) {
    return res.redirect(`/admin/tours/${tourId}?error=` + encodeURIComponent('Betrag ist ungültig.'));
  }

  const invoiceResult = await pool.query(
    `SELECT id, tour_id, invoice_number
     FROM tour_manager.renewal_invoices
     WHERE id = $1 AND tour_id = $2
     LIMIT 1`,
    [invoiceId, tourId]
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) {
    return res.redirect(`/admin/tours/${tourId}?error=` + encodeURIComponent('Rechnung nicht gefunden.'));
  }

  await pool.query(
    `UPDATE tour_manager.renewal_invoices
     SET invoice_status = 'paid',
         paid_at = $3::date,
         payment_method = $4,
         payment_source = 'manual',
         payment_note = $5,
         recorded_by = $6,
         recorded_at = NOW(),
         subscription_start_at = $7::date,
         subscription_end_at = $8::date,
         amount_chf = COALESCE($9::numeric, amount_chf)
     WHERE id = $1
       AND tour_id = $2`,
    [
      invoiceId,
      tourId,
      paidAtIso,
      paymentMethod,
      note,
      req.session?.admin?.email || req.session?.admin?.username || 'admin',
      subWindow.startIso,
      subWindow.endIso,
      amountChf,
    ]
  );

  await pool.query(
    `UPDATE tour_manager.tours
     SET status = 'ACTIVE',
         term_end_date = $2::date,
         ablaufdatum = $2::date,
         updated_at = NOW()
     WHERE id = $1`,
    [tourId, subWindow.endIso]
  );

  await logAction(tourId, 'admin', req.session?.admin?.email || 'admin', 'INVOICE_MARK_PAID_MANUAL', {
    invoice_id: invoiceId,
    invoice_number: invoice.invoice_number || null,
    payment_method: paymentMethod,
    payment_method_label: paymentMethodLabel(paymentMethod),
    paid_at: paidAtIso,
    subscription_start_at: subWindow.startIso,
    subscription_end_at: subWindow.endIso,
    amount_chf: amountChf,
    note,
  });

  return res.redirect(`/admin/tours/${tourId}?paymentSaved=1`);
});

router.get('/tours/:id/invoices/:invoiceId/pdf', async (req, res) => {
  const tourId = parseInt(String(req.params.id || ''), 10);
  const invoiceId = String(req.params.invoiceId || '').trim();
  if (!Number.isFinite(tourId) || !invoiceId) return res.status(400).send('Ungültige Parameter');

  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [tourId]);
  const tourRaw = tourResult.rows[0];
  if (!tourRaw) return res.status(404).send('Tour nicht gefunden.');
  const tour = normalizeTourRow(tourRaw);
  if (tour.canonical_matterport_space_id) {
    const { model } = await matterport.getModel(tour.canonical_matterport_space_id).catch(() => ({ model: null }));
    if (model?.publication?.url && !tour.tour_url) tour.tour_url = model.publication.url;
    if (model?.publication?.address) tour.object_address = model.publication.address;
  }

  const invResult = await pool.query(
    'SELECT * FROM tour_manager.renewal_invoices WHERE id = $1 AND tour_id = $2 LIMIT 1',
    [invoiceId, tourId]
  );
  const invoice = invResult.rows[0];
  if (!invoice) return res.status(404).send('Rechnung nicht gefunden.');

  let amount = Number(invoice.amount_chf || invoice.betrag || invoice.preis_brutto || 0);
  if (!amount || Number.isNaN(amount)) {
    amount = invoice.invoice_kind === 'portal_reactivation' ? REACTIVATION_PRICE_CHF : EXTENSION_PRICE_CHF;
  }
  const amountStr = Number(amount).toFixed(2);
  const invLabel = invoice.invoice_number || `Rechnung #${invoice.id}`;
  const invoiceDate = invoice.sent_at || invoice.invoice_date || invoice.created_at
    ? new Date(invoice.sent_at || invoice.invoice_date || invoice.created_at).toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' })
    : '-';
  const statusLabels = { paid: 'Bezahlt', sent: 'Ausstehend', overdue: 'Überfällig', draft: 'Entwurf', cancelled: 'Storniert' };
  const statusLabel = statusLabels[invoice.invoice_status] || invoice.invoice_status || '-';
  const periodStart = invoice.subscription_start_at ? new Date(invoice.subscription_start_at) : null;
  const periodEnd = invoice.subscription_end_at ? new Date(invoice.subscription_end_at) : null;
  const billingPeriodLabel = periodStart && periodEnd
    ? `${periodStart.toLocaleDateString('de-CH')} bis ${periodEnd.toLocaleDateString('de-CH')}`
    : periodEnd
      ? `Bis ${periodEnd.toLocaleDateString('de-CH')}`
      : '-';

  const paymentContext = qrBill.buildInvoicePaymentContext({ ...invoice, amount_chf: amount }, tour);
  const ctx = {
    ...paymentContext,
    invLabel,
    invoiceDate,
    statusLabel,
    amount: amountStr,
    customerName: [tour.customer_name, tour.customer_contact].filter(Boolean).join(' – ') || tour.customer_contact || '-',
    customerEmail: tour.customer_email || '',
    bezeichnung: invoice.invoice_kind === 'portal_extension'
      ? 'Virtueller Rundgang – Verlängerung (6 Monate)'
      : invoice.invoice_kind === 'portal_reactivation'
        ? 'Virtueller Rundgang – Reaktivierung (6 Monate)'
        : 'Virtueller Rundgang – Hosting / Verlängerung',
    tourLabel: tour.canonical_object_label || tour.object_label || tour.bezeichnung || `Tour #${tour.id}`,
    tourLink: tour.tour_url || null,
    tourAddress: tour.object_address || null,
    billingPeriodLabel,
  };

  const PDFDocument = require('pdfkit');
  const { SwissQRBill } = require('swissqrbill/pdf');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Rechnung-${ctx.invLabel.replace(/[^a-zA-Z0-9-_]/g, '-')}.pdf"`);
  doc.pipe(res);

  let y = 50;
  doc.fontSize(18).fillColor('#111').text(ctx.creditor.name, 50, y);
  y += 24;
  doc.fontSize(10).fillColor('#666').text(`${ctx.creditor.email} · ${ctx.creditor.website}`, 50, y);
  y += 30;
  doc.fontSize(14).fillColor('#111').text('Rechnung', 50, y);
  y += 22;
  doc.fontSize(10).fillColor('#666').text(`${ctx.invLabel} · ${ctx.invoiceDate} · ${ctx.statusLabel}`, 50, y);
  y += 24;
  doc.fontSize(10).fillColor('#111').text('Rechnungsempfänger:', 50, y);
  y += 16;
  doc.text(ctx.customerName || '-', 50, y);
  y += 16;
  if (ctx.customerEmail) {
    doc.text(ctx.customerEmail, 50, y);
    y += 20;
  } else {
    y += 10;
  }
  doc.fontSize(10).fillColor('#111').text('Tour / Objekt:', 50, y);
  y += 14;
  doc.fontSize(9).fillColor('#333').text(ctx.tourLabel || '-', 50, y);
  y += 14;
  if (ctx.tourAddress) {
    doc.text(`Adresse: ${ctx.tourAddress}`, 50, y);
    y += 14;
  }
  if (ctx.tourLink) {
    doc.fillColor('#0b6aa2').text(`Link: ${ctx.tourLink}`, 50, y, { link: ctx.tourLink, underline: true });
    y += 16;
  }
  doc.fillColor('#333').text(`Periode: ${ctx.billingPeriodLabel}`, 50, y);
  y += 12;
  const tableTop = y + 5;
  doc.fontSize(10).fillColor('#111').text('Pos.', 50, tableTop);
  doc.text('Beschreibung', 120, tableTop);
  doc.text('Betrag (CHF)', 450, tableTop, { width: 80, align: 'right' });
  doc.moveTo(50, tableTop + 18).lineTo(530, tableTop + 18).stroke();
  doc.text('1', 50, tableTop + 25);
  doc.text(ctx.bezeichnung, 120, tableTop + 25, { width: 320 });
  doc.text(ctx.amount, 450, tableTop + 25, { width: 80, align: 'right' });
  y = tableTop + 55;
  doc.fontSize(11).fillColor('#111').text(`Total: CHF ${ctx.amount}`, 50, y);
  y += 25;
  doc.fontSize(9).fillColor('#666').text(`Vielen Dank für Ihr Vertrauen. Bei Fragen: ${ctx.creditor.email}`, 50, y);
  y += 16;
  doc.text(`Freundliche Grüsse, ${ctx.creditor.name}`, 50, y);
  try {
    const bill = new SwissQRBill(ctx.qrBillPayload, {
      language: 'DE',
      separate: false,
      scissors: true,
      fontName: 'Helvetica',
    });
    bill.attachTo(doc);
  } catch (err) {
    y += 24;
    doc.fontSize(9).fillColor('#111').text(`Zahlbar an: ${ctx.creditor.name}`, 50, y);
    y += 14;
    doc.text(`IBAN: ${qrBill.formatIban(ctx.creditor.account)}`, 50, y);
    y += 14;
    doc.text(`Referenz: ${ctx.qrReferenceFormatted}`, 50, y);
  }
  doc.end();
});

router.get('/tours/:id', async (req, res) => {
  const { id } = req.params;
  const tour = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [id]);
  if (!tour.rows[0]) {
    return res.status(404).send('Tour nicht gefunden');
  }
  const tourRow = normalizeTourRow(tour.rows[0]);
  const logs = await pool.query(
    'SELECT * FROM tour_manager.actions_log WHERE tour_id = $1 ORDER BY created_at DESC LIMIT 50',
    [id]
  );
  const [invoices, exxasInvoices, outgoingEmails, incomingEmails] = await Promise.all([
    pool.query('SELECT * FROM tour_manager.renewal_invoices WHERE tour_id = $1 ORDER BY created_at DESC', [id]),
    pool.query(
      `SELECT * FROM tour_manager.exxas_invoices
       WHERE tour_id = $1
          OR ($2::text IS NOT NULL AND ref_vertrag = $2::text)
       ORDER BY zahlungstermin DESC NULLS LAST, dok_datum DESC NULLS LAST`,
      [id, tourRow.canonical_exxas_contract_id || null]
    ),
    pool.query(
      `SELECT *
       FROM tour_manager.outgoing_emails
       WHERE tour_id = $1
       ORDER BY sent_at DESC, created_at DESC`,
      [id]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT m.*,
              s.status AS suggestion_status,
              s.reason AS suggestion_reason,
              s.confidence AS suggestion_confidence
       FROM tour_manager.incoming_emails m
       LEFT JOIN LATERAL (
         SELECT status, reason, confidence
         FROM tour_manager.ai_suggestions
         WHERE suggestion_type = 'email_intent'
           AND source_email_id = m.id
         ORDER BY created_at DESC
         LIMIT 1
       ) s ON TRUE
       WHERE m.matched_tour_id = $1
       ORDER BY m.received_at DESC NULLS LAST, m.created_at DESC`,
      [id]
    ).catch(() => ({ rows: [] })),
  ]);
  const renewalRows = invoices.rows;
  const exxasRows = exxasInvoices.rows;
  const renewalPaid = renewalRows.filter((row) => row.invoice_status === 'paid');
  const renewalOpen = renewalRows.filter((row) => ['sent', 'overdue', 'draft'].includes(row.invoice_status));
  const sumAmount = (rows) =>
    rows.reduce((sum, row) => sum + (parseFloat(row.amount_chf) || parseFloat(row.preis_brutto) || 0), 0);

  const paymentEvents = [
    ...renewalPaid
      .filter((row) => row.paid_at)
      .map((row) => ({
        at: row.paid_at,
        source: 'renewal',
        label: row.invoice_number || row.exxas_invoice_id || 'Verlaengerungsrechnung',
        amount: parseFloat(row.amount_chf) || parseFloat(row.preis_brutto) || null,
        dateHint: 'bezahlt am',
      })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  const paymentTimeline = [
    ...renewalRows.map((row) => ({
      source: 'renewal',
      title: row.invoice_number || row.exxas_invoice_id || 'Verlaengerungsrechnung',
      status: row.invoice_status,
      statusLabel: ({ draft: 'Entwurf', sent: 'Gesendet', paid: 'Bezahlt', overdue: 'Ueberfaellig', cancelled: 'Storniert' })[row.invoice_status] || row.invoice_status,
      amount: parseFloat(row.amount_chf) || parseFloat(row.preis_brutto) || null,
      primaryDate: row.paid_at || row.sent_at || row.created_at,
      primaryDateLabel: row.paid_at ? 'Bezahlt' : (row.sent_at ? 'Gesendet' : 'Erstellt'),
      dueDate: row.due_at || row.period_end || null,
      relationLabel: 'Renewal',
      paymentMethod: row.payment_method || null,
      paymentMethodLabel: paymentMethodLabel(row.payment_method),
      paymentSource: row.payment_source || null,
      subscriptionStartAt: row.subscription_start_at || null,
      subscriptionEndAt: row.subscription_end_at || null,
    })),
  ].sort((a, b) => new Date(b.primaryDate || 0) - new Date(a.primaryDate || 0));

  const paymentSummary = {
    renewalPaidCount: renewalPaid.length,
    renewalOpenCount: renewalOpen.length,
    exxasPaidCount: 0,
    exxasOpenCount: 0,
    paidCount: renewalPaid.length,
    openCount: renewalOpen.length,
    paidAmount: sumAmount(renewalPaid),
    openAmount: sumAmount(renewalOpen),
    lastPayment: paymentEvents[0] || null,
  };
  const suggestedManualDueAt = computeManualInvoiceDueDateIso(tourRow, renewalRows.length > 0);
  const displayedTourStatus = getDisplayedTourStatus(tourRow);
  const declineWorkflow = await enrichDeclineWorkflowState(buildDeclineWorkflowState(tourRow, exxasRows));
  const spaceId = tourRow.canonical_matterport_space_id || tourRow.matterport_space_id || null;
  let mpVisibility = null;
  if (spaceId) {
    const { model } = await matterport.getModel(spaceId).catch(() => ({ model: null }));
    mpVisibility = model?.accessVisibility || model?.visibility || null;
  }

  res.render('admin/tour-detail', {
    tour: tourRow,
    displayedTourStatus,
    actionsLog: logs.rows,
    renewalInvoices: renewalRows,
    exxasInvoices: exxasRows,
    paymentSummary,
    paymentTimeline,
    suggestedManualDueAt,
    outgoingEmails: outgoingEmails.rows,
    incomingEmails: incomingEmails.rows,
    apiBase: process.env.APP_BASE_URL || '',
    tourUrlSaved: req.query.tourUrlSaved === '1',
    invoiceLinked: req.query.invoiceLinked === '1',
    customerLinked: req.query.customerLinked === '1',
    verifiedSaved: req.query.verifiedSaved === '1',
    paymentSaved: req.query.paymentSaved === '1',
    invoiceCreated: req.query.invoiceCreated === '1',
    visibilitySaved: req.query.visibilitySaved === '1',
    visibilityError: req.query.visibilityError || null,
    nameSaved: req.query.nameSaved === '1',
    nameSyncFailed: req.query.nameSyncFailed === '1',
    startSweepSaved: req.query.startSweepSaved === '1',
    mpVisibility,
    declineWorkflow,
    activePage: 'tours',
  });
});

/** Panel-API: kompakte Tour-Daten fuer Slide-Panel (JSON) */
router.get('/tours/:id/panel', async (req, res) => {
  const { id } = req.params;
  const tour = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [id]);
  if (!tour.rows[0]) return res.status(404).json({ error: 'Tour nicht gefunden' });
  const t = normalizeTourRow(tour.rows[0]);

  const today = new Date();
  const termEndDate = t.canonical_term_end_date || t.term_end_date || t.ablaufdatum;
  const daysUntilRenewal = termEndDate
    ? Math.round((new Date(termEndDate) - today) / 86400000)
    : null;

  const [renewalInvRes, outRes, inRes] = await Promise.all([
    pool.query(
      `SELECT id, invoice_number, invoice_status, amount_chf, due_at, sent_at, paid_at, payment_method
       FROM tour_manager.renewal_invoices
       WHERE tour_id = $1
       ORDER BY COALESCE(paid_at, sent_at, created_at) DESC NULLS LAST
       LIMIT 8`,
      [id]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT subject, recipient_email, sent_at, template_key
       FROM tour_manager.outgoing_emails WHERE tour_id = $1
       ORDER BY sent_at DESC LIMIT 5`,
      [id]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT m.subject, m.from_email, m.from_name, m.received_at, m.body_preview,
              s.status AS suggestion_status, s.suggested_action, s.confidence, s.reason
       FROM tour_manager.incoming_emails m
       LEFT JOIN LATERAL (
         SELECT status, suggested_action, confidence, reason
         FROM tour_manager.ai_suggestions
         WHERE source_email_id = m.id ORDER BY created_at DESC LIMIT 1
       ) s ON TRUE
       WHERE m.matched_tour_id = $1
       ORDER BY m.received_at DESC NULLS LAST LIMIT 5`,
      [id]
    ).catch(() => ({ rows: [] })),
  ]);

  const methodLabels = { bank_transfer: 'Überweisung', cash: 'Bar', twint: 'TWINT', card: 'Karte', payrexx: 'Payrexx', other: 'Sonstige' };
  const invRows = renewalInvRes.rows.map((inv) => {
    const faellig = inv.due_at ? new Date(inv.due_at) : null;
    const isPaid = inv.invoice_status === 'paid';
    const isOverdue = !isPaid && faellig && faellig < today;
    let statusText = isPaid
      ? 'Bezahlt'
      : (isOverdue
        ? `Überfällig seit ${faellig.toLocaleDateString('de-CH')}`
        : (faellig ? `Offen · fällig ${faellig.toLocaleDateString('de-CH')}` : (inv.invoice_status || 'Offen')));
    return {
      nummer: inv.invoice_number || `Rechnung #${inv.id}`,
      betrag: inv.amount_chf ? parseFloat(inv.amount_chf).toFixed(2) : null,
      statusText,
      statusClass: isPaid ? 'paid' : (isOverdue ? 'overdue' : 'open'),
      paymentMethod: inv.payment_method ? (methodLabels[inv.payment_method] || inv.payment_method) : null,
    };
  });

  res.json({
    id: t.id,
    tourName: t.canonical_object_label || t.object_label || t.bezeichnung || `Tour ${t.id}`,
    customerName: t.canonical_customer_name || t.customer_name || t.kunde_ref || '',
    customerEmail: t.customer_email || t.customer_contact || '',
    status: t.status,
    matterportId: t.canonical_matterport_space_id || '',
    matterportCreatedAt: t.matterport_created_at || null,
    termEndDate: termEndDate || null,
    daysUntilRenewal,
    customerIntent: t.customer_intent || null,
    customerIntentConfidence: t.customer_intent_confidence || null,
    exxasInvoices: invRows,
    outgoingEmails: outRes.rows,
    incomingEmails: inRes.rows,
  });
});

/** Rechnung mit Tour verknüpfen: unverknüpfte Exxas-Rechnungen */
router.get('/tours/:id/link-invoice', async (req, res) => {
  const { id } = req.params;
  const tour = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [id]);
  if (!tour.rows[0]) {
    return res.status(404).send('Tour nicht gefunden');
  }
  const normalizedTour = normalizeTourRow(tour.rows[0]);
  const search = (req.query.search || '').trim();
  let q = 'SELECT * FROM tour_manager.exxas_invoices WHERE tour_id IS NULL ORDER BY zahlungstermin DESC NULLS LAST, dok_datum DESC NULLS LAST';
  const params = [];
  if (search) {
    q = `SELECT * FROM tour_manager.exxas_invoices
      WHERE tour_id IS NULL
        AND (LOWER(COALESCE(kunde_name,'')) LIKE $1 OR LOWER(COALESCE(bezeichnung,'')) LIKE $1 OR LOWER(COALESCE(nummer,'')) LIKE $1)
      ORDER BY zahlungstermin DESC NULLS LAST, dok_datum DESC NULLS LAST`;
    params.push('%' + search.toLowerCase() + '%');
  }
  const [invoices, suggestions] = await Promise.all([
    pool.query(q, params),
    getInvoiceLinkSuggestionsForTour(normalizedTour, { limit: 5, scanLimit: 250 }),
  ]);
  res.render('admin/link-invoice', {
    tour: normalizedTour,
    invoices: invoices.rows,
    suggestions,
    search: req.query.search || '',
    activePage: 'tours',
  });
});

router.post('/tours/:id/link-invoice', async (req, res) => {
  const { id } = req.params;
  const invoiceId = req.body?.invoice_id;
  if (!invoiceId) {
    return res.redirect(`/admin/tours/${id}/link-invoice?error=missing`);
  }
  const tour = await pool.query('SELECT id FROM tour_manager.tours WHERE id = $1', [id]);
  if (!tour.rows[0]) {
    return res.status(404).send('Tour nicht gefunden');
  }
  const inv = await pool.query('SELECT id, tour_id FROM tour_manager.exxas_invoices WHERE id = $1', [invoiceId]);
  if (!inv.rows[0]) {
    return res.redirect(`/admin/tours/${id}/link-invoice?error=notfound`);
  }
  if (inv.rows[0].tour_id != null) {
    return res.redirect(`/admin/tours/${id}/link-invoice?error=alreadylinked`);
  }
  await pool.query('UPDATE tour_manager.exxas_invoices SET tour_id = $1 WHERE id = $2', [id, invoiceId]);
  res.redirect(`/admin/tours/${id}?invoiceLinked=1`);
});

/** Rechnung löschen (nur lokal erstellte, ohne Exxas-Verknüpfung) */
router.post('/invoices/:invoiceId/delete', async (req, res) => {
  const invoiceId = parseInt(req.params.invoiceId, 10);
  if (!invoiceId) return res.redirect('/admin/invoices?error=invalid');

  const inv = await pool.query(
    'SELECT id, tour_id, exxas_document_id, bezeichnung FROM tour_manager.exxas_invoices WHERE id = $1',
    [invoiceId]
  );
  const row = inv.rows[0];
  if (!row) return res.redirect('/admin/invoices?error=notfound');

  if (row.exxas_document_id != null && String(row.exxas_document_id).trim() !== '') {
    return res.redirect('/admin/invoices?error=exxas_linked');
  }

  await pool.query('DELETE FROM tour_manager.exxas_invoices WHERE id = $1', [invoiceId]);
  const next = row.tour_id ? `/admin/tours/${row.tour_id}?invoiceDeleted=1` : '/admin/invoices?deleted=1';
  res.redirect(next);
});

/** Matterport-Verknüpfung: nur aktive, noch nicht verknüpfte Spaces anzeigen */
router.get('/link-matterport', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const qLower = q.toLowerCase();
  const openSpaceId = String(req.query.openSpaceId || '').trim();
  const allowedSort = new Set(['space', 'created']);
  const sort = allowedSort.has(String(req.query.sort || '')) ? String(req.query.sort) : 'space';
  const order = String(req.query.order || '').toLowerCase() === 'desc' ? 'desc' : 'asc';
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = 10;
  const [matterportResult, linkedResult] = await Promise.all([
    matterport.listModels(),
    pool.query(`
      SELECT DISTINCT TRIM(matterport_space_id) AS space_id
      FROM tour_manager.tours
      WHERE matterport_space_id IS NOT NULL
        AND TRIM(matterport_space_id) != ''
    `),
  ]);

  const mpError = matterportResult.error || null;
  const activeModels = (matterportResult.results || [])
    .filter((model) => String(model.state || '').toLowerCase() === 'active');
  const linkedSpaceIds = new Set(
    linkedResult.rows
      .map((row) => String(row.space_id || '').trim())
      .filter(Boolean)
  );
  const allOpenSpaces = activeModels.filter((model) => !linkedSpaceIds.has(String(model.id || '').trim()));
  const autoOpenSpace = openSpaceId
    ? (allOpenSpaces.find((model) => String(model.id || '').trim() === openSpaceId) || null)
    : null;

  let openSpaces = allOpenSpaces;
  if (qLower) {
    openSpaces = allOpenSpaces.filter((model) => {
      const createdLabel = model.created
        ? new Date(model.created).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' })
        : '';
      const haystack = [
        model.name || '',
        model.id || '',
        createdLabel,
      ].join(' ').toLowerCase();
      return haystack.includes(qLower);
    });
  }

  const compareString = (a, b) => String(a || '').localeCompare(String(b || ''), 'de', { sensitivity: 'base' });
  const compareDate = (a, b) => {
    const ta = a ? new Date(a).getTime() : 0;
    const tb = b ? new Date(b).getTime() : 0;
    return ta - tb;
  };
  openSpaces.sort((a, b) => {
    let cmp = 0;
    if (sort === 'created') cmp = compareDate(a.created, b.created);
    else cmp = compareString(a.name || a.id, b.name || b.id);
    return order === 'desc' ? -cmp : cmp;
  });

  const totalItems = openSpaces.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const pagedOpenSpaces = openSpaces.slice(offset, offset + pageSize);

  res.render('admin/link-matterport', {
    openSpaces: pagedOpenSpaces,
    mpError,
    linked: req.query.linked === '1',
    error: req.query.error || null,
    duplicateTourId: parseInt(req.query.duplicateTourId, 10) || null,
    matterportOpenCount: allOpenSpaces.length,
    filteredOpenCount: totalItems,
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
      hasPrev: safePage > 1,
      hasNext: safePage < totalPages,
    },
    filters: { q },
    sort,
    order,
    autoOpenSpace,
    activePage: 'matterport',
  });
});

router.post('/link-matterport', async (req, res) => {
  const mpId = String(req.body?.matterportSpaceId || '').trim();
  const tourUrl = String(req.body?.tourUrl || '').trim();
  const cannotAssign = req.body?.cannotAssign === '1';
  const archiveIt = req.body?.archiveIt === '1';
  const selectedCustomerKey = String(req.body?.coreCustomerId || req.body?.exxasCustomerId || '').trim();
  const customerName = String(req.body?.customerName || '').trim();
  const customerEmail = String(req.body?.customerEmail || '').trim();
  const customerContact = String(req.body?.customerContact || '').trim();
  const bezeichnung = String(req.body?.bezeichnung || '').trim();

  if (!mpId || (!tourUrl && !cannotAssign)) {
    return res.redirect('/admin/link-matterport?error=missing');
  }

  const effectiveTourUrl = tourUrl || `https://my.matterport.com/show/?m=${mpId}`;
  const initialStatus = cannotAssign && archiveIt ? 'ARCHIVED' : 'ACTIVE';

  const duplicate = await pool.query(
    `SELECT id
     FROM tour_manager.tours
     WHERE TRIM(matterport_space_id) = $1
     ORDER BY updated_at DESC NULLS LAST, id DESC
     LIMIT 1`,
    [mpId]
  );
  if (duplicate.rows[0]?.id) {
    return res.redirect(`/admin/link-matterport?error=duplicate&duplicateTourId=${duplicate.rows[0].id}`);
  }

  const { model, error: modelError } = await matterport.getModel(mpId);
  const matterportCreatedAt = model?.created || null;
  const matterportState = model?.state || 'active';
  const matterportIsOwn = !!(model && !modelError);
  const derivedName = matterport.deriveTourDisplayLabelFromModel(model, bezeichnung);
  const termStartDate = matterportCreatedAt ? new Date(matterportCreatedAt) : new Date();
  const initialTermEndDate = toIsoDate(getInitialTermEndDate(termStartDate));

  const baseContractId = `MP-${mpId}`.slice(0, 32);
  let exxasAboId = baseContractId;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const exists = await pool.query('SELECT id FROM tour_manager.tours WHERE exxas_abo_id = $1 LIMIT 1', [exxasAboId]);
    if (!exists.rows[0]) break;
    const suffix = `-${attempt}`.slice(0, 4);
    exxasAboId = `${baseContractId.slice(0, 32 - suffix.length)}${suffix}`;
  }

  /** core.customers.id → tour_manager.tours.customer_id (FK); kunde_ref nur Exxas-Kontaktref aus core.customers.exxas_contact_id. */
  let kundeRef = null;
  let coreCustomerIdFk = null;
  if (!cannotAssign && selectedCustomerKey) {
    const pid = parseInt(selectedCustomerKey, 10);
    if (Number.isFinite(pid) && pid > 0) {
      const crow = await customerLookup.getCustomerById(pid);
      if (crow?.id) {
        coreCustomerIdFk = pid;
        const xref = crow.exxas_contact_id != null ? String(crow.exxas_contact_id).trim() : '';
        kundeRef = xref || null;
      }
    } else {
      kundeRef = selectedCustomerKey;
    }
  }

  const effectiveCustomerName = cannotAssign ? null : customerName || null;
  const effectiveCustomerEmail = cannotAssign ? null : customerEmail || null;
  const effectiveCustomerContact = cannotAssign ? null : customerContact || null;
  const effectiveCoreCustomerId = cannotAssign ? null : coreCustomerIdFk;
  const effectiveKundeRef = cannotAssign ? null : kundeRef;

  try {
    await pool.query(
      `INSERT INTO tour_manager.tours (
        exxas_abo_id,
        matterport_space_id,
        tour_url,
        kunde_ref,
        customer_id,
        customer_name,
        customer_email,
        customer_contact,
        bezeichnung,
        object_label,
        matterport_created_at,
        term_end_date,
        ablaufdatum,
        matterport_state,
        matterport_is_own,
        status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12::date, $12::date, $13, $14, $15
      )`,
      [
        exxasAboId,
        mpId,
        effectiveTourUrl,
        effectiveKundeRef,
        effectiveCoreCustomerId,
        effectiveCustomerName,
        effectiveCustomerEmail,
        effectiveCustomerContact,
        derivedName,
        derivedName,
        matterportCreatedAt,
        initialTermEndDate,
        matterportState,
        matterportIsOwn,
        initialStatus,
      ]
    );
  } catch (e) {
    return res.redirect('/admin/link-matterport?error=insert');
  }

  // Wenn "Kann nicht zugewiesen werden" + "Archivieren" → Modell auch in Matterport auf inaktiv setzen
  if (cannotAssign && archiveIt && mpId) {
    try {
      await matterport.archiveSpace(mpId);
    } catch (e) {
      console.warn('[link-matterport] Matterport archiveSpace fehlgeschlagen:', e.message);
      // Kein harter Fehler – Tour wurde lokal korrekt angelegt
    }
  }

  return res.redirect('/admin/link-matterport?linked=1');
});

router.get('/link-matterport/customer-search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return res.json({ companies: [], contacts: [], error: null });
  }

  try {
    /** Nur lokale DB: Firmen (customers) + Ansprechpartner (customer_contacts). */
    const [localResults, contactRows] = await Promise.all([
      customerLookup.searchLocalCustomers(q, 10),
      customerLookup.searchLocalContactMatches(q, 10),
    ]);

    const companies = (await Promise.all(localResults.map(async (c) => {
      const contacts = await customerLookup.getLocalContacts(c.id);
      return customerLookup.toLinkModalCustomer(c, contacts);
    }))).filter(Boolean);

    const contacts = contactRows.map((row) => ({
      customerId: String(row.customer_id),
      contactId: String(row.contact_id),
      firmenname: row.company || row.customer_name || '',
      customerEmail: row.customer_email || null,
      contactName: row.contact_name || '',
      contactEmail: row.contact_email || null,
      contactTel: row.contact_phone || null,
    }));

    return res.json({ companies, contacts, error: null });
  } catch (err) {
    return res.json({ companies: [], contacts: [], error: err.message });
  }
});

/** Voller Kunde + Kontaktliste für Matterport-Verknüpfen (nach Auswahl). */
router.get('/link-matterport/customer-detail', async (req, res) => {
  const id = parseInt(String(req.query.customerId || '').trim(), 10);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'Ungültige Kunden-ID', customer: null });
  }
  try {
    const customer = await customerLookup.getCustomerById(id);
    if (!customer) {
      return res.json({ customer: null, error: 'Nicht gefunden' });
    }
    const contactRows = await customerLookup.getLocalContacts(id);
    return res.json({
      error: null,
      customer: customerLookup.toLinkModalCustomer(customer, contactRows),
    });
  } catch (err) {
    return res.status(500).json({ customer: null, error: err.message });
  }
});

/** Automatisch verknüpfen: tour_url mit ?m=XXX → matterport_space_id setzen */
router.post('/link-matterport/auto', async (req, res) => {
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_created_at TIMESTAMPTZ');
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_state VARCHAR(50)');
  const linkWithoutVerify = matterport.allowsLinkWithoutVerify();
  const unlinked = await pool.query(`
    SELECT id, tour_url FROM tour_manager.tours
    WHERE (matterport_space_id IS NULL OR TRIM(matterport_space_id) = '')
    AND tour_url IS NOT NULL AND tour_url != ''
  `);
  let linked = 0;
  let skipped = 0;
  let errors = 0;
  let duplicate = 0;
  for (const t of unlinked.rows) {
    const mpId = getMatterportId(t);
    if (!mpId) {
      skipped++;
      continue;
    }
    const existing = await pool.query(
      `SELECT id FROM tour_manager.tours
       WHERE id != $1
         AND matterport_space_id = $2
       LIMIT 1`,
      [t.id, mpId]
    );
    if (existing.rows[0]?.id) {
      duplicate++;
      continue;
    }
    const { model, error } = await matterport.getModel(mpId);
    if (error || !model) {
      if (linkWithoutVerify) {
        await pool.query(
          `UPDATE tour_manager.tours
           SET matterport_space_id = $1, updated_at = NOW()
           WHERE id = $2`,
          [mpId, t.id]
        );
        linked++;
        continue;
      }
      errors++;
      continue;
    }
    const mpCreated = model?.created || null;
    const mpState = model?.state || null;
    await pool.query(
      `UPDATE tour_manager.tours SET matterport_space_id = $1, matterport_created_at = $2::timestamptz, matterport_state = $3, updated_at = NOW() WHERE id = $4`,
      [mpId, mpCreated, mpState, t.id]
    );
    linked++;
  }
  res.redirect(`/admin/link-matterport?autoLinked=${linked}&autoSkipped=${skipped}&autoErrors=${errors}&autoDuplicate=${duplicate}`);
});

/** Matterport-Erstellungsdaten für bereits verknüpfte Touren nachtragen */
router.post('/link-matterport/refresh-created', async (req, res) => {
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_created_at TIMESTAMPTZ');
  const rows = await pool.query(`
    SELECT id, matterport_space_id FROM tour_manager.tours
    WHERE matterport_space_id IS NOT NULL AND TRIM(matterport_space_id) != ''
    AND matterport_created_at IS NULL
  `);
  let updated = 0;
  for (const t of rows.rows) {
    const { model } = await matterport.getModel(t.matterport_space_id);
    if (model?.created) {
      await pool.query(
        `UPDATE tour_manager.tours SET matterport_created_at = $1::timestamptz, updated_at = NOW() WHERE id = $2`,
        [model.created, t.id]
      );
      updated++;
    }
  }
  res.redirect(`/admin/link-matterport?refreshCreated=${updated}`);
});

/** Matterport Space-Status synchronisieren (Aktiv, Archiviert, etc.) */
router.post('/link-matterport/sync-status', async (req, res) => {
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_state VARCHAR(50)');
  const rows = await pool.query(`
    SELECT id, matterport_space_id FROM tour_manager.tours
    WHERE matterport_space_id IS NOT NULL AND TRIM(matterport_space_id) != ''
  `);
  const matterportResult = await matterport.listModels();
  if (matterportResult.error) {
    return res.redirect(`/admin/link-matterport?ownershipError=${encodeURIComponent(matterportResult.error)}`);
  }
  const mpStateById = new Map((matterportResult.results || []).map((m) => [m.id, m.state || null]));
  let updated = 0;
  for (const t of rows.rows) {
    const mpId = String(t.matterport_space_id).trim();
    const nextState = mpStateById.has(mpId) ? mpStateById.get(mpId) : 'unknown';
    await pool.query(
      `UPDATE tour_manager.tours SET matterport_state = $1, updated_at = NOW() WHERE id = $2`,
      [nextState, t.id]
    );
    updated++;
  }
  res.redirect(`/admin/link-matterport?syncStatusUpdated=${updated}`);
});

/** Matterport-Zugehörigkeit prüfen: gehört der Space zu unserem Account oder fremdem? */
router.post('/link-matterport/check-ownership', async (req, res) => {
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_is_own BOOLEAN');
  const { ids: ownIds, error: listError } = await matterport.getOwnModelIds();
  if (listError) {
    return res.redirect(`/admin/link-matterport?ownershipError=${encodeURIComponent(listError)}`);
  }
  const rows = await pool.query(`
    SELECT id, matterport_space_id, tour_url
    FROM tour_manager.tours
    WHERE (matterport_space_id IS NOT NULL AND TRIM(matterport_space_id) != '')
       OR (tour_url IS NOT NULL AND tour_url ~ '[?&]m=[a-zA-Z0-9_-]+')
  `);
  let own = 0;
  let fremde = 0;
  let skipped = 0;
  for (const t of rows.rows) {
    const mpId = getMatterportId(t);
    if (!mpId) {
      skipped++;
      continue;
    }
    const isOwn = ownIds.has(mpId);
    await pool.query(
      `UPDATE tour_manager.tours SET matterport_is_own = $1, updated_at = NOW() WHERE id = $2`,
      [isOwn, t.id]
    );
    if (isOwn) own++;
    else fremde++;
  }
  res.redirect(`/admin/link-matterport?ownershipChecked=1&own=${own}&fremde=${fremde}&skipped=${skipped}`);
});

/** Kunden-Autocomplete aus lokaler DB (kein Exxas) */
router.get('/tours/:id/link-customer/autocomplete', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ customers: [] });
  try {
    const local = await customerLookup.searchLocalCustomers(q, 12);
    const customers = await Promise.all(
      local.map(async (c) => {
        const contacts = await customerLookup.getLocalContacts(c.id);
        return {
          id: c.id,
          display_name: c.company || c.name || '',
          email: c.email || '',
          ref: c.customer_number || c.exxas_contact_id || '',
          contacts: contacts.map((ct) => ({
            id: ct.id,
            name: ct.name || '',
            email: ct.email || '',
            role: ct.role || '',
          })),
        };
      })
    );
    res.json({ customers });
  } catch (err) {
    res.json({ customers: [] });
  }
});

/** Kundendaten einer Tour anpassen (direktes Formular, kein Exxas) */
router.get('/tours/:id/link-exxas-customer', async (req, res) => {
  const { id } = req.params;
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [id]);
  if (!tourResult.rows[0]) return res.status(404).send('Tour nicht gefunden');
  const tour = normalizeTourRow(tourResult.rows[0]);

  res.render('admin/link-exxas-customer', {
    tour,
    saved: req.query.saved === '1',
    error: req.query.error || null,
    activePage: 'tours',
  });
});

router.post('/tours/:id/link-exxas-customer', async (req, res) => {
  const { id } = req.params;
  const { customer_id, customer_name, customer_email, customer_contact } = req.body || {};

  const name = (customer_name || '').trim() || null;
  const cid = parseInt(String(customer_id || '').trim(), 10);
  if (!name || !Number.isFinite(cid) || cid < 1) {
    return res.redirect(`/admin/tours/${id}/link-exxas-customer?error=missing`);
  }

  const tourResult = await pool.query('SELECT id FROM tour_manager.tours WHERE id = $1', [id]);
  if (!tourResult.rows[0]) return res.status(404).send('Tour nicht gefunden');

  const customer = await customerLookup.getCustomerById(cid);
  if (!customer) {
    return res.redirect(`/admin/tours/${id}/link-exxas-customer?error=missing`);
  }
  const expectedDisplay = String(customer.company || customer.name || '').trim();
  if (expectedDisplay !== name) {
    return res.redirect(`/admin/tours/${id}/link-exxas-customer?error=missing`);
  }

  const email = (customer_email || '').trim() || null;
  const contact = (customer_contact || '').trim() || null;
  const kundeRef = await customerLookup.ensureCustomerNumber(cid);
  if (!kundeRef) {
    return res.redirect(`/admin/tours/${id}/link-exxas-customer?error=missing`);
  }

  await pool.query(
    `UPDATE tour_manager.tours
     SET kunde_ref = $1, customer_name = $2, customer_email = $3, customer_contact = $4,
         customer_id = $5, updated_at = NOW()
     WHERE id = $6`,
    [kundeRef, name, email, contact, cid, id]
  );

  res.redirect(`/admin/tours/${id}/link-exxas-customer?saved=1`);
});

// ─── Admin Impersonation: Kunden-Portal-Ansicht ───────────────────────────────

// GET /admin/customers/search?q=... – Autocomplete für Kunden-E-Mail / Name
router.get('/customers/search', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json([]);
  const like = `%${q}%`;
  try {
    const [toursRes, custRes] = await Promise.all([
      pool.query(
        `SELECT LOWER(TRIM(customer_email)) AS email,
                MAX(COALESCE(NULLIF(TRIM(customer_name), ''), NULLIF(TRIM(customer_contact), ''))) AS name,
                COUNT(*)::int AS tour_count
         FROM tour_manager.tours
         WHERE TRIM(COALESCE(customer_email, '')) <> ''
           AND (
             LOWER(customer_email) LIKE $1
             OR LOWER(COALESCE(customer_name, '')) LIKE $1
             OR LOWER(COALESCE(customer_contact, '')) LIKE $1
           )
         GROUP BY LOWER(TRIM(customer_email))`,
        [like]
      ),
      pool.query(
        `SELECT LOWER(TRIM(c.email)) AS email,
                COALESCE(NULLIF(TRIM(c.company), ''), NULLIF(TRIM(c.name), ''), TRIM(c.email)) AS name,
                (
                  SELECT COUNT(*)::int
                  FROM tour_manager.tours t
                  WHERE TRIM(COALESCE(t.customer_email, '')) <> ''
                    AND LOWER(TRIM(t.customer_email)) = LOWER(TRIM(c.email))
                ) AS tour_count
         FROM core.customers c
         WHERE TRIM(c.email) <> ''
           AND (
             LOWER(c.email) LIKE $1
             OR LOWER(COALESCE(c.name, '')) LIKE $1
             OR LOWER(COALESCE(c.company, '')) LIKE $1
           )
         ORDER BY LOWER(TRIM(c.email))
         LIMIT 30`,
        [like]
      ),
    ]);

    const byEmail = new Map();
    for (const r of toursRes.rows) {
      const email = r.email;
      if (!email) continue;
      const nm = r.name && String(r.name).trim() ? String(r.name).trim() : email;
      byEmail.set(email, {
        email,
        name: nm,
        count: Number(r.tour_count) || 0,
      });
    }
    for (const r of custRes.rows) {
      const email = r.email;
      if (!email) continue;
      const nm = r.name && String(r.name).trim() ? String(r.name).trim() : email;
      const cnt = Number(r.tour_count) || 0;
      const ex = byEmail.get(email);
      if (!ex) {
        byEmail.set(email, { email, name: nm, count: cnt });
      } else {
        if (cnt > ex.count) ex.count = cnt;
        if (nm && nm !== email && (ex.name === ex.email || !ex.name)) ex.name = nm;
      }
    }

    const list = Array.from(byEmail.values()).sort((a, b) => a.email.localeCompare(b.email));
    res.json(
      list.slice(0, 20).map((x) => ({
        email: x.email,
        name: x.name || x.email,
        count: x.count,
      }))
    );
  } catch (err) {
    console.warn('customers/search', err);
    res.status(500).json([]);
  }
});

// GET /admin/impersonate?email=... – Admin öffnet Portal-Ansicht eines Kunden
router.get('/impersonate', async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).send('Ungültige E-Mail');
  }
  req.session.portalCustomerEmail = email;
  req.session.portalCustomerName  = email;
  req.session.isAdminImpersonating = true;
  res.redirect('/portal/tours');
});

// ─── Profil (Sidebar): Anzeigename + Foto ─────────────────────────────────────

router.get('/profile/me', async (req, res) => {
  const email = req.session?.admin?.email;
  if (!email) return res.status(401).json({ ok: false, error: 'Nicht angemeldet' });
  try {
    const data = await userProfiles.getAdminProfileForEditor(email);
    return res.json({ ok: true, ...data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Fehler' });
  }
});

router.get('/profile/photo', async (req, res) => {
  const email = req.session?.admin?.email;
  if (!email) return res.status(404).end();
  try {
    const photo = await userProfiles.getAdminPhoto(email);
    if (!photo?.buffer) return res.status(404).end();
    res.setHeader('Content-Type', photo.mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(Buffer.from(photo.buffer));
  } catch (e) {
    return res.status(500).end();
  }
});

router.get('/profile/photo/:email', async (req, res) => {
  if (!req.session?.admin?.email) return res.status(403).end();
  const targetEmail = String(req.params.email || '').trim();
  try {
    const allowed = await isKnownAdminAccessEmail(targetEmail);
    if (!allowed) return res.status(403).end();
    const photo = await userProfiles.getAdminPhoto(targetEmail);
    if (!photo?.buffer) return res.status(404).end();
    res.setHeader('Content-Type', photo.mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(Buffer.from(photo.buffer));
  } catch (e) {
    return res.status(500).end();
  }
});

router.post('/profile/me', profileUpload.single('photo'), async (req, res) => {
  const email = req.session?.admin?.email;
  if (!email) return res.status(401).json({ ok: false, error: 'Nicht angemeldet' });
  const removePhoto = req.body?.removePhoto === '1' || req.body?.removePhoto === 'true';
  try {
    await userProfiles.upsertAdminProfileSimple(email, {
      displayName: req.body?.displayName !== undefined ? String(req.body.displayName) : undefined,
      contactLine: req.body?.contactLine !== undefined ? String(req.body.contactLine) : undefined,
      photoBuffer: req.file?.buffer,
      photoMime: req.file?.mimetype,
      removePhoto,
    });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Fehler' });
  }
});

router.post('/profile/password', async (req, res) => {
  const email = req.session?.admin?.email;
  if (!email) return res.status(401).json({ ok: false, error: 'Nicht angemeldet' });
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  const r = await changeOwnAdminPassword(email, currentPassword, newPassword);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.message || 'Fehler' });
  return res.json({ ok: true });
});

router.post('/profile/email', async (req, res) => {
  const email = req.session?.admin?.email;
  if (!email) return res.status(401).json({ ok: false, error: 'Nicht angemeldet' });
  const newEmail = String(req.body?.newEmail || '').trim();
  const currentPassword = String(req.body?.currentPassword || '');
  const r = await changeOwnAdminEmail(email, newEmail, currentPassword);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.message || 'Fehler' });
  req.session.admin = req.session.admin || {};
  req.session.admin.email = r.email;
  req.session.adminEmail = r.email;
  req.session.save((err) => {
    if (err) return res.status(500).json({ ok: false, error: 'Session konnte nicht gespeichert werden.' });
    return res.json({ ok: true, email: r.email });
  });
});

// ─── Kunden-Verwaltung (core.customers) ──────────────────────────────────────

// GET /admin/customers – Kundenliste mit Suche, Filter & Pagination
router.get('/customers', async (req, res) => {
  const q      = String(req.query.q      || '').trim();
  const source = String(req.query.source || '').trim();
  const status = String(req.query.status || '').trim();
  const sortBy = ['name', 'email', 'address', 'created_at', 'tour_count'].includes(req.query.sort) ? req.query.sort : 'name';
  const sortDir = req.query.dir === 'desc' ? 'DESC' : 'ASC';
  const page   = Math.max(1, parseInt(req.query.page) || 1);
  const limit  = 30;
  const offset = (page - 1) * limit;

  try {
    let whereClause = 'WHERE 1=1';
    const params = [];
    let pIdx = 1;

    if (q) {
      whereClause += ` AND (
        LOWER(c.name)    LIKE $${pIdx}
        OR LOWER(c.email)   LIKE $${pIdx}
        OR LOWER(c.company) LIKE $${pIdx}
        OR LOWER(c.phone)   LIKE $${pIdx}
        OR LOWER(coalesce(c.street,''))   LIKE $${pIdx}
        OR LOWER(coalesce(c.city,''))     LIKE $${pIdx}
        OR LOWER(coalesce(c.customer_number,'')) LIKE $${pIdx}
      )`;
      params.push(`%${q.toLowerCase()}%`);
      pIdx++;
    }

    if (source === 'tours') {
      whereClause += ` AND EXISTS (SELECT 1 FROM tour_manager.tours t WHERE LOWER(t.customer_email) = LOWER(c.email))`;
    } else if (source === 'contacts') {
      whereClause += ` AND EXISTS (SELECT 1 FROM core.customer_contacts cc WHERE cc.customer_id = c.id)`;
    }

    if (status === 'aktiv') {
      whereClause += ` AND (c.blocked IS NULL OR c.blocked = FALSE)`;
    } else if (status === 'gesperrt') {
      whereClause += ` AND c.blocked = TRUE`;
    }

    const orderExpr = {
      name: `LOWER(COALESCE(NULLIF(trim(c.name),''), c.company, c.email))`,
      email: `LOWER(c.email)`,
      address: `LOWER(coalesce(c.city,''))`,
      created_at: `c.created_at`,
      tour_count: `tour_count`,
    }[sortBy] || `LOWER(COALESCE(NULLIF(trim(c.name),''), c.company, c.email))`;

    const countResult = await pool.query(
      `SELECT COUNT(*) AS cnt FROM core.customers c ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].cnt);
    const totalPages = Math.ceil(totalCount / limit);

    const dataResult = await pool.query(
      `SELECT
         c.id,
         CASE WHEN trim(coalesce(c.name,''))='' THEN coalesce(c.company, c.email, '') ELSE c.name END AS name,
         c.email, c.company, c.phone,
         coalesce(c.street,'') AS street,
         coalesce(c.zip,'') AS zip,
         coalesce(c.city,'') AS city,
         c.exxas_contact_id, c.blocked, c.created_at,
         c.customer_number,
         (SELECT COUNT(*) FROM tour_manager.tours t WHERE LOWER(t.customer_email) = LOWER(c.email)) AS tour_count,
         (SELECT COUNT(*) FROM core.customer_contacts cc WHERE cc.customer_id = c.id) AS contact_count
       FROM core.customers c
       ${whereClause}
       ORDER BY ${orderExpr} ${sortDir}
       LIMIT $${pIdx} OFFSET $${pIdx + 1}`,
      [...params, limit, offset]
    );

    const admin = req.session?.admin || {};
    res.render('admin/customers-list', {
      activePage: 'customers',
      adminName: admin.email || '',
      adminSidebarDisplayName: admin.displayName || admin.email || '',
      adminSidebarOrganization: admin.organization || 'Propus GmbH',
      adminSidebarHasProfilePhoto: admin.hasProfilePhoto || false,
      adminSidebarPhotoVersion: admin.photoVersion || 0,
      customers: dataResult.rows,
      totalCount,
      totalPages,
      page,
      q,
      source,
      status,
      sortBy,
      sortDir,
    });
  } catch (err) {
    console.error('[customers list]', err);
    res.status(500).send('Fehler beim Laden der Kundenliste: ' + err.message);
  }
});

// GET /admin/customers/new – Neuen Kunden anlegen (Formular)
router.get('/customers/new', async (req, res) => {
  const admin = req.session?.admin || {};
  res.render('admin/customer-new', {
    activePage: 'customers',
    adminName: admin.email || '',
    adminSidebarDisplayName: admin.displayName || admin.email || '',
    adminSidebarOrganization: admin.organization || 'Propus GmbH',
    adminSidebarHasProfilePhoto: admin.hasProfilePhoto || false,
    adminSidebarPhotoVersion: admin.photoVersion || 0,
    prefill: {},
    error: req.query.error || null,
  });
});

// GET /admin/customers/exxas-search?q=... – Exxas-Suche für Import
router.get('/customers/exxas-search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ results: [] });
  try {
    const r = await exxas.searchCustomers(q);
    const results = (r.customers || []).slice(0, 10).map(c => ({
      id: c.id || c.nummer,
      exxas_contact_id: String(c.id || c.nummer || ''),
      name: [c.vorname, c.nachname].filter(Boolean).join(' ') || c.firmenname || '',
      email: c.email || '',
      company: c.firmenname || '',
      phone: c.telefon || c.mobile || '',
      street: c.strasse || '',
      zipcity: [c.plz, c.ort].filter(Boolean).join(' ') || '',
    }));
    res.json({ results });
  } catch (err) {
    res.json({ results: [], error: err.message });
  }
});

// POST /admin/customers/new – Kunden speichern
router.post('/customers/new', async (req, res) => {
  const name             = String(req.body.name            || '').trim();
  const email            = String(req.body.email           || '').trim().toLowerCase();
  const company          = String(req.body.company         || '').trim() || null;
  const phone            = String(req.body.phone           || '').trim() || null;
  const street           = String(req.body.street          || '').trim() || null;
  const zipcity          = String(req.body.zipcity         || '').trim() || null;
  const notes            = String(req.body.notes           || '').trim() || null;
  const exxas_contact_id = String(req.body.exxas_contact_id|| '').trim() || null;

  if (!name || !email) {
    return res.redirect('/admin/customers/new?error=' + encodeURIComponent('Name und E-Mail sind Pflichtfelder.'));
  }

  try {
    const existing = await pool.query('SELECT id FROM core.customers WHERE LOWER(email)=$1', [email]);
    if (existing.rows.length > 0) {
      return res.redirect(`/admin/customers/${existing.rows[0].id}?error=` + encodeURIComponent('Ein Kunde mit dieser E-Mail existiert bereits.'));
    }

    const result = await pool.query(
      `INSERT INTO core.customers
         (name, email, company, phone, street, zipcity, notes, exxas_contact_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
       RETURNING id`,
      [name, email, company, phone, street, zipcity, notes, exxas_contact_id]
    );
    res.redirect('/admin/customers/' + result.rows[0].id + '?flash=' + encodeURIComponent('Kunde erfolgreich angelegt.'));
  } catch (err) {
    console.error('[customers/new POST]', err);
    res.redirect('/admin/customers/new?error=' + encodeURIComponent('Fehler: ' + err.message));
  }
});

// GET /admin/customers/:id – Kunden-Detail / Bearbeiten
router.get('/customers/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).send('Ungültige ID');

  try {
    await portalTeam.ensurePortalTeamSchema();
    const [custR, contactsR, toursR] = await Promise.all([
      pool.query('SELECT * FROM core.customers WHERE id=$1', [id]),
      pool.query(
        `SELECT * FROM core.customer_contacts WHERE customer_id=$1 ORDER BY name ASC`,
        [id]
      ),
      pool.query(
        `SELECT id, bezeichnung, object_label, status, term_end_date
         FROM tour_manager.tours
         WHERE LOWER(customer_email) = (SELECT LOWER(email) FROM core.customers WHERE id=$1)
         ORDER BY created_at DESC LIMIT 10`,
        [id]
      ),
    ]);

    if (!custR.rows.length) return res.status(404).send('Kunde nicht gefunden');

    const customer = custR.rows[0];
    const ownerEmail = String(customer.email || '').trim().toLowerCase();

    // Portal-Rollen der Kontakte laden (member_email → role im Workspace des Kunden)
    let contactPortalRoles = {};
    if (ownerEmail) {
      try {
        const prR = await pool.query(
          `SELECT LOWER(TRIM(member_email)) AS email, role, status
           FROM tour_manager.portal_team_members
           WHERE LOWER(owner_email) = $1`,
          [ownerEmail]
        );
        for (const row of prR.rows) {
          contactPortalRoles[row.email] = { role: row.role, status: row.status };
        }
      } catch (_) {}
    }

    const admin = req.session?.admin || {};
    res.render('admin/customer-detail', {
      activePage: 'customers',
      adminName: admin.email || '',
      adminSidebarDisplayName: admin.displayName || admin.email || '',
      adminSidebarOrganization: admin.organization || 'Propus GmbH',
      adminSidebarHasProfilePhoto: admin.hasProfilePhoto || false,
      adminSidebarPhotoVersion: admin.photoVersion || 0,
      customer,
      contacts:  contactsR.rows,
      tours:     toursR.rows,
      contactPortalRoles,
      flash:     req.query.flash || null,
      error:     req.query.error || null,
    });
  } catch (err) {
    console.error('[customers/:id GET]', err);
    res.status(500).send('Fehler: ' + err.message);
  }
});

// POST /admin/customers/:id – Kunden-Stammdaten aktualisieren
router.post('/customers/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).send('Ungültige ID');

  const company = String(req.body.company || '').trim();
  const nameInput = String(req.body.name || '').trim();
  const name = nameInput || company || null;
  const email = String(req.body.email || '').trim().toLowerCase();
  const salutation = String(req.body.salutation || '').trim() || null;
  const first_name = String(req.body.first_name || '').trim() || null;
  const phone = String(req.body.phone || '').trim() || null;
  const phone_2 = String(req.body.phone_2 || '').trim() || null;
  const phone_mobile = String(req.body.phone_mobile || '').trim() || null;
  const phone_fax = String(req.body.phone_fax || '').trim() || null;
  const onsite_name = String(req.body.onsite_name || '').trim() || null;
  const onsite_phone = String(req.body.onsite_phone || '').trim() || null;
  const website = String(req.body.website || '').trim() || null;
  const street = String(req.body.street || '').trim() || null;
  const address_addon_1 = String(req.body.address_addon_1 || '').trim() || null;
  const address_addon_2 = String(req.body.address_addon_2 || '').trim() || null;
  const address_addon_3 = String(req.body.address_addon_3 || '').trim() || null;
  const po_box = String(req.body.po_box || '').trim() || null;
  const zip = String(req.body.zip || '').trim() || null;
  const city = String(req.body.city || '').trim() || null;
  const zipcity = ((zip || city) ? [zip, city].filter(Boolean).join(' ').trim() : String(req.body.zipcity || '').trim()) || null;
  const country = String(req.body.country || '').trim() || 'Schweiz';
  const notes = String(req.body.notes || '').trim() || null;
  const exxas_contact_id = String(req.body.exxas_contact_id || '').trim() || null;
  const exxas_customer_id = String(req.body.exxas_customer_id || '').trim() || null;
  const exxas_address_id = String(req.body.exxas_address_id || '').trim() || null;
  const blocked = req.body.blocked === '1';

  if (!company || !email) {
    return res.redirect(`/admin/customers/${id}?error=` + encodeURIComponent('Firma/Kunde und E-Mail sind Pflichtfelder.'));
  }

  try {
    const conflict = await pool.query(
      'SELECT id FROM core.customers WHERE LOWER(email)=$1 AND id<>$2', [email, id]
    );
    if (conflict.rows.length > 0) {
      return res.redirect(`/admin/customers/${id}?error=` + encodeURIComponent('Diese E-Mail wird bereits von einem anderen Kunden verwendet.'));
    }

    await pool.query(
      `UPDATE core.customers
       SET name=$1, email=$2, company=$3, phone=$4, street=$5, zipcity=$6,
           notes=$7, exxas_contact_id=$8, blocked=$9, salutation=$10, first_name=$11,
           onsite_name=$12, onsite_phone=$13, address_addon_1=$14, address_addon_2=$15,
           address_addon_3=$16, po_box=$17, zip=$18, city=$19, country=$20, phone_2=$21,
           phone_mobile=$22, phone_fax=$23, website=$24, exxas_customer_id=$25,
           exxas_address_id=$26, updated_at=NOW()
       WHERE id=$27`,
      [
        name, email, company, phone, street, zipcity, notes, exxas_contact_id, blocked,
        salutation, first_name, onsite_name, onsite_phone, address_addon_1, address_addon_2,
        address_addon_3, po_box, zip, city, country, phone_2, phone_mobile, phone_fax, website,
        exxas_customer_id, exxas_address_id, id,
      ]
    );
    res.redirect(`/admin/customers/${id}?flash=` + encodeURIComponent('Änderungen gespeichert.'));
  } catch (err) {
    console.error('[customers/:id POST]', err);
    res.redirect(`/admin/customers/${id}?error=` + encodeURIComponent('Fehler: ' + err.message));
  }
});

// POST /admin/customers/:id/delete – Kunden löschen
router.post('/customers/:id/delete', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).send('Ungültige ID');
  try {
    await pool.query('DELETE FROM core.customers WHERE id=$1', [id]);
    res.redirect('/admin/customers?flash=' + encodeURIComponent('Kunde gelöscht.'));
  } catch (err) {
    res.redirect(`/admin/customers/${id}?error=` + encodeURIComponent('Löschen fehlgeschlagen: ' + err.message));
  }
});

// POST /admin/customers/:id/contacts – Kontaktperson hinzufügen
router.post('/customers/:id/contacts', async (req, res) => {
  const customerId = parseInt(req.params.id);
  if (!customerId) return res.status(400).send('Ungültige ID');

  const salutation = String(req.body.salutation || '').trim() || null;
  const first_name = String(req.body.first_name || '').trim() || null;
  const last_name = String(req.body.last_name || '').trim();
  const fallbackName = String(req.body.name || '').trim();
  const name = [first_name, last_name].filter(Boolean).join(' ').trim() || fallbackName;
  const role = String(req.body.role || '').trim() || null;
  const department = String(req.body.department || '').trim() || null;
  const email = String(req.body.email || '').trim().toLowerCase() || null;
  const phone = String(req.body.phone || req.body.phone_direct || '').trim() || null;
  const phone_mobile = String(req.body.phone_mobile || '').trim() || null;

  if (!name) {
    return res.redirect(`/admin/customers/${customerId}?error=` + encodeURIComponent('Name ist ein Pflichtfeld.'));
  }

  try {
    await pool.query(
      `INSERT INTO core.customer_contacts (
         customer_id, name, role, email, phone, created_at,
         salutation, first_name, last_name, phone_mobile, department
       )
       VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8,$9,$10)`,
      [customerId, name, role, email, phone, salutation, first_name, last_name || null, phone_mobile, department]
    );
    res.redirect(`/admin/customers/${customerId}?flash=` + encodeURIComponent('Kontaktperson hinzugefügt.'));
  } catch (err) {
    res.redirect(`/admin/customers/${customerId}?error=` + encodeURIComponent('Fehler: ' + err.message));
  }
});

// POST /admin/customers/:id/contacts/:cid/delete – Kontaktperson löschen
router.post('/customers/:id/contacts/:cid/delete', async (req, res) => {
  const customerId  = parseInt(req.params.id);
  const contactId   = parseInt(req.params.cid);
  try {
    await pool.query(
      'DELETE FROM core.customer_contacts WHERE id=$1 AND customer_id=$2',
      [contactId, customerId]
    );
    res.redirect(`/admin/customers/${customerId}?flash=` + encodeURIComponent('Kontakt gelöscht.'));
  } catch (err) {
    res.redirect(`/admin/customers/${customerId}?error=` + encodeURIComponent('Fehler: ' + err.message));
  }
});

// POST /admin/customers/:id/contacts/:cid/portal-role – Portal-Rolle einer Kontaktperson setzen
router.post('/customers/:id/contacts/:cid/portal-role', async (req, res) => {
  const customerId = parseInt(req.params.id);
  const contactId  = parseInt(req.params.cid);
  const newRole    = String(req.body.portal_role || '').trim().toLowerCase();
  // Erlaubte Rollen: '', 'mitarbeiter', 'admin'
  const validRoles = ['', 'mitarbeiter', 'admin'];
  if (!validRoles.includes(newRole)) {
    return res.redirect(`/admin/customers/${customerId}?error=` + encodeURIComponent('Ungültige Rolle.'));
  }

  try {
    await portalTeam.ensurePortalTeamSchema();

    // Kontakt laden um member_email und owner_email (= Kunden-Email) zu ermitteln
    const [contR, custR] = await Promise.all([
      pool.query('SELECT * FROM core.customer_contacts WHERE id=$1 AND customer_id=$2', [contactId, customerId]),
      pool.query('SELECT email FROM core.customers WHERE id=$1', [customerId]),
    ]);
    if (!contR.rows.length || !custR.rows.length) {
      return res.redirect(`/admin/customers/${customerId}?error=` + encodeURIComponent('Kontakt oder Kunde nicht gefunden.'));
    }

    const memberEmail = String(contR.rows[0].email || '').trim().toLowerCase();
    const ownerEmail  = String(custR.rows[0].email || '').trim().toLowerCase();
    const displayName = String(contR.rows[0].name  || '').trim() || null;

    if (!memberEmail) {
      return res.redirect(`/admin/customers/${customerId}?error=` + encodeURIComponent('Kontakt hat keine E-Mail – Portal-Rolle kann nicht gesetzt werden.'));
    }

    if (newRole === '') {
      // Rolle entfernen: Eintrag löschen
      await pool.query(
        `DELETE FROM tour_manager.portal_team_members
         WHERE LOWER(owner_email)=$1 AND LOWER(member_email)=$2`,
        [ownerEmail, memberEmail]
      );
    } else {
      // Rolle setzen / aktualisieren (aktiv, accepted)
      await pool.query(
        `INSERT INTO tour_manager.portal_team_members
           (owner_email, member_email, display_name, role, status, accepted_at, created_at)
         VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())
         ON CONFLICT (lower(owner_email), lower(member_email)) DO UPDATE
           SET role = $4,
               status = 'active',
               display_name = COALESCE($3, tour_manager.portal_team_members.display_name),
               accepted_at  = COALESCE(tour_manager.portal_team_members.accepted_at, NOW())`,
        [ownerEmail, memberEmail, displayName, newRole]
      );
    }

    await runExternPortalSync(ownerEmail, memberEmail);

    const roleLabel = { '': 'entfernt', 'mitarbeiter': 'Mitarbeiter', 'admin': 'Kunden-Admin' }[newRole];
    res.redirect(`/admin/customers/${customerId}?flash=` + encodeURIComponent(`Portal-Rolle für ${memberEmail} auf „${roleLabel}" gesetzt.`));
  } catch (err) {
    console.error('[portal-role POST]', err);
    res.redirect(`/admin/customers/${customerId}?error=` + encodeURIComponent('Fehler: ' + err.message));
  }
});

module.exports = router;

