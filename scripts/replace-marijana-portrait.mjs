#!/usr/bin/env node
/**
 * Ersetzt Marijanas Porträt im Live-CMS (propus.ch).
 *
 * Verwendung:
 *   PROPUS_BASE=https://propus.ch PROPUS_ADMIN_USER=admin PROPUS_ADMIN_PASS=xxx node scripts/replace-marijana-portrait.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = (process.env.PROPUS_BASE || 'https://propus.ch').replace(/\/$/, '');
const USER = process.env.PROPUS_ADMIN_USER || 'admin';
const PASS = process.env.PROPUS_ADMIN_PASS || '';
const IMG = path.resolve(__dirname, '../website/public/team/marijana-mijajlovic.jpg');

if (!PASS) {
	console.error('Fehler: PROPUS_ADMIN_PASS ist nicht gesetzt.');
	process.exit(1);
}

// --- 1. Einloggen ---
console.log(`Logge ein auf ${BASE} …`);
const loginRes = await fetch(`${BASE}/api/admin/login`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ username: USER, password: PASS }),
	redirect: 'manual',
});

if (!loginRes.ok) {
	const text = await loginRes.text();
	console.error('Login fehlgeschlagen:', loginRes.status, text);
	process.exit(1);
}

const setCookie = loginRes.headers.get('set-cookie') || '';
const cookieMatch = setCookie.match(/propus_admin=([^;]+)/);
if (!cookieMatch) {
	console.error('Kein Session-Cookie erhalten. Set-Cookie:', setCookie);
	process.exit(1);
}
const cookie = `propus_admin=${cookieMatch[1]}`;
console.log('Login erfolgreich.');

// --- 2. Bild hochladen ---
console.log(`Lade Bild hoch: ${IMG} …`);
const fileBytes = await fs.readFile(IMG);
const formData = new FormData();
formData.append(
	'file',
	new Blob([fileBytes], { type: 'image/jpeg' }),
	'marijana-mijajlovic.jpg',
);
formData.append('alt', 'Marijana Mijajlović');

const uploadRes = await fetch(`${BASE}/api/admin/media`, {
	method: 'POST',
	headers: { cookie },
	body: formData,
});

if (!uploadRes.ok) {
	const text = await uploadRes.text();
	console.error('Upload fehlgeschlagen:', uploadRes.status, text);
	process.exit(1);
}

const { media } = await uploadRes.json();
console.log(`Bild hochgeladen. Media-ID: ${media.id}`);

// --- 3. CMS-State lesen, Marijana finden ---
console.log('Lese CMS-State …');
const cmsRes = await fetch(`${BASE}/api/admin/cms`, {
	headers: { cookie },
});

if (!cmsRes.ok) {
	console.error('CMS-State konnte nicht gelesen werden:', cmsRes.status);
	process.exit(1);
}

const cms = await cmsRes.json();
const marijana = Array.isArray(cms?.team)
	? cms.team.find((t) => /marijana/i.test(t.name))
	: null;

if (!marijana) {
	console.error('Marijana nicht im CMS gefunden. Vorhandene Teammitglieder:', cms?.team?.map((t) => t.name));
	process.exit(1);
}

console.log(`Marijana gefunden (ID: ${marijana.id}). Aktualisiere mediaId …`);

// --- 4. mediaId patchen ---
const patchRes = await fetch(`${BASE}/api/admin/team/${marijana.id}`, {
	method: 'PATCH',
	headers: {
		cookie,
		'Content-Type': 'application/json',
	},
	body: JSON.stringify({ mediaId: media.id }),
});

if (!patchRes.ok) {
	const text = await patchRes.text();
	console.error('PATCH fehlgeschlagen:', patchRes.status, text);
	process.exit(1);
}

const result = await patchRes.json();
console.log('Fertig! Marijanas Porträt wurde erfolgreich aktualisiert.');
console.log('Eintrag:', JSON.stringify(result.entry, null, 2));
