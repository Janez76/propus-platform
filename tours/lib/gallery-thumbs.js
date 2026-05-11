'use strict';
/**
 * Geteilte Thumbnail-Pipeline fuer Kunden-Galerien (Listing + Bildauswahl).
 *
 * - `ensurePublicThumb()` resized via sharp und cached auf Disk; bei
 *   `withWatermark=true` wird zusaetzlich das «PROPUS»-SVG einkomponiert.
 * - `prewarmPublicThumbs()` triggert die Generierung fuer alle Bilder einer
 *   Galerie im Hintergrund — wird vom Admin-API nach einem erfolgreichen
 *   Import aufgerufen, damit der erste Kunde keine Cold-Start-Latenz mehr
 *   spuert.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PUBLIC_THUMB_CACHE_DIR = path.join(__dirname, '..', 'uploads', 'gallery-public-thumbs');
const ALLOWED_PUBLIC_THUMB_WIDTHS = new Set([200, 400, 600, 800, 1200, 1680]);
const PREWARM_DEFAULT_WIDTH = 1200;
const PREWARM_CONCURRENCY = 4;

const publicThumbInflight = new Map();

function parsePublicThumbWidth(raw) {
  if (raw == null || raw === '') return null;
  const w = Number.parseInt(String(raw), 10);
  return ALLOWED_PUBLIC_THUMB_WIDTHS.has(w) ? w : null;
}

function watermarkSvgFor(w, h) {
  const fs2 = Math.max(20, Math.round(w / 12));
  const sw = Math.max(1, Math.round(w / 400));
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<g transform="translate(${w / 2} ${h / 2}) rotate(-25.7)">` +
    `<text x="0" y="0" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" ` +
    `font-weight="700" font-size="${fs2}" text-anchor="middle" dominant-baseline="middle" ` +
    `fill="rgba(255,255,255,0.26)" stroke="rgba(0,0,0,0.35)" stroke-width="${sw}">PROPUS</text>` +
    `</g></svg>`
  );
}

async function ensurePublicThumb(srcPath, galleryId, imageId, width, withWatermark) {
  let stat;
  try { stat = await fs.promises.stat(srcPath); } catch { return null; }
  const mtime = Math.floor(stat.mtimeMs);
  const cacheDir = path.join(PUBLIC_THUMB_CACHE_DIR, String(galleryId));
  const suffix = withWatermark ? '_wm' : '';
  const cachePath = path.join(cacheDir, `${imageId}_${width}_${mtime}${suffix}.jpg`);
  try {
    const c = await fs.promises.stat(cachePath);
    if (c.isFile() && c.size > 0) return cachePath;
  } catch { /* miss */ }
  if (publicThumbInflight.has(cachePath)) {
    await publicThumbInflight.get(cachePath);
    return cachePath;
  }
  const p = (async () => {
    await fs.promises.mkdir(cacheDir, { recursive: true });
    const tmp = `${cachePath}.${process.pid}.tmp`;
    if (withWatermark) {
      const { data, info } = await sharp(srcPath, { failOn: 'none' })
        .rotate()
        .resize({ width, withoutEnlargement: true, fit: 'inside' })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const svg = watermarkSvgFor(info.width, info.height);
      await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
        .composite([{ input: svg, blend: 'over' }])
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(tmp);
    } else {
      await sharp(srcPath, { failOn: 'none' })
        .rotate()
        .resize({ width, withoutEnlargement: true, fit: 'inside' })
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(tmp);
    }
    await fs.promises.rename(tmp, cachePath);
  })();
  publicThumbInflight.set(cachePath, p);
  try { await p; } finally { publicThumbInflight.delete(cachePath); }
  return cachePath;
}

/**
 * Pre-render aller nas_local-Bilder einer Galerie auf die Standardbreite.
 * Concurrency-begrenzt (4 parallele sharp-Jobs), damit der Container bei
 * grossen Galerien (>100 Bilder) nicht ueberlastet wird.
 *
 * Wird vom Admin-API nach Import als Fire-and-Forget gestartet.
 */
/**
 * Pre-render aller nas_local-Bilder einer Galerie auf die Standardbreite.
 * - `resolveImageFile(img)` muss vom Aufrufer injiziert werden (gallery.js
 *   exportiert es). Vermeidet eine Circular-Dependency.
 * - Concurrency-begrenzt (4 parallele sharp-Jobs).
 * - Errors werden geloggt aber nicht geworfen — der Aufrufer (Import-Route)
 *   muss nicht warten und soll bei Teilausfall trotzdem grünes Licht geben.
 */
async function prewarmPublicThumbs({ gallery, images, resolveImageFile, width = PREWARM_DEFAULT_WIDTH }) {
  if (!gallery || !Array.isArray(images) || images.length === 0) {
    return { warmed: 0, skipped: 0, failed: 0, total: 0 };
  }
  if (typeof resolveImageFile !== 'function') {
    throw new Error('prewarmPublicThumbs: resolveImageFile() injection required');
  }

  const kind = gallery.kind === 'bildauswahl' ? 'bildauswahl' : 'listing';
  const withWatermark = kind === 'bildauswahl' && gallery.watermark_enabled !== false;

  const queue = images.filter((img) => img && img.source_type === 'nas_local' && img.enabled !== false);
  let warmed = 0; let skipped = 0; let failed = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const img = queue[cursor++];
      try {
        const filePath = resolveImageFile(img);
        if (!filePath) { skipped += 1; continue; }
        const out = await ensurePublicThumb(filePath, gallery.id, img.id, width, withWatermark);
        if (out) warmed += 1; else skipped += 1;
      } catch (e) {
        failed += 1;
        console.warn(`[gallery-thumbs] prewarm failed for image ${img.id}:`, e?.message || e);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(PREWARM_CONCURRENCY, queue.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return { warmed, skipped, failed, total: queue.length };
}

module.exports = {
  ALLOWED_PUBLIC_THUMB_WIDTHS,
  PREWARM_DEFAULT_WIDTH,
  parsePublicThumbWidth,
  ensurePublicThumb,
  prewarmPublicThumbs,
  watermarkSvgFor,
};
