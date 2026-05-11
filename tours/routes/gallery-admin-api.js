/**
 * JSON-Admin-API fuer das Listing/Galerie-Modul.
 * Gemountet unter /api/tours/admin/galleries (requireAdmin davor in platform/server.js).
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const router = express.Router();
const gallery = require('../lib/gallery');
const { prewarmPublicThumbs } = require('../lib/gallery-thumbs');
const { sendMailDirect } = require('../lib/microsoft-graph');

/**
 * Background-Prewarm: nach Import alle Bilder einer Galerie auf die
 * Default-Breite (1200px, inkl. Watermark bei Bildauswahl) vorrendern.
 * So entsteht beim ersten Kundenaufruf kein sharp-Cold-Start.
 */
async function prewarmThumbsForGallery(galleryId) {
  try {
    const g = await gallery.getGallery(galleryId);
    if (!g) return;
    const images = await gallery.listGalleryImages(galleryId);
    const result = await prewarmPublicThumbs({
      gallery: g,
      images,
      resolveImageFile: (img) => gallery.resolvePreferredImageFile(img) || gallery.resolveGalleryImageFile(img),
    });
    console.log(`[gallery-admin-api] prewarmed ${galleryId}: ${result.warmed}/${result.total} (skipped ${result.skipped}, failed ${result.failed})`);
  } catch (err) {
    console.warn(`[gallery-admin-api] prewarm failed for ${galleryId}:`, err?.message || err);
  }
}

// Editor-Thumbnails: server-seitig per sharp generiert und auf Disk gecached.
// Cache-Datei: tours/uploads/gallery-thumbs/<gallery_id>/<image_id>_<w>_<mtime>.jpg
const GALLERY_THUMB_CACHE_DIR = path.join(__dirname, '..', 'uploads', 'gallery-thumbs');
const ALLOWED_THUMB_WIDTHS = new Set([200, 400, 600]);
const galleryThumbInflight = new Map();

function parseThumbWidth(raw) {
  const w = Number.parseInt(String(raw || '400'), 10);
  return ALLOWED_THUMB_WIDTHS.has(w) ? w : 400;
}

