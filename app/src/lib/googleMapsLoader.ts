/** Shared Google Maps JS API bootstrap (one script tag site-wide; libraries=marker,geocoding). */

/** Backend-Platzhalter / leere Werte — keine gültige Cloud-Map-ID. */
const INVALID_GOOGLE_MAP_IDS = new Set(["", "DEMO_MAP_ID", "demo_map_id"]);

/**
 * Liefert eine Map-ID für `google.maps.Map`/`AdvancedMarkerElement`, oder `undefined`.
 * Ohne gültige ID loggt die Maps-API wiederholt, dass Advanced Markers nicht nutzbar sind.
 */
export function resolveGoogleMapId(raw: string | null | undefined): string | undefined {
  const s = String(raw ?? "").trim();
  if (!s || INVALID_GOOGLE_MAP_IDS.has(s)) return undefined;
  return s;
}

/**
 * Vector Maps mit `mapId` nutzen `colorScheme` statt `styles[]` für Hell/Dunkel.
 * @see https://developers.google.com/maps/documentation/javascript/map-color-scheme
 */
export function gmapsMapIdThemeOptions(dark: boolean): google.maps.MapOptions {
  const CS = (typeof google !== "undefined" && google.maps && (google.maps as unknown as { ColorScheme?: { DARK: string; LIGHT: string } }).ColorScheme) as
    | { DARK: string; LIGHT: string }
    | undefined;
  if (!CS) return {};
  return { colorScheme: dark ? CS.DARK : CS.LIGHT };
}

export type MapsApi = {
  Map: typeof google.maps.Map;
  AdvancedMarker: typeof google.maps.marker.AdvancedMarkerElement;
  Geocoder: typeof google.maps.Geocoder;
  Circle: typeof google.maps.Circle;
};

let mapsApiPromise: Promise<MapsApi> | null = null;
const MAPS_SCRIPT_ID = "propus-gmaps-booking-js";
const MAPS_READY_CB = "__propusGmapsReady";
const READY_POLL_INTERVAL_MS = 50;
const READY_POLL_TIMEOUT_MS = 10_000;

type GmapsReadyCallback = () => void;
type WindowWithCb = Window & { [MAPS_READY_CB]?: GmapsReadyCallback };

function readGlobalApi(): MapsApi | null {
  const g = (typeof window !== "undefined" ? window.google : undefined) as typeof google | undefined;
  if (
    g?.maps?.Map &&
    g.maps.marker?.AdvancedMarkerElement &&
    g.maps.Geocoder &&
    g.maps.Circle
  ) {
    return {
      Map: g.maps.Map,
      AdvancedMarker: g.maps.marker.AdvancedMarkerElement,
      Geocoder: g.maps.Geocoder,
      Circle: g.maps.Circle,
    };
  }
  return null;
}

/**
 * Idempotent: returns existing `google.maps` if already on the page, or injects the script once.
 *
 * Mit `loading=async` darf laut Google-Doku nicht mehr aus dem Script-`load`-Event auf
 * Readiness geschlossen werden — der Namespace kann zu dem Zeitpunkt noch unvollständig sein.
 * Wir nutzen daher den `&callback=`-Parameter (offizieller Ready-Hook). Für den Fall, dass das
 * Script bereits durch eine andere Stelle injiziert wurde (HMR / zweiter Mount), pollen wir bis
 * der Namespace verfügbar ist.
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
      else reject(new Error("google.maps not available after callback"));
    };

    const pollUntilReady = () => {
      const start = Date.now();
      const tick = () => {
        if (readGlobalApi()) return finish();
        if (Date.now() - start > READY_POLL_TIMEOUT_MS) {
          return reject(new Error("google.maps not available within timeout"));
        }
        setTimeout(tick, READY_POLL_INTERVAL_MS);
      };
      tick();
    };

    const existing = document.getElementById(MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      // Script schon eingehängt (HMR / paralleler Mount). onload ist mit loading=async
      // nicht mehr zuverlässig — pollen, bis der Namespace bereit ist.
      pollUntilReady();
      existing.addEventListener("error", () => reject(new Error("script load failed")), { once: true });
      return;
    }

    // Globalen Callback registrieren, BEVOR das Script injiziert wird; Maps ruft ihn,
    // sobald `google.maps.*` vollständig verfügbar ist.
    const win = window as WindowWithCb;
    win[MAPS_READY_CB] = () => {
      try {
        finish();
      } finally {
        delete win[MAPS_READY_CB];
      }
    };

    const s = document.createElement("script");
    s.id = MAPS_SCRIPT_ID;
    s.async = true;
    s.defer = true;
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&libraries=marker,geocoding&v=weekly&loading=async&callback=${MAPS_READY_CB}`;
    s.onerror = () => {
      delete win[MAPS_READY_CB];
      reject(new Error("script load failed"));
    };
    document.head.appendChild(s);
  });

  mapsApiPromise.catch(() => {
    mapsApiPromise = null;
  });

  return mapsApiPromise;
}

/**
 * Erzeugt ein DOM-Element für `AdvancedMarkerElement.content` aus einer SVG-Quelle.
 * `AdvancedMarkerElement` verankert immer die Bottom-Center des Inhalts an der Position;
 * der ursprüngliche `google.maps.Marker.icon.anchor` wird per `translate()` nachgebildet.
 */
/**
 * Icon für klassische `google.maps.Marker` (ohne `mapId` / ohne Advanced Markers).
 * Verhindert die wiederholte Konsolenwarnung „ohne gültige Karten-ID“.
 */
export function svgToLegacyMarkerIcon(opts: {
  svg: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}): google.maps.Icon {
  const { svg, width, height, anchorX, anchorY } = opts;
  return {
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(width, height),
    anchor: new google.maps.Point(anchorX, anchorY),
  };
}

export function createSvgMarkerContent(opts: {
  svg: string;
  width: number;
  height: number;
  /** Anker im Bild wie beim Legacy-`Marker.icon.anchor` (px ab top-left). */
  anchorX: number;
  anchorY: number;
}): HTMLElement {
  const { svg, width, height, anchorX, anchorY } = opts;
  const img = document.createElement("img");
  img.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  img.width = width;
  img.height = height;
  img.style.width = `${width}px`;
  img.style.height = `${height}px`;
  img.style.display = "block";
  img.style.userSelect = "none";
  img.style.pointerEvents = "none";
  // Default-Anker = Bottom-Center → Pixel (W/2, H). Verschieben nach (ax, ay).
  const dx = width / 2 - anchorX;
  const dy = height - anchorY;
  if (dx !== 0 || dy !== 0) {
    img.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  return img;
}
