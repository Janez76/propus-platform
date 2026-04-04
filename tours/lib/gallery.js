/**
 * DB-Query-Funktionen fuer das Listing/Galerie-Modul.
 * Alle Queries laufen gegen tour_manager.galleries / gallery_images / gallery_feedback / gallery_email_templates.
 */
const { pool } = require('./db');
const crypto = require('crypto');

const SLUG_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const SLUG_LENGTH = 22;

function generateSlug() {
  const bytes = crypto.randomBytes(SLUG_LENGTH);
  let slug = '';
  for (let i = 0; i < SLUG_LENGTH; i++) {
    slug += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return slug;
}

// ---------------------------------------------------------------------------
// Galleries CRUD
// ---------------------------------------------------------------------------

async function listGalleries({ search, filter, sort } = {}) {
  let where = 'WHERE 1=1';
  const params = [];
  let idx = 1;

  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    params.push(q);
    where += ` AND (
      LOWER(g.title) LIKE $${idx} OR
      LOWER(g.address) LIKE $${idx} OR
      LOWER(g.client_name) LIKE $${idx} OR
      LOWER(g.client_email) LIKE $${idx} OR
      LOWER(g.slug) LIKE $${idx}
    )`;
    idx++;
  }

  if (filter === 'delivery_open') {
    where += ` AND g.client_delivery_status = 'open'`;
  } else if (filter === 'delivery_sent') {
    where += ` AND g.client_delivery_status = 'sent'`;
  } else if (filter === 'listing_active') {
    where += ` AND g.status = 'active'`;
  } else if (filter === 'listing_inactive') {
    where += ` AND g.status = 'inactive'`;
  }

  let orderBy = 'ORDER BY g.updated_at DESC';
  if (sort === 'oldest') orderBy = 'ORDER BY g.updated_at ASC';
  else if (sort === 'alphabetical') orderBy = 'ORDER BY g.title ASC';

  const sql = `
    SELECT g.*,
      COALESCE(ic.cnt, 0)::int AS image_count,
      COALESCE(fc.cnt, 0)::int AS feedback_count
    FROM tour_manager.galleries g
    LEFT JOIN (
      SELECT gallery_id, COUNT(*) AS cnt FROM tour_manager.gallery_images GROUP BY gallery_id
    ) ic ON ic.gallery_id = g.id
    LEFT JOIN (
      SELECT gallery_id, COUNT(*) AS cnt FROM tour_manager.gallery_feedback
      WHERE resolved_at IS NULL AND author = 'client'
      GROUP BY gallery_id
    ) fc ON fc.gallery_id = g.id
    ${where}
    ${orderBy}
  `;
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function getGallery(id) {
  const { rows } = await pool.query(
    'SELECT * FROM tour_manager.galleries WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function getGalleryBySlug(slug) {
  const { rows } = await pool.query(
    `SELECT * FROM tour_manager.galleries WHERE slug = $1 AND status = 'active'`,
    [slug]
  );
  return rows[0] || null;
}

async function getGalleryBySlugAny(slug) {
  const { rows } = await pool.query(
    'SELECT * FROM tour_manager.galleries WHERE slug = $1',
    [slug]
  );
  return rows[0] || null;
}

async function createGallery(data = {}) {
  const slug = generateSlug();
  const { rows } = await pool.query(
    `INSERT INTO tour_manager.galleries (slug, title, address, client_name, client_email, status, matterport_input, cloud_share_url, video_url, floor_plans_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      slug,
      data.title || '',
      data.address || null,
      data.client_name || null,
      data.client_email || null,
      data.status || 'inactive',
      data.matterport_input || null,
      data.cloud_share_url || null,
      data.video_url || null,
      data.floor_plans_json || null,
    ]
  );
  return rows[0];
}

async function updateGallery(id, patch) {
  const allowed = [
    'title', 'address', 'client_name', 'client_email',
    'client_delivery_status', 'client_delivery_sent_at',
    'client_log_email_received_at', 'client_log_gallery_opened_at',
    'client_log_files_downloaded_at',
    'status', 'matterport_input', 'cloud_share_url', 'video_url', 'floor_plans_json',
  ];
  const sets = [];
  const params = [];
  let idx = 1;

  for (const key of allowed) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = $${idx}`);
      params.push(patch[key]);
      idx++;
    }
  }
  if (sets.length === 0) return getGallery(id);

  sets.push(`updated_at = NOW()`);
  params.push(id);
  const sql = `UPDATE tour_manager.galleries SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`;
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}

