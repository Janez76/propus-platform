import { createHmac, timingSafeEqual } from 'node:crypto';

export const GUIDELINE_COOKIE = 'propus_guideline';

/** Astro/Vite lädt `.env` in `import.meta.env`; `node ./dist/...` nutzt `process.env`. */
function envString(key: string): string {
	const fromProcess = process.env[key];
	if (fromProcess !== undefined && fromProcess !== '') return fromProcess;
	const fromMeta = (import.meta.env as Record<string, string | boolean | undefined>)[key];
	return typeof fromMeta === 'string' && fromMeta !== '' ? fromMeta : '';
}

function guidelineSecret(): string {
	const secret = envString('GUIDELINE_SECRET');
	if (!secret) {
		if (process.env.NODE_ENV === 'production') {
			console.error(
				'[guideline-auth] KRITISCH: GUIDELINE_SECRET ist nicht gesetzt. ' +
					'Session-Tokens sind unsicher.',
			);
		}
		return 'guideline-dev-secret-bitte-in-produktion-setzen';
	}
	return secret;
}

export function guidelinePassword(): string {
	return envString('GUIDELINE_PASSWORD');
}

export function createGuidelineSessionToken(): string {
	const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
	const payload = JSON.stringify({ exp });
	const sig = createHmac('sha256', guidelineSecret()).update(payload).digest('hex');
	const body = JSON.stringify({ payload, sig });
	return Buffer.from(body, 'utf8').toString('base64url');
}

export function verifyGuidelineSessionToken(token: string | undefined | null): boolean {
	if (!token) return false;
	try {
		const body = Buffer.from(token, 'base64url').toString('utf8');
		const { payload, sig } = JSON.parse(body) as { payload: string; sig: string };
		const expected = createHmac('sha256', guidelineSecret()).update(payload).digest('hex');
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
