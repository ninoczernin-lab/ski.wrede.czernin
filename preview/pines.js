// Stylized pines for the diorama: each tree is a stack of octagonal tiers with a snow cap, drawn
// as Mapbox fill-extrusions (the same reliable technique as the lift towers). Trees are scattered
// only inside real forest areas (Mapbox Streets landcover "wood"), below the tree line, never on a
// run or under a lift, on a fixed world grid so they don't jump around while the map moves.

const M_LAT_ = 111320;
function octagon([lon, lat], r) {
  const mLon = M_LAT_ * Math.cos((lat * Math.PI) / 180), ring = [];
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    ring.push([lon + (Math.cos(a) * r) / mLon, lat + (Math.sin(a) * r) / M_LAT_]);
  }
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}

/**
 * Extrusion parts for pine points. `size` is the tree height in metres: larger when zoomed out so
 * trees still read as trees in the miniature, closer to true size up close.
 */
export function pineShapes(points, size = 22) {
  const out = [];
  for (const f of points.features) {
    const c = f.geometry.coordinates;
    const k = { 'pine-s': 0.78, 'pine-m': 1, 'pine-l': 1.22 }[f.properties.m] ?? 1;
    const h = size * k, r = h * 0.3;
    out.push({ type: 'Feature', geometry: octagon(c, r * 0.18), properties: { part: 'trunk', base: 0, height: h * 0.2 } });
    out.push({ type: 'Feature', geometry: octagon(c, r), properties: { part: 'low', base: h * 0.16, height: h * 0.5 } });
    out.push({ type: 'Feature', geometry: octagon(c, r * 0.68), properties: { part: 'mid', base: h * 0.5, height: h * 0.78 } });
    out.push({ type: 'Feature', geometry: octagon(c, r * 0.36), properties: { part: 'snow', base: h * 0.78, height: h } });
  }
  return { type: 'FeatureCollection', features: out };
}

// ---------- scattering ----------

const M_LAT = 111320;
const hash = (x, y) => {                                    // stable 0..1 per grid cell
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolygon = (pt, rings) => inRing(pt, rings[0]) && !rings.slice(1).some((h) => inRing(pt, h));
const polygonsOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

/** Cells (≈ radius metres) touched by runs and lifts, dilated by one cell: trees stay out of them. */
export function avoidGrid(features, radiusM = 28) {
  const cells = new Set();
  const cellOf = (lon, lat) => [Math.floor((lat * M_LAT) / radiusM), Math.floor((lon * M_LAT * Math.cos((lat * Math.PI) / 180)) / radiusM)];
  const mark = (lon, lat) => {
    const [cy, cx] = cellOf(lon, lat);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.add(`${cy + dy},${cx + dx}`);
  };
  const walk = (line) => {
    for (let i = 1; i < line.length; i++) {
      const [x0, y0] = line[i - 1], [x1, y1] = line[i];
      const d = Math.hypot((x1 - x0) * M_LAT * Math.cos((y0 * Math.PI) / 180), (y1 - y0) * M_LAT);
      const n = Math.max(1, Math.ceil(d / (radiusM / 2)));
      for (let k = 0; k <= n; k++) mark(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n);
    }
  };
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'LineString') walk(g.coordinates);
    else if (g.type === 'MultiLineString') g.coordinates.forEach(walk);
    else for (const poly of polygonsOf(g)) poly.forEach(walk);
  }
  return { has: (lon, lat) => cells.has(cellOf(lon, lat).join(',')) };
}

/**
 * Pine positions inside `forests` (GeoJSON polygons), on a fixed world grid `spacingM` apart with
 * jitter, skipping cells near runs/lifts and anything above `treeline` metres.
 */
export function scatterPines({ forests, bounds, spacingM = 42, avoid, elevationAt, treeline = 2050, max = 2500 }) {
  const out = [];
  const [[w, s], [e, n]] = bounds;
  const dLat = spacingM / M_LAT;
  const seen = new Set();
  for (const f of forests) {
    for (const rings of polygonsOf(f.geometry)) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of rings[0]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      minX = Math.max(minX, w); maxX = Math.min(maxX, e); minY = Math.max(minY, s); maxY = Math.min(maxY, n);
      if (minX >= maxX || minY >= maxY) continue;
      const dLon = dLat / Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
      for (let gy = Math.floor(minY / dLat); gy <= Math.ceil(maxY / dLat); gy++) {
        for (let gx = Math.floor(minX / dLon); gx <= Math.ceil(maxX / dLon); gx++) {
          const key = `${gx},${gy}`;
          if (seen.has(key)) continue;
          const r = hash(gx, gy);
          if (r < 0.18) continue;                                    // natural gaps in the forest
          const lon = (gx + hash(gx + 7, gy) * 0.8) * dLon, lat = (gy + hash(gx, gy + 11) * 0.8) * dLat;
          if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
          if (!inPolygon([lon, lat], rings) || avoid?.has(lon, lat)) continue;
          const ele = elevationAt?.([lon, lat]);
          if (ele != null && ele > treeline - r * 120) continue;   // ragged, not ruler-straight, tree line
          seen.add(key);
          out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
            properties: { m: r < 0.45 ? 'pine-s' : r < 0.8 ? 'pine-m' : 'pine-l', rot: Math.round(r * 360) } });
          if (out.length >= max) return { type: 'FeatureCollection', features: out };
        }
      }
    }
  }
  return { type: 'FeatureCollection', features: out };
}
