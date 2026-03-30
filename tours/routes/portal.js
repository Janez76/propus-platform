/**
 * Kunden-Portal – tour.propus.ch/portal
 *
 * Authentifizierung: internes Kunden-Login via Datenbank.
 * Danach: alle eigenen Touren sehen, bearbeiten, verlängern, archivieren, löschen, bezahlen.
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../lib/db');
const { logAction } = require('../lib/actions');
const { normalizeTourRow } = require('../lib/normalize');
const {
  getModel: mpGetModel,
  setVisibility: mpSetVisibility,
  unarchiveSpace: mpUnarchiveSpace,
  archiveSpace: mpArchiveSpace,
  patchModelName: mpPatchModelName,
} = require('../lib/matterport');
const payrexx = require('../lib/payrexx');
const portalAuth = require('../lib/portal-auth');
const qrBill = require('../lib/qr-bill');
const { isLogtoEnabled } = require('../../auth/logto-config');
const {
  EXTENSION_PRICE_CHF,
  REACTIVATION_PRICE_CHF,
  getPortalPricingForTour,
  getSubscriptionWindowFromStart,
} = require('../lib/subscriptions');
const tourActions = require('../lib/tour-actions');
const portalTeam = require('../lib/portal-team');
const { sendMailDirect } = require('../lib/microsoft-graph');
const userProfiles = require('../lib/user-profiles');
const multer = require('multer');

const profileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|pjpeg|png|gif|webp)$/i.test(file.mimetype || '');
    cb(null, ok);
  },
});

const PORTAL_BASE_URL = process.env.PORTAL_BASE_URL || 'https://tour.propus.ch';
let renewalSchemaEnsured = false;

async function ensureRenewalInvoiceSchema() {
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

// ─── Middleware ───────────────────────────────────────────────────────────────

function requirePortalAuth(req, res, next) {
  if (req.session?.portalCustomerEmail) return next();
  return res.redirect('/portal/login?next=' + encodeURIComponent(req.originalUrl));
}

/** Häufigster Firmen-/Kundenname aus Touren (für Sidebar & Begrüssung) */
function organizationNameFromTours(tours) {
  if (!tours || !tours.length) return null;
  const counts = new Map();
  for (const t of tours) {
    const v = String(t.canonical_customer_name || t.customer_name || '').trim();
    if (v) counts.set(v, (counts.get(v) || 0) + 1);
  }
  if (!counts.size) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Anzeige-Vorname: SSO given_name, sonst Name parsen, nie die volle E-Mail als „Name“. */
function welcomeFirstName(sessionGivenName, sessionName, email) {
  const g = String(sessionGivenName || '').trim();
  if (g) {
    const first = g.split(/\s+/).filter(Boolean)[0];
    if (first) return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }
  let raw = String(sessionName || '').trim();
  if (raw.includes('@')) {
    const local = raw.split('@')[0];
    const seg = local.split(/[._-]+/).filter(Boolean)[0];
    if (seg) return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
  }
  if (raw) {
    const parts = raw.split(/\s+/).filter(Boolean);
    const first = parts[0];
    if (first && !first.includes('@')) {
      return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    }
  }
  const local = String(email || '').split('@')[0] || '';
  if (!local) return '';
  const seg = local.split(/[._-]+/).filter(Boolean)[0] || local;
  return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
}

/** Anzeigename in der Sidebar: bevorzugt Vor- + Nachname, nie die Roh-E-Mail als einzige Zeile. */
function portalSidebarDisplayName(sessionGivenName, sessionFamilyName, sessionName, email) {
  const given = String(sessionGivenName || '').trim();
  const family = String(sessionFamilyName || '').trim();
  if (given && family) return `${given} ${family}`;
  if (given) return given;
  const full = String(sessionName || '').trim();
  if (full && !full.includes('@')) return full;
  if (full.includes('@')) {
    const local = full.split('@')[0];
    const parts = local.split(/[._-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
    }
  }
  const em = String(email || '').trim().toLowerCase();
  if (em) {
    const local = em.split('@')[0];
    const parts = local.split(/[._-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
    }
  }
  return welcomeFirstName(sessionGivenName, sessionName, email) || em || '';
}

function portalBrandingBase(req, tours) {
  const organizationName = organizationNameFromTours(tours) || null;
  const sessionEmail = req.session.portalCustomerEmail;
  return {
    organizationName,
    welcomeFirstName: welcomeFirstName(
      req.session.portalCustomerGivenName,
      req.session.portalCustomerName,
      sessionEmail
    ),
    portalNav: {
      displayName: portalSidebarDisplayName(
        req.session.portalCustomerGivenName,
        req.session.portalCustomerFamilyName,
        req.session.portalCustomerName,
        sessionEmail
      ),
      email: sessionEmail || '',
      organizationName,
    },
  };
}

async function portalBrandingForRequest(req, tours) {
  const base = portalBrandingBase(req, tours);
  return userProfiles.getPortalSidebarMerge(req.session.portalCustomerEmail, base);
}

function teamPortalRoleLabel(roleKey) {
  const map = {
    inhaber: 'Inhaber',
    admin: 'Administrator',
    mitarbeiter: 'Mitarbeiter',
    exxas: 'In System gefunden',
    pending_admin: 'Einladung · Administrator',
    pending_mitarbeiter: 'Einladung · Mitarbeiter',
  };
  return map[roleKey] || roleKey;
}

function teamPortalStatusLabel(state, source) {
  if (state === 'pending') return 'Einladung offen';
  if (source === 'exxas') return 'In System gefunden';
  return 'Aktiv';
}

/** Inhaber, DB-Team, ausstehende Einladungen, plus Exxas-Organisationskontakte ohne DB-Zeile */
function buildTeamAccessRows({
  sessionEmail,
  ownerEmail,
  billingDisplayName,
  teamActive,
  teamPending,
  exxasPeers,
  canManageInvites,
}) {
  const norm = portalTeam.normalizeEmail;
  const sn = norm(sessionEmail);
  const rows = [];
  const seen = new Set();

  rows.push({
    rowId: 'billing',
    name: billingDisplayName,
    email: ownerEmail,
    state: 'active',
    stateLabel: 'Aktiv',
    roleKey: 'inhaber',
    roleLabel: teamPortalRoleLabel('inhaber'),
    isSelf: sn === norm(ownerEmail),
    dbMemberId: null,
    manage: null,
  });
  seen.add(norm(ownerEmail));

  for (const m of teamActive) {
    const em = norm(m.member_email);
    if (seen.has(em)) continue;
    seen.add(em);
    const display = String(m.display_name || '').trim();
    const rk = m.role === portalTeam.ROLE_ADMIN ? 'admin' : 'mitarbeiter';
    rows.push({
      rowId: `m-${m.id}`,
      name: display || m.member_email.split('@')[0],
      email: m.member_email,
      state: 'active',
      stateLabel: teamPortalStatusLabel('active', 'team'),
      roleKey: rk,
      roleLabel: teamPortalRoleLabel(rk),
      isSelf: sn === em,
      dbMemberId: m.id,
      manage: canManageInvites && !(sn === em)
        ? {
            kind: 'member',
            memberId: m.id,
            remove: true,
            currentRole: m.role === portalTeam.ROLE_ADMIN ? portalTeam.ROLE_ADMIN : portalTeam.ROLE_MITARBEITER,
          }
        : null,
    });
  }

  for (const m of teamPending) {
    const em = norm(m.member_email);
    if (seen.has(em)) continue;
    seen.add(em);
    const display = String(m.display_name || '').trim();
    const isAdm = m.role === portalTeam.ROLE_ADMIN;
    const rk = isAdm ? 'pending_admin' : 'pending_mitarbeiter';
    rows.push({
      rowId: `p-${m.id}`,
      name: display || m.member_email.split('@')[0],
      email: m.member_email,
      state: 'pending',
      stateLabel: teamPortalStatusLabel('pending', 'team'),
      roleKey: rk,
      roleLabel: teamPortalRoleLabel(rk),
      isSelf: false,
      dbMemberId: m.id,
      manage: canManageInvites && !(sn === em) ? { kind: 'pending', memberId: m.id, revoke: true } : null,
    });
  }

  for (const p of exxasPeers || []) {
    const em = norm(p.email);
    if (seen.has(em)) continue;
    seen.add(em);
    rows.push({
      rowId: `x-${em}`,
      name: p.name || em.split('@')[0],
      email: p.email,
      state: 'active',
      stateLabel: teamPortalStatusLabel('active', 'exxas'),
      roleKey: 'exxas',
      roleLabel: teamPortalRoleLabel('exxas'),
      isSelf: sn === em,
      dbMemberId: null,
      manage: canManageInvites && !(sn === em)
        ? {
            kind: 'exxas',
            email: p.email,
            suggestedRole: portalTeam.ROLE_MITARBEITER,
          }
        : null,
    });
  }

  return rows;
}

async function loadPortalData(email) {
  await ensureRenewalInvoiceSchema();
  const { ownerEmails: owners, orgKundeRefs } = await portalTeam.getPortalTourAccessScope(email);
  if (owners.length === 0) {
    return { tours: [], invoices: [] };
  }
  const toursResult =
    orgKundeRefs.length > 0
      ? await pool.query(
          `SELECT * FROM tour_manager.tours
           WHERE LOWER(TRIM(customer_email)) = ANY($1::text[])
              OR TRIM(CAST(kunde_ref AS TEXT)) = ANY($2::text[])
           ORDER BY created_at DESC`,
          [owners, orgKundeRefs]
        )
      : await pool.query(
          `SELECT * FROM tour_manager.tours
           WHERE LOWER(TRIM(customer_email)) = ANY($1::text[])
           ORDER BY created_at DESC`,
          [owners]
        );
  let tours = toursResult.rows.map(normalizeTourRow);
  tours = await portalTeam.filterToursForMitarbeiterAssignee(email, tours);
  const tourIds = tours.map((t) => t.id);
  let invoicesResult = { rows: [] };
  if (tourIds.length > 0) {
    invoicesResult = await pool.query(
      `SELECT ri.*,
              ri.invoice_status AS invoice_status,
              COALESCE(ri.sent_at, ri.created_at) AS invoice_date,
              ri.amount_chf AS betrag,
              t.customer_email,
              t.object_label,
              t.bezeichnung,
              t.id AS tour_id
       FROM tour_manager.renewal_invoices ri
       JOIN tour_manager.tours t ON t.id = ri.tour_id
       WHERE t.id = ANY($1::int[])
       ORDER BY COALESCE(ri.paid_at, ri.sent_at, ri.created_at) DESC NULLS LAST`,
      [tourIds]
    );
  }
  return {
    tours,
    invoices: invoicesResult.rows,
  };
}

// ─── Internes Kunden-Login ───────────────────────────────────────────────────

function getPortalNextPath(req) {
  return typeof req.query?.next === 'string' && req.query.next.startsWith('/')
    ? req.query.next
    : '/portal/dashboard';
}

function renderPortalLogin(req, res, options = {}) {
  const bp = typeof res.locals.basePath === 'string' ? res.locals.basePath : '';
  return res.render('portal/login', {
    error: options.error || null,
    success: options.success || null,
    nextPath: options.nextPath || '/portal/dashboard',
    email: options.email || '',
    bp,
    logtoPortalEnabled: isLogtoEnabled('PROPUS_TOURS_PORTAL'),
  });
}

router.get('/login', async (req, res) => {
  const bp = typeof res.locals.basePath === 'string' ? res.locals.basePath : '';
  if (req.session?.portalCustomerEmail) return res.redirect(`${bp}/portal/dashboard`);
  return renderPortalLogin(req, res, {
    success: req.query.success || null,
    nextPath: getPortalNextPath(req),
    email: typeof req.query?.email === 'string' ? String(req.query.email).trim() : '',
  });
});

router.post('/login', async (req, res) => {
  const bp = typeof res.locals.basePath === 'string' ? res.locals.basePath : '';
  if (req.session?.portalCustomerEmail) return res.redirect(`${bp}/portal/dashboard`);
  const email = portalAuth.normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const rememberMe = req.body?.rememberMe;
  const nextPath =
    typeof req.body?.next === 'string' && req.body.next.startsWith('/') ? req.body.next : '/portal/dashboard';

  const matchedEmail = await portalAuth.verifyDbPortalPassword(email, password).catch(() => null);
  if (!matchedEmail) {
    return renderPortalLogin(req, res, {
      error: 'E-Mail oder Passwort falsch.',
      nextPath,
      email,
    });
  }

  const portalUser = await portalAuth.getPortalUser(matchedEmail).catch(() => null);
  const keepSignedIn =
    rememberMe === '1' || rememberMe === 'on' || rememberMe === true || rememberMe === 'true';

  return req.session.regenerate(async (regenErr) => {
    if (regenErr) {
      return renderPortalLogin(req, res, {
        error: 'Session konnte nicht erstellt werden.',
        nextPath,
        email,
      });
    }
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
    req.session.save(() => res.redirect(nextPath));
  });
});

router.get('/forgot-password', (req, res) => {
  if (req.session?.portalCustomerEmail) return res.redirect('/portal/dashboard');
  res.render('portal/forgot-password', {
    error: null,
    success: null,
    email: typeof req.query?.email === 'string' ? String(req.query.email).trim() : '',
  });
});

router.post('/forgot-password', async (req, res) => {
  const email = portalAuth.normalizeEmail(req.body?.email);
  const genericSuccess =
    'Falls ein passender Zugang existiert, haben wir einen Link zum Setzen Ihres Passworts gesendet.';
  try {
    const reset = await portalAuth.issuePasswordReset(email);
    if (reset?.ok && reset.token) {
      const resetLink = `${PORTAL_BASE_URL}/portal/reset-password?token=${encodeURIComponent(reset.token)}`;
      await sendMailDirect({
        to: reset.email,
        subject: 'Passwort setzen – Propus Kundenportal',
        htmlBody:
          `<p>Guten Tag</p>` +
          `<p>über diesen Link können Sie Ihr Passwort für das Propus Kundenportal setzen oder zurücksetzen:</p>` +
          `<p><a href="${resetLink}"><strong>Passwort setzen</strong></a></p>` +
          `<p style="color:#666;font-size:12px;">Falls der Button nicht funktioniert: ${resetLink}</p>` +
          `<p>Der Link ist 2 Stunden gültig.</p>`,
        textBody:
          `Passwort setzen / zurücksetzen:\n${resetLink}\n\n` +
          `Der Link ist 2 Stunden gültig.`,
      });
    }
    return res.render('portal/forgot-password', {
      error: null,
      success: genericSuccess,
      email,
    });
  } catch (err) {
    return res.render('portal/forgot-password', {
      error: 'Anfrage konnte nicht verarbeitet werden. Bitte später erneut versuchen.',
      success: null,
      email,
    });
  }
});

router.get('/reset-password', async (req, res) => {
  const token = String(req.query?.token || '').trim();
  const row = token ? await portalAuth.getResetTokenRow(token).catch(() => null) : null;
  const isValid =
    !!(row && !row.used_at && row.expires_at && new Date(row.expires_at).getTime() > Date.now());
  res.render('portal/reset-password', {
    error: null,
    success: null,
    token,
    email: row?.email || '',
    isValid,
  });
});

router.post('/reset-password', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');
  const passwordRepeat = String(req.body?.passwordRepeat || '');
  const row = token ? await portalAuth.getResetTokenRow(token).catch(() => null) : null;
  const isValid =
    !!(row && !row.used_at && row.expires_at && new Date(row.expires_at).getTime() > Date.now());

  if (!isValid) {
    return res.render('portal/reset-password', {
      error: 'Link ungültig oder abgelaufen.',
      success: null,
      token,
      email: row?.email || '',
      isValid: false,
    });
  }
  if (password !== passwordRepeat) {
    return res.render('portal/reset-password', {
      error: 'Die Passwörter stimmen nicht überein.',
      success: null,
      token,
      email: row?.email || '',
      isValid: true,
    });
  }
  try {
    await portalAuth.consumePasswordReset(token, password);
    return res.redirect(
      '/portal/login?success=' +
        encodeURIComponent('password_reset') +
        '&email=' +
        encodeURIComponent(row.email || '')
    );
  } catch (err) {
    return res.render('portal/reset-password', {
      error: err.message || 'Passwort konnte nicht gesetzt werden.',
      success: null,
      token,
      email: row?.email || '',
      isValid: true,
    });
  }
});

// ─── Logout ───────────────────────────────────────────────────────────────────

router.get('/profile/me', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  try {
    const { tours } = await loadPortalData(email);
    const base = portalBrandingBase(req, tours);
    const editor = await userProfiles.getPortalProfileForEditor(
      email,
      base.portalNav.displayName,
      base.organizationName || ''
    );
    return res.json({
      ok: true,
      ...editor,
      canChangePassword: true,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'Fehler' });
  }
});

router.get('/profile/photo', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  try {
    const photo = await userProfiles.getPortalPhoto(email);
    if (!photo?.buffer) return res.status(404).end();
    res.setHeader('Content-Type', photo.mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(Buffer.from(photo.buffer));
  } catch (e) {
    return res.status(500).end();
  }
});

router.get('/profile/photo/:email', requirePortalAuth, async (req, res) => {
  const viewerEmail = req.session.portalCustomerEmail;
  const targetEmail = req.params.email;
  try {
    const allowed = await portalTeam.canViewPortalIdentity(viewerEmail, targetEmail);
    if (!allowed) return res.status(403).end();
    const photo = await userProfiles.getPortalPhoto(targetEmail);
    if (!photo?.buffer) return res.status(404).end();
    res.setHeader('Content-Type', photo.mime || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(Buffer.from(photo.buffer));
  } catch (e) {
    return res.status(500).end();
  }
});

router.post('/profile/me', requirePortalAuth, profileUpload.single('photo'), async (req, res) => {
  const email = req.session.portalCustomerEmail;
  const removePhoto = req.body?.removePhoto === '1' || req.body?.removePhoto === 'true';
  try {
    await userProfiles.upsertPortalProfileSimple(email, {
      displayName: req.body?.displayName !== undefined ? String(req.body.displayName) : undefined,
      organizationDisplay:
        req.body?.organizationDisplay !== undefined ? String(req.body.organizationDisplay) : undefined,
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

router.post('/profile/password', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  try {
    await portalAuth.changePortalPassword(
      email,
      req.body?.currentPassword,
      req.body?.newPassword
    );
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message || 'Fehler' });
  }
});

router.get('/logout', async (req, res) => {
  const bp = typeof res.locals.basePath === 'string' ? res.locals.basePath : '';
  if (req.session?.portalLogtoAuth) {
    return res.redirect(`${bp}/portal/auth/logout`);
  }
  req.session.destroy(() => res.redirect(`${bp}/portal/login`));
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get('/dashboard', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  const { tours, invoices } = await loadPortalData(email);
  const openInvoices = invoices.filter((inv) => inv.invoice_status === 'sent' || inv.invoice_status === 'overdue');
  const activeTours = tours.filter((tour) => tour.status === 'ACTIVE' || tour.status === 'EXPIRING_SOON');
  const nextExpiryTours = [...tours]
    .filter((tour) => !!(tour.canonical_term_end_date || tour.ablaufdatum))
    .sort((a, b) => new Date(a.canonical_term_end_date || a.ablaufdatum) - new Date(b.canonical_term_end_date || b.ablaufdatum))
    .slice(0, 5);
  res.render('portal/dashboard', {
    ...(await portalBrandingForRequest(req, tours)),
    tours,
    invoices,
    openInvoices,
    activeTours,
    nextExpiryTours,
    email,
    success: req.query.success || null,
    error: req.query.error || null,
    isAdminView: !!req.session.isAdminImpersonating,
    payrexxConfigured: payrexx.isConfigured(),
  });
});

// ─── Tour-Übersicht ───────────────────────────────────────────────────────────

router.get('/tours', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  const { tours, invoices } = await loadPortalData(email);
  const assigneeBundle = await portalTeam.getPortalTourAssigneeBundle(email, tours);
  res.render('portal/tours', {
    ...(await portalBrandingForRequest(req, tours)),
    tours,
    invoices,
    assigneeBundle,
    email,
    linked: req.query.linked === '1',
    error: req.query.error || null,
    success: req.query.success || null,
    isAdminView: !!req.session.isAdminImpersonating,
    payrexxConfigured: payrexx.isConfigured(),
  });
});

// ─── Rechnungen ───────────────────────────────────────────────────────────────

router.get('/invoices', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  const { tours, invoices } = await loadPortalData(email);
  const indexedTours = new Map(tours.map((tour) => [tour.id, tour]));
  const decoratedInvoices = invoices.map((inv) => {
    const tour = indexedTours.get(inv.tour_id);
    return {
      ...inv,
      tourLabel: tour?.canonical_object_label || tour?.bezeichnung || `Tour #${inv.tour_id}`,
    };
  });
  res.render('portal/invoices', {
    ...(await portalBrandingForRequest(req, tours)),
    invoices: decoratedInvoices,
    email,
    success: req.query.success || null,
    error: req.query.error || null,
    isAdminView: !!req.session.isAdminImpersonating,
    payrexxConfigured: payrexx.isConfigured(),
  });
});

// ─── Team ─────────────────────────────────────────────────────────────────────

router.get('/team', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  const norm = portalTeam.normalizeEmail(email);
  const { tours } = await loadPortalData(email);
  const ownerEmail = tours.length ? portalTeam.normalizeEmail(tours[0].customer_email) : norm;
  const ownerTour = tours.find((t) => portalTeam.normalizeEmail(t.customer_email) === ownerEmail);
  const billingContactName = ownerTour ? String(ownerTour.customer_contact || '').trim() : '';
  const billingDisplayName =
    billingContactName
    || (norm === ownerEmail ? String(req.session.portalCustomerName || '').trim() : '')
    || ownerEmail.split('@')[0];
  const teamCtx = await portalTeam.getPortalTeamManageContext(norm, ownerEmail);
  const canManageInvites = teamCtx.canManage;
  const members = await portalTeam.listTeamMembers(ownerEmail);
  const teamActive = members.filter((m) => m.status === 'active');
  const teamPending = members.filter((m) => m.status === 'pending');
  const exxasPeers = await portalTeam.listExxasOrgPeersForOwner(ownerEmail);
  const teamAccessRows = buildTeamAccessRows({
    sessionEmail: email,
    ownerEmail,
    billingDisplayName,
    teamActive,
    teamPending,
    exxasPeers,
    canManageInvites,
  });

  res.render('portal/team', {
    ...(await portalBrandingForRequest(req, tours)),
    members,
    teamActive,
    teamPending,
    teamAccessRows,
    exxasPeersCount: exxasPeers.length,
    toursCount: tours.length,
    email,
    ownerEmail,
    billingDisplayName,
    isBillingOwner: teamCtx.isWorkspaceOwner,
    canManageTeam: canManageInvites,
    showTeamActionsColumn: canManageInvites,
    success: req.query.success || null,
    error: req.query.error || null,
    mailError: req.query.mailError === '1',
    isAdminView: !!req.session.isAdminImpersonating,
  });
});

router.post('/team/invite', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  const norm = portalTeam.normalizeEmail(email);
  const ownerWorkspace = portalTeam.normalizeEmail(String(req.body?.ownerWorkspaceEmail || '').trim()) || norm;
  try {
    await portalTeam.assertCanManageTeam(norm, ownerWorkspace);
  } catch (e) {
    return res.redirect('/portal/team?error=' + encodeURIComponent(e.message || 'Keine Berechtigung.'));
  }

  const inviteEmail = String(req.body?.email || '').trim();
  const displayName = String(req.body?.displayName || '').trim();
  const inviteRole = portalTeam.normalizeMemberRole(req.body?.role);
  try {
    const { token, memberEmail } = await portalTeam.createTeamInvite({
      ownerEmail: ownerWorkspace,
      inviterEmail: norm,
      memberEmail: inviteEmail,
      displayName: displayName || null,
      role: inviteRole,
    });
    const link = `${portalTeam.getPortalBaseUrl()}/portal/team/einladung/${token}`;
    const mail = await sendMailDirect({
      to: memberEmail,
      subject: 'Einladung – Propus Kundenportal',
      htmlBody:
        `<p>Sie wurden eingeladen, gemeinsam auf die Touren zuzugreifen.</p>` +
        `<p><a href="${link}"><strong>Einladung annehmen</strong></a></p>` +
        `<p style="color:#666;font-size:12px;">Falls der Link nicht funktioniert: ${link}</p>`,
      textBody: `Einladung annehmen: ${link}`,
    });
    let dest = '/portal/team?success=eingeladen_gesendet';
    if (!mail.success) dest += '&mailError=1';
    return res.redirect(dest);
  } catch (err) {
    return res.redirect('/portal/team?error=' + encodeURIComponent(err.message || 'Fehler'));
  }
});

router.post('/team/exxas/invite', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  const norm = portalTeam.normalizeEmail(email);
  const ownerWorkspace = portalTeam.normalizeEmail(String(req.body?.ownerWorkspaceEmail || '').trim());
  const memberEmail = String(req.body?.email || '').trim();
  const displayName = String(req.body?.displayName || '').trim();
  const role = portalTeam.normalizeMemberRole(req.body?.role);
  if (!ownerWorkspace || !memberEmail) {
    return res.redirect('/portal/team?error=' + encodeURIComponent('Ungültige Eingabe.'));
  }
  try {
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
    let dest = '/portal/team?success=eingeladen_gesendet';
    if (!mail.success) dest += '&mailError=1';
    return res.redirect(dest);
  } catch (err) {
    return res.redirect('/portal/team?error=' + encodeURIComponent(err.message || 'Fehler'));
  }
});

