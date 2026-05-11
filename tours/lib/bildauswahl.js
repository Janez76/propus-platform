'use strict';
/**
 * Bildauswahl (Selekto/Picdrop) — Server-Lib.
 *
 * Spiegelt das Verhalten aus `tours/lib/gallery.js` fuer das parallele
 * Modell `tour_manager.bildauswahl_*`. NAS-Browse + Datei-Aufloesung werden
 * an `gallery.js` delegiert, weil dort die kanonischen Roots/Pfade leben.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pool } = require('./db');
const gallery = require('./gallery');
const orderStorage = require(path.join(__dirname, '..', '..', 'booking', 'order-storage'));

const SLUG_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const SLUG_LENGTH = 22;

function generateSlug() {
  let out = '';
  const buf = crypto.randomBytes(SLUG_LENGTH);
  for (let i = 0; i < SLUG_LENGTH; i++) {
    out += SLUG_ALPHABET[buf[i] % SLUG_ALPHABET.length];
  }
  return out;
}

function sanitizeFriendlySlug(input) {
  if (!input) return null;
  const trimmed = String(input).trim().toLowerCase();
  if (!trimmed) return null;
  const cleaned = trimmed
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || null;
}

async function buildFriendlySlug({ booking_order_no, address, title }) {
  let plzOrt = '';
  if (address) {
    const m = String(address).match(/(\d{4})\s+([A-Za-zÄÖÜäöüß\- ]+)/);
    if (m) plzOrt = `${m[1]}-${sanitizeFriendlySlug(m[2]) || ''}`;
  }
  const base = [plzOrt, booking_order_no ? String(booking_order_no) : '']
    .filter(Boolean)
    .join('-');
  const fallback = sanitizeFriendlySlug(title) || 'bildauswahl';
  return sanitizeFriendlySlug(base || fallback);
}

// ---------------------------------------------------------------------------
// Galleries CRUD
// ---------------------------------------------------------------------------

const SELECT_COLS = `
  g.id, g.slug, g.friendly_slug, g.title, g.address, g.client_name, g.client_email,
  g.client_contact, g.client_delivery_status, g.client_delivery_sent_at,
  g.client_log_email_received_at, g.client_log_gallery_opened_at,
  g.client_log_selection_sent_at, g.status, g.cloud_share_url, g.watermark_enabled,
  g.picdrop_selection_json, g.customer_id, g.customer_contact_id, g.booking_order_no,
  g.storage_source_type, g.storage_root_kind, g.storage_relative_path,
  g.created_at, g.updated_at
`;

async function listBildauswahl({ search, filter, sort } = {}) {
  let where = 'WHERE 1=1';
  const params = [];
  let idx = 1;
  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    params.push(q);
    where += ` AND (
      LOWER(g.title) LIKE $${idx} OR
      LOWER(COALESCE(g.address, '')) LIKE $${idx} OR
      LOWER(COALESCE(g.client_name, '')) LIKE $${idx} OR
      LOWER(COALESCE(g.client_email, '')) LIKE $${idx} OR
      COALESCE(g.booking_order_no::text, '') LIKE $${idx} OR
      LOWER(g.slug) LIKE $${idx} OR
      LOWER(COALESCE(g.friendly_slug, '')) LIKE $${idx}
    )`;
    idx++;
  }
  if (filter === 'delivery_open') where += ` AND g.client_delivery_status = 'open'`;
  else if (filter === 'delivery_sent') where += ` AND g.client_delivery_status = 'sent'`;
  else if (filter === 'active') where += ` AND g.status = 'active'`;
  else if (filter === 'inactive') where += ` AND g.status = 'inactive'`;

  let orderBy = 'ORDER BY g.updated_at DESC';
  if (sort === 'oldest') orderBy = 'ORDER BY g.updated_at ASC';
  else if (sort === 'alphabetical') orderBy = 'ORDER BY g.title ASC';

  const sql = `
    SELECT ${SELECT_COLS},
      COALESCE(ic.cnt, 0)::int AS image_count,
      COALESCE(fc.cnt, 0)::int AS feedback_count
    FROM tour_manager.bildauswahl_galleries g
    LEFT JOIN (
      SELECT gallery_id, COUNT(*)::int AS cnt
      FROM tour_manager.bildauswahl_images
      WHERE enabled = TRUE
      GROUP BY gallery_id
    ) ic ON ic.gallery_id = g.id
    LEFT JOIN (
      SELECT gallery_id, COUNT(*)::int AS cnt
      FROM tour_manager.bildauswahl_feedback
      WHERE resolved_at IS NULL AND author = 'client'
      GROUP BY gallery_id
    ) fc ON fc.gallery_id = g.id
    ${where} ${orderBy} LIMIT 500`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function getBildauswahl(id) {
  const { rows } = await pool.query(
    `SELECT ${SELECT_COLS} FROM tour_manager.bildauswahl_galleries g WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

async function getBildauswahlBySlug(slug) {
  const { rows } = await pool.query(
    `SELECT ${SELECT_COLS} FROM tour_manager.bildauswahl_galleries g
     WHERE (slug = $1 OR friendly_slug = $1) AND status = 'active'
     LIMIT 1`,
    [slug],
  );
  return rows[0] || null;
}

async function getBildauswahlBySlugAny(slug) {
  const { rows } = await pool.query(
    `SELECT ${SELECT_COLS} FROM tour_manager.bildauswahl_galleries g
     WHERE slug = $1 OR friendly_slug = $1 LIMIT 1`,
    [slug],
  );
  return rows[0] || null;
}

async function createBildauswahl(input = {}) {
  const slug = generateSlug();
  const fields = {
    title: String(input.title || 'Neue Bildauswahl').trim(),
    address: input.address ? String(input.address).trim() : null,
    client_name: input.client_name ? String(input.client_name).trim() : null,
    client_email: input.client_email ? String(input.client_email).trim() : null,
    client_contact: input.client_contact ? String(input.client_contact).trim() : null,
    customer_id: input.customer_id || null,
    customer_contact_id: input.customer_contact_id || null,
    booking_order_no: input.booking_order_no || null,
    cloud_share_url: input.cloud_share_url ? String(input.cloud_share_url).trim() : null,
    watermark_enabled: input.watermark_enabled !== false,
  };
  const friendly = await buildFriendlySlug({
    booking_order_no: fields.booking_order_no,
    address: fields.address,
    title: fields.title,
  });
  const { rows } = await pool.query(
    `INSERT INTO tour_manager.bildauswahl_galleries
       (slug, friendly_slug, title, address, client_name, client_email, client_contact,
        customer_id, customer_contact_id, booking_order_no, cloud_share_url, watermark_enabled,
        status, client_delivery_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'inactive', 'open')
     RETURNING ${SELECT_COLS}`,
    [slug, friendly, fields.title, fields.address, fields.client_name, fields.client_email,
     fields.client_contact, fields.customer_id, fields.customer_contact_id,
     fields.booking_order_no, fields.cloud_share_url, fields.watermark_enabled],
  );
  return rows[0];
}

const PATCH_ALLOWED = new Set([
  'title', 'address', 'client_name', 'client_email', 'client_contact',
  'customer_id', 'customer_contact_id', 'booking_order_no',
  'cloud_share_url', 'watermark_enabled', 'status', 'client_delivery_status',
  'picdrop_selection_json',
]);

async function updateBildauswahl(id, patch = {}) {
  // friendly_slug ggf. neu berechnen, bevor das SQL gebaut wird
  let nextFriendly;
  if (patch.title !== undefined || patch.address !== undefined || patch.booking_order_no !== undefined) {
    const current = await getBildauswahl(id);
    if (current) {
      const merged = { ...current, ...patch };
      nextFriendly = await buildFriendlySlug(merged);
    }
  }
  const sets = [];
  const params = [];
  let idx = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (!PATCH_ALLOWED.has(k)) continue;
    sets.push(`${k} = $${idx++}`);
    params.push(v);
  }
  if (nextFriendly !== undefined) {
    sets.push(`friendly_slug = $${idx++}`);
    params.push(nextFriendly);
  }
  if (sets.length === 0) return getBildauswahl(id);
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const sql = `UPDATE tour_manager.bildauswahl_galleries SET ${sets.join(', ')} WHERE id = $${idx} RETURNING ${SELECT_COLS}`;
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}

async function deleteBildauswahl(id) {
  await pool.query('DELETE FROM tour_manager.bildauswahl_galleries WHERE id = $1', [id]);
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

async function listBildauswahlImages(galleryId) {
  const { rows } = await pool.query(
    `SELECT id, gallery_id, sort_order, enabled, category, file_name, remote_src,
            source_type, source_root_kind, source_path, created_at
     FROM tour_manager.bildauswahl_images
     WHERE gallery_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [galleryId],
  );
  return rows;
}

async function replaceBildauswahlImages(client, galleryId, images, storage) {
  await client.query(
    `DELETE FROM tour_manager.bildauswahl_images WHERE gallery_id = $1`,
    [galleryId],
  );
  let order = 0;
  for (const img of images) {
    await client.query(
      `INSERT INTO tour_manager.bildauswahl_images
         (gallery_id, sort_order, enabled, file_name, remote_src,
          source_type, source_root_kind, source_path)
       VALUES ($1, $2, TRUE, $3, $4, $5, $6, $7)`,
      [
        galleryId, order++,
        img.fileName || img.file_name || null,
        img.remoteSrc || img.remote_src || null,
        img.source_type || null,
        img.source_root_kind || null,
        img.source_path || null,
      ],
    );
  }
  await client.query(
    `UPDATE tour_manager.bildauswahl_galleries
     SET storage_source_type = $1, storage_root_kind = $2, storage_relative_path = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [
      storage.storage_source_type || null,
      storage.storage_root_kind || null,
      storage.storage_relative_path || null,
      galleryId,
    ],
  );
}

/** Importiert alle Bilder aus einem NAS-Ordner — analog `gallery.importGalleryFromNas`. */
async function importBildauswahlFromNas(galleryId, source) {
  const rootKind = String(source?.rootKind || '').trim();
  const storageSourceType = String(source?.storageSourceType || 'nas_browser').trim();
  const relativePath = String(source?.relativePath || '').trim();
  if (!['order_folder', 'nas_browser'].includes(storageSourceType)) {
    throw new Error('Ungültiger NAS-Quelltyp');
  }
  if (!relativePath) throw new Error('NAS-Pfad fehlt');

  const { absolutePath } = resolveNasAbsolute(rootKind, relativePath);
  const stat = fs.statSync(absolutePath);
  if (!stat.isDirectory()) throw new Error('Pfad ist kein Verzeichnis');
  const media = scanImagesFromDirectory(rootKind, absolutePath);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await replaceBildauswahlImages(client, galleryId, media.images, {
      storage_source_type: storageSourceType,
      storage_root_kind: rootKind,
      storage_relative_path: relativePath,
    });
    await client.query('COMMIT');
    return { added: media.images.length };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Wrapper um `gallery.listNasDirectoryEntries` — gleiche Roots, gleiche Logik. */
function listNasDirectoryEntries(rootKind, relativePath = '') {
  return gallery.listNasDirectoryEntries(rootKind, relativePath);
}

const IMG_EXT = /\.(jpe?g|png|webp|gif)$/i;
const GALLERY_WEBSIZE_RE = /(?:^web[_-]|[._-](?:web[\s_-]?size|websize|ws|web)(?=\.[a-z0-9]+$))/i;

function resolveNasAbsolute(rootKind, relativePath) {
  const roots = orderStorage.getStorageRoots();
  let rootPath;
  if (rootKind === 'customer') rootPath = roots.customerRoot;
  else if (rootKind === 'raw') rootPath = roots.rawRoot;
  else throw new Error('Ungültiger Root-Typ');
  rootPath = orderStorage.assertRootReady(rootPath, { label: rootKind, allowCreate: false });
  const normalizedRel = path.normalize(String(relativePath || '').trim()).replace(/\\/g, '/').replace(/^\/+/, '');
  const absolutePath = normalizedRel ? path.resolve(rootPath, normalizedRel) : rootPath;
  if (!orderStorage.isPathInside(rootPath, absolutePath)) {
    throw new Error('Pfad liegt ausserhalb des erlaubten Root-Verzeichnisses');
  }
  if (!fs.existsSync(absolutePath)) throw new Error('Pfad nicht gefunden');
  return { rootPath, absolutePath };
}

function fileNameFromPath(p) {
  const seg = String(p || '').split('/').pop() || 'Bild';
  return seg;
}

function scanImagesFromDirectory(rootKind, absoluteDir) {
  const { rootPath } = resolveNasAbsolute(rootKind, '');
  if (!orderStorage.isPathInside(rootPath, absoluteDir)) {
    throw new Error('Pfad liegt ausserhalb des erlaubten Root-Verzeichnisses');
  }
  const allFiles = orderStorage.walkFilesRecursive(absoluteDir);
  const imagePaths = [];
  for (const abs of allFiles) {
    const rel = orderStorage.toPortablePath(path.relative(rootPath, abs));
    if (IMG_EXT.test(rel.toLowerCase())) imagePaths.push(rel);
  }
  // Websize bevorzugen, sonst alle Bilder behalten
  const byBase = new Map();
  for (const p of imagePaths) {
    const base = (p.split('/').pop() || '').toLowerCase().replace(/^web[_-]/, '').replace(/[._-](web[\s_-]?size|websize|ws|web|full|fullsize|fs)(?=\.[a-z0-9]+$)/i, '');
    const score = GALLERY_WEBSIZE_RE.test(p) || /\/(web[\s_-]?size|websize|web)\//i.test(p) ? 2 : 1;
    const cur = byBase.get(base);
    if (!cur || score > cur.score) byBase.set(base, { p, score });
  }
  const dedup = [...byBase.values()].map((x) => x.p).sort();
  const images = dedup.map((rel) => ({
    fileName: fileNameFromPath(rel),
    source_type: 'nas_local',
    source_root_kind: rootKind,
    source_path: rel,
  }));
  return { images };
}

function resolveImageFile(image) {
  if (!image || image.source_type !== 'nas_local' || !image.source_root_kind || !image.source_path) {
    return null;
  }
  const { absolutePath } = resolveNasAbsolute(image.source_root_kind, image.source_path);
  return absolutePath;
}

// ---------------------------------------------------------------------------
// Client logs
// ---------------------------------------------------------------------------

async function recordClientViewed(galleryId) {
  const { rows } = await pool.query(
    `SELECT client_log_email_received_at, client_log_gallery_opened_at
     FROM tour_manager.bildauswahl_galleries WHERE id = $1`,
    [galleryId],
  );
  if (!rows[0]) return;
  if (!rows[0].client_log_email_received_at) return;
  if (rows[0].client_log_gallery_opened_at) return;
  await pool.query(
    `UPDATE tour_manager.bildauswahl_galleries
     SET client_log_gallery_opened_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [galleryId],
  );
}

async function recordSelectionSent(galleryId) {
  await pool.query(
    `UPDATE tour_manager.bildauswahl_galleries
     SET client_log_selection_sent_at = COALESCE(client_log_selection_sent_at, NOW()),
         client_log_gallery_opened_at = COALESCE(client_log_gallery_opened_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [galleryId],
  );
}

async function recordEmailSent(galleryId) {
  await pool.query(
    `UPDATE tour_manager.bildauswahl_galleries
     SET client_delivery_status = 'sent',
         client_delivery_sent_at = NOW(),
         client_log_email_received_at = COALESCE(client_log_email_received_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [galleryId],
  );
}

// ---------------------------------------------------------------------------
// Feedback / Picdrop-Selection
// ---------------------------------------------------------------------------

const PICDROP_FLAGS = new Set(['bearbeiten', 'staging', 'retusche']);

async function submitClientSelection({ galleryId, gallerySlug, items }) {
  const g = await getBildauswahl(galleryId);
  if (!g || g.slug !== gallerySlug) throw new Error('Galerie unbekannt oder Link ungueltig.');
  if (g.status !== 'active') throw new Error('Diese Galerie ist nicht mehr aktiv.');

  const filtered = (items || []).filter(
    (it) =>
      (Array.isArray(it.flags) && it.flags.length > 0) ||
      (Array.isArray(it.messageLines) && it.messageLines.some((l) => String(l || '').trim())),
  );
  if (filtered.length === 0) throw new Error('Nichts zu senden.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const it of filtered) {
      const validFlags = (it.flags || []).filter((f) => PICDROP_FLAGS.has(f));
      const body = (it.messageLines || []).map((l) => String(l || '').trim()).filter(Boolean).join('\n');
      if (validFlags.length === 0 && !body) continue;
      if (body.length > 4000) throw new Error('Kommentar ist zu lang (max. 4000 Zeichen).');
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS n FROM tour_manager.bildauswahl_feedback WHERE gallery_id = $1`,
        [galleryId],
      );
      const revision = (rows[0]?.n || 0) + 1;
      await client.query(
        `INSERT INTO tour_manager.bildauswahl_feedback
           (gallery_id, gallery_slug, asset_key, asset_label, body, author, selection_flags_json, revision)
         VALUES ($1, $2, $3, $4, $5, 'client', $6, $7)`,
        [
          galleryId, gallerySlug, it.asset_key,
          String(it.asset_label || 'Bild').trim() || 'Bild',
          body, validFlags.length > 0 ? JSON.stringify(validFlags) : null, revision,
        ],
      );
    }
    await client.query(
      `UPDATE tour_manager.bildauswahl_galleries
       SET client_log_selection_sent_at = COALESCE(client_log_selection_sent_at, NOW()),
           client_log_gallery_opened_at = COALESCE(client_log_gallery_opened_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [galleryId],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function listFeedback(galleryId) {
  const { rows } = await pool.query(
    `SELECT id, gallery_id, gallery_slug, asset_key, asset_label, body, author,
            selection_flags_json, revision, resolved_at, created_at
     FROM tour_manager.bildauswahl_feedback
     WHERE gallery_id = $1
     ORDER BY revision ASC, created_at ASC`,
    [galleryId],
  );
  return rows;
}

async function setFeedbackResolved(feedbackId, resolved) {
  await pool.query(
    `UPDATE tour_manager.bildauswahl_feedback
     SET resolved_at = ${resolved ? 'NOW()' : 'NULL'}
     WHERE id = $1`,
    [feedbackId],
  );
}

// ---------------------------------------------------------------------------
// E-Mail-Vorlagen
// ---------------------------------------------------------------------------

async function listEmailTemplates() {
  const { rows } = await pool.query(
    `SELECT id, name, subject, body, is_default, created_at, updated_at
     FROM tour_manager.bildauswahl_email_templates
     ORDER BY name ASC`,
  );
  return rows;
}

async function saveEmailTemplate({ id, subject, body }) {
  await pool.query(
    `UPDATE tour_manager.bildauswahl_email_templates
     SET subject = $1, body = $2, updated_at = NOW()
     WHERE id = $3`,
    [String(subject || ''), String(body || ''), id],
  );
}

// ---------------------------------------------------------------------------
// Order-Vorschlag aus NAS-Pfad (PR 2 erweitert)
// ---------------------------------------------------------------------------

/**
 * Sucht eine Bestellnummer im NAS-Pfad ("PROPUS-2025-04-1234" → 1234).
 * Verwendet vom Editor, um beim Picken eines NAS-Ordners die Order vorzuschlagen.
 */
function guessOrderNoFromNasPath(relativePath) {
  if (!relativePath) return null;
  const m = String(relativePath).match(/(?:^|[^0-9])(\d{4,8})(?:[^0-9]|$)/);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 100 ? n : null;
}

module.exports = {
  generateSlug,
  listBildauswahl,
  getBildauswahl,
  getBildauswahlBySlug,
  getBildauswahlBySlugAny,
  createBildauswahl,
  updateBildauswahl,
  deleteBildauswahl,
  listBildauswahlImages,
  importBildauswahlFromNas,
  listNasDirectoryEntries,
  resolveImageFile,
  recordClientViewed,
  recordSelectionSent,
  recordEmailSent,
  submitClientSelection,
  listFeedback,
  setFeedbackResolved,
  listEmailTemplates,
  saveEmailTemplate,
  guessOrderNoFromNasPath,
};
