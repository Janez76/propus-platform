/**
 * Mutierende JSON-API für das React-Kunden-Portal.
 * Gemountet unter /portal/api (wird in server.js nach den lesenden portal-api Routen registriert).
 *
 * Delegiert alle Businesslogik in bestehende tours/lib/* Module.
 * Kein Duplikat von portal.js-Logik – nur Transport + Validierung.
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { pool } = require('../lib/db');
const { logAction } = require('../lib/actions');
const { normalizeTourRow } = require('../lib/normalize');
const {
  setVisibility: mpSetVisibility,
  archiveSpace: mpArchiveSpace,
  patchModelName: mpPatchModelName,
} = require('../lib/matterport');
const payrexx = require('../lib/payrexx');
const portalAuth = require('../lib/portal-auth');
const portalTeam = require('../lib/portal-team');
const userProfiles = require('../lib/user-profiles');
const { sendMailDirect } = require('../lib/microsoft-graph');
const tourActions = require('../lib/tour-actions');
const {
  EXTENSION_PRICE_CHF,
  REACTIVATION_PRICE_CHF,
  getPortalPricingForTour,
  getSubscriptionWindowFromStart,
} = require('../lib/subscriptions');
const { getDisplayedTourStatus } = require('../lib/tour-detail-payload');

const PORTAL_BASE_URL = process.env.PORTAL_BASE_URL || 'https://portal.propus.ch';

const profileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|pjpeg|png|gif|webp)$/i.test(file.mimetype || '');
    cb(null, ok);
  },
});

// ─── Öffentliche Endpunkte (kein Session-Guard) ─────────────────────────────

router.post('/login', async (req, res) => {
  try {
    if (req.session?.portalCustomerEmail) return res.json({ ok: true });
    const email = portalAuth.normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const rememberMe = req.body?.rememberMe;

    const matchedEmail = await portalAuth.verifyDbPortalPassword(email, password).catch(() => null);
    if (!matchedEmail) return res.status(401).json({ ok: false, error: 'E-Mail oder Passwort falsch.' });

    const portalUser = await portalAuth.getPortalUser(matchedEmail).catch(() => null);
    const keepSignedIn = rememberMe === true || rememberMe === 'true' || rememberMe === '1' || rememberMe === 'on';

    req.session.regenerate(async (regenErr) => {
      if (regenErr) return res.status(500).json({ ok: false, error: 'Session konnte nicht erstellt werden.' });
      if (keepSignedIn) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
      } else {
        req.session.cookie.expires = false;
        req.session.cookie.maxAge = null;
      }
      req.session.portalCustomerEmail = matchedEmail;
      req.session.portalCustomerName = String(portalUser?.full_name || '').trim() || matchedEmail;
      req.session.portalCustomerGivenName = '';
      req.session.portalCustomerFamilyName = '';
      await portalAuth.touchPortalLastLogin(matchedEmail).catch(() => null);
      req.session.save(() => res.json({ ok: true }));
    });
  } catch (err) {
    console.error('[portal-api] login error', err);
    res.status(500).json({ ok: false, error: 'Interner Fehler' });
  }
});

router.post('/forgot-password', async (req, res) => {
  // Immer dieselbe generische Antwort zurückgeben – verhindert Email-Enumeration.
  // Mail wird fire-and-forget versendet, damit Response-Zeit unabhängig vom SMTP/Graph-Roundtrip ist.
  const genericMsg = 'Falls ein Konto existiert, wurde eine E-Mail gesendet.';
  try {
    const email = portalAuth.normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ ok: false, error: 'E-Mail ist erforderlich.' });

    // Reset-Token synchron generieren (schnell, nur DB-INSERT), Mail asynchron.
    portalAuth.issuePasswordReset(email)
      .then((reset) => {
        if (!reset?.ok || !reset.token) return;
        const baseUrl = portalTeam.getPortalBaseUrl().replace(/\/$/, '');
        const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(reset.token)}`;
        return sendMailDirect({
          to: reset.email,
          subject: 'Passwort setzen – Propus Kundenportal',
          htmlBody:
            `<p>Guten Tag</p>` +
            `<p>Über diesen Link können Sie Ihr Passwort für das Propus Kundenportal setzen oder zurücksetzen:</p>` +
            `<p><a href="${resetLink}"><strong>Passwort setzen</strong></a></p>` +
            `<p style="color:#666;font-size:12px;">Falls der Link nicht funktioniert: ${resetLink}</p>` +
            `<p>Der Link ist 2 Stunden gültig.</p>`,
          textBody:
            `Passwort setzen / zurücksetzen:\n${resetLink}\n\nDer Link ist 2 Stunden gültig.`,
        });
      })
      .catch((err) => {
        console.error('[portal-api] forgot-password async error', err?.message || err);
      });

    return res.json({ ok: true, message: genericMsg });
  } catch (err) {
    console.error('[portal-api] forgot-password error', err);
    return res.json({ ok: true, message: genericMsg });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    if (!token) return res.status(400).json({ ok: false, error: 'Token fehlt.' });
    if (password.length < 8) return res.status(400).json({ ok: false, error: 'Passwort muss mindestens 8 Zeichen lang sein.' });
    const result = await portalAuth.consumePasswordReset(token, password).catch(() => null);
    if (!result) return res.status(400).json({ ok: false, error: 'Token ungültig oder abgelaufen.' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[portal-api] reset-password error', err);
    res.status(500).json({ ok: false, error: 'Interner Fehler' });
  }
});

router.get('/check-reset-token', async (req, res) => {
  try {
    const token = String(req.query?.token || '').trim();
    if (!token) return res.json({ ok: true, valid: false });
    const row = await portalAuth.getResetTokenRow(token).catch(() => null);
    const valid = !!(
      row &&
      !row.used_at &&
      row.expires_at &&
      new Date(row.expires_at).getTime() > Date.now()
    );
    return res.json({ ok: true, valid, email: valid ? row.email : null });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Interner Fehler' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('propus_tours.sid');
    res.json({ ok: true });
  });
});

// ─── Auth-Guard ──────────────────────────────────────────────────────────────

/**
 * requirePortalSession (Mutations)
 * Identisch zur Guard-Logik in portal-api.js:
 * 1. Portal-Session-Cookie → req.session.portalCustomerEmail
 * 2. Admin-Bearer-Token / admin_session-Cookie (Unified-Login für Portal-Kunden)
 */
