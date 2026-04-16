/**
 * DB-Query-Funktionen fuer das Listing/Galerie-Modul.
 * Alle Queries laufen gegen tour_manager.galleries / gallery_images / gallery_feedback / gallery_email_templates.
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');
const crypto = require('crypto');
const orderStorage = require(path.join(__dirname, '..', '..', 'booking', 'order-storage'));
const bookingDb = require(path.join(__dirname, '..', '..', 'booking', 'db'));

const SLUG_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const SLUG_LENGTH = 22;
const WEBDAV_PREFIX = '/public.php/webdav';
const IMG_EXT = /\.(jpe?g|png|webp|gif)$/i;
const PDF_EXT = /\.pdf$/i;
const MP4_EXT = /\.mp4$/i;
const PROPFIND_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontenttype/><d:getlastmodified/></d:prop></d:propfind>`;
const MAX_FOLDERS = 100;
const MAX_IMAGE_HREFS = 200;
const MAX_PDF_HREFS = 40;
const MAX_MP4_HREFS = 16;

function generateSlug() {
  const bytes = crypto.randomBytes(SLUG_LENGTH);
  let slug = '';
  for (let i = 0; i < SLUG_LENGTH; i++) {
    slug += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return slug;
}

function parseNextcloudPublicShareUrl(input) {
  try {
    const u = new URL(String(input || '').trim());
    const path = u.pathname.replace(/\/+$/, '');
    const m = path.match(/(?:^|\/)(?:index\.php\/)?s\/([A-Za-z0-9]+)$/);
    if (!m) return null;
    return { origin: u.origin, host: u.host, token: m[1] };
  } catch {
    return null;
  }
}

function encodePathSegment(seg) {
  try {
    return encodeURIComponent(decodeURIComponent(seg));
  } catch {
    return encodeURIComponent(seg);
  }
}

function nextcloudHrefToPublicFileUrl(href, origin, token) {
  if (!href.startsWith(WEBDAV_PREFIX)) return null;
  const rel = href.slice(WEBDAV_PREFIX.length).replace(/^\/+/, '');
  const path = rel.split('/').filter(Boolean).map(encodePathSegment).join('/');
  return `${origin}/public.php/dav/files/${token}/${path}`;
}

function parsePropfind(xml) {
  const out = [];
  const re = /<d:response>([\s\S]*?)<\/d:response>/gi;
  let block;
  while ((block = re.exec(xml)) !== null) {
    const inner = block[1];
    const hrefM = inner.match(/<d:href>([^<]*)<\/d:href>/i);
    if (!hrefM) continue;
    let href = hrefM[1].trim();
    try {
      href = decodeURIComponent(href);
    } catch {
      /* keep raw href */
    }
    const isCollection =
      /<d:collection\s*\/>/i.test(inner) ||
      /<d:resourcetype>[\s\S]*<d:collection/i.test(inner);
    const ctM = inner.match(/<d:getcontenttype>([^<]*)<\/d:getcontenttype>/i);
    const lmM = inner.match(/<d:getlastmodified>([^<]*)<\/d:getlastmodified>/i);
    out.push({
      href,
      isCollection,
      contentType: (ctM?.[1] || '').trim().toLowerCase(),
      lastModified: lmM?.[1]?.trim() || null,
    });
  }
  return out;
}

function pathScoreForGallery(p) {
  const pl = String(p || '').toLowerCase();
  if (pl.includes('/finale/bilder/web size/')) return 6;
  if (pl.includes('/zur auswahl/')) return 5;
  if (pl.includes('/websize/')) return 4;
  if (pl.includes('/web/')) return 3;
  if (pl.includes('/staging/')) return 2;
  if (pl.includes('/fullsize/')) return 1;
  return 2;
}

function dedupeByBasenamePreferWebsize(hrefs) {
  const byBase = new Map();
  for (const href of hrefs) {
    const base = href.split('/').filter(Boolean).pop() || href;
    const current = byBase.get(base);
    if (!current || pathScoreForGallery(href) > pathScoreForGallery(current)) {
      byBase.set(base, href);
    }
  }
  return [...byBase.values()];
}

/**
 * Dedupliziert Galerie-Image-Rows anhand des Basenames (Dateiname ohne Pfad).
 * Wenn websize- UND fullsize-Variante desselben Bildes in der DB liegen,
 * gewinnt die websize-Variante; fullsize-Eintrag wird ausgeblendet.
 * Die Originalreihenfolge bleibt erhalten.
 */
