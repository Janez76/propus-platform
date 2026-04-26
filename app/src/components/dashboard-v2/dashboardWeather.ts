/**
 * Wetterzonen für die Dashboard-Karte.
 * Stadtkoordinaten sind statisch; Wetterwerte (`t`, `precip`, `kind`)
 * werden zur Laufzeit über `useWeatherZones` von Open-Meteo geladen.
 */
export type WeatherKind = "sun" | "psun" | "cloud" | "rain" | "snow" | "storm" | "fog";

export interface WeatherCity {
  city: string;
  lat: number;
  lng: number;
}

export interface WeatherZone extends WeatherCity {
  kind: WeatherKind;
  /** Lufttemperatur in °C, gerundet. */
  t: number;
  /** Niederschlagswahrscheinlichkeit 0–100. */
  precip: number;
}

/** Für die Karte angezeigte Schweizer Städte. */
export const WEATHER_CITIES: readonly WeatherCity[] = [
  { city: "Zürich",     lat: 47.3769, lng: 8.5417 },
  { city: "Winterthur", lat: 47.5006, lng: 8.7241 },
  { city: "Zug",        lat: 47.1662, lng: 8.5155 },
  { city: "Thalwil",    lat: 47.2926, lng: 8.5634 },
  { city: "Küsnacht",   lat: 47.3174, lng: 8.5867 },
];

export const WX_COLOR: Record<WeatherKind, string> = {
  sun: "#D4961F",
  psun: "#B68A3A",
  cloud: "#6B6962",
  rain: "#2E5A7A",
  snow: "#A8B5C5",
  storm: "#5A4080",
  fog: "#8A8680",
};

/**
 * SVG-Pill für eine Wetterzone (für Google-Maps Marker als data:-URL).
 * Hintergrund halb-transparentes Weiss, damit es auf hell und dunkel funktioniert.
 */
export function makeWeatherZoneSvg(zone: WeatherZone): string {
  const color = WX_COLOR[zone.kind];
  const safeCity = zone.city.replace(/[<&>]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
  );
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="104" height="32" viewBox="0 0 104 32">',
    `  <rect x="1" y="1" width="102" height="30" rx="15" fill="rgba(255,255,255,0.96)" stroke="${color}" stroke-width="1.4"/>`,
    `  <circle cx="14" cy="16" r="6.5" fill="${color}"/>`,
    `  <text x="28" y="21" font-family="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="13" font-weight="700" fill="${color}">${zone.t}°</text>`,
    `  <text x="48" y="21" font-family="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="11" font-weight="500" fill="#444">${safeCity}</text>`,
    "</svg>",
  ].join("\n");
}

/** Glyph (Unicode) je Wetterart – wird im Mini-Chip gerendert. */
export const WX_GLYPH: Record<WeatherKind, string> = {
  sun: "☀",   // ☀
  psun: "⛅",  // ⛅
  cloud: "☁", // ☁
  rain: "☔",  // ☂ (Regen-Schirm liest sich auf kleinem Chip besser als 🌧)
  snow: "❄",  // ❄
  storm: "⚡", // ⚡
  fog: "▒",   // ▒ (Nebel-Hatch)
};

/** Lesbares Label (de-CH) je Wetterart – für Tooltip / InfoWindow. */
export const WX_LABEL_DE: Record<WeatherKind, string> = {
  sun: "Sonnig",
  psun: "Teils sonnig",
  cloud: "Bewölkt",
  rain: "Regen",
  snow: "Schnee",
  storm: "Gewitter",
  fog: "Nebel",
};

/**
 * Kompakter Wetter-Chip für genau einen Auftrag (Mini-Pill über dem Pin).
 * Format: ☀ 18°  – ~58×22 px. Source kann "forecast" oder "archive" sein.
 */
export function makeOrderWeatherSvg(args: {
  kind: WeatherKind;
  tMax: number;
  tMin: number;
  precip: number;
  source: "forecast" | "archive";
}): string {
  const color = WX_COLOR[args.kind];
  const glyph = WX_GLYPH[args.kind];
  const label = `${args.tMax}°`;
  // Forecast = solider Rand, Archive = gestrichelt (effektiv gemessen → andere Anmutung).
  const dash = args.source === "archive" ? ' stroke-dasharray="2,2"' : "";
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="58" height="22" viewBox="0 0 58 22">',
    `  <rect x="1" y="1" width="56" height="20" rx="10" fill="rgba(255,255,255,0.97)" stroke="${color}" stroke-width="1.3"${dash}/>`,
    `  <text x="11" y="16" text-anchor="middle" font-family="-apple-system, 'Segoe UI Emoji', 'Apple Color Emoji', system-ui, sans-serif" font-size="12" fill="${color}">${glyph}</text>`,
    `  <text x="36" y="16" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" font-weight="700" fill="${color}">${label}</text>`,
    "</svg>",
  ].join("");
}
