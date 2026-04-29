import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { useThemeStore } from "../../store/themeStore";
import { GMAPS_DARK_STYLES } from "./gmapsDarkStyles";
import { t, type Lang } from "../../i18n";
import { gmapsMapIdThemeOptions, loadGoogleMapsApi, resolveGoogleMapId, type MapsApi } from "../../lib/googleMapsLoader";

const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 47.3769, lng: 8.5417 };
const DEFAULT_ZOOM = 8;
const FOCUS_ZOOM = 16;
const GEO_DEBOUNCE_MS = 450;
const MIN_ADDRESS_CHARS = 6;

/** Marker kann je nach `mapId` Advanced (Vektor-Map) oder Legacy (Raster) sein. */
type AnyMarker = google.maps.marker.AdvancedMarkerElement | google.maps.Marker;

type AddressPreviewMapProps = {
  apiKey: string;
  /** Aus `/api/config` — für Advanced Markers erforderlich. */
  googleMapId?: string | null;
  address: string;
  coords: { lat: number; lng: number } | null;
  /** Wenn gesetzt, wird der Pin draggable und ruft bei dragend den Callback mit neuen Koordinaten. */
  onCoordsChange?: (coords: { lat: number; lng: number }) => void;
  className?: string;
  lang?: Lang;
};

type LoadState = "idle" | "loading" | "ready" | "error";
type GeoState = "idle" | "geocoding" | "found" | "notFound";

export function AddressPreviewMap({
  apiKey,
  googleMapId,
  address,
  coords,
  onCoordsChange,
  className,
  lang = "de",
}: AddressPreviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<MapsApi | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<AnyMarker | null>(null);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [geoState, setGeoState] = useState<GeoState>("idle");
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const effectiveMapId = useMemo(() => resolveGoogleMapId(googleMapId), [googleMapId]);
  const useAdvancedMarkers = Boolean(effectiveMapId);

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
          ...(effectiveMapId
            ? { mapId: effectiveMapId, ...gmapsMapIdThemeOptions(dark) }
            : { styles: dark ? GMAPS_DARK_STYLES : [] }),
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
      const m = markerRef.current;
      if (m) {
        if (m instanceof google.maps.Marker) {
          m.setMap(null);
        } else {
          m.map = null;
        }
        markerRef.current = null;
      }
      mapRef.current = null;
    };
  }, [apiKey, effectiveMapId]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const dark = resolvedTheme === "dark";
    if (effectiveMapId) {
      m.setOptions(gmapsMapIdThemeOptions(dark));
    } else {
      m.setOptions({
        styles: dark ? GMAPS_DARK_STYLES : [],
      });
    }
  }, [resolvedTheme, loadState, effectiveMapId]);

  useEffect(() => {
    const map = mapRef.current;
    const api = apiRef.current;
    if (!map || !api) return;

    const placeMarker = (pos: google.maps.LatLngLiteral) => {
      const existing = markerRef.current;
      if (!existing) {
        if (useAdvancedMarkers) {
          const marker = new api.AdvancedMarker({
            map,
            position: pos,
            gmpDraggable: Boolean(onCoordsChange),
            title: onCoordsChange ? t(lang, "booking.step1.mapDragHint") : undefined,
          });
          markerRef.current = marker;
          if (onCoordsChange) {
            marker.addListener("dragend", () => {
              const p = marker.position;
              if (!p) return;
              const lat = typeof p.lat === "function" ? p.lat() : p.lat;
              const lng = typeof p.lng === "function" ? p.lng() : p.lng;
              if (typeof lat !== "number" || typeof lng !== "number") return;
              onCoordsChange({ lat, lng });
            });
          }
        } else {
          const marker = new google.maps.Marker({
            map,
            position: pos,
            draggable: Boolean(onCoordsChange),
            title: onCoordsChange ? t(lang, "booking.step1.mapDragHint") : undefined,
          });
          markerRef.current = marker;
          if (onCoordsChange) {
            marker.addListener("dragend", () => {
              const p = marker.getPosition();
              if (!p) return;
              onCoordsChange({ lat: p.lat(), lng: p.lng() });
            });
          }
        }
      } else if (existing instanceof google.maps.Marker) {
        existing.setPosition(pos);
        existing.setMap(map);
      } else {
        existing.position = pos;
        existing.map = map;
      }
      map.panTo(pos);
      map.setZoom(FOCUS_ZOOM);
    };

    const clearMarker = () => {
      const m = markerRef.current;
      if (!m) return;
      if (m instanceof google.maps.Marker) {
        m.setMap(null);
      } else {
        m.map = null;
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
        "relative mt-3 w-full overflow-hidden rounded-lg border border-border bg-surface-raised",
        "h-64 sm:h-72 min-h-64 max-h-72",
        className,
      )}
    >
      <div ref={containerRef} className="absolute inset-0 h-full w-full" aria-hidden />
      {overlayText ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-(--surface-raised)/85 px-4 text-center">
          <p className="text-xs text-subtle">{overlayText}</p>
        </div>
      ) : null}
    </div>
  );
}
