import type { APIRoute } from 'astro';
import { serverEnv } from '../../../lib/serverEnv';

export const prerender = false;

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
		},
	});
}

/** MailerLite Marketing API — Subscriber einer oder mehrerer Gruppen hinzufügen. */
export const POST: APIRoute = async ({ request }) => {
	const token = serverEnv('MAILERLITE_API_KEY')?.trim();
	const groupIdsRaw = serverEnv('MAILERLITE_NEWSLETTER_GROUP_ID')?.trim() ?? '';
	const groups = groupIdsRaw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	const voucherCode = serverEnv('NEWSLETTER_VOUCHER_CODE')?.trim();

	if (!token || groups.length === 0) {
		return json({ ok: false, error: 'newsletter_not_configured' }, 503);
	}

	let body: { email?: unknown; hp?: unknown };
	try {
		body = (await request.json()) as { email?: unknown; hp?: unknown };
	} catch {
		return json({ ok: false, error: 'invalid_json' }, 400);
	}

	const hp = typeof body.hp === 'string' ? body.hp : '';
	if (hp.trim() !== '') {
		return json({ ok: true, skipped: true });
	}

	const email = typeof body.email === 'string' ? body.email.trim() : '';
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return json({ ok: false, error: 'invalid_email' }, 400);
	}

	const res = await fetch('https://connect.mailerlite.com/api/subscribers', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
		body: JSON.stringify({
			email,
			groups,
		}),
	});

	const raw = await res.text();

	if (!res.ok) {
		const dup =
			res.status === 422 ||
			/already|exist|duplicate|subscribed/i.test(raw.slice(0, 1200));
		if (!dup) {
			console.error('[newsletter/subscribe] MailerLite', res.status, raw.slice(0, 800));
			return json({ ok: false, error: 'mailerlite_error' }, 502);
		}
	}

	return json({
		ok: true,
		voucherPercent: 10,
		...(voucherCode ? { voucherCode } : {}),
	});
};
