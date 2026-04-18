const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

let schemaReady = false;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function getEnvAdminCredentials() {
  const fallbackEmail = normalizeEmail(process.env.ADMIN_EMAIL || 'admin@propus.ch');
  const fallbackPassword = String(process.env.ADMIN_PASSWORD || 'admin');
  const users = process.env.ADMIN_USERS;
  if (!users || typeof users !== 'string') {
    return [{ email: fallbackEmail, password: fallbackPassword }];
  }
  return users
    .split(',')
    .map((entry) => String(entry || '').trim())
    .map((entry) => {
      const [email, password] = entry.split(':').map((part) => String(part || '').trim());
      if (!email || !password) return null;
      return { email: normalizeEmail(email), password };
    })
    .filter(Boolean);
}

async function ensureAdminTeamSchema() {
  if (schemaReady) return;
  // tour_manager.admin_users ist seit core/migrations/040 ein VIEW über
  // core.admin_users. Die physische Tabelle + Indizes werden dort verwaltet.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.admin_invites (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      invited_by TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      accepted_at TIMESTAMPTZ NULL,
      revoked_at TIMESTAMPTZ NULL
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_admin_invites_email
    ON tour_manager.admin_invites ((LOWER(email)))
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_admin_invites_active
    ON tour_manager.admin_invites (expires_at, accepted_at, revoked_at)
  `);
  schemaReady = true;
}

async function verifyDbAdminPassword(email, password) {
  await ensureAdminTeamSchema();
  const emailNorm = normalizeEmail(email);
  const row = await pool.query(
    `SELECT email, password_hash, is_active
     FROM tour_manager.admin_users
     WHERE LOWER(email) = $1
     LIMIT 1`,
    [emailNorm]
  ).then((r) => r.rows[0] || null);
  if (!row || !row.is_active || !row.password_hash) return null;
  const ok = await bcrypt.compare(String(password || ''), row.password_hash).catch(() => false);
  return ok ? normalizeEmail(row.email) : null;
}

async function touchAdminLastLogin(email) {
  await ensureAdminTeamSchema();
  const emailNorm = normalizeEmail(email);
  await pool.query(
    `UPDATE tour_manager.admin_users
     SET last_login_at = NOW(), updated_at = NOW()
     WHERE LOWER(email) = $1`,
    [emailNorm]
  ).catch(() => null);
}

async function listPendingAdminInvites() {
  await ensureAdminTeamSchema();
  const result = await pool.query(
    `SELECT id, email, invited_by, created_at, expires_at
     FROM tour_manager.admin_invites
     WHERE accepted_at IS NULL
       AND revoked_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC`
  );
  return result.rows.map((row) => ({
    id: row.id,
    email: normalizeEmail(row.email),
    invitedBy: row.invited_by || null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}

async function listAdminAccessUsers() {
  await ensureAdminTeamSchema();
  const envUsers = getEnvAdminCredentials();
  const envMap = new Map(envUsers.map((entry) => [normalizeEmail(entry.email), entry]));
  const dbRows = await pool.query(
    `SELECT id, email, full_name, is_active, created_at, updated_at, invited_by, last_login_at
     FROM tour_manager.admin_users
     ORDER BY created_at ASC`
  );

  const users = [];
  const seen = new Set();

  for (const row of dbRows.rows) {
    const email = normalizeEmail(row.email);
    users.push({
      id: row.id,
      email,
      name: row.full_name || null,
      source: envMap.has(email) ? 'env+db' : 'db',
      isActive: !!row.is_active,
      invitedBy: row.invited_by || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at || null,
    });
    seen.add(email);
  }

  for (const envUser of envUsers) {
    const email = normalizeEmail(envUser.email);
    if (seen.has(email)) continue;
    users.push({
      id: null,
      email,
      name: null,
      source: 'env',
      isActive: true,
      invitedBy: null,
      createdAt: null,
      updatedAt: null,
      lastLoginAt: null,
    });
  }

  users.sort((a, b) => String(a.email).localeCompare(String(b.email), 'de', { sensitivity: 'base' }));
  return users;
}

async function createAdminInvite(email, invitedBy, expiresDays = 7) {
  await ensureAdminTeamSchema();
  const emailNorm = normalizeEmail(email);
  const byNorm = normalizeEmail(invitedBy || '');
  if (!emailNorm || !emailNorm.includes('@')) {
    throw new Error('Ungültige E-Mail-Adresse');
  }
  await pool.query(
    `UPDATE tour_manager.admin_invites
     SET revoked_at = NOW()
     WHERE LOWER(email) = $1
       AND accepted_at IS NULL
       AND revoked_at IS NULL
       AND expires_at > NOW()`,
    [emailNorm]
  );
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const days = Math.max(1, parseInt(String(expiresDays || 7), 10) || 7);
  const insert = await pool.query(
    `INSERT INTO tour_manager.admin_invites (email, token_hash, invited_by, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4::text || ' days')::interval)
     RETURNING id, created_at, expires_at`,
    [emailNorm, tokenHash, byNorm || null, String(days)]
  );
  return {
    id: insert.rows[0]?.id || null,
    token,
    email: emailNorm,
    invitedBy: byNorm || null,
    createdAt: insert.rows[0]?.created_at || null,
    expiresAt: insert.rows[0]?.expires_at || null,
  };
}

async function getInviteByToken(token) {
  await ensureAdminTeamSchema();
  const tokenHash = hashToken(token);
  const row = await pool.query(
    `SELECT id, email, invited_by, created_at, expires_at, accepted_at, revoked_at
     FROM tour_manager.admin_invites
     WHERE token_hash = $1
     LIMIT 1`,
    [tokenHash]
  ).then((r) => r.rows[0] || null);
  if (!row) return { invite: null, error: 'Einladung nicht gefunden' };
  if (row.revoked_at) return { invite: null, error: 'Diese Einladung wurde widerrufen' };
  if (row.accepted_at) return { invite: null, error: 'Diese Einladung wurde bereits angenommen' };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { invite: null, error: 'Diese Einladung ist abgelaufen' };
  return {
    invite: {
      id: row.id,
      email: normalizeEmail(row.email),
      invitedBy: row.invited_by || null,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    },
    error: null,
  };
}

async function acceptInvite(token, password) {
  await ensureAdminTeamSchema();
  const checked = await getInviteByToken(token);
  if (!checked.invite) {
    return { ok: false, error: checked.error || 'Ungültige Einladung' };
  }
  const pw = String(password || '');
  if (pw.length < 8) {
    return { ok: false, error: 'Passwort muss mindestens 8 Zeichen haben' };
  }
  const passwordHash = await bcrypt.hash(pw, 10);
  const email = checked.invite.email;
  await pool.query(
    `INSERT INTO tour_manager.admin_users (email, full_name, password_hash, is_active, invited_by, created_at, updated_at)
     VALUES ($1, NULL, $2, TRUE, $3, NOW(), NOW())
     ON CONFLICT ((LOWER(email))) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         is_active = TRUE,
         updated_at = NOW(),
         invited_by = COALESCE(tour_manager.admin_users.invited_by, EXCLUDED.invited_by)`,
    [email, passwordHash, checked.invite.invitedBy || null]
  );
  await pool.query(
    `UPDATE tour_manager.admin_invites
     SET accepted_at = NOW()
     WHERE id = $1`,
    [checked.invite.id]
  );
  return { ok: true, email };
}

function getSystemManagedEmailSet() {
  const envUsers = getEnvAdminCredentials();
  return new Set(envUsers.map((entry) => normalizeEmail(entry.email)));
}

async function setAdminUserActive(email, isActive) {
  await ensureAdminTeamSchema();
  const emailNorm = normalizeEmail(email);
  const result = await pool.query(
    `UPDATE tour_manager.admin_users
     SET is_active = $2, updated_at = NOW()
     WHERE LOWER(email) = $1`,
    [emailNorm, !!isActive]
  );
  return result.rowCount > 0;
}

async function updateAdminUserById(id, { email, name, password }) {
  await ensureAdminTeamSchema();
  const userId = parseInt(String(id), 10);
  if (!Number.isFinite(userId)) return { ok: false, code: 'invalid_user' };

  const existing = await pool.query(
    `SELECT id, email
     FROM tour_manager.admin_users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  ).then((r) => r.rows[0] || null);
  if (!existing) return { ok: false, code: 'user_not_found' };

  const systemManagedEmails = getSystemManagedEmailSet();
  const existingEmailNorm = normalizeEmail(existing.email);
  if (systemManagedEmails.has(existingEmailNorm)) {
    return { ok: false, code: 'system_managed_user' };
  }

  const emailNorm = normalizeEmail(email);
  if (!emailNorm || !emailNorm.includes('@')) {
    return { ok: false, code: 'invalid_email' };
  }
  if (systemManagedEmails.has(emailNorm)) {
    return { ok: false, code: 'system_managed_email' };
  }

  const fullName = String(name || '').trim() || null;
  const newPassword = typeof password === 'string' ? String(password) : '';
  if (newPassword && newPassword.length < 8) {
    return { ok: false, code: 'invalid_password' };
  }
  const passwordHash = newPassword ? await bcrypt.hash(newPassword, 10) : null;

  try {
    await pool.query(
      `UPDATE tour_manager.admin_users
       SET email = $2,
           full_name = $3,
           password_hash = COALESCE($4, password_hash),
           updated_at = NOW()
       WHERE id = $1`,
      [userId, emailNorm, fullName, passwordHash]
    );
    return { ok: true, email: emailNorm, previousEmail: existingEmailNorm };
  } catch (err) {
    if (err?.code === '23505') {
      return { ok: false, code: 'email_exists' };
    }
    return { ok: false, code: 'update_failed' };
  }
}

