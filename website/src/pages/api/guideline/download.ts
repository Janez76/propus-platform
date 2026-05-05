import type { APIRoute } from 'astro';
import { createReadStream, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import {
	loadGuidelineManifest,
	mimeForFilename,
	resolveGuidelineAssetPath,
} from '../../../lib/guideline-private-files';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
	const id = url.searchParams.get('id')?.trim();
	if (!id) {
		return new Response(JSON.stringify({ error: 'Parameter id fehlt.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const manifest = loadGuidelineManifest();
	const entry = manifest.files.find((f) => f.id === id);
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
