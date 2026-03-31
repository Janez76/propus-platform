import type { APIRoute } from 'astro';
import { ensureDefaultServicesInCms } from '../../../lib/cms/seed';
import { readCms } from '../../../lib/cms/store';

export const prerender = false;

export const GET: APIRoute = async () => {
	await ensureDefaultServicesInCms();
	const cms = await readCms();
	return new Response(JSON.stringify(cms), {
		status: 200,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
