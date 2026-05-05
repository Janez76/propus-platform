/**
 * Persistenz für Benutzer-Korrekturen pro Modell.
 *
 * Ablage: <toolDir>/data/corrections/<modelId>.json
 *
 * Schema:
 * {
 *   "modelId": "abc123",
 *   "updatedAt": "2026-05-03T17:00:00.000Z",
 *   "rooms": {
 *     "<roomId>": { "name": "BÜRO", "kategorie": "buero" }
 *   }
 * }
 *
 * Anwendung: nach classifyRooms + validateRooms wird diese Map drüber-
 * gemerged — User-Korrekturen schlagen alles andere.
 */

import fs from 'fs/promises';
import path from 'path';

const KATEGORIE_KEYS = new Set([
  'wohnen',
  'essen',
  'kueche',
  'wohnen_essen_kueche',
  'schlafen',
  'kind',
  'buero',
  'bad',
  'wc',
  'reduit',
  'wic',
  'gang',
  'eingang',
  'terrasse',
  'balkon',
  'patio',
  'unbekannt',
]);

function safeId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

function corrPath(rootDir, modelId) {
  return path.join(rootDir, 'data', 'corrections', `${safeId(modelId)}.json`);
}

export async function loadCorrections(rootDir, modelId) {
  const file = corrPath(rootDir, modelId);
  try {
    const raw = await fs.readFile(file, 'utf-8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !data.rooms) return { modelId, rooms: {} };
    return data;
  } catch (e) {
    if (e.code === 'ENOENT') return { modelId, rooms: {} };
    console.warn(`[corrections] read failed for ${modelId}:`, e.message);
    return { modelId, rooms: {} };
  }
}

export async function saveCorrections(rootDir, modelId, payload) {
  const dir = path.join(rootDir, 'data', 'corrections');
  await fs.mkdir(dir, { recursive: true });
  const file = corrPath(rootDir, modelId);

  const cleaned = { modelId, updatedAt: new Date().toISOString(), rooms: {} };
  const incoming = (payload && payload.rooms) || {};
  for (const [id, val] of Object.entries(incoming)) {
    if (!val || typeof val !== 'object') continue;
    const name = String(val.name || '').trim().toUpperCase().slice(0, 60);
    const katRaw = String(val.kategorie || '').toLowerCase();
    const kategorie = KATEGORIE_KEYS.has(katRaw) ? katRaw : 'unbekannt';
    if (!name) continue;
    cleaned.rooms[String(id)] = { name, kategorie };
  }

  await fs.writeFile(file, JSON.stringify(cleaned, null, 2), 'utf-8');
  return cleaned;
}

/**
 * Wendet User-Korrekturen auf eine bestehende naming-Map an.
 * Korrekturen überschreiben.
 */
export function applyCorrections(naming, corrections) {
  const map = new Map(naming);
  const rooms = (corrections && corrections.rooms) || {};
  let applied = 0;
  for (const [id, val] of Object.entries(rooms)) {
    if (!val || !val.name) continue;
    map.set(id, { name: val.name, kategorie: val.kategorie || 'unbekannt' });
    applied += 1;
  }
  return { map, applied };
}
