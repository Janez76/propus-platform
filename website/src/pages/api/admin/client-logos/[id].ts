import type { APIRoute } from 'astro';
import {
	normalizeClientLogoImageUrl,
	resolveClientLogoDisplayName,
} from '../../../../lib/cms/clientLogoUrl';
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

	let body: { imageUrl?: string; sort?: number; enabled?: boolean } = {};
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Ungültige Daten.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const cms = await readCms();
	const entry = cms.clientLogos.find((c) => c.id === id);
	if (!entry) {
		return new Response(JSON.stringify({ error: 'Logo nicht gefunden.' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	if (body.imageUrl !== undefined) {
		const u = normalizeClientLogoImageUrl(String(body.imageUrl));
		if (!u) {
			return new Response(
				JSON.stringify({
					error:
						'Ungültige Bild-URL (https://… oder Pfad ab /).',
				}),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json; charset=utf-8' },
				},
			);
		}
		entry.imageUrl = u;
		delete entry.mediaId;
		entry.name = resolveClientLogoDisplayName('', u);
	}
	if (body.sort !== undefined && typeof body.sort === 'number' && Number.isFinite(body.sort)) {
		entry.sort = body.sort;
	}
	if (body.enabled !== undefined) {
		entry.enabled = body.enabled ? true : false;
	}

	const hasSource = Boolean((entry.imageUrl || '').trim() || (entry.mediaId || '').trim());
	if (!hasSource) {
		return new Response(JSON.stringify({ error: 'Bild-URL fehlt.' }), {
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
	const idx = cms.clientLogos.findIndex((c) => c.id === id);
	if (idx === -1) {
		return new Response(JSON.stringify({ error: 'Logo nicht gefunden.' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	cms.clientLogos.splice(idx, 1);
	await writeCms(cms);

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
