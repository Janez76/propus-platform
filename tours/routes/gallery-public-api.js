/**
 * Oeffentliche JSON-API fuer Listing-Seiten (kein Auth).
 * Gemountet unter /api/listing in platform/server.js.
 */
const express = require('express');
const router = express.Router();
const archiver = require('archiver');
const gallery = require('../lib/gallery');
const { pool } = require('../lib/db');

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
  const items = gallery.parseStoredFloorPlans(raw);
  return items.map((item, index) => ({
    url: item.source_type === 'nas_local'
      ? `/api/listing/__SLUG__/floorplans/${index}`
      : (item.url || ''),
    title: item.title || 'Grundriss',
  }));
}

// GET /:slug — Public Gallery Payload
router.get('/:slug', async (req, res) => {
  try {
    const g = await gallery.getGalleryBySlug(req.params.slug);
    if (!g) return res.status(404).json({ ok: false, error: 'Galerie nicht verfügbar.' });

    const imgs = await gallery.listGalleryImages(g.id);
    const enabled = imgs.filter(i => i.enabled);
    // Fullsize-Duplikate ausblenden, wenn websize-Variante desselben Basenames existiert
    const deduped = gallery.dedupeGalleryRowsPreferWebsize(enabled);

    let mediaSummary = null;
    try {
      mediaSummary = gallery.getGalleryMediaSummary(g);
    } catch { /* optional — Public-Payload soll nicht scheitern */ }

    const hasDownload = ['order_folder', 'nas_browser'].includes(String(g.storage_source_type || ''));

    res.json({
      ok: true,
      id: g.id,
      title: g.title,
      address: g.address || null,
      client_name: g.client_name || null,
      updated_at: g.updated_at,
      cloud_share_url: g.cloud_share_url || null,
      download_all_url: hasDownload
        ? `/api/listing/${encodeURIComponent(g.slug)}/download-all`
        : null,
      matterport_src: normalizeMatterportSrc(g.matterport_input),
      video_url: g.video_source_type === 'nas_local'
        ? `/api/listing/${encodeURIComponent(g.slug)}/video`
        : (g.video_url || '').trim(),
      floor_plans: parseFloorPlansJson(g.floor_plans_json).map((item) => ({
        ...item,
        url: item.url.replace('__SLUG__', encodeURIComponent(g.slug)),
      })),
      images: deduped.map(i => ({
        id: i.id,
        category: i.category,
        sort_order: i.sort_order,
      })),
      media_summary: mediaSummary,
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
    if (!img) return res.status(404).json({ ok: false, error: 'Bild nicht gefunden.' });
    if (img.source_type === 'nas_local') {
      // Websize-Variante bevorzugen, falls neben Fullsize verfügbar
      const filePath = gallery.resolvePreferredImageFile(img) || gallery.resolveGalleryImageFile(img);
      if (!filePath) return res.status(404).json({ ok: false, error: 'Bild nicht gefunden.' });
      return res.sendFile(filePath);
    }
    if (!img.remote_src) return res.status(404).json({ ok: false, error: 'Bild nicht gefunden.' });
    res.redirect(img.remote_src);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /:slug/video — Video aus NAS oder gespeicherter URL
router.get('/:slug/video', async (req, res) => {
  try {
    const g = await gallery.getGalleryBySlug(req.params.slug);
    if (!g) return res.status(404).json({ ok: false, error: 'Galerie nicht verfügbar.' });
    const filePath = gallery.resolveGalleryVideoFile(g);
    if (!filePath) return res.status(404).json({ ok: false, error: 'Video nicht gefunden.' });
    return res.sendFile(filePath);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /:slug/floorplans/:index — Grundriss-Datei ausliefern
router.get('/:slug/floorplans/:index', async (req, res) => {
  try {
    const g = await gallery.getGalleryBySlug(req.params.slug);
    if (!g) return res.status(404).json({ ok: false, error: 'Galerie nicht verfügbar.' });
    const index = Number.parseInt(String(req.params.index || ''), 10);
    if (!Number.isFinite(index) || index < 0) {
      return res.status(400).json({ ok: false, error: 'Ungültiger Grundriss-Index.' });
    }
    const items = gallery.parseStoredFloorPlans(g.floor_plans_json);
    const item = items[index];
    if (!item) return res.status(404).json({ ok: false, error: 'Grundriss nicht gefunden.' });
    if (item.source_type === 'nas_local') {
      const filePath = gallery.resolveGalleryFloorPlanFile(g, index);
      if (!filePath) return res.status(404).json({ ok: false, error: 'Grundriss nicht gefunden.' });
      return res.sendFile(filePath);
    }
    if (!item.url) return res.status(404).json({ ok: false, error: 'Grundriss nicht gefunden.' });
    return res.redirect(item.url);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /:slug/download-all — ZIP aus NAS-Quelle erzeugen
// Optional: ?variant=websize|fullsize|all (Default: all)
router.get('/:slug/download-all', async (req, res) => {
  try {
    const g = await gallery.getGalleryBySlug(req.params.slug);
    if (!g) return res.status(404).json({ ok: false, error: 'Galerie nicht verfügbar.' });
    const rawVariant = String(req.query.variant || 'all').trim().toLowerCase();
    const variant = ['websize', 'fullsize', 'all'].includes(rawVariant) ? rawVariant : 'all';
    const source = gallery.getGalleryDownloadSource(g, variant);
    if (!source) return res.status(404).json({ ok: false, error: 'Kein NAS-Download für diese Galerie verfügbar.' });

    const filenameSuffix = variant === 'all' ? '' : `-${variant}`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(g.slug)}${filenameSuffix}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (error) => {
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: error.message });
      } else {
        res.destroy(error);
      }
    });
    archive.pipe(res);
    archive.directory(source.absolutePath, false);
    void gallery.recordClientFilesDownloaded(g.id).catch(() => {});
    await archive.finalize();
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

    const trimmedBody = body.trim();
    const fb = await gallery.submitFeedback({
      gallery_id: g.id,
      gallery_slug: g.slug,
      asset_type,
      asset_key,
      asset_label: asset_label || '',
      body: trimmedBody,
      author: 'client',
    });

    // Parallel als Ticket im Admin-Postfach hinterlegen
    try {
      const assetLabelText = (asset_label && String(asset_label).trim()) || (asset_type === 'floor_plan' ? 'Grundriss' : 'Bild');
      const subject = `Galerie-Anmerkung: ${assetLabelText}`.slice(0, 240);
      const titleLine = g.title ? `Galerie: ${g.title}` : `Galerie-Slug: ${g.slug}`;
      const descLines = [
        titleLine,
        `Asset: ${assetLabelText} (${asset_type || 'image'})`,
        '',
        trimmedBody,
      ];
      await pool.query(
        `INSERT INTO tour_manager.tickets
           (module, reference_id, reference_type, category, subject, description, priority, created_by, created_by_role)
         VALUES ('tours', $1, 'gallery', 'gallery_anmerkung', $2, $3, 'normal', 'client', 'client')`,
        [String(g.id), subject, descLines.join('\n')],
      );
    } catch (ticketErr) {
      console.warn('gallery feedback ticket insert failed:', ticketErr?.message || ticketErr);
    }

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
