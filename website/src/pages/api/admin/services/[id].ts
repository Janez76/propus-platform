import type { APIRoute } from 'astro';
import { normalizeClientLogoImageUrl } from '../../../../lib/cms/clientLogoUrl';
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
		title?: string;
		slogan?: string;
		body?: string;
		imageUrl?: string;
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
	if (!Array.isArray(cms.services)) cms.services = [];
	const entry = cms.services.find((s) => s.id === id);
	if (!entry) {
		return new Response(JSON.stringify({ error: 'Leistung nicht gefunden.' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const mediaIds = new Set(cms.media.map((m) => m.id));

	if (body.title !== undefined) {
		const t = body.title.trim();
		if (!t) {
			return new Response(JSON.stringify({ error: 'Titel darf nicht leer sein.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}
		entry.title = t;
	}
	if (body.slogan !== undefined) {
		const s = body.slogan.trim();
		if (!s) {
			return new Response(JSON.stringify({ error: 'Slogan darf nicht leer sein.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}
		entry.slogan = s;
	}
	if (body.body !== undefined) {
		const b = body.body.trim();
		if (!b) {
			return new Response(JSON.stringify({ error: 'Text darf nicht leer sein.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}
		entry.body = b;
	}

	if (body.imageUrl !== undefined) {
		const u = normalizeClientLogoImageUrl(String(body.imageUrl));
		if (!u) {
			return new Response(JSON.stringify({ error: 'Ungültige Bild-URL.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}
		entry.imageUrl = u;
		delete entry.mediaId;
	}

	if (body.mediaId !== undefined) {
		const mid = body.mediaId === null || body.mediaId === '' ? '' : String(body.mediaId).trim();
		if (mid && !mediaIds.has(mid)) {
			return new Response(JSON.stringify({ error: 'Bild-Referenz ungültig.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}
		if (mid) {
			entry.mediaId = mid;
			delete entry.imageUrl;
		} else {
			delete entry.mediaId;
		}
	}

	if (body.sort !== undefined && typeof body.sort === 'number' && Number.isFinite(body.sort)) {
		entry.sort = body.sort;
	}
	if (body.enabled !== undefined) {
		entry.enabled = body.enabled ? true : false;
	}

	const url = (entry.imageUrl || '').trim();
	const mid = (entry.mediaId || '').trim();
	const hasImg = Boolean(url || (mid && mediaIds.has(mid)));
	if (!hasImg) {
		return new Response(JSON.stringify({ error: 'Es fehlt ein gültiges Bild (URL oder Medien-ID).' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
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
	if (!Array.isArray(cms.services)) cms.services = [];
	const idx = cms.services.findIndex((s) => s.id === id);
	if (idx === -1) {
		return new Response(JSON.stringify({ error: 'Leistung nicht gefunden.' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	cms.services.splice(idx, 1);
	await writeCms(cms);

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
