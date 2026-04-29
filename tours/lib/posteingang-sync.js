/**
 * Microsoft Graph Delta-Sync → Posteingang-Tabellen.
 */
'use strict';

const { graphRequest, getGraphConfig, stripHtml } = require('./microsoft-graph');
const customerLookup = require('./customer-lookup');
const posteingangMatch = require('./posteingang-match');
const store = require('./posteingang-store');

const SELECT_FIELDS = [
  'id',
  'subject',
  'conversationId',
  'from',
  'toRecipients',
  'ccRecipients',
  'bccRecipients',
  'body',
  'bodyPreview',
  'internetMessageId',
  'receivedDateTime',
  'sentDateTime',
  'isRead',
].join(',');

function bodiesFromGraph(message) {
  const raw = message?.body?.content || '';
  const ct = String(message?.body?.contentType || '').toLowerCase();
  if (ct === 'html') {
    return { bodyHtml: raw, bodyText: stripHtml(raw) };
  }
  return { bodyHtml: null, bodyText: String(raw || '').trim() };
}

function collectRecipients(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((r) => (r?.emailAddress?.address || '').trim().toLowerCase())
    .filter(Boolean);
}

function collectNamesEmails(list) {
  if (!Array.isArray(list)) return { emails: [], names: [] };
  const emails = [];
  const names = [];
  for (const r of list) {
    const addr = (r?.emailAddress?.address || '').trim().toLowerCase();
    if (!addr) continue;
    emails.push(addr);
    names.push((r?.emailAddress?.name || '').trim() || null);
  }
  return { emails, names };
}

function mailboxLower(mailbox) {
  return String(mailbox || '').trim().toLowerCase();
}

async function resolveCustomerForMessage(mailboxUpn, message) {
  const mb = mailboxLower(mailboxUpn);
  const from = (message?.from?.emailAddress?.address || '').trim().toLowerCase();
  const fromIsOurs = from && from === mb;

  if (!fromIsOurs && from) {
    const c = await customerLookup.getCustomerByEmail(from);
    if (c?.id) return c.id;
  }

  const toList = collectRecipients(message?.toRecipients);
  for (const em of toList) {
    if (em === mb) continue;
    const c = await customerLookup.getCustomerByEmail(em);
    if (c?.id) return c.id;
  }
  const ccList = collectRecipients(message?.ccRecipients);
  for (const em of ccList) {
    if (em === mb) continue;
    const c = await customerLookup.getCustomerByEmail(em);
    if (c?.id) return c.id;
  }

  const tryDomain = async (em) => {
    if (!em || em === mb) return null;
    const id = await posteingangMatch.findCustomerIdByEmailDomain(em);
    return id || null;
  };

  if (!fromIsOurs && from) {
    const byDom = await tryDomain(from);
    if (byDom) return byDom;
  }
  for (const em of toList) {
    if (em === mb) continue;
    // eslint-disable-next-line no-await-in-loop
    const byDom = await tryDomain(em);
    if (byDom) return byDom;
  }
  for (const em of ccList) {
    if (em === mb) continue;
    // eslint-disable-next-line no-await-in-loop
    const byDom = await tryDomain(em);
    if (byDom) return byDom;
  }

  return null;
}

function inferDirection(mailboxUpn, message) {
  const mb = mailboxLower(mailboxUpn);
  const from = (message?.from?.emailAddress?.address || '').trim().toLowerCase();
  if (from && from === mb) return 'outbound';
  return 'inbound';
}

function pickTimestamp(message) {
  const sent = message?.sentDateTime;
  const recv = message?.receivedDateTime;
  const iso = sent || recv;
  return iso ? new Date(iso) : new Date();
}

/**
 * Ingestiert eine Graph-Nachricht in die DB (Idempotent per graph_message_id).
 */
async function ingestGraphMessage(mailboxUpn, message) {
  const graphMessageId = message?.id;
  if (!graphMessageId) return { skipped: true, reason: 'no_id' };

  const exists = await store.messageExistsByGraphId(graphMessageId);
  if (exists) return { skipped: true, reason: 'duplicate' };

  let conv = await store.getConversationByGraphConversationId(message.conversationId || null);

  const customerId = await resolveCustomerForMessage(mailboxUpn, message);
  const direction = inferDirection(mailboxUpn, message);
  const { bodyHtml, bodyText } = bodiesFromGraph(message);
  const fromAddr = (message?.from?.emailAddress?.address || '').trim().toLowerCase() || null;
  const fromName = (message?.from?.emailAddress?.name || '').trim() || null;
  const to = collectNamesEmails(message?.toRecipients);
  const cc = collectNamesEmails(message?.ccRecipients);
  const bcc = collectNamesEmails(message?.bccRecipients);
  const subject = message?.subject || '';
  const ts = pickTimestamp(message);

  if (!conv) {
    conv = await store.createConversation({
      subject: subject || '(Kein Betreff)',
      channel: 'email',
      status: 'open',
      priority: 'medium',
      customerId,
      graphConversationId: message.conversationId || null,
      graphMailboxAddress: mailboxLower(mailboxUpn),
      createdByEmail: 'graph-sync',
    });
  } else if (customerId && !conv.customer_id) {
    await store.updateConversationCustomer(conv.id, customerId);
    conv.customer_id = customerId;
  }

  await store.insertMessage({
    conversationId: conv.id,
    direction,
    fromName: fromName,
    fromEmail: fromAddr,
    toEmails: to.emails,
    ccEmails: cc.emails,
    bccEmails: bcc.emails,
    subject,
    bodyHtml,
    bodyText: bodyText || (message?.bodyPreview || '').trim() || '',
    graphMessageId,
    graphInternetMessageId: message.internetMessageId || null,
    inReplyToMessageId: null,
    authorEmail: direction === 'outbound' ? mailboxLower(mailboxUpn) : null,
    sentAt: ts,
    receivedAt: message.receivedDateTime ? new Date(message.receivedDateTime) : null,
  });

  await store.updateConversationTimestamps(conv.id, ts);
  return { skipped: false, conversationId: conv.id };
}

