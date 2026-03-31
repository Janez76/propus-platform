/**
 * Kleinere Bild-Bytes für die Website: Supabase Storage Image Transform + engere Unsplash-Parameter.
 * Transform: `/storage/v1/object/public/…` → `/storage/v1/render/image/public/…?width=&quality=&resize=`
 * Profil `logo`: Resize/Qualität wie unten (kein erzwungenes `format=png` – vermeidet fehlgeschlagene Transforms).
 * Abschalten: PUBLIC_SUPABASE_IMG_TRANSFORM=0 in .env (falls dein Projekt Transforms nicht anbietet).
 */

export type CmsImageProfile = 'portfolio' | 'team' | 'logo' | 'service' | 'branding';

/** `contain` = kein Zuschneiden, nur kleinere Auflösung/Qualität (kein „Zoom“ wie bei `cover`). */
const PRESETS: Record<CmsImageProfile, { width: number; quality: number; resize: string }> = {
	portfolio: { width: 1280, quality: 78, resize: 'contain' },
	team: { width: 800, quality: 80, resize: 'contain' },
	logo: { width: 260, quality: 82, resize: 'contain' },
	service: { width: 1200, quality: 78, resize: 'contain' },
	branding: { width: 320, quality: 85, resize: 'contain' },
};

function transformsDisabled(): boolean {
	const v = import.meta.env.PUBLIC_SUPABASE_IMG_TRANSFORM;
	return v === '0' || v === 'false';
}

function isVideoPath(src: string): boolean {
	const base = src.split('?')[0].toLowerCase();
	return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(base);
}

function isSvgOrIco(src: string): boolean {
	const base = src.split('?')[0].toLowerCase();
	return base.endsWith('.svg') || base.endsWith('.ico');
}

/** Supabase „object/public“ → „render/image/public“ mit Parametern. */
function supabaseObjectToRenderUrl(
	src: string,
	width: number,
	quality: number,
	resize: string,
	opts?: { outputFormat?: string },
): string | null {
	try {
		const u = new URL(src);
		const marker = '/storage/v1/object/public/';
		const idx = u.pathname.indexOf(marker);
		if (idx === -1) return null;
		const rest = u.pathname.slice(idx + marker.length);
		const slash = rest.indexOf('/');
		if (slash < 0) return null;
		const bucket = rest.slice(0, slash);
		const objectKey = rest.slice(slash + 1);
		if (!bucket || !objectKey) return null;
		const segments = objectKey.split('/').map((seg) => encodeURIComponent(decodeURIComponent(seg)));
		u.pathname = `/storage/v1/render/image/public/${bucket}/${segments.join('/')}`;
		u.search = '';
		u.searchParams.set('width', String(width));
		u.searchParams.set('quality', String(quality));
		u.searchParams.set('resize', resize);
		if (opts?.outputFormat) u.searchParams.set('format', opts.outputFormat);
		return u.toString();
	} catch {
		return null;
	}
}

function tightenUnsplash(src: string, maxWidth: number, quality: number, forcePng = false): string {
	if (!src.includes('images.unsplash.com')) return src;
	try {
		const u = new URL(src);
		u.searchParams.set('w', String(maxWidth));
		u.searchParams.set('q', String(quality));
		if (!u.searchParams.has('fit')) u.searchParams.set('fit', 'max');
		if (forcePng) {
			u.searchParams.set('fm', 'png');
			u.searchParams.delete('auto');
		} else if (!u.searchParams.has('auto')) {
			u.searchParams.set('auto', 'format');
		}
		return u.toString();
	} catch {
		return src;
	}
}

/** Öffentliche Bild-URL für die Auslieferung an <img> / Astro Image (CMS, Supabase, Unsplash). */
export function cmsImageUrlForDisplay(
	src: string | undefined,
	profile: CmsImageProfile,
	enabled = true,
): string {
	if (!src || typeof src !== 'string') return '';
	const s = src.trim();
	if (!s || isVideoPath(s) || isSvgOrIco(s)) return s;
	if (!enabled) return s;

	const { width, quality, resize } = PRESETS[profile];

	if (!transformsDisabled()) {
		const rendered = supabaseObjectToRenderUrl(s, width, quality, resize);
		if (rendered) return rendered;
	}

	return tightenUnsplash(s, width, quality, false);
}