function dedupeGalleryRowsPreferWebsize(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  const bestByBase = new Map();
  for (const row of rows) {
    const pathForScore = row?.source_path || row?.remote_src || '';
    const base = String(pathForScore).split('/').filter(Boolean).pop() || `__row_${row?.id || Math.random()}`;
    const key = base.toLowerCase();
    const current = bestByBase.get(key);
    if (!current || pathScoreForGallery(pathForScore) > pathScoreForGallery(current.source_path || current.remote_src || '')) {
      bestByBase.set(key, row);
    }
  }
  const keep = new Set([...bestByBase.values()].map((r) => r.id));
  return rows.filter((r) => keep.has(r.id));
}

function pathScoreForVideo(p) {
  const pl = String(p || '').toLowerCase();
  if (pl.includes('/finale/video/')) return 6;
  if (pl.includes('/video/') || pl.includes('/videos/')) return 5;
  if (pl.includes('/filme/') || pl.includes('/film/')) return 4;
  if (pl.includes('/media/')) return 3;
  return 1;
}

function pathScoreForFloorPlan(p) {
  const pl = String(p || '').toLowerCase();
  if (pl.includes('/finale/grundrisse/')) return 6;
  if (pl.includes('/grundrisse/')) return 5;
  if (pl.includes('/floorplan/')) return 4;
  return 1;
}

function dedupeByBasenameWithScore(paths, scorer) {
  const byBase = new Map();
  for (const currentPath of paths) {
    const base = String(currentPath || '').split('/').filter(Boolean).pop() || currentPath;
    const existing = byBase.get(base);
    if (!existing || scorer(currentPath) > scorer(existing)) {
      byBase.set(base, currentPath);
    }
  }
  return [...byBase.values()];
}

function toPortableRelative(value) {
  const normalized = path.normalize(String(value || '').trim()).replace(/\\/g, '/');
  if (!normalized || normalized === '.') return '';
  return normalized.replace(/^\/+/, '');
}

function getGalleryRootConfig(rootKind) {
  const roots = orderStorage.getStorageRoots();
  if (rootKind === 'customer') {
    return { rootKind: 'customer', rootPath: roots.customerRoot, label: 'Kunden-Root' };
  }
  if (rootKind === 'raw') {
    return { rootKind: 'raw', rootPath: roots.rawRoot, label: 'Raw-Root' };
  }
  throw new Error('Ungültiger Root-Typ');
}

function resolveGalleryRoot(rootKind) {
  const config = getGalleryRootConfig(rootKind);
  return {
    ...config,
    rootPath: orderStorage.assertRootReady(config.rootPath, { label: config.label, allowCreate: false }),
  };
}

function resolveGalleryAbsolutePath(rootKind, relativePath, { expectDirectory = false } = {}) {
  const root = resolveGalleryRoot(rootKind);
  const normalizedRelative = toPortableRelative(relativePath);
  const absolutePath = normalizedRelative
    ? path.resolve(root.rootPath, normalizedRelative)
    : root.rootPath;
  if (!orderStorage.isPathInside(root.rootPath, absolutePath)) {
    throw new Error('Pfad liegt ausserhalb des erlaubten Root-Verzeichnisses');
  }
  if (!fs.existsSync(absolutePath)) {
    throw new Error('Pfad nicht gefunden');
  }
  const stat = fs.statSync(absolutePath);
  if (expectDirectory && !stat.isDirectory()) {
    throw new Error('Pfad ist kein Verzeichnis');
  }
  if (!expectDirectory && !stat.isFile()) {
    throw new Error('Pfad ist keine Datei');
  }
  return {
    ...root,
    relativePath: normalizedRelative,
    absolutePath,
  };
}

function buildGalleryFloorPlanItems(items) {
  return items.map((item) => ({
    title: item.title,
    url: item.url || null,
    source_type: item.source_type || null,
    source_root_kind: item.source_root_kind || null,
    source_path: item.source_path || null,
  }));
}

function parseStoredFloorPlans(raw) {
  if (!raw || !String(raw).trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        title: String(item.title || 'Grundriss').trim() || 'Grundriss',
        url: item.url ? String(item.url).trim() : null,
        source_type: item.source_type ? String(item.source_type).trim() : null,
        source_root_kind: item.source_root_kind ? String(item.source_root_kind).trim() : null,
        source_path: item.source_path ? String(item.source_path).trim() : null,
      }));
  } catch {
    return [];
  }
}

function buildNasMediaSummary(scan) {
  return {
    images: scan.images.length,
    floorPlans: scan.floorPlans.length,
    hasVideo: Boolean(scan.video),
  };
}

