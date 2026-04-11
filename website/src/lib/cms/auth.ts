import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_COOKIE = 'propus_admin';

/** Astro/Vite lädt `.env` in `import.meta.env`; `node ./dist/...` nutzt `process.env`. */
function envString(key: string): string {
	const fromProcess = process.env[key];
	if (fromProcess !== undefined && fromProcess !== '') return fromProcess;
	const fromMeta = (import.meta.env as Record<string, string | boolean | undefined>)[key];
	return typeof fromMeta === 'string' && fromMeta !== '' ? fromMeta : '';
}

function adminSecret(): string {
	const secret = envString('PROPUS_ADMIN_SECRET');
	if (!secret) {
		if (process.env.NODE_ENV === 'production') {
			console.error(
				'[auth] KRITISCH: PROPUS_ADMIN_SECRET ist nicht gesetzt! ' +
					'Session-Tokens sind unsicher. Bitte sofort in der Umgebung setzen.',
			);
		}
		return 'propus-dev-secret-bitte-in-produktion-aendern';
	}
	return secret;
}

export function adminUsername(): string {
	return envString('PROPUS_ADMIN_USER') || 'admin';
}

export function adminPassword(): string {
	return envString('PROPUS_ADMIN_PASSWORD');
}

export function createSessionToken(): string {
	const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
	const payload = JSON.stringify({ exp });
	const sig = createHmac('sha256', adminSecret()).update(payload).digest('hex');
	const body = JSON.stringify({ payload, sig });
	return Buffer.from(body, 'utf8').toString('base64url');
}

export function verifySessionToken(token: string | undefined | null): boolean {
	if (!token) return false;
	try {
		const body = Buffer.from(token, 'base64url').toString('utf8');
		const { payload, sig } = JSON.parse(body) as { payload: string; sig: string };
		const expected = createHmac('sha256', adminSecret()).update(payload).digest('hex');
		const ba = Buffer.from(expected, 'hex');
		const bb = Buffer.from(String(sig), 'hex');
		if (ba.length !== bb.length) return false;
		if (!timingSafeEqual(ba, bb)) return false;
		const data = JSON.parse(payload) as { exp: number };
		return typeof data.exp === 'number' && data.exp > Date.now();
	} catch {
		return false;
	}
}