async function ensureGalleryThumb(srcPath, galleryId, imageId, width) {
  let stat;
  try {
    stat = await fs.promises.stat(srcPath);
  } catch {
    return null;
  }
  const mtime = Math.floor(stat.mtimeMs);
  const cacheDir = path.join(GALLERY_THUMB_CACHE_DIR, String(galleryId));
  const cachePath = path.join(cacheDir, `${imageId}_${width}_${mtime}.jpg`);
  try {
    const cacheStat = await fs.promises.stat(cachePath);
    if (cacheStat.isFile() && cacheStat.size > 0) return cachePath;
  } catch { /* miss */ }

  if (galleryThumbInflight.has(cachePath)) {
    await galleryThumbInflight.get(cachePath);
    return cachePath;
  }
  const promise = (async () => {
    await fs.promises.mkdir(cacheDir, { recursive: true });
    // Vorhandene Varianten (anderer mtime) löschen, damit der Cache pro Image
    // nicht beliebig wächst.
    try {
      const entries = await fs.promises.readdir(cacheDir);
      const prefix = `${imageId}_${width}_`;
      for (const entry of entries) {
        if (entry.startsWith(prefix) && entry !== path.basename(cachePath)) {
          await fs.promises.unlink(path.join(cacheDir, entry)).catch(() => {});
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
  galleryThumbInflight.set(cachePath, promise);
  try {
    await promise;
  } finally {
    galleryThumbInflight.delete(cachePath);
  }
  return cachePath;
}

/**
 * Modul-Discriminator: alle Mount-Pfade (siehe platform/server.js) setzen
 * `req.galleryKind` auf 'listing' bzw. 'bildauswahl'. So teilt sich die
 * gleiche Router-Instanz zwischen Listing und Bildauswahl ohne Code-Klon.
 */
function pickKind(req) {
  return req.galleryKind === 'bildauswahl' ? 'bildauswahl' : 'listing';
}

// GET / — Liste aller Galerien
router.get('/', async (req, res) => {
  try {
    const { search, filter, sort } = req.query;
    const rows = await gallery.listGalleries({ search, filter, sort, kind: pickKind(req) });
    res.json({ ok: true, rows });
  } catch (e) {
    console.error('gallery list error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST / — Neue Galerie erstellen
router.post('/', async (req, res) => {
  try {
    const row = await gallery.createGallery({ ...req.body, kind: pickKind(req) });
    res.json({ ok: true, gallery: row });
  } catch (e) {
    console.error('gallery create error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /email-templates — E-Mail-Vorlagen (nur Module-relevante)
router.get('/email-templates', async (req, res) => {
  try {
    const rows = await gallery.listEmailTemplates({ kind: pickKind(req) });
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /:id/nas-context — Storage-Health + Bestellordner-Vorschläge
// Optional `?orderNo=<n>` Query liefert die Vorschläge für eine andere (noch nicht verknüpfte) Bestellung.
router.get('/:id/nas-context', async (req, res) => {
  try {
    const rawOrderNo = req.query.orderNo;
    let orderNoOverride = null;
    if (rawOrderNo != null && String(rawOrderNo).trim() !== '') {
      const parsed = Number(rawOrderNo);
      if (!Number.isFinite(parsed) || parsed < 1) {
        return res.status(400).json({ ok: false, error: 'Ungültige Bestellnummer' });
      }
      orderNoOverride = parsed;
    }
    const context = await gallery.getGalleryNasContext(req.params.id, { orderNoOverride });
    res.json({ ok: true, ...context });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /:id/nas-browse — erlaubte NAS-Roots durchsuchen
router.get('/:id/nas-browse', async (req, res) => {
  try {
    const rootKind = String(req.query.rootKind || '').trim();
    const relativePath = String(req.query.relativePath || '').trim();
    const browser = gallery.listNasDirectoryEntries(rootKind, relativePath);
    res.json({ ok: true, ...browser });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// PUT /email-templates/:tplId — Vorlage speichern
router.put('/email-templates/:tplId', async (req, res) => {
  try {
    const { subject, body } = req.body;
    const row = await gallery.saveEmailTemplate(req.params.tplId, subject, body);
    if (!row) return res.status(404).json({ ok: false, error: 'Vorlage nicht gefunden.' });
    res.json({ ok: true, template: row });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /:id — Galerie-Detail inkl. Bilder + Feedback.
// Doppelte Einträge (gleicher Basename als Websize + Fullsize) werden
// pro Bild auf die Websize-Variante reduziert. Fullsize-Bilder OHNE
// Websize-Pendant bleiben sichtbar, damit der Admin sie weiterhin
// sehen, sortieren und löschen kann (z. B. bei Teilmigrationen).
// Fullsize-Originale bleiben für den Kunden-Download (NAS-Zip) verfügbar.
router.get('/:id', async (req, res) => {
  try {
    const g = await gallery.getGallery(req.params.id);
    if (!g) return res.status(404).json({ ok: false, error: 'Galerie nicht gefunden.' });
    const all = await gallery.listGalleryImages(g.id);
    const images = gallery.dedupeGalleryRowsPreferWebsize(all);
    const feedback = await gallery.listGalleryFeedback(g.id);
    res.json({ ok: true, gallery: g, images, feedback });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PATCH /:id — Galerie-Metadaten aktualisieren
router.patch('/:id', async (req, res) => {
  try {
    const row = await gallery.updateGallery(req.params.id, req.body);
    if (!row) return res.status(404).json({ ok: false, error: 'Galerie nicht gefunden.' });
    res.json({ ok: true, gallery: row });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// DELETE /:id — Galerie loeschen
router.delete('/:id', async (req, res) => {
  try {
    await gallery.deleteGallery(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /:id/duplicate — Galerie duplizieren
router.post('/:id/duplicate', async (req, res) => {
  try {
    const row = await gallery.duplicateGallery(req.params.id);
    res.json({ ok: true, gallery: row });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /:id/images — Bild hinzufuegen
router.post('/:id/images', async (req, res) => {
  try {
    const img = await gallery.addGalleryImage(req.params.id, req.body);
    res.json({ ok: true, image: img });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PATCH /:id/images/:imgId — Bild aktualisieren
router.patch('/:id/images/:imgId', async (req, res) => {
  try {
    const img = await gallery.updateImage(req.params.imgId, req.body);
    if (!img) return res.status(404).json({ ok: false, error: 'Bild nicht gefunden.' });
    res.json({ ok: true, image: img });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /:id/images/:imgId/file — Admin-Vorschau fuer lokale NAS-Bilder.
// Bevorzugt die Websize-Variante (KB statt MB pro Thumbnail), damit der
// Editor mit vielen Bildern flüssig bleibt. Fullsize bleibt Fallback.
router.get('/:id/images/:imgId/file', async (req, res) => {
  try {
    const g = await gallery.getGallery(req.params.id);
    if (!g) return res.status(404).json({ ok: false, error: 'Galerie nicht gefunden.' });
    const images = await gallery.listGalleryImages(g.id);
    const img = images.find((row) => row.id === req.params.imgId);
    if (!img) return res.status(404).json({ ok: false, error: 'Bild nicht gefunden.' });
    if (img.source_type === 'nas_local') {
      const filePath = gallery.resolvePreferredImageFile(img) || gallery.resolveGalleryImageFile(img);
      if (!filePath) return res.status(404).json({ ok: false, error: 'Bildpfad nicht gefunden.' });
      return res.sendFile(filePath);
    }
    if (!img.remote_src) return res.status(404).json({ ok: false, error: 'Bild nicht gefunden.' });
    return res.redirect(img.remote_src);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /:id/images/:imgId/thumb?w=200|400|600 — kleines JPG-Thumbnail.
// Für nas_local wird per sharp ein Thumb erzeugt und auf Disk gecached;
// remote_url bleibt redirect (Cloud liefert ihre eigenen Bilder aus).
router.get('/:id/images/:imgId/thumb', async (req, res) => {
  try {
    const g = await gallery.getGallery(req.params.id);
    if (!g) return res.status(404).json({ ok: false, error: 'Galerie nicht gefunden.' });
    const images = await gallery.listGalleryImages(g.id);
    const img = images.find((row) => row.id === req.params.imgId);
    if (!img) return res.status(404).json({ ok: false, error: 'Bild nicht gefunden.' });
    if (img.source_type !== 'nas_local') {
      if (!img.remote_src) return res.status(404).json({ ok: false, error: 'Bild nicht gefunden.' });
      return res.redirect(img.remote_src);
    }
    const srcPath = gallery.resolvePreferredImageFile(img) || gallery.resolveGalleryImageFile(img);
    if (!srcPath) return res.status(404).json({ ok: false, error: 'Bildpfad nicht gefunden.' });
    const width = parseThumbWidth(req.query.w);
    const cachePath = await ensureGalleryThumb(srcPath, g.id, img.id, width);
    if (!cachePath) return res.status(404).json({ ok: false, error: 'Thumbnail konnte nicht erzeugt werden.' });
    res.set('Cache-Control', 'private, max-age=86400, immutable');
    res.type('jpg');
    return res.sendFile(cachePath);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /:id/floorplans/:index/thumb?w=200|400|600|1200 — JPG-Thumbnail Seite 1.
router.get('/:id/floorplans/:index/thumb', async (req, res) => {
  try {
    const g = await gallery.getGallery(req.params.id);
    if (!g) return res.status(404).json({ ok: false, error: 'Galerie nicht gefunden.' });
    const index = Number.parseInt(String(req.params.index || ''), 10);
    if (!Number.isFinite(index) || index < 0) {
      return res.status(400).json({ ok: false, error: 'Ungültiger Grundriss-Index.' });
    }
    const width = gallery.parseFloorPlanThumbWidth(req.query.w);
    const cachePath = await gallery.ensureFloorPlanThumbForGallery(g, index, width);
    res.set('Cache-Control', 'private, max-age=86400, immutable');
    res.type('jpg');
    return res.sendFile(cachePath);
  } catch (e) {
    if (e?.code === 'NOT_FOUND') return res.status(404).json({ ok: false, error: e.message });
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /:id/floorplans/:index/file — Admin-Vorschau fuer Grundriss-PDF
router.get('/:id/floorplans/:index/file', async (req, res) => {
  try {
    const g = await gallery.getGallery(req.params.id);
    if (!g) return res.status(404).json({ ok: false, error: 'Galerie nicht gefunden.' });
    const index = Number.parseInt(String(req.params.index || ''), 10);
    if (!Number.isFinite(index) || index < 0) {
      return res.status(400).json({ ok: false, error: 'Ungültiger Grundriss-Index.' });
    }
    const items = gallery.parseStoredFloorPlans(g.floor_plans_json);
    const item = items[index];
    if (!item) return res.status(404).json({ ok: false, error: 'Grundriss nicht gefunden.' });
    if (item.source_type === 'nas_local') {
      const filePath = gallery.resolveGalleryFloorPlanFile(g, index);
      if (!filePath) return res.status(404).json({ ok: false, error: 'Grundriss-Pfad nicht gefunden.' });
      return res.sendFile(filePath);
    }
    if (!item.url) return res.status(404).json({ ok: false, error: 'Grundriss nicht gefunden.' });
    return res.redirect(item.url);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// DELETE /:id/images/:imgId — Bild loeschen
router.delete('/:id/images/:imgId', async (req, res) => {
  try {
    await gallery.deleteImage(req.params.imgId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PUT /:id/images/order — Reihenfolge aendern
router.put('/:id/images/order', async (req, res) => {
  try {
    const { orderedIds } = req.body;
    await gallery.reorderImages(req.params.id, orderedIds);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /:id/import-share — Bilder aus Nextcloud-Freigabe importieren
router.post('/:id/import-share', async (req, res) => {
  try {
    const { urls } = req.body;
    if (!Array.isArray(urls)) return res.status(400).json({ ok: false, error: 'urls Array erwartet.' });
    const result = await gallery.importImagesFromShare(req.params.id, urls);
    /** Fire-and-forget: Thumbnails im Hintergrund pre-rendern. */
    void prewarmThumbsForGallery(req.params.id);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /:id/import-nas — Medien aus NAS-Ordner importieren
router.post('/:id/import-nas', async (req, res) => {
  try {
    const result = await gallery.importGalleryFromNas(req.params.id, req.body || {});
    /** Fire-and-forget: Thumbnails im Hintergrund pre-rendern. */
    void prewarmThumbsForGallery(req.params.id);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// POST /:id/prewarm-thumbs — manueller Trigger (z. B. nach Watermark-Toggle)
router.post('/:id/prewarm-thumbs', async (req, res) => {
  try {
    const g = await gallery.getGallery(req.params.id);
    if (!g) return res.status(404).json({ ok: false, error: 'Galerie nicht gefunden.' });
    const images = await gallery.listGalleryImages(req.params.id);
    /** Synchron warten — Aufrufer sieht die Stats fuer Debug. */
    const result = await prewarmPublicThumbs({
      gallery: g,
      images,
      resolveImageFile: (img) => gallery.resolvePreferredImageFile(img) || gallery.resolveGalleryImageFile(img),
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /:id/feedback — Office-Rueckfrage erstellen
router.post('/:id/feedback', async (req, res) => {
  try {
    const g = await gallery.getGallery(req.params.id);
    if (!g) return res.status(404).json({ ok: false, error: 'Galerie nicht gefunden.' });
    const fb = await gallery.submitFeedback({
      gallery_id: g.id,
      gallery_slug: g.slug,
      asset_type: req.body.asset_type,
      asset_key: req.body.asset_key,
      asset_label: req.body.asset_label,
      body: req.body.body,
      author: 'office',
    });
    res.json({ ok: true, feedback: fb });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PATCH /:id/feedback/:fbId — Feedback resolved/reopen
router.patch('/:id/feedback/:fbId', async (req, res) => {
  try {
    const { resolved } = req.body;
    const fb = await gallery.setFeedbackResolved(req.params.fbId, resolved);
    if (!fb) return res.status(404).json({ ok: false, error: 'Feedback nicht gefunden.' });
    res.json({ ok: true, feedback: fb });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// DELETE /:id/feedback/:fbId — Feedback loeschen
router.delete('/:id/feedback/:fbId', async (req, res) => {
  try {
    await gallery.deleteFeedback(req.params.fbId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /:id/send-email — E-Mail via Microsoft Graph senden
router.post('/:id/send-email', async (req, res) => {
  try {
    const { to, subject, htmlBody } = req.body;
    if (!to || !subject || !htmlBody) {
      return res.status(400).json({ ok: false, error: 'to, subject und htmlBody erforderlich.' });
    }
    const result = await sendMailDirect({ to, subject, htmlBody });
    if (!result.success) {
      return res.status(500).json({ ok: false, error: result.error || 'E-Mail konnte nicht gesendet werden.' });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /:id/record-sent — Versand-Status auf 'sent' setzen
router.post('/:id/record-sent', async (req, res) => {
  try {
    await gallery.recordEmailSent(req.params.id);
    const g = await gallery.getGallery(req.params.id);
    res.json({ ok: true, gallery: g });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