function scanNasMediaFromDirectory(rootKind, absoluteDir) {
  const root = resolveGalleryRoot(rootKind);
  if (!orderStorage.isPathInside(root.rootPath, absoluteDir)) {
    throw new Error('Pfad liegt ausserhalb des erlaubten Root-Verzeichnisses');
  }
  const allFiles = orderStorage.walkFilesRecursive(absoluteDir);
  const imagePaths = [];
  const pdfPaths = [];
  const mp4Paths = [];

  for (const absolutePath of allFiles) {
    const relativePath = orderStorage.toPortablePath(path.relative(root.rootPath, absolutePath));
    const lowered = relativePath.toLowerCase();
    if (IMG_EXT.test(lowered)) imagePaths.push(relativePath);
    if (PDF_EXT.test(lowered)) pdfPaths.push(relativePath);
    if (MP4_EXT.test(lowered)) mp4Paths.push(relativePath);
  }

  const images = dedupeByBasenamePreferWebsize(imagePaths).map((relativePath) => ({
    fileName: fileNameFromUrl(relativePath),
    source_type: 'nas_local',
    source_root_kind: rootKind,
    source_path: relativePath,
    remoteSrc: null,
  }));

  const floorPlans = dedupeByBasenameWithScore(pdfPaths, pathScoreForFloorPlan)
    .sort((a, b) => a.localeCompare(b, 'de'))
    .map((relativePath, index) => {
      const rawName = fileNameFromUrl(relativePath).replace(PDF_EXT, '').replace(/_/g, ' ').trim();
      return {
        title: rawName || `Grundriss ${index + 1}`,
        source_type: 'nas_local',
        source_root_kind: rootKind,
        source_path: relativePath,
        url: null,
      };
    });

  const bestVideoRelative = dedupeByBasenameWithScore(mp4Paths, pathScoreForVideo)
    .sort((a, b) => pathScoreForVideo(b) - pathScoreForVideo(a))[0] || null;

  const video = bestVideoRelative
    ? {
        source_type: 'nas_local',
        source_root_kind: rootKind,
        source_path: bestVideoRelative,
        url: null,
      }
    : null;

  return { images, floorPlans, video };
}

