/**
 * Profil-Einstellungen (Anzeigename, optional Organisation, Profilfoto) für Admin + Portal.
 * Speicherung in PostgreSQL (BYTEA für Bild).
 */
const { pool } = require('./db');
const adminTeam = require('./admin-team');

let schemaReady = false;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function ensureSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.user_profile_settings (
      realm TEXT NOT NULL,
      user_key TEXT NOT NULL,
      display_name TEXT NULL,
      organization_display TEXT NULL,
      profile_photo_mime TEXT NULL,
      profile_photo_data BYTEA NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (realm, user_key),
      CONSTRAINT user_profile_settings_realm_chk
        CHECK (realm IN ('admin', 'portal'))
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_profile_settings_lookup
    ON tour_manager.user_profile_settings (realm, user_key)
  `);
  await pool.query(`
    ALTER TABLE tour_manager.user_profile_settings
    ADD COLUMN IF NOT EXISTS contact_line TEXT NULL
  `);
  schemaReady = true;
}

function deriveNameFromEmail(email) {
  const rawEmail = normalizeEmail(email);
  const emailLocal = rawEmail.includes('@') ? rawEmail.split('@')[0] : rawEmail;
  if (!emailLocal) return 'Admin';
  return emailLocal
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

/** Sidebar: Anzeigename + Foto-Flag + Version (Cache-Bust) */
async function getAdminSidebarBundle(email) {
  await ensureSchema();
  const key = normalizeEmail(email);
  if (!key) {
    return { displayName: 'Admin', hasPhoto: false, photoVersion: 0 };
  }
  const row = await pool
    .query(
      `SELECT display_name, profile_photo_mime, profile_photo_data, updated_at
       FROM tour_manager.user_profile_settings
       WHERE realm = 'admin' AND user_key = $1`,
      [key]
    )
    .then((r) => r.rows[0] || null);

  let displayName = row?.display_name?.trim() || '';
  if (!displayName) {
    await adminTeam.ensureAdminTeamSchema();
    const dbUser = await pool
      .query(`SELECT full_name FROM tour_manager.admin_users WHERE LOWER(email) = $1 LIMIT 1`, [key])
      .then((r) => r.rows[0] || null);
    displayName = String(dbUser?.full_name || '').trim();
  }
  if (!displayName) displayName = deriveNameFromEmail(key);

  const hasPhoto = !!(row?.profile_photo_data && row?.profile_photo_mime);
  const photoVersion = row?.updated_at ? new Date(row.updated_at).getTime() : 0;
  return { displayName, hasPhoto, photoVersion };
}

async function getAdminProfileForEditor(email) {
  await ensureSchema();
  const key = normalizeEmail(email);
  const bundle = await getAdminSidebarBundle(email);
  const row = key
    ? await pool
        .query(`SELECT contact_line FROM tour_manager.user_profile_settings WHERE realm = 'admin' AND user_key = $1`, [key])
        .then((r) => r.rows[0] || null)
    : null;
  const auth = await adminTeam.getAdminAuthCapabilities(email);
  return {
    displayName: bundle.displayName,
    organizationLabel: 'Propus GmbH',
    hasPhoto: bundle.hasPhoto,
    email: key,
    contactLine: String(row?.contact_line || '').trim(),
    canChangePassword: auth.canChangePassword,
    canChangeEmail: auth.canChangeEmail,
    isEnvCredentials: auth.isEnvCredentials,
    isDatabaseUser: auth.isDatabaseUser,
  };
}

async function upsertAdminProfileSimple(email, { displayName, contactLine, photoBuffer, photoMime, removePhoto }) {
  await ensureSchema();
  const key = normalizeEmail(email);
  if (!key) throw new Error('Keine E-Mail');

  const existing = await pool
    .query(
      `SELECT display_name, contact_line, profile_photo_mime, profile_photo_data
       FROM tour_manager.user_profile_settings
       WHERE realm = 'admin' AND user_key = $1`,
      [key]
    )
    .then((r) => r.rows[0] || null);

  let name = existing?.display_name ?? null;
  if (displayName !== undefined) {
    const t = String(displayName || '').trim();
    name = t || null;
  }

  let contact = existing?.contact_line ?? null;
  if (contactLine !== undefined) {
    const c = String(contactLine || '').trim().slice(0, 400);
    contact = c || null;
  }

  let mime = existing?.profile_photo_mime || null;
  let data = existing?.profile_photo_data || null;
  if (removePhoto) {
    mime = null;
    data = null;
  } else if (photoBuffer && Buffer.isBuffer(photoBuffer) && photoBuffer.length && photoMime) {
    mime = photoMime;
    data = photoBuffer;
  }

  await pool.query(
    `INSERT INTO tour_manager.user_profile_settings
      (realm, user_key, display_name, organization_display, contact_line, profile_photo_mime, profile_photo_data, updated_at)
     VALUES ('admin', $1, $2, NULL, $3, $4, $5, NOW())
     ON CONFLICT (realm, user_key) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       contact_line = EXCLUDED.contact_line,
       profile_photo_mime = EXCLUDED.profile_photo_mime,
       profile_photo_data = EXCLUDED.profile_photo_data,
       updated_at = NOW()`,
    [key, name, contact, mime, data]
  );

  await adminTeam.ensureAdminTeamSchema();
  await pool
    .query(
      `UPDATE tour_manager.admin_users SET full_name = $2, updated_at = NOW()
       WHERE LOWER(email) = $1`,
      [key, name]
    )
    .catch(() => null);
}

async function getAdminPhoto(email) {
  await ensureSchema();
  const key = normalizeEmail(email);
  if (!key) return null;
  const row = await pool
    .query(
      `SELECT profile_photo_mime, profile_photo_data
       FROM tour_manager.user_profile_settings
       WHERE realm = 'admin' AND user_key = $1`,
      [key]
    )
    .then((r) => r.rows[0] || null);
  if (!row?.profile_photo_data || !row?.profile_photo_mime) return null;
  return { mime: row.profile_photo_mime, buffer: row.profile_photo_data };
}

// ─── Portal ───────────────────────────────────────────────────────────────────

async function getPortalSidebarMerge(email, baseBranding) {
  await ensureSchema();
  const key = normalizeEmail(email);
  const row = key
    ? await pool
        .query(
          `SELECT display_name, organization_display, profile_photo_mime, profile_photo_data, updated_at
           FROM tour_manager.user_profile_settings
           WHERE realm = 'portal' AND user_key = $1`,
          [key]
        )
        .then((r) => r.rows[0] || null)
    : null;

  const displayFromProfile = row?.display_name?.trim() || '';
  const orgFromProfile = row?.organization_display?.trim() || '';

  const displayName = displayFromProfile || baseBranding.portalNav.displayName;
  const organizationName = orgFromProfile || baseBranding.organizationName;

  const hasPhoto = !!(row?.profile_photo_data && row?.profile_photo_mime);
  const photoVersion = row?.updated_at ? new Date(row.updated_at).getTime() : 0;

  return {
    ...baseBranding,
    organizationName,
    portalNav: {
      ...baseBranding.portalNav,
      displayName,
      organizationName,
      hasProfilePhoto: hasPhoto,
      profilePhotoVersion: photoVersion,
    },
  };
}

async function getPortalProfileForEditor(email, defaultDisplayName, defaultOrganization) {
  await ensureSchema();
  const key = normalizeEmail(email);
  const row = key
    ? await pool
        .query(
          `SELECT display_name, organization_display, contact_line, profile_photo_mime, profile_photo_data
           FROM tour_manager.user_profile_settings
           WHERE realm = 'portal' AND user_key = $1`,
          [key]
        )
        .then((r) => r.rows[0] || null)
    : null;

  const displayName = row?.display_name?.trim() || defaultDisplayName || '';
  const organizationDisplay = row?.organization_display?.trim() || '';
  const hasPhoto = !!(row?.profile_photo_mime && row?.profile_photo_data);

  return {
    displayName,
    organizationDisplay,
    defaultOrganization: defaultOrganization || '',
    hasPhoto,
    email: key,
    contactLine: String(row?.contact_line || '').trim(),
  };
}

async function upsertPortalProfileSimple(email, { displayName, organizationDisplay, contactLine, photoBuffer, photoMime, removePhoto }) {
  await ensureSchema();
  const key = normalizeEmail(email);
  if (!key) throw new Error('Keine E-Mail');

  const existing = await pool
    .query(
      `SELECT display_name, organization_display, contact_line, profile_photo_mime, profile_photo_data
       FROM tour_manager.user_profile_settings
       WHERE realm = 'portal' AND user_key = $1`,
      [key]
    )
    .then((r) => r.rows[0] || null);

  const name = displayName !== undefined ? String(displayName || '').trim() || null : existing?.display_name ?? null;
  const org =
    organizationDisplay !== undefined
      ? String(organizationDisplay || '').trim() || null
      : existing?.organization_display ?? null;
  let contact = existing?.contact_line ?? null;
  if (contactLine !== undefined) {
    const c = String(contactLine || '').trim().slice(0, 400);
    contact = c || null;
  }

  let mime = existing?.profile_photo_mime || null;
  let data = existing?.profile_photo_data || null;
  if (removePhoto) {
    mime = null;
    data = null;
  } else if (photoBuffer && Buffer.isBuffer(photoBuffer) && photoBuffer.length && photoMime) {
    mime = photoMime;
    data = photoBuffer;
  }

  await pool.query(
    `INSERT INTO tour_manager.user_profile_settings
      (realm, user_key, display_name, organization_display, contact_line, profile_photo_mime, profile_photo_data, updated_at)
     VALUES ('portal', $1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (realm, user_key) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       organization_display = EXCLUDED.organization_display,
       contact_line = EXCLUDED.contact_line,
       profile_photo_mime = EXCLUDED.profile_photo_mime,
       profile_photo_data = EXCLUDED.profile_photo_data,
       updated_at = NOW()`,
    [key, name, org, contact, mime, data]
  );
}

async function getPortalPhoto(email) {
  await ensureSchema();
  const key = normalizeEmail(email);
  if (!key) return null;
  const row = await pool
    .query(
      `SELECT profile_photo_mime, profile_photo_data
       FROM tour_manager.user_profile_settings
       WHERE realm = 'portal' AND user_key = $1`,
      [key]
    )
    .then((r) => r.rows[0] || null);
  if (!row?.profile_photo_data || !row?.profile_photo_mime) return null;
  return { mime: row.profile_photo_mime, buffer: row.profile_photo_data };
}

module.exports = {
  ensureSchema,
  getAdminSidebarBundle,
  getAdminProfileForEditor,
  upsertAdminProfileSimple,
  getAdminPhoto,
  getPortalSidebarMerge,
  getPortalProfileForEditor,
  upsertPortalProfileSimple,
  getPortalPhoto,
  deriveNameFromEmail,
};
