import type { APIRoute } from 'astro';
import { readCms, writeCms } from '../../../../lib/cms/store';
import { mediaIsReferenced } from '../../../../lib/cms/references';
import {
	parseCmsStoragePathFromPublicUrl,
	removeFromCmsBucket,
} from '../../../../lib/supabase/storage';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
	const id = params.id;
	if (!id) {
		return new Response(JSON.stringify({ error: 'Ungültige Anfrage.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	let body: { alt?: string } = {};
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return new Response(JSON.stringify({ error: 'Ungültiges JSON.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const cms = await readCms();
	const media = cms.media.find((entry) => entry.id === id);
	if (!media) {
		return new Response(JSON.stringify({ error: 'Bild nicht gefunden.' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	media.alt = typeof body.alt === 'string' ? body.alt.trim() : '';
	await writeCms(cms);
	return new Response(JSON.stringify({ ok: true, media }), {
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
	const idx = cms.media.findIndex((m) => m.id === id);
	if (idx === -1) {
		return new Response(JSON.stringify({ error: 'Bild nicht gefunden.' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	if (mediaIsReferenced(cms, id)) {
		return new Response(
			JSON.stringify({
				error:
					'Dieses Bild wird noch im Portfolio, beim Team, bei Kundenlogos, bei Dienstleistungen, als Header-Logo (Hell/Dunkel) oder Favicon verwendet und kann nicht gelöscht werden.',
			}),
			{ status: 409, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
		);
	}

	const [removed] = cms.media.splice(idx, 1);
	await writeCms(cms);

	const storagePath = parseCmsStoragePathFromPublicUrl(removed.src);
	if (storagePath && !storagePath.includes('..') && !storagePath.startsWith('/')) {
		await removeFromCmsBucket(storagePath);
	}

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