router.post('/team/exxas/remove', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  const norm = portalTeam.normalizeEmail(email);
  const ownerWorkspace = portalTeam.normalizeEmail(String(req.body?.ownerWorkspaceEmail || '').trim());
  const memberEmail = String(req.body?.email || '').trim();
  if (!ownerWorkspace || !memberEmail) {
    return res.redirect('/portal/team?error=' + encodeURIComponent('Ungültige Eingabe.'));
  }
  try {
    await portalTeam.assertCanManageTeam(norm, ownerWorkspace);
    await portalTeam.setExxasMemberExcluded(ownerWorkspace, memberEmail, norm, 'manual_remove');
    return res.redirect('/portal/team?success=mitglied_entfernt');
  } catch (err) {
    return res.redirect('/portal/team?error=' + encodeURIComponent(err.message || 'Fehler'));
  }
});

router.post('/team/members/:id/revoke', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  const norm = portalTeam.normalizeEmail(email);
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.redirect('/portal/team?error=ungueltig');
  const row = await portalTeam.getMemberRowForManage(id);
  if (!row) return res.redirect('/portal/team?error=' + encodeURIComponent('Eintrag nicht gefunden.'));
  try {
    await portalTeam.assertCanManageTeam(norm, row.owner_email);
  } catch (e) {
    return res.redirect('/portal/team?error=' + encodeURIComponent(e.message || 'Keine Berechtigung.'));
  }
  await portalTeam.revokeTeamMember(row.owner_email, id);
  return res.redirect('/portal/team?success=mitglied_entfernt');
});

