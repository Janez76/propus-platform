import { getSupabaseAdmin } from './admin';

/** Muss zum Bucket in Supabase (Migration 002) passen. */
export const CMS_STORAGE_BUCKET = 'cms';

const PUBLIC_PATH_PREFIX = `/storage/v1/object/public/${CMS_STORAGE_BUCKET}/`;

export async function uploadToCmsBucket(
	objectPath: string,
	body: Buffer,
	contentType: string,
): Promise<string> {
	const supabase = getSupabaseAdmin();
	if (!supabase) throw new Error('Supabase ist nicht konfiguriert.');
	const { error } = await supabase.storage.from(CMS_STORAGE_BUCKET).upload(objectPath, body, {
		contentType,
		upsert: false,
	});
	if (error) throw new Error(`Storage-Upload: ${error.message}`);
	const { data } = supabase.storage.from(CMS_STORAGE_BUCKET).getPublicUrl(objectPath);
	return data.publicUrl;
}

/** Aus öffentlicher Object-URL den Storage-Pfad (`uuid.ext`) extrahieren. */
export function parseCmsStoragePathFromPublicUrl(src: string): string | null {
	try {
		const u = new URL(src);
		const i = u.pathname.indexOf(PUBLIC_PATH_PREFIX);
		if (i === -1) return null;
		const rest = u.pathname.slice(i + PUBLIC_PATH_PREFIX.length);
		return rest ? decodeURIComponent(rest) : null;
	} catch {
		return null;
	}
}

export async function removeFromCmsBucket(objectPath: string): Promise<void> {
	const supabase = getSupabaseAdmin();
	if (!supabase) return;
	const { error } = await supabase.storage.from(CMS_STORAGE_BUCKET).remove([objectPath]);
	if (error) console.error('[storage] remove failed:', error.message);
}
