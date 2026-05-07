/**
 * Microsoft Graph Subscription Lifecycle für Posteingang-Webhooks.
 *
 * Idempotent: ensureSubscriptions() erstellt oder erneuert pro Mailbox eine
 * Subscription auf inbox/messages. Notifications gehen an
 * GRAPH_NOTIFICATION_URL (Default: https://api-booking.propus.ch/api/tours/posteingang/webhook).
 * Validierung läuft via clientState=GRAPH_WEBHOOK_SECRET; Endpoint:
 * tours/routes/posteingang-webhook.js.
 *
 * Microsoft-Limits: messages-Subscriptions max 4230 Minuten Lebensdauer.
 * Wir setzen 3600 Minuten (60h) und renewen bei <24h Restlaufzeit, also läuft
 * ein täglicher Cron-Hit ohne Lücken.
 */
'use strict';

const { graphRequest, getGraphConfig } = require('./microsoft-graph');

const SUBSCRIPTIONS_URL = 'https://graph.microsoft.com/v1.0/subscriptions';
const SUBSCRIPTION_MINUTES = 3600;
const RENEW_BEFORE_MINUTES = 24 * 60;

function notificationUrl() {
  return (
    process.env.GRAPH_NOTIFICATION_URL ||
    'https://api-booking.propus.ch/api/tours/posteingang/webhook'
  );
}

function expirationFromNow(minutes = SUBSCRIPTION_MINUTES) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function resourcePath(mailboxUpn) {
  return `users/${mailboxUpn}/mailFolders('inbox')/messages`;
}

async function listSubscriptions() {
  const { data, error } = await graphRequest(SUBSCRIPTIONS_URL, { method: 'GET' });
  if (error) return { items: [], error };
  return { items: Array.isArray(data?.value) ? data.value : [], error: null };
}

async function createSubscription(mailboxUpn, clientState) {
  const body = {
    changeType: 'created',
    notificationUrl: notificationUrl(),
    resource: resourcePath(mailboxUpn),
    expirationDateTime: expirationFromNow(),
    clientState,
  };
  const { data, error } = await graphRequest(SUBSCRIPTIONS_URL, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return { subscription: data, error };
}

async function renewSubscription(id) {
  const url = `${SUBSCRIPTIONS_URL}/${id}`;
  const { data, error } = await graphRequest(url, {
    method: 'PATCH',
    body: JSON.stringify({ expirationDateTime: expirationFromNow() }),
  });
  return { subscription: data, error };
}

async function deleteSubscription(id) {
  const url = `${SUBSCRIPTIONS_URL}/${id}`;
  const { error } = await graphRequest(url, { method: 'DELETE' });
  return { error };
}

async function ensureSubscriptions() {
  const cfg = getGraphConfig();
  const mailboxes = Array.isArray(cfg.mailboxUpns) && cfg.mailboxUpns.length > 0
    ? cfg.mailboxUpns
    : [cfg.mailboxUpn].filter(Boolean);

  if (mailboxes.length === 0) {
    return { ok: false, error: 'Keine Mailbox in M365_MAILBOX_UPNS/M365_MAILBOX_UPN konfiguriert' };
  }

  const clientState = String(process.env.GRAPH_WEBHOOK_SECRET || '').trim();
  if (!clientState) {
    return { ok: false, error: 'GRAPH_WEBHOOK_SECRET nicht gesetzt' };
  }

  const ourUrl = notificationUrl().toLowerCase();
  const { items, error: listErr } = await listSubscriptions();
  if (listErr) return { ok: false, error: `Listing fehlgeschlagen: ${listErr}` };

  const renewThreshold = new Date(Date.now() + RENEW_BEFORE_MINUTES * 60 * 1000);
  const results = [];

  for (const mailbox of mailboxes) {
    const mbxLc = mailbox.toLowerCase();
    const existing = items.find((sub) => {
      const subUrl = String(sub.notificationUrl || '').toLowerCase();
      const subRes = String(sub.resource || '').toLowerCase();
      return subUrl === ourUrl && subRes.includes(mbxLc);
    });

    if (!existing) {
      const { subscription, error } = await createSubscription(mailbox, clientState);
      results.push({
        mailbox,
        action: 'created',
        ok: !error,
        id: subscription?.id || null,
        expiresAt: subscription?.expirationDateTime || null,
        error,
      });
      continue;
    }

    const expiresAt = new Date(existing.expirationDateTime || 0);
    if (expiresAt > renewThreshold) {
      results.push({
        mailbox,
        action: 'kept',
        ok: true,
        id: existing.id,
        expiresAt: existing.expirationDateTime,
      });
      continue;
    }

    const { subscription, error } = await renewSubscription(existing.id);
    results.push({
      mailbox,
      action: 'renewed',
      ok: !error,
      id: existing.id,
      expiresAt: subscription?.expirationDateTime || existing.expirationDateTime,
      error,
    });
  }

  const anyFailed = results.some((r) => !r.ok);
  return { ok: !anyFailed, results };
}

module.exports = {
  listSubscriptions,
  createSubscription,
  renewSubscription,
  deleteSubscription,
  ensureSubscriptions,
  notificationUrl,
};
