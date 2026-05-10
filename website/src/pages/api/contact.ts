import type { APIRoute } from 'astro';
import { serverEnv } from '../../lib/serverEnv';
import {
	sendContactMail,
	ContactMailNotConfiguredError,
	type ContactMailInput,
} from '../../lib/contactMail';

export const prerender = false;

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_FIELD_BYTES = 5000;
const ALLOWED_REASONS = new Set(['Offerte', 'Support', 'Sonstiges']);

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
		},
	});
}

function clean(value: FormDataEntryValue | null | undefined): string {
	if (typeof value !== 'string') return '';
	return value.replace(/\r\n|\r/g, '\n').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

function isEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getClientIp(request: Request): string {
	const cf = request.headers.get('cf-connecting-ip');
	if (cf) return cf.trim();
	const fwd = request.headers.get('x-forwarded-for');
	if (fwd) return fwd.split(',')[0]?.trim() ?? '';
	return '';
}

async function verifyTurnstile(token: string, secret: string, remoteIp: string): Promise<boolean> {
	const body = new URLSearchParams({ secret, response: token });
	if (remoteIp) body.set('remoteip', remoteIp);

	try {
		const ctrl = new AbortController();
		const timeout = setTimeout(() => ctrl.abort(), 6000);
		const res = await fetch(TURNSTILE_VERIFY_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body,
			signal: ctrl.signal,
		});
		clearTimeout(timeout);
		if (!res.ok) {
			console.warn('[contact] turnstile http', res.status);
			return false;
		}
		const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
		if (!data.success) {
			console.warn('[contact] turnstile rejected', data['error-codes']);
		}
		return Boolean(data.success);
	} catch (err) {
		console.warn('[contact] turnstile network error', err);
		return false;
	}
}

export const POST: APIRoute = async ({ request }) => {
	const secret = serverEnv('TURNSTILE_SECRET_KEY')?.trim();
	if (!secret) {
		console.error('[contact] TURNSTILE_SECRET_KEY missing');
		return json({ ok: false, error: 'server_misconfigured' }, 500);
	}

	const contentType = request.headers.get('content-type') ?? '';
	if (!contentType.includes('multipart/form-data') && !contentType.includes('application/x-www-form-urlencoded')) {
		return json({ ok: false, error: 'invalid_content_type' }, 415);
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return json({ ok: false, error: 'invalid_form' }, 400);
	}

	if (clean(form.get('_gotcha')) !== '') {
		return json({ ok: true });
	}

	const name = clean(form.get('name'));
	const email = clean(form.get('email'));
	const phone = clean(form.get('phone'));
	const reason = clean(form.get('anfragegrund'));
	const message = clean(form.get('message'));
	const token = clean(form.get('cf-turnstile-response'));

	if (!name || !email || !reason || !message) {
		return json({ ok: false, error: 'Bitte füllen Sie alle Pflichtfelder aus.' }, 422);
	}
	for (const v of [name, email, phone, reason, message]) {
		if (v.length > MAX_FIELD_BYTES) {
			return json({ ok: false, error: 'Eingabe zu lang.' }, 422);
		}
	}
	if (!isEmail(email)) {
		return json({ ok: false, error: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' }, 422);
	}
	if (!ALLOWED_REASONS.has(reason)) {
		return json({ ok: false, error: 'Ungültiger Anfragegrund.' }, 422);
	}
	if (!token) {
		return json(
			{ ok: false, error: 'Bot-Schutz fehlgeschlagen – bitte Seite neu laden und erneut absenden.' },
			403,
		);
	}

	const ip = getClientIp(request);
	const ok = await verifyTurnstile(token, secret, ip);
	if (!ok) {
		return json(
			{ ok: false, error: 'Bot-Schutz fehlgeschlagen – bitte Seite neu laden und erneut absenden.' },
			403,
		);
	}

	const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 500);
	const payload: ContactMailInput = { name, email, phone, reason, message, ip, userAgent };

	try {
		await sendContactMail(payload);
	} catch (err) {
		if (err instanceof ContactMailNotConfiguredError) {
			console.error('[contact]', err.message);
			return json({ ok: false, error: 'server_misconfigured' }, 500);
		}
		console.error('[contact] sendMail failed', err);
		return json({ ok: false, error: 'Mail konnte nicht zugestellt werden. Bitte später erneut versuchen.' }, 502);
	}

	return json({ ok: true });
};
