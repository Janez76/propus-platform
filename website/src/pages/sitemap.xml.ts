import type { APIRoute } from 'astro';
import { site } from '../content/site';
import { loadAllSeoPages, loadSeoSettings } from '../lib/seo';

export const prerender = false;

const PRIORITY: Record<string, string> = {
	'/': '1.0',
	'/dienstleistungen/': '0.9',
	'/portfolio/': '0.8',
	'/preise/': '0.8',
	'/ueber-uns/': '0.7',
	'/kontakt/': '0.7',
};

export const GET: APIRoute = async () => {
	const [pages, settings] = await Promise.all([loadAllSeoPages(), loadSeoSettings()]);
	if (!settings.sitemapEnabled) {
		return new Response('', { status: 204 });
	}

	const today = new Date().toISOString().slice(0, 10);

	const urls = pages
		.filter((page) => page.index)
		.map((page) => {
			const loc = new URL(page.path, site.url).href;
			const priority = PRIORITY[page.path] ?? '0.6';
			return (
				`<url>` +
				`<loc>${loc}</loc>` +
				`<lastmod>${today}</lastmod>` +
				`<changefreq>monthly</changefreq>` +
				`<priority>${priority}</priority>` +
				`</url>`
			);
		})
		.join('');

	const xml =
		'<?xml version="1.0" encoding="UTF-8"?>' +
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
		urls +
		'</urlset>';

	return new Response(xml, {
		status: 200,
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});
};
