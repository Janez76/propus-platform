import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { serverEnv } from '../../../lib/serverEnv';

export const prerender = false;

function subscriberHash(email: string): string {
	return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
		},
	});
}

/** Mailchimp Marketing API — Mitglied in Audience upserten (PUT). */
export const POST: APIRoute = async ({ request }) => {
	const apiKey = serverEnv('MAILCHIMP_API_KEY')?.trim();
	const dc = serverEnv('MAILCHIMP_DC')?.trim() || 'us22';
	const listId = serverEnv('MAILCHIMP_NEWSLETTER_LIST_ID')?.trim();
	const voucherCode = serverEnv('NEWSLETTER_VOUCHER_CODE')?.trim();

	if (!apiKey || !listId) {
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

	const hash = subscriberHash(email);
	const url = `https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(listId)}/members/${hash}`;
	const auth = Buffer.from(`anystring:${apiKey}`, 'utf8').toString('base64');

	const res = await fetch(url, {
		method: 'PUT',
		headers: {
			Authorization: `Basic ${auth}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			email_address: email,
			status_if_new: 'subscribed',
			merge_fields: {},
		}),
	});

	const raw = await res.text();

	if (!res.ok) {
		console.error('[newsletter/subscribe]', res.status, raw.slice(0, 500));
		return json({ ok: false, error: 'mailchimp_error' }, 502);
	}

	/** Tag(s) in Mailchimp — neue Website-Abonnenten von anderen Quellen unterscheiden (Audience → filtern nach Tag). */
	const tagName =
		serverEnv('MAILCHIMP_NEWSLETTER_TAG')?.trim() ||
		'Newsletter Website — 10% Gutschein';
	if (tagName) {
		const tagUrl = `https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(listId)}/members/${hash}/tags`;
		const tagRes = await fetch(tagUrl, {
			method: 'POST',
			headers: {
				Authorization: `Basic ${auth}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				tags: [{ name: tagName, status: 'active' }],
			}),
		});
		if (!tagRes.ok) {
			const tagBody = await tagRes.text();
			console.error('[newsletter/subscribe] mailchimp tag', tagRes.status, tagBody.slice(0, 500));
		}
	}

	return json({
		ok: true,
		voucherPercent: 10,
		...(voucherCode ? { voucherCode } : {}),
	});
};
