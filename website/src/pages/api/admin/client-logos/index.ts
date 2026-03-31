import type { APIRoute } from 'astro';
import {
	normalizeClientLogoImageUrl,
	resolveClientLogoDisplayName,
} from '../../../../lib/cms/clientLogoUrl';
import { readCms, writeCms } from '../../../../lib/cms/store';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	let body: { imageUrl?: string } = {};
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Ungültige Daten.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const imageUrl = normalizeClientLogoImageUrl(body.imageUrl ?? '');
	if (!imageUrl) {
		return new Response(
			JSON.stringify({
				error:
					'Bitte eine gültige Bild-URL angeben (https://… oder Pfad ab /).',
			}),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			},
		);
	}

	const name = resolveClientLogoDisplayName('', imageUrl);

	const cms = await readCms();
	const sorts = cms.clientLogos.map((c) => c.sort);
	const sort = (sorts.length ? Math.max(...sorts) : 0) + 10;

	const entry = {
		id: crypto.randomUUID(),
		sort,
		name,
		imageUrl,
		enabled: true as const,
	};

	cms.clientLogos.push(entry);
	await writeCms(cms);

	return new Response(JSON.stringify({ entry }), {
		status: 201,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