router.post('/team/members/:id/role', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  const norm = portalTeam.normalizeEmail(email);
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.redirect('/portal/team?error=ungueltig');
  const row = await portalTeam.getMemberRowForManage(id);
  if (!row || row.status !== 'active') {
    return res.redirect('/portal/team?error=' + encodeURIComponent('Eintrag nicht gefunden.'));
  }
  try {
    await portalTeam.assertCanManageTeam(norm, row.owner_email);
  } catch (e) {
    return res.redirect('/portal/team?error=' + encodeURIComponent(e.message || 'Keine Berechtigung.'));
  }
  const newRole = portalTeam.normalizeMemberRole(req.body?.role);
  const ok = await portalTeam.updateTeamMemberRole(row.owner_email, id, newRole);
  if (!ok) return res.redirect('/portal/team?error=' + encodeURIComponent('Rolle konnte nicht gespeichert werden.'));
  return res.redirect('/portal/team?success=rolle_gespeichert');
});

router.get('/team/einladung/:token', async (req, res) => {
  const token = String(req.params.token || '').trim();
  const row = await portalTeam.getInviteByToken(token);
  if (!row) {
    return res.status(404).render('portal/error', { message: 'Einladung ungültig oder abgelaufen.' });
  }
  if (!req.session?.portalCustomerEmail) {
    return res.redirect('/portal/login?next=' + encodeURIComponent(req.originalUrl));
  }
  const inviteEmail = portalTeam.normalizeEmail(row.member_email);
  const sessionEmail = portalTeam.normalizeEmail(req.session.portalCustomerEmail);
  if (inviteEmail !== sessionEmail) {
    return res.status(403).render('portal/error', {
      message: 'Bitte mit der eingeladenen E-Mail-Adresse anmelden.',
    });
  }
  try {
    await portalTeam.acceptTeamInvite(token, req.session.portalCustomerEmail);
    return res.redirect('/portal/team?success=eingeladen_angenommen');
  } catch (err) {
    return res.status(400).render('portal/error', { message: err.message || 'Fehler' });
  }
});

