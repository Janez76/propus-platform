import type { APIRoute } from 'astro';
import { loadBookingCatalog } from '../../../lib/booking/catalog';

export const prerender = false;

/** JSON-Katalog für Debugging oder Clients; gleiche Normalisierung wie die Preise-Seite. */
export const GET: APIRoute = async () => {
	const result = await loadBookingCatalog();
	const status = result.ok ? 200 : 502;
	return new Response(JSON.stringify(result), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
		},
	});
};
