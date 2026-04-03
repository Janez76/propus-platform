/**
 * JSON-Admin-API für die React-SPA (Platform), gemountet unter /api/tours/admin.
 * Auth: requireAdmin (Session) — wird in platform/server.js davor gesetzt.
 */

const express = require('express');
const multer = require('multer');
const { pool } = require('../lib/db');
const phase3 = require('../lib/admin-phase3');
const matterport = require('../lib/matterport');
const exxas = require('../lib/exxas');
const { normalizeTourRow } = require('../lib/normalize');
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
const { logAction } = require('../lib/actions');
const { getAiConfig, chatWithAi } = require('../lib/ai');
const { listActionDefinitions, listRiskDefinitions } = require('../lib/admin-actions-schema');
const { sendMailDirect, getGraphConfig } = require('../lib/microsoft-graph');
const adminCustomersApi = require('../lib/admin-customers-api');
const portalRolesLib = require('../lib/admin-portal-roles');
const portalTeam = require('../lib/portal-team');
const {
  createAdminInvite,
  deleteAdminUserById,
  ensureAdminTeamSchema,
  listAdminAccessUsers,
  listPendingAdminInvites,
  revokeInviteById,
  setAdminUserActive,
  updateAdminUserById,
} = require('../lib/admin-team');
const {
  buildTourDetailApiPayload,
  loadTourById,
  ALLOWED_VISIBILITIES,
} = require('../lib/tour-detail-payload');
const adminLinkCustomer = require('../lib/admin-link-customer');

const bankDataUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const mt = String(file.mimetype || '').toLowerCase();
    const ok =
      name.endsWith('.xml') ||
      name.endsWith('.csv') ||
      mt.includes('xml') ||
      mt.includes('csv') ||
      mt === 'text/plain';
    cb(null, ok);
  },
});

const router = express.Router();

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

const SORT_COLUMNS = {
  customer: 'COALESCE(t.customer_name, t.kunde_ref, \'\'), COALESCE(t.object_label, t.bezeichnung, \'\')',
  ablaufdatum: 'COALESCE(t.term_end_date, t.ablaufdatum)',
  matterport_created: 'COALESCE(t.matterport_created_at, t.created_at)',
  days: '(COALESCE(t.term_end_date, t.ablaufdatum) - CURRENT_DATE)::int',
  status: 't.status',
};

const WIDGET_KEYS = [
  'total', 'expiringSoon', 'awaitingPayment', 'active', 'declined',
  'archived', 'unlinked', 'fremdeTouren', 'invoicesOffen', 'invoicesUeberfaellig', 'invoicesBezahlt',
];

// ─── GET /dashboard ───────────────────────────────────────────────────────────

