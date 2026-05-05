/**
 * Schritt 2: Räume bereinigen.
 *
 * Matterport liefert manchmal:
 *   - "Etagengrenz"-Räume (areaFloor >> width × depth)  → verwerfen
 *   - leere Räume ohne Maße                              → verwerfen
 *   - Duplikate mit fast identischem Centroid            → ein behalten
 *   - sehr kleine Anbauten ohne Pano                     → verwerfen
 *
 * Eingabe: rooms (aus buildFloorPlanPayload, mit Centroiden in Matterport-Welt-Koordinaten)
 * Ausgabe: bereinigte Räume in derselben Struktur
 */

const RECT_TOLERANCE = 1.35;
const DUP_DIST_M = 0.6;

function dist2d(a, b) {
  if (!a || !b) return Infinity;
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  return Math.sqrt(dx * dx + dy * dy);
}

export function cleanRooms(rooms) {
  if (!Array.isArray(rooms) || !rooms.length) return [];

  const valid = rooms.filter((r) => {
    if (r.flaeche_m2 == null && r.breite_m == null) return false;
    if (r.panoCount === 0 && (r.flaeche_m2 || 0) < 5) return false;
    return true;
  });

  const flagged = valid.map((r) => {
    const rect = (r.breite_m || 0) * (r.tiefe_m || 0);
    const ratio = rect > 0 ? (r.flaeche_m2 || 0) / rect : Infinity;
    const anomalous = rect > 0 && ratio > RECT_TOLERANCE;
    return { ...r, _ratio: ratio, _anomalous: anomalous };
  });

  const sorted = [...flagged].sort((a, b) => {
    if (a._anomalous !== b._anomalous) return a._anomalous ? 1 : -1;
    return (b.panoCount || 0) - (a.panoCount || 0);
  });

  const kept = [];
  for (const r of sorted) {
    if (!r.centroid) {
      if (r._anomalous) continue;
      kept.push(r);
      continue;
    }
    const conflict = kept.find((k) => {
      if (!k.centroid) return false;
      const d = dist2d(k.centroid, r.centroid);
      if (d >= DUP_DIST_M) return false;
      const sameSize =
        Math.abs((k.flaeche_m2 || 0) - (r.flaeche_m2 || 0)) < 1.5 ||
        Math.abs((k.breite_m || 0) - (r.breite_m || 0)) < 0.4;
      return sameSize;
    });
    if (conflict) {
      const pickNew =
        (r.panoCount || 0) > (conflict.panoCount || 0) ||
        (!r._anomalous && conflict._anomalous);
      if (pickNew) {
        const idx = kept.indexOf(conflict);
        kept[idx] = r;
      }
      continue;
    }
    if (r._anomalous && (r.flaeche_m2 || 0) > 50) {
      const overlapsKept = kept.some(
        (k) =>
          k.centroid &&
          dist2d(k.centroid, r.centroid) < Math.max(r.breite_m || 0, r.tiefe_m || 0)
      );
      if (overlapsKept) continue;
    }
    kept.push(r);
  }

  kept.sort((a, b) => (b.flaeche_m2 || 0) - (a.flaeche_m2 || 0));
  return kept.map(({ _ratio, _anomalous, ...rest }) => rest);
}
