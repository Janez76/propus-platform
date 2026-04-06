/**
 * JSON-Admin-API für die React-SPA (Platform), gemountet unter /api/tours/admin.
 * Auth: requireAdmin (Session) — wird in platform/server.js davor gesetzt.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../lib/db');
const phase3 = require('../lib/admin-phase3');
const matterport = require('../lib/matterport');
const exxas = require('../lib/exxas');
const { normalizeTourRow } = require('../lib/normalize');
const { validatePropusMatterportTourUrl } = require('../lib/matterport-tour-url');
const {
  getDashboardWidgets,
  saveDashboardWidgets,
  getAiPromptSettings,
  saveAiPromptSettings,
  getMatterportApiCredentials,
  saveMatterportApiCredentials,
  saveExxasRuntimeConfig,
  getAutomationSettings,
  saveAutomationSettings,
  getEmailTemplates,
  saveEmailTemplates,
  DEFAULT_EMAIL_TEMPLATES,
  getInvoiceCreditor,
  saveInvoiceCreditor,
  DEFAULT_INVOICE_CREDITOR,
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
const payrexx = require('../lib/payrexx');
const tourActions = require('../lib/tour-actions');
const {
  REACTIVATION_PRICE_CHF,
  getPortalPricingForTour,
  getSubscriptionWindowFromStart,
} = require('../lib/subscriptions');

const ADMIN_PORTAL_BASE_URL = process.env.PORTAL_BASE_URL || 'https://tour.propus.ch';

let adminRenewalSchemaEnsured = false;
async function ensureAdminRenewalSchema() {
  if (adminRenewalSchemaEnsured) return;
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS payrexx_payment_url TEXT`);
  adminRenewalSchemaEnsured = true;
}

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
      noCustomerRaw,
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
      pool.query(`
      SELECT t.*
      FROM tour_manager.tours t
      WHERE t.status IN ('ACTIVE','EXPIRING_SOON')
        AND (t.customer_id IS NULL OR t.customer_id = 0)
        AND (t.kunde_ref IS NULL OR TRIM(t.kunde_ref) = '')
      ORDER BY t.created_at DESC NULLS LAST, t.id DESC
      LIMIT 10
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
      toursWithoutCustomer: noCustomerRaw.rows.map(normalizeTourRow),
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
      baseQ += ` AND (t.customer_id IS NULL OR t.customer_id = 0)
               AND (t.kunde_ref IS NULL OR TRIM(t.kunde_ref) = '')
               AND (t.customer_name IS NULL OR TRIM(t.customer_name) = '')
               AND (t.customer_email IS NULL OR TRIM(t.customer_email) = '')`;
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
    const sortCol = SORT_COLUMNS[String(sort)] ? String(sort) : 'matterport_created';
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';
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
      WHERE (t.customer_id IS NULL OR t.customer_id = 0)
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
      const hasFormalCustomerLink =
        (Number(tour.customer_id) > 0 && Number.isFinite(Number(tour.customer_id))) ||
        !!(tour.kunde_ref && String(tour.kunde_ref).trim());
      const hasCustomerConnection =
        hasFormalCustomerLink ||
        !!(tour.customer_name || tour.customer_email || tour.customer_contact);
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
    const v = validatePropusMatterportTourUrl(req.body?.tour_url);
    if (!v.ok) {
      return res.status(400).json({ ok: false, error: v.error });
    }
    const tour_url = v.tour_url;
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

router.post('/tours/:id/set-confirmation-required', async (req, res) => {
  try {
    const { id } = req.params;
    const required = req.body?.required === true || req.body?.required === '1' || req.body?.required === 1;
    await pool.query(
      `UPDATE tour_manager.tours SET confirmation_required = $1, updated_at = NOW() WHERE id = $2`,
      [required, id]
    );
    await logAction(id, 'admin', adminEmail(req), 'ADMIN_SET_CONFIRMATION_REQUIRED', { required });
    return res.json({ ok: true, confirmation_required: required });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/tours/:id/customer-orders', async (req, res) => {
  try {
    const { id } = req.params;
    const tourResult = await pool.query('SELECT customer_id FROM tour_manager.tours WHERE id = $1 LIMIT 1', [id]);
    if (!tourResult.rows[0]) return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });
    const customerId = Number(tourResult.rows[0].customer_id);
    if (!Number.isFinite(customerId) || customerId <= 0) {
      return res.json({ ok: true, orders: [], needsCustomer: true });
    }
    const bookingDb = require('../../booking/db');
    const orders = await bookingDb.getOrdersForCustomerId(customerId);
    return res.json({ ok: true, orders, needsCustomer: false });
  } catch (err) {
    console.error('[admin-api] GET /tours/:id/customer-orders', err);
    return res.status(500).json({ ok: false, error: 'Interner Fehler' });
  }
});

router.post('/tours/:id/set-booking-order', async (req, res) => {
  try {
    const { id } = req.params;
    const orderNo = parseInt(String(req.body?.orderNo ?? ''), 10);
    if (!Number.isFinite(orderNo) || orderNo <= 0) {
      return res.status(400).json({ ok: false, error: 'Ungültige Bestellnummer' });
    }
    const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [id]);
    if (!tourResult.rows[0]) return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });
    const tour = normalizeTourRow(tourResult.rows[0]);
    const customerId = Number(tour.customer_id);
    if (!Number.isFinite(customerId) || customerId <= 0) {
      return res.status(400).json({ ok: false, error: 'Tour hat keinen verknüpften Kunden' });
    }
    const bookingDb = require('../../booking/db');
    const orders = await bookingDb.getOrdersForCustomerId(customerId);
    const valid = orders.some((o) => Number(o.orderNo) === orderNo);
    if (!valid) {
      return res.status(400).json({ ok: false, error: 'Bestellung gehört nicht zum verknüpften Kunden' });
    }
    await pool.query(
      'UPDATE tour_manager.tours SET booking_order_no = $1, updated_at = NOW() WHERE id = $2',
      [orderNo, id]
    );
    await logAction(id, 'admin', adminEmail(req), 'ADMIN_SET_BOOKING_ORDER', {
      source: 'admin_api',
      booking_order_no: orderNo,
    });
    const mpId = String(tour.canonical_matterport_space_id || '').trim();
    if (mpId) {
      try {
        await matterport.patchModelInternalId(mpId, `#${orderNo}`);
      } catch (e) {
        console.warn('[admin-api] set-booking-order patchModelInternalId:', e.message);
      }
    }
    return res.json({ ok: true, booking_order_no: orderNo });
  } catch (err) {
    console.error('[admin-api] POST /tours/:id/set-booking-order', err);
    return res.status(500).json({ ok: false, error: 'Interner Fehler' });
  }
});

router.get('/confirmation-pending', async (req, res) => {
  try {
    await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS confirmation_required BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ');
    const r = await pool.query(
      `SELECT id, status, object_label, bezeichnung, term_end_date, ablaufdatum, confirmation_sent_at, customer_email
       FROM tour_manager.tours
       WHERE confirmation_required = TRUE
       ORDER BY id ASC`
    );
    return res.json({ ok: true, tours: r.rows.map(normalizeTourRow) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/run-confirmation-batch', async (req, res) => {
  try {
    await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS confirmation_required BOOLEAN DEFAULT FALSE');
    const r = await pool.query(
      `SELECT id, status, object_label, bezeichnung, term_end_date, ablaufdatum, customer_email, confirmation_sent_at
       FROM tour_manager.tours
       WHERE confirmation_required = TRUE
       ORDER BY id ASC`
    );
    const tours = r.rows.map(normalizeTourRow);
    for (const t of tours) {
      await logAction(t.id, 'admin', adminEmail(req), 'CONFIRMATION_BATCH_PLANNED', {
        dryRun: true,
        templateKey: 'tour_confirmation_request',
      });
    }
    return res.json({
      ok: true,
      dryRun: true,
      count: tours.length,
      tours,
      message: 'Kein E-Mail-Versand — nur protokolliert (Dry-Run).',
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
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

router.post('/tours/:id/matterport-options', async (req, res) => {
  try {
    const tour = await loadTourById(req.params.id);
    if (!tour) return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });
    const spaceId = tour.canonical_matterport_space_id || tour.matterport_space_id;
    if (!spaceId) return res.status(400).json({ ok: false, error: 'Tour hat keine Matterport-Verknüpfung' });

    // Nur erlaubte Override-Felder durchlassen
    const ALLOWED = [
      'defurnishViewOverride', 'dollhouseOverride', 'floorplanOverride',
      'socialSharingOverride', 'vrOverride', 'highlightReelOverride',
      'labelsOverride', 'tourAutoplayOverride', 'roomBoundsOverride', 'dollhouseLabelsOverride',
    ];
    const VALID_VALUES = ['enabled', 'disabled', 'default'];
    const patch = {};
    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) {
        const val = String(req.body[key]);
        if (!VALID_VALUES.includes(val)) return res.status(400).json({ ok: false, error: `Ungültiger Wert für ${key}: ${val}` });
        patch[key] = val;
      }
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ ok: false, error: 'Keine Felder zum Aktualisieren' });

    const result = await matterport.patchModelOptions(spaceId, patch);
    if (!result.success) return res.status(400).json({ ok: false, error: result.error });

    await logAction(tour.id, 'admin', adminEmail(req), 'PATCH_MATTERPORT_OPTIONS', { source: 'admin_api', patch });
    return res.json({ ok: true, options: result.options });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/tours/:id/matterport-model', async (req, res) => {
  try {
    const tour = await loadTourById(req.params.id);
    if (!tour) return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });
    const spaceId = tour.canonical_matterport_space_id || tour.matterport_space_id;
    if (!spaceId) return res.status(400).json({ ok: false, error: 'Tour hat keine Matterport-Verknüpfung' });
    const { model, error, inactiveWarning } = await matterport.getModel(spaceId);
    if (error) return res.status(400).json({ ok: false, error });
    return res.json({ ok: true, model, inactiveWarning: inactiveWarning || false });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/tours/:id/unarchive-matterport', async (req, res) => {
  try {
    const tour = await loadTourById(req.params.id);
    if (!tour) return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });
    const spaceId = tour.canonical_matterport_space_id || tour.matterport_space_id;
    if (!spaceId) return res.status(400).json({ ok: false, error: 'Tour hat keine Matterport-Verknüpfung' });
    const result = await matterport.unarchiveSpace(spaceId);
    if (!result.success) return res.status(400).json({ ok: false, error: result.error || 'Reaktivierung fehlgeschlagen' });
    await pool.query(
      `UPDATE tour_manager.tours SET status = 'ACTIVE', matterport_state = 'active', updated_at = NOW() WHERE id = $1`,
      [tour.id]
    );
    await logAction(tour.id, 'admin', adminEmail(req), 'UNARCHIVE_SPACE', { source: 'admin_api', matterport_space_id: spaceId });
    return res.json({ ok: true, message: 'Matterport-Tour wurde reaktiviert.' });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /tours/:id/reactivate
 * Reaktiviert den Matterport-Space sofort und erstellt eine Rechnung.
 * Body: { paymentMethod: "payrexx" | "qr_invoice" }
 * - payrexx:    erstellt Payrexx-Checkout → { ok, redirectUrl }
 * - qr_invoice: sendet QR-Rechnung per E-Mail → { ok }
 */
