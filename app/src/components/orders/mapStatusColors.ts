import { statusMatches } from "../../lib/status";

export type StatusPalette = { id: string; bg: string; ring: string; labelKey: string };

/**
 * Status-Farbpaare (Quelle der Wahrheit). Wird sowohl von der Karten-Legende
 * (`OrdersMap.tsx`) als auch vom Pin-Renderer (`OrdersMapView.tsx`) genutzt.
 */
export const STATUS_PALETTE: StatusPalette[] = [
  { id: "confirmed",         bg: "#E6F2E3", ring: "#2A7A2A", labelKey: "dashboardV2.map.status.confirmed" },
  { id: "pending",           bg: "#FBEED4", ring: "#B87514", labelKey: "dashboardV2.map.status.pending" },
  { id: "provisional",       bg: "#DFEBF5", ring: "#2E5A7A", labelKey: "dashboardV2.map.status.provisional" },
  { id: "disposition_offen", bg: "#FCE7CE", ring: "#C25E1F", labelKey: "dashboardV2.map.status.disposition_offen" },
  { id: "done",              bg: "#D6E5D2", ring: "#244865", labelKey: "dashboardV2.map.status.done" },
  { id: "paused",            bg: "#E8E5DE", ring: "#6B6962", labelKey: "dashboardV2.map.status.paused" },
];

const FALLBACK: StatusPalette = STATUS_PALETTE[0];
// BKBN-Aufträge (Backbone Photo, kein DB-Auftrag) — bewusst NICHT in STATUS_PALETTE,
// damit die normale Karten-Legende unverändert bleibt; nur Pin-Renderer nutzt es.
export const BKBN_PALETTE: StatusPalette = {
  id: "bkbn",
  bg: "#FDE6D3",
  ring: "#EA580C",
  labelKey: "dashboardV2.map.status.bkbn",
};

export function paletteForStatus(status: string | undefined | null): StatusPalette {
  const s = String(status ?? "").trim();
  if (!s) return FALLBACK;
  if (s === "bkbn") return BKBN_PALETTE;
  if (statusMatches(s, "paused")) return STATUS_PALETTE[5];
  if (statusMatches(s, "done") || statusMatches(s, "completed")) return STATUS_PALETTE[4];
  if (statusMatches(s, "disposition_offen")) return STATUS_PALETTE[3];
  if (statusMatches(s, "provisional")) return STATUS_PALETTE[2];
  if (statusMatches(s, "pending")) return STATUS_PALETTE[1];
  if (statusMatches(s, "confirmed")) return STATUS_PALETTE[0];
  return FALLBACK;
}

/** Tropfen-Pin SVG (26×32). */
export function makeStatusPinSvg(palette: StatusPalette, highlighted = false): string {
  const stroke = highlighted ? "#D4961F" : palette.ring;
  const strokeWidth = highlighted ? 2.4 : 1.6;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="32" viewBox="0 0 26 32">',
    `  <path d="M13 1.5C6.65 1.5 1.5 6.65 1.5 13c0 8.5 11.5 17.5 11.5 17.5S24.5 21.5 24.5 13C24.5 6.65 19.35 1.5 13 1.5z" fill="${palette.bg}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`,
    `  <circle cx="13" cy="13" r="4.2" fill="${palette.ring}"/>`,
    "</svg>",
  ].join("");
}

export function statusPinIconUrl(status: string | undefined | null, highlighted = false): string {
  const svg = makeStatusPinSvg(paletteForStatus(status), highlighted);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
