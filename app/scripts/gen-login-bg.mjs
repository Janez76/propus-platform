// Generiert die vier Login-Hintergrundbilder (dunkle, abstrakte Architektur-
// Texturen) als WebP nach app/public/login/.
//
//   node app/scripts/gen-login-bg.mjs   (aus dem app/-Verzeichnis: node scripts/gen-login-bg.mjs)
//
// Kein externer Dienst nötig — reine SVG→WebP-Rasterung via sharp. Wenn echte
// Propus-Aufnahmen vorliegen, einfach die WebPs ersetzen (Dateinamen behalten).

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const W = 2400;
const H = 1350;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "login");

// Gemeinsame Bausteine ---------------------------------------------------------

/** Feines Architektur-Raster, das zur Mitte hin ausblendet. */
function grid(spacing, opacity) {
  const lines = [];
  for (let x = spacing; x < W; x += spacing) {
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" />`);
  }
  for (let y = spacing; y < H; y += spacing) {
    lines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" />`);
  }
  return `<g stroke="#F4F1EA" stroke-width="1" opacity="${opacity}" mask="url(#fade)">${lines.join("")}</g>`;
}

/** Dunkles Vignette-Overlay, damit die Glas-Karte immer lesbar bleibt. */
const vignette = `
  <rect width="${W}" height="${H}" fill="url(#vig)" />
  <rect width="${W}" height="${H}" fill="#0a0b0e" opacity="0.28" />
`;

const defsCommon = `
  <radialGradient id="vig" cx="32%" cy="46%" r="78%">
    <stop offset="0%" stop-color="#000" stop-opacity="0" />
    <stop offset="58%" stop-color="#08090c" stop-opacity="0.45" />
    <stop offset="100%" stop-color="#08090c" stop-opacity="0.92" />
  </radialGradient>
  <radialGradient id="fadeG" cx="50%" cy="50%" r="62%">
    <stop offset="0%" stop-color="#fff" />
    <stop offset="62%" stop-color="#fff" stop-opacity="0.5" />
    <stop offset="100%" stop-color="#000" />
  </radialGradient>
  <mask id="fade"><rect width="${W}" height="${H}" fill="url(#fadeG)" /></mask>
`;

