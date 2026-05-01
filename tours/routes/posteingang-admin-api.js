/**
 * Posteingang JSON-API — unter /api/tours/admin/posteingang gemountet.
 */
'use strict';

const express = require('express');
const {
  createReplyDraft,
  sendDraftMessage,
  getGraphConfig,
  stripHtml,
  deleteMailboxMessage,
} = require('../lib/microsoft-graph');
const store = require('../lib/posteingang-store');
const sync = require('../lib/posteingang-sync');

const router = express.Router();

function adminEmail(req) {
  return String(req.session?.admin?.email || req.session?.admin?.username || '').trim() || 'admin';
}

/** Letzte eingehende Graph-Nachricht (Ziel für Antworten). */
async function findReplyTargetGraphMessageId(conversationId) {
  const { pool } = require('../lib/db');
  const { rows } = await pool.query(
    `SELECT graph_message_id FROM tour_manager.posteingang_messages
     WHERE conversation_id = $1 AND direction = 'inbound' AND graph_message_id IS NOT NULL
     ORDER BY sent_at DESC NULLS LAST, id DESC LIMIT 1`,
    [conversationId],
  );
  return rows[0]?.graph_message_id || null;
}

// GET /conversations
router.get('/conversations', async (req, res) => {
  try {
    const assignedAdminUserId = await store.getAdminUserIdByEmail(adminEmail(req));
    const { conversations, total } = await store.listConversations({
      status: req.query.status,
      assigned: req.query.assigned,
      assignedAdminUserId,
      customerId: req.query.customer_id ? parseInt(req.query.customer_id, 10) : null,
      search: req.query.search,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json({ ok: true, conversations, total });
  } catch (err) {
    console.error('[posteingang] GET /conversations', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /conversations/:id
router.get('/conversations/:id', async (req, res) => {
  try {
    const detail = await store.getConversationDetail(req.params.id);
    if (!detail) return res.status(404).json({ ok: false, error: 'Konversation nicht gefunden' });
    return res.json({ ok: true, ...detail });
  } catch (err) {
    console.error('[posteingang] GET /conversations/:id', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /conversations
router.post('/conversations', async (req, res) => {
  try {
    const row = await store.createInternalConversation(req.body || {}, adminEmail(req));
    const detail = await store.getConversationDetail(row.id);
    return res.json({ ok: true, ...detail });
  } catch (err) {
    console.error('[posteingang] POST /conversations', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /conversations/:id/messages/:messageId — Outlook-Löschen (Graph) + lokale Zeile entfernen
router.delete('/conversations/:id/messages/:messageId', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const messageId = req.params.messageId;
    const row = await store.getMessageRowForConversation(conversationId, messageId);
    if (!row) {
      return res.status(404).json({ ok: false, error: 'Nachricht nicht gefunden' });
    }
    if (String(row.channel) !== 'email') {
      return res.status(400).json({ ok: false, error: 'Löschen nur bei E-Mail-Konversationen' });
    }
    if (!['inbound', 'outbound'].includes(String(row.direction))) {
      return res.status(400).json({ ok: false, error: 'Nur synchronisierte E-Mails können gelöscht werden' });
    }
    if (!row.graph_message_id) {
      return res.status(400).json({ ok: false, error: 'Keine Graph-Nachricht-ID — nicht aus Postfach löschbar' });
    }
    const mailboxUpn = row.graph_mailbox_address || getGraphConfig().mailboxUpn;
    const graphDel = await deleteMailboxMessage({ mailboxUpn, messageId: row.graph_message_id });
    if (!graphDel.success) {
      return res.status(502).json({
        ok: false,
        error: graphDel.error || 'Microsoft Graph: Löschen fehlgeschlagen (Mail.ReadWrite?)',
      });
    }
    const { deleted, conversationRemoved } = await store.deleteSyncedEmailMessageRow(
      Number(conversationId),
      Number(messageId),
    );
    if (!deleted) {
      return res.status(409).json({
        ok: false,
        error: 'Graph gelöscht, lokaler Eintrag konnte nicht entfernt werden — bitte Sync ausführen.',
      });
    }
    return res.json({ ok: true, conversation_removed: conversationRemoved });
  } catch (err) {
    console.error('[posteingang] DELETE /conversations/:id/messages/:messageId', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /conversations/:id
router.patch('/conversations/:id', async (req, res) => {
  try {
    const detail = await store.patchConversation(req.params.id, req.body || {});
    if (!detail) return res.status(404).json({ ok: false, error: 'Konversation nicht gefunden' });
    return res.json({ ok: true, ...detail });
  } catch (err) {
    console.error('[posteingang] PATCH /conversations/:id', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /conversations/:id/messages
router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const detail = await store.getConversationDetail(conversationId);
    if (!detail) return res.status(404).json({ ok: false, error: 'Konversation nicht gefunden' });

    const mode = String(req.body?.mode || 'reply');
    const bodyHtml = String(req.body?.bodyHtml || '').trim();
    const bodyText = String(req.body?.bodyText || '').trim();
    const text = bodyHtml || bodyText;
    if (!text) return res.status(400).json({ ok: false, error: 'Nachrichtentext fehlt' });

    if (mode === 'internal_note' || mode === 'note') {
      await store.addInternalNote(conversationId, stripHtml(bodyHtml || bodyText), adminEmail(req));
      const next = await store.getConversationDetail(conversationId);
      return res.json({ ok: true, ...next });
    }

    const conv = detail.conversation;
    if (String(conv.channel) !== 'email') {
      return res.status(400).json({ ok: false, error: 'Antworten nur bei E-Mail-Konversationen' });
    }

    const graphMsgId = await findReplyTargetGraphMessageId(conversationId);
    if (!graphMsgId) {
      return res.status(400).json({
        ok: false,
        error: 'Keine eingehende Graph-Nachricht zum Antworten. Kurz synchronisieren (Pull) und erneut versuchen.',
      });
    }

    const mailboxUpn = conv.graph_mailbox_address || getGraphConfig().mailboxUpn;
    const draft = await createReplyDraft({
      mailboxUpn,
      messageId: graphMsgId,
      htmlBody: bodyHtml || `<pre>${escapeHtmlPlain(bodyText)}</pre>`,
      comment: '',
    });
    if (draft.error) {
      return res.status(502).json({ ok: false, error: draft.error });
    }
    const sendRes = await sendDraftMessage({ mailboxUpn, messageId: draft.message?.id });
    if (!sendRes.success) {
      return res.status(502).json({ ok: false, error: sendRes.error || 'Senden fehlgeschlagen' });
    }

    await sync.pullRecentSent(mailboxUpn, 25);
    await store.updateConversationTimestamps(Number(conversationId), new Date());

    const next = await store.getConversationDetail(conversationId);
    return res.json({ ok: true, ...next });
  } catch (err) {
    console.error('[posteingang] POST /conversations/:id/messages', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

function escapeHtmlPlain(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// POST /conversations/:id/tags
router.post('/conversations/:id/tags', async (req, res) => {
  try {
    const name = req.body?.name;
    await store.addTag(req.params.id, name);
    const detail = await store.getConversationDetail(req.params.id);
    return res.json({ ok: true, ...detail });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /conversations/:id/tags/:name
router.delete('/conversations/:id/tags/:name', async (req, res) => {
  try {
    await store.removeTag(req.params.id, decodeURIComponent(req.params.name));
    const detail = await store.getConversationDetail(req.params.id);
    return res.json({ ok: true, ...detail });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /tasks
router.get('/tasks', async (req, res) => {
  try {
    const assignedAdminUserId = await store.getAdminUserIdByEmail(adminEmail(req));
    const { tasks, total } = await store.listTasks({
      status: req.query.status,
      assigned: req.query.assigned,
      assignedAdminUserId,
      due: req.query.due,
      customerId: req.query.customer_id ? parseInt(req.query.customer_id, 10) : null,
      conversationId: req.query.conversation_id,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json({ ok: true, tasks, total });
  } catch (err) {
    console.error('[posteingang] GET /tasks', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /tasks
router.post('/tasks', async (req, res) => {
  try {
    const task = await store.createTask(req.body || {}, adminEmail(req));
    return res.json({ ok: true, task });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /tasks/:id
router.patch('/tasks/:id', async (req, res) => {
  try {
    const task = await store.patchTask(req.params.id, req.body || {});
    if (!task) return res.status(404).json({ ok: false, error: 'Aufgabe nicht gefunden' });
    return res.json({ ok: true, task });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /tasks/:id
router.delete('/tasks/:id', async (req, res) => {
  try {
    await store.deleteTask(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /sync/pull — Inbox-Delta + Sentitems-Delta; Fallback-Listen wenn Delta scheitert
router.post('/sync/pull', async (req, res) => {
  try {
    const mailbox = String(req.body?.mailbox || req.query?.mailbox || getGraphConfig().mailboxUpn).trim();
    let full = await sync.syncPosteingangFull(mailbox);
    if (!full.inbox?.ok) {
      const boot = await sync.bootstrapFromInboxList(mailbox, 100);
      full = {
        ...full,
        inboxFallback: boot,
        processed: (full.processed || 0) + (boot.processed || 0),
      };
    }
    if (!full.sentitems?.ok) {
      const sentPull = await sync.pullRecentSent(mailbox, 80);
      full = {
        ...full,
        sentFallback: sentPull,
        processed: (full.processed || 0) + (sentPull.processed || 0),
      };
    }
    const anyOk =
      Boolean(full.inbox?.ok) ||
      Boolean(full.sentitems?.ok) ||
      Boolean(full.inboxFallback?.ok) ||
      Boolean(full.sentFallback?.ok);
    return res.json({ ok: anyOk, ...full });
  } catch (err) {
    console.error('[posteingang] sync/pull', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await store.getPosteingangStats();
    return res.json({ ok: true, stats });
  } catch (err) {
    console.error('[posteingang] GET /stats', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /messages/:messageId/attachments
router.get('/messages/:messageId/attachments', async (req, res) => {
  try {
    const attachments = await store.getAttachmentsByMessageId(req.params.messageId);
    return res.json({ ok: true, attachments });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /admin-users — Liste für Zuweisung
router.get('/admin-users', async (req, res) => {
  try {
    const { pool } = require('../lib/db');
    const { rows } = await pool.query(
      `SELECT id, email, name, role FROM core.admin_users WHERE active = TRUE ORDER BY name, email`,
    );
    return res.json({ ok: true, users: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /run-triggers — manuelle Trigger-Ausführung
router.post('/run-triggers', async (req, res) => {
  try {
    const triggers = require('../lib/posteingang-triggers');
    const result = await triggers.runAllTriggers();
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[posteingang] run-triggers', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
