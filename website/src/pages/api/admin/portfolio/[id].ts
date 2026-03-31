import type { APIRoute } from 'astro';
import { matterportEmbedUrl, youtubeEmbedUrl } from '../../../../lib/embeds';
import { readCms, writeCms } from '../../../../lib/cms/store';
import type { PortfolioCategory } from '../../../../lib/cms/types';
import { isCompareCategory, PORTFOLIO_CATEGORIES } from '../../../../lib/cms/types';

export const prerender = false;

const categorySet = new Set(PORTFOLIO_CATEGORIES.map((c) => c.id));

export const PATCH: APIRoute = async ({ params, request }) => {
	const id = params.id;
	if (!id) {
		return new Response(JSON.stringify({ error: 'Ungültige Anfrage.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	let body: {
		category?: PortfolioCategory;
		sort?: number;
		mediaId?: string;
		beforeMediaId?: string;
		afterMediaId?: string;
		sourceUrl?: string;
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
	const entry = cms.portfolio.find((p) => p.id === id);
	if (!entry) {
		return new Response(JSON.stringify({ error: 'Eintrag nicht gefunden.' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const mediaIds = new Set(cms.media.map((m) => m.id));

	if (body.category !== undefined) {
		if (!categorySet.has(body.category)) {
			return new Response(JSON.stringify({ error: 'Ungültige Kategorie.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}
		if (entry.kind === 'compare' && !isCompareCategory(body.category)) {
			return new Response(
				JSON.stringify({ error: 'Vorher/Nachher-Einträge nur in Staging oder Retusche.' }),
				{ status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
			);
		}
		if (entry.kind === 'matterport' && body.category !== 'tour360') {
			return new Response(
				JSON.stringify({ error: 'Matterport bleibt in der Kategorie 360° Rundgang.' }),
				{ status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
			);
		}
		if (entry.kind === 'youtube' && body.category !== 'video') {
			return new Response(
				JSON.stringify({ error: 'YouTube bleibt in der Kategorie Video.' }),
				{ status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
			);
		}
		if (body.category === 'tour360' && entry.kind !== 'matterport') {
			return new Response(
				JSON.stringify({
					error:
						'In „360° Rundgang“ sind nur Matterport-Einträge erlaubt. Andere Einträge bitte entfernen oder nicht in diese Kategorie verschieben.',
				}),
				{ status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
			);
		}
		entry.category = body.category;
	}

	if (body.sort !== undefined && typeof body.sort === 'number' && Number.isFinite(body.sort)) {
		entry.sort = body.sort;
	}

	if (entry.kind === 'image' && body.mediaId !== undefined) {
		if (!mediaIds.has(body.mediaId)) {
			return new Response(JSON.stringify({ error: 'Bild nicht gefunden.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}
		entry.mediaId = body.mediaId;
	}

	if (entry.kind === 'compare') {
		if (body.beforeMediaId !== undefined) {
			if (!mediaIds.has(body.beforeMediaId)) {
				return new Response(JSON.stringify({ error: 'Vorher-Bild ungültig.' }), {
					status: 400,
					headers: { 'Content-Type': 'application/json; charset=utf-8' },
				});
			}
			entry.beforeMediaId = body.beforeMediaId;
		}
		if (body.afterMediaId !== undefined) {
			if (!mediaIds.has(body.afterMediaId)) {
				return new Response(JSON.stringify({ error: 'Nachher-Bild ungültig.' }), {
					status: 400,
					headers: { 'Content-Type': 'application/json; charset=utf-8' },
				});
			}
			entry.afterMediaId = body.afterMediaId;
		}
	}

	if (entry.kind === 'matterport' && body.sourceUrl !== undefined) {
		const s = body.sourceUrl.trim();
		if (!s || !matterportEmbedUrl(s)) {
			return new Response(JSON.stringify({ error: 'Ungültiger Matterport-Link.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}
		entry.sourceUrl = s;
	}

	if (entry.kind === 'youtube' && body.sourceUrl !== undefined) {
		const s = body.sourceUrl.trim();
		if (!s || !youtubeEmbedUrl(s)) {
			return new Response(JSON.stringify({ error: 'Ungültiger YouTube-Link.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}
		entry.sourceUrl = s;
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
	const idx = cms.portfolio.findIndex((p) => p.id === id);
	if (idx === -1) {
		return new Response(JSON.stringify({ error: 'Eintrag nicht gefunden.' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	cms.portfolio.splice(idx, 1);
	cms.featuredPortfolioIds = cms.featuredPortfolioIds.filter((fid) => fid !== id);
	await writeCms(cms);

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
