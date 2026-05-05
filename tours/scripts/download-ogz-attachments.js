#!/usr/bin/env node
/**
 * Lädt alle Anhänge der OGZ-Firmenpost (Office Group Zug) aus dem Postfach
 * `js@propus.ch` herunter und legt sie auf der NAS unter
 * `\\192.168.1.5\scanpropus\buchhaltung-propus\zug-office\` ab.
 *
 * Quellen (beide werden zusammengefasst, dedupliziert per Graph-Message-Id):
 *   1. Ordner "ZUG Office" (Unterordner der Inbox)
 *   2. Inbox-Treffer von Sendern @myoffices.ch
 *
 * Ausführung:
 *   node tours/scripts/download-ogz-attachments.js          # Dry-Run, listet nur
 *   node tours/scripts/download-ogz-attachments.js --apply  # echte Downloads
 *
 * Optionen:
 *   --mailbox=<upn>   überschreibt das Postfach (Default js@propus.ch)
 *   --out=<dir>       überschreibt das Ziel
 *   --since=YYYY-MM-DD  begrenzt receivedDateTime (gilt nur für Inbox-Filter)
 */
'use strict';

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../docker/.env') });
require('dotenv').config();

const { graphRequest } = require('../lib/microsoft-graph');

const OGZ_SENDER_DOMAIN = 'myoffices.ch';
const DEFAULT_MAILBOX = 'js@propus.ch';
const DEFAULT_OUT_DIR = '\\\\192.168.1.5\\scanpropus\\buchhaltung-propus\\zug-office';

function parseArgs(argv) {
  const args = { apply: false, mailbox: DEFAULT_MAILBOX, out: DEFAULT_OUT_DIR, since: null };
  for (const raw of argv.slice(2)) {
    if (raw === '--apply') args.apply = true;
    else if (raw.startsWith('--mailbox=')) args.mailbox = raw.slice('--mailbox='.length).trim();
    else if (raw.startsWith('--out=')) args.out = raw.slice('--out='.length).trim();
    else if (raw.startsWith('--since=')) args.since = raw.slice('--since='.length).trim();
  }
  return args;
}

function logStep(msg) {
  process.stdout.write(`[ogz-download] ${msg}\n`);
}

function safeSegment(value, max = 60) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '_')
    .slice(0, max) || 'mail';
}

function formatDatePrefix(iso) {
  if (!iso) return '0000-00-00';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '0000-00-00';
  return d.toISOString().slice(0, 10);
}

async function findChildFolderId(mailbox, parentWellKnown, displayName) {
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/${encodeURIComponent(parentWellKnown)}/childFolders?$top=200&$select=id,displayName`;
  const { data, error } = await graphRequest(url, { method: 'GET' });
  if (error) return { id: null, error };
  const target = (data?.value || []).find((f) => String(f?.displayName || '').toLowerCase() === displayName.toLowerCase());
  return { id: target?.id || null, error: target ? null : `Ordner ${displayName} nicht gefunden` };
}

async function listAllMessagesInFolder(mailbox, folderId, sinceIso) {
  const select = ['id', 'subject', 'receivedDateTime', 'sentDateTime', 'from', 'hasAttachments', 'internetMessageId'].join(',');
  const search = new URLSearchParams({
    '$top': '100',
    '$orderby': 'receivedDateTime desc',
    '$select': select,
  });
  if (sinceIso) search.set('$filter', `receivedDateTime ge ${sinceIso}`);
  let url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/${encodeURIComponent(folderId)}/messages?${search.toString()}`;
  const out = [];
  while (url) {
    const { data, error } = await graphRequest(url, { method: 'GET' });
    if (error) return { messages: out, error };
    out.push(...(data?.value || []));
    url = data?.['@odata.nextLink'] || null;
  }
  return { messages: out, error: null };
}

async function listInboxMessagesFromOgz(mailbox, sinceIso) {
  const select = ['id', 'subject', 'receivedDateTime', 'sentDateTime', 'from', 'hasAttachments', 'internetMessageId'].join(',');
  const filterParts = [`from/emailAddress/address ne null`, `endsWith(from/emailAddress/address, '@${OGZ_SENDER_DOMAIN}')`];
  if (sinceIso) filterParts.push(`receivedDateTime ge ${sinceIso}`);
  const search = new URLSearchParams({
    '$top': '100',
    '$orderby': 'receivedDateTime desc',
    '$select': select,
    '$filter': filterParts.join(' and '),
    '$count': 'true',
  });
  let url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages?${search.toString()}`;
  const out = [];
  while (url) {
    const { data, error } = await graphRequest(url, {
      method: 'GET',
      headers: { ConsistencyLevel: 'eventual' },
    });
    if (error) return { messages: out, error };
    out.push(...(data?.value || []));
    url = data?.['@odata.nextLink'] || null;
  }
  return { messages: out, error: null };
}

async function listAttachmentsMeta(mailbox, messageId) {
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/attachments`;
  const { data, error } = await graphRequest(url, { method: 'GET' });
  return { attachments: data?.value || [], error };
}