function listNasDirectoryEntries(rootKind, relativePath = '') {
  const { rootPath, absolutePath } = resolveGalleryAbsolutePath(rootKind, relativePath, { expectDirectory: true });
  const entries = fs.readdirSync(absolutePath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map((entry) => {
      const nextRelativePath = orderStorage.toPortablePath(path.join(relativePath || '', entry.name));
      return {
        name: entry.name,
        relativePath: nextRelativePath,
      };
    });

  const scan = relativePath ? scanNasMediaFromDirectory(rootKind, absolutePath) : null;
  const parentRelativePath = relativePath
    ? orderStorage.toPortablePath(path.dirname(relativePath)).replace(/^\.$/, '')
    : null;

  return {
    rootKind,
    rootPath,
    currentRelativePath: toPortableRelative(relativePath),
    parentRelativePath,
    entries,
    mediaSummary: scan ? buildNasMediaSummary(scan) : { images: 0, floorPlans: 0, hasVideo: false },
  };
}

async function getGalleryNasContext(galleryId, { orderNoOverride = null } = {}) {
  const gallery = await getGallery(galleryId);
  if (!gallery) throw new Error('Galerie nicht gefunden.');

  const storageHealth = orderStorage.getStorageHealth();
  const suggestions = [];
  const effectiveOrderNo = orderNoOverride != null ? orderNoOverride : gallery.booking_order_no;
  if (effectiveOrderNo != null) {
    const order = await bookingDb.getOrderByNo(effectiveOrderNo);
    if (order) {
      const folders = await orderStorage.getOrderFolderSummary(order, bookingDb, { createMissing: false });
      for (const folder of folders) {
        const rootKind = folder.folderType === 'raw_material' ? 'raw' : 'customer';
        // Kundenordner: bevorzuge den '/Finale'-Unterordner, wenn er existiert,
        // weil dort die publizierten Bilder liegen.
        let effectiveRelativePath = folder.relativePath;
        let effectiveExists = folder.exists;
        if (folder.folderType === 'customer_folder' && folder.exists) {
          try {
            const finaleCandidate = toPortableRelative(`${folder.relativePath}/Finale`);
            const finaleAbs = resolveGalleryAbsolutePath(rootKind, finaleCandidate, { expectDirectory: true }).absolutePath;
            if (fs.existsSync(finaleAbs) && fs.statSync(finaleAbs).isDirectory()) {
              effectiveRelativePath = finaleCandidate;
              effectiveExists = true;
            }
          } catch {
            /* Finale-Ordner nicht vorhanden — bleibe bei Parent */
          }
        }
        let mediaSummary = { images: 0, floorPlans: 0, hasVideo: false };
        if (effectiveExists) {
          try {
            mediaSummary = buildNasMediaSummary(
              scanNasMediaFromDirectory(rootKind, resolveGalleryAbsolutePath(rootKind, effectiveRelativePath, { expectDirectory: true }).absolutePath)
            );
          } catch {
            /* ignore broken folder */
          }
        }
        suggestions.push({
          folderType: folder.folderType,
          rootKind,
          relativePath: effectiveRelativePath,
          displayName: folder.displayName,
          companyName: folder.companyName,
          status: folder.status,
          exists: effectiveExists,
          mediaSummary,
          nextcloudShareUrl: folder.nextcloudShareUrl || null,
        });
      }
    }
  }

  return {
    storageHealth,
    suggestions,
    currentSource: {
      storage_source_type: gallery.storage_source_type || null,
      storage_root_kind: gallery.storage_root_kind || null,
      storage_relative_path: gallery.storage_relative_path || null,
    },
  };
}

async function propfind(href, token, origin) {
  const response = await fetch(`${origin}${href}`, {
    method: 'PROPFIND',
    headers: {
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
      Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`,
    },
    body: PROPFIND_BODY,
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('Nextcloud hat den Zugriff abgelehnt.');
  }
  if (!response.ok) {
    throw new Error(`WebDAV ${response.status}`);
  }
  return response.text();
}

async function listMediaFromNextcloudPublicShare(sharePageUrl) {
  const parsed = parseNextcloudPublicShareUrl(sharePageUrl);
  if (!parsed) {
    throw new Error('Keine gültige Propus-Cloud/Nextcloud-Freigabe-URL.');
  }

  const folderQueue = [`${WEBDAV_PREFIX}/`];
  const seenFolders = new Set();
  const imageHrefs = [];
  const pdfHrefs = [];
  const mp4Hrefs = [];

  while (folderQueue.length > 0 && seenFolders.size < MAX_FOLDERS) {
    const href = folderQueue.shift();
    if (!href || seenFolders.has(href)) continue;
    seenFolders.add(href);

    const xml = await propfind(href, parsed.token, parsed.origin);
    const entries = parsePropfind(xml);

    for (const entry of entries) {
      if (entry.href === href || !entry.href.startsWith(WEBDAV_PREFIX)) continue;
      if (entry.isCollection) {
        const nested = entry.href.endsWith('/') ? entry.href : `${entry.href}/`;
        if (!seenFolders.has(nested)) folderQueue.push(nested);
        continue;
      }

      const isImg =
        IMG_EXT.test(entry.href) ||
        entry.contentType.startsWith('image/') ||
        entry.contentType === 'image/jpeg';
      if (isImg && imageHrefs.length < MAX_IMAGE_HREFS) imageHrefs.push(entry.href);

      const isPdf =
        PDF_EXT.test(entry.href) ||
        entry.contentType === 'application/pdf' ||
        entry.contentType.includes('pdf');
      if (isPdf && pdfHrefs.length < MAX_PDF_HREFS) pdfHrefs.push(entry.href);

      const isMp4 =
        MP4_EXT.test(entry.href) ||
        entry.contentType === 'video/mp4' ||
        entry.contentType.includes('video/mp4');
      if (isMp4 && mp4Hrefs.length < MAX_MP4_HREFS) mp4Hrefs.push(entry.href);
    }
  }

  const pickedImages = dedupeByBasenamePreferWebsize(imageHrefs)
    .map((href) => {
      const remoteSrc = nextcloudHrefToPublicFileUrl(href, parsed.origin, parsed.token);
      if (!remoteSrc) return null;
      return {
        remoteSrc,
        fileName: fileNameFromUrl(href),
      };
    })
    .filter(Boolean);

  const floorPlans = [...new Set(pdfHrefs)]
    .sort()
    .map((href, index) => {
      const publicUrl = nextcloudHrefToPublicFileUrl(href, parsed.origin, parsed.token);
      if (!publicUrl) return null;
      const rawName = fileNameFromUrl(href).replace(PDF_EXT, '').replace(/_/g, ' ').trim();
      return {
        url: publicUrl,
        title: rawName || `Grundriss ${index + 1}`,
      };
    })
    .filter(Boolean);

  const bestVideoHref = [...new Set(mp4Hrefs)].sort((a, b) => pathScoreForVideo(b) - pathScoreForVideo(a))[0] || null;
  const videoUrl = bestVideoHref ? nextcloudHrefToPublicFileUrl(bestVideoHref, parsed.origin, parsed.token) : null;

  return {
    images: pickedImages,
    floorPlans,
    videoUrl: videoUrl || null,
  };
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
      LOWER(COALESCE(g.client_contact, '')) LIKE $${idx} OR
      LOWER(g.client_email) LIKE $${idx} OR
      COALESCE(g.booking_order_no::text, '') LIKE $${idx} OR
      LOWER(g.slug) LIKE $${idx} OR
      LOWER(COALESCE(g.friendly_slug, '')) LIKE $${idx}
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getGallery(idOrSlug) {
  if (idOrSlug == null) return null;
  const value = String(idOrSlug).trim();
  if (!value) return null;
  const sql = UUID_REGEX.test(value)
    ? 'SELECT * FROM tour_manager.galleries WHERE id = $1'
    : 'SELECT * FROM tour_manager.galleries WHERE slug = $1';
  const { rows } = await pool.query(sql, [value]);
  return rows[0] || null;
}

async function getGalleryBySlug(slug) {
  const { rows } = await pool.query(
    `SELECT * FROM tour_manager.galleries
     WHERE (slug = $1 OR friendly_slug = $1) AND status = 'active'
     LIMIT 1`,
    [slug]
  );
  return rows[0] || null;
}

async function getGalleryBySlugAny(slug) {
  const { rows } = await pool.query(
    `SELECT * FROM tour_manager.galleries
     WHERE slug = $1 OR friendly_slug = $1
     LIMIT 1`,
    [slug]
  );
  return rows[0] || null;
}

function slugifyPart(value) {
  if (!value) return '';
  const umlautMap = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss', 'Ä': 'ae', 'Ö': 'oe', 'Ü': 'ue' };
  return String(value)
    .replace(/[äöüßÄÖÜ]/g, (c) => umlautMap[c] || c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildFriendlySlugBase({ address, booking_order_no }) {
  const addr = String(address || '');
  let plz = '';
  let ort = '';
  // Schweiz: 4-stellige PLZ, typisch "Strasse 1, 8000 Zürich" oder "8000 Zürich, Strasse 1"
  const plzMatch = addr.match(/\b(\d{4})\b/);
  if (plzMatch) plz = plzMatch[1];
  const afterPlz = addr.match(/\b\d{4}\s+([^,\n]+?)(?:,|$)/);
  if (afterPlz) ort = afterPlz[1].trim();
  if (!ort) {
    const beforePlz = addr.match(/([^,\n]+?),\s*\d{4}/);
    if (beforePlz) ort = beforePlz[1].trim();
  }
  const parts = [plz, slugifyPart(ort), booking_order_no != null ? String(booking_order_no) : '']
    .filter(Boolean);
  return parts.join('-');
}

async function generateUniqueFriendlySlug({ address, booking_order_no, excludeId = null }) {
  const base = buildFriendlySlugBase({ address, booking_order_no });
  if (!base) return null;
  let candidate = base;
  let i = 1;
  // Kollision mit slug ODER friendly_slug vermeiden
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params = excludeId ? [candidate, excludeId] : [candidate];
    const sql = excludeId
      ? `SELECT id FROM tour_manager.galleries
         WHERE (slug = $1 OR friendly_slug = $1) AND id <> $2 LIMIT 1`
      : `SELECT id FROM tour_manager.galleries
         WHERE slug = $1 OR friendly_slug = $1 LIMIT 1`;
    const { rows } = await pool.query(sql, params);
    if (rows.length === 0) return candidate;
    i += 1;
    candidate = `${base}-${i}`;
    if (i > 50) return candidate; // Notausgang
  }
}

async function createGallery(data = {}) {
  const slug = generateSlug();
  const friendlySlug = await generateUniqueFriendlySlug({
    address: data.address,
    booking_order_no: data.booking_order_no,
  });
  const { rows } = await pool.query(
    `INSERT INTO tour_manager.galleries (
       slug, friendly_slug, title, address, customer_id, customer_contact_id, booking_order_no,
       client_name, client_contact, client_email, status, matterport_input, cloud_share_url,
       storage_source_type, storage_root_kind, storage_relative_path,
       video_source_type, video_source_root_kind, video_source_path, video_url, floor_plans_json
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
     RETURNING *`,
    [
      slug,
      friendlySlug,
      data.title || '',
      data.address || null,
      data.customer_id || null,
      data.customer_contact_id || null,
      data.booking_order_no || null,
      data.client_name || null,
      data.client_contact || null,
      data.client_email || null,
      data.status || 'inactive',
      data.matterport_input || null,
      data.cloud_share_url || null,
      data.storage_source_type || null,
      data.storage_root_kind || null,
      data.storage_relative_path || null,
      data.video_source_type || null,
      data.video_source_root_kind || null,
      data.video_source_path || null,
      data.video_url || null,
      data.floor_plans_json || null,
    ]
  );
  return rows[0];
}

async function updateGallery(id, patch) {
  const allowed = [
    'title', 'address', 'customer_id', 'customer_contact_id', 'booking_order_no',
    'client_name', 'client_contact', 'client_email',
    'client_delivery_status', 'client_delivery_sent_at',
    'client_log_email_received_at', 'client_log_gallery_opened_at',
    'client_log_files_downloaded_at',
    'status', 'matterport_input', 'cloud_share_url',
    'storage_source_type', 'storage_root_kind', 'storage_relative_path',
    'video_source_type', 'video_source_root_kind', 'video_source_path', 'video_url', 'floor_plans_json',
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

  // Friendly-Slug neu berechnen, wenn Adresse/Bestellnummer betroffen sind
  // oder der bisherige friendly_slug fehlt (Backfill für Alt-Galerien).
  const current = await getGallery(id);
  const addressChanged = patch.address !== undefined && patch.address !== current?.address;
  const orderChanged = patch.booking_order_no !== undefined && patch.booking_order_no !== current?.booking_order_no;
  const needsBackfill = !current?.friendly_slug;
  if (addressChanged || orderChanged || needsBackfill) {
    const nextAddress = patch.address !== undefined ? patch.address : current?.address;
    const nextOrderNo = patch.booking_order_no !== undefined ? patch.booking_order_no : current?.booking_order_no;
    const friendly = await generateUniqueFriendlySlug({
      address: nextAddress,
      booking_order_no: nextOrderNo,
      excludeId: id,
    });
    sets.push(`friendly_slug = $${idx}`);
    params.push(friendly);
    idx++;
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
       (slug, title, address, customer_id, customer_contact_id, booking_order_no, client_name, client_contact, client_email, status,
        matterport_input, cloud_share_url, storage_source_type, storage_root_kind, storage_relative_path,
        video_source_type, video_source_root_kind, video_source_path, video_url, floor_plans_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'inactive', $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     RETURNING *`,
    [
      newSlug,
      `${src.title} (Kopie)`,
      src.address,
      src.customer_id,
      src.customer_contact_id,
      src.booking_order_no,
      src.client_name,
      src.client_contact,
      src.client_email,
      src.matterport_input,
      src.cloud_share_url,
      src.storage_source_type,
      src.storage_root_kind,
      src.storage_relative_path,
      src.video_source_type,
      src.video_source_root_kind,
      src.video_source_path,
      src.video_url,
      src.floor_plans_json,
    ]
  );
  const newGallery = rows[0];

  const imgs = await listGalleryImages(id);
  for (const img of imgs) {
    await pool.query(
      `INSERT INTO tour_manager.gallery_images (
         gallery_id, sort_order, enabled, category, file_name, source_type, source_root_kind, source_path, remote_src
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        newGallery.id,
        img.sort_order,
        img.enabled,
        img.category,
        img.file_name,
        img.source_type || null,
        img.source_root_kind || null,
        img.source_path || null,
        img.remote_src,
      ]
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
    `INSERT INTO tour_manager.gallery_images (gallery_id, sort_order, enabled, category, file_name, source_type, source_root_kind, source_path, remote_src)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      galleryId,
      sortOrder,
      data.enabled !== false,
      data.category || null,
      data.file_name || null,
      data.source_type || null,
      data.source_root_kind || null,
      data.source_path || null,
      data.remote_src || null,
    ]
  );
  await touchGallery(galleryId);
  return rows[0];
}

async function updateImage(imageId, patch) {
  const allowed = ['enabled', 'category', 'sort_order', 'file_name', 'source_type', 'source_root_kind', 'source_path', 'remote_src'];
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

async function replaceGalleryMedia(client, galleryId, payload) {
  const images = Array.isArray(payload.images) ? payload.images : [];
  const floorPlans = Array.isArray(payload.floorPlans) ? payload.floorPlans : [];
  const video = payload.video || null;
  const storageSourceType = payload.storage_source_type || null;
  const storageRootKind = payload.storage_root_kind || null;
  const storageRelativePath = payload.storage_relative_path || null;

  await client.query('DELETE FROM tour_manager.gallery_images WHERE gallery_id = $1', [galleryId]);

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    await client.query(
      `INSERT INTO tour_manager.gallery_images (
         gallery_id, sort_order, enabled, category, file_name, source_type, source_root_kind, source_path, remote_src
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        galleryId,
        i,
        true,
        null,
        image.fileName || null,
        image.source_type || null,
        image.source_root_kind || null,
        image.source_path || null,
        image.remoteSrc || null,
      ]
    );
  }

  await client.query(
    `UPDATE tour_manager.galleries
     SET storage_source_type = $1,
         storage_root_kind = $2,
         storage_relative_path = $3,
         video_source_type = $4,
         video_source_root_kind = $5,
         video_source_path = $6,
         video_url = $7,
         floor_plans_json = $8,
         updated_at = NOW()
     WHERE id = $9`,
    [
      storageSourceType,
      storageRootKind,
      storageRelativePath,
      video?.source_type || null,
      video?.source_root_kind || null,
      video?.source_path || null,
      video?.url || null,
      floorPlans.length ? JSON.stringify(buildGalleryFloorPlanItems(floorPlans)) : null,
      galleryId,
    ]
  );
}

async function importImagesFromShare(galleryId, urls) {
  const rawUrls = Array.isArray(urls) ? urls : [];
  const values = rawUrls.map((entry) => String(entry?.url || entry || '').trim()).filter(Boolean);
  if (values.length === 0) {
    return { added: 0, floorPlans: 0, hasVideo: false };
  }

  if (values.length === 1 && parseNextcloudPublicShareUrl(values[0])) {
    const media = await listMediaFromNextcloudPublicShare(values[0]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await replaceGalleryMedia(client, galleryId, {
        images: media.images.map((image) => ({
          fileName: image.fileName,
          source_type: 'remote_url',
          source_root_kind: null,
          source_path: null,
          remoteSrc: image.remoteSrc,
        })),
        floorPlans: media.floorPlans.map((floorPlan) => ({
          title: floorPlan.title,
          url: floorPlan.url,
          source_type: null,
          source_root_kind: null,
          source_path: null,
        })),
        video: media.videoUrl
          ? {
              source_type: 'url',
              source_root_kind: null,
              source_path: null,
              url: media.videoUrl,
            }
          : null,
        storage_source_type: 'share_link',
        storage_root_kind: null,
        storage_relative_path: null,
      });
      await client.query('COMMIT');
      return {
        added: media.images.length,
        floorPlans: media.floorPlans.length,
        hasVideo: Boolean(media.videoUrl),
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  const added = [];
  for (let i = 0; i < values.length; i++) {
    const remoteSrc = values[i];
    const fileName = fileNameFromUrl(remoteSrc);
    const img = await addGalleryImage(galleryId, {
      remote_src: remoteSrc,
      file_name: fileName,
      category: null,
      enabled: true,
    });
    added.push(img);
  }
  return { added: added.length, floorPlans: 0, hasVideo: false };
}

async function importGalleryFromNas(galleryId, source) {
  const rootKind = String(source?.rootKind || '').trim();
  const storageSourceType = String(source?.storageSourceType || 'nas_browser').trim();
  const relativePath = toPortableRelative(source?.relativePath || '');
  const allowedSourceTypes = new Set(['order_folder', 'nas_browser']);
  if (!allowedSourceTypes.has(storageSourceType)) {
    throw new Error('Ungültiger NAS-Quelltyp');
  }
  if (!relativePath) {
    throw new Error('NAS-Pfad fehlt');
  }

  const { absolutePath } = resolveGalleryAbsolutePath(rootKind, relativePath, { expectDirectory: true });
  const media = scanNasMediaFromDirectory(rootKind, absolutePath);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await replaceGalleryMedia(client, galleryId, {
      images: media.images,
      floorPlans: media.floorPlans,
      video: media.video,
      storage_source_type: storageSourceType,
      storage_root_kind: rootKind,
      storage_relative_path: relativePath,
    });
    await client.query('COMMIT');
    return {
      added: media.images.length,
      floorPlans: media.floorPlans.length,
      hasVideo: Boolean(media.video),
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
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

function resolveGalleryImageFile(image) {
  if (!image || image.source_type !== 'nas_local' || !image.source_root_kind || !image.source_path) {
    return null;
  }
  return resolveGalleryAbsolutePath(image.source_root_kind, image.source_path, { expectDirectory: false }).absolutePath;
}

/**
 * Liefert den Websize-Pfad einer Image-Row, falls neben der gespeicherten (ggf.
 * fullsize) Datei eine websize-Variante mit gleichem Basename existiert.
 * Reihenfolge der Kandidaten: Finale/Bilder/WEB SIZE → Bilder/WEB SIZE → websize.
 */
function resolvePreferredImageFile(image) {
  const original = resolveGalleryImageFile(image);
  if (!original) return null;
  try {
    // Bereits websize → nichts zu tun
    if (pathScoreForGallery(image.source_path) >= 4) return original;
    const base = path.basename(original);
    const baseNoExt = base.replace(/\.[^.]+$/, '');
    const dir = path.dirname(original);
    // Heuristik: …/Bilder/FULLSIZE/foo.jpg → Kandidat …/Bilder/WEB SIZE/foo.jpg
    const segments = dir.split(path.sep);
    const candidates = [];
    const fullsizeIdx = segments.findIndex((s) => /^fullsize$/i.test(s));
    if (fullsizeIdx > 0) {
      const base1 = [...segments];
      base1[fullsizeIdx] = 'WEB SIZE';
      candidates.push(path.join(...base1, `${baseNoExt}.jpg`));
      const base2 = [...segments];
      base2[fullsizeIdx] = 'websize';
      candidates.push(path.join(...base2, `${baseNoExt}.jpg`));
    }
    // Zusätzlich: unter gleicher Elternebene nach WEB SIZE suchen
    const parent = path.dirname(dir);
    candidates.push(path.join(parent, 'WEB SIZE', `${baseNoExt}.jpg`));
    candidates.push(path.join(parent, 'websize', `${baseNoExt}.jpg`));
    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  } catch { /* ignore and fall back to original */ }
  return original;
}

function resolveGalleryVideoFile(gallery) {
  if (!gallery || gallery.video_source_type !== 'nas_local' || !gallery.video_source_root_kind || !gallery.video_source_path) {
    return null;
  }
  return resolveGalleryAbsolutePath(gallery.video_source_root_kind, gallery.video_source_path, { expectDirectory: false }).absolutePath;
}

function resolveGalleryFloorPlanFile(gallery, index) {
  const items = parseStoredFloorPlans(gallery?.floor_plans_json);
  const item = items[index];
  if (!item || item.source_type !== 'nas_local' || !item.source_root_kind || !item.source_path) {
    return null;
  }
  return resolveGalleryAbsolutePath(item.source_root_kind, item.source_path, { expectDirectory: false }).absolutePath;
}

function getGalleryDownloadSource(gallery, variant = 'all') {
  if (!gallery || !gallery.storage_root_kind || !gallery.storage_relative_path) return null;
  if (!['order_folder', 'nas_browser'].includes(String(gallery.storage_source_type || ''))) return null;
  const base = resolveGalleryAbsolutePath(
    gallery.storage_root_kind,
    gallery.storage_relative_path,
    { expectDirectory: true },
  );
  if (variant === 'all' || !variant) return base;

  // Kandidaten-Unterordner innerhalb des Finale-Ordners
  const subdirByVariant = {
    websize: ['Bilder/WEB SIZE', 'Bilder/websize', 'WEB SIZE', 'websize'],
    fullsize: ['Bilder/FULLSIZE', 'Bilder/fullsize', 'FULLSIZE', 'fullsize'],
  };
  const candidates = subdirByVariant[variant];
  if (!candidates) return base;

  for (const rel of candidates) {
    const candidate = path.join(base.absolutePath, rel);
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return { ...base, absolutePath: candidate, variant, variantSubdir: rel };
      }
    } catch { /* try next */ }
  }
  return base; // Fallback: ganzer Ordner
}

/**
 * Zählt Bilder/Grundrisse/Videos im Download-Quellordner pro Variante
 * und summiert die Bytes. Nicht-existierende Ordner werden übersprungen.
 */
function getGalleryMediaSummary(gallery) {
  const summary = {
    imagesWebsize: 0,
    imagesFullsize: 0,
    floorPlans: 0,
    hasVideo: false,
    bytesWebsize: 0,
    bytesFullsize: 0,
    bytesTotal: 0,
  };
  if (!gallery) return summary;
  const base = getGalleryDownloadSource(gallery, 'all');
  if (!base) return summary;

  const websize = getGalleryDownloadSource(gallery, 'websize');
  const fullsize = getGalleryDownloadSource(gallery, 'fullsize');

  function sumImages(dir) {
    let count = 0;
    let bytes = 0;
    if (!dir || !dir.absolutePath) return { count, bytes };
    try {
      if (!fs.existsSync(dir.absolutePath) || !fs.statSync(dir.absolutePath).isDirectory()) {
        return { count, bytes };
      }
      const files = orderStorage.walkFilesRecursive(dir.absolutePath);
      for (const file of files) {
        if (!IMG_EXT.test(file)) continue;
        try {
          const stat = fs.statSync(file);
          if (stat.isFile()) {
            count += 1;
            bytes += stat.size;
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    return { count, bytes };
  }

  if (websize && websize.variant === 'websize') {
    const s = sumImages(websize);
    summary.imagesWebsize = s.count;
    summary.bytesWebsize = s.bytes;
  }
  if (fullsize && fullsize.variant === 'fullsize') {
    const s = sumImages(fullsize);
    summary.imagesFullsize = s.count;
    summary.bytesFullsize = s.bytes;
  }

  try {
    const all = orderStorage.walkFilesRecursive(base.absolutePath);
    for (const file of all) {
      try {
        const stat = fs.statSync(file);
        if (!stat.isFile()) continue;
        summary.bytesTotal += stat.size;
        if (PDF_EXT.test(file)) summary.floorPlans += 1;
        if (MP4_EXT.test(file)) summary.hasVideo = true;
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return summary;
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
  getGalleryNasContext,
  listNasDirectoryEntries,
  importImagesFromShare,
  importGalleryFromNas,
  parseStoredFloorPlans,
  resolveGalleryImageFile,
  resolvePreferredImageFile,
  resolveGalleryVideoFile,
  resolveGalleryFloorPlanFile,
  getGalleryDownloadSource,
  getGalleryMediaSummary,
  dedupeGalleryRowsPreferWebsize,
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
