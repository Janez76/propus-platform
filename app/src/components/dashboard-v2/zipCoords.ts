/**
 * Hardcoded Swiss ZIP → lat/lng table for the OrdersMap on the dashboard.
 * Covers the most common ZIPs in our service region (Greater Zurich + Zug
 * + Winterthur + a few additional major cities). Orders with ZIPs not in
 * this table are silently skipped and counted in a "ohne Koordinaten" hint.
 *
 * Long-term plan: replace with Google Geocoding API (key already used by
 * `/api/reverse-geocode`) once we want full Swiss coverage.
 */
export interface ZipCoord {
  lat: number;
  lng: number;
  area: string;
}

export const ZIP_COORDS: Record<string, ZipCoord> = {
  // Zürich Stadt
  "8001": { lat: 47.3722, lng: 8.5414, area: "Zürich Altstadt" },
  "8002": { lat: 47.3633, lng: 8.5305, area: "Zürich Enge" },
  "8003": { lat: 47.3727, lng: 8.5192, area: "Zürich Wiedikon" },
  "8004": { lat: 47.3793, lng: 8.5208, area: "Zürich Aussersihl" },
  "8005": { lat: 47.3870, lng: 8.5194, area: "Zürich Industriequartier" },
  "8006": { lat: 47.3874, lng: 8.5446, area: "Zürich Unterstrass" },
  "8008": { lat: 47.3565, lng: 8.5545, area: "Zürich Riesbach" },
  "8032": { lat: 47.3704, lng: 8.5642, area: "Zürich Hottingen" },
  "8037": { lat: 47.3905, lng: 8.5302, area: "Zürich Wipkingen" },
  "8038": { lat: 47.3499, lng: 8.5275, area: "Zürich Wollishofen" },
  "8044": { lat: 47.3779, lng: 8.5734, area: "Zürich Fluntern" },
  "8045": { lat: 47.3596, lng: 8.5099, area: "Zürich Wollishofen" },
  "8046": { lat: 47.4181, lng: 8.5102, area: "Zürich Affoltern" },
  "8047": { lat: 47.3711, lng: 8.4988, area: "Zürich Albisrieden" },
  "8048": { lat: 47.3870, lng: 8.4863, area: "Zürich Altstetten" },
  "8049": { lat: 47.4072, lng: 8.4845, area: "Zürich Höngg" },
  "8050": { lat: 47.4117, lng: 8.5446, area: "Zürich Oerlikon" },
  "8051": { lat: 47.4123, lng: 8.5697, area: "Zürich Schwamendingen" },
  "8052": { lat: 47.4231, lng: 8.5340, area: "Zürich Seebach" },
  "8053": { lat: 47.3650, lng: 8.5736, area: "Zürich Witikon" },
  "8055": { lat: 47.3641, lng: 8.5121, area: "Zürich Friesenberg" },
  "8057": { lat: 47.4002, lng: 8.5436, area: "Zürich Unterstrass" },
  "8064": { lat: 47.3984, lng: 8.4716, area: "Zürich Altstetten" },
  // Region Zürich (Agglomeration)
  "8134": { lat: 47.3219, lng: 8.6234, area: "Adliswil" },
  "8152": { lat: 47.4339, lng: 8.4634, area: "Glattbrugg" },
  "8154": { lat: 47.4607, lng: 8.4920, area: "Oberglatt" },
  "8157": { lat: 47.4633, lng: 8.5236, area: "Dielsdorf" },
  "8180": { lat: 47.4769, lng: 8.5453, area: "Bülach" },
  "8302": { lat: 47.4456, lng: 8.6129, area: "Kloten" },
  "8303": { lat: 47.4358, lng: 8.6385, area: "Bassersdorf" },
  "8304": { lat: 47.4252, lng: 8.6604, area: "Wallisellen" },
  "8305": { lat: 47.4097, lng: 8.6403, area: "Dietlikon" },
  "8306": { lat: 47.4183, lng: 8.6843, area: "Brüttisellen" },
  "8307": { lat: 47.4344, lng: 8.7253, area: "Effretikon" },
  "8330": { lat: 47.3413, lng: 8.7195, area: "Pfäffikon ZH" },
  "8400": { lat: 47.5006, lng: 8.7241, area: "Winterthur" },
  "8404": { lat: 47.5052, lng: 8.7635, area: "Winterthur" },
  "8405": { lat: 47.5126, lng: 8.7041, area: "Winterthur" },
  "8408": { lat: 47.4732, lng: 8.7016, area: "Winterthur" },
  "8484": { lat: 47.5083, lng: 8.8186, area: "Weisslingen" },
  "8500": { lat: 47.6562, lng: 8.6313, area: "Frauenfeld" },
  "8600": { lat: 47.3414, lng: 8.5651, area: "Dübendorf" },
  "8610": { lat: 47.3678, lng: 8.6225, area: "Uster" },
  "8620": { lat: 47.3097, lng: 8.6837, area: "Wetzikon" },
  "8700": { lat: 47.3174, lng: 8.5867, area: "Küsnacht" },
  "8702": { lat: 47.3033, lng: 8.5921, area: "Zollikon" },
  "8703": { lat: 47.2884, lng: 8.6085, area: "Erlenbach" },
  "8704": { lat: 47.2728, lng: 8.6373, area: "Herrliberg" },
  "8706": { lat: 47.2473, lng: 8.6724, area: "Meilen" },
  "8708": { lat: 47.2247, lng: 8.7231, area: "Männedorf" },
  "8712": { lat: 47.2156, lng: 8.7572, area: "Stäfa" },
  "8800": { lat: 47.2926, lng: 8.5634, area: "Thalwil" },
  "8802": { lat: 47.2680, lng: 8.5755, area: "Kilchberg" },
  "8810": { lat: 47.2546, lng: 8.5836, area: "Horgen" },
  "8820": { lat: 47.2207, lng: 8.6184, area: "Wädenswil" },
  "8832": { lat: 47.2065, lng: 8.7033, area: "Wollerau" },
  "8834": { lat: 47.1982, lng: 8.7488, area: "Schindellegi" },
  // Zug
  "6300": { lat: 47.1662, lng: 8.5155, area: "Zug" },
  "6301": { lat: 47.1681, lng: 8.5181, area: "Zug" },
  "6312": { lat: 47.1872, lng: 8.5739, area: "Steinhausen" },
  "6330": { lat: 47.1721, lng: 8.4669, area: "Cham" },
  "6340": { lat: 47.1357, lng: 8.4699, area: "Baar" },
  "6341": { lat: 47.1279, lng: 8.4867, area: "Baar" },
  "6343": { lat: 47.1029, lng: 8.4581, area: "Rotkreuz" },
  "6345": { lat: 47.0913, lng: 8.5148, area: "Neuheim" },
  // Aargau Ost (häufige Auftraege)
  "5400": { lat: 47.4734, lng: 8.3036, area: "Baden" },
  "5430": { lat: 47.4411, lng: 8.3236, area: "Wettingen" },
  "5408": { lat: 47.4597, lng: 8.2843, area: "Ennetbaden" },
  "5452": { lat: 47.4498, lng: 8.2348, area: "Oberrohrdorf" },
  // Luzern
  "6000": { lat: 47.0502, lng: 8.3093, area: "Luzern" },
  "6003": { lat: 47.0494, lng: 8.3036, area: "Luzern" },
  "6004": { lat: 47.0577, lng: 8.3122, area: "Luzern" },
  "6005": { lat: 47.0463, lng: 8.3296, area: "Luzern" },
  "6006": { lat: 47.0594, lng: 8.3459, area: "Luzern" },
  // Schwyz
  "6410": { lat: 47.0211, lng: 8.6537, area: "Goldau" },
  "6440": { lat: 46.9787, lng: 8.5797, area: "Brunnen" },
  "6460": { lat: 46.9873, lng: 8.5946, area: "Altdorf" },
};

export function lookupZip(zipcity: string | undefined | null): ZipCoord | null {
  if (!zipcity) return null;
  const m = String(zipcity).match(/^\d{4}/);
  if (!m) return null;
  return ZIP_COORDS[m[0]] ?? null;
}