async function deleteAdminUserById(id) {
  await ensureAdminTeamSchema();
  const userId = parseInt(String(id), 10);
  if (!Number.isFinite(userId)) return { ok: false, code: 'invalid_user' };

  const existing = await pool.query(
    `SELECT id, email
     FROM tour_manager.admin_users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  ).then((r) => r.rows[0] || null);
  if (!existing) return { ok: false, code: 'user_not_found' };

  const systemManagedEmails = getSystemManagedEmailSet();
  if (systemManagedEmails.has(normalizeEmail(existing.email))) {
    return { ok: false, code: 'system_managed_user' };
  }

  const result = await pool.query(
    `DELETE FROM tour_manager.admin_users
     WHERE id = $1`,
    [userId]
  );
  if (result.rowCount < 1) return { ok: false, code: 'user_not_found' };
  return { ok: true, email: normalizeEmail(existing.email) };
}

/** Wer darf E-Mail/Passwort in der App ändern (nur DB-Benutzer, nicht reine .env-Zugänge) */
async function getAdminAuthCapabilities(email) {
  await ensureAdminTeamSchema();
  const key = normalizeEmail(email);
  if (!key) {
    return {
      canChangePassword: false,
      canChangeEmail: false,
      isEnvCredentials: false,
      isDatabaseUser: false,
    };
  }
  const row = await pool
    .query(
      `SELECT id, password_hash FROM tour_manager.admin_users WHERE LOWER(email) = $1 LIMIT 1`,
      [key]
    )
    .then((r) => r.rows[0] || null);
  const hasEnvEntry = getEnvAdminCredentials().some((c) => normalizeEmail(c.email) === key);
  return {
    canChangePassword: !!(row && row.password_hash),
    canChangeEmail: !!row,
    isEnvCredentials: hasEnvEntry,
    isDatabaseUser: !!row,
  };
}

async function changeOwnAdminPassword(email, currentPassword, newPassword) {
  await ensureAdminTeamSchema();
  const key = normalizeEmail(email);
  if (!key) return { ok: false, code: 'no_email', message: 'Nicht angemeldet.' };
  const okLogin = await verifyDbAdminPassword(key, currentPassword);
  if (!okLogin) return { ok: false, code: 'bad_password', message: 'Aktuelles Passwort ist falsch.' };
  const np = String(newPassword || '');
  if (np.length < 8) {
    return { ok: false, code: 'weak', message: 'Neues Passwort: mindestens 8 Zeichen.' };
  }
  const hash = await bcrypt.hash(np, 10);
  const result = await pool.query(
    `UPDATE tour_manager.admin_users
     SET password_hash = $2, updated_at = NOW()
     WHERE LOWER(email) = $1 AND password_hash IS NOT NULL`,
    [key, hash]
  );
  if (result.rowCount < 1) {
    return {
      ok: false,
      code: 'no_db_password',
      message: 'Für dieses Konto gibt es kein änderbares Passwort in der Datenbank (z. B. nur .env-Zugang).',
    };
  }
  return { ok: true };
}

async function changeOwnAdminEmail(email, newEmail, currentPassword) {
  await ensureAdminTeamSchema();
  const key = normalizeEmail(email);
  const newKey = normalizeEmail(newEmail);
  if (!key) return { ok: false, code: 'no_email', message: 'Nicht angemeldet.' };
  if (!newKey || !newKey.includes('@')) {
    return { ok: false, code: 'invalid_email', message: 'Ungültige E-Mail-Adresse.' };
  }
  if (newKey === key) return { ok: false, code: 'same', message: 'Die Adresse ist unverändert.' };
  const okLogin = await verifyDbAdminPassword(key, currentPassword);
  if (!okLogin) return { ok: false, code: 'bad_password', message: 'Aktuelles Passwort ist falsch.' };
  const systemManaged = getSystemManagedEmailSet();
  if (systemManaged.has(newKey)) {
    return { ok: false, code: 'reserved', message: 'Diese E-Mail ist reserviert.' };
  }
  const taken = await pool
    .query(`SELECT 1 FROM tour_manager.admin_users WHERE LOWER(email) = $1 LIMIT 1`, [newKey])
    .then((r) => !!r.rows[0]);
  if (taken) return { ok: false, code: 'taken', message: 'Diese E-Mail wird bereits verwendet.' };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query(
      `UPDATE tour_manager.admin_users SET email = $2, updated_at = NOW() WHERE LOWER(email) = $1`,
      [key, newKey]
    );
    if (u.rowCount < 1) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'not_found', message: 'Benutzer nicht in der Datenbank.' };
    }
    await client.query(
      `UPDATE tour_manager.user_profile_settings SET user_key = $2 WHERE realm = 'admin' AND user_key = $1`,
      [key, newKey]
    );
    await client
      .query(
        `UPDATE tour_manager.admin_remember_tokens SET email = $2 WHERE LOWER(email) = $1`,
        [key, newKey]
      )
      .catch(() => null);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err?.code === '23505') {
      return { ok: false, code: 'taken', message: 'Diese E-Mail wird bereits verwendet.' };
    }
    return { ok: false, code: 'failed', message: err.message || 'E-Mail konnte nicht geändert werden.' };
  } finally {
    client.release();
  }
  return { ok: true, email: newKey };
}

/** True if this address is a configured admin (DB and/or .env), for scoped profile-photo access. */
async function isKnownAdminAccessEmail(email) {
  const key = normalizeEmail(email);
  if (!key) return false;
  await ensureAdminTeamSchema();
  for (const u of getEnvAdminCredentials()) {
    if (normalizeEmail(u.email) === key) return true;
  }
  const row = await pool.query(
    `SELECT 1 FROM tour_manager.admin_users WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
    [key]
  );
  return !!row.rows[0];
}

async function revokeInviteById(id) {
  await ensureAdminTeamSchema();
  const inviteId = parseInt(String(id), 10);
  if (!Number.isFinite(inviteId)) return false;
  const result = await pool.query(
    `UPDATE tour_manager.admin_invites
     SET revoked_at = NOW()
     WHERE id = $1
       AND accepted_at IS NULL
       AND revoked_at IS NULL`,
    [inviteId]
  );
  return result.rowCount > 0;
}

module.exports = {
  acceptInvite,
  changeOwnAdminEmail,
  changeOwnAdminPassword,
  createAdminInvite,
  deleteAdminUserById,
  ensureAdminTeamSchema,
  getAdminAuthCapabilities,
  getEnvAdminCredentials,
  getInviteByToken,
  isKnownAdminAccessEmail,
  listAdminAccessUsers,
  listPendingAdminInvites,
  revokeInviteById,
  setAdminUserActive,
  touchAdminLastLogin,
  updateAdminUserById,
  verifyDbAdminPassword,
};
