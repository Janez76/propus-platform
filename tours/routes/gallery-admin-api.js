/**
 * JSON-Admin-API fuer das Listing/Galerie-Modul.
 * Gemountet unter /api/tours/admin/galleries (requireAdmin davor in platform/server.js).
 */
const express = require('express');
const router = express.Router();
const gallery = require('../lib/gallery');

// GET / — Liste aller Galerien
router.get('/', async (req, res) => {
  try {
    const { search, filter, sort } = req.query;
    const rows = await gallery.listGalleries({ search, filter, sort });
    res.json({ ok: true, rows });
  } catch (e) {
    console.error('gallery list error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST / — Neue Galerie erstellen
router.post('/', async (req, res) => {
  try {
    const row = await gallery.createGallery(req.body);
    res.json({ ok: true, gallery: row });
  } catch (e) {
    console.error('gallery create error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /email-templates — E-Mail-Vorlagen
router.get('/email-templates', async (_req, res) => {
  try {
    const rows = await gallery.listEmailTemplates();
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
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

// GET /:id — Galerie-Detail inkl. Bilder + Feedback
router.get('/:id', async (req, res) => {
  try {
    const g = await gallery.getGallery(req.params.id);
    if (!g) return res.status(404).json({ ok: false, error: 'Galerie nicht gefunden.' });
    const images = await gallery.listGalleryImages(g.id);
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
    const added = await gallery.importImagesFromShare(req.params.id, urls);
    res.json({ ok: true, added: added.length });
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