// ─── Tour-Detail ──────────────────────────────────────────────────────────────

router.get('/tours/:id', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [req.params.id]);
  const raw = tourResult.rows[0];
  if (!raw || !(await portalTeam.ensurePortalTourAccess(raw, email))) return res.status(404).render('portal/error', { message: 'Tour nicht gefunden.' });
  const tour = normalizeTourRow(raw);
  const { tours: allTours } = await loadPortalData(email);

  const invoicesResult = await pool.query(
    `SELECT *,
            invoice_status AS invoice_status,
            COALESCE(sent_at, created_at) AS invoice_date,
            amount_chf AS betrag
     FROM tour_manager.renewal_invoices
     WHERE tour_id = $1
     ORDER BY COALESCE(paid_at, sent_at, created_at) DESC NULLS LAST`,
    [tour.id]
  );

  // Aktuelle Matterport-Sichtbarkeit live abfragen (accessVisibility = private/unlisted/public/password)
  let mpVisibility = null;
  if (tour.matterport_space_id) {
    const { model } = await mpGetModel(tour.matterport_space_id).catch(() => ({ model: null }));
    mpVisibility = model?.accessVisibility || model?.visibility || null;
  }

  const assigneeBundle = await portalTeam.getPortalTourAssigneeBundle(email, [tour]);

  res.render('portal/tour-detail', {
    ...(await portalBrandingForRequest(req, allTours)),
    tour,
    invoices: invoicesResult.rows,
    email,
    assigneeBundle,
    success: req.query.success || null,
    error: req.query.error || null,
    payrexxConfigured: payrexx.isConfigured(),
    isAdminView: !!req.session.isAdminImpersonating,
    mpVisibility,
  });
});

