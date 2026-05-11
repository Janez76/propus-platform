/**
 * JSON-Admin-API fuer das Bildauswahl-Modul (Selekto/Picdrop, server-backed).
 * Gemountet unter /api/tours/admin/bildauswahl (requireAdmin davor in platform/server.js).
 *
 * Spiegelt das Verhalten von `gallery-admin-api.js`, schreibt aber gegen
 * `tour_manager.bildauswahl_*`. Editor-Thumbnails werden ueber die gleiche
 * sharp-Pipeline server-seitig gerendert und auf Disk gecached.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const router = express.Router();
const bildauswahl = require('../lib/bildauswahl');

const THUMB_CACHE_DIR = path.join(__dirname, '..', 'uploads', 'bildauswahl-thumbs');
const ALLOWED_THUMB_WIDTHS = new Set([200, 400, 600]);
const thumbInflight = new Map();

function parseThumbWidth(raw) {
  const w = Number.parseInt(String(raw || '400'), 10);
  return ALLOWED_THUMB_WIDTHS.has(w) ? w : 400;
}

async function ensureThumb(srcPath, galleryId, imageId, width) {
  let stat;
  try { stat = await fs.promises.stat(srcPath); } catch { return null; }
  const mtime = Math.floor(stat.mtimeMs);
  const cacheDir = path.join(THUMB_CACHE_DIR, String(galleryId));
  const cachePath = path.join(cacheDir, `${imageId}_${width}_${mtime}.jpg`);
  try {
    const c = await fs.promises.stat(cachePath);
    if (c.isFile() && c.size > 0) return cachePath;
  } catch { /* miss */ }
  if (thumbInflight.has(cachePath)) { await thumbInflight.get(cachePath); return cachePath; }
  const p = (async () => {
    await fs.promises.mkdir(cacheDir, { recursive: true });
    try {
      const entries = await fs.promises.readdir(cacheDir);
      const prefix = `${imageId}_${width}_`;
      for (const e of entries) {
        if (e.startsWith(prefix) && e !== path.basename(cachePath)) {
          await fs.promises.unlink(path.join(cacheDir, e)).catch(() => {});
        }
      }
    } catch { /* ignore */ }
    const tmp = `${cachePath}.${process.pid}.tmp`;
    await sharp(srcPath, { failOn: 'none' })
      .rotate()
      .resize({ width, withoutEnlargement: true, fit: 'inside' })
      .jpeg({ quality: 75, mozjpeg: true })
      .toFile(tmp);
    await fs.promises.rename(tmp, cachePath);
  })();
  thumbInflight.set(cachePath, p);
  try { await p; } finally { thumbInflight.delete(cachePath); }
  return cachePath;
}

// ─── Galleries CRUD ────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { search, filter, sort } = req.query;
    const rows = await bildauswahl.listBildauswahl({ search, filter, sort });
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const g = await bildauswahl.getBildauswahl(req.params.id);
    if (!g) return res.status(404).json({ ok: false, error: 'Bildauswahl nicht gefunden.' });
    const images = await bildauswahl.listBildauswahlImages(g.id);
    res.json({ ok: true, gallery: g, images });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const g = await bildauswahl.createBildauswahl(req.body || {});
    res.json({ ok: true, gallery: g });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const g = await bildauswahl.updateBildauswahl(req.params.id, req.body || {});
    if (!g) return res.status(404).json({ ok: false, error: 'Bildauswahl nicht gefunden.' });
    res.json({ ok: true, gallery: g });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await bildauswahl.deleteBildauswahl(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Images ────────────────────────────────────────────────────────────────

router.get('/:id/images', async (req, res) => {
  try {
    const rows = await bildauswahl.listBildauswahlImages(req.params.id);
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/:id/images/:imgId/thumb', async (req, res) => {
  try {
    const images = await bildauswahl.listBildauswahlImages(req.params.id);
    const img = images.find((i) => i.id === req.params.imgId);
    if (!img) return res.status(404).json({ ok: false, error: 'Bild nicht gefunden.' });
    if (img.source_type !== 'nas_local') {
      return res.status(400).json({ ok: false, error: 'Thumbnail nur fuer NAS-Bilder.' });
    }
    const filePath = bildauswahl.resolveImageFile(img);
    if (!filePath) return res.status(404).json({ ok: false, error: 'Datei nicht gefunden.' });
    const w = parseThumbWidth(req.query.w);
    const cachePath = await ensureThumb(filePath, req.params.id, req.params.imgId, w);
    if (!cachePath) return res.status(404).json({ ok: false, error: 'Thumbnail fehlgeschlagen.' });
    res.set('Cache-Control', 'public, max-age=86400, immutable');
    res.type('jpg');
    return res.sendFile(cachePath);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── NAS-Browse + Import ───────────────────────────────────────────────────

router.get('/nas/browse', async (req, res) => {
  try {
    const rootKind = String(req.query.rootKind || '').trim();
    const relativePath = String(req.query.relativePath || '').trim();
    if (!['customer', 'raw'].includes(rootKind)) {
      return res.status(400).json({ ok: false, error: 'Ungueltiger Root.' });
    }
    const result = bildauswahl.listNasDirectoryEntries(rootKind, relativePath);
    const orderGuess = bildauswahl.guessOrderNoFromNasPath(relativePath);
    res.json({ ok: true, ...result, orderGuess });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.post('/:id/import-nas', async (req, res) => {
  try {
    const result = await bildauswahl.importBildauswahlFromNas(req.params.id, req.body || {});
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ─── Feedback ──────────────────────────────────────────────────────────────

router.get('/:id/feedback', async (req, res) => {
  try {
    const rows = await bildauswahl.listFeedback(req.params.id);
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.patch('/feedback/:fbId', async (req, res) => {
  try {
    const resolved = Boolean(req.body?.resolved);
    await bildauswahl.setFeedbackResolved(req.params.fbId, resolved);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ─── E-Mail-Vorlagen ───────────────────────────────────────────────────────

router.get('/email-templates', async (_req, res) => {
  try {
    const rows = await bildauswahl.listEmailTemplates();
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.put('/email-templates/:tplId', async (req, res) => {
  try {
    await bildauswahl.saveEmailTemplate({
      id: req.params.tplId,
      subject: req.body?.subject,
      body: req.body?.body,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ─── Client-Status (manuelle Markierung) ───────────────────────────────────

router.post('/:id/mark-email-sent', async (req, res) => {
  try {
    await bildauswahl.recordEmailSent(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
