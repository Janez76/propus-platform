import type { APIRoute } from 'astro';
import { readCms, writeCms } from '../../../../lib/cms/store';
import type { PortfolioCategory } from '../../../../lib/cms/types';
import { PORTFOLIO_CATEGORIES } from '../../../../lib/cms/types';

export const prerender = false;

const categorySet = new Set(PORTFOLIO_CATEGORIES.map((c) => c.id));

export const POST: APIRoute = async ({ request }) => {
	let body: { category?: PortfolioCategory; ids?: string[] } = {};
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Ungültige Daten.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const category = body.category;
	const ids = body.ids;
	if (!category || !categorySet.has(category) || !Array.isArray(ids)) {
		return new Response(JSON.stringify({ error: 'Kategorie und Reihenfolge (ids) sind erforderlich.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const cms = await readCms();
	const inCat = cms.portfolio.filter((p) => p.category === category);
	const idSet = new Set(inCat.map((p) => p.id));

	for (let i = 0; i < ids.length; i++) {
		const id = ids[i];
		if (!idSet.has(id)) continue;
		const entry = cms.portfolio.find((p) => p.id === id);
		if (entry) entry.sort = i * 10;
	}

	await writeCms(cms);
	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
