import type { APIRoute } from 'astro';
import { GUIDELINE_COOKIE } from '../../../lib/guideline-auth';

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
	cookies.set(GUIDELINE_COOKIE, '', {
		path: '/',
		httpOnly: true,
		secure: import.meta.env.PROD,
		maxAge: 0,
		sameSite: 'lax',
	});
	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
