/**
 * Schritt 5: SVG-Rendering (deterministisch).
 *
 * Stilrichtung: Schweizer TruePlan / "8A Schönegg" — schwarze Wände auf weiß,
 * dünne Innenwände, Header mit Adresse und Wohnfläche, Etagen-Titel oben rechts,
 * pro Raum NAME / Maße / Fläche mittig.
 */

const PAGE = { w: 1190, h: 842 };
const VIEWPORT = { x: 70, y: 120, w: 1050, h: 620 };

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmtMeter(n) {
  if (n == null || !Number.isFinite(n)) return '';
  return `${n.toFixed(2).replace(/\.00$/, '.0')}m`;
}

function findEntryRoom(layout) {
  if (layout.some((r) => r.kategorie === 'eingang')) return null;
  return layout.find((r) => (r.panoLabels || []).includes('0')) || null;
}

function entryArrow(room) {
  if (!room) return '';
  const cx = room.svgX + room.svgW / 2;
  const cy = room.svgY + room.svgH;
  const x1 = cx - 30;
  const y1 = cy + 18;
  const x2 = cx + 8;
  const y2 = cy + 18;
  return `
    <g>
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="2"/>
      <polygon points="${x2 - 6},${y2 - 4} ${x2 + 4},${y2} ${x2 - 6},${y2 + 4}" fill="#000"/>
      <text x="${x2 + 8}" y="${y2 + 4}" font-size="10" font-family="Helvetica, Arial, sans-serif" font-weight="bold">EINGANG</text>
    </g>`;
}

function roomBlock(room, opts = {}) {
  const { interactive = false } = opts;
  const cx = room.svgX + room.svgW / 2;
  const cy = room.svgY + room.svgH / 2;
  const name = escapeXml(room.name || 'RAUM');
  const dims = room.breite_m && room.tiefe_m
    ? `${fmtMeter(room.breite_m)} × ${fmtMeter(room.tiefe_m)}`
    : '';
  const area = room.flaeche_m2 != null ? `${room.flaeche_m2.toFixed(1)}m²` : '';

  const small = room.svgW < 80 || room.svgH < 60;
  const fontName = small ? 9 : 12;
  const fontMeta = small ? 7 : 10;

  const roomId = escapeXml(room.id || '');
  const groupAttrs = interactive
    ? ` class="room" data-room-id="${roomId}" data-room-name="${escapeXml(room.name || '')}" data-room-kategorie="${escapeXml(room.kategorie || 'unbekannt')}" style="cursor:pointer"`
    : '';

  return `
    <g${groupAttrs}>
      <rect x="${room.svgX}" y="${room.svgY}" width="${room.svgW}" height="${room.svgH}"
            fill="white" stroke="#000" stroke-width="2"/>
      <text x="${cx}" y="${cy - (small ? 6 : 10)}" text-anchor="middle"
            font-family="Helvetica, Arial, sans-serif" font-size="${fontName}" font-weight="bold">${name}</text>
      ${dims ? `<text x="${cx}" y="${cy + (small ? 4 : 6)}" text-anchor="middle"
            font-family="Helvetica, Arial, sans-serif" font-size="${fontMeta}">${dims}</text>` : ''}
      ${area ? `<text x="${cx}" y="${cy + (small ? 14 : 22)}" text-anchor="middle"
            font-family="Helvetica, Arial, sans-serif" font-size="${fontMeta}">${area}</text>` : ''}
    </g>`;
}

function outerHull(layout) {
  if (!layout.length) return '';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of layout) {
    minX = Math.min(minX, r.svgX);
    minY = Math.min(minY, r.svgY);
    maxX = Math.max(maxX, r.svgX + r.svgW);
    maxY = Math.max(maxY, r.svgY + r.svgH);
  }
  return `<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}"
                fill="none" stroke="#000" stroke-width="5"/>`;
}

export function renderFloorSvg({ modelMeta, floorLabel, layout, totalIndoorAreaM2, interactive = false }) {
  const address = escapeXml(modelMeta.adresse || modelMeta.name || '');
  const areaText =
    totalIndoorAreaM2 != null && Number.isFinite(totalIndoorAreaM2)
      ? `NETTO-WOHNFLÄCHE: ~${Math.round(totalIndoorAreaM2)} m²`
      : '';

  const entry = findEntryRoom(layout);
  const rooms = layout.map((r) => roomBlock(r, { interactive })).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE.w} ${PAGE.h}" width="${PAGE.w}" height="${PAGE.h}">
  <rect width="${PAGE.w}" height="${PAGE.h}" fill="#ffffff"/>
  <text x="70" y="50" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="bold">${address}</text>
  ${areaText ? `<text x="70" y="78" font-family="Helvetica, Arial, sans-serif" font-size="12">${areaText}</text>` : ''}
  <text x="70" y="96" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#666">GRÖSSEN UND ABMESSUNGEN SIND UNGEFÄHR – TATSÄCHLICHE WERTE KÖNNEN ABWEICHEN.</text>
  <text x="${PAGE.w - 70}" y="50" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="bold">${escapeXml(floorLabel)}</text>
  ${outerHull(layout)}
  ${rooms}
  ${entryArrow(entry)}
</svg>`;
}
