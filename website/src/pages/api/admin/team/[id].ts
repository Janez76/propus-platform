import type { APIRoute } from 'astro';
import { readCms, writeCms } from '../../../../lib/cms/store';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
	const id = params.id;
	if (!id) {
		return new Response(JSON.stringify({ error: 'Ungültige Anfrage.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	let body: {
		name?: string;
		role?: string;
		email?: string;
		bio?: string;
		mediaId?: string | null;
		sort?: number;
		enabled?: boolean;
	} = {};
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Ungültige Daten.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const cms = await readCms();
	const entry = cms.team.find((t) => t.id === id);
	if (!entry) {
		return new Response(JSON.stringify({ error: 'Person nicht gefunden.' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const mediaIds = new Set(cms.media.map((m) => m.id));

	if (body.name !== undefined) {
		const name = body.name.trim();
		if (!name) {
			return new Response(JSON.stringify({ error: 'Name darf nicht leer sein.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}
		entry.name = name;
	}
	if (body.role !== undefined) {
		const role = body.role.trim();
		if (!role) {
			return new Response(JSON.stringify({ error: 'Rolle darf nicht leer sein.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}
		entry.role = role;
	}
	if (body.email !== undefined) entry.email = body.email.trim();
	if (body.bio !== undefined) entry.bio = body.bio.trim();
	if (body.mediaId !== undefined) {
		const mid = body.mediaId === null || body.mediaId === '' ? '' : body.mediaId;
		if (mid && !mediaIds.has(mid)) {
			return new Response(JSON.stringify({ error: 'Porträt-Bild ungültig.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}
		entry.mediaId = mid;
	}
	if (body.sort !== undefined && typeof body.sort === 'number' && Number.isFinite(body.sort)) {
		entry.sort = body.sort;
	}

	if (body.enabled !== undefined) {
		entry.enabled = body.enabled ? true : false;
	}

	await writeCms(cms);
	return new Response(JSON.stringify({ entry }), {
		status: 200,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};

export const DELETE: APIRoute = async ({ params }) => {
	const id = params.id;
	if (!id) {
		return new Response(JSON.stringify({ error: 'Ungültige Anfrage.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const cms = await readCms();
	const idx = cms.team.findIndex((t) => t.id === id);
	if (idx === -1) {
		return new Response(JSON.stringify({ error: 'Person nicht gefunden.' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	cms.team.splice(idx, 1);
	await writeCms(cms);

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