async function deleteGallery(id) {
  await pool.query('DELETE FROM tour_manager.galleries WHERE id = $1', [id]);
}

async function duplicateGallery(id) {
  const src = await getGallery(id);
  if (!src) throw new Error('Galerie nicht gefunden.');

  const newSlug = generateSlug();
  const { rows } = await pool.query(
    `INSERT INTO tour_manager.galleries
       (slug, title, address, client_name, client_email, status,
        matterport_input, cloud_share_url, video_url, floor_plans_json)
     VALUES ($1, $2, $3, $4, $5, 'inactive', $6, $7, $8, $9)
     RETURNING *`,
    [
      newSlug,
      `${src.title} (Kopie)`,
      src.address,
      src.client_name,
      src.client_email,
      src.matterport_input,
      src.cloud_share_url,
      src.video_url,
      src.floor_plans_json,
    ]
  );
  const newGallery = rows[0];

  const imgs = await listGalleryImages(id);
  for (const img of imgs) {
    await pool.query(
      `INSERT INTO tour_manager.gallery_images (gallery_id, sort_order, enabled, category, file_name, remote_src)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [newGallery.id, img.sort_order, img.enabled, img.category, img.file_name, img.remote_src]
    );
  }

  return newGallery;
}

// ---------------------------------------------------------------------------
// Gallery Images
// ---------------------------------------------------------------------------

async function listGalleryImages(galleryId) {
  const { rows } = await pool.query(
    'SELECT * FROM tour_manager.gallery_images WHERE gallery_id = $1 ORDER BY sort_order, created_at',
    [galleryId]
  );
  return rows;
}

async function addGalleryImage(galleryId, data) {
  const maxRes = await pool.query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tour_manager.gallery_images WHERE gallery_id = $1',
    [galleryId]
  );
  const sortOrder = data.sort_order ?? maxRes.rows[0].next;

  const { rows } = await pool.query(
    `INSERT INTO tour_manager.gallery_images (gallery_id, sort_order, enabled, category, file_name, remote_src)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [galleryId, sortOrder, data.enabled !== false, data.category || null, data.file_name || null, data.remote_src || null]
  );
  await touchGallery(galleryId);
  return rows[0];
}

async function updateImage(imageId, patch) {
  const allowed = ['enabled', 'category', 'sort_order', 'file_name', 'remote_src'];
  const sets = [];
  const params = [];
  let idx = 1;

  for (const key of allowed) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = $${idx}`);
      params.push(patch[key]);
      idx++;
    }
  }
  if (sets.length === 0) return null;

  params.push(imageId);
  const sql = `UPDATE tour_manager.gallery_images SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`;
  const { rows } = await pool.query(sql, params);
  if (rows[0]) await touchGallery(rows[0].gallery_id);
  return rows[0] || null;
}

async function deleteImage(imageId) {
  const { rows } = await pool.query(
    'DELETE FROM tour_manager.gallery_images WHERE id = $1 RETURNING gallery_id', [imageId]
  );
  if (rows[0]) await touchGallery(rows[0].gallery_id);
}

async function reorderImages(galleryId, orderedIds) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        'UPDATE tour_manager.gallery_images SET sort_order = $1 WHERE id = $2 AND gallery_id = $3',
        [i, orderedIds[i], galleryId]
      );
    }
    await client.query(
      'UPDATE tour_manager.galleries SET updated_at = NOW() WHERE id = $1',
      [galleryId]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function importImagesFromShare(galleryId, urls) {
  const added = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const fileName = fileNameFromUrl(url.url || url);
    const remoteSrc = url.url || url;
    const img = await addGalleryImage(galleryId, {
      remote_src: remoteSrc,
      file_name: fileName,
      category: null,
      enabled: true,
    });
    added.push(img);
  }
  return added;
}

function fileNameFromUrl(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop();
    if (!seg) return url;
    return decodeURIComponent(seg);
  } catch {
    const q = url.split('?')[0] || url;
    const i = q.lastIndexOf('/');
    const seg = i >= 0 ? q.slice(i + 1) : q;
    try { return decodeURIComponent(seg) || 'Bild'; } catch { return seg || 'Bild'; }
  }
}

// ---------------------------------------------------------------------------
// Gallery Feedback
// ---------------------------------------------------------------------------

async function listGalleryFeedback(galleryId) {
  const { rows } = await pool.query(
    'SELECT * FROM tour_manager.gallery_feedback WHERE gallery_id = $1 ORDER BY revision',
    [galleryId]
  );
  return rows;
}

async function listFeedbackForAsset(galleryId, assetType, assetKey) {
  const { rows } = await pool.query(
    `SELECT * FROM tour_manager.gallery_feedback
     WHERE gallery_id = $1 AND asset_type = $2 AND asset_key = $3
     ORDER BY created_at`,
    [galleryId, assetType, assetKey]
  );
  return rows;
}

async function submitFeedback(data) {
  const maxRes = await pool.query(
    'SELECT COALESCE(MAX(revision), 0) + 1 AS next FROM tour_manager.gallery_feedback WHERE gallery_id = $1',
    [data.gallery_id]
  );
  const revision = maxRes.rows[0].next;

  const { rows } = await pool.query(
    `INSERT INTO tour_manager.gallery_feedback
       (gallery_id, gallery_slug, asset_type, asset_key, asset_label, body, author, revision)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.gallery_id, data.gallery_slug,
      data.asset_type, data.asset_key, data.asset_label || '',
      data.body || '', data.author || 'client', revision,
    ]
  );
  return rows[0];
}

