import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Order } from "../../api/orders";
import { t, type Lang } from "../../i18n";
import { loadGoogleMapsApi, type MapsApi } from "../../lib/googleMapsLoader";
import { GMAPS_DARK_STYLES } from "../../pages-legacy/booking/gmapsDarkStyles";
import { useThemeStore } from "../../store/themeStore";
import {
  WX_COLOR,
  makeWeatherZoneSvg,
  type WeatherZone,
} from "../dashboard-v2/dashboardWeather";
import { statusPinIconUrl } from "./mapStatusColors";

const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 47.3769, lng: 8.5417 };
const DEFAULT_ZOOM = 8;
const MIN_ADDRESS_CHARS = 6;
const GEO_STAGGER_MS = 100;

type Props = {
  orders: Order[];
  apiKey: string;
  onOpenDetail: (orderNo: string) => void;
  lang: Lang;
  weatherZones?: readonly WeatherZone[];
};

type GeoEntry = { lat: number; lng: number } | "fail";
type GeocodeMap = Map<string, GeoEntry>;

function normalizeAddr(a: string | undefined): string {
  return (a ?? "").trim();
}

function applyRingOffset(
  base: { lat: number; lng: number },
  index: number,
  count: number,
): google.maps.LatLngLiteral {
  if (count <= 1) return { lat: base.lat, lng: base.lng };
  const rDeg = 0.00022;
  const angle = (2 * Math.PI * index) / count;
  const dLat = rDeg * Math.cos(angle);
  const dLng = (rDeg * Math.sin(angle)) / Math.max(0.35, Math.cos((base.lat * Math.PI) / 180));
  return { lat: base.lat + dLat, lng: base.lng + dLng };
}

