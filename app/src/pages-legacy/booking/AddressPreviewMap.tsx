import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { useThemeStore } from "../../store/themeStore";
import { GMAPS_DARK_STYLES } from "./gmapsDarkStyles";
import { t, type Lang } from "../../i18n";

const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 47.3769, lng: 8.5417 };
const DEFAULT_ZOOM = 8;
const FOCUS_ZOOM = 16;
const GEO_DEBOUNCE_MS = 450;
const MIN_ADDRESS_CHARS = 6;

type MapsApi = {
  Map: typeof google.maps.Map;
  Marker: typeof google.maps.Marker;
  Geocoder: typeof google.maps.Geocoder;
};

let mapsApiPromise: Promise<MapsApi> | null = null;
const MAPS_SCRIPT_ID = "propus-gmaps-booking-js";

function loadGoogleMapsApi(apiKey: string): Promise<MapsApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no window"));
  }
  if (mapsApiPromise) return mapsApiPromise;

  mapsApiPromise = (async () => {
    const existing = document.getElementById(MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (!existing) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.id = MAPS_SCRIPT_ID;
        s.async = true;
        // loading=async erfordert importLibrary() — der direkte Zugriff auf
        // window.google.maps.Map waere undefined, der Karten-Container
        // bliebe leer (schwarzer Kasten).
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&v=weekly`;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("script load failed"));
        document.head.appendChild(s);
      });
    } else if (!window.google?.maps?.importLibrary) {
      await new Promise<void>((resolve, reject) => {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("script load failed")), { once: true });
      });
    }
    if (!window.google?.maps?.importLibrary) {
      throw new Error("importLibrary missing after script load");
    }
    const [mapsLib, markerLib, geoLib] = await Promise.all([
      window.google.maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
      window.google.maps.importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
      window.google.maps.importLibrary("geocoding") as Promise<google.maps.GeocodingLibrary>,
    ]);
    return { Map: mapsLib.Map, Marker: markerLib.Marker, Geocoder: geoLib.Geocoder };
  })();

  mapsApiPromise.catch(() => {
    mapsApiPromise = null;
  });

  return mapsApiPromise;
}

type AddressPreviewMapProps = {
  apiKey: string;
  address: string;
  coords: { lat: number; lng: number } | null;
  className?: string;
  lang?: Lang;
};

type LoadState = "idle" | "loading" | "ready" | "error";
type GeoState = "idle" | "geocoding" | "found" | "notFound";

export function AddressPreviewMap({ apiKey, address, coords, className, lang = "de" }: AddressPreviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<MapsApi | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [geoState, setGeoState] = useState<GeoState>("idle");
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    setLoadState("loading");

    loadGoogleMapsApi(apiKey)
      .then((api) => {
        if (cancelled || !el) return;
        apiRef.current = api;
        const dark = useThemeStore.getState().resolvedTheme === "dark";
        const m = new api.Map(el, {
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: dark ? GMAPS_DARK_STYLES : [],
        });
        mapRef.current = m;
        setLoadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
      });

    return () => {
      cancelled = true;
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      mapRef.current = null;
    };
  }, [apiKey]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.setOptions({
      styles: resolvedTheme === "dark" ? GMAPS_DARK_STYLES : [],
    });
  }, [resolvedTheme, loadState]);

  useEffect(() => {
    const map = mapRef.current;
    const api = apiRef.current;
    if (!map || !api) return;

    const placeMarker = (pos: google.maps.LatLngLiteral) => {
      if (!markerRef.current) {
        markerRef.current = new api.Marker({ map, position: pos });
      } else {
        markerRef.current.setPosition(pos);
        markerRef.current.setMap(map);
      }
      map.panTo(pos);
      map.setZoom(FOCUS_ZOOM);
    };

    const clearMarker = () => {
      if (markerRef.current) {
        markerRef.current.setMap(null);
      }
    };

    if (coords) {
      placeMarker({ lat: coords.lat, lng: coords.lng });
      setGeoState("found");
      return;
    }

    const q = address.trim();
    if (q.length < MIN_ADDRESS_CHARS) {
      clearMarker();
      map.panTo(DEFAULT_CENTER);
      map.setZoom(DEFAULT_ZOOM);
      setGeoState("idle");
      return;
    }

    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    setGeoState("geocoding");
    geocodeTimerRef.current = setTimeout(() => {
      const geocoder = new api.Geocoder();
      geocoder.geocode({ address: `${q}, Switzerland`, region: "CH" }, (results, status) => {
        if (status !== "OK" || !results?.[0]?.geometry?.location) {
          setGeoState("notFound");
          return;
        }
        const loc = results[0].geometry.location;
        placeMarker({ lat: loc.lat(), lng: loc.lng() });
        setGeoState("found");
      });
    }, GEO_DEBOUNCE_MS);

    return () => {
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    };
  }, [coords, address, loadState]);

  const overlayText: string | null =
    loadState === "loading" ? t(lang, "booking.step1.mapLoading") :
    loadState === "error" ? t(lang, "booking.step1.mapLoadError") :
    geoState === "notFound" ? t(lang, "booking.step1.mapAddressNotFound") :
    null;

  return (
    <div
      className={cn(
        "relative mt-3 w-full overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)]",
        "h-44 min-h-[11rem] max-h-[13rem]",
        className,
      )}
    >
      <div ref={containerRef} className="absolute inset-0 h-full w-full" aria-hidden />
      {overlayText ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--surface-raised)]/85 px-4 text-center">
          <p className="text-xs text-[var(--text-subtle)]">{overlayText}</p>
        </div>
      ) : null}
    </div>
  );
}