async function downloadAttachmentBytes(mailbox, messageId, attachmentId, accessTokenContainer) {
  // Wir gehen über graphRequest? Nein – graphRequest erwartet JSON.
  // Daher direkt fetch mit eigenem Token.
  const { token, error: tokenError } = await accessTokenContainer.get();
  if (!token) return { buffer: null, error: tokenError || 'kein Token' };
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { buffer: null, error: `HTTP ${res.status} ${body.slice(0, 200)}` };
  }
  const arr = await res.arrayBuffer();
  return { buffer: Buffer.from(arr), error: null };
}

function makeAccessTokenContainer() {
  // Wiederverwendet die Token-Logik aus microsoft-graph.js, indem ein simpler
  // Graph-Call gemacht wird – aber stattdessen exportiert graphRequest keinen
  // Token. Wir bauen einen schlanken Eigenbau auf Basis der gleichen Env-Quelle.
  const { getGraphConfig } = require('../lib/microsoft-graph');
  let cached = null;
  let expiresAt = 0;
  return {
    async get() {
      if (cached && Date.now() < expiresAt - 60_000) return { token: cached, error: null };
      const cfg = getGraphConfig();
      if (!cfg.tenantId || !cfg.clientId || !cfg.clientSecret) {
        return { token: null, error: 'Microsoft Graph Zugangsdaten fehlen' };
      }
      const res = await fetch(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.access_token) {
        return { token: null, error: data.error_description || `Token HTTP ${res.status}` };
      }
      cached = data.access_token;
      expiresAt = Date.now() + (Number(data.expires_in || 3600) * 1000);
      return { token: cached, error: null };
    },
  };
}

function uniqueByGraphId(messages) {
  const seen = new Set();
  const out = [];
  for (const m of messages) {
    if (!m?.id || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const accessTokenContainer = makeAccessTokenContainer();

  logStep(`Mailbox=${args.mailbox}`);
  logStep(`Output=${args.out}`);
  logStep(`Mode=${args.apply ? 'APPLY (Downloads aktiv)' : 'DRY-RUN (kein Schreiben)'}`);
  if (args.since) logStep(`Since=${args.since}`);

  // 1. ZUG Office Folder finden + leeren
  const folder = await findChildFolderId(args.mailbox, 'inbox', 'ZUG Office');
  if (folder.error) {
    logStep(`WARN: Ordner "ZUG Office" konnte nicht aufgelöst werden: ${folder.error}`);
  } else {
    logStep(`Ordner "ZUG Office" Id=${folder.id}`);
  }

  const folderMessages = folder.id
    ? (await listAllMessagesInFolder(args.mailbox, folder.id, args.since)).messages
    : [];
  logStep(`Ordner-Treffer: ${folderMessages.length}`);

  const inboxOgz = (await listInboxMessagesFromOgz(args.mailbox, args.since)).messages;
  logStep(`Inbox-OGZ-Treffer: ${inboxOgz.length}`);

  const allMessages = uniqueByGraphId([...folderMessages, ...inboxOgz])
    .filter((m) => m.hasAttachments);
  logStep(`Eindeutig + mit Anhängen: ${allMessages.length}`);

  if (args.apply) {
    fs.mkdirSync(args.out, { recursive: true });
  }

  let totalAttachments = 0;
  let savedAttachments = 0;
  let skippedInline = 0;
  let skippedExisting = 0;
  let errors = [];

  for (const msg of allMessages) {
    const { attachments, error } = await listAttachmentsMeta(args.mailbox, msg.id);
    if (error) {
      errors.push({ msgId: msg.id, error });
      continue;
    }
    for (const att of attachments) {
      totalAttachments += 1;
      const isFileAttachment = att?.['@odata.type'] === '#microsoft.graph.fileAttachment';
      if (att?.isInline || !isFileAttachment) {
        skippedInline += 1;
        continue;
      }
      const datePrefix = formatDatePrefix(msg.receivedDateTime || msg.sentDateTime);
      const subj = safeSegment(msg.subject || '');
      const fname = safeSegment(att.name || 'anhang.bin', 100);
      const fileBase = `${datePrefix}__${subj}__${fname}`;
      const target = path.join(args.out, fileBase);

      if (!args.apply) {
        process.stdout.write(`PLAN ${datePrefix} ${(att.size || 0).toString().padStart(8)} B  ${fname}\n`);
        continue;
      }

      if (fs.existsSync(target)) {
        skippedExisting += 1;
        continue;
      }

      const { buffer, error: dlError } = await downloadAttachmentBytes(args.mailbox, msg.id, att.id, accessTokenContainer);
      if (dlError || !buffer) {
        errors.push({ msgId: msg.id, attId: att.id, error: dlError });
        continue;
      }
      fs.writeFileSync(target, buffer);
      savedAttachments += 1;
      process.stdout.write(`SAVE ${target} (${buffer.length} B)\n`);
    }
  }

  logStep('---- Zusammenfassung ----');
  logStep(`Mails geprüft: ${allMessages.length}`);
  logStep(`Anhänge gesamt: ${totalAttachments}`);
  logStep(`Übersprungen inline/non-file: ${skippedInline}`);
  if (args.apply) {
    logStep(`Gespeichert: ${savedAttachments}`);
    logStep(`Übersprungen (existiert): ${skippedExisting}`);
  }
  if (errors.length) {
    logStep(`Fehler: ${errors.length}`);
    for (const e of errors.slice(0, 10)) logStep(`  - ${JSON.stringify(e)}`);
  }
}

main().catch((err) => {
  console.error('[ogz-download] FATAL', err);
  process.exit(1);
});
