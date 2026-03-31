/**
 * Direktes <img> statt Astro Image – schnellerer First Paint für CMS-/Supabase-URLs
 * (keine Optimizer-Pipeline).
 */
export function isNativeCmsImageSrc(src: string): boolean {
	if (!src) return false;
	return (
		src.startsWith('/uploads/') ||
		(src.startsWith('http') &&
			(src.includes('/storage/v1/object/public/') ||
				src.includes('/storage/v1/render/image/public/')))
	);
}
