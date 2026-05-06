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

  // Keys: bevorzugt M365_* (Code/Legacy), dann MS_GRAPH_* (.env.vps + docker-compose.vps),
  // dann TENANT_ID / CLIENT_ID / CLIENT_SECRET (Legacy-Alias in .env.vps.example).
  return {
    tenantId: getEnvValue('M365_TENANT_ID', 'MS_GRAPH_TENANT_ID', 'TENANT_ID'),
    clientId: getEnvValue('M365_CLIENT_ID', 'MS_GRAPH_CLIENT_ID', 'CLIENT_ID'),
    clientSecret: getEnvValue('M365_CLIENT_SECRET', 'MS_GRAPH_CLIENT_SECRET', 'CLIENT_SECRET'),
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
 * Empfänger-Allowlist für sendMailDirect (Bug-Hunt T14 CRITICAL: Mail-Abuse).
 *
 * Konfiguration per Env (alles optional):
 *   MAIL_RECIPIENT_ALLOW_DOMAINS    – komma-getrennt, z.B. "propus.ch,kunde.com"
 *   MAIL_RECIPIENT_ALLOW_ADDRESSES  – komma-getrennt, exakte Adressen
 *   MAIL_RECIPIENT_STRICT=1         – Hard-Block bei nicht-allowlist (sonst nur WARN)
 *
 * Verhalten:
 *   - Sind weder ALLOW_DOMAINS noch ALLOW_ADDRESSES gesetzt, ist die Allowlist
 *     deaktiviert und jeder formatvalide Empfaenger wird durchgelassen
 *     (out-of-the-box keine Funktionsregression bei externen Customer-Mails).
 *   - Sobald mindestens eine Allowlist-Variable gesetzt ist, gilt sie. Wer
 *     nicht passt, bekommt im Default warn-only (Mail geht raus + Log) und
 *     mit MAIL_RECIPIENT_STRICT=1 hard-block.
 *   - Aktivierungs-Pfad fuer Production: Allowlist anhand der gesehenen
 *     Domains pflegen, dann STRICT=1 setzen.
 */
function parseMailAllowlistEnv(name) {
  // Liest aus derselben Config-Quelle wie der Rest des Moduls (process.env +
  // M365_ENV_FILE / Fallback-.env), damit Allowlist und STRICT-Flag aus einer
  // M365-Setup-Datei nicht stillschweigend ignoriert werden.
  return String(getEnvValue(name) || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isRecipientAllowed(to) {
  const addr = String(to || '').trim().toLowerCase();
  if (!addr || !addr.includes('@')) return false;
  const allowAddresses = parseMailAllowlistEnv('MAIL_RECIPIENT_ALLOW_ADDRESSES');
  const allowDomains = parseMailAllowlistEnv('MAIL_RECIPIENT_ALLOW_DOMAINS');
  // Keine Allowlist konfiguriert -> Funktion ist deaktiviert, alles erlaubt.
  if (!allowAddresses.length && !allowDomains.length) return true;
  if (allowAddresses.includes(addr)) return true;
  const domain = addr.slice(addr.lastIndexOf('@') + 1);
  return allowDomains.includes(domain);
}

/** Maskiert eine Empfaenger-Adresse fuer Logs (PII-Schutz). */
function maskRecipientForLog(value) {
  const addr = String(value || '').trim().toLowerCase();
  const at = addr.indexOf('@');
  if (at <= 0) return '[redacted]';
  return `${addr[0]}***${addr.slice(at)}`;
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
  if (!isRecipientAllowed(to)) {
    // Default-Modus: warn-only (Mail wird trotzdem verschickt). Codex- vs.
    // CodeRabbit-Trade-off: ein Production-Auto-Strict wuerde mit der
    // Default-Allowlist (nur 'propus.ch') legitime Customer-Mails (portal/
    // admin-Notifications, Bestaetigungen) blockieren — Mail-Outage statt
    // Sicherheitsgewinn. Daher Strict NUR bei expliziter Aktivierung via
    // MAIL_RECIPIENT_STRICT=1, nachdem die Allowlist (MAIL_RECIPIENT_ALLOW_
    // DOMAINS / -ADDRESSES) anhand der Log-Beobachtung vervollstaendigt wurde.
    const strict = String(getEnvValue('MAIL_RECIPIENT_STRICT') || '').trim() === '1';
    const masked = maskRecipientForLog(to);
    if (strict) {
      console.error('[microsoft-graph] sendMailDirect blockiert (strict): nicht in Allowlist:', masked);
      return { success: false, error: 'recipient_not_allowed' };
    }
    console.warn('[microsoft-graph] sendMailDirect: Empfaenger NICHT in Allowlist (warn-only):', masked);
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

// ─── Microsoft Teams Helpers ──────────────────────────────────────────────────
// App-Permissions:
//   Team.ReadBasic.All         (frei)
//   Channel.ReadBasic.All      (frei)
//   ChannelMember.Read.All     (frei)
//   User.Read.All              (frei)
//   ChannelMessage.Read.All    (Protected API – Billing nötig)
//   Chat.Read.All              (Protected API – Billing nötig)
//   ChatMessage.Read.All       (Protected API – Billing nötig)
// Schreibende Aktionen brauchen Delegated-Tokens (siehe ms-graph-delegated.js).

function normalizeTeamsMessage(message) {
  const body = message?.body?.content || '';
  const contentType = message?.body?.contentType || '';
  const bodyText = contentType.toLowerCase() === 'html' ? stripHtml(body) : String(body || '').trim();
  const fromUser = message?.from?.user || message?.from?.application || {};
  const mentions = Array.isArray(message?.mentions)
    ? message.mentions.map((m) => m?.mentionText || m?.mentioned?.user?.displayName).filter(Boolean)
    : [];
  return {
    id: message?.id || null,
    replyToId: message?.replyToId || null,
    messageType: message?.messageType || 'message',
    createdAt: message?.createdDateTime || null,
    lastModifiedAt: message?.lastModifiedDateTime || null,
    importance: message?.importance || 'normal',
    fromId: fromUser?.id || null,
    fromName: fromUser?.displayName || null,
    fromKind: message?.from?.user ? 'user' : (message?.from?.application ? 'application' : 'unknown'),
    subject: message?.subject || null,
    bodyText: bodyText || null,
    contentType,
    mentions,
    webUrl: message?.webUrl || null,
    raw: message,
  };
}

async function listTeams(options = {}) {
  const top = Math.max(1, Math.min(parseInt(options.top || '50', 10) || 50, 999));
  const search = new URLSearchParams({
    '$top': String(top),
    '$select': 'id,displayName,description,visibility,createdDateTime',
  });
  const url = `https://graph.microsoft.com/v1.0/teams?${search.toString()}`;
  const { data, error, errorCode } = await graphRequest(url, { method: 'GET' });
  if (error) return { teams: [], error, errorCode };
  const teams = Array.isArray(data?.value) ? data.value : [];
  return {
    teams: teams.map((t) => ({
      id: t.id,
      displayName: t.displayName,
      description: t.description || null,
      visibility: t.visibility || null,
      createdDateTime: t.createdDateTime || null,
    })),
    error: null,
  };
}

async function listTeamChannels(options = {}) {
  const { teamId } = options;
  if (!teamId) return { channels: [], error: 'teamId fehlt' };
  const url = `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(teamId)}/channels?$select=id,displayName,description,membershipType,webUrl`;
  const { data, error, errorCode } = await graphRequest(url, { method: 'GET' });
  if (error) return { channels: [], error, errorCode };
  const channels = Array.isArray(data?.value) ? data.value : [];
  return {
    channels: channels.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      description: c.description || null,
      membershipType: c.membershipType || null,
      webUrl: c.webUrl || null,
    })),
    error: null,
  };
}

async function listTeamMembers(options = {}) {
  const { teamId } = options;
  if (!teamId) return { members: [], error: 'teamId fehlt' };
  const top = Math.max(1, Math.min(parseInt(options.top || '50', 10) || 50, 200));
  const url = `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(teamId)}/members?$top=${top}`;
  const { data, error, errorCode } = await graphRequest(url, { method: 'GET' });
  if (error) return { members: [], error, errorCode };
  const members = Array.isArray(data?.value) ? data.value : [];
  return {
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId || null,
      displayName: m.displayName || null,
      email: (m.email || '').toLowerCase() || null,
      roles: Array.isArray(m.roles) ? m.roles : [],
    })),
    error: null,
  };
}

