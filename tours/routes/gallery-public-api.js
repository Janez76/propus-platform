/**
 * Oeffentliche JSON-API fuer Listing-Seiten (kein Auth).
 * Gemountet unter /api/listing in platform/server.js.
 */
const express = require('express');
const router = express.Router();
const gallery = require('../lib/gallery');

function normalizeMatterportSrc(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      if (u.hostname.includes('matterport') || u.hostname.includes('my.matterport')) {
        if (!u.searchParams.has('play')) u.searchParams.set('play', '1');
        return u.toString();
      }
      return trimmed;
    } catch { return trimmed; }
  }
  return `https://my.matterport.com/show/?m=${encodeURIComponent(trimmed)}&play=1`;
}

function parseFloorPlansJson(raw) {
  if (!raw || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter(x => x && typeof x === 'object' && typeof x.url === 'string')
      .map(x => ({ url: x.url, title: (x.title && String(x.title).trim()) || 'Grundriss' }));
  } catch { return []; }
}

// GET /:slug — Public Gallery Payload
router.get('/:slug', async (req, res) => {
  try {
    const g = await gallery.getGalleryBySlug(req.params.slug);
    if (!g) return res.status(404).json({ ok: false, error: 'Galerie nicht verfügbar.' });

    const imgs = await gallery.listGalleryImages(g.id);
    const enabled = imgs.filter(i => i.enabled);

    res.json({
      ok: true,
      id: g.id,
      title: g.title,
      address: g.address || null,
      client_name: g.client_name || null,
      updated_at: g.updated_at,
      cloud_share_url: g.cloud_share_url || null,
      matterport_src: normalizeMatterportSrc(g.matterport_input),
      video_url: (g.video_url || '').trim(),
      floor_plans: parseFloorPlansJson(g.floor_plans_json),
      images: enabled.map(i => ({
        id: i.id,
        category: i.category,
        sort_order: i.sort_order,
      })),
    });
  } catch (e) {
    console.error('public gallery error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /:slug/images/:imgId — Bild-URL redirect
router.get('/:slug/images/:imgId', async (req, res) => {
  try {
    const g = await gallery.getGalleryBySlug(req.params.slug);
    if (!g) return res.status(404).json({ ok: false, error: 'Galerie nicht verfügbar.' });

    const imgs = await gallery.listGalleryImages(g.id);
    const img = imgs.find(i => i.id === req.params.imgId);
    if (!img || !img.remote_src) return res.status(404).json({ ok: false, error: 'Bild nicht gefunden.' });

    res.redirect(img.remote_src);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /:slug/viewed — Client-Log: Galerie geoeffnet
router.post('/:slug/viewed', async (req, res) => {
  try {
    const g = await gallery.getGalleryBySlugAny(req.params.slug);
    if (!g) return res.status(404).json({ ok: false });
    await gallery.recordClientViewed(g.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /:slug/downloaded — Client-Log: Dateien heruntergeladen
router.post('/:slug/downloaded', async (req, res) => {
  try {
    const g = await gallery.getGalleryBySlugAny(req.params.slug);
    if (!g) return res.status(404).json({ ok: false });
    await gallery.recordClientFilesDownloaded(g.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /:slug/feedback — Kunden-Feedback absenden
router.post('/:slug/feedback', async (req, res) => {
  try {
    const g = await gallery.getGalleryBySlug(req.params.slug);
    if (!g) return res.status(404).json({ ok: false, error: 'Galerie nicht verfügbar.' });

    const { asset_type, asset_key, asset_label, body } = req.body;
    if (!asset_type || !asset_key || !body?.trim()) {
      return res.status(400).json({ ok: false, error: 'asset_type, asset_key und body sind erforderlich.' });
    }

    const fb = await gallery.submitFeedback({
      gallery_id: g.id,
      gallery_slug: g.slug,
      asset_type,
      asset_key,
      asset_label: asset_label || '',
      body: body.trim(),
      author: 'client',
    });
    res.json({ ok: true, feedback: fb });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /:slug/feedback — Feedback zu einem Asset
router.get('/:slug/feedback', async (req, res) => {
  try {
    const g = await gallery.getGalleryBySlugAny(req.params.slug);
    if (!g) return res.status(404).json({ ok: false, error: 'Galerie nicht gefunden.' });

    const { asset_type, asset_key } = req.query;
    let rows;
    if (asset_type && asset_key) {
      rows = await gallery.listFeedbackForAsset(g.id, asset_type, asset_key);
    } else {
      rows = await gallery.listGalleryFeedback(g.id);
    }
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
