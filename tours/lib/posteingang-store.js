/**
 * Persistenz für Posteingang (Konversationen, Nachrichten, Aufgaben).
 */
'use strict';

const { pool } = require('./db');

async function getConversationByGraphConversationId(graphConversationId) {
  if (!graphConversationId) return null;
  const { rows } = await pool.query(
    `SELECT * FROM tour_manager.posteingang_conversations WHERE graph_conversation_id = $1`,
    [graphConversationId],
  );
  return rows[0] || null;
}

async function messageExistsByGraphId(graphMessageId) {
  if (!graphMessageId) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM tour_manager.posteingang_messages WHERE graph_message_id = $1`,
    [graphMessageId],
  );
  return rows.length > 0;
}

async function insertMessage(row) {
  const {
    conversationId,
    direction,
    fromName,
    fromEmail,
    toEmails,
    ccEmails,
    bccEmails,
    subject,
    bodyHtml,
    bodyText,
    graphMessageId,
    graphInternetMessageId,
    inReplyToMessageId,
    authorEmail,
    sentAt,
    receivedAt,
  } = row;
  const { rows } = await pool.query(
    `INSERT INTO tour_manager.posteingang_messages (
       conversation_id, direction, from_name, from_email, to_emails, cc_emails, bcc_emails,
       subject, body_html, body_text, graph_message_id, graph_internet_message_id,
       in_reply_to_message_id, author_email, sent_at, received_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      conversationId,
      direction,
      fromName || null,
      fromEmail || null,
      toEmails || [],
      ccEmails || [],
      bccEmails || [],
      subject || null,
      bodyHtml || null,
      bodyText || null,
      graphMessageId || null,
      graphInternetMessageId || null,
      inReplyToMessageId || null,
      authorEmail || null,
      sentAt,
      receivedAt || null,
    ],
  );
  return rows[0];
}

async function createConversation({
  subject,
  channel,
  status,
  priority,
  customerId,
  graphConversationId,
  graphMailboxAddress,
  createdByEmail,
}) {
  const { rows } = await pool.query(
    `INSERT INTO tour_manager.posteingang_conversations (
       subject, channel, status, priority, customer_id, graph_conversation_id,
       graph_mailbox_address, created_by_email, last_message_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
     RETURNING *`,
    [
      (subject || '').slice(0, 2000),
      channel || 'email',
      status || 'open',
      priority || 'medium',
      customerId || null,
      graphConversationId || null,
      graphMailboxAddress || null,
      createdByEmail || 'system',
    ],
  );
  return rows[0];
}

async function updateConversationTimestamps(conversationId, lastMessageAt) {
  await pool.query(
    `UPDATE tour_manager.posteingang_conversations
     SET last_message_at = $2, updated_at = NOW()
     WHERE id = $1`,
    [conversationId, lastMessageAt],
  );
}

