/**
 * Public-API fuer Bildauswahl (Kunden-Magic-Link).
 * Gemountet unter /api/bildauswahl in platform/server.js (kein Auth).
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const router = express.Router();
const bildauswahl = require('../lib/bildauswahl');

// Public-Thumb-Cache: Watermark wird derzeit weiterhin clientseitig auf
// das ausgelieferte Bild gezeichnet — der Server liefert das websized-Bild
// resized, damit die Bandbreite klein bleibt und der Browser-Canvas nicht
// 12 MB-Originaldateien verarbeiten muss.
const PUBLIC_THUMB_CACHE_DIR = path.join(__dirname, '..', 'uploads', 'bildauswahl-public-thumbs');
const ALLOWED_PUBLIC_THUMB_WIDTHS = new Set([800, 1200, 1680]);
const publicThumbInflight = new Map();

function parsePublicThumbWidth(raw) {
  const w = Number.parseInt(String(raw || '1200'), 10);
  return ALLOWED_PUBLIC_THUMB_WIDTHS.has(w) ? w : 1200;
}

async function ensurePublicThumb(srcPath, galleryId, imageId, width) {
  let stat;
  try { stat = await fs.promises.stat(srcPath); } catch { return null; }
  const mtime = Math.floor(stat.mtimeMs);
  const cacheDir = path.join(PUBLIC_THUMB_CACHE_DIR, String(galleryId));
  const cachePath = path.join(cacheDir, `${imageId}_${width}_${mtime}.jpg`);
  try {
    const c = await fs.promises.stat(cachePath);
    if (c.isFile() && c.size > 0) return cachePath;
  } catch { /* miss */ }
  if (publicThumbInflight.has(cachePath)) { await publicThumbInflight.get(cachePath); return cachePath; }
  const p = (async () => {
    await fs.promises.mkdir(cacheDir, { recursive: true });
    const tmp = `${cachePath}.${process.pid}.tmp`;
    await sharp(srcPath, { failOn: 'none' })
      .rotate()
      .resize({ width, withoutEnlargement: true, fit: 'inside' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(tmp);
    await fs.promises.rename(tmp, cachePath);
  })();
  publicThumbInflight.set(cachePath, p);
  try { await p; } finally { publicThumbInflight.delete(cachePath); }
  return cachePath;
}

// GET /:slug — Public-Payload fuer ClientBildauswahlPage
router.get('/:slug', async (req, res) => {
  try {
    const g = await bildauswahl.getBildauswahlBySlug(req.params.slug);
    if (!g) return res.status(404).json({ ok: false, error: 'Bildauswahl nicht verfügbar.' });
    const imgs = (await bildauswahl.listBildauswahlImages(g.id)).filter((i) => i.enabled);
    res.set('Cache-Control', 'no-store, max-age=0');
    res.json({
      ok: true,
      id: g.id,
      slug: g.slug,
      title: g.title,
      address: g.address || null,
      client_name: g.client_name || null,
      updated_at: g.updated_at,
      watermark_enabled: g.watermark_enabled !== false,
      picdrop_selection_json: g.picdrop_selection_json || null,
      images: imgs.map((i) => ({
        id: i.id,
        category: i.category,
        sort_order: i.sort_order,
      })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /:slug/images/:imgId — Bild-Thumbnail (resized JPEG)
router.get('/:slug/images/:imgId', async (req, res) => {
  try {
    const g = await bildauswahl.getBildauswahlBySlug(req.params.slug);
    if (!g) return res.status(404).json({ ok: false, error: 'Bildauswahl nicht verfügbar.' });
    const images = await bildauswahl.listBildauswahlImages(g.id);
    const img = images.find((i) => i.id === req.params.imgId);
    if (!img || !img.enabled) return res.status(404).json({ ok: false, error: 'Bild nicht gefunden.' });
    const filePath = bildauswahl.resolveImageFile(img);
    if (!filePath) return res.status(404).json({ ok: false, error: 'Datei nicht gefunden.' });
    const w = parsePublicThumbWidth(req.query.w);
    const cachePath = await ensurePublicThumb(filePath, g.id, img.id, w);
    if (!cachePath) return res.status(500).json({ ok: false, error: 'Thumbnail fehlgeschlagen.' });
    res.set('Cache-Control', 'public, max-age=14400, s-maxage=14400, immutable');
    res.type('jpg');
    return res.sendFile(cachePath);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /:slug/viewed — Client-Log: Galerie geoeffnet
router.post('/:slug/viewed', async (req, res) => {
  try {
    const g = await bildauswahl.getBildauswahlBySlugAny(req.params.slug);
    if (!g) return res.status(404).json({ ok: false });
    await bildauswahl.recordClientViewed(g.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /:slug/draft — Auto-Save der Picdrop-Auswahl im Browser
router.post('/:slug/draft', async (req, res) => {
  try {
    const g = await bildauswahl.getBildauswahlBySlug(req.params.slug);
    if (!g) return res.status(404).json({ ok: false, error: 'Bildauswahl nicht verfügbar.' });
    const raw = req.body?.picdrop_selection_json;
    if (raw !== null && typeof raw !== 'string') {
      return res.status(400).json({ ok: false, error: 'Ungueltiger Entwurf.' });
    }
    if (raw && raw.length > 64 * 1024) {
      return res.status(400).json({ ok: false, error: 'Entwurf zu gross.' });
    }
    await bildauswahl.updateBildauswahl(g.id, { picdrop_selection_json: raw });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /:slug/selection — Kunde sendet finale Auswahl
router.post('/:slug/selection', async (req, res) => {
  try {
    const g = await bildauswahl.getBildauswahlBySlug(req.params.slug);
    if (!g) return res.status(404).json({ ok: false, error: 'Bildauswahl nicht verfügbar.' });
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items) return res.status(400).json({ ok: false, error: 'items[] erforderlich.' });
    const proto = String(req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http')).split(',')[0];
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0];
    const siteBaseUrl = host ? `${proto}://${host}` : null;
    await bildauswahl.submitClientSelection({
      galleryId: g.id,
      gallerySlug: g.slug,
      items,
      siteBaseUrl,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