function requirePortalSession(req, res, next) {
  if (req.session?.portalCustomerEmail) return next();

  let adminToken = '';
  const auth = String(req.headers.authorization || '');
  adminToken = auth.replace(/^Bearer\s+/i, '').trim();
  if (!adminToken) {
    const cookieHeader = String(req.headers.cookie || '');
    for (const part of cookieHeader.split(';')) {
      const c = part.trim();
      if (c.startsWith('admin_session=')) {
        adminToken = c.substring('admin_session='.length);
        break;
      }
    }
  }

  if (!adminToken) {
    return res.status(401).json({ error: 'Nicht angemeldet' });
  }

  const tokenHash = crypto.createHash('sha256').update(adminToken).digest('hex');
  const CUSTOMER_ROLES = ['customer_user', 'customer_admin', 'tour_manager'];

  pool.query(
    `SELECT user_key, user_name, role
     FROM admin_sessions
     WHERE token_hash = $1 AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  ).then((result) => {
    const row = result.rows[0];
    if (row && CUSTOMER_ROLES.includes(row.role) && row.user_key) {
      req.session.portalCustomerEmail = row.user_key;
      req.session.portalCustomerName = row.user_name || row.user_key;
      req.session.save(() => next());
    } else {
      res.status(401).json({ error: 'Nicht angemeldet' });
    }
  }).catch(() => res.status(401).json({ error: 'Nicht angemeldet' }));
}

router.use(requirePortalSession);

// ─── Profil (GET) ────────────────────────────────────────────────────────────

router.get('/profile/me', async (req, res) => {
  const email = req.session.portalCustomerEmail;
  try {
    const editor = await userProfiles.getPortalProfileForEditor(
      email,
      req.session.portalCustomerName || email,
      ''
    );
    return res.json({ ok: true, ...editor, canChangePassword: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Fehler' });
  }
});

// ─── Schema-Guard für renewal_invoices ───────────────────────────────────────

let renewalSchemaEnsured = false;
async function ensureRenewalSchema() {
  if (renewalSchemaEnsured) return;
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS amount_chf NUMERIC(10,2)`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30)`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS payment_source VARCHAR(30)`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS payment_note TEXT`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS recorded_by TEXT`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS subscription_start_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS subscription_end_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS invoice_kind VARCHAR(40)`);
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS payrexx_payment_url TEXT`);
  renewalSchemaEnsured = true;
}

// ─── Hilfsfunktion: Zugriff prüfen ───────────────────────────────────────────

async function assertTourAccess(tourId, email) {
  const result = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [tourId]);
  const raw = result.rows[0];
  if (!raw) return null;
  const allowed = await portalTeam.ensurePortalTourAccess(raw, email);
  if (!allowed) return null;
  return raw;
}

// ─── Rechnungsdruck-Daten (JSON) ─────────────────────────────────────────────

