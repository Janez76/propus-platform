import { defineMiddleware } from 'astro:middleware';
import { ADMIN_COOKIE, verifySessionToken } from './lib/cms/auth';
import { loadSeoRouteMapCached } from './lib/seo';
import { normalizeSeoPath } from './lib/seo-config';

function isAdminLoginPath(pathname: string): boolean {
	return pathname === '/admin/login' || pathname === '/admin/login/';
}

function isAdminLoginApiPath(pathname: string): boolean {
	return pathname === '/api/admin/login' || pathname === '/api/admin/login/';
}

function canRewriteSeoPath(pathname: string): boolean {
	if (
		pathname.startsWith('/admin') ||
		pathname.startsWith('/api') ||
		pathname.startsWith('/_astro') ||
		pathname.startsWith('/uploads')
	) {
		return false;
	}
	return !/\/[^/]+\.[a-z0-9]+$/i.test(pathname);
}

export const onRequest = defineMiddleware(async (context, next) => {
	const path = context.url.pathname;

	if (path.startsWith('/admin') && !isAdminLoginPath(path)) {
		const token = context.cookies.get(ADMIN_COOKIE)?.value;
		if (!verifySessionToken(token)) {
			return context.redirect(new URL('/admin/login', context.url));
		}
	}

	if (path.startsWith('/api/admin/') && !isAdminLoginApiPath(path)) {
		const token = context.cookies.get(ADMIN_COOKIE)?.value;
		if (!verifySessionToken(token)) {
			return new Response(JSON.stringify({ error: 'Nicht angemeldet.' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}
	}

	if (canRewriteSeoPath(path)) {
		try {
			const normalizedPath = normalizeSeoPath(path);
			const routeMap = await loadSeoRouteMapCached();
			const customMatch = routeMap.find(
				(entry) =>
					normalizeSeoPath(entry.path) === normalizedPath &&
					normalizeSeoPath(entry.defaultPath) !== normalizedPath,
			);
			if (customMatch) {
				return context.rewrite(new URL(customMatch.defaultPath, context.url));
			}

			const defaultMatch = routeMap.find(
				(entry) =>
					normalizeSeoPath(entry.defaultPath) === normalizedPath &&
					normalizeSeoPath(entry.path) !== normalizedPath,
			);
			if (defaultMatch) {
				return context.redirect(new URL(defaultMatch.path, context.url), 302);
			}
		} catch (e) {
			console.error('[middleware] SEO-Umleitung übersprungen:', e);
		}
	}

	const response = await next();
	const status = response.status;

	if (isAdminLoginPath(path)) {
		const headers = new Headers(response.headers);
		headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
		headers.set('Pragma', 'no-cache');
		return new Response(response.body, {
			status,
			statusText: response.statusText,
			headers,
		});
	}

	/* Hochgeladene Medien & Astro-Assets: lange Browser-Caches (UUID/Hash in URLs). */
	if (status >= 200 && status < 400) {
		if (path.startsWith('/uploads/') || path.startsWith('/_astro/')) {
			const headers = new Headers(response.headers);
			headers.set('Cache-Control', 'public, max-age=31536000, immutable');
			return new Response(response.body, {
				status,
				statusText: response.statusText,
				headers,
			});
		}
	}

	/* Öffentliche HTML-Seiten: kurz cachen, SWR für schnellere Wiederbesuche (CMS bleibt aktuell). */
	const ct = response.headers.get('content-type') || '';
	if (
		status >= 200 &&
		status < 400 &&
		ct.includes('text/html') &&
		!path.startsWith('/admin') &&
		!response.headers.get('Cache-Control')
	) {
		const headers = new Headers(response.headers);
		headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
		return new Response(response.body, {
			status,
			statusText: response.statusText,
			headers,
		});
	}

	return response;
});