router.post('/tours/:id/assignee', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  const id = parseInt(req.params.id, 10);
  const fromList = req.body?.from === 'list';
  if (!Number.isFinite(id)) {
    return res.redirect(fromList ? '/portal/tours?error=ungueltig' : '/portal/tours');
  }
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [id]);
  const raw = tourResult.rows[0];
  if (!raw || !(await portalTeam.ensurePortalTourAccess(raw, email))) {
    return res.status(403).send('Nicht erlaubt.');
  }
  try {
    await portalTeam.setTourAssignee(raw, req.body?.assigneeEmail, email);
  } catch (e) {
    const msg = encodeURIComponent(e.message || 'Fehler');
    return res.redirect(
      fromList ? `/portal/tours?error=${msg}` : `/portal/tours/${id}?error=${msg}`
    );
  }
  return res.redirect(
    fromList ? '/portal/tours?success=zustaendigkeit_ok' : `/portal/tours/${id}?success=zustaendigkeit_ok`
  );
});

// ─── Tour bearbeiten ──────────────────────────────────────────────────────────

router.post('/tours/:id/edit', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  const { id } = req.params;
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [id]);
  const raw = tourResult.rows[0];
  if (!raw || !(await portalTeam.ensurePortalTourAccess(raw, email))) return res.status(403).send('Nicht erlaubt.');

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
    [objectLabel, customerContact, customerName, id, startSweep]
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
    if (!patchRes.success) {
      console.warn('PORTAL_EDIT Matterport patchModel name', id, spaceId, patchRes.error);
    }
  }

  await logAction(id, 'customer', email, 'PORTAL_EDIT', {
    objectLabel,
    matterport_name_sync:
      spaceId && mpTitle && mpTitle !== mpTitleBefore ? { ok: matterportNameOk } : null,
  });

  const q = new URLSearchParams({ success: 'edited' });
  if (!matterportNameOk) q.set('error', 'matterport_name');
  res.redirect(`/portal/tours/${id}?${q.toString()}`);
});

// ─── Tour verlängern / reaktivieren ──────────────────────────────────────────

