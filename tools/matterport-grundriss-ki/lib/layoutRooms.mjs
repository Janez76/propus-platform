/**
 * Schritt 4: Deterministisches Layout.
 *
 * Eingabe:
 *   - rooms (mit breite_m, tiefe_m, centroid {x,y} in Welt-Koord, kategorie, name)
 *   - viewport: {x, y, w, h} (Plan-Bereich im SVG)
 *
 * Ausgabe:
 *   - rooms erweitert um {svgX, svgY, svgW, svgH} (achsenparallele Rechtecke im SVG)
 *
 * Algorithmus:
 *   1) Skala = min(viewport.w / floorWidth, viewport.h / floorHeight)
 *   2) Skaliere Centroide in Plan-Koord; Y umkehren (in SVG zeigt Y nach unten).
 *   3) Sortiere absteigend nach Fläche.
 *   4) Platziere ersten Raum am skalierten Centroid.
 *   5) Pro nächstem Raum:
 *        a) Versuche Centroid-Position. Bei Kollision: snappe an die nächste freie
 *           Kante eines bereits platzierten Raums (4 Kandidaten je Raum).
 *        b) Wähle den Kandidaten mit kleinster Distanz zum Wunsch-Centroid.
 *   6) Re-Center: Verschiebe alles, sodass Bounding-Box des Plans im Viewport zentriert ist.
 */

const PADDING = 10; // SVG-Pixel zwischen viewport und Plan

function rectsOverlap(a, b) {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

function distance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function rectCenter(r) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function snapCandidates(targetW, targetH, placed) {
  const cands = [];
  for (const p of placed) {
    cands.push({ x: p.x + p.w, y: p.y, side: 'right' });
    cands.push({ x: p.x - targetW, y: p.y, side: 'left' });
    cands.push({ x: p.x, y: p.y + p.h, side: 'bottom' });
    cands.push({ x: p.x, y: p.y - targetH, side: 'top' });
    for (let dy = -p.h * 0.5; dy <= p.h * 0.5; dy += p.h * 0.25) {
      cands.push({ x: p.x + p.w, y: p.y + dy, side: 'right-shift' });
      cands.push({ x: p.x - targetW, y: p.y + dy, side: 'left-shift' });
    }
    for (let dx = -p.w * 0.5; dx <= p.w * 0.5; dx += p.w * 0.25) {
      cands.push({ x: p.x + dx, y: p.y + p.h, side: 'bottom-shift' });
      cands.push({ x: p.x + dx, y: p.y - targetH, side: 'top-shift' });
    }
  }
  return cands;
}

export function layoutRooms({ rooms, viewport, floorBoundingBoxWorld }) {
  if (!rooms.length) return [];
  const innerW = viewport.w - 2 * PADDING;
  const innerH = viewport.h - 2 * PADDING;

  const floorW = Math.max(0.1, floorBoundingBoxWorld.breite_m || 1);
  const floorH = Math.max(0.1, floorBoundingBoxWorld.tiefe_m || 1);

  const totalArea = rooms.reduce((s, r) => s + (r.breite_m * r.tiefe_m || 0), 0);
  const naturalScale = Math.min(innerW / floorW, innerH / floorH);
  const targetArea = innerW * innerH * 0.72;
  const areaScale = totalArea > 0 ? Math.sqrt(targetArea / totalArea) : naturalScale;
  const scale = Math.min(naturalScale, areaScale);

  const offsetX = -(floorBoundingBoxWorld.minX ?? 0);
  const offsetY = -(floorBoundingBoxWorld.minY ?? 0);

  const desired = rooms
    .map((r) => {
      const w = Math.max(20, (r.breite_m || 1) * scale);
      const h = Math.max(20, (r.tiefe_m || 1) * scale);
      const cx = r.centroid
        ? (r.centroid.x + offsetX) * scale
        : floorW * scale * 0.5;
      const cy = r.centroid
        ? (floorH - (r.centroid.y + offsetY)) * scale
        : floorH * scale * 0.5;
      return {
        ...r,
        _w: w,
        _h: h,
        _cx: cx,
        _cy: cy,
      };
    })
    .sort((a, b) => b._w * b._h - a._w * a._h);

  const placed = [];
  for (const r of desired) {
    const target = { x: r._cx - r._w / 2, y: r._cy - r._h / 2, w: r._w, h: r._h };
    if (placed.length === 0 || !placed.some((p) => rectsOverlap(target, p))) {
      placed.push({ ...r, x: target.x, y: target.y, w: target.w, h: target.h });
      continue;
    }

    const candidates = snapCandidates(r._w, r._h, placed);
    let best = null;
    let bestScore = Infinity;
    for (const c of candidates) {
      const cand = { x: c.x, y: c.y, w: r._w, h: r._h };
      if (placed.some((p) => rectsOverlap(cand, p))) continue;
      const center = rectCenter(cand);
      const score = distance(center, { x: r._cx, y: r._cy });
      if (score < bestScore) {
        bestScore = score;
        best = cand;
      }
    }

    if (!best) {
      let x = target.x;
      let y = target.y;
      let step = 0;
      while (step < 50) {
        const cand = { x, y, w: r._w, h: r._h };
        if (!placed.some((p) => rectsOverlap(cand, p))) {
          best = cand;
          break;
        }
        x += r._w * 0.2;
        if (x + r._w > floorW * scale * 1.5) {
          x = 0;
          y += r._h * 0.2;
        }
        step++;
      }
    }

    placed.push({ ...r, x: best.x, y: best.y, w: best.w, h: best.h });
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of placed) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.w);
    maxY = Math.max(maxY, p.y + p.h);
  }

  const planW = maxX - minX;
  const planH = maxY - minY;
  const shiftX = viewport.x + PADDING + (innerW - planW) / 2 - minX;
  const shiftY = viewport.y + PADDING + (innerH - planH) / 2 - minY;

  return placed.map((p) => ({
    ...p,
    svgX: p.x + shiftX,
    svgY: p.y + shiftY,
    svgW: p.w,
    svgH: p.h,
  }));
}
