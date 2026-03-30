const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');
const portalTeam = require('./portal-team');

let schemaReady = false;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function ensurePortalAuthSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.portal_users (
      email TEXT PRIMARY KEY,
      full_name TEXT NULL,
      password_hash TEXT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_login_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_users_email_lower
    ON tour_manager.portal_users ((LOWER(email)))
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.portal_password_reset_tokens (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_portal_password_reset_email
    ON tour_manager.portal_password_reset_tokens ((LOWER(email)), used_at, expires_at)
  `);
  schemaReady = true;
}

async function lookupPortalIdentity(email) {
  const norm = normalizeEmail(email);
  if (!norm) return null;
  await portalTeam.ensurePortalTeamSchema().catch(() => null);

  if (await portalTeam.isGlobalTourManager(norm)) {
    return { email: norm, fullName: null };
  }

  const directTour = await pool.query(
    `SELECT LOWER(TRIM(customer_email)) AS email,
            NULLIF(TRIM(customer_name), '') AS full_name
     FROM tour_manager.tours
     WHERE LOWER(TRIM(customer_email)) = $1
     ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
     LIMIT 1`,
    [norm]
  );
  if (directTour.rows[0]?.email) {
    return {
      email: directTour.rows[0].email,
      fullName: directTour.rows[0].full_name || null,
    };
  }

  const teamMember = await pool.query(
    `SELECT LOWER(TRIM(member_email)) AS email,
            NULLIF(TRIM(display_name), '') AS full_name
     FROM tour_manager.portal_team_members
     WHERE LOWER(TRIM(member_email)) = $1
     ORDER BY accepted_at DESC NULLS LAST, created_at DESC NULLS LAST
     LIMIT 1`,
    [norm]
  );
  if (teamMember.rows[0]?.email) {
    return {
      email: teamMember.rows[0].email,
      fullName: teamMember.rows[0].full_name || null,
    };
  }

  const teamOwner = await pool.query(
    `SELECT LOWER(TRIM(owner_email)) AS email
     FROM tour_manager.portal_team_members
     WHERE LOWER(TRIM(owner_email)) = $1
     LIMIT 1`,
    [norm]
  );
  if (teamOwner.rows[0]?.email) {
    return {
      email: teamOwner.rows[0].email,
      fullName: null,
    };
  }

  return null;
}

async function ensurePortalUser(email) {
  await ensurePortalAuthSchema();
  const identity = await lookupPortalIdentity(email);
  if (!identity?.email) return null;

  const norm = normalizeEmail(identity.email);
  const existing = await pool
    .query(
      `SELECT email, full_name, password_hash, is_active
       FROM tour_manager.portal_users
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [norm]
    )
    .then((r) => r.rows[0] || null);

  if (!existing) {
    const inserted = await pool
      .query(
        `INSERT INTO tour_manager.portal_users (email, full_name, is_active, created_at, updated_at)
         VALUES ($1, $2, TRUE, NOW(), NOW())
         RETURNING email, full_name, password_hash, is_active`,
        [norm, identity.fullName]
      )
      .then((r) => r.rows[0] || null);
    return inserted;
  }

  if (!existing.full_name && identity.fullName) {
    const updated = await pool
      .query(
        `UPDATE tour_manager.portal_users
         SET full_name = $2, updated_at = NOW()
         WHERE LOWER(email) = $1
         RETURNING email, full_name, password_hash, is_active`,
        [norm, identity.fullName]
      )
      .then((r) => r.rows[0] || existing);
    return updated;
  }

  return existing;
}

async function getPortalUser(email) {
  await ensurePortalAuthSchema();
  const norm = normalizeEmail(email);
  if (!norm) return null;
  return pool
    .query(
      `SELECT email, full_name, password_hash, is_active, last_login_at
       FROM tour_manager.portal_users
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [norm]
    )
    .then((r) => r.rows[0] || null);
}

async function verifyDbPortalPassword(email, password) {
  const ensured = await ensurePortalUser(email);
  if (!ensured || !ensured.is_active || !ensured.password_hash) return null;
  const ok = await bcrypt.compare(String(password || ''), ensured.password_hash).catch(() => false);
  return ok ? normalizeEmail(ensured.email) : null;
}

async function touchPortalLastLogin(email) {
  await ensurePortalAuthSchema();
  const norm = normalizeEmail(email);
  if (!norm) return;
  await pool.query(
    `UPDATE tour_manager.portal_users
     SET last_login_at = NOW(), updated_at = NOW()
     WHERE LOWER(email) = $1`,
    [norm]
  );
}

async function issuePasswordReset(email) {
  await ensurePortalAuthSchema();
  const ensured = await ensurePortalUser(email);
  if (!ensured?.email) return { ok: false, reason: 'not_found' };

  const token = randomToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO tour_manager.portal_password_reset_tokens (email, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [normalizeEmail(ensured.email), tokenHash, expiresAt]
  );

  return {
    ok: true,
    token,
    email: normalizeEmail(ensured.email),
    expiresAt,
  };
}

async function getResetTokenRow(token) {
  await ensurePortalAuthSchema();
  const tokenHash = hashResetToken(token);
  return pool
    .query(
      `SELECT id, email, expires_at, used_at
       FROM tour_manager.portal_password_reset_tokens
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash]
    )
    .then((r) => r.rows[0] || null);
}

async function consumePasswordReset(token, newPassword) {
  await ensurePortalAuthSchema();
  const row = await getResetTokenRow(token);
  if (!row || row.used_at || !row.expires_at || new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error('Link ungültig oder abgelaufen.');
  }
  const password = String(newPassword || '');
  if (password.length < 8) throw new Error('Passwort muss mindestens 8 Zeichen haben.');

  const passwordHash = await bcrypt.hash(password, 10);
  const email = normalizeEmail(row.email);

  await ensurePortalUser(email);
  await pool.query(
    `UPDATE tour_manager.portal_users
     SET password_hash = $2, is_active = TRUE, updated_at = NOW()
     WHERE LOWER(email) = $1`,
    [email, passwordHash]
  );
  await pool.query(
    `UPDATE tour_manager.portal_password_reset_tokens
     SET used_at = NOW()
     WHERE id = $1 OR LOWER(email) = $2`,
    [row.id, email]
  );
  return { email };
}

async function changePortalPassword(email, currentPassword, newPassword) {
  await ensurePortalAuthSchema();
  const norm = normalizeEmail(email);
  const user = await getPortalUser(norm);
  if (!user?.password_hash) throw new Error('Für dieses Konto ist noch kein Passwort gesetzt.');
  const ok = await bcrypt.compare(String(currentPassword || ''), user.password_hash).catch(() => false);
  if (!ok) throw new Error('Aktuelles Passwort ist falsch.');
  if (String(newPassword || '').length < 8) throw new Error('Passwort muss mindestens 8 Zeichen haben.');
  const passwordHash = await bcrypt.hash(String(newPassword || ''), 10);
  await pool.query(
    `UPDATE tour_manager.portal_users
     SET password_hash = $2, updated_at = NOW()
     WHERE LOWER(email) = $1`,
    [norm, passwordHash]
  );
}

module.exports = {
  normalizeEmail,
  ensurePortalAuthSchema,
  ensurePortalUser,
  getPortalUser,
  verifyDbPortalPassword,
  touchPortalLastLogin,
  issuePasswordReset,
  getResetTokenRow,
  consumePasswordReset,
  changePortalPassword,
};
