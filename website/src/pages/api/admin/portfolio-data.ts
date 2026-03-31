import type { APIRoute } from 'astro';
import type { CmsMedia, PortfolioCategory } from '../../../lib/cms/types';
import { PORTFOLIO_CATEGORIES } from '../../../lib/cms/types';
import { readCms } from '../../../lib/cms/store';

export const prerender = false;

const ALLOWED = new Set(PORTFOLIO_CATEGORIES.map((c) => c.id));

function mediaIdsForEntry(p: { kind: string; mediaId?: string; beforeMediaId?: string; afterMediaId?: string }): string[] {
	if (p.kind === 'image' || p.kind === 'videoFile') return p.mediaId ? [p.mediaId] : [];
	if (p.kind === 'compare') return [p.beforeMediaId, p.afterMediaId].filter(Boolean) as string[];
	return [];
}

/**
 * Nur eine Portfolio-Kategorie + benötigte Medien-Thumbnails – aus CMS/DB, kompakt fürs Backpanel.
 */
export const GET: APIRoute = async ({ url }) => {
	const raw = url.searchParams.get('category') || 'bodenfotos';
	const category = raw as PortfolioCategory;
	if (!ALLOWED.has(category)) {
		return new Response(JSON.stringify({ error: 'Unbekannte Kategorie.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const cms = await readCms();
	const entries = cms.portfolio
		.filter((p) => (p as { category?: string }).category === category)
		.sort((a, b) => ((a as { sort?: number }).sort ?? 0) - ((b as { sort?: number }).sort ?? 0));

	const needed = new Set<string>();
	for (const p of entries) {
		for (const id of mediaIdsForEntry(p)) {
			if (id) needed.add(id);
		}
	}

	const media: CmsMedia[] = cms.media.filter((m) => needed.has(m.id));

	return new Response(
		JSON.stringify({
			category,
			entries,
			media,
			featuredPortfolioIds: Array.isArray(cms.featuredPortfolioIds) ? cms.featuredPortfolioIds : [],
			maxHomeTiles: 6,
		}),
		{
			status: 200,
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				'Cache-Control': 'no-store',
			},
		},
	);
};
