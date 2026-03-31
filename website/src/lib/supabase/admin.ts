import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '../serverEnv';

let cached: SupabaseClient | null = null;
let resolved = false;

/** Trimmt Werte aus .env; entfernt häufige Kopierfehler (äußere Anführungszeichen). */
function trimEnv(value: string | undefined): string {
	if (value == null) return '';
	let s = String(value).trim();
	if (
		(s.startsWith('"') && s.endsWith('"')) ||
		(s.startsWith("'") && s.endsWith("'"))
	) {
		s = s.slice(1, -1).trim();
	}
	return s;
}

function isValidHttpUrl(url: string): boolean {
	try {
		const u = new URL(url);
		return u.protocol === 'http:' || u.protocol === 'https:';
	} catch {
		return false;
	}
}

/** Nur Server (API, SSR). `null`, wenn Env fehlt oder die URL ungültig ist. */
export function getSupabaseAdmin(): SupabaseClient | null {
	if (resolved) return cached;

	const url = trimEnv(serverEnv('SUPABASE_URL'));
	const key = trimEnv(serverEnv('SUPABASE_SERVICE_ROLE_KEY'));

	if (!url || !key) {
		resolved = true;
		cached = null;
		return null;
	}

	if (!isValidHttpUrl(url)) {
		console.error(
			'[supabase] SUPABASE_URL ist ungültig. Erwartet z. B. https://abcdefgh.supabase.co (Project URL aus dem Dashboard, ohne extra Zeichen).',
		);
		resolved = true;
		cached = null;
		return null;
	}

	try {
		cached = createClient(url, key, {
			auth: { persistSession: false, autoRefreshToken: false },
		});
	} catch (e) {
		console.error('[supabase] Client konnte nicht erzeugt werden:', e);
		cached = null;
	}

	resolved = true;
	return cached;
}
