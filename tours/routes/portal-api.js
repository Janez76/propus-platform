/**
 * JSON-API für das React-Kunden-Portal (SPA).
 * Alle Endpunkte erfordern eine gültige Portal-Session (portalCustomerEmail).
 * Gemounted unter /portal/api (in server.js).
 */

const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const { pool } = require('../lib/db');
const portalTeam = require('../lib/portal-team');
const { normalizeTourRow } = require('../lib/normalize');

// ─── Auth-Guard ──────────────────────────────────────────────────────────────

/**
 * requirePortalSession
 *
 * Prüft (in dieser Reihenfolge):
 *  1. Portal-Session-Cookie (propus_tours.sid) → req.session.portalCustomerEmail gesetzt
 *  2. Bearer-Token / admin_session-Cookie aus dem Unified-Login-System:
 *     Schlägt token_hash in admin_sessions nach (booking-Schema);
 *     bei Kunden-Rolle wird req.session.portalCustomerEmail gesetzt und gespeichert.
 */
function requirePortalSession(req, res, next) {
  if (req.session?.portalCustomerEmail) return next();

  // Bridge: Admin-Session-Token für Portal-Kunden (nach Unified-Login)
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

// ─── Helper ──────────────────────────────────────────────────────────────────

async function getPortalScope(email) {
  const { ownerEmails, orgKundeRefs } = await portalTeam.getPortalTourAccessScope(email);
  return { ownerEmails, orgKundeRefs };
}

async function loadTours(email) {
  const { ownerEmails, orgKundeRefs } = await getPortalScope(email);
  if (ownerEmails.length === 0) return [];

  let toursResult;
  try {
    toursResult =
      orgKundeRefs.length > 0
        ? await pool.query(
            `SELECT * FROM tour_manager.tours t
             WHERE LOWER(TRIM(t.customer_email)) = ANY($1::text[])
                OR TRIM(CAST(t.kunde_ref AS TEXT)) = ANY($2::text[])
                OR EXISTS (
                  SELECT 1 FROM core.customers c
                  WHERE c.email_aliases && $1::text[]
                    AND core.customer_email_matches(t.customer_email, c.email, c.email_aliases)
                )
             ORDER BY created_at DESC`,
            [ownerEmails, orgKundeRefs]
          )
        : await pool.query(
            `SELECT * FROM tour_manager.tours t
             WHERE LOWER(TRIM(t.customer_email)) = ANY($1::text[])
                OR EXISTS (
                  SELECT 1 FROM core.customers c
                  WHERE c.email_aliases && $1::text[]
                    AND core.customer_email_matches(t.customer_email, c.email, c.email_aliases)
                )
             ORDER BY created_at DESC`,
            [ownerEmails]
          );
  } catch (aliasErr) {
    // Fallback: falls email_aliases-Spalte oder customer_email_matches()-Funktion
    // noch nicht migriert wurden, einfaches E-Mail-Matching verwenden
    console.warn('[portal-api] loadTours alias-query failed, using fallback:', aliasErr.message);
    toursResult =
      orgKundeRefs.length > 0
        ? await pool.query(
            `SELECT * FROM tour_manager.tours t
             WHERE LOWER(TRIM(t.customer_email)) = ANY($1::text[])
                OR TRIM(CAST(t.kunde_ref AS TEXT)) = ANY($2::text[])
             ORDER BY created_at DESC`,
            [ownerEmails, orgKundeRefs]
          )
        : await pool.query(
            `SELECT * FROM tour_manager.tours t
             WHERE LOWER(TRIM(t.customer_email)) = ANY($1::text[])
             ORDER BY created_at DESC`,
            [ownerEmails]
          );
  }

  let tours = toursResult.rows.map(normalizeTourRow);
  tours = await portalTeam.filterToursForMitarbeiterAssignee(email, tours);
  return tours;
}

// ─── GET /portal/api/me ───────────────────────────────────────────────────────

router.get('/me', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const name = req.session.portalCustomerName || email;
    const isGlobal = await portalTeam.isGlobalTourManager(email);
    // Prüfe ob Nutzer in seinem eigenen Workspace Inhaber/Admin ist
    const { ownerEmails } = await getPortalScope(email);
    let isAdmin = false;
    if (!isGlobal && ownerEmails.length > 0) {
      // Prüfe ob der Nutzer selbst Inhaber des ersten Workspace ist
      if (ownerEmails[0] === email.toLowerCase()) {
        isAdmin = true;
      } else {
        const teamMembers = await portalTeam.listTeamMembers(ownerEmails[0]).catch(() => []);
        isAdmin = teamMembers.some(
          (m) => m.member_email?.toLowerCase() === email.toLowerCase() &&
            (m.role === 'inhaber' || m.role === 'admin')
        );
      }
    }

    return res.json({
      ok: true,
      email,
      name,
      role: isGlobal ? 'tour_manager' : (isAdmin ? 'customer_admin' : 'customer_user'),
      permissions: isGlobal
        ? ['tours.read', 'tours.manage', 'tours.assign', 'tours.cross_company', 'tours.archive', 'tours.link_matterport', 'portal_team.manage']
        : (isAdmin
          ? ['tours.read', 'tours.manage', 'portal_team.manage']
          : ['tours.read']),
    });
  } catch (err) {
    console.error('[portal-api] /me error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

// ─── GET /portal/api/tours ────────────────────────────────────────────────────

router.get('/tours', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const tours = await loadTours(email);
    return res.json({ ok: true, tours });
  } catch (err) {
    console.error('[portal-api] /tours error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

// ─── GET /portal/api/tours/:id ────────────────────────────────────────────────

router.get('/tours/:id', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const tours = await loadTours(email);
    const tour = tours.find((t) => String(t.id) === String(req.params.id));
    if (!tour) return res.status(404).json({ error: 'Tour nicht gefunden oder kein Zugriff' });

    const logs = await pool.query(
      'SELECT * FROM tour_manager.actions_log WHERE tour_id = $1 ORDER BY created_at DESC LIMIT 20',
      [tour.id]
    );
    return res.json({ ok: true, tour, actions_log: logs.rows });
  } catch (err) {
    console.error('[portal-api] /tours/:id error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

// ─── GET /portal/api/invoices ─────────────────────────────────────────────────

router.get('/invoices', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const tours = await loadTours(email);
    if (tours.length === 0) return res.json({ ok: true, invoices: [] });

    const tourIds = tours.map((t) => t.id);
    const result = await pool.query(
      `SELECT ri.*,
              ri.invoice_status,
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
    return res.json({ ok: true, invoices: result.rows });
  } catch (err) {
    console.error('[portal-api] /invoices error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

// ─── GET /portal/api/team/suggestions ────────────────────────────────────────
// Liefert Firmenkontakte als Vorschlagsliste für das Einladungsformular.

router.get('/team/suggestions', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const { ownerEmails } = await getPortalScope(email);
    if (ownerEmails.length === 0) return res.json({ ok: true, suggestions: [] });

    const ownerEmail = ownerEmails[0];
    const peers = await portalTeam.listExxasOrgPeersForOwner(ownerEmail);

    // bereits eingeladene / aktive Mitglieder herausfiltern
    const existing = await portalTeam.listTeamMembers(ownerEmail).catch(() => []);
    const existingEmails = new Set(existing.map((m) => (m.member_email || '').toLowerCase()));
    existingEmails.add(email.toLowerCase());

    const suggestions = peers
      .filter((p) => !existingEmails.has((p.email || '').toLowerCase()))
      .map((p) => ({ email: p.email, name: p.name || '' }));

    return res.json({ ok: true, suggestions });
  } catch (err) {
    console.error('[portal-api] /team/suggestions error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

// ─── GET /portal/api/team ─────────────────────────────────────────────────────

router.get('/team', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const { ownerEmails } = await getPortalScope(email);
    if (ownerEmails.length === 0) return res.json({ ok: true, team: [] });

    const ownerEmail = ownerEmails[0];
    const { canManage, rows } = await portalTeam.getPortalTeamManageContext(email, ownerEmail);
    return res.json({ ok: true, team: rows, canManage });
  } catch (err) {
    console.error('[portal-api] /team error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

// ─── POST /portal/api/team/invite ─────────────────────────────────────────────

router.post('/team/invite', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const { inviteEmail, role } = req.body;
    if (!inviteEmail) return res.status(400).json({ error: 'E-Mail fehlt' });

    const { ownerEmails } = await getPortalScope(email);
    if (ownerEmails.length === 0) return res.status(403).json({ error: 'Kein Zugriff' });

    const ownerEmail = ownerEmails[0];
    const { canManage } = await portalTeam.getPortalTeamManageContext(email, ownerEmail);
    if (!canManage) return res.status(403).json({ error: 'Keine Berechtigung' });

    await portalTeam.createTeamInvite({
      ownerEmail,
      inviteEmail: inviteEmail.trim().toLowerCase(),
      role: role || portalTeam.ROLE_MITARBEITER,
      invitedBy: email,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[portal-api] /team/invite error:', err);
    return res.status(500).json({ error: err.message || 'Interner Fehler' });
  }
});

// ─── DELETE /portal/api/team/:memberId ────────────────────────────────────────

router.delete('/team/:memberId', async (req, res) => {
  try {
    const email = req.session.portalCustomerEmail;
    const { ownerEmails } = await getPortalScope(email);
    if (ownerEmails.length === 0) return res.status(403).json({ error: 'Kein Zugriff' });

    const ownerEmail = ownerEmails[0];
    const { canManage } = await portalTeam.getPortalTeamManageContext(email, ownerEmail);
    if (!canManage) return res.status(403).json({ error: 'Keine Berechtigung' });

    await pool.query(
      `DELETE FROM tour_manager.portal_team WHERE id = $1 AND owner_email = $2`,
      [req.params.memberId, ownerEmail]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[portal-api] /team/:memberId DELETE error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

module.exports = router;
