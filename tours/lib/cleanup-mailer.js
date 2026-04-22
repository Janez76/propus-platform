/**
 * Bereinigungslauf Mailer
 *
 * Zentrale Logik für den einmaligen Bereinigungslauf:
 *  - Kandidaten-Touren ermitteln (≤ 6 Monate alt, E-Mail vorhanden, noch kein Abschluss)
 *  - Cleanup-Regeln pro Tour-Status berechnen (welche Aktionen sind sinnvoll, Preise etc.)
 *  - Mail-Inhalt aus Template `cleanup_review_request` rendern
 *  - Tokens für 4 Aktionen (weiterfuehren / archivieren / uebertragen / loeschen) generieren
 *  - Produktiver Versand inkl. Token-Persistenz und Logging
 *  - Sandbox-Vorschau (dryRun=true): kein Versand, keine DB-Schreiboperationen
 *  - Ticket-Erstellung bei freien E-Mail-Antworten
 */

'use strict';

const { pool } = require('./db');
const { logAction } = require('./actions');
const { generateToken, hashToken } = require('./tokens');
const { normalizeTourRow } = require('./normalize');
const { getEmailTemplates, DEFAULT_EMAIL_TEMPLATES } = require('./settings');
const tourActions = require('./tour-actions');
const { sendGraphMailToCustomer, ensureOutgoingEmailSchema } = tourActions;
const { EXTENSION_PRICE_CHF, REACTIVATION_PRICE_CHF, REACTIVATION_FEE_CHF } = require('./subscriptions');
const { resolveTourAddress } = require('./tour-matterport-address');

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function formatDate(value) {
  if (!value) return null;
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return null;
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

function mergeTemplate(templateStr, placeholders, options = {}) {
  const { htmlMode = false, safeKeys = [] } = options;
  if (!templateStr || typeof templateStr !== 'string') return '';
  return templateStr.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = placeholders[key];
    if (val === undefined || val === null) return '';
    if (htmlMode && !safeKeys.includes(key)) return escapeHtml(String(val));
    return String(val);
  });
}

function getPortalUrl() {
  return (process.env.PORTAL_BASE_URL || process.env.CUSTOMER_BASE_URL || 'https://portal.propus.ch').replace(/\/$/, '') + '/login';
}

function getCleanupBaseUrl() {
  return (process.env.PORTAL_BASE_URL || process.env.CUSTOMER_BASE_URL || 'https://portal.propus.ch').replace(/\/$/, '');
}

const CLEANUP_TOKEN_TYPES = ['weiterfuehren', 'archivieren', 'uebertragen', 'loeschen'];

// ─── Schema sicherstellen ────────────────────────────────────────────────────

