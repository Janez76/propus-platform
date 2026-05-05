/**
 * Bereitet Matterport-Modell-Daten für die KI auf.
 *
 * Achsen-Konvention (Matterport-API):
 *   - X = horizontal (Grundriss-Achse)
 *   - Y = horizontal (Grundriss-Achse) – nicht die Höhe
 *   - Z = vertikal (Höhe), Panoramen liegen typisch auf Z ≈ 1.2 m (Stativ)
 *
 * Strategie:
 *   1) Wenn `model.rooms` mit `dimensions.width/depth/areaFloor` vorhanden ist
 *      (Property-Plan-Lizenz), werden diese als ECHTE Räume verwendet.
 *      Position pro Raum = Centroid der zugewiesenen Pano-Locations.
 *   2) Sonst Fallback: Pano-Cluster (single-link, 2.4 m).
 */

const CLUSTER_DISTANCE_M = 2.4;

function dist2d(a, b) {
  const dx = (a.x ?? 0) - (b.x ?? 0);
  const dy = (a.y ?? 0) - (b.y ?? 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function round(n, p = 2) {
  if (!Number.isFinite(n)) return null;
  const f = Math.pow(10, p);
  return Math.round(n * f) / f;
}

function clusterByDistance(points, threshold) {
  const n = points.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (dist2d(points[i], points[j]) <= threshold) union(i, j);
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(points[i]);
  }
  return [...groups.values()];
}

function bbox(points) {
  if (!points.length) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x == null || p.y == null) continue;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY, width: maxX - minX, depth: maxY - minY };
}

function centroid(points) {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let n = 0;
  for (const p of points) {
    if (p.x == null || p.y == null) continue;
    sx += p.x;
    sy += p.y;
    sz += p.z ?? 0;
    n++;
  }
  if (!n) return null;
  return { x: sx / n, y: sy / n, z: sz / n };
}