export function OrdersMapView({ orders, apiKey, onOpenDetail, lang, weatherZones }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<MapsApi | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocodeRef = useRef<GeocodeMap>(new Map());
  const inFlight = useRef<Set<string>>(new Set());
  const markerListenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const weatherCirclesRef = useRef<google.maps.Circle[]>([]);
  const weatherMarkersRef = useRef<google.maps.Marker[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [geocodeVersion, setGeocodeVersion] = useState(0);
  const [geocodingBusy, setGeocodingBusy] = useState(false);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  const { shortAddressCount, geocodeableOrders } = useMemo(() => {
    let short = 0;
    const good: Order[] = [];
    for (const o of orders) {
      const addr = normalizeAddr(o.address);
      if (addr.length < MIN_ADDRESS_CHARS) short++;
      else good.push(o);
    }
    return { shortAddressCount: short, geocodeableOrders: good };
  }, [orders]);

  const byAddress = useMemo(() => {
    const m = new Map<string, Order[]>();
    for (const o of geocodeableOrders) {
      const k = normalizeAddr(o.address);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(o);
    }
    return m;
  }, [geocodeableOrders]);

  const ordersGeoKey = useMemo(
    () => geocodeableOrders.map((o) => `${o.orderNo}:${normalizeAddr(o.address)}`).join("|"),
    [geocodeableOrders],
  );

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
          fullscreenControl: true,
          styles: dark ? GMAPS_DARK_STYLES : [],
        });
        mapRef.current = m;
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });
    return () => {
      cancelled = true;
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

  const geocodeUniqueAddresses = useCallback(async (signal: AbortSignal) => {
    const cache = geocodeRef.current;
    const api = apiRef.current;
    if (!api) return;

    const addrs = [...new Set(geocodeableOrders.map((o) => normalizeAddr(o.address)).filter((a) => a.length >= MIN_ADDRESS_CHARS))];

    for (const addr of addrs) {
      if (signal.aborted) return;
      if (cache.has(addr)) continue;
      if (inFlight.current.has(addr)) continue;
      inFlight.current.add(addr);

      const geocodeOne = () =>
        new Promise<GeoEntry>((resolve) => {
          const geocoder = new api.Geocoder();
          geocoder.geocode({ address: `${addr}, Switzerland`, region: "CH" }, (results, status) => {
            if (status !== "OK" || !results?.[0]?.geometry?.location) {
              resolve("fail");
              return;
            }
            const loc = results[0].geometry.location;
            resolve({ lat: loc.lat(), lng: loc.lng() });
          });
        });

      const result = await geocodeOne();
      inFlight.current.delete(addr);
      if (signal.aborted) return;
      cache.set(addr, result);

      await new Promise((r) => setTimeout(r, GEO_STAGGER_MS));
    }
  }, [geocodeableOrders]);

  useEffect(() => {
    if (loadState !== "ready") return;
    const c = new AbortController();
    setGeocodingBusy(true);
    void (async () => {
      try {
        await geocodeUniqueAddresses(c.signal);
      } finally {
        if (!c.signal.aborted) {
          setGeocodingBusy(false);
          setGeocodeVersion((v) => v + 1);
        }
      }
    })();
    return () => c.abort();
  }, [loadState, geocodeUniqueAddresses, ordersGeoKey]);

  /** Wetterzonen (Halo + Mini-Pill) – nur aktiv wenn Zonen übergeben werden. */
  useEffect(() => {
    if (loadState !== "ready") return;
    const map = mapRef.current;
    const api = apiRef.current;
    if (!map || !api) return;

    for (const c of weatherCirclesRef.current) c.setMap(null);
    weatherCirclesRef.current = [];
    for (const m of weatherMarkersRef.current) m.setMap(null);
    weatherMarkersRef.current = [];

    if (!weatherZones || weatherZones.length === 0) return;

    for (const z of weatherZones) {
      const color = WX_COLOR[z.kind];
      const circle = new api.Circle({
        map,
        center: { lat: z.lat, lng: z.lng },
        radius: 4500,
        strokeWeight: 0,
        fillColor: color,
        fillOpacity: 0.1,
        clickable: false,
      });
      weatherCirclesRef.current.push(circle);

      const svg = makeWeatherZoneSvg(z);
      const marker = new api.Marker({
        map,
        position: { lat: z.lat, lng: z.lng },
        icon: {
          url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
          scaledSize: new google.maps.Size(104, 32),
          anchor: new google.maps.Point(52, 16),
        },
        zIndex: 9999,
        clickable: false,
        title: `${z.city}: ${z.t}°C · ${z.precip}%`,
      });
      weatherMarkersRef.current.push(marker);
    }

    return () => {
      for (const c of weatherCirclesRef.current) c.setMap(null);
      weatherCirclesRef.current = [];
      for (const m of weatherMarkersRef.current) m.setMap(null);
      weatherMarkersRef.current = [];
    };
  }, [loadState, weatherZones]);

  useEffect(() => {
    const map = mapRef.current;
    const api = apiRef.current;
    if (loadState !== "ready" || !map || !api) return;

    for (const m of markersRef.current) m.setMap(null);
    markersRef.current = [];
    for (const h of markerListenersRef.current) h.remove();
    markerListenersRef.current = [];

    const cache = geocodeRef.current;
    const bounds = new google.maps.LatLngBounds();
    let any = false;
    const positions: { pos: google.maps.LatLngLiteral; order: Order; at: number; total: number }[] = [];

    for (const [addr, group] of byAddress) {
      const g = cache.get(addr);
      if (!g || g === "fail") continue;
      const n = group.length;
      for (let i = 0; i < n; i++) {
        const pos = applyRingOffset(g, i, n);
        positions.push({ pos, order: group[i], at: i, total: n });
        bounds.extend(pos);
        any = true;
      }
    }

    for (const { pos, order } of positions) {
      const title = order.customerName
        ? `#${order.orderNo} – ${order.customerName}`
        : `#${order.orderNo}`;

      const mk = new api.Marker({
        map,
        position: pos,
        title,
        optimized: true,
        icon: {
          url: statusPinIconUrl(order.status),
          scaledSize: new google.maps.Size(26, 32),
          anchor: new google.maps.Point(13, 32),
        },
      });
      markersRef.current.push(mk);
      const h = mk.addListener("click", () => onOpenDetail(String(order.orderNo)));
      markerListenersRef.current.push(h);
    }

    if (any) {
      map.fitBounds(bounds, 48);
      const z = map.getZoom();
      if (z != null && z > 14) map.setZoom(14);
    } else {
      map.panTo(DEFAULT_CENTER);
      map.setZoom(DEFAULT_ZOOM);
    }

    return () => {
      for (const m of markersRef.current) m.setMap(null);
      markersRef.current = [];
      for (const h of markerListenersRef.current) h.remove();
      markerListenersRef.current = [];
    };
  }, [loadState, geocodeVersion, onOpenDetail, byAddress, ordersGeoKey]);

  const overlay = (() => {
    if (loadState === "loading") return t(lang, "orders.map.loading");
    if (loadState === "error") return t(lang, "orders.map.loadError");
    if (geocodingBusy) return t(lang, "orders.map.geocoding");
    return null;
  })();

  return (
    <div className="space-y-2">
      {shortAddressCount > 0 ? (
        <p className="text-xs text-(--propus-text-muted)">
          {t(lang, "orders.map.noAddress").replace("{{count}}", String(shortAddressCount))}
        </p>
      ) : null}
      <div
        className="relative w-full min-h-96 md:min-h-128 overflow-hidden rounded-xl border border-(--propus-border) bg-(--propus-bg-strip)"
      >
        <div ref={containerRef} className="absolute inset-0 h-full w-full" aria-label={t(lang, "orders.view.map")} role="region" />
        {overlay ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-(--propus-bg-strip)/80 px-4 text-center">
            <p className="text-sm text-(--propus-text-muted)">{overlay}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function OrdersMapViewNoKey({ lang }: { lang: Lang }) {
  return (
    <div className="rounded-xl border border-dashed border-(--propus-border) bg-(--propus-bg-card) p-6 text-sm text-(--propus-text-muted)">
      {t(lang, "orders.map.noKey")}
    </div>
  );
}
