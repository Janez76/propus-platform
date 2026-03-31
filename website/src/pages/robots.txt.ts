import type { APIRoute } from 'astro';
import { site } from '../content/site';
import { loadAllSeoPages, loadSeoSettings } from '../lib/seo';

export const prerender = false;

export const GET: APIRoute = async () => {
	const [pages, settings] = await Promise.all([loadAllSeoPages(), loadSeoSettings()]);

	const systemDisallow = new Set<string>([
		'/admin/',
		'/api/',
		'/_astro/',
		'/uploads/',
	]);

	const pageDisallow = new Set<string>();
	for (const path of settings.robotsDisallow) {
		if (!path.startsWith('/_astro/') && !path.startsWith('/api/') && !path.startsWith('/uploads/')) {
			pageDisallow.add(path);
		}
	}
	for (const page of pages) {
		if (!page.index) pageDisallow.add(page.path);
	}

	const lines = ['User-agent: *'];
	if (!settings.allowIndexing) {
		lines.push('Disallow: /');
	} else {
		lines.push('Allow: /');
		for (const path of [...systemDisallow].sort()) lines.push(`Disallow: ${path}`);
		for (const path of [...pageDisallow].sort()) lines.push(`Disallow: ${path}`);
	}

	if (settings.robotsCustom) {
		lines.push('', settings.robotsCustom);
	}

	if (settings.sitemapEnabled) {
		lines.push('', `Sitemap: ${new URL('/sitemap.xml', site.url).href}`);
	}

	return new Response(lines.join('\n'), {
		status: 200,
		headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
	});
};