async function findGraphUser(options = {}) {
  const { query } = options;
  const q = String(query || '').trim();
  if (!q) return { users: [], error: 'query fehlt' };
  // $search braucht ConsistencyLevel: eventual
  const search = new URLSearchParams({
    '$top': '10',
    '$select': 'id,displayName,mail,userPrincipalName,jobTitle,department',
    '$search': `"displayName:${q}" OR "mail:${q}" OR "userPrincipalName:${q}"`,
  });
  const url = `https://graph.microsoft.com/v1.0/users?${search.toString()}`;
  const { data, error, errorCode } = await graphRequest(url, {
    method: 'GET',
    headers: { ConsistencyLevel: 'eventual' },
  });
  if (error) return { users: [], error, errorCode };
  const users = Array.isArray(data?.value) ? data.value : [];
  return {
    users: users.map((u) => ({
      id: u.id,
      displayName: u.displayName || null,
      mail: (u.mail || '').toLowerCase() || null,
      userPrincipalName: (u.userPrincipalName || '').toLowerCase() || null,
      jobTitle: u.jobTitle || null,
      department: u.department || null,
    })),
    error: null,
  };
}

async function fetchChannelMessages(options = {}) {
  const { teamId, channelId, sinceDate = null } = options;
  if (!teamId || !channelId) return { messages: [], error: 'teamId und channelId erforderlich' };
  const totalLimit = Math.max(1, Math.min(parseInt(options.top || '20', 10) || 20, 50));
  const pageSize = Math.min(totalLimit, 50);
  const search = new URLSearchParams({ '$top': String(pageSize) });
  let nextUrl = `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages?${search.toString()}`;
  const all = [];
  while (nextUrl && all.length < totalLimit) {
    const { data, error, errorCode } = await graphRequest(nextUrl, { method: 'GET' });
    if (error) return { messages: [], error, errorCode };
    const page = Array.isArray(data?.value) ? data.value.map(normalizeTeamsMessage) : [];
    for (const msg of page) {
      if (sinceDate && msg.createdAt && msg.createdAt < sinceDate) continue;
      all.push(msg);
      if (all.length >= totalLimit) break;
    }
    nextUrl = data?.['@odata.nextLink'] || null;
  }
  return { messages: all.slice(0, totalLimit), error: null };
}