router.post('/tours/:id/reactivate', async (req, res) => {
  try {
    await ensureAdminRenewalSchema();
    const tour = await loadTourById(req.params.id);
    if (!tour) return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });
    const spaceId = tour.canonical_matterport_space_id || tour.matterport_space_id;
    if (!spaceId) return res.status(400).json({ ok: false, error: 'Tour hat keine Matterport-Verknüpfung' });

    const paymentMethod = req.body?.paymentMethod === 'qr_invoice' ? 'qr_invoice' : 'payrexx';

    // Rechnung + Subscription-Fenster vorbereiten
    const subscriptionWindow = getSubscriptionWindowFromStart(new Date());

    if (paymentMethod === 'qr_invoice') {
      // Zahlungsfrist: 14 Tage ab heute
      const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      // Space sofort aktivieren — Archivierung erfolgt automatisch nach 30 Tagen bei offener Rechnung
      const mpResult = await matterport.unarchiveSpace(spaceId);
      await pool.query(
        `UPDATE tour_manager.tours SET status = 'ACTIVE', matterport_state = $2, updated_at = NOW() WHERE id = $1`,
        [tour.id, mpResult?.success ? 'active' : 'unknown'],
      );

      const dbInv = await pool.query(
        `INSERT INTO tour_manager.renewal_invoices
           (tour_id, invoice_status, sent_at, amount_chf, due_at, invoice_kind, payment_source,
            subscription_start_at, subscription_end_at)
         VALUES ($1, 'sent', NOW(), $2, $3, 'portal_reactivation', 'qr_pending', $4, $5)
         RETURNING id`,
        [tour.id, REACTIVATION_PRICE_CHF, dueAt,
          subscriptionWindow.startIso, subscriptionWindow.endIso],
      );
      const internalInvId = dbInv.rows[0]?.id;

      await logAction(tour.id, 'admin', adminEmail(req), 'REACTIVATE_REQUESTED', {
        source: 'admin_api', matterport_space_id: spaceId, via: 'qr_invoice',
        internal_inv_id: internalInvId, amount_chf: REACTIVATION_PRICE_CHF,
        immediate_activation: true,
      });

      tourActions.sendInvoiceWithQrEmail(String(tour.id), internalInvId).catch((err) => {
        console.error('[admin-api] sendInvoiceWithQrEmail failed:', tour.id, err.message);
      });

      return res.json({ ok: true, via: 'qr_invoice' });
    }

    // Payrexx-Pfad: Tour auf "wartet auf Zahlung" setzen — Space wird erst nach Zahlungseingang aktiviert
    const dueAt = new Date();
    await pool.query(
      `UPDATE tour_manager.tours SET status = 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT', updated_at = NOW() WHERE id = $1`,
      [tour.id],
    );

    // Payrexx-Pfad
    if (!payrexx.isConfigured()) {
      // Payrexx nicht konfiguriert: Status zurücksetzen und Fehler melden
      await pool.query(
        `UPDATE tour_manager.tours SET status = 'ARCHIVED', updated_at = NOW() WHERE id = $1`,
        [tour.id],
      );
      return res.status(400).json({ ok: false, error: 'Payrexx nicht konfiguriert – bitte QR-Rechnung wählen' });
    }

    const dbInv = await pool.query(
      `INSERT INTO tour_manager.renewal_invoices
         (tour_id, invoice_status, sent_at, amount_chf, due_at, invoice_kind, payment_source,
          subscription_start_at, subscription_end_at)
       VALUES ($1, 'sent', NOW(), $2, $3, 'portal_reactivation', 'payrexx_pending', $4, $5)
       RETURNING id`,
      [tour.id, REACTIVATION_PRICE_CHF, dueAt,
        subscriptionWindow.startIso, subscriptionWindow.endIso],
    );
    const internalInvId = dbInv.rows[0]?.id;

    await logAction(tour.id, 'admin', adminEmail(req), 'REACTIVATE_REQUESTED', {
      source: 'admin_api', matterport_space_id: spaceId, via: 'payrexx',
      internal_inv_id: internalInvId, amount_chf: REACTIVATION_PRICE_CHF,
    });

    const successUrl = `${ADMIN_PORTAL_BASE_URL}/admin/tours/${tour.id}?success=reactivated`;
    const cancelUrl  = `${ADMIN_PORTAL_BASE_URL}/admin/tours/${tour.id}?error=cancelled`;
    const tourLabel  = String(tour.canonical_object_label || tour.bezeichnung || `Tour #${tour.id}`);
    const { paymentUrl, error: payErr } = await payrexx.createCheckout({
      referenceId: `tour-${tour.id}-internal-${internalInvId}`,
      amountCHF: REACTIVATION_PRICE_CHF,
      purpose: `${tourLabel} – Reaktivierung`,
      successUrl,
      cancelUrl,
      email: String(tour.canonical_customer_email || tour.customer_email || ''),
    });

    if (paymentUrl) {
      await pool.query(
        `UPDATE tour_manager.renewal_invoices SET payrexx_payment_url = $1 WHERE id = $2`,
        [paymentUrl, internalInvId],
      );
      return res.json({ ok: true, via: 'payrexx', redirectUrl: paymentUrl });
    }

    if (payErr) console.warn('[admin-api] Payrexx createCheckout:', payErr);
    // Checkout fehlgeschlagen: Status zurücksetzen
    await pool.query(
      `UPDATE tour_manager.tours SET status = 'ARCHIVED', updated_at = NOW() WHERE id = $1`,
      [tour.id],
    );
    return res.status(502).json({ ok: false, error: 'Payrexx-Checkout konnte nicht erstellt werden' });
  } catch (err) {
    console.error('[admin-api] /tours/:id/reactivate error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Zahlungseinstellungen ────────────────────────────────────────────────────

function getPayrexxEnvStatus() {
  const instance = String(process.env.PAYREXX_INSTANCE || '').trim();
  const apiSecret = String(process.env.PAYREXX_API_SECRET || '').trim();
  const webhookSecret = String(process.env.PAYREXX_WEBHOOK_SECRET || '').trim();
  const missingVars = [];

  if (!instance) missingVars.push('PAYREXX_INSTANCE');
  if (!apiSecret) missingVars.push('PAYREXX_API_SECRET');

  return {
    payrexxConfigured: !!(instance && apiSecret),
    payrexxInstance: instance,
    payrexxApiSecretConfigured: !!apiSecret,
    payrexxWebhookSecretConfigured: !!(webhookSecret || apiSecret),
    payrexxMissingVars: missingVars,
  };
}

/**
 * GET /payment-settings
 * Gibt Payrexx-Konfigurationsstatus + MwSt-Rate zurück.
 */
router.get('/payment-settings', async (req, res) => {
  try {
    const vatResult = await pool.query(`
      SELECT (value_json)::numeric AS vat_rate
      FROM booking.app_settings
      WHERE key = 'vat_rate'
    `);
    const floorplanResult = await pool.query(`
      SELECT (r.config_json->>'unitPrice')::numeric AS unit_price
      FROM booking.pricing_rules r
      JOIN booking.products p ON p.id = r.product_id
      WHERE p.code = 'floorplans:tour'
        AND r.rule_type = 'per_floor'
        AND r.active = TRUE
      ORDER BY r.priority ASC, r.id ASC
      LIMIT 1
    `);
    const hostingResult = await pool.query(`
      SELECT (r.config_json->>'unitPrice')::numeric AS unit_price
      FROM booking.pricing_rules r
      JOIN booking.products p ON p.id = r.product_id
      WHERE p.code = 'matterport:hosting'
        AND r.rule_type = 'fixed'
        AND r.active = TRUE
      ORDER BY r.priority ASC, r.id ASC
      LIMIT 1
    `);
    return res.json({
      ok: true,
      vatRate: Number(vatResult.rows[0]?.vat_rate ?? 0),
      vatPercent: Math.round(Number(vatResult.rows[0]?.vat_rate ?? 0) * 1000) / 10,
      ...getPayrexxEnvStatus(),
      floorplanUnitPrice: Number(floorplanResult.rows[0]?.unit_price ?? 49),
      hostingUnitPrice: Number(hostingResult.rows[0]?.unit_price ?? 59),
    });
  } catch (err) {
    console.error('[admin-api] GET /payment-settings error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PATCH /payment-settings
 * Speichert MwSt-Rate + Preise in booking.app_settings / pricing_rules.
 * Body: { vatPercent?: number, floorplanUnitPrice?: number }
 */
router.patch('/payment-settings', async (req, res) => {
  try {
    const { vatPercent, floorplanUnitPrice } = req.body || {};

    if (vatPercent !== undefined) {
      const vatRate = Number(vatPercent) / 100;
      if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 1) {
        return res.status(400).json({ ok: false, error: 'Ungültiger MwSt-Satz (0–100%)' });
      }
      await pool.query(`
        INSERT INTO booking.app_settings (key, value_json, updated_at)
        VALUES ('vat_rate', $1::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE SET value_json = $1::jsonb, updated_at = NOW()
      `, [String(vatRate)]);
    }

    if (floorplanUnitPrice !== undefined) {
      const price = Number(floorplanUnitPrice);
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ ok: false, error: 'Ungültiger Preis' });
      }
      const productRes = await pool.query(`SELECT id FROM booking.products WHERE code = 'floorplans:tour' LIMIT 1`);
      if (productRes.rows[0]) {
        const productId = productRes.rows[0].id;
        const existing = await pool.query(`
          SELECT id FROM booking.pricing_rules
          WHERE product_id = $1 AND rule_type = 'per_floor' AND active = TRUE
          ORDER BY priority ASC, id ASC LIMIT 1
        `, [productId]);
        if (existing.rows[0]) {
          await pool.query(`
            UPDATE booking.pricing_rules SET config_json = $1, updated_at = NOW() WHERE id = $2
          `, [JSON.stringify({ unitPrice: price }), existing.rows[0].id]);
        } else {
          await pool.query(`
            INSERT INTO booking.pricing_rules (product_id, rule_type, config_json, active, priority)
            VALUES ($1, 'per_floor', $2, TRUE, 10)
          `, [productId, JSON.stringify({ unitPrice: price })]);
        }
      }
    }

    // Aktuellen Stand zurückgeben
    const vatResult = await pool.query(`SELECT (value_json)::numeric AS vat_rate FROM booking.app_settings WHERE key = 'vat_rate'`);
    const floorplanResult = await pool.query(`
      SELECT (r.config_json->>'unitPrice')::numeric AS unit_price
      FROM booking.pricing_rules r JOIN booking.products p ON p.id = r.product_id
      WHERE p.code = 'floorplans:tour' AND r.rule_type = 'per_floor' AND r.active = TRUE
      ORDER BY r.priority ASC, r.id ASC LIMIT 1
    `);
    return res.json({
      ok: true,
      vatRate: Number(vatResult.rows[0]?.vat_rate ?? 0),
      vatPercent: Math.round(Number(vatResult.rows[0]?.vat_rate ?? 0) * 1000) / 10,
      ...getPayrexxEnvStatus(),
      floorplanUnitPrice: Number(floorplanResult.rows[0]?.unit_price ?? 49),
    });
  } catch (err) {
    console.error('[admin-api] PATCH /payment-settings error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Hilfsfunktion: Grundriss-Preis aus booking.pricing_rules + MwSt aus booking.app_settings
 */
async function getFloorplanPricingData() {
  const priceResult = await pool.query(`
    SELECT (r.config_json->>'unitPrice')::numeric AS unit_price_chf
    FROM booking.pricing_rules r
    JOIN booking.products p ON p.id = r.product_id
    WHERE p.code = 'floorplans:tour'
      AND r.rule_type = 'per_floor'
      AND r.active = TRUE
    ORDER BY r.priority ASC, r.id ASC
    LIMIT 1
  `);
  const unitPrice = Number(priceResult.rows[0]?.unit_price_chf ?? 49);

  const vatResult = await pool.query(`
    SELECT (value_json)::numeric AS vat_rate
    FROM booking.app_settings
    WHERE key = 'vat_rate'
  `);
  const vatRate = Number(vatResult.rows[0]?.vat_rate ?? 0);

  return { unitPrice, vatRate };
}

/**
 * GET /tours/:id/floorplan-pricing
 * Gibt Preisinfo + Etagen-Anzahl aus Matterport zurück.
 */
router.get('/tours/:id/floorplan-pricing', async (req, res) => {
  try {
    const tour = await loadTourById(req.params.id);
    if (!tour) return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });
    const spaceId = tour.canonical_matterport_space_id || tour.matterport_space_id;

    let floors = [];
    if (spaceId) {
      const { model } = await matterport.getModel(spaceId).catch(() => ({ model: null }));
      floors = model?.floors ?? [];
    }

    const { unitPrice, vatRate } = await getFloorplanPricingData();
    const floorCount = floors.length || 1;
    const totalNet = Math.round(floorCount * unitPrice * 100) / 100;
    const totalGross = Math.round(totalNet * (1 + vatRate) * 100) / 100;

    return res.json({
      ok: true,
      unitPrice,
      vatRate,
      vatPercent: Math.round(vatRate * 100 * 10) / 10,
      floors,
      floorCount,
      totalNet,
      totalGross,
    });
  } catch (err) {
    console.error('[admin-api] /tours/:id/floorplan-pricing error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /tours/:id/order-floorplan
 * Erstellt Grundriss-Bestellung: Rechnung, Zahlung (Payrexx/QR), Ticket.
 * Body: { paymentMethod: "payrexx" | "qr_invoice", comment: string, floorCount: number }
 */
router.post('/tours/:id/order-floorplan', async (req, res) => {
  try {
    await ensureAdminRenewalSchema();
    const tour = await loadTourById(req.params.id);
    if (!tour) return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });

    const paymentMethod = req.body?.paymentMethod === 'qr_invoice' ? 'qr_invoice' : 'payrexx';
    const comment = String(req.body?.comment || '').trim();
    const floorCount = Math.max(1, parseInt(req.body?.floorCount, 10) || 1);

    const { unitPrice, vatRate } = await getFloorplanPricingData();
    const totalGross = Math.round(floorCount * unitPrice * (1 + vatRate) * 100) / 100;

    const tourLabel = String(tour.canonical_object_label || tour.bezeichnung || `Tour #${tour.id}`);
    const dueAt = new Date();

    const ticketDescription = [
      `Etagen: ${floorCount}`,
      `Preis pro Etage: CHF ${unitPrice.toFixed(2)} zzgl. MwSt`,
      `Gesamtbetrag: CHF ${totalGross.toFixed(2)} inkl. ${Math.round(vatRate * 100 * 10) / 10}% MwSt`,
      comment ? `Kommentar: ${comment}` : '',
    ].filter(Boolean).join('\n');

    if (paymentMethod === 'qr_invoice') {
      const dbInv = await pool.query(
        `INSERT INTO tour_manager.renewal_invoices
           (tour_id, invoice_status, sent_at, amount_chf, due_at, invoice_kind, payment_source, payment_note)
         VALUES ($1, 'sent', NOW(), $2, $3, 'floorplan_order', 'qr_pending', $4)
         RETURNING id`,
        [tour.id, totalGross, dueAt, comment || null],
      );
      const internalInvId = dbInv.rows[0]?.id;

      await pool.query(
        `INSERT INTO tour_manager.tickets
           (module, reference_id, reference_type, category, subject, description, priority, created_by, created_by_role)
         VALUES ('tours', $1, 'tour', 'sonstiges', $2, $3, 'normal', $4, 'admin')`,
        [String(tour.id), `Grundriss bestellt — ${floorCount} Etage${floorCount !== 1 ? 'n' : ''}`, ticketDescription, adminEmail(req)],
      );

      await logAction(tour.id, 'admin', adminEmail(req), 'FLOORPLAN_ORDER', {
        source: 'admin_api', via: 'qr_invoice',
        internal_inv_id: internalInvId, amount_chf: totalGross, floor_count: floorCount,
      });

      tourActions.sendInvoiceWithQrEmail(String(tour.id), internalInvId).catch((err) => {
        console.error('[admin-api] sendInvoiceWithQrEmail (floorplan) failed:', tour.id, err.message);
      });

      return res.json({ ok: true, via: 'qr_invoice' });
    }

    // Payrexx-Pfad
    if (!payrexx.isConfigured()) {
      return res.status(400).json({ ok: false, error: 'Payrexx nicht konfiguriert – bitte QR-Rechnung wählen' });
    }

    const dbInv = await pool.query(
      `INSERT INTO tour_manager.renewal_invoices
         (tour_id, invoice_status, sent_at, amount_chf, due_at, invoice_kind, payment_source, payment_note)
       VALUES ($1, 'sent', NOW(), $2, $3, 'floorplan_order', 'payrexx_pending', $4)
       RETURNING id`,
      [tour.id, totalGross, dueAt, comment || null],
    );
    const internalInvId = dbInv.rows[0]?.id;

    await pool.query(
      `INSERT INTO tour_manager.tickets
         (module, reference_id, reference_type, category, subject, description, priority, created_by, created_by_role)
       VALUES ('tours', $1, 'tour', 'sonstiges', $2, $3, 'normal', $4, 'admin')`,
      [String(tour.id), `Grundriss bestellt — ${floorCount} Etage${floorCount !== 1 ? 'n' : ''}`, ticketDescription, adminEmail(req)],
    );

    await logAction(tour.id, 'admin', adminEmail(req), 'FLOORPLAN_ORDER', {
      source: 'admin_api', via: 'payrexx',
      internal_inv_id: internalInvId, amount_chf: totalGross, floor_count: floorCount,
    });

    const successUrl = `${ADMIN_PORTAL_BASE_URL}/admin/tours/${tour.id}?success=floorplan_ordered`;
    const cancelUrl  = `${ADMIN_PORTAL_BASE_URL}/admin/tours/${tour.id}?error=cancelled`;
    const { paymentUrl, error: payErr } = await payrexx.createCheckout({
      referenceId: `tour-${tour.id}-internal-${internalInvId}`,
      amountCHF: totalGross,
      purpose: `${tourLabel} – Grundriss (${floorCount} Etage${floorCount !== 1 ? 'n' : ''})`,
      successUrl,
      cancelUrl,
      email: String(tour.canonical_customer_email || tour.customer_email || ''),
    });

    if (paymentUrl) {
      await pool.query(
        `UPDATE tour_manager.renewal_invoices SET payrexx_payment_url = $1 WHERE id = $2`,
        [paymentUrl, internalInvId],
      );
      return res.json({ ok: true, via: 'payrexx', redirectUrl: paymentUrl });
    }

    if (payErr) console.warn('[admin-api] Payrexx createCheckout (floorplan):', payErr);
    return res.status(502).json({ ok: false, error: 'Payrexx-Checkout konnte nicht erstellt werden' });
  } catch (err) {
    console.error('[admin-api] /tours/:id/order-floorplan error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/tours/:id', async (req, res) => {
  try {
    const tour = await loadTourById(req.params.id);
    if (!tour) return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });
    await logAction(tour.id, 'admin', adminEmail(req), 'DELETE_TOUR', {
      source: 'admin_api',
      bezeichnung: tour.canonical_object_label || tour.bezeichnung,
      matterport_space_id: tour.canonical_matterport_space_id || tour.matterport_space_id || null,
    });
    await pool.query('DELETE FROM tour_manager.tours WHERE id = $1', [tour.id]);
    return res.json({ ok: true, message: 'Tour wurde gelöscht.' });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/tours/:id/transfer-matterport', async (req, res) => {
  try {
    const tour = await loadTourById(req.params.id);
    if (!tour) return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });
    const spaceId = tour.canonical_matterport_space_id || tour.matterport_space_id;
    if (!spaceId) return res.status(400).json({ ok: false, error: 'Tour hat keine Matterport-Verknüpfung' });
    const toEmail = String(req.body?.toEmail || '').trim();
    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      return res.status(400).json({ ok: false, error: 'Ungültige Empfänger-E-Mail-Adresse' });
    }
    const result = await matterport.transferSpace(spaceId, toEmail);
    if (!result.success) return res.status(400).json({ ok: false, error: result.error || 'Übertragung fehlgeschlagen' });
    await logAction(tour.id, 'admin', adminEmail(req), 'TRANSFER_SPACE', {
      source: 'admin_api',
      matterport_space_id: spaceId,
      to_email: toEmail,
    });
    return res.json({ ok: true, message: `Matterport-Space wurde an ${toEmail} übertragen.` });
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

router.post('/tours/:id/sync-exxas-inventory', async (req, res) => {
  try {
    const tour = await loadTourById(req.params.id);
    if (!tour) return res.status(404).json({ ok: false, error: 'Tour nicht gefunden' });

    const spaceId = tour.canonical_matterport_space_id || tour.matterport_space_id;
    if (!spaceId) {
      return res.status(400).json({ ok: false, error: 'Tour hat keine Matterport-Verknüpfung' });
    }

    const { inventory, error: invError } = await exxas.getInventoryByMatterportId(spaceId);
    if (invError) return res.status(502).json({ ok: false, error: invError });
    if (!inventory) {
      return res.json({ ok: true, synced: false, message: 'Keine passende Exxas-Kundenanlage gefunden.' });
    }

    await logAction(tour.id, 'admin', adminEmail(req), 'EXXAS_INVENTORY_SYNC', {
      inventory_id: inventory.id,
      inventory_titel: inventory.titel,
      inventory_status: inventory.status,
      optional1: inventory.optional1,
    });

    // Inaktive Anlage → Tour automatisch archivieren
    if (String(inventory.status || '').trim() !== 'ak') {
      try {
        await tourActions.archiveTourNow(tour.id, adminEmail(req) || 'system');
      } catch (archiveErr) {
        return res.status(400).json({
          ok: false,
          synced: true,
          inventoryId: inventory.id,
          inventoryStatus: inventory.status,
          archived: false,
          error: `Anlage inaktiv, aber Archivierung fehlgeschlagen: ${archiveErr.message}`,
        });
      }
      return res.json({
        ok: true,
        synced: true,
        inventoryId: inventory.id,
        inventoryStatus: inventory.status,
        archived: true,
        invoiceLinked: false,
        message: 'Kundenanlage ist inaktiv – Tour wurde archiviert.',
      });
    }

    // Rechnung suchen: erst lokal in exxas_invoices, dann live
    const contractId = tour.canonical_exxas_contract_id || null;
    let invoice = null;

    if (contractId) {
      const localResult = await pool.query(
        `SELECT * FROM tour_manager.exxas_invoices
         WHERE (tour_id = $1 OR ref_vertrag = $2)
           AND archived_at IS NULL
         ORDER BY CASE WHEN exxas_status = 'bz' THEN 0 ELSE 1 END ASC,
                  COALESCE(dok_datum, zahlungstermin) DESC NULLS LAST
         LIMIT 1`,
        [tour.id, contractId]
      );
      if (localResult.rows[0]) invoice = localResult.rows[0];
    }

    // Live-Suche falls lokal nichts gefunden
    if (!invoice) {
      const searchTerm = contractId || tour.object_label || tour.bezeichnung || '';
      const { invoices: liveInvoices } = await exxas.searchInvoices(searchTerm, { limit: 5 });
      const live = (liveInvoices || []).find((inv) => (
        (contractId && String(inv.ref_vertrag || '') === String(contractId)) ||
        (spaceId && String(inv.bezeichnung || '').includes(spaceId))
      ));
      if (live) {
        // Live-Rechnung in exxas_invoices upserten und mit Tour verknüpfen
        const upsert = await pool.query(
          `INSERT INTO tour_manager.exxas_invoices
             (exxas_document_id, nummer, kunde_name, bezeichnung, ref_kunde, ref_vertrag,
              exxas_status, zahlungstermin, dok_datum, preis_brutto, tour_id, synced_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
           ON CONFLICT (exxas_document_id) DO UPDATE
             SET tour_id = EXCLUDED.tour_id, synced_at = NOW()
           RETURNING *`,
          [
            live.exxas_document_id,
            live.nummer || null,
            live.kunde_name || null,
            live.bezeichnung || null,
            live.ref_kunde || null,
            live.ref_vertrag || null,
            live.exxas_status || null,
            live.zahlungstermin || null,
            live.dok_datum || null,
            live.preis_brutto || null,
            tour.id,
          ]
        );
        if (upsert.rows[0]) invoice = upsert.rows[0];
      }
    } else if (!invoice.tour_id) {
      // Lokale Rechnung existiert, aber noch nicht mit dieser Tour verknüpft
      await pool.query(
        'UPDATE tour_manager.exxas_invoices SET tour_id = $1, synced_at = NOW() WHERE id = $2',
        [tour.id, invoice.id]
      );
    }

    const bezahlt = invoice ? String(invoice.exxas_status || '').toLowerCase() === 'bz' : null;

    return res.json({
      ok: true,
      synced: true,
      inventoryId: inventory.id,
      inventoryTitel: inventory.titel,
      inventoryStatus: inventory.status,
      archived: false,
      invoiceLinked: !!invoice,
      invoiceId: invoice?.exxas_document_id || invoice?.id || null,
      invoiceNummer: invoice?.nummer || null,
      bezahlt,
      message: invoice
        ? `Rechnung ${invoice.nummer || invoice.exxas_document_id} verknüpft (${bezahlt ? 'bezahlt' : 'offen'}).`
        : 'Kundenanlage aktiv, aber keine passende Rechnung gefunden.',
    });
  } catch (err) {
    console.error('[admin-api] sync-exxas-inventory:', err);
    return res.status(500).json({ ok: false, error: err.message });
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

router.get('/invoices-central', async (req, res) => {
  try {
    const type = String(req.query.type || 'renewal');
    const status = String(req.query.status || '');
    const search = String(req.query.search || '').trim();
    if (type === 'exxas') {
      const data = await phase3.getExxasInvoicesCentral(status, search);
      return res.json(data);
    }
    const data = await phase3.getRenewalInvoicesCentral(status, search);
    return res.json(data);
  } catch (err) {
    console.error('[admin-api] GET /invoices-central', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.delete('/invoices/:type/:id', async (req, res) => {
  try {
    const type = String(req.params.type || '');
    const invoiceId = String(req.params.id || '');
    const result = type === 'exxas'
      ? await phase3.deleteExxasInvoice(invoiceId)
      : await phase3.deleteRenewalInvoice(invoiceId);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.patch('/invoices/:type/:id/archive', async (req, res) => {
  try {
    const type = String(req.params.type || '');
    const invoiceId = String(req.params.id || '');
    const result = type === 'exxas'
      ? await phase3.archiveExxasInvoice(invoiceId)
      : await phase3.archiveRenewalInvoice(invoiceId);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.patch('/invoices/:type/:id', async (req, res) => {
  try {
    const type = String(req.params.type || '');
    const invoiceId = String(req.params.id || '');
    const result = type === 'exxas'
      ? await phase3.updateExxasInvoice(invoiceId, req.body || {})
      : await phase3.updateRenewalInvoice(invoiceId, req.body || {});
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/invoices/exxas/sync-all', async (req, res) => {
  try {
    const result = await phase3.syncAllExxasInvoicesFromApi();
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    console.error('/invoices/exxas/sync-all:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/invoices/exxas/:id/import', async (req, res) => {
  try {
    const result = await phase3.importExxasInvoiceToInternalInvoice(req.params.id, adminEmail(req));
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/invoices/:type/:id/resend', async (req, res) => {
  try {
    const type = String(req.params.type || '');
    if (type !== 'renewal') {
      return res.status(400).json({ ok: false, error: 'Erneut senden ist nur für Verlängerungsrechnungen verfügbar.' });
    }
    const invoiceId = String(req.params.id || '');
    const result = await phase3.resendRenewalInvoice(invoiceId);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
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

router.get('/bank-import/invoice-search', async (req, res) => {
  try {
    const data = await phase3.searchBankImportInvoices(req.query.q, req.query.amount);
    return res.json(data);
  } catch (err) {
    console.error('[admin-api] GET /bank-import/invoice-search', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/bank-import/order-search', async (req, res) => {
  try {
    const data = await phase3.searchByOrderNo(req.query.q);
    return res.json(data);
  } catch (err) {
    console.error('[admin-api] GET /bank-import/order-search', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/bank-import/preview', bankDataUpload.single('bankFile'), async (req, res) => {
  try {
    const result = await phase3.previewBankImportUpload({
      buffer: req.file?.buffer,
      originalname: req.file?.originalname,
    });
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    console.error('[admin-api] bank-import/preview', err);
    return res.status(500).json({ ok: false, error: err.message });
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
    const invoiceSource = String(req.body?.invoiceSource || 'renewal').trim() || 'renewal';
    const result = await phase3.confirmBankTransaction(txId, invoiceId, invoiceSource, adminEmail(req));
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

router.get('/tours/invoices-by-order/:orderNo', async (req, res) => {
  try {
    const data = await phase3.getInvoicesByOrderNo(req.params.orderNo);
    return res.json(data);
  } catch (err) {
    console.error('[admin-api] GET /tours/invoices-by-order', err);
    return res.status(500).json({ ok: false, error: err.message });
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

router.post('/invoices/create-freeform', async (req, res) => {
  try {
    const result = await phase3.createFreeformInvoice(req.body || {}, adminEmail(req));
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/invoices/form-suggestions', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const like = q.length >= 1 ? `%${q}%` : null;
    const descPromise = like
      ? pool.query(
        `SELECT DISTINCT TRIM(description) AS d
         FROM tour_manager.renewal_invoices
         WHERE description IS NOT NULL AND TRIM(description) != '' AND description ILIKE $1
         ORDER BY d ASC NULLS LAST LIMIT 18`,
        [like],
      )
      : pool.query(
        `SELECT TRIM(description) AS d FROM tour_manager.renewal_invoices
         WHERE description IS NOT NULL AND TRIM(description) != ''
         ORDER BY id DESC LIMIT 80`,
      );
    const [descRes, numRes, noteRes] = await Promise.all([
      descPromise,
      pool.query(
        `SELECT invoice_number FROM tour_manager.renewal_invoices
         WHERE invoice_number IS NOT NULL AND TRIM(invoice_number) != ''
         ORDER BY id DESC LIMIT 15`,
      ),
      like
        ? pool.query(
          `SELECT DISTINCT LEFT(TRIM(payment_note), 160) AS n
           FROM tour_manager.renewal_invoices
           WHERE payment_note IS NOT NULL AND TRIM(payment_note) != '' AND payment_note ILIKE $1
           ORDER BY n ASC NULLS LAST LIMIT 12`,
          [like],
        )
        : pool.query(
          `SELECT LEFT(TRIM(payment_note), 160) AS n
           FROM tour_manager.renewal_invoices
           WHERE payment_note IS NOT NULL AND TRIM(payment_note) != ''
           ORDER BY id DESC LIMIT 40`,
        ),
    ]);
    const seenD = new Set();
    const descriptions = [];
    for (const row of descRes.rows) {
      const d = row.d;
      if (!d || seenD.has(d)) continue;
      seenD.add(d);
      descriptions.push(d);
      if (descriptions.length >= 15) break;
    }
    const invoiceNumbers = [...new Set(numRes.rows.map((r) => r.invoice_number).filter(Boolean))].slice(0, 12);
    const notes = [...new Set(noteRes.rows.map((r) => r.n).filter(Boolean))].slice(0, 10);
    return res.json({ ok: true, descriptions, invoiceNumbers, notes });
  } catch (err) {
    console.error('[admin-api] GET /invoices/form-suggestions', err);
    return res.status(500).json({ ok: false, error: err.message });
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

router.get('/invoices/:invoiceId/pdf', async (req, res) => {
  try {
    const invoiceId = String(req.params.invoiceId || '').trim();
    if (!invoiceId) return res.status(400).send('Ungültige Parameter');
    await phase3.streamRenewalInvoicePdf(res, null, invoiceId);
  } catch (err) {
    console.error('[admin-api] freeform pdf', err);
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

router.delete('/tours/:id/link-exxas-customer', async (req, res) => {
  try {
    const result = await adminLinkCustomer.deleteUnlinkCustomerJson(req.params.id);
    if (!result.ok) {
      const st = result.error === 'not_found' ? 404 : 400;
      return res.status(st).json({ ok: false, error: result.error || 'failed' });
    }
    await logAction(req.params.id, 'admin', adminEmail(req), 'ADMIN_UNLINK_CUSTOMER', {
      source: 'admin_api',
      previous_customer_id: result.previous_customer_id || null,
      previous_customer_name: result.previous_customer_name || null,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] link-exxas-customer DELETE', err);
    return res.status(500).json({ ok: false, error: 'Interner Fehler' });
  }
});

router.post('/tours/:id/link-exxas-customer', async (req, res) => {
  try {
    const result = await adminLinkCustomer.postLinkExxasCustomerJson(req.params.id, req.body || {});
    if (!result.ok) {
      const st = result.error === 'not_found' ? 404 : 400;
      return res.status(st).json({ ok: false, error: result.error || 'failed' });
    }
    await logAction(req.params.id, 'admin', adminEmail(req), 'ADMIN_LINK_CUSTOMER', {
      source: 'admin_api',
      customer_id: req.body?.customer_id || null,
      customer_name: req.body?.customer_name || null,
      customer_email: req.body?.customer_email || null,
    });
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
    const actorEmail = adminEmail(req);
    const result = await phase3.postLinkInvoice(req.params.id, invoiceId, actorEmail);
    if (!result.ok) {
      const st = result.error === 'notfound' ? 404 : result.error === 'alreadylinked' ? 409 : 400;
      return res.status(st).json(result);
    }
    await logAction(req.params.id, 'admin', actorEmail, 'ADMIN_LINK_INVOICE', {
      invoice_id: invoiceId,
      renewal_invoice_id: result.renewalInvoiceId || null,
    });
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

    if (body.exxasRuntimeConfig && typeof body.exxasRuntimeConfig === 'object') {
      await saveExxasRuntimeConfig({
        enabled: body.exxasRuntimeConfig.enabled,
        apiKey: body.exxasRuntimeConfig.apiKey,
        appPassword: body.exxasRuntimeConfig.appPassword,
        endpoint: body.exxasRuntimeConfig.endpoint,
        authMode: body.exxasRuntimeConfig.authMode,
      });
      exxas.invalidateRuntimeConfigCache();
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

// ─── Rechnungsvorlage / Creditor ─────────────────────────────────────────────

router.get('/invoice-template', async (req, res) => {
  try {
    const [creditor, emailTemplates] = await Promise.all([
      getInvoiceCreditor(),
      getEmailTemplates(),
    ]);
    return res.json({
      ok: true,
      creditor,
      defaultCreditor: DEFAULT_INVOICE_CREDITOR,
      invoiceEmailTemplate: emailTemplates.portal_invoice_sent || {},
      defaultInvoiceEmailTemplate: DEFAULT_EMAIL_TEMPLATES.portal_invoice_sent || {},
    });
  } catch (err) {
    console.error('[admin-api] GET /invoice-template error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch('/invoice-template', async (req, res) => {
  try {
    const { creditor, emailTemplate } = req.body || {};
    const results = {};

    if (creditor && typeof creditor === 'object') {
      results.creditor = await saveInvoiceCreditor(creditor);
    } else {
      results.creditor = await getInvoiceCreditor();
    }

    if (emailTemplate && typeof emailTemplate === 'object') {
      const current = await getEmailTemplates();
      await saveEmailTemplates({
        ...current,
        portal_invoice_sent: {
          ...current.portal_invoice_sent,
          ...emailTemplate,
        },
      });
      const updated = await getEmailTemplates();
      results.invoiceEmailTemplate = updated.portal_invoice_sent;
    } else {
      const templates = await getEmailTemplates();
      results.invoiceEmailTemplate = templates.portal_invoice_sent;
    }

    return res.json({ ok: true, ...results });
  } catch (err) {
    console.error('[admin-api] PATCH /invoice-template error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
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
        renewal_request_final: [
          'objectLabel', 'customerGreeting', 'tourLinkHtml', 'tourLinkText', 'termEndFormatted',
          'portalUrl', 'portalLinkHtml', 'portalLinkText', 'yesUrl', 'noUrl',
        ],
        tour_confirmation_request: [
          'objectLabel', 'customerGreeting', 'tourLinkHtml', 'tourLinkText', 'yesUrl', 'noUrl',
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

// ─── Tickets ────────────────────────────────────────────────────────────────

const ticketUploadDir = path.join(__dirname, '..', 'uploads', 'tickets');

const ticketUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mt = String(file.mimetype || '').toLowerCase();
    const ok = mt.startsWith('image/jpeg') || mt.startsWith('image/png') || mt.startsWith('image/webp');
    cb(null, ok);
  },
});

const TICKET_CATEGORIES = [
  'startpunkt', 'name_aendern', 'blur_request', 'sweep_verschieben', 'sonstiges',
];
const TICKET_STATUSES = ['open', 'in_progress', 'done', 'rejected'];

// Attachment ausliefern
router.get('/tickets/attachment/:filename', (req, res) => {
  const filename = path.basename(String(req.params.filename || ''));
  if (!filename || filename.includes('..')) return res.status(400).end();
  const filePath = path.join(ticketUploadDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

// Upload Screenshot
router.post('/tickets/upload', ticketUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'Keine Datei' });
    if (!fs.existsSync(ticketUploadDir)) fs.mkdirSync(ticketUploadDir, { recursive: true });
    const ext = req.file.mimetype.includes('png') ? '.png' : req.file.mimetype.includes('webp') ? '.webp' : '.jpg';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const dest = path.join(ticketUploadDir, filename);
    fs.writeFileSync(dest, req.file.buffer);
    return res.json({ ok: true, path: `tickets/${filename}`, filename });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Ticket erstellen
router.post('/tickets', async (req, res) => {
  try {
    const {
      module: mod = 'tours',
      reference_id,
      reference_type = 'tour',
      category = 'sonstiges',
      subject,
      description,
      link_url,
      attachment_path,
      priority = 'normal',
    } = req.body || {};
    if (!subject || !String(subject).trim()) {
      return res.status(400).json({ ok: false, error: 'Betreff fehlt' });
    }
    if (!TICKET_CATEGORIES.includes(category)) {
      return res.status(400).json({ ok: false, error: `Ungültige Kategorie: ${category}` });
    }
    const creator = adminEmail(req);
    const result = await pool.query(
      `INSERT INTO tour_manager.tickets
        (module, reference_id, reference_type, category, subject, description, link_url, attachment_path, priority, created_by, created_by_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'admin')
       RETURNING *`,
      [mod, reference_id ?? null, reference_type, category, String(subject).trim(), description ?? null, link_url ?? null, attachment_path ?? null, priority, creator]
    );
    return res.json({ ok: true, ticket: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Tickets auflisten
router.get('/tickets', async (req, res) => {
  try {
    const { status, module: mod, reference_id, reference_type } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;
    if (status && TICKET_STATUSES.includes(status)) { conditions.push(`tk.status = $${i++}`); params.push(status); }
    if (mod) { conditions.push(`tk.module = $${i++}`); params.push(mod); }
    if (reference_id) { conditions.push(`tk.reference_id = $${i++}`); params.push(String(reference_id)); }
    if (reference_type) { conditions.push(`tk.reference_type = $${i++}`); params.push(reference_type); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT tk.*,
              t.object_label   AS tour_label,
              t.bezeichnung    AS tour_bezeichnung,
              t.matterport_space_id AS tour_space_id,
              o.order_no         AS reference_order_no
       FROM tour_manager.tickets tk
       LEFT JOIN tour_manager.tours t
         ON tk.reference_type = 'tour' AND tk.reference_id = t.id::TEXT
       LEFT JOIN booking.orders o
         ON tk.reference_type = 'order' AND tk.reference_id = o.id::TEXT
       ${where}
       ORDER BY tk.created_at DESC
       LIMIT 500`,
      params
    );
    return res.json({ ok: true, tickets: result.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Einzelnes Ticket
router.get('/tickets/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT tk.*,
              t.object_label   AS tour_label,
              t.bezeichnung    AS tour_bezeichnung,
              t.matterport_space_id AS tour_space_id,
              o.order_no         AS reference_order_no
       FROM tour_manager.tickets tk
       LEFT JOIN tour_manager.tours t
         ON tk.reference_type = 'tour' AND tk.reference_id = t.id::TEXT
       LEFT JOIN booking.orders o
         ON tk.reference_type = 'order' AND tk.reference_id = o.id::TEXT
       WHERE tk.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Nicht gefunden' });
    return res.json({ ok: true, ticket: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Status / Zuweisung updaten
router.patch('/tickets/:id', async (req, res) => {
  try {
    const { status, assigned_to } = req.body || {};
    if (status && !TICKET_STATUSES.includes(status)) {
      return res.status(400).json({ ok: false, error: `Ungültiger Status: ${status}` });
    }
    const setClauses = [];
    const params = [];
    let i = 1;
    if (status) { setClauses.push(`status = $${i++}`); params.push(status); }
    if (assigned_to !== undefined) { setClauses.push(`assigned_to = $${i++}`); params.push(assigned_to || null); }
    setClauses.push(`updated_at = NOW()`);
    if (!setClauses.length) return res.status(400).json({ ok: false, error: 'Keine Felder' });
    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE tour_manager.tickets SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Nicht gefunden' });
    return res.json({ ok: true, ticket: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