router.post('/tours/:id/extend', requirePortalAuth, async (req, res) => {
  await ensureRenewalInvoiceSchema();
  const email = req.session.portalCustomerEmail;
  const { id } = req.params;
  const paymentMethod = req.body?.paymentMethod === 'qr_invoice' ? 'qr_invoice' : 'payrexx';

  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [id]);
  const raw = tourResult.rows[0];
  if (!raw || !(await portalTeam.ensurePortalTourAccess(raw, email))) return res.status(403).send('Nicht erlaubt.');
  const tour = normalizeTourRow(raw);
  const pricing = getPortalPricingForTour(tour);

  const existingInvoicesResult = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM tour_manager.renewal_invoices WHERE tour_id = $1`,
    [id]
  );
  const hasExistingInvoices = (existingInvoicesResult.rows[0]?.cnt || 0) > 0;

  let dueAt = null;
  if (pricing.isReactivation) {
    dueAt = new Date();
  } else if (!hasExistingInvoices) {
    const firstWindow = getSubscriptionWindowFromStart(tour.matterport_created_at || tour.created_at || new Date());
    dueAt = firstWindow.endDate || new Date();
  } else {
    const termEnd = tour.canonical_term_end_date || tour.term_end_date || tour.ablaufdatum || null;
    dueAt = termEnd ? new Date(termEnd) : new Date();
  }

  // Abo-Fenster für QR-Pfad vorausberechnen (Verlängerung ab term_end_date)
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
      [id, pricing.amountCHF, dueAt, pricing.invoiceKind, subscriptionWindow.startIso, subscriptionWindow.endIso]
    );
    const internalInvId = dbInv.rows[0]?.id;

    await pool.query(
      `UPDATE tour_manager.tours SET status = 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT', updated_at = NOW() WHERE id = $1`,
      [id]
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
    return res.redirect(`/portal/tours/${id}?success=${successKey}`);
  }

  // Payrexx-Pfad
  if (!payrexx.isConfigured()) {
    return res.redirect(`/portal/tours/${id}?error=payrexx_not_configured`);
  }

  const dbInv = await pool.query(
    `INSERT INTO tour_manager.renewal_invoices
       (tour_id, invoice_status, sent_at, amount_chf, due_at, invoice_kind, payment_source)
     VALUES ($1, 'sent', NOW(), $2, $3, $4, 'payrexx_pending')
     RETURNING id`,
    [id, pricing.amountCHF, dueAt, pricing.invoiceKind]
  );
  const internalInvId = dbInv.rows[0]?.id;

  await pool.query(
    `UPDATE tour_manager.tours SET status = 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT', updated_at = NOW() WHERE id = $1`,
    [id]
  );

  await logAction(id, 'customer', email, 'PORTAL_EXTEND', {
    internal_inv_id: internalInvId,
    amount_chf: pricing.amountCHF,
    invoice_kind: pricing.invoiceKind,
    subscription_end_at: subscriptionWindow.endIso,
    via: 'payrexx',
  });

  const successUrl = `${PORTAL_BASE_URL}/portal/tours/${id}?success=paid`;
  const cancelUrl  = `${PORTAL_BASE_URL}/portal/tours/${id}?error=cancelled`;
  const refId = `tour-${id}-internal-${internalInvId}`;

  const { paymentUrl, error: payErr } = await payrexx.createCheckout({
    referenceId: refId,
    amountCHF:   pricing.amountCHF,
    purpose:     `${tour.canonical_object_label || `Tour #${id}`} – ${pricing.isReactivation ? 'Reaktivierung' : 'Verlängerung'}`,
    successUrl,
    cancelUrl,
    email,
  });
  if (paymentUrl) {
    await pool.query(
      `UPDATE tour_manager.renewal_invoices SET payrexx_payment_url = $1 WHERE id = $2`,
      [paymentUrl, internalInvId]
    );
    return res.redirect(paymentUrl);
  }
  if (payErr) console.warn('Payrexx createCheckout:', payErr);
  res.redirect(`/portal/tours/${id}?error=payment_failed`);
});

// ─── Rechnung bezahlen (Payrexx) ─────────────────────────────────────────────

router.get('/tours/:id/pay/:invoiceId', requirePortalAuth, async (req, res) => {
  await ensureRenewalInvoiceSchema();
  const email = req.session.portalCustomerEmail;
  const { id, invoiceId } = req.params;

  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [id]);
  const raw = tourResult.rows[0];
  if (!raw || !(await portalTeam.ensurePortalTourAccess(raw, email))) return res.status(403).send('Nicht erlaubt.');
  const tour = normalizeTourRow(raw);

  const invResult = await pool.query(
    `SELECT * FROM tour_manager.renewal_invoices WHERE id = $1 AND tour_id = $2`,
    [invoiceId, id]
  );
  const invoice = invResult.rows[0];
  if (!invoice) return res.status(404).render('portal/error', { message: 'Rechnung nicht gefunden.' });
  const invoiceAmountCHF =
    Number(invoice.amount_chf || invoice.betrag || invoice.amount || 0)
    || (invoice.invoice_kind === 'portal_reactivation' ? REACTIVATION_PRICE_CHF : EXTENSION_PRICE_CHF);

  if (invoice.payrexx_payment_url) {
    return res.redirect(invoice.payrexx_payment_url);
  }

  if (!payrexx.isConfigured()) {
    return res.redirect(`/portal/tours/${id}?error=payrexx_not_configured`);
  }

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
    return res.redirect(`/portal/tours/${id}?error=payment_failed`);
  }

  await pool.query(
    `UPDATE tour_manager.renewal_invoices SET payrexx_payment_url = $1 WHERE id = $2`,
    [paymentUrl, invoice.id]
  );

  res.redirect(paymentUrl);
});

// ─── Rechnung drucken / PDF ───────────────────────────────────────────────────

