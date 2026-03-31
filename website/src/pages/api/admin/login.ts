import type { APIRoute } from 'astro';
import { ADMIN_COOKIE, adminPassword, adminUsername, createSessionToken } from '../../../lib/cms/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
	const pwd = adminPassword();
	const userExpected = adminUsername();
	if (!pwd) {
		return new Response(
			JSON.stringify({
				error: 'Admin ist nicht eingerichtet. Bitte PROPUS_ADMIN_USER und PROPUS_ADMIN_PASSWORD in der Umgebung setzen.',
			}),
			{ status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
		);
	}

	let body: { username?: string; password?: string } = {};
	try {
		body = await request.json();
	} catch {
		/* leer */
	}

	const username =
		typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
	const expectedUser = userExpected.trim().toLowerCase();
	if (username !== expectedUser || body.password !== pwd) {
		return new Response(JSON.stringify({ error: 'Benutzername oder Passwort ist falsch.' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json; charset=utf-8' },
		});
	}

	const token = createSessionToken();
	cookies.set(ADMIN_COOKIE, token, {
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
