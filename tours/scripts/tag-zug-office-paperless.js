#!/usr/bin/env node
/**
 * Setzt nachträglich den Paperless-Tag "ZUG Office" auf alle Dokumente,
 * deren Original-Filename auf das Schema vom OGZ-Download zeigt
 * (Präfix `YYYY-MM-DD__` und Original aus js@propus.ch / ZUG Office Folder).
 *
 * Voraussetzung: ENV-Vars
 *   PAPERLESS_URL    z.B. https://paperless.propus.ch
 *   PAPERLESS_TOKEN  Admin- oder Service-User-Token
 *
 * Verwendung:
 *   node tours/scripts/tag-zug-office-paperless.js          # Dry-Run
 *   node tours/scripts/tag-zug-office-paperless.js --apply  # echte Tag-Updates
 *
 * Strategie:
 *   1. Tag "ZUG Office" suchen oder anlegen.
 *   2. Dokumente listen, deren original_file_name mit `YYYY-MM-DD__` startet
 *      und `Propus_` oder `Invoice` oder `Receipt` enthält (das Naming aus
 *      download-ogz-attachments.js). Über mehrere Seiten paginieren.
 *   3. Für jedes passende Dokument den Tag hinzufügen (idempotent, vorhandene
 *      Tags bleiben).
 */
'use strict';

const URL_BASE = (process.env.PAPERLESS_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.PAPERLESS_TOKEN || '';
const TAG_NAME = 'ZUG Office';
const APPLY = process.argv.includes('--apply');

if (!URL_BASE || !TOKEN) {
  console.error('PAPERLESS_URL und PAPERLESS_TOKEN als Env-Variablen setzen.');
  process.exit(1);
}

async function pl(path, init = {}) {
  const res = await fetch(`${URL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!res.ok) {
    const err = `HTTP ${res.status} ${res.statusText} – ${typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)}`;
    throw new Error(err);
  }
  return data;
}

async function findOrCreateTag(name) {
  const found = await pl(`/api/tags/?name__iexact=${encodeURIComponent(name)}&page_size=10`);
  const hit = (found?.results || []).find((t) => t.name === name);
  if (hit) return hit;
  if (!APPLY) {
    console.log(`[plan] Tag "${name}" würde angelegt`);
    return { id: null, name };
  }
  const created = await pl('/api/tags/', { method: 'POST', body: JSON.stringify({ name, color: '#6FA8DC' }) });
  console.log(`[ok] Tag "${name}" angelegt (id=${created.id})`);
  return created;
}

function looksLikeOgzFile(originalName) {
  if (!originalName) return false;
  if (!/^\d{4}-\d{2}-\d{2}__/.test(originalName)) return false;
  return /Propus_|Invoice|Receipt|Porpus_/.test(originalName);
}

async function listOgzDocuments() {
  const out = [];
  let url = `/api/documents/?page_size=100&ordering=-created`;
  while (url) {
    const data = await pl(url);
    for (const doc of (data.results || [])) {
      if (looksLikeOgzFile(doc.original_file_name) || looksLikeOgzFile(doc.title)) {
        out.push({ id: doc.id, title: doc.title, original_file_name: doc.original_file_name, tags: doc.tags || [] });
      }
    }
    if (data.next) {
      const u = new URL(data.next);
      url = u.pathname + u.search;
    } else {
      url = null;
    }
  }
  return out;
}

async function ensureTagOnDoc(docId, currentTags, tagId) {
  if (currentTags.includes(tagId)) return { skipped: true };
  const newTags = [...currentTags, tagId];
  await pl(`/api/documents/${docId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ tags: newTags }),
  });
  return { skipped: false };
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Paperless: ${URL_BASE}`);
  const tag = await findOrCreateTag(TAG_NAME);

  const docs = await listOgzDocuments();
  console.log(`Treffer: ${docs.length} Dokumente`);

  if (!APPLY || !tag.id) {
    for (const d of docs.slice(0, 10)) {
      console.log(`  - id=${d.id}  ${d.original_file_name || d.title}  (tags=${d.tags.length})`);
    }
    if (docs.length > 10) console.log(`  ... +${docs.length - 10} weitere`);
    if (!APPLY) console.log('Dry-Run – mit --apply tatsächlich taggen.');
    return;
  }

  let added = 0;
  let skipped = 0;
  let errors = 0;
  for (const d of docs) {
    try {
      const r = await ensureTagOnDoc(d.id, d.tags, tag.id);
      if (r.skipped) skipped += 1; else added += 1;
    } catch (e) {
      errors += 1;
      console.error(`Fehler doc ${d.id}: ${e.message}`);
    }
  }
  console.log(`Fertig: getaggt=${added} schon_vorhanden=${skipped} Fehler=${errors}`);
}

main().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
