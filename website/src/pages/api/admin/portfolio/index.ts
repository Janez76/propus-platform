import type { APIRoute } from 'astro';
import { matterportEmbedUrl, youtubeEmbedUrl } from '../../../../lib/embeds';
import { readCms, writeCms } from '../../../../lib/cms/store';
import { saveUploadedImageFile } from '../../../../lib/cms/saveUpload';
import type { CmsPortfolioEntry, PortfolioCategory } from '../../../../lib/cms/types';
import { isCompareCategory, PORTFOLIO_CATEGORIES } from '../../../../lib/cms/types';

export const prerender = false;

const categorySet = new Set(PORTFOLIO_CATEGORIES.map((c) => c.id));

function nextSortInCategory(
	cms: { portfolio: CmsPortfolioEntry[] },
	category: PortfolioCategory,
): number {
	const sorts = cms.portfolio.filter((p) => p.category === category).map((p) => p.sort);
	return (sorts.length ? Math.max(...sorts) : 0) + 10;
}

export const POST: APIRoute = async ({ request }) => {
	const cms = await readCms();
	const ct = request.headers.get('content-type') || '';

	if (ct.includes('multipart/form-data')) {
		const form = await request.formData();
		const kind = String(form.get('kind') || '');
		const category = form.get('category') as PortfolioCategory;

		if (!category || !categorySet.has(category)) {
			return new Response(JSON.stringify({ error: 'Ungültige Kategorie.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}

		if (kind === 'image') {
			if (category === 'tour360') {
				return new Response(
					JSON.stringify({
						error:
							'In „360° Rundgang“ sind nur Matterport-Links möglich – bitte das Feld „Matterport einbinden“ nutzen.',
					}),
					{ status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
				);
			}
			const file = form.get('file');
			if (!file || !(file instanceof File)) {
				return new Response(JSON.stringify({ error: 'Bitte eine Bilddatei wählen.' }), {
					status: 400,
					headers: { 'Content-Type': 'application/json; charset=utf-8' },
				});
			}
			try {
				const record = await saveUploadedImageFile(file);
				cms.media.push(record);
				const entry = {
					id: crypto.randomUUID(),
					kind: 'image' as const,
					category,
					sort: nextSortInCategory(cms, category),
					mediaId: record.id,
					enabled: true as const,
				};
				cms.portfolio.push(entry);
				await writeCms(cms);
				return new Response(JSON.stringify({ entry }), {
					status: 201,
					headers: { 'Content-Type': 'application/json; charset=utf-8' },
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'Upload fehlgeschlagen.';
				return new Response(JSON.stringify({ error: msg }), {
					status: 400,
					headers: { 'Content-Type': 'application/json; charset=utf-8' },
				});
			}
		}

		if (kind === 'compare') {
			if (!isCompareCategory(category)) {
				return new Response(
					JSON.stringify({ error: 'Vorher/Nachher nur bei Staging oder Retusche.' }),
					{ status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
				);
			}
			const bf = form.get('fileBefore');
			const af = form.get('fileAfter');
			if (!bf || !(bf instanceof File) || !af || !(af instanceof File)) {
				return new Response(
					JSON.stringify({ error: 'Bitte zwei Bilder (Vorher und Nachher) hochladen.' }),
					{ status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
				);
			}
			try {
				const before = await saveUploadedImageFile(bf);
				const after = await saveUploadedImageFile(af);
				cms.media.push(before, after);
				const entry = {
					id: crypto.randomUUID(),
					kind: 'compare' as const,
					category,
					sort: nextSortInCategory(cms, category),
					beforeMediaId: before.id,
					afterMediaId: after.id,
					enabled: true as const,
				};
				cms.portfolio.push(entry);
				await writeCms(cms);
				return new Response(JSON.stringify({ entry }), {
					status: 201,
					headers: { 'Content-Type': 'application/json; charset=utf-8' },
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'Upload fehlgeschlagen.';
				return new Response(JSON.stringify({ error: msg }), {
					status: 400,
					headers: { 'Content-Type': 'application/json; charset=utf-8' },
				});
			}
		}

		return new Response(JSON.stringify({ error: 'Unbekannter Upload-Typ.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	let body: {
		kind?: string;
		category?: PortfolioCategory;
		mediaId?: string;
		beforeMediaId?: string;
		afterMediaId?: string;
		sourceUrl?: string;
	} = {};
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Ungültige Daten.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const mediaIds = new Set(cms.media.map((m) => m.id));

	if (body.kind === 'image') {
		const category = body.category;
		const mediaId = body.mediaId;
		if (!category || !categorySet.has(category)) {
			return new Response(JSON.stringify({ error: 'Bitte eine gültige Kategorie wählen.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}
		if (category === 'tour360') {
			return new Response(
				JSON.stringify({
					error:
						'In „360° Rundgang“ sind nur Matterport-Links möglich – bitte kind „matterport“ mit sourceUrl verwenden.',
				}),
				{ status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
			);
		}
		if (!mediaId || !mediaIds.has(mediaId)) {
			return new Response(JSON.stringify({ error: 'Ungültige Bild-Referenz.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}
		const entry = {
			id: crypto.randomUUID(),
			kind: 'image' as const,
			category,
			sort: nextSortInCategory(cms, category),
			mediaId,
			enabled: true as const,
		};
		cms.portfolio.push(entry);
		await writeCms(cms);
		return new Response(JSON.stringify({ entry }), {
			status: 201,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	if (body.kind === 'compare') {
		const category = body.category;
		if (!category || !isCompareCategory(category)) {
			return new Response(
				JSON.stringify({ error: 'Vorher/Nachher ist nur bei Staging oder Retusche möglich.' }),
				{ status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
			);
		}
		const beforeMediaId = body.beforeMediaId;
		const afterMediaId = body.afterMediaId;
		if (!beforeMediaId || !afterMediaId || !mediaIds.has(beforeMediaId) || !mediaIds.has(afterMediaId)) {
			return new Response(
				JSON.stringify({ error: 'Bitte je ein gültiges Bild für Vorher und Nachher.' }),
				{ status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
			);
		}
		const entry = {
			id: crypto.randomUUID(),
			kind: 'compare' as const,
			category,
			sort: nextSortInCategory(cms, category),
			beforeMediaId,
			afterMediaId,
			enabled: true as const,
		};
		cms.portfolio.push(entry);
		await writeCms(cms);
		return new Response(JSON.stringify({ entry }), {
			status: 201,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	if (body.kind === 'matterport') {
		if (body.category !== 'tour360') {
			return new Response(
				JSON.stringify({ error: 'Matterport-Einträge gehören zur Kategorie 360° Rundgang.' }),
				{ status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
			);
		}
		const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : '';
		if (!sourceUrl || !matterportEmbedUrl(sourceUrl)) {
			return new Response(
				JSON.stringify({
					error:
						'Bitte einen gültigen Matterport-Link einfügen (z. B. https://my.matterport.com/show/?m=…).',
				}),
				{ status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
			);
		}
		const entry = {
			id: crypto.randomUUID(),
			kind: 'matterport' as const,
			category: 'tour360' as const,
			sort: nextSortInCategory(cms, 'tour360'),
			sourceUrl,
			enabled: true as const,
		};
		cms.portfolio.push(entry);
		await writeCms(cms);
		return new Response(JSON.stringify({ entry }), {
			status: 201,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	if (body.kind === 'youtube') {
		if (body.category !== 'video') {
			return new Response(
				JSON.stringify({ error: 'YouTube-Einträge gehören zur Kategorie Video.' }),
				{ status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
			);
		}
		const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : '';
		if (!sourceUrl || !youtubeEmbedUrl(sourceUrl)) {
			return new Response(
				JSON.stringify({ error: 'Bitte einen gültigen YouTube-Link einfügen.' }),
				{ status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
			);
		}
		const entry = {
			id: crypto.randomUUID(),
			kind: 'youtube' as const,
			category: 'video' as const,
			sort: nextSortInCategory(cms, 'video'),
			sourceUrl,
			enabled: true as const,
		};
		cms.portfolio.push(entry);
		await writeCms(cms);
		return new Response(JSON.stringify({ entry }), {
			status: 201,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	return new Response(JSON.stringify({ error: 'Unbekannter Eintragstyp.' }), {
		status: 400,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
