import type { APIRoute } from 'astro';
import { site } from '../content/site';
import { loadSeoSettings } from '../lib/seo';

export const prerender = false;

export const GET: APIRoute = async () => {
	const settings = await loadSeoSettings();

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
	// Seiten mit index=false NICHT automatisch disallowen: ein gleichzeitiges
	// `Disallow` + `<meta robots="noindex">` ist konflikthaft. Google fetcht die
	// Seite bei Disallow gar nicht erst und sieht den noindex-Tag nie – die URL
	// kann trotzdem als nacktes SERP-Ergebnis auftauchen. Per Google-Empfehlung
	// gilt: noindex meta ODER Disallow, nicht beides. Wir lassen noindex wirken
	// und halten robots.txt offen. Manuelle `robotsDisallow`-Eintraege aus dem
	// CMS bleiben unveraendert respektiert.

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