function getInvoiceContext(invoice, tour) {
  let amount = Number(invoice.amount_chf || invoice.betrag || invoice.preis_brutto || 0);
  if (!amount || isNaN(amount)) {
    amount = invoice.invoice_kind === 'portal_reactivation' ? REACTIVATION_PRICE_CHF : EXTENSION_PRICE_CHF;
  }
  const amountStr = Number(amount).toFixed(2);
  const invLabel = invoice.invoice_number || `Rechnung #${invoice.id}`;
  const invoiceDate = invoice.sent_at || invoice.invoice_date || invoice.created_at
    ? new Date(invoice.sent_at || invoice.invoice_date || invoice.created_at).toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' })
    : '-';
  const statusLabels = { paid: 'Bezahlt', sent: 'Ausstehend', overdue: 'Überfällig', draft: 'Entwurf', cancelled: 'Storniert' };
  const statusLabel = statusLabels[invoice.invoice_status] || invoice.invoice_status || '-';
  const dueDate = invoice.due_at ? new Date(invoice.due_at) : null;
  const paymentDueLabel = dueDate
    ? dueDate.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '-';
  const itemSub = invoice.invoice_kind === 'portal_extension' || invoice.invoice_kind === 'portal_reactivation'
    ? 'Hosting-Verlängerung für Ihren interaktiven 3D-Rundgang (Matterport). Inkl. digitaler Archivierung und Zugriff via Link/Embed.'
    : '';
  const paymentContext = qrBill.buildInvoicePaymentContext(
    { ...invoice, amount_chf: amount },
    tour
  );
  const periodStart = invoice.subscription_start_at ? new Date(invoice.subscription_start_at) : null;
  const periodEnd = invoice.subscription_end_at ? new Date(invoice.subscription_end_at) : null;
  const periodLabel = periodStart && periodEnd
    ? `${periodStart.toLocaleDateString('de-CH')} bis ${periodEnd.toLocaleDateString('de-CH')}`
    : periodEnd
      ? `Bis ${periodEnd.toLocaleDateString('de-CH')}`
      : '-';
  const tourLink = tour.tour_url || null;
  const tourAddress = tour.object_address || null;
  return {
    invLabel,
    invoiceDate,
    statusLabel,
    paymentDueLabel: paymentDueLabel === '-' ? '-' : `30 Tage (${paymentDueLabel})`,
    customerName: [tour.customer_name, tour.customer_contact].filter(Boolean).join(' – ') || tour.customer_contact || '-',
    customerContact: tour.customer_contact || '',
    customerEmail: tour.customer_email || '',
    bezeichnung:
      invoice.invoice_kind === 'portal_extension'
        ? 'Virtueller Rundgang – Verlängerung (6 Monate)'
        : invoice.invoice_kind === 'portal_reactivation'
          ? 'Virtueller Rundgang – Reaktivierung (6 Monate)'
          : 'Virtueller Rundgang – Hosting / Verlängerung',
    itemSub,
    amount: amountStr,
    tourLabel: tour.canonical_object_label || tour.object_label || tour.bezeichnung || `Tour #${tour.id}`,
    tourLink,
    tourAddress,
    billingPeriodLabel: periodLabel,
    ...paymentContext,
  };
}

router.get('/tours/:id/invoices/:invoiceId/print', requirePortalAuth, async (req, res) => {
  await ensureRenewalInvoiceSchema();
  const email = req.session.portalCustomerEmail;
  const { id, invoiceId } = req.params;
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [id]);
  const raw = tourResult.rows[0];
  if (!raw || !(await portalTeam.ensurePortalTourAccess(raw, email))) return res.status(403).send('Nicht erlaubt.');
  const tour = normalizeTourRow(raw);
  if (tour.canonical_matterport_space_id) {
    const { model } = await mpGetModel(tour.canonical_matterport_space_id).catch(() => ({ model: null }));
    if (model?.publication?.url && !tour.tour_url) tour.tour_url = model.publication.url;
    if (model?.publication?.address) tour.object_address = model.publication.address;
  }
  const invResult = await pool.query(
    'SELECT * FROM tour_manager.renewal_invoices WHERE id = $1 AND tour_id = $2',
    [invoiceId, id]
  );
  const invoice = invResult.rows[0];
  if (!invoice) return res.status(404).render('portal/error', { message: 'Rechnung nicht gefunden.' });
  const ctx = getInvoiceContext(invoice, tour);
  res.render('portal/invoice-premium', {
    tour: { id: tour.id },
    ...ctx,
    pdfUrl: `/portal/tours/${id}/invoices/${invoiceId}/pdf`,
  });
});

router.get('/tours/:id/invoices/:invoiceId/pdf', requirePortalAuth, async (req, res) => {
  await ensureRenewalInvoiceSchema();
  const email = req.session.portalCustomerEmail;
  const { id, invoiceId } = req.params;
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [id]);
  const raw = tourResult.rows[0];
  if (!raw || !(await portalTeam.ensurePortalTourAccess(raw, email))) return res.status(403).send('Nicht erlaubt.');
  const tour = normalizeTourRow(raw);
  if (tour.canonical_matterport_space_id) {
    const { model } = await mpGetModel(tour.canonical_matterport_space_id).catch(() => ({ model: null }));
    if (model?.publication?.url && !tour.tour_url) tour.tour_url = model.publication.url;
    if (model?.publication?.address) tour.object_address = model.publication.address;
  }
  const invResult = await pool.query(
    'SELECT * FROM tour_manager.renewal_invoices WHERE id = $1 AND tour_id = $2',
    [invoiceId, id]
  );
  const invoice = invResult.rows[0];
  if (!invoice) return res.status(404).send('Rechnung nicht gefunden.');
  const ctx = getInvoiceContext(invoice, tour);

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
  y += 25;

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
    doc.fillColor('#0b6aa2').text(`Link: ${ctx.tourLink}`, 50, y, {
      link: ctx.tourLink,
      underline: true,
    });
    y += 16;
  }
  doc.fillColor('#333').text(`Periode: ${ctx.billingPeriodLabel}`, 50, y);
  y += 12;

  const tableTop = y + 5;
  doc.fontSize(10).text('Pos.', 50, tableTop);
  doc.text('Beschreibung', 120, tableTop);
  doc.text('Betrag (CHF)', 450, tableTop, { width: 80, align: 'right' });
  doc.moveTo(50, tableTop + 18).lineTo(530, tableTop + 18).stroke();
  doc.text('1', 50, tableTop + 25);
  doc.text(ctx.bezeichnung || 'Virtueller Rundgang – Hosting / Verlängerung', 120, tableTop + 25, { width: 320 });
  doc.text(ctx.amount, 450, tableTop + 25, { width: 80, align: 'right' });
  y = tableTop + 55;

  doc.fontSize(11).text(`Total: CHF ${ctx.amount}`, 50, y);
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
    console.warn('QR bill render failed:', invoiceId, err.message);
    y += 24;
    doc.fontSize(9).fillColor('#111').text(`Zahlbar an: ${ctx.creditor.name}`, 50, y);
    y += 14;
    doc.text(`IBAN: ${qrBill.formatIban(ctx.creditor.account)}`, 50, y);
    y += 14;
    doc.text(`Referenz: ${ctx.qrReferenceFormatted}`, 50, y);
  }

  doc.end();
});

// ─── Matterport Sichtbarkeit ändern ───────────────────────────────────────────

const ALLOWED_VISIBILITIES = ['PRIVATE', 'LINK_ONLY', 'PUBLIC', 'PASSWORD'];