async function setFeedbackResolved(feedbackId, resolved) {
  const { rows } = await pool.query(
    `UPDATE tour_manager.gallery_feedback
     SET resolved_at = $1
     WHERE id = $2 RETURNING *`,
    [resolved ? new Date().toISOString() : null, feedbackId]
  );
  return rows[0] || null;
}

async function deleteFeedback(feedbackId) {
  await pool.query('DELETE FROM tour_manager.gallery_feedback WHERE id = $1', [feedbackId]);
}

// ---------------------------------------------------------------------------
// Email Templates
// ---------------------------------------------------------------------------

async function listEmailTemplates() {
  const { rows } = await pool.query(
    'SELECT * FROM tour_manager.gallery_email_templates ORDER BY name'
  );
  return rows;
}

async function saveEmailTemplate(id, subject, body) {
  const { rows } = await pool.query(
    `UPDATE tour_manager.gallery_email_templates
     SET subject = $1, body = $2, updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [subject, body, id]
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Client-Log Tracking
// ---------------------------------------------------------------------------

async function recordClientViewed(galleryId) {
  await pool.query(
    `UPDATE tour_manager.galleries
     SET client_log_gallery_opened_at = COALESCE(client_log_gallery_opened_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [galleryId]
  );
}

async function recordClientFilesDownloaded(galleryId) {
  await pool.query(
    `UPDATE tour_manager.galleries
     SET client_log_files_downloaded_at = COALESCE(client_log_files_downloaded_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [galleryId]
  );
}

async function recordEmailSent(galleryId) {
  await pool.query(
    `UPDATE tour_manager.galleries
     SET client_delivery_status = 'sent',
         client_delivery_sent_at = NOW(),
         client_log_email_received_at = COALESCE(client_log_email_received_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [galleryId]
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function touchGallery(galleryId) {
  await pool.query(
    'UPDATE tour_manager.galleries SET updated_at = NOW() WHERE id = $1',
    [galleryId]
  );
}

module.exports = {
  generateSlug,
  listGalleries,
  getGallery,
  getGalleryBySlug,
  getGalleryBySlugAny,
  createGallery,
  updateGallery,
  deleteGallery,
  duplicateGallery,
  listGalleryImages,
  addGalleryImage,
  updateImage,
  deleteImage,
  reorderImages,
  importImagesFromShare,
  listGalleryFeedback,
  listFeedbackForAsset,
  submitFeedback,
  setFeedbackResolved,
  deleteFeedback,
  listEmailTemplates,
  saveEmailTemplate,
  recordClientViewed,
  recordClientFilesDownloaded,
  recordEmailSent,
};
