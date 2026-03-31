#!/usr/bin/env node
/**
 * Einmalig: kompletten CMS-Stand aus `data/cms.json` nach Supabase übernehmen.
 * - Validiert Payload (version 1 + media[]).
 * - Lädt alle referenzierten Dateien unter `public/uploads/cms/` in den Bucket `cms` hoch.
 * - Ersetzt `/uploads/cms/...` im Payload durch öffentliche Storage-URLs (wie migrate:uploads).
 * - Schreibt das Ergebnis nach `cms_state` (id=1).
 * - Entfernt erfolgreich hochgeladene Dateien aus `public/uploads/cms/` (wie migrate:uploads).
 *
 * Voraussetzung: .env mit SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, Bucket „cms“, Tabelle cms_state.
 * Aufruf: npm run import:cms
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CMS_JSON = path.join(ROOT, 'data', 'cms.json');
const UPLOAD_DIR = path.join(ROOT, 'public', 'uploads', 'cms');
const BUCKET = 'cms';
const PREFIX = '/uploads/cms/';

function contentTypeForExt(filename) {
	const lower = filename.toLowerCase();
	if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
	if (lower.endsWith('.png')) return 'image/png';
	if (lower.endsWith('.webp')) return 'image/webp';
	if (lower.endsWith('.gif')) return 'image/gif';
	if (lower.endsWith('.svg')) return 'image/svg+xml';
	if (lower.endsWith('.ico')) return 'image/x-icon';
	if (lower.endsWith('.mp4')) return 'video/mp4';
	if (lower.endsWith('.webm')) return 'video/webm';
	if (lower.endsWith('.mov')) return 'video/quicktime';
	return 'application/octet-stream';
}

function collectReferencedFilenames(payload) {
	const names = new Set();
	function walk(x) {
		if (typeof x === 'string' && x.startsWith(PREFIX)) {
			const rest = x.slice(PREFIX.length).split('?')[0].split('#')[0];
			if (rest && !rest.includes('/') && !rest.includes('..')) names.add(rest);
		} else if (Array.isArray(x)) x.forEach(walk);
		else if (x && typeof x === 'object') Object.values(x).forEach(walk);
	}
	walk(payload);
	return names;
}

function replaceUrls(obj, map) {
	if (obj === null || obj === undefined) return obj;
	if (typeof obj === 'string') return map[obj] ?? obj;
	if (Array.isArray(obj)) return obj.map((x) => replaceUrls(x, map));
	if (typeof obj === 'object') {
		const out = {};
		for (const [k, v] of Object.entries(obj)) {
			out[k] = replaceUrls(v, map);
		}
		return out;
	}
	return obj;
}

function countUploadsPrefix(obj) {
	let n = 0;
	function w(x) {
		if (typeof x === 'string' && x.startsWith(PREFIX)) n++;
		else if (Array.isArray(x)) x.forEach(w);
		else if (x && typeof x === 'object') Object.values(x).forEach(w);
	}
	w(obj);
	return n;
}

async function listBucketFilenames(supabase) {
	const names = new Set();
	let offset = 0;
	const limit = 1000;
	for (;;) {
		const { data, error } = await supabase.storage.from(BUCKET).list('', {
			limit,
			offset,
			sortBy: { column: 'name', order: 'asc' },
		});
		if (error) throw new Error(error.message);
		if (!data?.length) break;
		for (const f of data) {
			if (f?.name) names.add(f.name);
		}
		if (data.length < limit) break;
		offset += limit;
	}
	return names;
}

function isValidCmsPayload(p) {
	return p && typeof p === 'object' && p.version === 1 && Array.isArray(p.media);
}

async function main() {
	const url = process.env.SUPABASE_URL?.trim();
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	if (!url || !key) {
		console.error('Fehlt SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY (.env).');
		process.exit(1);
	}

	const supabase = createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false },
	});

	let raw;
	try {
		raw = await fs.readFile(CMS_JSON, 'utf8');
	} catch (e) {
		console.error('data/cms.json nicht lesbar:', e?.message || e);
		process.exit(1);
	}

	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (e) {
		console.error('data/cms.json ist kein gültiges JSON:', e?.message || e);
		process.exit(1);
	}

	if (!isValidCmsPayload(parsed)) {
		console.error('data/cms.json: erwartet version: 1 und media-Array.');
		process.exit(1);
	}

	const payload = structuredClone(parsed);
	console.log(`CMS geladen von: ${CMS_JSON} (${payload.media?.length ?? 0} Medien)`);

	const refNames = collectReferencedFilenames(payload);
	let diskNames = new Set();
	try {
		const names = await fs.readdir(UPLOAD_DIR);
		for (const n of names) {
			if (n === '.gitkeep' || n.startsWith('.')) continue;
			const full = path.join(UPLOAD_DIR, n);
			const st = await fs.stat(full).catch(() => null);
			if (st?.isFile()) diskNames.add(n);
		}
	} catch {
		diskNames = new Set();
	}

	const toProcess = new Set([...refNames, ...diskNames]);
	console.log(
		`Referenzen ${PREFIX}: ${refNames.size}, Dateien lokal: ${diskNames.size}, eindeutig: ${toProcess.size}`,
	);

	let inBucket;
	try {
		inBucket = await listBucketFilenames(supabase);
		console.log(`Dateien bereits im Bucket „${BUCKET}“: ${inBucket.size}`);
	} catch (e) {
		console.error('Bucket-Liste fehlgeschlagen:', e?.message || e);
		process.exit(1);
	}

	const urlMap = {};
	const uploadedFromDisk = [];
	const failed = [];

	for (const name of toProcess) {
		const oldPath = `${PREFIX}${name}`;
		const diskFull = path.join(UPLOAD_DIR, name);

		let fromDisk = false;
		try {
			await fs.access(diskFull);
			fromDisk = (await fs.stat(diskFull)).isFile();
		} catch {
			fromDisk = false;
		}

		if (fromDisk) {
			const buffer = await fs.readFile(diskFull);
			const ct = contentTypeForExt(name);
			const { error: upErr } = await supabase.storage.from(BUCKET).upload(name, buffer, {
				contentType: ct,
				upsert: true,
			});
			if (upErr) {
				console.error(`Upload fehlgeschlagen: ${name} – ${upErr.message}`);
				failed.push(name);
				continue;
			}
			const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(name);
			urlMap[oldPath] = pub.publicUrl;
			uploadedFromDisk.push(name);
			console.log(`Hochgeladen: ${oldPath}`);
			continue;
		}

		if (inBucket.has(name)) {
			const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(name);
			urlMap[oldPath] = pub.publicUrl;
			console.log(`URL setzen (bereits im Bucket): ${name}`);
		} else if (refNames.has(name)) {
			console.warn(`WARNUNG: Verweis ${oldPath}, Datei fehlt lokal und im Bucket.`);
		}
	}

	const beforeRefs = countUploadsPrefix(payload);
	const updated = replaceUrls(payload, urlMap);
	const afterRefs = countUploadsPrefix(updated);
	console.log(`Pfade ${PREFIX}: vorher ${beforeRefs}, nachher ${afterRefs}`);

	const { error: writeErr } = await supabase.from('cms_state').upsert(
		{
			id: 1,
			payload: updated,
			updated_at: new Date().toISOString(),
		},
		{ onConflict: 'id' },
	);
	if (writeErr) {
		console.error('cms_state speichern fehlgeschlagen:', writeErr.message);
		process.exit(1);
	}
	console.log('CMS-Payload vollständig in Supabase gespeichert (cms_state id=1).');

	for (const name of uploadedFromDisk) {
		await fs.unlink(path.join(UPLOAD_DIR, name)).catch(() => {});
	}
	if (uploadedFromDisk.length) {
		console.log(`${uploadedFromDisk.length} lokale Datei(en) nach Upload aus public/uploads/cms entfernt.`);
	}

	if (failed.length) {
		console.warn(`${failed.length} Upload(s) fehlgeschlagen – Payload wurde trotzdem geschrieben; fehlende Medien prüfen.`);
		process.exit(1);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
