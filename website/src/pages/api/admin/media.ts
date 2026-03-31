import type { APIRoute } from 'astro';
import { readCms, writeCms } from '../../../lib/cms/store';
import { saveUploadedImageFile } from '../../../lib/cms/saveUpload';

export const prerender = false;

/** Upload für Medienbibliothek, Team- und Portfolio-Flows. */
export const POST: APIRoute = async ({ request }) => {
	const form = await request.formData();
	const file = form.get('file');
	const alt = typeof form.get('alt') === 'string' ? String(form.get('alt')).trim() : '';
	if (!file || !(file instanceof File)) {
		return new Response(JSON.stringify({ error: 'Keine Datei ausgewählt.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	try {
		const record = await saveUploadedImageFile(file);
		record.alt = alt;
		const cms = await readCms();
		cms.media.push(record);
		await writeCms(cms);
		return new Response(JSON.stringify({ media: record }), {
			status: 201,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Upload fehlgeschlagen.';
		return new Response(JSON.stringify({ error: msg }), {
			status: 400,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}
};