async function updateConversationCustomer(conversationId, customerId) {
  const { rows } = await pool.query(
    `UPDATE tour_manager.posteingang_conversations
     SET customer_id = COALESCE($2, customer_id), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [conversationId, customerId],
  );
  return rows[0] || null;
}

async function getGraphSyncState(mailbox, folderScope = 'inbox') {
  const { rows } = await pool.query(
    `SELECT * FROM tour_manager.posteingang_graph_sync_state
     WHERE mailbox_address = $1 AND folder_scope = $2`,
    [mailbox, folderScope],
  );
  return rows[0] || null;
}

async function saveGraphDeltaToken(mailbox, folderScope, deltaToken) {
  await pool.query(
    `INSERT INTO tour_manager.posteingang_graph_sync_state (mailbox_address, folder_scope, delta_token, last_sync_at, last_error_at, last_error_message)
     VALUES ($1, $2, $3, NOW(), NULL, NULL)
     ON CONFLICT (mailbox_address, folder_scope) DO UPDATE SET
       delta_token = EXCLUDED.delta_token,
       last_sync_at = NOW(),
       last_error_at = NULL,
       last_error_message = NULL`,
    [mailbox, folderScope, deltaToken],
  );
}

async function recordSyncError(mailbox, folderScope, errMsg) {
  await pool.query(
    `INSERT INTO tour_manager.posteingang_graph_sync_state (mailbox_address, folder_scope, last_error_at, last_error_message)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (mailbox_address, folder_scope) DO UPDATE SET
       last_error_at = NOW(),
       last_error_message = EXCLUDED.last_error_message`,
    [mailbox, folderScope, String(errMsg || '').slice(0, 2000)],
  );
}

async function listConversations(filters) {
  const {
    status,
    assigned,
    assignedAdminUserId,
    customerId,
    search,
    page = 1,
    limit = 40,
  } = filters;
  const off = Math.max(0, (parseInt(page, 10) || 1) - 1) * Math.min(parseInt(limit, 10) || 40, 100);
  const lim = Math.min(parseInt(limit, 10) || 40, 100);
  const params = [];
  const cond = ['1=1'];
  if (status && status !== 'all') {
    params.push(status);
    cond.push(`c.status = $${params.length}`);
  }
  if (assigned === 'me' && assignedAdminUserId) {
    params.push(assignedAdminUserId);
    cond.push(`c.assigned_admin_user_id = $${params.length}`);
  } else if (assigned === 'unassigned') {
    cond.push('c.assigned_admin_user_id IS NULL');
  }
  if (customerId) {
    params.push(customerId);
    cond.push(`c.customer_id = $${params.length}`);
  }
  if (search && String(search).trim()) {
    params.push(`%${String(search).trim().toLowerCase()}%`);
    cond.push(`(LOWER(c.subject) LIKE $${params.length})`);
  }
  const where = cond.join(' AND ');
  params.push(lim);
  params.push(off);
  const q = `
    SELECT c.*,
           (SELECT COUNT(*)::int FROM tour_manager.posteingang_messages m WHERE m.conversation_id = c.id) AS message_count
    FROM tour_manager.posteingang_conversations c
    WHERE ${where}
    ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const { rows } = await pool.query(q, params);
  const countParams = params.slice(0, -2);
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM tour_manager.posteingang_conversations c WHERE ${where}`,
    countParams,
  );
  return { conversations: rows, total: countRows[0]?.n ?? 0 };
}

async function loadRelatedForCustomer(customerId) {
  if (!customerId) {
    return { tours: [], orders: [], renewal_invoices: [], exxas_invoices: [] };
  }
  const [tours, orders, renewals, exxas] = await Promise.all([
    pool.query(
      `SELECT t.id, t.bezeichnung, t.status, t.customer_email, t.matterport_space_id
       FROM tour_manager.tours t
       WHERE t.customer_id = $1
       ORDER BY t.id DESC
       LIMIT 15`,
      [customerId],
    ),
    pool.query(
      `SELECT o.id, o.order_no, o.status, o.created_at
       FROM booking.orders o
       WHERE o.customer_id = $1
       ORDER BY o.id DESC
       LIMIT 15`,
      [customerId],
    ),
    pool.query(
      `SELECT ri.id, ri.invoice_number, ri.invoice_status, ri.amount_chf, ri.created_at,
              t.id AS tour_id, t.bezeichnung AS tour_bezeichnung
       FROM tour_manager.renewal_invoices ri
       JOIN tour_manager.tours t ON t.id = ri.tour_id
       WHERE t.customer_id = $1
       ORDER BY ri.created_at DESC
       LIMIT 10`,
      [customerId],
    ),
    pool.query(
      `SELECT ei.id, ei.nummer, ei.exxas_status, ei.preis_brutto, ei.synced_at,
              t.id AS tour_id, t.bezeichnung AS tour_bezeichnung
       FROM tour_manager.exxas_invoices ei
       JOIN tour_manager.tours t ON t.id = ei.tour_id
       WHERE t.customer_id = $1
       ORDER BY ei.synced_at DESC
       LIMIT 8`,
      [customerId],
    ),
  ]);
  return {
    tours: tours.rows,
    orders: orders.rows,
    renewal_invoices: renewals.rows,
    exxas_invoices: exxas.rows,
  };
}

async function getConversationDetail(id) {
  const { rows } = await pool.query(
    `SELECT c.*,
            cust.name AS customer_name,
            cust.email AS customer_email,
            au.email AS assignee_email,
            au.full_name AS assignee_name
     FROM tour_manager.posteingang_conversations c
     LEFT JOIN core.customers cust ON cust.id = c.customer_id
     LEFT JOIN core.admin_users au ON au.id = c.assigned_admin_user_id
     WHERE c.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const conv = rows[0];
  const [msgs, tags, tasks, related] = await Promise.all([
    pool.query(
      `SELECT * FROM tour_manager.posteingang_messages WHERE conversation_id = $1 ORDER BY sent_at ASC, id ASC`,
      [id],
    ),
    pool.query(`SELECT name FROM tour_manager.posteingang_tags WHERE conversation_id = $1 ORDER BY name`, [id]),
    pool.query(`SELECT * FROM tour_manager.posteingang_tasks WHERE conversation_id = $1 ORDER BY due_at NULLS LAST, id DESC`, [id]),
    loadRelatedForCustomer(conv.customer_id),
  ]);
  return {
    conversation: conv,
    messages: msgs.rows,
    tags: tags.rows.map((r) => r.name),
    tasks: tasks.rows,
    related,
  };
}

async function patchConversation(id, body) {
  const allowed = new Set([
    'status',
    'priority',
    'customer_id',
    'order_id',
    'tour_id',
    'assigned_admin_user_id',
    'subject',
  ]);
  const sets = [];
  const params = [];
  for (const key of Object.keys(body || {})) {
    if (!allowed.has(key)) continue;
    params.push(body[key]);
    sets.push(`${key} = $${params.length}`);
  }
  if (sets.length === 0) return getConversationDetail(id);
  params.push(id);
  await pool.query(
    `UPDATE tour_manager.posteingang_conversations SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
    params,
  );
  return getConversationDetail(id);
}

async function createInternalConversation(body, createdByEmail) {
  const {
    subject,
    channel = 'internal',
    priority = 'medium',
    customer_id,
    order_id,
    tour_id,
  } = body;
  const { rows } = await pool.query(
    `INSERT INTO tour_manager.posteingang_conversations (
       subject, channel, status, priority, customer_id, order_id, tour_id,
       created_by_email, last_message_at, updated_at
     ) VALUES ($1,$2,'open',$3,$4,$5,$6,$7,NOW(),NOW())
     RETURNING *`,
    [
      String(subject || 'Ohne Betreff').slice(0, 2000),
      channel === 'task_only' ? 'task_only' : 'internal',
      priority,
      customer_id || null,
      order_id || null,
      tour_id || null,
      createdByEmail || 'admin',
    ],
  );
  return rows[0];
}

async function addInternalNote(conversationId, bodyText, authorEmail) {
  await insertMessage({
    conversationId,
    direction: 'internal_note',
    fromName: null,
    fromEmail: authorEmail,
    toEmails: [],
    ccEmails: [],
    bccEmails: [],
    subject: null,
    bodyHtml: null,
    bodyText: bodyText || '',
    graphMessageId: null,
    graphInternetMessageId: null,
    inReplyToMessageId: null,
    authorEmail,
    sentAt: new Date(),
    receivedAt: null,
  });
  await pool.query(
    `UPDATE tour_manager.posteingang_conversations SET updated_at = NOW(), last_message_at = NOW() WHERE id = $1`,
    [conversationId],
  );
}

async function addOutboundMessageRecord(payload) {
  return insertMessage(payload);
}

async function addTag(conversationId, name) {
  const n = String(name || '').trim().slice(0, 80);
  if (!n) return;
  await pool.query(
    `INSERT INTO tour_manager.posteingang_tags (conversation_id, name) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [conversationId, n],
  );
}

async function removeTag(conversationId, name) {
  await pool.query(`DELETE FROM tour_manager.posteingang_tags WHERE conversation_id = $1 AND name = $2`, [
    conversationId,
    String(name),
  ]);
}

async function listTasks(filters) {
  const { status, assigned, due, customerId, conversationId, page = 1, limit = 50 } = filters;
  const lim = Math.min(parseInt(limit, 10) || 50, 200);
  const off = Math.max(0, (parseInt(page, 10) || 1) - 1) * lim;
  const params = [];
  const cond = ['1=1'];
  if (status && status !== 'all') {
    params.push(status);
    cond.push(`t.status = $${params.length}`);
  }
  if (assigned === 'me' && filters.assignedAdminUserId) {
    params.push(filters.assignedAdminUserId);
    cond.push(`t.assigned_admin_user_id = $${params.length}`);
  }
  if (due === 'today') {
    cond.push(`t.due_at IS NOT NULL AND t.due_at::date = (NOW() AT TIME ZONE 'Europe/Zurich')::date`);
  }
  if (customerId) {
    params.push(customerId);
    cond.push(`t.customer_id = $${params.length}`);
  }
  if (conversationId) {
    params.push(conversationId);
    cond.push(`t.conversation_id = $${params.length}`);
  }
  const where = cond.join(' AND ');
  params.push(lim);
  params.push(off);
  const { rows } = await pool.query(
    `SELECT t.* FROM tour_manager.posteingang_tasks t WHERE ${where}
     ORDER BY t.due_at NULLS LAST, t.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const countParams = params.slice(0, -2);
  const { rows: c } = await pool.query(`SELECT COUNT(*)::int AS n FROM tour_manager.posteingang_tasks t WHERE ${where}`, countParams);
  return { tasks: rows, total: c[0]?.n ?? 0 };
}

async function createTask(body, createdByEmail) {
  const {
    title,
    description,
    priority = 'medium',
    due_at,
    conversation_id,
    customer_id,
    order_id,
    tour_id,
    assigned_admin_user_id,
  } = body;
  const { rows } = await pool.query(
    `INSERT INTO tour_manager.posteingang_tasks (
       title, description, status, priority, due_at, conversation_id, customer_id, order_id, tour_id,
       assigned_admin_user_id, created_by_email, updated_at
     ) VALUES ($1,$2,'open',$3,$4::timestamptz,$5,$6,$7,$8,$9,$10,NOW())
     RETURNING *`,
    [
      String(title || '').slice(0, 500),
      description || null,
      priority,
      due_at || null,
      conversation_id || null,
      customer_id || null,
      order_id || null,
      tour_id || null,
      assigned_admin_user_id || null,
      createdByEmail || 'admin',
    ],
  );
  return rows[0];
}

async function patchTask(id, body) {
  const allowed = ['status', 'priority', 'due_at', 'title', 'description', 'assigned_admin_user_id', 'conversation_id'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      params.push(body[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    if (body.status === 'done') {
      sets.push('completed_at = COALESCE(completed_at, NOW())');
    } else {
      sets.push('completed_at = NULL');
    }
  }
  if (sets.length === 0) return null;
  params.push(id);
  const { rows } = await pool.query(
    `UPDATE tour_manager.posteingang_tasks SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return rows[0] || null;
}

async function deleteTask(id) {
  await pool.query(`DELETE FROM tour_manager.posteingang_tasks WHERE id = $1`, [id]);
}

async function getAdminUserIdByEmail(email) {
  if (!email) return null;
  const { rows } = await pool.query(
    `SELECT id FROM core.admin_users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1`,
    [email],
  );
  return rows[0]?.id ?? null;
}

async function insertAttachment({ messageId, filename, contentType, sizeBytes, storageKey }) {
  const { rows } = await pool.query(
    `INSERT INTO tour_manager.posteingang_message_attachments
       (message_id, filename, content_type, size_bytes, storage_key)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [messageId, filename, contentType || 'application/octet-stream', sizeBytes || 0, storageKey || ''],
  );
  return rows[0];
}

async function getAttachmentsByMessageId(messageId) {
  const { rows } = await pool.query(
    `SELECT * FROM tour_manager.posteingang_message_attachments WHERE message_id = $1 ORDER BY id`,
    [messageId],
  );
  return rows;
}

async function getAttachmentById(id) {
  const { rows } = await pool.query(
    `SELECT * FROM tour_manager.posteingang_message_attachments WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

async function getPosteingangStats() {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'open') AS open_conversations,
      COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress_conversations,
      COUNT(*) FILTER (WHERE status = 'waiting') AS waiting_conversations,
      COUNT(*) FILTER (WHERE status = 'resolved') AS resolved_conversations,
      (SELECT COUNT(*) FROM tour_manager.posteingang_tasks WHERE status IN ('open', 'in_progress')) AS open_tasks,
      (SELECT AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600)
       FROM tour_manager.posteingang_conversations
       WHERE first_response_at IS NOT NULL
         AND created_at > NOW() - INTERVAL '30 days') AS avg_response_time_hours
    FROM tour_manager.posteingang_conversations
    WHERE created_at > NOW() - INTERVAL '30 days'
  `);
  return rows[0] || {};
}

module.exports = {
  getConversationByGraphConversationId,
  messageExistsByGraphId,
  insertMessage,
  createConversation,
  updateConversationTimestamps,
  updateConversationCustomer,
  getGraphSyncState,
  saveGraphDeltaToken,
  recordSyncError,
  listConversations,
  getConversationDetail,
  patchConversation,
  createInternalConversation,
  addInternalNote,
  addOutboundMessageRecord,
  addTag,
  removeTag,
  listTasks,
  createTask,
  patchTask,
  deleteTask,
  getAdminUserIdByEmail,
  insertAttachment,
  getAttachmentsByMessageId,
  getAttachmentById,
  getPosteingangStats,
};
