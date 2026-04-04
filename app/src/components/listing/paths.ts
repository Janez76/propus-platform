export const PATH_LISTING_ADMIN = "/admin/listing";

export function pathClientGallery(slug: string): string {
  return `/listing/${encodeURIComponent(slug)}`;
}

export function pathListingAdmin(subPath?: string): string {
  if (subPath == null || subPath === "") return PATH_LISTING_ADMIN;
  return `${PATH_LISTING_ADMIN}/${subPath.replace(/^\//, "")}`;
}
