import { Navigate, useSearchParams } from "react-router-dom";
import { PATH_LISTING_ADMIN } from "./paths.ts";

/** Startseite: Picdrop-Vorschau `?galerie=` ins Backpanel; sonst Bildauswahl-Übersicht. */
export function RootRedirect() {
  const [sp] = useSearchParams();
  const galerie = sp.get("galerie")?.trim();
  if (galerie) {
    return <Navigate to={`${PATH_LISTING_ADMIN}/galleries/${encodeURIComponent(galerie)}`} replace />;
  }
  return <Navigate to={PATH_LISTING_ADMIN} replace />;
}