let schemaEnsured = false;
async function ensureCleanupSchema() {
  if (schemaEnsured) return;
  // cleanup_tokens Tabelle: separat von customer_tokens, damit Aktions-Typ mehrdeutig sein kann
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.cleanup_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tour_id INTEGER NOT NULL REFERENCES tour_manager.tours(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      action TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cleanup_tokens_tour ON tour_manager.cleanup_tokens(tour_id)`);
  // archived_at Spalte auf tours, wenn noch nicht vorhanden
  await pool.query(`ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
  // cleanup_sent_at: wann wurde der Bereinigungslauf für diese Tour verschickt
  await pool.query(`ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS cleanup_sent_at TIMESTAMPTZ`);
  // cleanup_action: welche Aktion hat der Kunde gewählt
  await pool.query(`ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS cleanup_action TEXT`);
  // cleanup_action_at: wann wurde die Aktion ausgeführt
  await pool.query(`ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS cleanup_action_at TIMESTAMPTZ`);
  // delete_requested_at / delete_after_at: vorgemerkte Löschung mit Sicherheitsfrist
  await pool.query(`ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS delete_requested_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS delete_after_at TIMESTAMPTZ`);
  // cleanup_completed: TRUE wenn Bereinigungslauf für diese Tour abgeschlossen ist → fixe Preise danach
  await pool.query(`ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS cleanup_completed BOOLEAN DEFAULT FALSE`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.pending_deletions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tour_id INTEGER,
      matterport_space_id TEXT,
      delete_matterport BOOLEAN NOT NULL DEFAULT TRUE,
      requested_by_type TEXT NOT NULL,
      requested_by_ref TEXT,
      requested_via TEXT,
      reason TEXT,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execute_after TIMESTAMPTZ NOT NULL,
      executed_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      last_error TEXT,
      details_json JSONB
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pending_deletions_due
    ON tour_manager.pending_deletions(execute_after)
    WHERE executed_at IS NULL AND cancelled_at IS NULL
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_deletions_open_tour
    ON tour_manager.pending_deletions(tour_id)
    WHERE tour_id IS NOT NULL AND executed_at IS NULL AND cancelled_at IS NULL
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_deletions_open_space
    ON tour_manager.pending_deletions(matterport_space_id)
    WHERE matterport_space_id IS NOT NULL AND executed_at IS NULL AND cancelled_at IS NULL
  `);
  schemaEnsured = true;
}

// ─── Cleanup-Regel pro Status ────────────────────────────────────────────────

/**
 * Berechnet die Cleanup-Regel für eine Tour anhand ihres Status.
 * Gibt zurück:
 *  - statusLabel: Anzeigename
 *  - statusContext: Text-Kontext für die Mail
 *  - weiterfuehrenHint: Beschreibung, was beim Klick auf "Weiterführen" passiert
 *  - needsInvoice: muss nach "Weiterführen" eine neue Rechnung erstellt werden?
 *  - invoiceAmount: Betrag in CHF (wenn needsInvoice)
 *  - paymentMethods: ['online','qr'] oder []
 *  - needsManualReview: muss ein Admin vor Rechnungserstellung prüfen?
 *  - archivedWithin6Months: ist die Tour archiviert und nicht älter als 6 Monate?
 */
function computeCleanupRule(tour) {
  const status = String(tour.status || '').toUpperCase();
  const now = new Date();

  function monthsAgo(n) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - n);
    return d;
  }

  const createdAt = tour.created_at ? new Date(tour.created_at) : null;
  const archivedAt = tour.archived_at ? new Date(tour.archived_at) : null;
  const termEndDate = tour.term_end_date ? new Date(tour.term_end_date) : null;
  const lastPaymentAt = tour.last_payment_at ? new Date(tour.last_payment_at) : null;
  const cleanupCompleted = Boolean(tour.cleanup_completed);

  const sixMonthsAgo = monthsAgo(6);
  const twelveMonthsAgo = monthsAgo(12);

  // Bei importierten Touren ist created_at = Migrationsdatum (2026-03-30), nicht das echte Erstelldatum.
  // Proxy: term_end_date - 6 Monate (typische Abo-Laufzeit), da Abo-Start = term_end - 6M.
  const MIGRATION_DATE_PREFIX = '2026-03-30';
  const isCreatedAtUnknown =
    !createdAt || createdAt.toISOString().startsWith(MIGRATION_DATE_PREFIX);
  let effectiveCreatedAt = createdAt;
  if (isCreatedAtUnknown) {
    effectiveCreatedAt = termEndDate ? new Date(termEndDate.getTime()) : null;
    if (effectiveCreatedAt) effectiveCreatedAt.setMonth(effectiveCreatedAt.getMonth() - 6);
  }

  const isTourCreatedWithin6Months = effectiveCreatedAt ? effectiveCreatedAt >= sixMonthsAgo : false;
  const isTourCreatedWithin12Months = effectiveCreatedAt ? effectiveCreatedAt >= twelveMonthsAgo : false;

  // archived_at ist bei importierten Touren oft NULL → term_end_date als Fallback
  const effectiveArchivedAt = archivedAt || termEndDate;
  const isArchivedWithin6Months = effectiveArchivedAt ? effectiveArchivedAt >= sixMonthsAgo : false;

  // ── Nach dem Bereinigungslauf: fixe Preise, keine Gratis-Optionen ─────────
  if (cleanupCompleted) {
    const isArchived = status === 'ARCHIVED';
    const isExpired = status === 'EXPIRED_PENDING_ARCHIVE' || status === 'EXPIRED';
    const needsReactivation = isArchived || isExpired;
    const amount = needsReactivation ? REACTIVATION_PRICE_CHF : EXTENSION_PRICE_CHF;
    const invoiceKind = needsReactivation ? 'portal_reactivation' : 'portal_extension';
    return {
      statusLabel: isArchived ? 'Archiviert' : isExpired ? 'Abgelaufen' : 'Aktiv',
      statusContext: needsReactivation ? ' (Ihre Tour ist derzeit deaktiviert.)' : '',
      statusContextText: needsReactivation ? '(Ihre Tour ist derzeit deaktiviert.)' : '',
      weiterfuehrenHint: `Tour ${needsReactivation ? 'reaktivieren' : 'verlängern'} – CHF ${amount}.– (nach Bereinigungslauf)`,
      needsInvoice: true,
      invoiceAmount: amount,
      invoiceKind,
      paymentMethods: ['online', 'qr'],
      needsManualReview: false,
      needsFreeReactivation: false,
      archivedWithin6Months: false,
      isWithin6Months: false,
      cleanupCompleted: true,
    };
  }

  // ── ACTIVE / EXPIRING_SOON ────────────────────────────────────────────────
  // Logik basiert auf Tour-Alter (effectiveCreatedAt = created_at oder term_end - 6M als Proxy):
  //   < 6 Monate alt          → GRATIS + 6 Monate
  //   6–12 Monate alt         → last_payment_at vorhanden → GRATIS (Abo-Workflow)
  //                             kein last_payment_at       → CHF 59
  //   > 12 Monate alt         → CHF 59
  //   effectiveCreatedAt null  → CHF 59 (Fallback: unklar = kostenpflichtig)
  if (status === 'ACTIVE' || status === 'EXPIRING_SOON') {
    const label = status === 'EXPIRING_SOON' ? 'Läuft bald ab' : 'Aktiv';

    // Kein verlässliches Datum → sicher CHF 59
    if (!effectiveCreatedAt) {
      return {
        statusLabel: label,
        statusContext: ' (Ihre Tour läuft in Kürze ab.)',
        statusContextText: '(Ihre Tour läuft in Kürze ab.)',
        weiterfuehrenHint: `Tour verlängern – CHF ${EXTENSION_PRICE_CHF}.– / 6 Monate (online oder QR)`,
        needsInvoice: true,
        invoiceAmount: EXTENSION_PRICE_CHF,
        invoiceKind: 'portal_extension',
        paymentMethods: ['online', 'qr'],
        needsManualReview: false,
        needsFreeReactivation: false,
        archivedWithin6Months: false,
        isWithin6Months: false,
      };
    }

    // Tour < 6 Monate alt → GRATIS
    if (isTourCreatedWithin6Months) {
      return {
        statusLabel: label,
        statusContext: '',
        statusContextText: '',
        weiterfuehrenHint: 'Tour bleibt aktiv – keine Änderung (Tour < 6 Monate alt)',
        needsInvoice: false,
        invoiceAmount: null,
        paymentMethods: [],
        needsManualReview: false,
        needsFreeReactivation: false,
        archivedWithin6Months: false,
        isWithin6Months: true,
      };
    }

    // Tour 6–12 Monate alt → abhängig von last_payment_at
    if (isTourCreatedWithin12Months) {
      if (lastPaymentAt) {
        // Zahlung vorhanden → GRATIS (normaler Abo-Workflow)
        return {
          statusLabel: label,
          statusContext: '',
          statusContextText: '',
          weiterfuehrenHint: 'Tour bleibt aktiv – letzte Zahlung vorhanden (Abo-Verlängerung via Portal)',
          needsInvoice: false,
          invoiceAmount: null,
          paymentMethods: [],
          needsManualReview: false,
          needsFreeReactivation: false,
          archivedWithin6Months: false,
          isWithin6Months: false,
        };
      }
      // Kein last_payment_at → CHF 59
      return {
        statusLabel: label,
        statusContext: ' (Keine Zahlung erfasst – Verlängerung kostenpflichtig.)',
        statusContextText: '(Keine Zahlung erfasst – Verlängerung kostenpflichtig.)',
        weiterfuehrenHint: `Tour verlängern – CHF ${EXTENSION_PRICE_CHF}.– / 6 Monate (online oder QR)`,
        needsInvoice: true,
        invoiceAmount: EXTENSION_PRICE_CHF,
        invoiceKind: 'portal_extension',
        paymentMethods: ['online', 'qr'],
        needsManualReview: false,
        needsFreeReactivation: false,
        archivedWithin6Months: false,
        isWithin6Months: false,
      };
    }

    // Tour > 12 Monate alt → CHF 59
    return {
      statusLabel: label,
      statusContext: ' (Ihre Zahlung liegt mehr als 12 Monate zurück.)',
      statusContextText: '(Ihre Zahlung liegt mehr als 12 Monate zurück.)',
      weiterfuehrenHint: `Tour verlängern – CHF ${EXTENSION_PRICE_CHF}.– / 6 Monate (online oder QR)`,
      needsInvoice: true,
      invoiceAmount: EXTENSION_PRICE_CHF,
      invoiceKind: 'portal_extension',
      paymentMethods: ['online', 'qr'],
      needsManualReview: false,
      needsFreeReactivation: false,
      archivedWithin6Months: false,
      isWithin6Months: false,
    };
  }

  // ── EXPIRED: Tour ≤ 6 Monate alt → kostenlose Reaktivierung ──────────────
  if (status === 'EXPIRED_PENDING_ARCHIVE' || status === 'EXPIRED') {
    if (isTourCreatedWithin6Months) {
      return {
        statusLabel: 'Abgelaufen',
        statusContext: ' (Ihre Tour wird im Rahmen des Bereinigungslaufs einmalig kostenlos reaktiviert.)',
        statusContextText: '(Einmalige kostenlose Reaktivierung im Rahmen des Bereinigungslaufs.)',
        weiterfuehrenHint: 'Tour einmalig kostenlos reaktivieren – Bereinigungslauf-Kulanz (Tour ≤ 6 Monate alt)',
        needsInvoice: false,
        invoiceAmount: null,
        paymentMethods: [],
        needsManualReview: false,
        needsFreeReactivation: true,
        archivedWithin6Months: false,
        isWithin6Months: true,
      };
    }
    // Tour > 6 Monate alt → CHF 74 (inkl. Bearbeitungsgebühr)
    return {
      statusLabel: 'Abgelaufen',
      statusContext: ' (Ihre Tour ist derzeit deaktiviert.)',
      statusContextText: '(Ihre Tour ist derzeit deaktiviert.)',
      weiterfuehrenHint: `Tour reaktivieren – CHF ${REACTIVATION_PRICE_CHF}.– (inkl. CHF ${REACTIVATION_FEE_CHF}.– Bearbeitungsgebühr, online oder QR)`,
      needsInvoice: true,
      invoiceAmount: REACTIVATION_PRICE_CHF,
      invoiceKind: 'portal_reactivation',
      paymentMethods: ['online', 'qr'],
      needsManualReview: false,
      needsFreeReactivation: false,
      archivedWithin6Months: false,
      isWithin6Months: false,
    };
  }

  // ── CUSTOMER_ACCEPTED_AWAITING_PAYMENT ────────────────────────────────────
  if (status === 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT') {
    return {
      statusLabel: 'Warten auf Zahlung',
      statusContext: ' (Ihre Tour ist derzeit deaktiviert – die Zahlung für die Verlängerung steht noch aus.)',
      statusContextText: '(Ihre Tour ist derzeit deaktiviert – die Zahlung für die Verlängerung steht noch aus.)',
      weiterfuehrenHint: `Tour reaktivieren – Zahlung CHF ${EXTENSION_PRICE_CHF}.– ausstehend (online oder QR)`,
      needsInvoice: true,
      invoiceAmount: EXTENSION_PRICE_CHF,
      invoiceKind: 'portal_extension',
      paymentMethods: ['online', 'qr'],
      needsManualReview: false,
      needsFreeReactivation: false,
      archivedWithin6Months: false,
      isWithin6Months: isTourCreatedWithin6Months,
    };
  }

  // ── ARCHIVED ──────────────────────────────────────────────────────────────
  // Archivierte Touren bekommen keine Rechnung – sie bleiben archiviert oder werden gelöscht.
  if (status === 'ARCHIVED') {
    return {
      statusLabel: 'Archiviert',
      statusContext: ' (Ihre Tour ist archiviert.)',
      statusContextText: '(Ihre Tour ist archiviert.)',
      weiterfuehrenHint: 'Tour ist archiviert – keine Verlängerung möglich',
      needsInvoice: false,
      invoiceAmount: null,
      paymentMethods: [],
      needsManualReview: false,
      needsFreeReactivation: false,
      archivedWithin6Months: isArchivedWithin6Months,
      isWithin6Months: isTourCreatedWithin6Months,
    };
  }

  // Fallback für andere Stati
  return {
    statusLabel: status,
    statusContext: '',
    statusContextText: '',
    weiterfuehrenHint: 'Tour weiterführen',
    needsInvoice: false,
    invoiceAmount: null,
    paymentMethods: [],
    needsManualReview: false,
    archivedWithin6Months: false,
    isWithin6Months: isTourCreatedWithin6Months,
  };
}

// ─── Mail-Inhalt aufbauen ────────────────────────────────────────────────────

async function buildCleanupEmailContent(tour, tokens, options = {}) {
  const { dryRun = false } = options;
  const rule = computeCleanupRule(tour);

  const objectLabel = tour.object_label || tour.bezeichnung || tour.canonical_object_label || `Tour ${tour.id}`;
  const customerGreeting = tour.customer_contact ? `Guten Tag ${tour.customer_contact},` : 'Guten Tag,';
  const tourLink = tour.tour_url || (tour.matterport_space_id ? `https://my.matterport.com/show/?m=${tour.matterport_space_id}` : null);
  const portalUrl = getPortalUrl();
  const baseUrl = getCleanupBaseUrl();

  const createdAtFormatted = formatDate(tour.matterport_created_at || tour.created_at) || '–';
  const termEndRaw = String(tour.status || '').toUpperCase() === 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT'
    ? null
    : (tour.canonical_term_end_date || tour.term_end_date || tour.ablaufdatum);
  const termEndFormatted = formatDate(termEndRaw) || '–';
  const archivedAtFormatted = formatDate(tour.archived_at);

  // Aktions-URLs
  const buildUrl = (action, token) => {
    if (dryRun) return `${baseUrl}/cleanup/preview?action=${action}&tour=${tour.id}`;
    return `${baseUrl}/cleanup/${action}?token=${token}`;
  };

  const weiterfuehrenUrl = buildUrl('weiterfuehren', tokens?.weiterfuehren);
  const archivierenUrl = buildUrl('archivieren', tokens?.archivieren);
  const uebertragungUrl = buildUrl('uebertragen', tokens?.uebertragen);
  const loeschenUrl = buildUrl('loeschen', tokens?.loeschen);

  const tourLinkHtml = tourLink
    ? `<strong>Virtueller Rundgang:</strong> <a href="${escapeHtml(tourLink)}">${escapeHtml(tourLink)}</a><br>`
    : '';

  const objectAddress = await resolveTourAddress(tour);
  const objectAddressHtmlLine = objectAddress ? `<br>${escapeHtml(objectAddress)}` : '';
  const objectAddressTextLine = objectAddress ? `\n${objectAddress}` : '';

  const placeholders = {
    objectLabel,
    objectAddress,
    objectAddressHtmlLine,
    objectAddressTextLine,
    customerGreeting,
    tourLinkHtml,
    tourLinkText: tourLink ? `Virtueller Rundgang: ${tourLink}` : '',
    portalUrl,
    portalLinkHtml: `<a href="${escapeHtml(portalUrl)}">Meine Touren verwalten</a>`,
    portalLinkText: `Kundenportal: ${portalUrl}`,
    createdAt: createdAtFormatted,
    termEndFormatted,
    archivedAt: archivedAtFormatted || '',
    archivedAtText: archivedAtFormatted ? `Archiviert am: ${archivedAtFormatted}\n` : '',
    statusLabel: rule.statusLabel,
    statusContextHtml: rule.statusContext ? `<br><em style="color:#6b7280;font-size:14px;">${escapeHtml(rule.statusContext)}</em>` : '',
    statusContextText: rule.statusContextText,
    weiterfuehrenHint: rule.weiterfuehrenHint,
    weiterfuehrenUrl,
    archivierenUrl,
    uebertragungUrl,
    loeschenUrl,
  };

  const templates = await getEmailTemplates();
  const tpl = templates.cleanup_review_request || DEFAULT_EMAIL_TEMPLATES.cleanup_review_request || {};
  const subjectRaw = tpl.subject || 'Handlungsbedarf: Bitte prüfen Sie Ihre Tour – {{objectLabel}}';
  const htmlRaw = tpl.html || '';
  const textRaw = tpl.text || '';

  const safeKeys = ['tourLinkHtml', 'portalLinkHtml', 'statusContextHtml', 'objectAddressHtmlLine'];
  const subject = mergeTemplate(subjectRaw, placeholders).trim();
  const html = mergeTemplate(htmlRaw, placeholders, { htmlMode: true, safeKeys }).trim();
  const text = mergeTemplate(textRaw, placeholders).trim();

  return { subject, html, text, rule, placeholders };
}

// ─── Kandidaten-Touren ermitteln ─────────────────────────────────────────────
//
// Kandidaten-Regeln (6-Monats-Grenze):
//  - Nicht-archivierte Touren: created_at innerhalb der letzten 6 Monate
//  - Archivierte Touren: archived_at innerhalb der letzten 6 Monate
//    (damit auch Touren die erst kürzlich archiviert wurden, aber älter sind, erfasst werden)
//
// Zusätzliche Bedingungen:
//  - confirmation_required = TRUE (manuell für Bereinigungslauf markiert)
//  - Kunden-E-Mail vorhanden
//  - Noch keine cleanup_action durchgeführt
//  - Noch keine cleanup_sent_at (falls nur neue Kandidaten gewünscht, kann per skipAlreadySent=false deaktiviert werden)

async function getCleanupCandidates({ maxAgeMonths = 6, includeAlreadySent = false } = {}) {
  await ensureCleanupSchema();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - maxAgeMonths);
  const cutoffIso = cutoff.toISOString();

  // Zwei Gruppen:
  //  1. Nicht-archivierte Touren: created_at >= cutoff
  //  2. Archivierte Touren: archived_at >= cutoff (frisch archiviert, auch wenn Tour älter)
  const r = await pool.query(
    `SELECT t.*,
       (SELECT MAX(i.paid_at) FROM tour_manager.renewal_invoices i
        WHERE i.tour_id = t.id AND i.invoice_status = 'paid') AS last_payment_at
     FROM tour_manager.tours t
     WHERE (
       -- Gruppe 1: aktive/abgelaufene Touren (created_at oft = Migrationsdatum → confirmation_required als Hauptfilter)
       (t.status != 'ARCHIVED' AND t.created_at >= $1)
       OR
       -- Gruppe 2: archivierte Touren, die innerhalb der letzten 6 Monate archiviert wurden
       (t.status = 'ARCHIVED' AND (t.archived_at >= $1 OR t.created_at >= $1))
     )
       AND (t.customer_email IS NOT NULL AND TRIM(t.customer_email) != '')
       AND (t.cleanup_action IS NULL)
       AND (t.cleanup_sent_at IS NULL OR $2::boolean = TRUE)
       AND t.confirmation_required = TRUE
     ORDER BY COALESCE(t.archived_at, t.created_at) DESC`,
    [cutoffIso, includeAlreadySent]
  );
  return r.rows.map(normalizeTourRow);
}

// ─── Produktiver Versand für eine Tour ───────────────────────────────────────

async function sendCleanupMailForTour(tourId, actorType = 'admin', actorRef = null) {
  await ensureCleanupSchema();
  await ensureOutgoingEmailSchema();
  const r = await pool.query(
    `SELECT t.*,
       (SELECT MAX(i.paid_at) FROM tour_manager.renewal_invoices i
        WHERE i.tour_id = t.id AND i.invoice_status = 'paid') AS last_payment_at
     FROM tour_manager.tours t WHERE t.id = $1`,
    [tourId]
  );
  const tour = normalizeTourRow(r.rows[0]);
  if (!tour) throw new Error('Tour nicht gefunden');
  const email = String(tour.customer_email || '').trim().toLowerCase();
  if (!email) throw new Error('Tour hat keine Kunden-E-Mail');

  // Bereits versendet?
  if (tour.cleanup_sent_at) {
    throw new Error(`Bereinigungsmail wurde bereits am ${formatDate(tour.cleanup_sent_at)} versendet`);
  }

  // Sicherheitscheck: Tour muss für Bereinigungslauf markiert sein
  if (!tour.confirmation_required) {
    throw new Error('Tour ist nicht für den Bereinigungslauf markiert (confirmation_required = false).');
  }

  // Tokens generieren
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const rawTokens = {};
  const hashedTokens = {};
  for (const action of CLEANUP_TOKEN_TYPES) {
    rawTokens[action] = generateToken();
    hashedTokens[action] = await hashToken(rawTokens[action]);
  }

  const { subject, html, text, rule } = await buildCleanupEmailContent(tour, rawTokens, { dryRun: false });

  // Pseudo-Tour-Objekt für sendGraphMailToCustomer
  const mailResult = await sendGraphMailToCustomer({ ...tour, customer_email: email }, { subject, html, text });

  if (!mailResult.success) {
    await logAction(tour.id, actorType, actorRef, 'CLEANUP_MAIL_FAILED', { error: mailResult.error });
    throw new Error(mailResult.error || 'Versand fehlgeschlagen');
  }

  // Tokens persistieren
  for (const action of CLEANUP_TOKEN_TYPES) {
    await pool.query(
      `INSERT INTO tour_manager.cleanup_tokens (tour_id, token, action, expires_at) VALUES ($1, $2, $3, $4)`,
      [tour.id, hashedTokens[action], action, expiresAt.toISOString()]
    );
  }

  // E-Mail protokollieren
  await pool.query(
    `INSERT INTO tour_manager.outgoing_emails
       (tour_id, mailbox_upn, graph_message_id, internet_message_id, conversation_id,
        recipient_email, subject, template_key, sent_at, details_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'cleanup_review_request',NOW(),$8::jsonb)`,
    [
      tour.id,
      mailResult.mailboxUpn || 'system',
      mailResult.graphMessageId || null,
      mailResult.internetMessageId || null,
      mailResult.conversationId || null,
      mailResult.recipientEmail || email,
      subject,
      JSON.stringify({ rule: { statusLabel: rule.statusLabel, needsInvoice: rule.needsInvoice, needsManualReview: rule.needsManualReview } }),
    ]
  );

  // Tour: cleanup_sent_at setzen
  await pool.query(
    `UPDATE tour_manager.tours SET cleanup_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [tour.id]
  );

  await logAction(tour.id, actorType, actorRef, 'CLEANUP_MAIL_SENT', {
    recipientEmail: email,
    rule: { statusLabel: rule.statusLabel, needsInvoice: rule.needsInvoice, needsManualReview: rule.needsManualReview },
  });

  return {
    success: true,
    tourId: tour.id,
    recipientEmail: email,
    subject,
    rule,
  };
}

// ─── Sandbox-Vorschau (kein DB-Write, kein Versand) ──────────────────────────

async function sandboxPreviewForTour(tourId) {
  await ensureCleanupSchema();
  const r = await pool.query(
    `SELECT t.*,
       (SELECT MAX(i.paid_at) FROM tour_manager.renewal_invoices i
        WHERE i.tour_id = t.id AND i.invoice_status = 'paid') AS last_payment_at
     FROM tour_manager.tours t WHERE t.id = $1`,
    [tourId]
  );
  const tour = normalizeTourRow(r.rows[0]);
  if (!tour) throw new Error('Tour nicht gefunden');

  const rule = computeCleanupRule(tour);

  // Simulierte (nicht persistierte) Tokens
  const fakeTokens = {};
  for (const action of CLEANUP_TOKEN_TYPES) {
    fakeTokens[action] = 'PREVIEW_' + action.toUpperCase();
  }

  const { subject, html, text } = await buildCleanupEmailContent(tour, fakeTokens, { dryRun: true });

  const objectLabel = tour.object_label || tour.bezeichnung || tour.canonical_object_label || `Tour ${tour.id}`;

  const actionPlan = {
    weiterfuehren: {
      label: 'Weiterführen',
      hint: rule.weiterfuehrenHint,
      needsInvoice: rule.needsInvoice,
      invoiceAmount: rule.invoiceAmount,
      paymentMethods: rule.paymentMethods,
      needsManualReview: rule.needsManualReview,
    },
    archivieren: {
      label: 'Archivieren',
      hint: 'Tour wird archiviert, Matterport-Space deaktiviert',
      needsInvoice: false,
    },
    uebertragen: {
      label: 'Übertragen',
      hint: 'Tour wird auf anderes Matterport-Konto übertragen (Pro Plan erforderlich)',
      needsInvoice: false,
    },
    loeschen: {
      label: 'Löschen',
      hint: 'Tour und Matterport-Space werden dauerhaft gelöscht',
      needsInvoice: false,
    },
  };

  // Cleanup-Fenster: Tour muss confirmation_required = TRUE sein (Hauptkriterium)
  const withinCleanupWindow = !!tour.confirmation_required;

  return {
    dryRun: true,
    tourId: tour.id,
    objectLabel,
    status: tour.status,
    statusLabel: rule.statusLabel,
    archivedWithin6Months: rule.archivedWithin6Months,
    needsManualReview: rule.needsManualReview,
    withinCleanupWindow,
    withinCleanupWindowNote: !withinCleanupWindow
      ? 'Tour ist nicht für den Bereinigungslauf markiert (confirmation_required = false).'
      : null,
    isEligible: !tour.cleanup_sent_at && !!String(tour.customer_email || '').trim() && withinCleanupWindow,
    alreadySent: !!tour.cleanup_sent_at,
    alreadyDone: !!tour.cleanup_action,
    email: String(tour.customer_email || '').trim(),
    rule,
    actionPlan,
    mail: { subject, html, text },
  };
}

// ─── Kundentoken einlösen (Aktion ausführen) ─────────────────────────────────

async function redeemCleanupToken(rawToken, action) {
  await ensureCleanupSchema();

  // Alle noch nicht verwendeten Tokens für diese Aktion laden (Token selbst ist gehasht)
  const allRows = await pool.query(
    `SELECT * FROM tour_manager.cleanup_tokens
     WHERE action = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [action]
  );

  let matchedRow = null;
  for (const row of allRows.rows) {
    const { verifyToken } = require('./tokens');
    const ok = await verifyToken(rawToken, row.token);
    if (ok) { matchedRow = row; break; }
  }

  if (!matchedRow) {
    return { ok: false, error: 'Token ungültig, abgelaufen oder bereits verwendet' };
  }

  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [matchedRow.tour_id]);
  const tour = normalizeTourRow(tourResult.rows[0]);
  if (!tour) return { ok: false, error: 'Tour nicht gefunden' };

  if (tour.cleanup_action) {
    return { ok: false, error: 'Für diese Tour wurde bereits eine Aktion gewählt', alreadyDone: true, action: tour.cleanup_action };
  }

  // Token als benutzt markieren
  await pool.query(`UPDATE tour_manager.cleanup_tokens SET used_at = NOW() WHERE id = $1`, [matchedRow.id]);

  return { ok: true, tour, action };
}

