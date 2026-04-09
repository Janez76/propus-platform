/**
 * Cron-API — interne Endpunkte für geplante Server-Jobs.
 *
 * Auth: X-Cron-Secret Header muss mit CRON_SECRET aus .env übereinstimmen.
 * Alle Endpunkte sind nur intern erreichbar (kein Session-Cookie nötig).
 *
 * Endpunkte:
 *   POST /sync-matterport-state   — matterport_state aller Touren aktualisieren
 */

'use strict';

const express = require('express');
const router = express.Router();
const phase3 = require('../lib/admin-phase3');

function requireCron(req, res, next) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (!secret) {
    console.warn('[cron-api] CRON_SECRET nicht gesetzt — Zugriff verweigert');
    return res.status(403).json({ ok: false, error: 'CRON_SECRET nicht konfiguriert' });
  }
  const provided = String(req.headers['x-cron-secret'] || '').trim();
  if (!provided || provided !== secret) {
    return res.status(403).json({ ok: false, error: 'Ungültiges Cron-Secret' });
  }
  return next();
}

// POST /api/tours/cron/sync-matterport-state
// Holt alle Matterport-Models via listModels() und schreibt matterport_state in DB.
// Läuft alle 30 Minuten via Cron auf dem VPS.
router.post('/sync-matterport-state', requireCron, async (req, res) => {
  const start = Date.now();
  try {
    const result = await phase3.postLinkMatterportSyncStatus();
    const elapsed = Date.now() - start;
    if (!result.ok) {
      console.warn(`[cron] sync-matterport-state FEHLER (${elapsed}ms):`, result.error);
      return res.status(500).json({ ok: false, error: result.error, elapsed });
    }
    console.log(`[cron] sync-matterport-state OK — ${result.updated} Touren aktualisiert (${elapsed}ms)`);
    return res.json({ ok: true, updated: result.updated, elapsed });
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error('[cron] sync-matterport-state Exception:', err.message);
    return res.status(500).json({ ok: false, error: err.message, elapsed });
  }
});

module.exports = router;
