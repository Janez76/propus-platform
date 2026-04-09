import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { useThemeStore } from "../../store/themeStore";
import { GMAPS_DARK_STYLES } from "./gmapsDarkStyles";

const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 47.3769, lng: 8.5417 };
const DEFAULT_ZOOM = 8;
const FOCUS_ZOOM = 16;
const GEO_DEBOUNCE_MS = 450;
const MIN_ADDRESS_CHARS = 6;

let mapsScriptPromise: Promise<void> | null = null;
const MAPS_SCRIPT_ID = "propus-gmaps-booking-js";

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (mapsScriptPromise) return mapsScriptPromise;

  mapsScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.google?.maps) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => {
        if (window.google?.maps) resolve();
        else {
          mapsScriptPromise = null;
          reject(new Error("Google Maps"));
        }
      });
      existing.addEventListener("error", () => {
        mapsScriptPromise = null;
        reject(new Error("Google Maps"));
      });
      return;
    }
    const s = document.createElement("script");
    s.id = MAPS_SCRIPT_ID;
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    s.onload = () => resolve();
    s.onerror = () => {
      mapsScriptPromise = null;
      reject(new Error("Google Maps"));
    };
    document.head.appendChild(s);
  });
  return mapsScriptPromise;
}

type AddressPreviewMapProps = {
  apiKey: string;
  address: string;
  coords: { lat: number; lng: number } | null;
  className?: string;
};

export function AddressPreviewMap({ apiKey, address, coords, className }: AddressPreviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;

    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled || !el || !window.google?.maps) return;
        const dark = useThemeStore.getState().resolvedTheme === "dark";
        const m = new google.maps.Map(el, {
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: dark ? GMAPS_DARK_STYLES : [],
        });
        setMap(m);
      })
      .catch(() => {
        setMap(null);
      });

    return () => {
      cancelled = true;
      setMap(null);
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
    };
  }, [apiKey]);

  useEffect(() => {
    if (!map) return;
    map.setOptions({
      styles: resolvedTheme === "dark" ? GMAPS_DARK_STYLES : [],
    });
  }, [map, resolvedTheme]);

  useEffect(() => {
    if (!map || !window.google?.maps) return;

    const placeMarker = (pos: google.maps.LatLngLiteral) => {
      if (!markerRef.current) {
        markerRef.current = new google.maps.Marker({ map, position: pos });
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
      return;
    }

    const q = address.trim();
    if (q.length < MIN_ADDRESS_CHARS) {
      clearMarker();
      map.panTo(DEFAULT_CENTER);
      map.setZoom(DEFAULT_ZOOM);
      return;
    }

    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    geocodeTimerRef.current = setTimeout(() => {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: `${q}, Switzerland`, region: "CH" }, (results, status) => {
        if (status !== "OK" || !results?.[0]?.geometry?.location) {
          return;
        }
        const loc = results[0].geometry.location;
        placeMarker({ lat: loc.lat(), lng: loc.lng() });
      });
    }, GEO_DEBOUNCE_MS);

    return () => {
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    };
  }, [map, coords, address]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "mt-3 w-full overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-raised)]",
        "h-44 min-h-[11rem] max-h-[13rem]",
        className,
      )}
      aria-hidden
    />
  );
}