router.get('/dashboard', async (req, res) => {
  try {
    await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_is_own BOOLEAN');

    const [
      matterportResult,
      linkedResult,
      recentToursRaw,
      expiringSoonRowsRaw,
      widgets,
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
      getDashboardWidgets(),
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

    return res.json({
      ok: true,
      openMatterportSpaces,
      recentTours: recentToursRaw.rows.map(normalizeTourRow),
      expiringSoonTours: expiringSoonRowsRaw.rows.map(normalizeTourRow),
      widgets,
      matterportError: matterportResult?.error || null,
    });
  } catch (err) {
    console.error('[admin-api] GET /dashboard', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

// ─── GET/PUT /dashboard/widgets ─────────────────────────────────────────────

router.get('/dashboard/widgets', async (req, res) => {
  try {
    const widgets = await getDashboardWidgets();
    return res.json({ ok: true, widgets });
  } catch (err) {
    console.error('[admin-api] GET /dashboard/widgets', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.put('/dashboard/widgets', async (req, res) => {
  try {
    const body = req.body || {};
    const current = await getDashboardWidgets();
    const widgets = { ...current };
    for (const k of WIDGET_KEYS) {
      if (typeof body[k] === 'boolean') {
        widgets[k] = body[k];
      }
    }
    const ok = await saveDashboardWidgets(widgets);
    if (!ok) return res.status(500).json({ error: 'Speichern fehlgeschlagen' });
    return res.json({ ok: true, widgets });
  } catch (err) {
    console.error('[admin-api] PUT /dashboard/widgets', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

// ─── GET /tours (Liste + Filter, analog admin.js) ────────────────────────────

router.get('/tours', async (req, res) => {
  try {
    await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_is_own BOOLEAN');
    await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS customer_verified BOOLEAN NOT NULL DEFAULT FALSE');

    const {
      status,
      expiringSoon,
      awaitingPayment,
      unlinkedOnly,
      fremdeOnly,
      activeRunning,
      unverifiedOnly,
      verifiedOnly,
      invoiceOpenOnly,
      invoiceOverdueOnly,
      noCustomerOnly,
      sort,
      order,
      q: search,
    } = req.query;

    const pageSize = 10;
    const requestedPage = Math.max(parseInt(String(req.query.page || ''), 10) || 1, 1);
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
      OR LOWER(COALESCE(t.tour_url, '')) LIKE $${i}
      OR CAST(t.id AS text) LIKE $${i}
    )`;
      filterParams.push(needle);
      i += 1;
    }

    const totalCountRes = await pool.query(`SELECT COUNT(*)::int AS cnt ${baseQ}`, filterParams);
    const totalItems = totalCountRes.rows[0]?.cnt || 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;
    const sortCol = SORT_COLUMNS[String(sort)] ? String(sort) : 'ablaufdatum';
    const sortDir = order === 'desc' ? 'DESC' : 'ASC';
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

    const stats = Object.fromEntries(counts.rows.map((c) => [c.status, c.cnt]));
    stats.expiringSoon = expiring.rows[0]?.cnt || 0;
    stats.unlinkedActive = unlinked.rows[0]?.cnt || 0;
    stats.fremdeTouren = fremde.rows[0]?.cnt || 0;
    stats.total = counts.rows.reduce((s, c) => s + c.cnt, 0);

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

      const displayed = getDisplayedTourStatus(tour, liveMatterportState);
      return {
        ...tour,
        live_matterport_state: liveMatterportState,
        displayed_status: displayed.code,
        displayed_status_label: displayed.label,
        displayed_status_note: displayed.note,
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

    return res.json({
      ok: true,
      tours: toursWithLiveMatterportState,
      filters: {
        status,
        expiringSoon,
        awaitingPayment,
        unlinkedOnly,
        fremdeOnly,
        activeRunning,
        unverifiedOnly,
        verifiedOnly,
        invoiceOpenOnly,
        invoiceOverdueOnly,
        noCustomerOnly,
        q: searchQuery,
      },
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
    });
  } catch (err) {
    console.error('[admin-api] GET /tours', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

// ─── Tour-Detail + Schreibaktionen (Phase 2) ─────────────────────────────────

router.get('/tours/:id', async (req, res) => {
  try {
    const payload = await buildTourDetailApiPayload(req.params.id);
    if (!payload) return res.status(404).json({ error: 'Tour nicht gefunden' });
    return res.json(payload);
  } catch (err) {
    console.error('[admin-api] GET /tours/:id', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

function adminEmail(req) {
  return String(req.session?.admin?.email || req.session?.admin?.username || '').trim() || 'admin';
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

function getAllowedChatModels() {
  return ['gpt-5.4', 'gpt-5-mini', 'gpt-4.1'];
}

router.post('/tours/:id/set-tour-url', async (req, res) => {
  try {
    const { id } = req.params;
    let tour_url = String(req.body?.tour_url ?? '').trim() || null;
    if (tour_url && !tour_url.toLowerCase().includes('my.matterport.com')) {
      tour_url = null;
    }
    await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_is_own BOOLEAN');
    await pool.query(
      `UPDATE tour_manager.tours SET tour_url = $1, matterport_is_own = NULL, updated_at = NOW() WHERE id = $2`,
      [tour_url, id]
    );
    await logAction(id, 'admin', null, 'ADMIN_SET_TOUR_URL', { tour_url });
    return res.json({ ok: true, tour_url: tour_url });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/tours/:id/set-name', async (req, res) => {
  try {
    const { id } = req.params;
    const name = String(req.body?.name || '').trim();
    const syncMatterport = req.body?.syncMatterport === true || req.body?.syncMatterport === '1';
    const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [id]);
    if (!tourResult.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });
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
    await logAction(id, 'admin', null, 'ADMIN_SET_NAME', { bezeichnung: bezeichnungVal, syncMatterport, nameSyncFailed });
    return res.json({ ok: true, nameSyncFailed });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/tours/:id/set-start-sweep', async (req, res) => {
  try {
    const { id } = req.params;
    const sweep = String(req.body?.start_sweep ?? '').trim() || null;
    const exists = await pool.query('SELECT id FROM tour_manager.tours WHERE id = $1 LIMIT 1', [id]);
    if (!exists.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });
    }
    await pool.query(
      `UPDATE tour_manager.tours SET matterport_start_sweep = $1, updated_at = NOW() WHERE id = $2`,
      [sweep, id]
    );
    await logAction(id, 'admin', null, 'ADMIN_SET_SWEEP', { start_sweep: sweep });
    return res.json({ ok: true, start_sweep: sweep });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/tours/:id/set-verified', async (req, res) => {
  try {
    const { id } = req.params;
    const verified = req.body?.verified === true || req.body?.verified === '1' || req.body?.verified === 1;
    await pool.query(
      `UPDATE tour_manager.tours SET customer_verified = $1, updated_at = NOW() WHERE id = $2`,
      [verified, id]
    );
    await logAction(id, 'admin', null, 'ADMIN_SET_VERIFIED', { verified });
    return res.json({ ok: true, verified });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/tours/:id/visibility', async (req, res) => {
  try {
    const { id } = req.params;
    const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [id]);
    const tourRow = normalizeTourRow(tourResult.rows[0] || null);
    if (!tourRow) {
      return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });
    }
    const spaceId = tourRow.canonical_matterport_space_id || tourRow.matterport_space_id || null;
    if (!spaceId) {
      return res.status(400).json({ ok: false, error: 'no_matterport', message: 'Kein Matterport-Space verknüpft' });
    }
    const visibility = String(req.body?.visibility || '').toUpperCase();
    if (!ALLOWED_VISIBILITIES.includes(visibility)) {
      return res.status(400).json({ ok: false, error: 'invalid_visibility' });
    }
    const password = visibility === 'PASSWORD'
      ? (String(req.body?.password || '').trim() || null)
      : undefined;
    const result = await matterport.setVisibility(spaceId, visibility, password);
    if (!result.success) {
      return res.status(400).json({ ok: false, error: 'visibility_failed', message: result.error || 'Matterport API' });
    }
    await logAction(id, 'admin', adminEmail(req), 'ADMIN_VISIBILITY', {
      visibility,
      hasPassword: !!password,
      spaceId,
    });
    return res.json({ ok: true, visibility });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
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
    await logAction(tour.id, 'admin', adminEmail(req), 'ARCHIVE_SPACE', {
      source: 'admin_api',
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
    await logAction(tour.id, 'admin', adminEmail(req), 'EXXAS_CANCEL_SUBSCRIPTION', {
      source: 'admin_api',
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
    await logAction(tour.id, 'admin', adminEmail(req), 'EXXAS_DEACTIVATE_CUSTOMER', {
      source: 'admin_api',
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
    await logAction(tour.id, 'admin', adminEmail(req), 'EXXAS_CANCEL_INVOICE', {
      source: 'admin_api',
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

// ─── Phase 3: Rechnungen, Bank-Import, Matterport, Rechnung linken ───────────

router.get('/invoices', async (req, res) => {
  try {
    const data = await phase3.getRenewalInvoicesJson(req.query.status);
    return res.json(data);
  } catch (err) {
    console.error('[admin-api] GET /invoices', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.get('/bank-import', async (req, res) => {
  try {
    const data = await phase3.getBankImportJson();
    return res.json(data);
  } catch (err) {
    console.error('[admin-api] GET /bank-import', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.post('/bank-import/upload', bankDataUpload.single('bankFile'), async (req, res) => {
  try {
    const actorEmail = adminEmail(req);
    const result = await phase3.runBankImportUpload({
      buffer: req.file?.buffer,
      originalname: req.file?.originalname,
      actorEmail,
    });
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    console.error('[admin-api] bank-import/upload', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/bank-import/transactions/:id/confirm', async (req, res) => {
  try {
    const txId = parseInt(String(req.params.id || ''), 10);
    const invoiceId = String(req.body?.invoiceId || '').trim();
    const result = await phase3.confirmBankTransaction(txId, invoiceId, adminEmail(req));
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/bank-import/transactions/:id/ignore', async (req, res) => {
  try {
    const txId = parseInt(String(req.params.id || ''), 10);
    const result = await phase3.ignoreBankTransaction(txId);
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/tours/:id/invoices/create-manual', async (req, res) => {
  try {
    const tourId = parseInt(req.params.id, 10);
    const result = await phase3.createManualInvoice(tourId, req.body || {}, adminEmail(req));
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/tours/:id/invoices/:invoiceId/mark-paid-manual', async (req, res) => {
  try {
    const tourId = parseInt(req.params.id, 10);
    const invoiceId = parseInt(req.params.invoiceId, 10);
    const result = await phase3.markPaidManualInvoice(tourId, invoiceId, req.body || {}, adminEmail(req));
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/tours/:id/invoices/:invoiceId/pdf', async (req, res) => {
  try {
    const tourId = parseInt(String(req.params.id || ''), 10);
    const invoiceId = String(req.params.invoiceId || '').trim();
    if (!Number.isFinite(tourId) || !invoiceId) {
      return res.status(400).send('Ungültige Parameter');
    }
    await phase3.streamRenewalInvoicePdf(res, tourId, invoiceId);
  } catch (err) {
    console.error('[admin-api] pdf', err);
    if (!res.headersSent) res.status(500).send('PDF-Fehler');
  }
});

router.get('/link-matterport/customer-search', async (req, res) => {
  try {
    const data = await phase3.getLinkMatterportCustomerSearchJson(req.query.q);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/link-matterport/customer-detail', async (req, res) => {
  try {
    const data = await phase3.getLinkMatterportCustomerDetailJson(req.query.customerId);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/link-matterport', async (req, res) => {
  try {
    const data = await phase3.getLinkMatterportJson(req.query);
    return res.json(data);
  } catch (err) {
    console.error('[admin-api] GET /link-matterport', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.get('/link-matterport/booking-search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 1) return res.json({ orders: [] });
    const isNumeric = /^\d+$/.test(q);
    let rows;
    if (isNumeric) {
      const r = await pool.query(
        `SELECT o.id, o.order_no, o.status, o.address, o.billing, o.services, o.schedule, o.created_at
         FROM booking.orders o
         WHERE o.order_no = $1
         ORDER BY o.created_at DESC
         LIMIT 10`,
        [parseInt(q, 10)]
      );
      rows = r.rows;
    } else {
      const like = `%${q.toLowerCase()}%`;
      const r = await pool.query(
        `SELECT o.id, o.order_no, o.status, o.address, o.billing, o.services, o.schedule, o.created_at
         FROM booking.orders o
         WHERE LOWER(o.address) LIKE $1
           OR LOWER(COALESCE(o.billing->>'company', '')) LIKE $1
           OR LOWER(COALESCE(o.billing->>'name', '')) LIKE $1
           OR LOWER(COALESCE(o.billing->>'email', '')) LIKE $1
         ORDER BY o.created_at DESC
         LIMIT 10`,
        [like]
      );
      rows = r.rows;
    }
    // Kunden aus core.customers per E-Mail nachschlagen
    const emails = [...new Set(rows.map(r => (r.billing?.email || '')).filter(Boolean))];
    const coreCustomerByEmail = new Map();
    if (emails.length > 0) {
      try {
        const custRows = await pool.query(
          `SELECT c.id, c.company, c.name, c.email, c.customer_number
           FROM core.customers c
           WHERE LOWER(c.email) = ANY($1::text[])`,
          [emails.map(e => e.toLowerCase())]
        );
        for (const c of custRows.rows) {
          coreCustomerByEmail.set((c.email || '').toLowerCase(), c);
        }
        // Kontakte für gefundene Kunden laden
        const custIds = [...new Set(custRows.rows.map(c => c.id))];
        if (custIds.length > 0) {
          const ctRows = await pool.query(
            `SELECT customer_id, id, name, email, phone
             FROM core.customer_contacts
             WHERE customer_id = ANY($1::int[])
             ORDER BY sort_order NULLS LAST, id`,
            [custIds]
          );
          const contactsByCustId = new Map();
          for (const ct of ctRows.rows) {
            if (!contactsByCustId.has(ct.customer_id)) contactsByCustId.set(ct.customer_id, []);
            contactsByCustId.get(ct.customer_id).push({ name: ct.name, email: ct.email, tel: ct.phone });
          }
          for (const c of custRows.rows) {
            const existing = coreCustomerByEmail.get((c.email || '').toLowerCase());
            if (existing) existing.contacts = contactsByCustId.get(c.id) || [];
          }
        }
      } catch (e) {
        console.warn('[admin-api] booking-search customer lookup:', e.message);
      }
    }
    const orders = rows.map((r) => {
      const billingEmail = (r.billing?.email || '').toLowerCase();
      const cust = coreCustomerByEmail.get(billingEmail) || null;
      return {
        id: r.id,
        order_no: r.order_no,
        status: r.status,
        address: r.address,
        company: r.billing?.company || '',
        email: r.billing?.company_email || r.billing?.email || '',
        contactSalutation: r.billing?.salutation || '',
        contactFirstName: r.billing?.first_name || '',
        contactName: r.billing?.name || '',
        contactEmail: r.billing?.email || '',
        contactPhone: r.billing?.phone || '',
        date: r.schedule?.date || null,
        created_at: r.created_at,
        coreCustomerId: cust ? String(cust.id) : null,
        coreCompany: cust ? (cust.company || cust.name || '') : '',
        coreEmail: cust ? (cust.email || '') : '',
        contacts: cust ? (cust.contacts || []) : [],
      };
    });
    return res.json({ orders });
  } catch (err) {
    console.error('[admin-api] GET /link-matterport/booking-search', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.post('/link-matterport', async (req, res) => {
  try {
    const result = await phase3.postLinkMatterport(req.body || {});
    if (!result.ok) {
      const code = result.error === 'duplicate' ? 409 : 400;
      return res.status(code).json(result);
    }
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/link-matterport/auto', async (req, res) => {
  try {
    const result = await phase3.postLinkMatterportAuto();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/link-matterport/refresh-created', async (req, res) => {
  try {
    const result = await phase3.postLinkMatterportRefreshCreated();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/link-matterport/sync-status', async (req, res) => {
  try {
    const result = await phase3.postLinkMatterportSyncStatus();
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/link-matterport/check-ownership', async (req, res) => {
  try {
    const result = await phase3.postLinkMatterportCheckOwnership();
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/tours/:id/link-exxas-customer', async (req, res) => {
  try {
    const data = await adminLinkCustomer.getLinkExxasCustomerPageJson(req.params.id);
    if (!data.ok) return res.status(404).json({ ok: false, error: data.error || 'not_found' });
    return res.json({ ok: true, tour: data.tour });
  } catch (err) {
    console.error('[admin-api] link-exxas-customer GET', err);
    return res.status(500).json({ ok: false, error: 'Interner Fehler' });
  }
});

router.get('/tours/:id/link-customer/autocomplete', async (req, res) => {
  try {
    const { customers } = await adminLinkCustomer.getLinkCustomerAutocompleteJson(req.query.q);
    return res.json({ customers });
  } catch (err) {
    return res.json({ customers: [] });
  }
});

router.post('/tours/:id/link-exxas-customer', async (req, res) => {
  try {
    const result = await adminLinkCustomer.postLinkExxasCustomerJson(req.params.id, req.body || {});
    if (!result.ok) {
      const st = result.error === 'not_found' ? 404 : 400;
      return res.status(st).json({ ok: false, error: result.error || 'failed' });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/tours/:id/link-invoice', async (req, res) => {
  try {
    const data = await phase3.getLinkInvoiceJson(req.params.id, req.query.search);
    if (!data.ok) return res.status(404).json(data);
    return res.json(data);
  } catch (err) {
    console.error('[admin-api] link-invoice GET', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.post('/tours/:id/link-invoice', async (req, res) => {
  try {
    const invoiceId = req.body?.invoice_id ?? req.body?.invoiceId;
    const result = await phase3.postLinkInvoice(req.params.id, invoiceId);
    if (!result.ok) {
      const st = result.error === 'notfound' ? 404 : result.error === 'alreadylinked' ? 409 : 400;
      return res.status(st).json(result);
    }
    await logAction(req.params.id, 'admin', null, 'ADMIN_LINK_INVOICE', { invoice_id: invoiceId });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// ─── Kunden (core.customers) ──────────────────────────────────────────────────

router.get('/customers/exxas-search', async (req, res) => {
  try {
    const data = await adminCustomersApi.getExxasCustomerSearchJson(req.query.q);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/customers', async (req, res) => {
  try {
    const data = await adminCustomersApi.getCustomersListJson(req.query);
    return res.json(data);
  } catch (err) {
    console.error('[admin-api] GET /customers', err);
    return res.status(500).json({ ok: false, error: 'Interner Fehler' });
  }
});

router.post('/customers', async (req, res) => {
  try {
    const result = await adminCustomersApi.postCustomerNewJson(req.body || {});
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/customers/:id', async (req, res) => {
  try {
    const data = await adminCustomersApi.getCustomerDetailJson(req.params.id);
    if (!data.ok) return res.status(data.error === 'not_found' ? 404 : 400).json(data);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/customers/:id', async (req, res) => {
  try {
    const result = await adminCustomersApi.postCustomerUpdateJson(req.params.id, req.body || {});
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete('/customers/:id', async (req, res) => {
  try {
    const result = await adminCustomersApi.postCustomerDeleteJson(req.params.id);
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/customers/:id/contacts', async (req, res) => {
  try {
    const result = await adminCustomersApi.postCustomerContactAddJson(req.params.id, req.body || {});
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete('/customers/:id/contacts/:contactId', async (req, res) => {
  try {
    const result = await adminCustomersApi.postCustomerContactDeleteJson(req.params.id, req.params.contactId);
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/customers/:id/contacts/:contactId/portal-role', async (req, res) => {
  try {
    const result = await adminCustomersApi.postCustomerContactPortalRoleJson(
      req.params.id,
      req.params.contactId,
      req.body || {}
    );
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// ─── Portal-Rollen ────────────────────────────────────────────────────────────

router.get('/portal-roles', async (req, res) => {
  try {
    const data = await portalRolesLib.loadPortalRolesSnapshot(req.query.tab);
    return res.json({ ok: true, ...data });
  } catch (err) {
    console.error('[admin-api] portal-roles', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/portal-roles/extern-contacts', async (req, res) => {
  try {
    const data = await portalRolesLib.getPortalExternContactsJson(req.query.owner_email, req.query.customer_id);
    if (!data.ok) return res.status(500).json(data);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message, contacts: [] });
  }
});

router.post('/portal-roles/staff/add', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    const inviter = String(req.session?.admin?.email || req.session?.adminEmail || '')
      .trim()
      .toLowerCase();
    await portalTeam.addPortalStaffRole(email, portalTeam.ROLE_TOUR_MANAGER, inviter || null);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || 'Fehler' });
  }
});

router.post('/portal-roles/staff/remove', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    await portalTeam.removePortalStaffRole(email, portalTeam.ROLE_TOUR_MANAGER);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || 'Fehler' });
  }
});

router.post('/portal-roles/extern/set', async (req, res) => {
  try {
    const ownerEmail = String(req.body?.owner_email || '').trim().toLowerCase();
    const memberEmail = String(req.body?.member_email || '').trim().toLowerCase();
    if (!ownerEmail || !memberEmail) {
      return res.status(400).json({ ok: false, error: 'owner_email und member_email erforderlich.' });
    }
    if (!memberEmail.includes('@')) {
      return res.status(400).json({ ok: false, error: 'Ungültige E-Mail-Adresse.' });
    }

    await portalTeam.ensurePortalTeamSchema();
    const ownerCustomerId = await portalTeam.resolveCustomerIdForOwnerEmail(ownerEmail);

    if (ownerCustomerId) {
      await pool.query(
        `
        INSERT INTO tour_manager.portal_team_members
          (owner_email, member_email, role, status, accepted_at, created_at, customer_id)
        VALUES ($1, TRIM($2), 'admin', 'active', NOW(), NOW(), $3)
        ON CONFLICT (customer_id, (LOWER(TRIM(member_email)))) WHERE customer_id IS NOT NULL DO UPDATE
          SET role = 'admin', status = 'active',
              accepted_at = COALESCE(tour_manager.portal_team_members.accepted_at, NOW()),
              owner_email = EXCLUDED.owner_email
      `,
        [ownerEmail, memberEmail, ownerCustomerId]
      );
    } else {
      await pool.query(
        `
        INSERT INTO tour_manager.portal_team_members
          (owner_email, member_email, role, status, accepted_at, created_at)
        VALUES ($1, $2, 'admin', 'active', NOW(), NOW())
        ON CONFLICT (lower(owner_email), lower(member_email)) DO UPDATE
          SET role = 'admin', status = 'active', accepted_at = COALESCE(tour_manager.portal_team_members.accepted_at, NOW())
      `,
        [ownerEmail, memberEmail]
      );
    }

    await portalRolesLib.runExternPortalSync(ownerEmail, memberEmail);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || 'Fehler' });
  }
});

router.post('/portal-roles/extern/remove', async (req, res) => {
  try {
    const ownerEmail = String(req.body?.owner_email || '').trim().toLowerCase();
    const memberEmail = String(req.body?.member_email || '').trim().toLowerCase();
    if (!ownerEmail || !memberEmail) {
      return res.status(400).json({ ok: false, error: 'Fehlende Parameter.' });
    }

    await portalTeam.ensurePortalTeamSchema();
    const ownerCustomerId = await portalTeam.resolveCustomerIdForOwnerEmail(ownerEmail);

    if (ownerCustomerId) {
      await pool.query(
        `
        UPDATE tour_manager.portal_team_members
        SET role = 'mitarbeiter'
        WHERE customer_id = $1 AND LOWER(TRIM(member_email)) = $2
      `,
        [ownerCustomerId, memberEmail]
      );
    } else {
      await pool.query(
        `
        UPDATE tour_manager.portal_team_members
        SET role = 'mitarbeiter'
        WHERE LOWER(owner_email) = $1 AND LOWER(member_email) = $2
      `,
        [ownerEmail, memberEmail]
      );
    }

    await portalRolesLib.runExternPortalSync(ownerEmail, memberEmail);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || 'Fehler' });
  }
});

// ─── Tour-Manager Einstellungen / Templates / Automationen / Team ─────────────

router.get('/tour-settings', async (req, res) => {
  try {
    const [widgets, aiPromptSettings, matterportStored, aiConfig] = await Promise.all([
      getDashboardWidgets(),
      getAiPromptSettings(),
      getMatterportApiCredentials(),
      Promise.resolve(getAiConfig()),
    ]);
    const exxasBase = (process.env.EXXAS_BASE_URL || 'https://api.exxas.net').replace(/\/$/, '');
    return res.json({
      ok: true,
      widgets,
      aiPromptSettings,
      matterportStored: {
        tokenId: matterportStored.tokenId || '',
        hasSecret: !!matterportStored.tokenSecret,
      },
      aiConfig: { model: aiConfig.model || 'gpt-5.4' },
      allowedChatModels: getAllowedChatModels(),
      actionDefinitions: listActionDefinitions(),
      riskDefinitions: listRiskDefinitions(),
      exxasBase,
    });
  } catch (err) {
    console.error('[admin-api] tour-settings GET', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/tour-settings', async (req, res) => {
  try {
    const body = req.body || {};
    const widgetKeys = new Set([
      'total', 'expiringSoon', 'awaitingPayment', 'active', 'declined',
      'archived', 'unlinked', 'fremdeTouren', 'invoicesOffen', 'invoicesUeberfaellig', 'invoicesBezahlt',
    ]);
    if (body.widgets && typeof body.widgets === 'object') {
      const current = await getDashboardWidgets();
      const merged = { ...current };
      for (const k of Object.keys(body.widgets)) {
        if (widgetKeys.has(k)) merged[k] = !!body.widgets[k];
      }
      await saveDashboardWidgets(merged);
    }

    if (body.matterport && typeof body.matterport === 'object') {
      const mp = body.matterport;
      await saveMatterportApiCredentials({
        clearStored: mp.clearStored === true || mp.clearStored === '1',
        tokenId: mp.tokenId,
        tokenSecret: mp.tokenSecret,
      });
      matterport.invalidateMatterportCredentialsCache();
    }

    if (body.aiPrompt && typeof body.aiPrompt === 'object') {
      await saveAiPromptSettings({
        mailSystemPrompt: body.aiPrompt.mailSystemPrompt || '',
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/email-templates', async (req, res) => {
  try {
    const templates = await getEmailTemplates();
    return res.json({
      ok: true,
      templates,
      defaultTemplates: DEFAULT_EMAIL_TEMPLATES,
      placeholderHints: {
        renewal_request: [
          'objectLabel', 'customerGreeting', 'tourLinkHtml', 'tourLinkText', 'termEndFormatted',
          'portalUrl', 'portalLinkHtml', 'portalLinkText', 'createdAt', 'amount', 'yesUrl', 'noUrl',
        ],
        payment_confirmed: ['objectLabel', 'customerGreeting', 'tourLinkHtml', 'tourLinkText', 'termEndFormatted', 'portalUrl', 'portalLinkHtml', 'portalLinkText'],
        expiry_reminder: ['objectLabel', 'customerGreeting', 'tourLinkHtml', 'tourLinkText', 'termEndFormatted', 'portalUrl', 'portalLinkHtml', 'portalLinkText'],
        extension_confirmed: ['objectLabel', 'customerGreeting', 'tourLinkHtml', 'tourLinkText', 'termEndFormatted', 'portalUrl', 'portalLinkHtml', 'portalLinkText'],
        reactivation_confirmed: ['objectLabel', 'customerGreeting', 'tourLinkHtml', 'tourLinkText', 'termEndFormatted', 'portalUrl', 'portalLinkHtml', 'portalLinkText'],
        archive_notice: ['objectLabel', 'customerGreeting', 'tourLinkHtml', 'tourLinkText', 'termEndFormatted', 'portalUrl', 'portalLinkHtml', 'portalLinkText'],
        payment_failed: ['objectLabel', 'customerGreeting', 'tourLinkHtml', 'tourLinkText', 'termEndFormatted', 'portalUrl', 'portalLinkHtml', 'portalLinkText'],
        team_invite: ['inviteLink', 'invitedByEmail', 'appName'],
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/email-templates', async (req, res) => {
  try {
    const incoming = req.body?.templates;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ ok: false, error: 'templates object required' });
    }
    const templates = {};
    for (const key of Object.keys(DEFAULT_EMAIL_TEMPLATES)) {
      const tIn = incoming[key] || {};
      const def = DEFAULT_EMAIL_TEMPLATES[key];
      templates[key] = {
        subject: typeof tIn.subject === 'string' ? (tIn.subject.trim() || def?.subject) : def?.subject,
        html: typeof tIn.html === 'string' ? (tIn.html.trim() || def?.html) : def?.html,
        text: typeof tIn.text === 'string' ? (tIn.text.trim() || def?.text) : def?.text,
      };
    }
    await saveEmailTemplates(templates);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/automations', async (req, res) => {
  try {
    const [automationSettings, templates] = await Promise.all([
      getAutomationSettings(),
      getEmailTemplates(),
    ]);
    return res.json({ ok: true, automationSettings, templates });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.put('/automations', async (req, res) => {
  try {
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
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/team', async (req, res) => {
  try {
    await ensureAdminTeamSchema();
    const [users, pendingInvites] = await Promise.all([
      listAdminAccessUsers(),
      listPendingAdminInvites(),
    ]);
    return res.json({ ok: true, users, pendingInvites });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/team/invite', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const expiresDays = Math.max(1, parseInt(String(req.body?.expiresDays || '7'), 10) || 7);
  if (!email || !email.includes('@')) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
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
    const placeholders = { inviteLink, invitedByEmail, appName: 'Propus Tour Manager' };
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
      return res.status(400).json({ ok: false, error: 'invite_mail_failed' });
    }
    return res.json({ ok: true });
  } catch {
    return res.status(400).json({ ok: false, error: 'invite_failed' });
  }
});

router.post('/team/toggle-active', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const action = String(req.body?.action || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }
  if (!['enable', 'disable'].includes(action)) {
    return res.status(400).json({ ok: false, error: 'invalid_action' });
  }
  const ok = await setAdminUserActive(email, action === 'enable');
  if (!ok) return res.status(400).json({ ok: false, error: 'user_not_found' });
  return res.json({ ok: true });
});

router.post('/team/invites/:id/revoke', async (req, res) => {
  const ok = await revokeInviteById(req.params.id);
  if (!ok) return res.status(400).json({ ok: false, error: 'invite_not_found' });
  return res.json({ ok: true });
});

router.put('/team/users/:id', async (req, res) => {
  const userId = parseInt(String(req.params?.id || ''), 10);
  if (!Number.isFinite(userId)) return res.status(400).json({ ok: false, error: 'invalid_user' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim();
  const rawPassword = String(req.body?.password || '');
  const password = rawPassword && rawPassword !== '********' ? rawPassword : '';

  const result = await updateAdminUserById(userId, { email, name, password });
  if (!result.ok) return res.status(400).json({ ok: false, error: result.code || 'update_failed' });

  const currentEmail = String(req.session?.admin?.email || req.session?.adminEmail || '').trim().toLowerCase();
  const previousEmail = String(result.previousEmail || '').toLowerCase();
  const updatedEmail = String(result.email || '').toLowerCase();
  if (currentEmail && (currentEmail === previousEmail || currentEmail === updatedEmail)) {
    if (req.session?.admin) req.session.admin.email = result.email;
    if (req.session) req.session.adminEmail = result.email;
  }
  return res.json({ ok: true });
});

router.delete('/team/users/:id', async (req, res) => {
  const userId = parseInt(String(req.params?.id || ''), 10);
  if (!Number.isFinite(userId)) return res.status(400).json({ ok: false, error: 'invalid_user' });

  const result = await deleteAdminUserById(userId);
  if (!result.ok) return res.status(400).json({ ok: false, error: result.code || 'delete_failed' });

  const currentEmail = String(req.session?.admin?.email || req.session?.adminEmail || '').trim().toLowerCase();
  if (currentEmail && currentEmail === String(result.email || '').toLowerCase()) {
    req.session.destroy(() => null);
    return res.json({ ok: true, loggedOut: true });
  }
  return res.json({ ok: true });
});

/** KI-Chat (nur generative Antwort, ohne Schreib-Aktionen wie in EJS /chat-assistant) */
router.get('/ai-chat-config', async (req, res) => {
  const rawEmail = String(req.session?.admin?.email || '').trim().toLowerCase();
  const emailLocal = rawEmail.includes('@') ? rawEmail.split('@')[0] : rawEmail;
  const adminName = emailLocal
    ? emailLocal
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : 'Admin';
  const aiConfig = getAiConfig();
  return res.json({
    ok: true,
    adminName,
    allowedModels: getAllowedChatModels(),
    defaultModel: aiConfig.model || 'gpt-5.4',
  });
});

router.post('/ai-chat', async (req, res) => {
  const userMessage = String(req.body?.message || '').trim();
  if (!userMessage) {
    return res.status(400).json({ ok: false, error: 'Keine Frage angegeben' });
  }
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-12) : [];
  const requestedModel = String(req.body?.model || '').trim();
  const ALLOWED_MODELS = getAllowedChatModels();
  const aiConfig = getAiConfig();
  const chosenModel = ALLOWED_MODELS.includes(requestedModel)
    ? requestedModel
    : (aiConfig.model || 'gpt-5.4');

  const systemContext = [
    `Admin: ${adminEmail(req)}`,
    `Pfad: ${String(req.body?.path || '')}`,
    'Kontext: Tour Manager, Touren, Exxas, Matterport. Antworte knapp und auf Deutsch.',
  ].join('\n');

  const { answer, error } = await chatWithAi({
    systemContext,
    history,
    userMessage,
    model: chosenModel,
  });

  if (error) {
    return res.status(500).json({ ok: false, error });
  }
  return res.json({ ok: true, answer, model: chosenModel });
});

// Tours by booking order number (returns all linked tours)
router.get('/tours/by-order/:orderNo', async (req, res) => {
  try {
    const orderNo = parseInt(String(req.params.orderNo || ''), 10);
    if (!Number.isFinite(orderNo) || orderNo < 1) return res.json({ tours: [] });
    const result = await pool.query(
      `SELECT id, bezeichnung, tour_url, matterport_space_id, status, booking_order_no
       FROM tour_manager.tours
       WHERE booking_order_no = $1
       ORDER BY id DESC`,
      [orderNo]
    );
    return res.json({
      tours: result.rows.map((t) => ({
        id: t.id,
        bezeichnung: t.bezeichnung || '',
        tourUrl: t.tour_url || '',
        matterportSpaceId: t.matterport_space_id || '',
        status: t.status || '',
        bookingOrderNo: t.booking_order_no,
      })),
    });
  } catch (err) {
    console.error('[admin-api] GET /tours/by-order/:orderNo', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Admin Impersonation (Kunden-Vorschau) ──────────────────────────────────

router.post('/impersonate', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ ok: false, error: 'Ungültige E-Mail' });
  }
  req.session.portalCustomerEmail = email;
  req.session.portalCustomerName  = email;
  req.session.isAdminImpersonating = true;
  req.session.save((err) => {
    if (err) return res.status(500).json({ ok: false, error: 'Session-Fehler' });
    res.json({ ok: true, email });
  });
});

router.post('/impersonate/stop', (req, res) => {
  delete req.session.portalCustomerEmail;
  delete req.session.portalCustomerName;
  delete req.session.isAdminImpersonating;
  req.session.save((err) => {
    if (err) return res.status(500).json({ ok: false, error: 'Session-Fehler' });
    res.json({ ok: true });
  });
});

module.exports = router;
