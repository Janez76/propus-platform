import { getPortalHostname } from "./postLoginRedirect";

export function isPortalHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname.toLowerCase() === getPortalHostname();
}