async function fetchChannelMessageReplies(options = {}) {
  const { teamId, channelId, messageId } = options;
  if (!teamId || !channelId || !messageId) return { replies: [], error: 'teamId, channelId, messageId erforderlich' };
  const url = `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/replies`;
  const { data, error, errorCode } = await graphRequest(url, { method: 'GET' });
  if (error) return { replies: [], error, errorCode };
  const items = Array.isArray(data?.value) ? data.value.map(normalizeTeamsMessage) : [];
  return { replies: items, error: null };
}

async function listUserChats(options = {}) {
  const { userUpn = getGraphConfig().mailboxUpn } = options;
  if (!userUpn) return { chats: [], error: 'userUpn fehlt' };
  const top = Math.max(1, Math.min(parseInt(options.top || '20', 10) || 20, 50));
  const search = new URLSearchParams({
    '$top': String(top),
    '$expand': 'members',
    '$orderby': 'lastMessagePreview/createdDateTime desc',
  });
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userUpn)}/chats?${search.toString()}`;
  const { data, error, errorCode } = await graphRequest(url, {
    method: 'GET',
    headers: { Prefer: 'include-unknown-enum-members' },
  });
  if (error) return { chats: [], error, errorCode };
  const chats = Array.isArray(data?.value) ? data.value : [];
  return {
    chats: chats.map((c) => ({
      id: c.id,
      topic: c.topic || null,
      chatType: c.chatType || null,
      createdAt: c.createdDateTime || null,
      lastUpdatedAt: c.lastUpdatedDateTime || null,
      webUrl: c.webUrl || null,
      members: Array.isArray(c.members)
        ? c.members.map((m) => ({
            displayName: m.displayName || null,
            email: (m.email || '').toLowerCase() || null,
            userId: m.userId || null,
          }))
        : [],
      lastMessagePreview: c.lastMessagePreview
        ? {
            createdAt: c.lastMessagePreview.createdDateTime || null,
            from: c.lastMessagePreview.from?.user?.displayName || null,
            preview: stripHtml(c.lastMessagePreview.body?.content || '').slice(0, 200) || null,
          }
        : null,
    })),
    error: null,
  };
}

async function fetchChatMessages(options = {}) {
  const { chatId } = options;
  if (!chatId) return { messages: [], error: 'chatId fehlt' };
  const totalLimit = Math.max(1, Math.min(parseInt(options.top || '20', 10) || 20, 50));
  const pageSize = Math.min(totalLimit, 50);
  const url = `https://graph.microsoft.com/v1.0/chats/${encodeURIComponent(chatId)}/messages?$top=${pageSize}`;
  const { data, error, errorCode } = await graphRequest(url, { method: 'GET' });
  if (error) return { messages: [], error, errorCode };
  const messages = Array.isArray(data?.value) ? data.value.map(normalizeTeamsMessage) : [];
  return { messages: messages.slice(0, totalLimit), error: null };
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
  // Teams (App-Permissions)
  listTeams,
  listTeamChannels,
  listTeamMembers,
  findGraphUser,
  fetchChannelMessages,
  fetchChannelMessageReplies,
  listUserChats,
  fetchChatMessages,
  normalizeTeamsMessage,
};
