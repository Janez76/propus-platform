import type { APIRoute } from 'astro';
import { servicesDetailSections } from '../../../../content/services-detail';
import { normalizeClientLogoImageUrl } from '../../../../lib/cms/clientLogoUrl';
import { readCms, writeCms } from '../../../../lib/cms/store';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	let body: {
		importDefault?: boolean;
		replaceExisting?: boolean;
		title?: string;
		slogan?: string;
		body?: string;
		imageUrl?: string;
		mediaId?: string;
	} = {};
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Ungültige Daten.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	if (body.importDefault === true) {
		const cms = await readCms();
		if (!Array.isArray(cms.services)) cms.services = [];
		const replace = body.replaceExisting === true;
		if (cms.services.length > 0 && !replace) {
			return new Response(
				JSON.stringify({
					error:
						'Es sind bereits Leistungen gespeichert. Im Backpanel „Standard übernehmen“ nutzen (ersetzt nach Bestätigung alle Karten).',
				}),
				{ status: 409, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
			);
		}
		cms.services = servicesDetailSections.map((s, i) => ({
			id: s.id,
			sort: i * 10,
			title: s.title,
			slogan: s.slogan,
			body: s.body,
			imageAlt: s.imageAlt,
			imageUrl: s.imageSrc,
			width: s.width,
			height: s.height,
			enabled: true as const,
		}));
		await writeCms(cms);
		return new Response(JSON.stringify({ ok: true, count: cms.services.length }), {
			status: 201,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const title = (body.title || '').trim();
	const slogan = (body.slogan || '').trim();
	const text = (body.body || '').trim();
	if (!title || !slogan || !text) {
		return new Response(JSON.stringify({ error: 'Titel, Slogan und Text sind Pflichtfelder.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const cms = await readCms();
	if (!Array.isArray(cms.services)) cms.services = [];
	const mediaIds = new Set(cms.media.map((m) => m.id));

	const imageUrl = normalizeClientLogoImageUrl(body.imageUrl ?? '');
	const mediaId = (body.mediaId || '').trim();
	if (!imageUrl && !mediaId) {
		return new Response(JSON.stringify({ error: 'Bitte Bild-URL angeben oder Datei hochladen.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}
	if (mediaId && !mediaIds.has(mediaId)) {
		return new Response(JSON.stringify({ error: 'Ungültige Bild-Referenz (Medienbibliothek).' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const sorts = cms.services.map((s) => s.sort);
	const sort = (sorts.length ? Math.max(...sorts) : 0) + 10;

	const entry = {
		id: crypto.randomUUID(),
		sort,
		title,
		slogan,
		body: text,
		imageAlt: '',
		...(imageUrl ? { imageUrl } : {}),
		...(mediaId && !imageUrl ? { mediaId } : {}),
		enabled: true as const,
	};

	cms.services.push(entry);
	await writeCms(cms);

	return new Response(JSON.stringify({ entry }), {
		status: 201,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
