import type { APIRoute } from 'astro';
import { readCms, writeCms } from '../../../lib/cms/store';

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
		return new Response(JSON.stringify({ error: 'Es wird eine Liste von Bild-IDs erwartet.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const cms = await readCms();
	const valid: string[] = [];
	const seen = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) continue;
		const p = cms.portfolio.find((x) => x.id === id);
		if (p && p.kind === 'image' && p.enabled !== false) {
			valid.push(id);
			seen.add(id);
		}
	}

	cms.featuredPortfolioIds = valid;
	await writeCms(cms);

	return new Response(JSON.stringify({ featuredPortfolioIds: valid }), {
		status: 200,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
