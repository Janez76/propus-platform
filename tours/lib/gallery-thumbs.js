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
const ALLOWED_PUBLIC_THUMB_FORMATS = new Set(['jpg', 'webp']);
const PREWARM_DEFAULT_WIDTH = 1200;
const PREWARM_CONCURRENCY = 4;
/**
 * Standardvarianten, die vom Admin-Import-Hook vorgenerendert werden:
 * - WebP @ 600px: Grid-Thumbnail (Kunden-Magic-Link, niedrige Bytes)
 * - WebP @ 1200px: Lightbox-Ansicht und Listing-Galerien
 * - JPG @ 1200px: Fallback fuer den Fall, dass ein Client ohne `fmt=webp` anfragt
 */
const PREWARM_DEFAULT_VARIANTS = [
  { width: 600, format: 'webp' },
  { width: 1200, format: 'webp' },
  { width: 1200, format: 'jpg' },
];

const publicThumbInflight = new Map();

function parsePublicThumbWidth(raw) {
  if (raw == null || raw === '') return null;
  const w = Number.parseInt(String(raw), 10);
  return ALLOWED_PUBLIC_THUMB_WIDTHS.has(w) ? w : null;
}

function parsePublicThumbFormat(raw) {
  if (raw == null || raw === '') return 'jpg';
  const f = String(raw).toLowerCase().trim();
  return ALLOWED_PUBLIC_THUMB_FORMATS.has(f) ? f : 'jpg';
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

/**
 * Wendet den Format-Encoder (JPEG oder WebP) auf eine sharp-Pipeline an.
 * WebP @ q78 ist visuell mit JPEG @ q82 vergleichbar, aber ~30-40% kleiner —
 * was bei 65 Bildern den Unterschied zwischen sofort sichtbar und sichtbarem
 * Ladebalken macht.
 */
function applyOutputFormat(pipeline, format) {
  if (format === 'webp') {
    return pipeline.webp({ quality: 78, effort: 4 });
  }
  return pipeline.jpeg({ quality: 82, mozjpeg: true });
}

async function ensurePublicThumb(srcPath, galleryId, imageId, width, withWatermark, format = 'jpg') {
  const fmt = ALLOWED_PUBLIC_THUMB_FORMATS.has(format) ? format : 'jpg';
  const ext = fmt === 'webp' ? 'webp' : 'jpg';
  let stat;
  try { stat = await fs.promises.stat(srcPath); } catch { return null; }
  const mtime = Math.floor(stat.mtimeMs);
  const cacheDir = path.join(PUBLIC_THUMB_CACHE_DIR, String(galleryId));
  const suffix = withWatermark ? '_wm' : '';
  const cachePath = path.join(cacheDir, `${imageId}_${width}_${mtime}${suffix}.${ext}`);
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
      await applyOutputFormat(
        sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
          .composite([{ input: svg, blend: 'over' }]),
        fmt,
      ).toFile(tmp);
    } else {
      await applyOutputFormat(
        sharp(srcPath, { failOn: 'none' })
          .rotate()
          .resize({ width, withoutEnlargement: true, fit: 'inside' }),
        fmt,
      ).toFile(tmp);
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
async function prewarmPublicThumbs({
  gallery,
  images,
  resolveImageFile,
  width = PREWARM_DEFAULT_WIDTH,
  variants = null,
}) {
  if (!gallery || !Array.isArray(images) || images.length === 0) {
    return { warmed: 0, skipped: 0, failed: 0, total: 0 };
  }
  if (typeof resolveImageFile !== 'function') {
    throw new Error('prewarmPublicThumbs: resolveImageFile() injection required');
  }

  const kind = gallery.kind === 'bildauswahl' ? 'bildauswahl' : 'listing';
  const withWatermark = kind === 'bildauswahl' && gallery.watermark_enabled !== false;

  /**
   * Wenn `variants` nicht gesetzt ist, bleibt das alte Verhalten erhalten:
   * eine einzelne Variante bei `width` und JPG. Bildauswahl-Importe rufen
   * explizit mit dem Default-Variantenset (WebP 600 + WebP 1200 + JPG 1200)
   * auf, damit Grid und Lightbox sofort warm sind.
   */
  const targetVariants = Array.isArray(variants) && variants.length > 0
    ? variants
    : [{ width, format: 'jpg' }];

  const queue = images.filter((img) => img && img.source_type === 'nas_local' && img.enabled !== false);
  const totalSteps = queue.length * targetVariants.length;
  let warmed = 0; let skipped = 0; let failed = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const img = queue[cursor++];
      const filePath = (() => {
        try { return resolveImageFile(img); } catch { return null; }
      })();
      if (!filePath) { skipped += targetVariants.length; continue; }
      for (const v of targetVariants) {
        try {
          const out = await ensurePublicThumb(filePath, gallery.id, img.id, v.width, withWatermark, v.format || 'jpg');
          if (out) warmed += 1; else skipped += 1;
        } catch (e) {
          failed += 1;
          console.warn(`[gallery-thumbs] prewarm failed for image ${img.id} (${v.format}@${v.width}):`, e?.message || e);
        }
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(PREWARM_CONCURRENCY, queue.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return { warmed, skipped, failed, total: totalSteps };
}

/**
 * Boot-Hook (fire-and-forget): pre-rendert die Default-Varianten fuer alle
 * aktiven Bildauswahl-Galerien. Wichtig nach einem Deploy, der neue Varianten
 * einfuehrt (z. B. WebP 600) — bestehende Galerien haben sonst nur die alten
 * JPEG-1200-Thumbs auf Disk und der naechste Kunden-Aufruf trifft den Cold-Start.
 *
 * Concurrency wird durch `prewarmPublicThumbs` selbst begrenzt; wir verarbeiten
 * Galerien sequentiell, damit nicht mehrere parallele Galerien × 4 Sharp-Worker
 * den Container in die Knie zwingen.
 */
async function backfillPrewarmAllBildauswahl(galleryLib) {
  if (!galleryLib || typeof galleryLib.listGalleries !== 'function') return;
  let totalWarmed = 0;
  let processed = 0;
  let listed;
  try {
    listed = await galleryLib.listGalleries({ kind: 'bildauswahl' });
  } catch (e) {
    console.warn('[gallery-thumbs] backfill listGalleries failed:', e?.message || e);
    return;
  }
  const rows = Array.isArray(listed?.rows) ? listed.rows : Array.isArray(listed) ? listed : [];
  for (const summary of rows) {
    if (summary?.status === 'inactive') continue;
    try {
      const g = await galleryLib.getGallery(summary.id, { kind: 'bildauswahl' });
      if (!g) continue;
      const images = await galleryLib.listGalleryImages(g.id);
      const r = await prewarmPublicThumbs({
        gallery: g,
        images,
        variants: PREWARM_DEFAULT_VARIANTS,
        resolveImageFile: (img) =>
          galleryLib.resolvePreferredImageFile(img) || galleryLib.resolveGalleryImageFile(img),
      });
      totalWarmed += r.warmed;
      processed += 1;
    } catch (e) {
      console.warn(`[gallery-thumbs] backfill failed for ${summary?.id}:`, e?.message || e);
    }
  }
  if (processed > 0) {
    console.log(`[gallery-thumbs] backfill done: ${processed} bildauswahl galleries, ${totalWarmed} thumbs warmed`);
  }
}

module.exports = {
  ALLOWED_PUBLIC_THUMB_WIDTHS,
  ALLOWED_PUBLIC_THUMB_FORMATS,
  PREWARM_DEFAULT_WIDTH,
  PREWARM_DEFAULT_VARIANTS,
  parsePublicThumbWidth,
  parsePublicThumbFormat,
  ensurePublicThumb,
  prewarmPublicThumbs,
  backfillPrewarmAllBildauswahl,
  watermarkSvgFor,
};
