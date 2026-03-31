/**
 * Kundenlogo-Bildquelle: externe oder lokale URL (kein Upload über Medienbibliothek nötig).
 */

/** Erlaubt `http(s)://`, `//…`, pfad ab `/` — blockiert `javascript:`, `data:`. */
export function normalizeClientLogoImageUrl(raw: string): string | null {
	const u = raw.trim();
	if (!u) return null;
	const head = u.slice(0, 24).toLowerCase();
	if (head.startsWith('javascript:') || head.startsWith('data:')) return null;
	if (/^https?:\/\//i.test(u)) return u;
	if (u.startsWith('//')) return u;
	if (u.startsWith('/')) return u;
	return null;
}

/** Letztes Pfadsegment ohne Endung, für Default-Anzeigename. */
export function deriveClientLogoNameFromUrl(url: string): string {
	let path = url.trim();
	if (!path) return '';
	if (/^https?:\/\//i.test(path) || path.startsWith('//')) {
		try {
			path = new URL(path.startsWith('//') ? `https:${path}` : path).pathname;
		} catch {
			path = path.split('?')[0] || '';
		}
	}
	const seg = path.split('/').filter(Boolean).pop() || '';
	return seg.replace(/\.[^.]+$/i, '').replace(/[_-]+/g, ' ').trim();
}

export function resolveClientLogoDisplayName(name: string, imageUrl: string): string {
	const n = name.trim();
	if (n) return n;
	const fromUrl = deriveClientLogoNameFromUrl(imageUrl);
	if (fromUrl) return fromUrl;
	return 'Kundenlogo';
}
