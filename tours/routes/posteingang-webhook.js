/**
 * Microsoft Graph Webhook Endpoint für Echtzeit-Mailbenachrichtigungen.
 *
 * Subscription-Einrichtung erfolgt manuell oder via Admin-API;
 * dieser Endpoint empfängt nur die Notifications.
 *
 * POST /api/tours/posteingang/webhook
 *   - validationToken in Query → Validierung, Token zurückgeben
 *   - Body mit value[] → Change-Notifications verarbeiten
 */
'use strict';

const express = require('express');
const router = express.Router();

const WEBHOOK_SECRET = process.env.GRAPH_WEBHOOK_SECRET || '';

function verifyClientState(notification) {
  if (!WEBHOOK_SECRET) return true;
  return notification.clientState === WEBHOOK_SECRET;
}

// Graph sendet validation bei Subscription-Erstellung
router.post('/', express.text({ type: '*/*' }), async (req, res) => {
  const validationToken = req.query.validationToken;
  if (validationToken) {
    console.log('[posteingang-webhook] Validation request received');
    res.set('Content-Type', 'text/plain');
    return res.status(200).send(validationToken);
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }

  const notifications = body?.value || [];
  if (!Array.isArray(notifications) || notifications.length === 0) {
    return res.status(202).json({ ok: true, processed: 0 });
  }

  console.log(`[posteingang-webhook] Received ${notifications.length} notification(s)`);

  let processed = 0;
  for (const n of notifications) {
    if (!verifyClientState(n)) {
      console.warn('[posteingang-webhook] Invalid clientState, skipping');
      continue;
    }

    if (n.changeType === 'created' && n.resource?.includes('/messages/')) {
      processed += 1;
    }
  }

  if (processed > 0) {
    setImmediate(async () => {
      try {
        const sync = require('../lib/posteingang-sync');
        const { getGraphConfig } = require('../lib/microsoft-graph');
        const cfg = getGraphConfig();
        if (!cfg) return;
        await sync.syncPosteingangFull(cfg.mailbox);
        console.log('[posteingang-webhook] Background sync triggered');
      } catch (err) {
        console.error('[posteingang-webhook] Background sync error:', err.message);
      }
    });
  }

  return res.status(202).json({ ok: true, processed });
});

// GET für Health-Check
router.get('/', (req, res) => {
  res.json({ status: 'webhook_endpoint_active' });
});

module.exports = router;
