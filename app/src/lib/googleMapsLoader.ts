/** Shared Google Maps JS API bootstrap (one script tag site-wide; libraries=marker,geocoding). */

export type MapsApi = {
  Map: typeof google.maps.Map;
  Marker: typeof google.maps.Marker;
  Geocoder: typeof google.maps.Geocoder;
  Circle: typeof google.maps.Circle;
};

let mapsApiPromise: Promise<MapsApi> | null = null;
const MAPS_SCRIPT_ID = "propus-gmaps-booking-js";

function readGlobalApi(): MapsApi | null {
  const g = (typeof window !== "undefined" ? window.google : undefined) as typeof google | undefined;
  if (g?.maps?.Map && g.maps.Marker && g.maps.Geocoder && g.maps.Circle) {
    return {
      Map: g.maps.Map,
      Marker: g.maps.Marker,
      Geocoder: g.maps.Geocoder,
      Circle: g.maps.Circle,
    };
  }
  return null;
}

/**
 * Idempotent: returns existing `google.maps` if already on the page, or injects the script once.
 * Classic script URL (not loading=async) so `google.maps.*` is ready in onload
 * (avoids black map with importLibrary in our setup; see comment in original booking map).
 */
export function loadGoogleMapsApi(apiKey: string): Promise<MapsApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no window"));
  }
  const ready = readGlobalApi();
  if (ready) return Promise.resolve(ready);
  if (mapsApiPromise) return mapsApiPromise;

  mapsApiPromise = new Promise<MapsApi>((resolve, reject) => {
    const finish = () => {
      const api = readGlobalApi();
      if (api) resolve(api);
      else reject(new Error("google.maps not available after script load"));
    };

    const existing = document.getElementById(MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (readGlobalApi()) { finish(); return; }
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("script load failed")), { once: true });
      return;
    }

    const s = document.createElement("script");
    s.id = MAPS_SCRIPT_ID;
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=marker,geocoding&v=weekly`;
    s.onload = finish;
    s.onerror = () => reject(new Error("script load failed"));
    document.head.appendChild(s);
  });

  mapsApiPromise.catch(() => {
    mapsApiPromise = null;
  });

  return mapsApiPromise;
}