export function buildFloorPlanPayload(model) {
  const floors = model.floors || [];
  const floorById = new Map(floors.map((f) => [f.id, f]));

  const panoById = new Map(
    (model.panoLocations || [])
      .filter((p) => p.position)
      .map((p) => [
        p.id,
        {
          id: p.id,
          name: String(p.label || '').trim(),
          x: p.position.x,
          y: p.position.y,
          z: p.position.z,
        },
      ])
  );

  const tagPts = (model.mattertags || [])
    .filter((t) => t.enabled !== false)
    .map((t) => ({
      kind: 'tag',
      name: String(t.label || '').trim() || '(Tag)',
      description: String(t.description || '').trim().slice(0, 240),
      x: t.position?.x ?? null,
      y: t.position?.y ?? null,
      z: t.position?.z ?? null,
      floorId: t.floor?.id || null,
    }));

  const labelPts = (model.labels || [])
    .filter((l) => l.enabled !== false && l.label)
    .map((l) => ({
      kind: 'label',
      name: String(l.label || '').trim(),
      x: l.position?.x ?? null,
      y: l.position?.y ?? null,
      z: l.position?.z ?? null,
      floorId: l.floor?.id || null,
    }));

  const measurements = (model.measurements || [])
    .filter((m) => m.enabled !== false)
    .map((m) => ({
      label: String(m.label || '').trim() || null,
      distanz_m: round(m.distance, 2),
      von: m.startPosition ? { x: round(m.startPosition.x, 2), y: round(m.startPosition.y, 2) } : null,
      nach: m.endPosition ? { x: round(m.endPosition.x, 2), y: round(m.endPosition.y, 2) } : null,
      floorId: m.floor?.id || null,
      roomId: m.room?.id || null,
    }));

  const apiRooms = (model.rooms || [])
    .map((r, idx) => {
      const dims = r.dimensions || {};
      const ids = (r.panoLocations || []).map((p) => p.id);
      const pts = ids.map((id) => panoById.get(id)).filter(Boolean);
      const c = centroid(pts);
      return {
        id: r.id,
        index: idx,
        floorId: r.floor?.id || null,
        floorLabel: r.floor?.label || null,
        breite_m: dims.width != null ? round(dims.width, 2) : null,
        tiefe_m: dims.depth != null ? round(dims.depth, 2) : null,
        hoehe_m: dims.height != null ? round(dims.height, 2) : null,
        flaeche_m2: dims.areaFloor != null ? round(dims.areaFloor, 1) : null,
        flaeche_innen_m2:
          dims.areaFloorIndoor != null ? round(dims.areaFloorIndoor, 1) : null,
        units: dims.units || 'metric',
        panoCount: pts.length,
        panoLabels: pts.map((p) => p.name).slice(0, 12),
        centroid: c ? { x: round(c.x, 2), y: round(c.y, 2), z: round(c.z, 2) } : null,
        bbox_panos: bbox(pts),
      };
    })
    .filter((r) => r.flaeche_m2 != null || r.breite_m != null || r.panoCount > 0);

  const useApiRooms = apiRooms.length > 0;

  /** Etage zuordnen (über floorId oder Z-Median) */
  const allZ = [
    ...[...panoById.values()],
    ...tagPts,
    ...labelPts,
  ]
    .map((p) => p.z)
    .filter((z) => z != null);

  const fallbackFloorId = floors[0]?.id || 'floor-1';
  const medianZByFloor = new Map();
  if (floors.length > 1) {
    for (const f of floors) {
      const zs = [...tagPts, ...labelPts]
        .filter((p) => p.floorId === f.id && p.z != null)
        .map((p) => p.z);
      const m = median(zs);
      if (m != null) medianZByFloor.set(f.id, m);
    }
    if (medianZByFloor.size === 0 && allZ.length) {
      const sorted = [...allZ].sort((a, b) => a - b);
      const step = Math.floor(sorted.length / floors.length);
      floors.forEach((f, i) => {
        medianZByFloor.set(f.id, sorted[Math.min(i * step, sorted.length - 1)]);
      });
    }
  }

  function assignFloor(p) {
    if (p.floorId) return p.floorId;
    if (medianZByFloor.size === 0) return fallbackFloorId;
    let best = fallbackFloorId;
    let bestD = Infinity;
    for (const [fid, mz] of medianZByFloor) {
      const d = Math.abs((p.z ?? 0) - mz);
      if (d < bestD) {
        bestD = d;
        best = fid;
      }
    }
    return best;
  }

  /** @type {Map<string, any>} */
  const perFloor = new Map();
  function bucket(fid) {
    if (!perFloor.has(fid)) {
      const f = floorById.get(fid);
      perFloor.set(fid, {
        floorId: fid,
        floorLabel: f?.label || fid,
        labels: [],
        tags: [],
        panos: [],
        measurements: [],
        rooms: [],
      });
    }
    return perFloor.get(fid);
  }

  for (const p of labelPts) bucket(assignFloor(p)).labels.push(p);
  for (const p of tagPts) bucket(assignFloor(p)).tags.push(p);
  for (const p of panoById.values()) bucket(assignFloor(p)).panos.push(p);
  for (const m of measurements) {
    const fid = m.floorId || fallbackFloorId;
    bucket(fid).measurements.push(m);
  }

  for (const r of apiRooms) {
    const fid = r.floorId || (r.centroid ? assignFloor(r.centroid) : fallbackFloorId);
    bucket(fid).rooms.push(r);
  }

  if (!perFloor.size && floors.length) bucket(floors[0].id);

  const floorsOut = [];
  for (const [, b] of perFloor) {
    const all = [...b.labels, ...b.tags, ...b.panos].filter(
      (p) => p.x != null && p.y != null
    );
    const bb = bbox(all) || { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, depth: 0 };

    const out = {
      floorId: b.floorId,
      floorLabel: b.floorLabel,
      boundingBox: {
        minX: round(bb.minX, 2),
        maxX: round(bb.maxX, 2),
        minY: round(bb.minY, 2),
        maxY: round(bb.maxY, 2),
        breite_m: round(Math.max(0, bb.width), 2),
        tiefe_m: round(Math.max(0, bb.depth), 2),
      },
      mattertags: b.tags
        .filter((t) => t.x != null && t.y != null)
        .map((t) => ({
          name: t.name,
          description: t.description || null,
          x: round(t.x, 2),
          y: round(t.y, 2),
        })),
      raumLabels: b.labels
        .filter((l) => l.x != null && l.y != null)
        .map((l) => ({ name: l.name, x: round(l.x, 2), y: round(l.y, 2) })),
      messungen: b.measurements,
      pano_punkte_roh: b.panos
        .filter((p) => p.x != null && p.y != null)
        .map((p) => ({ name: p.name, x: round(p.x, 2), y: round(p.y, 2) })),
    };

    if (useApiRooms) {
      const sortedRooms = b.rooms
        .slice()
        .sort(
          (a, c) => (c.flaeche_m2 || 0) - (a.flaeche_m2 || 0) || (c.panoCount || 0) - (a.panoCount || 0)
        );
      out.echte_raeume = sortedRooms.map((r) => {
        const tagsNearby = r.centroid
          ? b.tags
              .filter((t) => t.x != null && t.y != null)
              .map((t) => ({ ...t, _d: dist2d(t, r.centroid) }))
              .sort((a, c) => a._d - c._d)
              .slice(0, 3)
              .map((t) => ({ name: t.name, description: t.description, distanz_m: round(t._d, 2) }))
          : [];
        return {
          id: r.id,
          breite_m: r.breite_m,
          tiefe_m: r.tiefe_m,
          hoehe_m: r.hoehe_m,
          flaeche_m2: r.flaeche_m2,
          flaeche_innen_m2: r.flaeche_innen_m2,
          panoCount: r.panoCount,
          centroid: r.centroid,
          umliegende_tags: tagsNearby,
          panoLabels: r.panoLabels,
        };
      });
    } else {
      const panoXY = b.panos.filter((p) => p.x != null && p.y != null);
      const clusters = clusterByDistance(panoXY, CLUSTER_DISTANCE_M);
      out.fallback_cluster = clusters
        .map((pts, idx) => {
          const c = centroid(pts);
          const cb = bbox(pts);
          const widthApprox = cb ? Math.max(cb.width, 1) + 1.5 : 1.5;
          const depthApprox = cb ? Math.max(cb.depth, 1) + 1.5 : 1.5;
          return {
            id: `cluster-${idx + 1}`,
            panoCount: pts.length,
            centroid: c ? { x: round(c.x, 2), y: round(c.y, 2) } : null,
            ungefaehre_groesse_m: { breite: round(widthApprox, 2), tiefe: round(depthApprox, 2) },
            ungefaehre_flaeche_m2: round(widthApprox * depthApprox, 1),
            panoLabels: pts.map((p) => p.name).slice(0, 8),
          };
        })
        .sort((a, c) => c.panoCount - a.panoCount);
    }

    floorsOut.push(out);
  }

  floorsOut.sort((a, b) =>
    String(a.floorLabel).localeCompare(String(b.floorLabel), 'de', { numeric: true })
  );

  return {
    achsen_konvention: 'X horizontal, Y vertikal in der Zeichenebene; Z = Höhe (NICHT zeichnen)',
    quelle: useApiRooms ? 'matterport_rooms (echte Maße)' : 'pano_cluster (Schätzung)',
    modell: {
      id: model.id,
      name: model.name || null,
      adresse: model.publication?.address || null,
      summary: model.publication?.summary || null,
      tour_url: model.publication?.url || null,
      beschreibung:
        (model.publication?.description || model.description || '').trim() || null,
    },
    etagen: floorsOut,
  };
}
