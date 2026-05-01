const fs = require('fs');
const path = require('path');

let cachedEnv = null;

function parseEnvFile(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) values[key] = value;
  }
  return values;
}

function loadFallbackEnv() {
  if (cachedEnv) return cachedEnv;
  const candidates = [
    process.env.M365_ENV_FILE,
    path.resolve('Y:\\Microsoft Exchange\\.env'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      cachedEnv = parseEnvFile(fs.readFileSync(candidate, 'utf8'));
      return cachedEnv;
    } catch (err) {
      console.warn('Microsoft Graph env fallback:', err.message);
    }
  }
  cachedEnv = {};
  return cachedEnv;
}

function getEnvValue(...keys) {
  const fallback = loadFallbackEnv();
  for (const key of keys) {
    const value = process.env[key] || fallback[key];
    if (value) return value;
  }
  return null;
}

function getGraphConfig() {
  const mailboxList = getEnvValue('M365_MAILBOX_UPNS');
  const singleMailbox = getEnvValue('M365_MAILBOX_UPN');
  const mailboxUpns = mailboxList
    ? mailboxList.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
    : (singleMailbox
      ? [singleMailbox.trim().toLowerCase()]
      : ['office@propus.ch', 'js@propus.ch']);

  return {
    tenantId: getEnvValue('M365_TENANT_ID', 'TENANT_ID'),
    clientId: getEnvValue('M365_CLIENT_ID', 'CLIENT_ID'),
    clientSecret: getEnvValue('M365_CLIENT_SECRET', 'CLIENT_SECRET'),
    mailboxUpn: mailboxUpns[0] || 'office@propus.ch',
    mailboxUpns,
    lookbackMonths: Math.max(1, parseInt(getEnvValue('M365_LOOKBACK_MONTHS') || '6', 10) || 6),
    inboxTop: Math.max(1, Math.min(parseInt(getEnvValue('M365_INBOX_TOP') || '200', 10) || 200, 1000)),
    sentTop: Math.max(1, Math.min(parseInt(getEnvValue('M365_SENT_TOP') || '200', 10) || 200, 1000)),
  };
}

async function getAccessToken() {
  const { tenantId, clientId, clientSecret } = getGraphConfig();
  if (!tenantId || !clientId || !clientSecret) {
    return { token: null, error: 'Microsoft Graph Zugangsdaten fehlen' };
  }
  try {
    const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      return { token: null, error: data.error_description || `Microsoft Graph Token HTTP ${response.status}` };
    }
    return { token: data.access_token, error: null };
  } catch (err) {
    return { token: null, error: err.message };
  }
}

async function graphRequest(url, options = {}) {
  const { token, error } = await getAccessToken();
  if (!token) return { data: null, error };
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (response.status === 204) {
      return { data: null, error: null };
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errCode = data?.error?.code || '';
      const errMsg = data?.error?.message || `Microsoft Graph HTTP ${response.status}`;
      return {
        data: null,
        error: errMsg,
        errorCode: errCode,
      };
    }
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err.message };
  }
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeMessage(message) {
  const body = message?.body?.content || '';
  const contentType = message?.body?.contentType || '';
  const bodyText = contentType.toLowerCase() === 'html' ? stripHtml(body) : String(body || '').trim();
  const from = message?.from?.emailAddress || {};
  const recipients = Array.isArray(message?.toRecipients)
    ? message.toRecipients
        .map((item) => ({
          address: (item?.emailAddress?.address || '').trim().toLowerCase(),
          name: (item?.emailAddress?.name || '').trim() || null,
        }))
        .filter((item) => item.address)
    : [];
  return {
    graphMessageId: message?.id || null,
    internetMessageId: message?.internetMessageId || null,
    conversationId: message?.conversationId || null,
    subject: message?.subject || null,
    receivedAt: message?.receivedDateTime || null,
    sentAt: message?.sentDateTime || null,
    fromEmail: (from.address || '').trim().toLowerCase() || null,
    fromName: (from.name || '').trim() || null,
    toRecipients: recipients,
    isRead: !!message?.isRead,
    bodyPreview: (message?.bodyPreview || '').trim() || null,
    bodyText: bodyText || ((message?.bodyPreview || '').trim() || null),
    raw: message,
  };
}

async function fetchMailboxMessages(options = {}) {
  const { mailboxUpn = getGraphConfig().mailboxUpn, folder = 'inbox', top = 50, sinceDate = null } = options;
  const totalLimit = Math.max(1, Math.min(parseInt(top || '50', 10) || 50, 1000));
  const pageSize = Math.min(totalLimit, 200);
  const search = new URLSearchParams({
    '$top': String(pageSize),
    '$orderby': 'receivedDateTime desc',
    '$select': 'id,subject,receivedDateTime,sentDateTime,internetMessageId,conversationId,bodyPreview,isRead,from,toRecipients,body',
  });
  if (sinceDate) {
    search.set('$filter', `receivedDateTime ge ${sinceDate}`);
  }
  let nextUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxUpn)}/mailFolders/${folder}/messages?${search.toString()}`;
  const allMessages = [];

  while (nextUrl && allMessages.length < totalLimit) {
    const { data, error, errorCode } = await graphRequest(nextUrl, { method: 'GET' });
    if (error) return { messages: [], error, errorCode };
    const pageMessages = Array.isArray(data?.value) ? data.value.map(normalizeMessage) : [];
    allMessages.push(...pageMessages);
    nextUrl = data?.['@odata.nextLink'] || null;
  }

  return {
    messages: allMessages.slice(0, totalLimit),
    error: null,
  };
}

async function getMailFolderId(options = {}) {
  const { mailboxUpn = getGraphConfig().mailboxUpn, folderName = 'archive' } = options;
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxUpn)}/mailFolders/${encodeURIComponent(folderName)}?$select=id,displayName`;
  const { data, error } = await graphRequest(url, { method: 'GET' });
  if (error) return { folderId: null, error };
  return { folderId: data?.id || null, error: data?.id ? null : `Mail-Ordner ${folderName} nicht gefunden` };
}

