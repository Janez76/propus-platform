import type { APIRoute } from 'astro';
import { GUIDELINE_COOKIE, createGuidelineSessionToken, guidelinePassword } from '../../../lib/guideline-auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
	const pwd = guidelinePassword();
	if (!pwd) {
		return new Response(
			JSON.stringify({
				error:
					'Guideline-Bereich ist nicht eingerichtet. Bitte GUIDELINE_PASSWORD und GUIDELINE_SECRET setzen.',
			}),
			{ status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
		);
	}

	let body: { password?: string } = {};
	try {
		body = await request.json();
	} catch {
		/* leer */
	}

	const password = typeof body.password === 'string' ? body.password : '';
	if (password !== pwd) {
		return new Response(JSON.stringify({ error: 'Passwort ist falsch.' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const token = createGuidelineSessionToken();
	cookies.set(GUIDELINE_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: import.meta.env.PROD,
		maxAge: 60 * 60 * 24 * 7,
		sameSite: 'lax',
	});

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
};
