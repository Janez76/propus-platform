import type { APIRoute } from 'astro';
import { site } from '../content/site';
import { loadAllSeoPages, loadSeoSettings } from '../lib/seo';

export const prerender = false;

export const GET: APIRoute = async () => {
	const [pages, settings] = await Promise.all([loadAllSeoPages(), loadSeoSettings()]);
	const disallow = new Set<string>(['/admin/', '/api/admin/']);

	for (const path of settings.robotsDisallow) {
		disallow.add(path);
	}

	for (const page of pages) {
		if (!page.index) disallow.add(page.path);
	}

	const lines = ['User-agent: *'];
	if (!settings.allowIndexing) {
		lines.push('Disallow: /');
	} else if (disallow.size > 0) {
		for (const path of [...disallow].sort()) lines.push(`Disallow: ${path}`);
	} else {
		lines.push('Allow: /');
	}

	if (settings.robotsCustom) {
		lines.push('', settings.robotsCustom);
	}

	if (settings.sitemapEnabled) {
		lines.push('', `Sitemap: ${new URL('/sitemap.xml', site.url).href}`);
	}

	return new Response(lines.join('\n'), {
		status: 200,
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
};
