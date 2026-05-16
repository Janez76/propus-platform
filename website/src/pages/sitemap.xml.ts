import type { APIRoute } from 'astro';
import { site } from '../content/site';
import { loadAllSeoPages, loadSeoSettings } from '../lib/seo';
import { CHECKLISTEN_SORTED } from '../content/checklisten';

export const prerender = false;

const PRIORITY: Record<string, string> = {
	'/': '1.0',
	'/dienstleistungen/': '0.9',
	'/portfolio/': '0.8',
	'/preise/': '0.8',
	'/ueber-uns/': '0.7',
	'/kontakt/': '0.7',
	'/checklisten/': '0.7',
	'/faq/': '0.6',
};

/** Statische öffentliche Routen, die nicht im SEO-CMS gepflegt sind. */
const STATIC_ROUTES: string[] = [
	'/checklisten/',
	'/faq/',
	...CHECKLISTEN_SORTED.map((c) => `/checklisten/${c.slug}/`),
];

export const GET: APIRoute = async () => {
	const [pages, settings] = await Promise.all([loadAllSeoPages(), loadSeoSettings()]);
	if (!settings.sitemapEnabled) {
		return new Response('', { status: 204 });
	}

	const today = new Date().toISOString().slice(0, 10);

	const seoUrls = pages
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

	const staticUrls = settings.allowIndexing
		? STATIC_ROUTES.map((path) => {
				const loc = new URL(path, site.url).href;
				const priority = PRIORITY[path] ?? '0.5';
				return (
					`<url>` +
					`<loc>${loc}</loc>` +
					`<lastmod>${today}</lastmod>` +
					`<changefreq>monthly</changefreq>` +
					`<priority>${priority}</priority>` +
					`</url>`
				);
			}).join('')
		: '';

	const urls = seoUrls + staticUrls;

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