function initialFolderDeltaUrl(mailboxUpn, graphFolderName) {
  const enc = encodeURIComponent(mailboxUpn);
  const folder = encodeURIComponent(graphFolderName);
  const sel = encodeURIComponent(SELECT_FIELDS);
  return `https://graph.microsoft.com/v1.0/users/${enc}/mailFolders/${folder}/messages/delta?$select=${sel}`;
}

/**
 * Delta-Sync für einen Ordner (inbox, sentitems, …). Pro Ordner eigener Token in posteingang_graph_sync_state.
 */
async function runFolderDeltaSync(mailboxUpn, folderScope, graphFolderName) {
  const mailbox = mailboxLower(mailboxUpn) || mailboxLower(getGraphConfig().mailboxUpn);
  const state = await store.getGraphSyncState(mailbox, folderScope);
  let url = state?.delta_token || initialFolderDeltaUrl(mailbox, graphFolderName);

  let processed = 0;
  let deltaLink = null;

  try {
    while (url) {
      const { data, error } = await graphRequest(url, { method: 'GET' });
      if (error) {
        await store.recordSyncError(mailbox, folderScope, error);
        return { ok: false, error, processed, mailbox, folder: folderScope };
      }

      const items = Array.isArray(data?.value) ? data.value : [];
      for (const msg of items) {
        if (msg?.['@removed']?.reason) continue;
        const r = await ingestGraphMessage(mailbox, msg);
        if (!r.skipped) processed += 1;
      }

      if (data?.['@odata.nextLink']) {
        url = data['@odata.nextLink'];
      } else {
        deltaLink = data?.['@odata.deltaLink'] || null;
        url = null;
      }
    }

    if (deltaLink) {
      await store.saveGraphDeltaToken(mailbox, folderScope, deltaLink);
    } else if (!state?.delta_token) {
      await store.recordSyncError(mailbox, folderScope, 'Kein deltaLink von Graph erhalten');
    }

    return { ok: true, processed, mailbox, folder: folderScope };
  } catch (err) {
    await store.recordSyncError(mailbox, folderScope, err.message);
    return { ok: false, error: err.message, processed, mailbox, folder: folderScope };
  }
}

/** Nur Posteingang (Inbox). */
async function syncMailboxDelta(mailboxUpn) {
  return runFolderDeltaSync(mailboxUpn, 'inbox', 'inbox');
}

/** Nur Ordner „Gesendet“. */
async function syncSentItemsDelta(mailboxUpn) {
  return runFolderDeltaSync(mailboxUpn, 'sentitems', 'sentitems');
}

/**
 * Inbox + Gesendet nacheinander (empfohlen für Cron und manuellen Pull).
 */
async function syncPosteingangFull(mailboxUpn) {
  const inbox = await runFolderDeltaSync(mailboxUpn, 'inbox', 'inbox');
  const sent = await runFolderDeltaSync(mailboxUpn, 'sentitems', 'sentitems');
  const ok = inbox.ok && sent.ok;
  const processed = (inbox.processed || 0) + (sent.processed || 0);
  return {
    ok,
    mailbox: inbox.mailbox || sent.mailbox,
    processed,
    inbox,
    sentitems: sent,
    error: !inbox.ok ? inbox.error : !sent.ok ? sent.error : undefined,
  };
}

/**
 * Fallback: letzte N Nachrichten holen (ohne Delta), für erste Befüllung / wenn Delta leer.
 */
async function bootstrapFromInboxList(mailboxUpn, top = 80) {
  const { fetchMailboxMessages } = require('./microsoft-graph');
  const mailbox = mailboxLower(mailboxUpn) || mailboxLower(getGraphConfig().mailboxUpn);
  const { messages, error } = await fetchMailboxMessages({
    mailboxUpn: mailbox,
    folder: 'inbox',
    top,
    sinceDate: null,
  });
  if (error) return { ok: false, error, processed: 0 };
  let n = 0;
  for (const m of messages) {
    const raw = m.raw || m;
    const r = await ingestGraphMessage(mailbox, raw);
    if (!r.skipped) n += 1;
  }
  return { ok: true, processed: n, mailbox };
}

/**
 * Kurz Gesendet-Ordner einlesen (nach Antworten, damit Graph-IDs ankommen).
 */
async function pullRecentSent(mailboxUpn, top = 25) {
  const { fetchMailboxMessages } = require('./microsoft-graph');
  const mailbox = mailboxLower(mailboxUpn) || mailboxLower(getGraphConfig().mailboxUpn);
  const { messages, error } = await fetchMailboxMessages({
    mailboxUpn: mailbox,
    folder: 'sentitems',
    top,
    sinceDate: null,
  });
  if (error) return { ok: false, error, processed: 0 };
  let n = 0;
  for (const m of messages) {
    const raw = m.raw || m;
    const r = await ingestGraphMessage(mailbox, raw);
    if (!r.skipped) n += 1;
  }
  return { ok: true, processed: n, mailbox };
}

module.exports = {
  syncMailboxDelta,
  syncSentItemsDelta,
  syncPosteingangFull,
  runFolderDeltaSync,
  bootstrapFromInboxList,
  ingestGraphMessage,
  pullRecentSent,
};