router.get('/tours/:id/invoices/:invoiceId/print-data', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const id = parseInt(req.params.id, 10);
    const invoiceId = parseInt(req.params.invoiceId, 10);
    if (!Number.isFinite(id) || !Number.isFinite(invoiceId)) return res.status(400).json({ error: 'Ungültige ID' });
    const raw = await assertTourAccess(id, email);
    if (!raw) return res.status(403).json({ error: 'Nicht erlaubt' });
    const tour = normalizeTourRow(raw);
    if (tour.canonical_matterport_space_id) {
      const { getModel: mpGet } = require('../lib/matterport');
      const { model } = await mpGet(tour.canonical_matterport_space_id).catch(() => ({ model: null }));
      if (model?.publication?.url && !tour.tour_url) tour.tour_url = model.publication.url;
      if (model?.publication?.address) tour.object_address = model.publication.address;
    }
    const invResult = await pool.query('SELECT * FROM tour_manager.renewal_invoices WHERE id = $1 AND tour_id = $2', [invoiceId, id]);
    const invoice = invResult.rows[0];
    if (!invoice) return res.status(404).json({ error: 'Rechnung nicht gefunden' });
    let amount = Number(invoice.amount_chf || invoice.betrag || invoice.preis_brutto || 0);
    if (!amount || isNaN(amount)) amount = EXTENSION_PRICE_CHF;
    const amountStr = Number(amount).toFixed(2);
    const invLabel = invoice.invoice_number || `Rechnung #${invoice.id}`;
    const dateRaw = invoice.sent_at || invoice.invoice_date || invoice.created_at;
    const invoiceDate = dateRaw ? new Date(dateRaw).toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';
    const statusLabels = { paid: 'Bezahlt', sent: 'Ausstehend', overdue: 'Überfällig', draft: 'Entwurf', cancelled: 'Storniert' };
    const statusLabel = statusLabels[invoice.invoice_status] || invoice.invoice_status || '-';
    const dueDate = invoice.due_at ? new Date(invoice.due_at) : null;
    const paymentDueLabel = dueDate ? `30 Tage (${dueDate.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })})` : '-';
    const periodStart = invoice.subscription_start_at ? new Date(invoice.subscription_start_at) : null;
    const periodEnd = invoice.subscription_end_at ? new Date(invoice.subscription_end_at) : null;
    const periodLabel = periodStart && periodEnd
      ? `${periodStart.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })} bis ${periodEnd.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
      : periodEnd ? `Bis ${periodEnd.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })}` : '-';

    const qrBill = require('../lib/qr-bill');
    const paymentContext = await qrBill.buildInvoicePaymentContext({ ...invoice, amount_chf: amount }, tour);

    // Beschreibung + MwSt-Aufschlüsselung je nach invoice_kind
    let bezeichnung = 'Virtueller Rundgang – Hosting / Verlängerung';
    let invoiceKindLabel = null;
    let floorCount = null;
    let unitPrice = null;
    let vatPercent = null;
    let amountNet = null;
    let amountVat = null;

    if (invoice.invoice_kind === 'portal_extension') {
      bezeichnung = 'Virtueller Rundgang – Verlängerung (6 Monate)';
      invoiceKindLabel = 'Matterport Hosting · 1 Jahr';
    } else if (invoice.invoice_kind === 'portal_reactivation') {
      bezeichnung = 'Virtueller Rundgang – Reaktivierung (6 Monate)';
      invoiceKindLabel = 'Matterport Hosting · Reaktivierung';
    } else if (invoice.invoice_kind === 'floorplan_order') {
      const note = invoice.payment_note || '';
      const etagenMatch = note.match(/Etagen:\s*(\d+)/);
      const preisMatch = note.match(/Preis pro Etage:\s*CHF\s*([\d.]+)/);
      const vatMatch = note.match(/inkl\.\s*([\d.]+)%\s*MwSt/);
      floorCount = etagenMatch ? parseInt(etagenMatch[1], 10) : null;
      unitPrice = preisMatch ? parseFloat(preisMatch[1]) : null;
      vatPercent = vatMatch ? parseFloat(vatMatch[1]) : null;
      if (floorCount && unitPrice) {
        bezeichnung = `2D Grundriss von Tour (${floorCount} Etage${floorCount !== 1 ? 'n' : ''} × CHF ${Number(unitPrice).toFixed(2)})`;
        invoiceKindLabel = `${floorCount} Etage${floorCount !== 1 ? 'n' : ''}`;
      } else {
        bezeichnung = '2D Grundriss von Tour';
      }
      if (vatPercent !== null && amount > 0) {
        const vatRate = vatPercent / 100;
        amountNet = Math.round(amount / (1 + vatRate) * 100) / 100;
        amountVat = Math.round((amount - amountNet) * 100) / 100;
      }
    }

    return res.json({
      ok: true,
      invLabel,
      invoiceDate,
      statusLabel,
      status: invoice.invoice_status,
      paymentDueLabel,
      customerName: [tour.customer_name, tour.customer_contact].filter(Boolean).join(' – ') || '-',
      customerEmail: tour.customer_email || '',
      bezeichnung,
      invoiceKindLabel,
      amount: amountStr,
      amountNet: amountNet !== null ? Number(amountNet).toFixed(2) : null,
      amountVat: amountVat !== null ? Number(amountVat).toFixed(2) : null,
      vatPercent,
      floorCount,
      unitPrice,
      invoiceKind: invoice.invoice_kind || null,
      tourLabel: tour.canonical_object_label || tour.object_label || tour.bezeichnung || `Tour #${tour.id}`,
      tourLink: tour.tour_url || null,
      tourAddress: tour.object_address || null,
      billingPeriodLabel: periodLabel,
      creditor: paymentContext.creditor,
      creditorLines: paymentContext.creditorLines,
      creditorIbanFormatted: paymentContext.creditorIbanFormatted,
      qrReferenceFormatted: paymentContext.qrReferenceFormatted,
      tourId: id,
      invoiceId,
    });
  } catch (err) {
    console.error('[portal-api-mutations] /tours/:id/invoices/:invoiceId/print-data error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

// ─── GET /portal/api/tours/:id (erweitert mit Rechnungen + Matterport) ───────
// Überschreibt/ergänzt den lesenden Endpunkt in portal-api.js um mutierende Daten

router.get('/tours/:id/detail', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Ungültige ID' });

    const raw = await assertTourAccess(id, email);
    if (!raw) return res.status(403).json({ error: 'Nicht erlaubt' });

    const tour = normalizeTourRow(raw);
    const pricing = getPortalPricingForTour(tour);

    const [invoicesResult, logsResult] = await Promise.all([
      pool.query(
        `SELECT * FROM tour_manager.renewal_invoices WHERE tour_id = $1 ORDER BY COALESCE(paid_at, sent_at, created_at) DESC NULLS LAST`,
        [id],
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT * FROM tour_manager.actions_log WHERE tour_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [id],
      ).catch(() => ({ rows: [] })),
    ]);

    const renewalRows = invoicesResult.rows;
    const renewalPaid = renewalRows.filter((row) => row.invoice_status === 'paid');
    const renewalOpen = renewalRows.filter((row) => ['sent', 'overdue', 'draft'].includes(row.invoice_status));
    const sumAmount = (rows) => rows.reduce((sum, row) => sum + (parseFloat(row.amount_chf) || parseFloat(row.preis_brutto) || 0), 0);
    const paymentEvents = [
      ...renewalPaid
        .filter((row) => row.paid_at)
        .map((row) => ({
          at: row.paid_at,
          label: row.invoice_number || row.exxas_invoice_id || 'Verlängerungsrechnung',
          amount: parseFloat(row.amount_chf) || parseFloat(row.preis_brutto) || null,
        })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at));
    const paymentSummary = {
      paidCount: renewalPaid.length,
      openCount: renewalOpen.length,
      paidAmount: sumAmount(renewalPaid),
      openAmount: sumAmount(renewalOpen),
      lastPayment: paymentEvents[0] || null,
    };
    const paymentTimeline = renewalRows.map((row) => ({
      source: 'renewal',
      title: row.invoice_number || row.exxas_invoice_id || 'Verlängerungsrechnung',
      status: row.invoice_status,
      statusLabel: ({ draft: 'Entwurf', sent: 'Gesendet', paid: 'Bezahlt', overdue: 'Überfällig', cancelled: 'Storniert' })[row.invoice_status] || row.invoice_status,
      amount: parseFloat(row.amount_chf) || parseFloat(row.preis_brutto) || null,
      primaryDate: row.paid_at || row.sent_at || row.created_at,
    })).sort((a, b) => new Date(b.primaryDate || 0) - new Date(a.primaryDate || 0));

    const displayedTourStatus = getDisplayedTourStatus(tour);

    const { getModel: mpGetModel } = require('../lib/matterport');
    let mpVisibility = null;
    if (tour.canonical_matterport_space_id) {
      const { model } = await mpGetModel(tour.canonical_matterport_space_id).catch(() => ({ model: null }));
      mpVisibility = model?.accessVisibility || model?.visibility || null;
    }

    const assigneeBundle = await portalTeam.getPortalTourAssigneeBundle(email, [tour]).catch(() => null);

    return res.json({
      ok: true,
      tour,
      invoices: renewalRows,
      actions_log: logsResult.rows,
      mpVisibility,
      pricing,
      payrexxConfigured: payrexx.isConfigured(),
      assigneeBundle,
      paymentSummary,
      paymentTimeline,
      displayedTourStatus,
    });
  } catch (err) {
    console.error('[portal-api-mutations] /tours/:id/detail error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

// ─── Profil ───────────────────────────────────────────────────────────────────

router.post('/profile/me', profileUpload.single('photo'), async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const displayName = String(req.body?.displayName || '').trim() || null;
    await userProfiles.upsertPortalProfileSimple(email, {
      displayName,
      photoBuffer: req.file ? req.file.buffer : undefined,
      photoMime: req.file ? req.file.mimetype : undefined,
    });
    if (displayName) {
      req.session.portalCustomerName = displayName;
      await new Promise((resolve) => req.session.save(resolve));
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[portal-api-mutations] /profile/me error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/profile/password', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    await portalAuth.changePortalPassword(email, req.body?.currentPassword, req.body?.newPassword);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[portal-api-mutations] /profile/password error:', err);
    return res.status(400).json({ ok: false, error: err.message || 'Fehler' });
  }
});

// ─── Tour-Aktionen ────────────────────────────────────────────────────────────

router.post('/tours/:id/assignee', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Ungültige ID' });

    const raw = await assertTourAccess(id, email);
    if (!raw) return res.status(403).json({ error: 'Nicht erlaubt' });

    await portalTeam.setTourAssignee(raw, req.body?.assigneeEmail, email);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[portal-api-mutations] /tours/:id/assignee error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tours/:id/edit', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const { id } = req.params;

    const raw = await assertTourAccess(id, email);
    if (!raw) return res.status(403).json({ error: 'Nicht erlaubt' });

    const objectLabel = String(req.body?.object_label || '').trim() || null;
    const customerContact = String(req.body?.customer_contact || '').trim() || null;
    const customerName = String(req.body?.customer_name || '').trim() || null;
    const hasMpSpace = String(raw.matterport_space_id || '').trim() !== '';
    const startSweep = hasMpSpace
      ? (String(req.body?.start_sweep || '').trim() || null)
      : raw.matterport_start_sweep;

    await pool.query(
      `UPDATE tour_manager.tours
       SET object_label = COALESCE($1, object_label),
           customer_contact = COALESCE($2, customer_contact),
           customer_name = COALESCE($3, customer_name),
           matterport_start_sweep = $5,
           updated_at = NOW()
       WHERE id = $4`,
      [objectLabel, customerContact, customerName, id, startSweep],
    );

    const tourNorm = normalizeTourRow(raw);
    const spaceId = tourNorm.canonical_matterport_space_id;
    const newObjectLabel = objectLabel !== null ? objectLabel : raw.object_label;
    const mpTitle = newObjectLabel && String(newObjectLabel).trim() ? String(newObjectLabel).trim() : null;
    const mpTitleBefore = raw.object_label && String(raw.object_label).trim()
      ? String(raw.object_label).trim()
      : null;
    let matterportNameOk = true;
    if (spaceId && mpTitle && mpTitle !== mpTitleBefore) {
      const patchRes = await mpPatchModelName(spaceId, mpTitle);
      matterportNameOk = patchRes.success;
    }

    await logAction(id, 'customer', email, 'PORTAL_EDIT', {
      objectLabel,
      matterport_name_sync: spaceId && mpTitle && mpTitle !== mpTitleBefore
        ? { ok: matterportNameOk }
        : null,
    });

    return res.json({ ok: true, matterportNameOk });
  } catch (err) {
    console.error('[portal-api-mutations] /tours/:id/edit error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tours/:id/extend', async (req, res) => {
  try {
    await ensureRenewalSchema();
    const email = req.session.portalCustomerEmail;
    const { id } = req.params;
    const paymentMethod = req.body?.paymentMethod === 'qr_invoice' ? 'qr_invoice' : 'payrexx';

    const raw = await assertTourAccess(id, email);
    if (!raw) return res.status(403).json({ error: 'Nicht erlaubt' });

    const tour = normalizeTourRow(raw);
    const pricing = getPortalPricingForTour(tour);

    const existingCount = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM tour_manager.renewal_invoices WHERE tour_id = $1`,
      [id],
    );
    const hasExistingInvoices = (existingCount.rows[0]?.cnt || 0) > 0;

    let dueAt = null;
    if (pricing.isReactivation) {
      dueAt = new Date();
    } else if (!hasExistingInvoices) {
      const firstWindow = getSubscriptionWindowFromStart(
        tour.matterport_created_at || tour.created_at || new Date(),
      );
      dueAt = firstWindow.endDate || new Date();
    } else {
      const termEnd = tour.canonical_term_end_date || tour.term_end_date || tour.ablaufdatum || null;
      dueAt = termEnd ? new Date(termEnd) : new Date();
    }

    let subscriptionWindow;
    if (pricing.isReactivation) {
      subscriptionWindow = getSubscriptionWindowFromStart(new Date());
    } else {
      const termEnd = tour.canonical_term_end_date || tour.term_end_date || tour.ablaufdatum || null;
      const base = termEnd && new Date(termEnd) > new Date() ? new Date(termEnd) : new Date();
      subscriptionWindow = getSubscriptionWindowFromStart(base);
    }

    if (paymentMethod === 'qr_invoice') {
      const dbInv = await pool.query(
        `INSERT INTO tour_manager.renewal_invoices
           (tour_id, invoice_status, sent_at, amount_chf, due_at, invoice_kind, payment_source,
            subscription_start_at, subscription_end_at)
         VALUES ($1, 'sent', NOW(), $2, $3, $4, 'qr_pending', $5, $6)
         RETURNING id`,
        [id, pricing.amountCHF, dueAt, pricing.invoiceKind,
          subscriptionWindow.startIso, subscriptionWindow.endIso],
      );
      const internalInvId = dbInv.rows[0]?.id;

      await pool.query(
        `UPDATE tour_manager.tours SET status = 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT', updated_at = NOW() WHERE id = $1`,
        [id],
      );
      await logAction(id, 'customer', email, 'PORTAL_EXTEND', {
        internal_inv_id: internalInvId,
        amount_chf: pricing.amountCHF,
        invoice_kind: pricing.invoiceKind,
        subscription_end_at: subscriptionWindow.endIso,
        via: 'qr_invoice',
      });

      tourActions.sendInvoiceWithQrEmail(id, internalInvId).catch((err) => {
        console.error('sendInvoiceWithQrEmail failed:', id, err.message);
      });

      const successKey = pricing.isReactivation ? 'reactivation_requested' : 'extended';
      return res.json({ ok: true, successKey });
    }

    // Payrexx-Pfad
    if (!payrexx.isConfigured()) {
      return res.status(400).json({ error: 'payrexx_not_configured' });
    }

    const dbInv = await pool.query(
      `INSERT INTO tour_manager.renewal_invoices
         (tour_id, invoice_status, sent_at, amount_chf, due_at, invoice_kind, payment_source)
       VALUES ($1, 'sent', NOW(), $2, $3, $4, 'payrexx_pending')
       RETURNING id`,
      [id, pricing.amountCHF, dueAt, pricing.invoiceKind],
    );
    const internalInvId = dbInv.rows[0]?.id;

    await pool.query(
      `UPDATE tour_manager.tours SET status = 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT', updated_at = NOW() WHERE id = $1`,
      [id],
    );
    await logAction(id, 'customer', email, 'PORTAL_EXTEND', {
      internal_inv_id: internalInvId,
      amount_chf: pricing.amountCHF,
      invoice_kind: pricing.invoiceKind,
      subscription_end_at: subscriptionWindow.endIso,
      via: 'payrexx',
    });

    const successUrl = `${PORTAL_BASE_URL}/portal/tours/${id}?success=paid`;
    const cancelUrl = `${PORTAL_BASE_URL}/portal/tours/${id}?error=cancelled`;
    const { paymentUrl, error: payErr } = await payrexx.createCheckout({
      referenceId: `tour-${id}-internal-${internalInvId}`,
      amountCHF: pricing.amountCHF,
      purpose: `${tour.canonical_object_label || `Tour #${id}`} – ${pricing.isReactivation ? 'Reaktivierung' : 'Verlängerung'}`,
      successUrl,
      cancelUrl,
      email,
    });

    if (paymentUrl) {
      await pool.query(
        `UPDATE tour_manager.renewal_invoices SET payrexx_payment_url = $1 WHERE id = $2`,
        [paymentUrl, internalInvId],
      );
      return res.json({ ok: true, redirectUrl: paymentUrl });
    }
    if (payErr) console.warn('Payrexx createCheckout:', payErr);
    return res.status(502).json({ error: 'payment_failed' });
  } catch (err) {
    console.error('[portal-api-mutations] /tours/:id/extend error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.get('/tours/:id/pay/:invoiceId', async (req, res) => {
  try {
    await ensureRenewalSchema();
    const email = req.session.portalCustomerEmail;
    const { id, invoiceId } = req.params;

    const raw = await assertTourAccess(id, email);
    if (!raw) return res.status(403).json({ error: 'Nicht erlaubt' });

    const tour = normalizeTourRow(raw);
    const invResult = await pool.query(
      `SELECT * FROM tour_manager.renewal_invoices WHERE id = $1 AND tour_id = $2`,
      [invoiceId, id],
    );
    const invoice = invResult.rows[0];
    if (!invoice) return res.status(404).json({ error: 'Rechnung nicht gefunden' });

    if (invoice.payrexx_payment_url) {
      return res.json({ ok: true, paymentUrl: invoice.payrexx_payment_url });
    }

    if (!payrexx.isConfigured()) {
      return res.status(400).json({ error: 'payrexx_not_configured' });
    }

    const invoiceAmountCHF =
      Number(invoice.amount_chf || invoice.betrag || invoice.amount || 0) ||
      (invoice.invoice_kind === 'portal_reactivation' ? REACTIVATION_PRICE_CHF : EXTENSION_PRICE_CHF);

    const successUrl = `${PORTAL_BASE_URL}/portal/tours/${id}?success=paid`;
    const cancelUrl = `${PORTAL_BASE_URL}/portal/tours/${id}?error=cancelled`;
    const { paymentUrl, error: payErr } = await payrexx.createCheckout({
      referenceId: `tour-${id}-inv-${invoice.id}`,
      amountCHF: invoiceAmountCHF,
      purpose: tour.canonical_object_label || `Tour #${id}`,
      successUrl,
      cancelUrl,
      email,
    });

    if (payErr) {
      console.warn('Payrexx pay:', payErr);
      return res.status(502).json({ error: 'payment_failed' });
    }

    await pool.query(
      `UPDATE tour_manager.renewal_invoices SET payrexx_payment_url = $1 WHERE id = $2`,
      [paymentUrl, invoice.id],
    );
    return res.json({ ok: true, paymentUrl });
  } catch (err) {
    console.error('[portal-api-mutations] /tours/:id/pay/:invoiceId error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.get('/tours/:id/matterport-model', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const { id } = req.params;
    const raw = await assertTourAccess(id, email);
    if (!raw) return res.status(403).json({ error: 'Nicht erlaubt' });
    const tourNorm = normalizeTourRow(raw);
    const spaceId = tourNorm.canonical_matterport_space_id;
    if (!spaceId) return res.status(404).json({ error: 'Kein Matterport-Space verknüpft' });
    const { getModel: mpGet } = require('../lib/matterport');
    const { model, inactiveWarning } = await mpGet(spaceId).catch(() => ({ model: null }));
    if (!model) return res.status(502).json({ error: 'Matterport-Modell konnte nicht geladen werden' });
    return res.json({ ok: true, model, inactiveWarning: inactiveWarning || false });
  } catch (err) {
    console.error('[portal-api-mutations] /tours/:id/matterport-model error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tours/:id/matterport-options', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const { id } = req.params;
    const raw = await assertTourAccess(id, email);
    if (!raw) return res.status(403).json({ error: 'Nicht erlaubt' });
    const tourNorm = normalizeTourRow(raw);
    const spaceId = tourNorm.canonical_matterport_space_id;
    if (!spaceId) return res.status(400).json({ error: 'no_matterport' });

    const ALLOWED = [
      'defurnishViewOverride', 'dollhouseOverride', 'floorplanOverride',
      'socialSharingOverride', 'vrOverride', 'highlightReelOverride',
      'labelsOverride', 'tourAutoplayOverride', 'roomBoundsOverride',
    ];
    const VALID_VALUES = ['enabled', 'disabled', 'default'];
    const patch = {};
    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) {
        const val = String(req.body[key]);
        if (!VALID_VALUES.includes(val)) return res.status(400).json({ error: `Ungültiger Wert für ${key}` });
        patch[key] = val;
      }
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Keine Felder zum Aktualisieren' });

    const { patchModelOptions } = require('../lib/matterport');
    const result = await patchModelOptions(spaceId, patch);
    if (!result.success) return res.status(502).json({ error: result.error || 'Matterport API Fehler' });

    await logAction(id, 'customer', email, 'PORTAL_MP_OPTIONS', { patch });
    return res.json({ ok: true, options: result.options });
  } catch (err) {
    console.error('[portal-api-mutations] /tours/:id/matterport-options error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tours/:id/set-start-sweep', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const { id } = req.params;
    const raw = await assertTourAccess(id, email);
    if (!raw) return res.status(403).json({ error: 'Nicht erlaubt' });
    const sweep = String(req.body?.start_sweep ?? '').trim() || null;
    await pool.query(
      `UPDATE tour_manager.tours SET matterport_start_sweep = $1, updated_at = NOW() WHERE id = $2`,
      [sweep, id]
    );
    await logAction(id, 'customer', email, 'PORTAL_SET_SWEEP', { start_sweep: sweep });
    return res.json({ ok: true, start_sweep: sweep });
  } catch (err) {
    console.error('[portal-api-mutations] /tours/:id/set-start-sweep error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tours/:id/visibility', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const { id } = req.params;

    const raw = await assertTourAccess(id, email);
    if (!raw) return res.status(403).json({ error: 'Nicht erlaubt' });

    const tourNorm = normalizeTourRow(raw);
    const spaceId = tourNorm.canonical_matterport_space_id || tourNorm.matterport_space_id || null;
    if (!spaceId) return res.status(400).json({ error: 'no_matterport' });

    const visibility = String(req.body?.visibility || '').toUpperCase();
    const ALLOWED = ['PRIVATE', 'LINK_ONLY', 'PUBLIC', 'PASSWORD'];
    if (!ALLOWED.includes(visibility)) {
      return res.status(400).json({ error: 'invalid_visibility' });
    }
    const password = visibility === 'PASSWORD'
      ? (String(req.body?.password || '').trim() || null)
      : undefined;

    const result = await mpSetVisibility(spaceId, visibility, password);
    if (!result.success) return res.status(502).json({ error: 'visibility_failed' });

    await logAction(id, 'customer', email, 'PORTAL_VISIBILITY', { visibility, hasPassword: !!password });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[portal-api-mutations] /tours/:id/visibility error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tours/:id/archive', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const { id } = req.params;

    const raw = await assertTourAccess(id, email);
    if (!raw) return res.status(403).json({ error: 'Nicht erlaubt' });

    const tourNorm = normalizeTourRow(raw);
    const spaceId = tourNorm.canonical_matterport_space_id;

    if (spaceId) {
      const archiveResult = await mpArchiveSpace(spaceId);
      if (!archiveResult.success) {
        return res.status(502).json({ error: 'matterport_archive_failed' });
      }
    }

    await pool.query(
      `UPDATE tour_manager.tours SET status = 'ARCHIVED', archiv = TRUE, archiv_datum = NOW(), updated_at = NOW() WHERE id = $1`,
      [id],
    );
    await logAction(id, 'customer', email, 'PORTAL_ARCHIVE', { spaceId });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[portal-api-mutations] /tours/:id/archive error:', err);
    return res.status(500).json({ error: err.message });
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
 * Gibt Preisinfo + Etagen aus Matterport zurück (Portal).
 */
router.get('/tours/:id/floorplan-pricing', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const { id } = req.params;
    const raw = await assertTourAccess(id, email);
    if (!raw) return res.status(403).json({ error: 'Nicht erlaubt' });

    const tourNorm = normalizeTourRow(raw);
    const spaceId = tourNorm.canonical_matterport_space_id;

    let floors = [];
    if (spaceId) {
      const { getModel: mpGet } = require('../lib/matterport');
      const { model } = await mpGet(spaceId).catch(() => ({ model: null }));
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
    console.error('[portal-api-mutations] /tours/:id/floorplan-pricing error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /tours/:id/order-floorplan
 * Grundriss-Bestellung aus dem Kundenportal.
 * Body: { paymentMethod: "payrexx" | "qr_invoice", comment: string, floorCount: number }
 */
router.post('/tours/:id/order-floorplan', async (req, res) => {
  try {
    await ensureRenewalSchema();
    const email = req.session.portalCustomerEmail;
    const { id } = req.params;
    const raw = await assertTourAccess(id, email);
    if (!raw) return res.status(403).json({ error: 'Nicht erlaubt' });

    const tour = normalizeTourRow(raw);
    const paymentMethod = req.body?.paymentMethod === 'qr_invoice' ? 'qr_invoice' : 'payrexx';
    const comment = String(req.body?.comment || '').trim();
    const floorCount = Math.max(1, parseInt(req.body?.floorCount, 10) || 1);

    const { unitPrice, vatRate } = await getFloorplanPricingData();
    const totalGross = Math.round(floorCount * unitPrice * (1 + vatRate) * 100) / 100;

    const tourLabel = String(tour.canonical_object_label || tour.bezeichnung || `Tour #${id}`);
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
        [id, totalGross, dueAt, comment || null],
      );
      const internalInvId = dbInv.rows[0]?.id;

      await pool.query(
        `INSERT INTO tour_manager.tickets
           (module, reference_id, reference_type, category, subject, description, priority, created_by, created_by_role)
         VALUES ('tours', $1, 'tour', 'sonstiges', $2, $3, 'normal', $4, 'customer')`,
        [String(id), `Grundriss bestellt — ${floorCount} Etage${floorCount !== 1 ? 'n' : ''}`, ticketDescription, email],
      );

      await logAction(id, 'customer', email, 'FLOORPLAN_ORDER', {
        via: 'qr_invoice', internal_inv_id: internalInvId, amount_chf: totalGross, floor_count: floorCount,
      });

      tourActions.sendInvoiceWithQrEmail(String(id), internalInvId).catch((err) => {
        console.error('[portal-api-mutations] sendInvoiceWithQrEmail (floorplan) failed:', id, err.message);
      });

      return res.json({ ok: true, via: 'qr_invoice' });
    }

    // Payrexx-Pfad
    if (!payrexx.isConfigured()) {
      return res.status(400).json({ error: 'payrexx_not_configured' });
    }

    const dbInv = await pool.query(
      `INSERT INTO tour_manager.renewal_invoices
         (tour_id, invoice_status, sent_at, amount_chf, due_at, invoice_kind, payment_source, payment_note)
       VALUES ($1, 'sent', NOW(), $2, $3, 'floorplan_order', 'payrexx_pending', $4)
       RETURNING id`,
      [id, totalGross, dueAt, comment || null],
    );
    const internalInvId = dbInv.rows[0]?.id;

    await pool.query(
      `INSERT INTO tour_manager.tickets
         (module, reference_id, reference_type, category, subject, description, priority, created_by, created_by_role)
       VALUES ('tours', $1, 'tour', 'sonstiges', $2, $3, 'normal', $4, 'customer')`,
      [String(id), `Grundriss bestellt — ${floorCount} Etage${floorCount !== 1 ? 'n' : ''}`, ticketDescription, email],
    );

    await logAction(id, 'customer', email, 'FLOORPLAN_ORDER', {
      via: 'payrexx', internal_inv_id: internalInvId, amount_chf: totalGross, floor_count: floorCount,
    });

    const successUrl = `${PORTAL_BASE_URL}/portal/tours/${id}?success=floorplan_ordered`;
    const cancelUrl  = `${PORTAL_BASE_URL}/portal/tours/${id}?error=cancelled`;
    const { paymentUrl, error: payErr } = await payrexx.createCheckout({
      referenceId: `tour-${id}-internal-${internalInvId}`,
      amountCHF: totalGross,
      purpose: `${tourLabel} – Grundriss (${floorCount} Etage${floorCount !== 1 ? 'n' : ''})`,
      successUrl,
      cancelUrl,
      email: String(tour.canonical_customer_email || tour.customer_email || email || ''),
    });

    if (paymentUrl) {
      await pool.query(
        `UPDATE tour_manager.renewal_invoices SET payrexx_payment_url = $1 WHERE id = $2`,
        [paymentUrl, internalInvId],
      );
      return res.json({ ok: true, via: 'payrexx', redirectUrl: paymentUrl });
    }

    if (payErr) console.warn('[portal-api-mutations] Payrexx createCheckout (floorplan):', payErr);
    return res.status(502).json({ error: 'Payrexx-Checkout konnte nicht erstellt werden' });
  } catch (err) {
    console.error('[portal-api-mutations] /tours/:id/order-floorplan error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Team-Mutationen ──────────────────────────────────────────────────────────

router.post('/team/exxas/invite', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const norm = portalTeam.normalizeEmail(email);
    const ownerWorkspace = portalTeam.normalizeEmail(
      String(req.body?.ownerWorkspaceEmail || '').trim(),
    );
    const memberEmail = String(req.body?.email || '').trim();
    const displayName = String(req.body?.displayName || '').trim();
    const role = portalTeam.normalizeMemberRole(req.body?.role);

    if (!ownerWorkspace || !memberEmail) {
      return res.status(400).json({ error: 'Ungültige Eingabe' });
    }

    await portalTeam.assertCanManageTeam(norm, ownerWorkspace);
    await portalTeam.clearExxasMemberExcluded(ownerWorkspace, memberEmail);
    const { token, memberEmail: invited } = await portalTeam.createTeamInvite({
      ownerEmail: ownerWorkspace,
      inviterEmail: norm,
      memberEmail,
      displayName: displayName || null,
      role,
    });

    const link = `${portalTeam.getPortalBaseUrl()}/portal/team/einladung/${token}`;
    const mail = await sendMailDirect({
      to: invited,
      subject: 'Einladung – Propus Kundenportal',
      htmlBody:
        `<p>Sie wurden eingeladen, gemeinsam auf die Touren zuzugreifen.</p>` +
        `<p><a href="${link}"><strong>Einladung annehmen</strong></a></p>` +
        `<p style="color:#666;font-size:12px;">Falls der Link nicht funktioniert: ${link}</p>`,
      textBody: `Einladung annehmen: ${link}`,
    });

    return res.json({ ok: true, mailSent: !!mail?.success });
  } catch (err) {
    console.error('[portal-api-mutations] /team/exxas/invite error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/team/exxas/remove', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const norm = portalTeam.normalizeEmail(email);
    const ownerWorkspace = portalTeam.normalizeEmail(
      String(req.body?.ownerWorkspaceEmail || '').trim(),
    );
    const memberEmail = String(req.body?.email || '').trim();
    if (!ownerWorkspace || !memberEmail) {
      return res.status(400).json({ error: 'Ungültige Eingabe' });
    }
    await portalTeam.assertCanManageTeam(norm, ownerWorkspace);
    await portalTeam.setExxasMemberExcluded(ownerWorkspace, memberEmail, norm, 'manual_remove');
    return res.json({ ok: true });
  } catch (err) {
    console.error('[portal-api-mutations] /team/exxas/remove error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/team/members/:id/revoke', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const norm = portalTeam.normalizeEmail(email);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Ungültige ID' });

    const row = await portalTeam.getMemberRowForManage(id);
    if (!row) return res.status(404).json({ error: 'Eintrag nicht gefunden' });
    await portalTeam.assertCanManageTeam(norm, row.owner_email);
    await portalTeam.revokeTeamMember(row.owner_email, id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[portal-api-mutations] /team/members/:id/revoke error:', err);
    return res.status(err.message?.includes('Berechtigung') ? 403 : 500).json({ error: err.message });
  }
});

router.post('/team/members/:id/role', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const norm = portalTeam.normalizeEmail(email);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Ungültige ID' });

    const row = await portalTeam.getMemberRowForManage(id);
    if (!row || row.status !== 'active') {
      return res.status(404).json({ error: 'Eintrag nicht gefunden' });
    }
    await portalTeam.assertCanManageTeam(norm, row.owner_email);
    const newRole = portalTeam.normalizeMemberRole(req.body?.role);
    const ok = await portalTeam.updateTeamMemberRole(row.owner_email, id, newRole);
    if (!ok) return res.status(500).json({ error: 'Rolle konnte nicht gespeichert werden' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[portal-api-mutations] /team/members/:id/role error:', err);
    return res.status(err.message?.includes('Berechtigung') ? 403 : 500).json({ error: err.message });
  }
});

module.exports = router;