router.post('/tours/:id/visibility', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  const { id } = req.params;
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [id]);
  const raw = tourResult.rows[0];
  if (!raw || !(await portalTeam.ensurePortalTourAccess(raw, email))) return res.status(403).send('Nicht erlaubt.');
  const tour = normalizeTourRow(raw);

  if (!tour.matterport_space_id) {
    return res.redirect(`/portal/tours/${id}?error=no_matterport`);
  }

  const visibility = String(req.body?.visibility || '').toUpperCase();
  if (!ALLOWED_VISIBILITIES.includes(visibility)) {
    return res.redirect(`/portal/tours/${id}?error=invalid_visibility`);
  }

  const password = (visibility === 'PASSWORD') ? (String(req.body?.password || '').trim() || null) : undefined;

  const result = await mpSetVisibility(tour.matterport_space_id, visibility, password);
  if (!result.success) {
    console.warn('setVisibility error:', result.error);
    return res.redirect(`/portal/tours/${id}?error=visibility_failed`);
  }

  await logAction(id, 'customer', email, 'PORTAL_VISIBILITY', { visibility, hasPassword: !!password });

  res.redirect(`/portal/tours/${id}?success=visibility_updated`);
});

// ─── Tour archivieren ─────────────────────────────────────────────────────────

router.post('/tours/:id/archive', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  const { id } = req.params;
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [id]);
  const raw = tourResult.rows[0];
  if (!raw || !(await portalTeam.ensurePortalTourAccess(raw, email))) return res.status(403).send('Nicht erlaubt.');
  const tour = normalizeTourRow(raw);
  let matterportState = tour.matterport_state || null;

  if (tour.matterport_space_id) {
    const result = await mpArchiveSpace(tour.matterport_space_id);
    if (result?.success) {
      matterportState = 'inactive';
    }
  }

  await pool.query(
    `UPDATE tour_manager.tours
     SET status = 'ARCHIVED',
         matterport_state = COALESCE($2, matterport_state),
         updated_at = NOW()
     WHERE id = $1`,
    [id, matterportState]
  );
  await logAction(id, 'customer', email, 'PORTAL_ARCHIVE', {});

  try {
    await tourActions.sendArchiveNoticeEmail(id, 'customer', email);
  } catch (err) {
    console.warn('Archive notice email failed:', id, err.message);
  }

  res.redirect(`/portal/tours?success=archived`);
});

// ─── Tour löschen ─────────────────────────────────────────────────────────────

// Kundenportal: Löschen nicht erlaubt (nur Admin)
router.post('/tours/:id/delete', requirePortalAuth, async (req, res) => {
  const email = req.session.portalCustomerEmail;
  const { id } = req.params;
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [id]);
  const raw = tourResult.rows[0];
  if (!raw || !(await portalTeam.ensurePortalTourAccess(raw, email))) return res.status(403).send('Nicht erlaubt.');
  return res.redirect(`/portal/tours/${id}?error=delete_forbidden`);
});

// ─── Payrexx Webhook ──────────────────────────────────────────────────────────

router.post('/webhook/payrexx', express.raw({ type: '*/*' }), async (req, res) => {
  await ensureRenewalInvoiceSchema();
  const rawBody = req.body?.toString('utf8') || '';
  const signature = req.headers['payrexx-signature'] || '';

  if (!payrexx.verifyWebhook(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let data;
  try {
    data = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const transaction = data?.transaction || data?.payment;
  const status = String(transaction?.status || '').toLowerCase();
  const referenceId = String(transaction?.referenceId || data?.referenceId || '');

  if (status === 'confirmed' || status === 'paid') {
    // referenceId kann sein: tour-X-inv-DBID oder tour-X-internal-DBID
    const match = referenceId.match(/tour-(\d+)-(?:inv|internal)-(.+)/);
    if (match) {
      const tourId = parseInt(match[1], 10);
      const invoiceRef = match[2];
      const invoiceResult = await pool.query(
        `SELECT id,
                invoice_number,
                invoice_kind,
                invoice_status,
                tour_id
         FROM tour_manager.renewal_invoices
         WHERE (id::text = $1 OR invoice_number = $1)
           AND tour_id = $2
         LIMIT 1`,
        [invoiceRef, tourId]
      );
      const invoice = invoiceResult.rows[0];
      const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [tourId]);
      const tour = normalizeTourRow(tourResult.rows[0] || null);
      const isReactivation = invoice?.invoice_kind === 'portal_reactivation';
      let matterportState = tour?.matterport_state || null;
      const paidAtRaw =
        transaction?.confirmedAt
        || transaction?.confirmed_at
        || transaction?.createdAt
        || transaction?.created_at
        || transaction?.date
        || data?.createdAt
        || data?.date
        || new Date().toISOString();
      // Reaktivierung: ab Zahlungsdatum. Verlängerung: ab bestehendem term_end_date (wenn in der Zukunft).
      let subscriptionWindow;
      if (isReactivation) {
        subscriptionWindow = getSubscriptionWindowFromStart(paidAtRaw);
      } else {
        const existingEnd = tour?.canonical_term_end_date || tour?.term_end_date || tour?.ablaufdatum || null;
        const base = existingEnd && new Date(existingEnd) > new Date() ? existingEnd : paidAtRaw;
        subscriptionWindow = getSubscriptionWindowFromStart(base);
      }

      if (isReactivation && tour?.matterport_space_id) {
        const mpResult = await mpUnarchiveSpace(tour.matterport_space_id);
        if (mpResult?.success) {
          matterportState = 'active';
        }
      }

      await pool.query(
        `UPDATE tour_manager.renewal_invoices
         SET invoice_status = 'paid',
             paid_at = $3::date,
             payment_source = 'payrexx',
             payment_method = 'payrexx',
             subscription_start_at = $3::date,
             subscription_end_at = $4::date
         WHERE (id::text = $1 OR invoice_number = $1)
           AND tour_id = $2`,
        [invoiceRef, tourId, subscriptionWindow.startIso, subscriptionWindow.endIso]
      );
      const newTermEndDate = subscriptionWindow.endIso;
      const tourUpdateResult = await pool.query(
        `UPDATE tour_manager.tours
         SET status = 'ACTIVE',
             term_end_date = $2,
             ablaufdatum = $2,
             matterport_state = COALESCE($3, matterport_state),
             updated_at = NOW()
         WHERE id = $1 AND status = 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT'`,
        [tourId, newTermEndDate, matterportState]
      );
      await logAction(tourId, 'system', 'payrexx', 'PAYMENT_CONFIRMED', {
        referenceId,
        transactionStatus: status,
        reactivation: isReactivation,
        subscription_start_at: subscriptionWindow.startIso,
        subscription_end_at: subscriptionWindow.endIso,
      });
      if (tourUpdateResult.rowCount > 0) {
        const templateKey = isReactivation ? 'reactivation_confirmed' : 'extension_confirmed';
        tourActions.sendPaymentConfirmedEmail(tourId, newTermEndDate, templateKey).catch((err) => {
          console.error('Payrexx webhook: sendPaymentConfirmedEmail failed', tourId, err.message);
        });
      }
    }
  }

  res.json({ ok: true });
});

// ─── Portal-Root ──────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  if (req.session?.portalCustomerEmail) return res.redirect('/portal/dashboard');
  res.redirect('/portal/login');
});

module.exports = router;