async function createDraftMessage(options = {}) {
  const { mailboxUpn = getGraphConfig().mailboxUpn, to, subject, htmlBody, textBody } = options;
  if (!to || !subject || (!htmlBody && !textBody)) {
    return { message: null, error: 'Empfänger, Betreff oder Body fehlen' };
  }
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxUpn)}/messages`;
  const contentType = htmlBody ? 'HTML' : 'Text';
  const content = htmlBody || String(textBody || '').trim();
  const payload = {
    subject,
    body: {
      contentType,
      content,
    },
    toRecipients: [
      {
        emailAddress: {
          address: to,
        },
      },
    ],
  };
  const { data, error } = await graphRequest(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { message: data, error };
}

async function createReplyDraft(options = {}) {
  const { mailboxUpn = getGraphConfig().mailboxUpn, messageId, htmlBody, comment = '' } = options;
  if (!messageId) {
    return { message: null, error: 'messageId fehlt' };
  }
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxUpn)}/messages/${encodeURIComponent(messageId)}/createReply`;
  const { data, error } = await graphRequest(url, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  });
  if (error || !data?.id) {
    return { message: null, error: error || 'Reply-Draft konnte nicht erstellt werden' };
  }
  if (htmlBody) {
    const patchUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxUpn)}/messages/${encodeURIComponent(data.id)}`;
    const patchResult = await graphRequest(patchUrl, {
      method: 'PATCH',
      body: JSON.stringify({
        body: {
          contentType: 'HTML',
          content: htmlBody,
        },
      }),
    });
    if (patchResult.error) {
      return { message: null, error: patchResult.error };
    }
  }
  return { message: data, error: null };
}

async function sendDraftMessage(options = {}) {
  const { mailboxUpn = getGraphConfig().mailboxUpn, messageId } = options;
  if (!messageId) return { success: false, error: 'messageId fehlt' };
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxUpn)}/messages/${encodeURIComponent(messageId)}/send`;
  const { error } = await graphRequest(url, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return { success: !error, error: error || null };
}

/**
 * Sendet eine E-Mail direkt (ein API-Call, ohne Draft).
 * Benötigt Mail.Send Application Permission + ggf. ApplicationAccessPolicy in Exchange.
 * Siehe docker/M365-MAIL-SETUP.md falls "Access is denied".
 */
async function sendMailDirect(options = {}) {
  const { mailboxUpn = getGraphConfig().mailboxUpn, to, subject, htmlBody, textBody, attachments = [] } = options;
  if (!to || !subject || (!htmlBody && !textBody)) {
    return { success: false, error: 'Empfänger, Betreff oder Body fehlen' };
  }
  const contentType = htmlBody ? 'HTML' : 'Text';
  const content = htmlBody || String(textBody || '').trim();
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxUpn)}/sendMail`;
  const messageAttachments = attachments.map((a) => ({
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: a.filename || 'Anhang',
    contentType: a.contentType || 'application/octet-stream',
    contentBytes: Buffer.isBuffer(a.content)
      ? a.content.toString('base64')
      : String(a.content || ''),
  }));
  const payload = {
    message: {
      subject,
      body: { contentType, content },
      toRecipients: [{ emailAddress: { address: to } }],
      ...(messageAttachments.length ? { attachments: messageAttachments } : {}),
    },
    saveToSentItems: true,
  };
  const { error } = await graphRequest(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { success: !error, error: error || null };
}

/**
 * Löscht eine Nachricht im Postfach (verschiebt in „Gelöschte Elemente“, wie Outlook-Löschen).
 * Erfordert Mail.ReadWrite (Application).
 */
async function deleteMailboxMessage(options = {}) {
  const { mailboxUpn = getGraphConfig().mailboxUpn, messageId } = options;
  if (!messageId) return { success: false, error: 'messageId fehlt' };
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxUpn)}/messages/${encodeURIComponent(messageId)}`;
  const { error } = await graphRequest(url, { method: 'DELETE' });
  return { success: !error, error: error || null };
}

async function moveMessageToFolder(options = {}) {
  const { mailboxUpn = getGraphConfig().mailboxUpn, messageId, folderName = 'archive' } = options;
  if (!messageId) return { success: false, error: 'messageId fehlt' };
  const { folderId, error: folderError } = await getMailFolderId({ mailboxUpn, folderName });
  if (!folderId) {
    return { success: false, error: folderError || `Mail-Ordner ${folderName} nicht gefunden` };
  }
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxUpn)}/messages/${encodeURIComponent(messageId)}/move`;
  const { data, error } = await graphRequest(url, {
    method: 'POST',
    body: JSON.stringify({ destinationId: folderId }),
  });
  return { success: !error, error: error || null, message: data || null };
}

module.exports = {
  createReplyDraft,
  createDraftMessage,
  deleteMailboxMessage,
  fetchMailboxMessages,
  getMailFolderId,
  graphRequest,
  getGraphConfig,
  moveMessageToFolder,
  sendDraftMessage,
  sendMailDirect,
  stripHtml,
};