function svg(inner, extraDefs = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>${defsCommon}${extraDefs}</defs>
    <rect width="${W}" height="${H}" fill="#0c0d10" />
    ${inner}
    ${vignette}
  </svg>`;
}

// Die vier Motive --------------------------------------------------------------

// bg-1 — "Modern Living · Abendlicht": warme Lichtquelle, ruhige Diagonale
const bg1 = svg(
  `
  <rect width="${W}" height="${H}" fill="url(#g1)" />
  <ellipse cx="${W * 0.78}" cy="${H * 0.28}" rx="${W * 0.42}" ry="${H * 0.42}" fill="url(#glow1)" />
  ${grid(120, 0.05)}
  <rect x="${W * 0.62}" y="0" width="2" height="${H}" fill="#C5A073" opacity="0.18" />
  <rect x="0" y="${H * 0.7}" width="${W}" height="2" fill="#C5A073" opacity="0.12" />
  `,
  `
  <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#101116" />
    <stop offset="55%" stop-color="#0c0d10" />
    <stop offset="100%" stop-color="#070708" />
  </linearGradient>
  <radialGradient id="glow1" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#B68E20" stop-opacity="0.30" />
    <stop offset="40%" stop-color="#7a5e14" stop-opacity="0.12" />
    <stop offset="100%" stop-color="#000" stop-opacity="0" />
  </radialGradient>
  `,
);

// bg-2 — "Architektur · Bauhaus-Linie": kühle Glasfassade, vertikale Mullions
const bg2Mullions = (() => {
  const out = [];
  for (let i = 1; i < 16; i++) {
    const x = (W / 16) * i;
    out.push(`<rect x="${x}" y="0" width="${i % 4 === 0 ? 3 : 1.5}" height="${H}" fill="#aebfd0" opacity="${i % 4 === 0 ? 0.16 : 0.07}" />`);
  }
  for (let j = 1; j < 6; j++) {
    const y = (H / 6) * j;
    out.push(`<rect x="0" y="${y}" width="${W}" height="1.5" fill="#aebfd0" opacity="0.06" />`);
  }
  return out.join("");
})();
const bg2 = svg(
  `
  <rect width="${W}" height="${H}" fill="url(#g2)" />
  <rect x="0" y="0" width="${W * 0.5}" height="${H}" fill="url(#sheen2)" />
  <g mask="url(#fade)">${bg2Mullions}</g>
  `,
  `
  <linearGradient id="g2" x1="0" y1="0" x2="0.3" y2="1">
    <stop offset="0%" stop-color="#11151c" />
    <stop offset="50%" stop-color="#0b0e14" />
    <stop offset="100%" stop-color="#06080b" />
  </linearGradient>
  <linearGradient id="sheen2" x1="0" y1="0" x2="1" y2="0.4">
    <stop offset="0%" stop-color="#5b7894" stop-opacity="0.10" />
    <stop offset="100%" stop-color="#5b7894" stop-opacity="0" />
  </linearGradient>
  `,
);

// bg-3 — "Material · Beton & Licht": dramatisches Streiflicht über dunkler Fläche
const bg3 = svg(
  `
  <rect width="${W}" height="${H}" fill="#0a0b0d" />
  <polygon points="0,${H} ${W * 0.55},0 ${W * 0.78},0 ${W * 0.18},${H}" fill="url(#beam3)" />
  <polygon points="${W * 0.6},0 ${W * 0.66},0 ${W * 0.24},${H} ${W * 0.18},${H}" fill="#C5A073" opacity="0.10" />
  ${grid(160, 0.03)}
  <rect width="${W}" height="${H}" fill="url(#tint3)" />
  `,
  `
  <linearGradient id="beam3" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0%" stop-color="#2b2c30" stop-opacity="0" />
    <stop offset="45%" stop-color="#3a3b40" stop-opacity="0.55" />
    <stop offset="70%" stop-color="#4a4b50" stop-opacity="0.30" />
    <stop offset="100%" stop-color="#2b2c30" stop-opacity="0" />
  </linearGradient>
  <radialGradient id="tint3" cx="65%" cy="20%" r="60%">
    <stop offset="0%" stop-color="#1a1b1f" stop-opacity="0.5" />
    <stop offset="100%" stop-color="#000" stop-opacity="0" />
  </radialGradient>
  `,
);

// bg-4 — "Fassade · Reflexionen": überlappende, halbtransparente Glasflächen
const bg4Panels = (() => {
  const rects = [
    [0.05, 0.1, 0.34, 0.62, 0.10],
    [0.28, 0.34, 0.30, 0.55, 0.08],
    [0.5, 0.05, 0.4, 0.5, 0.07],
    [0.62, 0.42, 0.34, 0.6, 0.09],
    [0.18, 0.55, 0.46, 0.4, 0.06],
  ];
  return rects
    .map(([x, y, w, h, o], i) =>
      `<rect x="${x * W}" y="${y * H}" width="${w * W}" height="${h * H}" fill="#6f8aa3" opacity="${o}" transform="skewX(${i % 2 ? -4 : 4})" />`,
    )
    .join("");
})();
const bg4 = svg(
  `
  <rect width="${W}" height="${H}" fill="url(#g4)" />
  <g mask="url(#fade)">${bg4Panels}</g>
  <rect x="${W * 0.7}" y="0" width="2" height="${H}" fill="#aebfd0" opacity="0.14" />
  <rect x="${W * 0.32}" y="0" width="1.5" height="${H}" fill="#aebfd0" opacity="0.08" />
  `,
  `
  <linearGradient id="g4" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#0e1117" />
    <stop offset="55%" stop-color="#0a0c11" />
    <stop offset="100%" stop-color="#060709" />
  </linearGradient>
  `,
);

// Rendern ----------------------------------------------------------------------

const motifs = [
  ["bg-1.webp", bg1],
  ["bg-2.webp", bg2],
  ["bg-3.webp", bg3],
  ["bg-4.webp", bg4],
];

await mkdir(OUT_DIR, { recursive: true });
for (const [name, markup] of motifs) {
  const out = join(OUT_DIR, name);
  await sharp(Buffer.from(markup))
    .resize(W, H)
    .webp({ quality: 80 })
    .toFile(out);
  console.log("wrote", out);
}
