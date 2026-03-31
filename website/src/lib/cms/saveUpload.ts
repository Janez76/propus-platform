import { getSupabaseAdmin } from '../supabase/admin';
import { uploadToCmsBucket } from '../supabase/storage';
import type { CmsMedia } from './types';

const IMAGE_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/svg+xml',
	'image/x-icon',
	'image/vnd.microsoft.icon',
]);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

const ALLOWED = new Set([...IMAGE_TYPES, ...VIDEO_TYPES]);

function extForMime(mime: string): string {
	if (mime === 'image/jpeg') return 'jpg';
	if (mime === 'image/png') return 'png';
	if (mime === 'image/webp') return 'webp';
	if (mime === 'image/gif') return 'gif';
	if (mime === 'image/svg+xml') return 'svg';
	if (mime === 'image/x-icon' || mime === 'image/vnd.microsoft.icon') return 'ico';
	if (mime === 'video/mp4') return 'mp4';
	if (mime === 'video/webm') return 'webm';
	if (mime === 'video/quicktime') return 'mov';
	return 'bin';
}

/** Manche Browser/OS liefern leeren `type` – dann über Dateiendung. */
function mimeFromFileName(name: string): string | null {
	const lower = name.trim().toLowerCase();
	if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
	if (lower.endsWith('.png')) return 'image/png';
	if (lower.endsWith('.webp')) return 'image/webp';
	if (lower.endsWith('.gif')) return 'image/gif';
	if (lower.endsWith('.svg')) return 'image/svg+xml';
	if (lower.endsWith('.ico')) return 'image/x-icon';
	if (lower.endsWith('.mp4')) return 'video/mp4';
	if (lower.endsWith('.webm')) return 'video/webm';
	if (lower.endsWith('.mov')) return 'video/quicktime';
	return null;
}

function resolveMimeType(file: File): string {
	let t = (file.type || '').trim().toLowerCase();
	if (t === 'image/x-png') t = 'image/png';
	if (ALLOWED.has(t)) return t;
	const guessed = file.name ? mimeFromFileName(file.name) : null;
	return guessed || t;
}

/**
 * Medien in Supabase Storage (Bucket `cms`). Kein lokales `public/uploads/` mehr.
 * Erfordert `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in der Server-Umgebung.
 */
export async function saveUploadedImageFile(file: File): Promise<CmsMedia> {
	if (!getSupabaseAdmin()) {
		throw new Error(
			'Medien-Uploads sind nur mit Supabase möglich. Bitte SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY in .env setzen und den Storage-Bucket „cms“ anlegen (siehe supabase/migrations).',
		);
	}

	const mime = resolveMimeType(file);
	if (!ALLOWED.has(mime)) {
		throw new Error(
			'Erlaubt: JPEG, PNG, WebP, GIF, SVG, ICO sowie Video MP4/WebM/MOV. (Tipp: Dateiendung prüfen.)',
		);
	}
	const max = VIDEO_TYPES.has(mime) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
	if (file.size > max) {
		throw new Error(
			VIDEO_TYPES.has(mime)
				? `Video zu gross (maximal ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))} MB).`
				: `Datei zu gross (maximal ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB).`,
		);
	}

	const id = crypto.randomUUID();
	const ext = extForMime(mime);
	const filename = `${id}.${ext}`;
	const buffer = Buffer.from(await file.arrayBuffer());

	const publicUrl = await uploadToCmsBucket(filename, buffer, mime);
	return { id, src: publicUrl, createdAt: new Date().toISOString(), alt: '' };
}
