import type { APIRoute } from 'astro';
import { site } from '../content/site';
import { loadAllSeoPages, loadSeoSettings } from '../lib/seo';

export const prerender = false;

export const GET: APIRoute = async () => {
	const [pages, settings] = await Promise.all([loadAllSeoPages(), loadSeoSettings()]);
	if (!settings.sitemapEnabled) {
		return new Response('', { status: 204 });
	}

	const urls = pages
		.filter((page) => page.index)
		.map((page) => {
			const loc = new URL(page.path, site.url).href;
			return `<url><loc>${loc}</loc></url>`;
		})
		.join('');

	const xml =
		'<?xml version="1.0" encoding="UTF-8"?>' +
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
		urls +
		'</urlset>';

	return new Response(xml, {
		status: 200,
		headers: { 'Content-Type': 'application/xml; charset=utf-8' },
	});
};
