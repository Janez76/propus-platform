/**
 * Baut die JSON-Payload für Tour-Admin-Detail (React API), analog admin.js GET /tours/:id.
 */

const { pool } = require('./db');
const matterport = require('./matterport');
const exxas = require('./exxas');
const { normalizeTourRow } = require('./normalize');
const { toIsoDate, getSubscriptionWindowFromStart } = require('./subscriptions');

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
    const baseDate = tour?.matterport_created_at || tour?.created_at || null;
    const firstWindow = getSubscriptionWindowFromStart(baseDate);
    if (firstWindow.endIso) return firstWindow.endIso;
  }
  const termEnd = tour?.canonical_term_end_date || tour?.term_end_date || tour?.ablaufdatum || null;
  if (termEnd) return toIsoDate(termEnd);
  return todayIso;
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

/**
 * @returns {Promise<object|null>} null wenn Tour fehlt
 */
async function buildTourDetailApiPayload(tourId) {
  const id = tourId;
  const tour = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [id]);
  if (!tour.rows[0]) {
    return null;
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

  return {
    ok: true,
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
    mpVisibility,
    declineWorkflow,
  };
}

module.exports = {
  buildTourDetailApiPayload,
  loadTourById,
  ALLOWED_VISIBILITIES: ['PRIVATE', 'LINK_ONLY', 'PUBLIC', 'PASSWORD'],
  computeManualInvoiceDueDateIso,
  paymentMethodLabel,
  ALLOWED_PAYMENT_METHODS,
  getDisplayedTourStatus,
};
