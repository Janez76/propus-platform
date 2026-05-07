import type { APIRoute } from 'astro';
import { createReadStream, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import { GUIDELINE_COOKIE, verifyGuidelineSessionToken } from '../../../lib/guideline-auth';
import { GUIDELINE_DOWNLOADS } from '../../../lib/guideline-static';
import { mimeForFilename, resolveGuidelineAssetPath } from '../../../lib/guideline-private-files';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies }) => {
	// Defense-in-Depth: middleware.ts schuetzt /api/guideline/* bereits, aber
	// wir verifizieren das Session-Cookie auch hier (Bug-Hunt HIGH-1) — falls
	// das Middleware-Matching irgendwann anders konfiguriert wird, bleibt der
	// private Inhalt geschuetzt.
	const sessionToken = cookies.get(GUIDELINE_COOKIE)?.value;
	if (!verifyGuidelineSessionToken(sessionToken)) {
		return new Response(JSON.stringify({ error: 'Nicht angemeldet.' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const id = url.searchParams.get('id')?.trim();
	if (!id) {
		return new Response(JSON.stringify({ error: 'Parameter id fehlt.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const entry = GUIDELINE_DOWNLOADS.find((f) => f.id === id);
	if (!entry) {
		return new Response(JSON.stringify({ error: 'Datei nicht gefunden.' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const abs = resolveGuidelineAssetPath(entry.path);
	if (!abs || !existsSync(abs)) {
		return new Response(JSON.stringify({ error: 'Datei nicht vorhanden.' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const filename = basename(abs);
	const nodeStream = createReadStream(abs);
	const body = Readable.toWeb(nodeStream) as import('node:stream/web').ReadableStream;

	const encoded = encodeURIComponent(filename);
	return new Response(body, {
		status: 200,
		headers: {
			'Content-Type': mimeForFilename(filename),
			'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
			'Cache-Control': 'private, no-store',
		},
	});
};
