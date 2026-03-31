import type { APIRoute } from 'astro';
import { readCms, writeCms } from '../../../../lib/cms/store';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	let body: { name?: string; role?: string; email?: string; bio?: string; mediaId?: string } = {};
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Ungültige Daten.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const name = (body.name || '').trim();
	const role = (body.role || '').trim();
	const bio = (body.bio || '').trim();
	if (!name || !role) {
		return new Response(JSON.stringify({ error: 'Name und Rolle sind Pflichtfelder.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const cms = await readCms();
	const mediaIds = new Set(cms.media.map((m) => m.id));
	const mediaId = body.mediaId || '';
	if (mediaId && !mediaIds.has(mediaId)) {
		return new Response(JSON.stringify({ error: 'Ungültige Bild-Referenz.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const sorts = cms.team.map((t) => t.sort);
	const sort = (sorts.length ? Math.max(...sorts) : 0) + 10;

	const entry = {
		id: crypto.randomUUID(),
		sort,
		name,
		role,
		email: (body.email || '').trim(),
		bio,
		mediaId,
		enabled: true as const,
	};

	cms.team.push(entry);
	await writeCms(cms);

	return new Response(JSON.stringify({ entry }), {
		status: 201,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