// ─── Cleanup-Ticket erstellen (freie E-Mail-Antwort) ─────────────────────────

async function createCleanupTicketFromIncomingMail({ tourId, senderEmail, subject, bodyText }) {
  const ticketSubject = subject ? `Bereinigungslauf-Antwort: ${subject}` : 'Bereinigungslauf: Freie Kunden-Antwort';
  const description = `Eingehende Kundenantwort auf Bereinigungsmail.\n\nVon: ${senderEmail}\nBetreff: ${subject || '–'}\n\n${bodyText || ''}`;

  const r = await pool.query(
    `INSERT INTO tour_manager.tickets
       (module, reference_id, reference_type, category, subject, description, priority, created_by, created_by_role, status)
     VALUES ('tours', $1, 'tour', 'sonstiges', $2, $3, 'normal', $4, 'customer', 'open')
     RETURNING id`,
    [String(tourId), ticketSubject, description, senderEmail]
  );
  return r.rows[0];
}

// ─── Batch-Versand mit Dry-Run-Unterstützung ─────────────────────────────────

async function runCleanupBatch({ dryRun = true, tourIds = null, actorType = 'admin', actorRef = null } = {}) {
  await ensureCleanupSchema();

  let candidates;
  if (tourIds && Array.isArray(tourIds) && tourIds.length > 0) {
    const r = await pool.query(
      `SELECT t.*,
         (SELECT MAX(i.paid_at) FROM tour_manager.renewal_invoices i
          WHERE i.tour_id = t.id AND i.invoice_status = 'paid') AS last_payment_at
       FROM tour_manager.tours t WHERE t.id = ANY($1::int[]) ORDER BY t.id ASC`,
      [tourIds]
    );
    candidates = r.rows.map(normalizeTourRow);
  } else {
    candidates = await getCleanupCandidates();
  }

  const results = [];

  for (const tour of candidates) {
    const email = String(tour.customer_email || '').trim();
    const skipped =
      !email ||
      !!tour.cleanup_sent_at ||
      !!tour.cleanup_action;

    if (skipped) {
      results.push({
        tourId: tour.id,
        objectLabel: tour.canonical_object_label || tour.bezeichnung || `Tour ${tour.id}`,
        status: tour.status,
        email,
        skipped: true,
        skipReason: !email ? 'Keine E-Mail' : tour.cleanup_action ? 'Bereits abgeschlossen' : 'Bereits versendet',
      });
      continue;
    }

    if (dryRun) {
      const rule = computeCleanupRule(tour);
      await logAction(tour.id, actorType, actorRef, 'CLEANUP_BATCH_DRY_RUN', { rule: { statusLabel: rule.statusLabel } });
      results.push({
        tourId: tour.id,
        objectLabel: tour.canonical_object_label || tour.bezeichnung || `Tour ${tour.id}`,
        status: tour.status,
        statusLabel: rule.statusLabel,
        email,
        skipped: false,
        dryRun: true,
        rule,
      });
    } else {
      try {
        const r = await sendCleanupMailForTour(tour.id, actorType, actorRef);
        results.push({ tourId: tour.id, objectLabel: tour.canonical_object_label || `Tour ${tour.id}`, status: tour.status, email, skipped: false, success: true, rule: r.rule });
      } catch (err) {
        results.push({ tourId: tour.id, objectLabel: tour.canonical_object_label || `Tour ${tour.id}`, status: tour.status, email, skipped: false, success: false, error: err.message });
      }
    }
  }

  return {
    dryRun,
    total: candidates.length,
    sent: results.filter((r) => !r.skipped && !r.dryRun && r.success).length,
    skipped: results.filter((r) => r.skipped).length,
    failed: results.filter((r) => !r.skipped && !r.dryRun && !r.success).length,
    results,
  };
}

module.exports = {
  ensureCleanupSchema,
  computeCleanupRule,
  buildCleanupEmailContent,
  getCleanupCandidates,
  sendCleanupMailForTour,
  sandboxPreviewForTour,
  redeemCleanupToken,
  createCleanupTicketFromIncomingMail,
  runCleanupBatch,
  CLEANUP_TOKEN_TYPES,
};
