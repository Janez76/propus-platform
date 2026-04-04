export const PATH_LISTING_ADMIN = "/admin/listing";

export function pathClientGallery(slug: string): string {
  return `/listing/${encodeURIComponent(slug)}`;
}

/**
 * Routen in ClientShell: `/admin/listing`, `/admin/listing/templates`, `/admin/listing/:id` (inkl. `new`).
 * Kein `galleries/`-Präfix — ein Segment nach `/admin/listing/` entspricht genau `:id`.
 */
export function pathListingAdmin(subPath?: string): string {
  if (subPath == null || subPath === "") return PATH_LISTING_ADMIN;
  return `${PATH_LISTING_ADMIN}/${subPath.replace(/^\//, "")}`;
}
