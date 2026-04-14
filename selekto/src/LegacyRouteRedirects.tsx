import { Navigate, useLocation, useParams } from "react-router-dom";
import { PATH_LISTING_ADMIN, pathClientGallery, pathListingAdmin } from "./paths.ts";

/** Alte URL `/g/:slug` → `/listing/:slug` */
export function LegacyGalleryRedirect() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <Navigate to="/" replace />;
  return <Navigate to={pathClientGallery(slug)} replace />;
}

/** Alte URL `/listing/magiclink/:slug` → `/listing/:slug` */
export function LegacyListingMagiclinkRedirect() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <Navigate to="/" replace />;
  return <Navigate to={pathClientGallery(slug)} replace />;
}

/** Alte URLs `/admin/…` → `/bilder-auswahl/…` */
export function LegacyAdminRedirect() {
  const loc = useLocation();
  const tail = loc.pathname.replace(/^\/admin\/?/, "");
  const to = pathListingAdmin(tail || undefined) + loc.search + loc.hash;
  return <Navigate to={to} replace />;
}

/** Frühere Backpanel-URLs `/listing/admin/…` → `/bilder-auswahl/…` */
export function LegacyListingAdminRedirect() {
  const loc = useLocation();
  const tail = loc.pathname.replace(/^\/listing\/admin\/?/, "").replace(/\/$/, "");
  let to = PATH_LISTING_ADMIN;
  if (tail && tail !== "galleries" && tail !== "demo") {
    to = `${PATH_LISTING_ADMIN}/${tail}`;
  }
  return <Navigate to={to + loc.search + loc.hash} replace />;
}
