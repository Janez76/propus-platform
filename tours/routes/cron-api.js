/**
 * Cron-API — interne Endpunkte für geplante Server-Jobs.
 *
 * Auth: X-Cron-Secret Header muss mit CRON_SECRET aus .env übereinstimmen.
 * Alle Endpunkte sind nur intern erreichbar (kein Session-Cookie nötig).
 *
 * Endpunkte:
 *   POST /sync-matterport-state   — matterport_state aller Touren aktualisieren
 *   POST /process-pending-deletions — fällige Löschvormerkungen ausführen
 *   POST /sync-posteingang        — Posteingang (Graph Delta)
 *   POST /mark-overdue-invoices   — sent-Rechnungen mit abgelaufenem due_at auf overdue setzen
 */

'use strict';

const express = require('express');
const router = express.Router();
const phase3 = require('../lib/admin-phase3');
const posteingangSync = require('../lib/posteingang-sync');
const posteingangTriggers = require('../lib/posteingang-triggers');
const { getGraphConfig } = require('../lib/microsoft-graph');

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
// Läuft alle 5 Minuten via Cron auf dem VPS.
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

// POST /api/tours/cron/sync-posteingang
router.post('/sync-posteingang', requireCron, async (req, res) => {
  const start = Date.now();
  try {
    const mailbox = String(req.body?.mailbox || getGraphConfig().mailboxUpn || '').trim();
    let r = await posteingangSync.syncPosteingangFull(mailbox);
    if (!r.inbox?.ok) {
      const boot = await posteingangSync.bootstrapFromInboxList(mailbox, 100);
      r = { ...r, inboxFallback: boot, processed: (r.processed || 0) + (boot.processed || 0) };
    }
    if (!r.sentitems?.ok) {
      const sentPull = await posteingangSync.pullRecentSent(mailbox, 80);
      r = { ...r, sentFallback: sentPull, processed: (r.processed || 0) + (sentPull.processed || 0) };
    }
    const anyOk =
      Boolean(r.inbox?.ok) ||
      Boolean(r.sentitems?.ok) ||
      Boolean(r.inboxFallback?.ok) ||
      Boolean(r.sentFallback?.ok);
    const elapsed = Date.now() - start;
    if (!anyOk) {
      console.warn(`[cron] sync-posteingang FEHLER (${elapsed}ms):`, r.error);
      return res.status(500).json({ ok: false, ...r, elapsed });
    }
    console.log(`[cron] sync-posteingang OK — mailbox=${mailbox} (${elapsed}ms)`);
    return res.json({ ok: true, ...r, elapsed });
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error('[cron] sync-posteingang Exception:', err.message);
    return res.status(500).json({ ok: false, error: err.message, elapsed });
  }
});

// POST /api/tours/cron/process-pending-deletions
// Führt fällige Löschvormerkungen aus: zuerst Matterport, dann Tour-Datensatz.
router.post('/process-pending-deletions', requireCron, async (req, res) => {
  const start = Date.now();
  try {
    const cleanupDashboard = require('../lib/cleanup-dashboard');
    const result = await cleanupDashboard.processPendingDeletions({ actorRef: 'cron' });
    const elapsed = Date.now() - start;
    if (!result.ok) {
      console.warn(`[cron] process-pending-deletions FEHLER (${elapsed}ms):`, JSON.stringify(result.failed));
      return res.status(500).json({ ok: false, ...result, elapsed });
    }
    console.log(`[cron] process-pending-deletions OK — ${result.processedCount} Löschungen ausgeführt (${elapsed}ms)`);
    return res.json({ ok: true, ...result, elapsed });
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error('[cron] process-pending-deletions Exception:', err.message);
    return res.status(500).json({ ok: false, error: err.message, elapsed });
  }
});

// POST /api/tours/cron/posteingang-triggers
// Auto-Trigger Engine: ablaufende Touren, überfällige Rechnungen, Neukunde-Tag
router.post('/posteingang-triggers', requireCron, async (req, res) => {
  const start = Date.now();
  try {
    const result = await posteingangTriggers.runAllTriggers();
    const elapsed = Date.now() - start;
    console.log(`[cron] posteingang-triggers OK — tasks=${result.tasksCreated}, tagged=${result.tagged} (${elapsed}ms)`);
    return res.json({ ok: true, ...result, elapsed });
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error('[cron] posteingang-triggers Exception:', err.message);
    return res.status(500).json({ ok: false, error: err.message, elapsed });
  }
});

// POST /api/tours/cron/mark-overdue-invoices
// Setzt alle sent-Rechnungen mit abgelaufenem due_at auf invoice_status='overdue'
router.post('/mark-overdue-invoices', requireCron, async (req, res) => {
  const start = Date.now();
  try {
    const result = await phase3.markOverdueInvoices();
    const elapsed = Date.now() - start;
    console.log(`[cron] mark-overdue-invoices OK — updated=${result.updated} (${elapsed}ms)`);
    return res.json({ ok: true, ...result, elapsed });
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error('[cron] mark-overdue-invoices Exception:', err.message);
    return res.status(500).json({ ok: false, error: err.message, elapsed });
  }
});

module.exports = router;
