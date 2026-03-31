import type { APIRoute } from 'astro';
import { readCms, writeCms } from '../../../../lib/cms/store';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	let body: { ids?: string[] } = {};
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Ungültige Daten.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const ids = body.ids;
	if (!Array.isArray(ids)) {
		return new Response(JSON.stringify({ error: 'Es wird eine Liste von IDs erwartet.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const cms = await readCms();
	const idSet = new Set(cms.clientLogos.map((c) => c.id));

	for (let i = 0; i < ids.length; i++) {
		const lid = ids[i];
		if (!idSet.has(lid)) continue;
		const entry = cms.clientLogos.find((c) => c.id === lid);
		if (entry) entry.sort = i * 10;
	}

	await writeCms(cms);
	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
