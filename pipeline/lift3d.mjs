// 3D lift furniture, drawn as Mapbox fill-extrusions (boxes with a base and a top height,
// in real metres above the ground; the map multiplies both by the terrain exaggeration).
//
//  - Pylons: a thin mast plus a crossarm turned across the lift line (a "T"), so they read as
//    lift towers rather than posts.
//  - Stations: a building lined up with the lift, with a darker roof slab on top.
//  - Cabins / chairs: hanging just under the cable, spaced like the real thing.
import { SUPPORT, NSTOPS } from './cables.mjs';

const M_PER_DEG_LAT = 111320;
const rad = (d) => (d * Math.PI) / 180;

/** Bearing in degrees (0 = north, clockwise) from a to b. */
export function bearing([lon1, lat1], [lon2, lat2]) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Rectangle `along` × `across` metres centred on [lon,lat], long side pointing along `bearingDeg`. */
export function orientedRect([lon, lat], bearingDeg, along, across) {
  const b = rad(bearingDeg);
  const ux = Math.sin(b), uy = Math.cos(b);      // along (east, north)
  const vx = Math.cos(b), vy = -Math.sin(b);     // across
  const mLon = M_PER_DEG_LAT * Math.cos(rad(lat));
  const pt = (a, c) => [lon + (ux * a + vx * c) / mLon, lat + (uy * a + vy * c) / M_PER_DEG_LAT];
  const ha = along / 2, hc = across / 2;
  const ring = [pt(-ha, -hc), pt(ha, -hc), pt(ha, hc), pt(-ha, hc)];
  return { type: 'Polygon', coordinates: [[...ring, ring[0]]] };
}

// Crossarm width by lift type (metres, across the line): carries both cables.
const ARM = { cable_car: 12, gondola: 8, mixed_lift: 8, chair_lift: 5.5, drag_lift: 2, t_bar: 2, j_bar: 2, platter: 2 };
const key = ([lon, lat]) => `${lon.toFixed(7)},${lat.toFixed(7)}`;

/** Index every lift vertex: its lift type and the line's direction at that point. */
function liftVertexIndex(lifts) {
  const idx = new Map();
  for (const l of lifts) {
    if (l.geometry.type !== 'LineString') continue;
    const c = l.geometry.coordinates;
    c.forEach((p, i) => {
      const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
      idx.set(key(p), { type: l.properties.aerialway, bearing: bearing(a, b), end: i === 0 || i === c.length - 1 });
    });
  }
  return idx;
}

const box = (id, geometry, props) => ({ type: 'Feature', id, geometry, properties: props });

export function structuresFrom(pylons, stations, lifts = []) {
  const idx = liftVertexIndex(lifts);
  const out = [];
  for (const f of pylons) {
    const p = f.geometry.coordinates, v = idx.get(key(p));
    const type = v?.type ?? 'chair_lift';
    const h = Number.parseFloat(f.properties.height) || SUPPORT[type]?.pylon || 14;
    const brg = v?.bearing ?? 0;
    const mast = type in ARM && ARM[type] <= 2 ? 0.6 : 1.2;
    out.push(box(`pylon-${f.id}`, orientedRect(p, brg, mast, mast),
      { kind: 'pylon', part: 'mast', lift: type, base: 0, height: h }));
    out.push(box(`pylon-arm-${f.id}`, orientedRect(p, brg, 1, ARM[type] ?? 5),
      { kind: 'pylon', part: 'arm', lift: type, base: Math.max(0, h - 1.2), height: h + 0.3 }));
  }
  for (const f of stations) {
    const p = f.geometry.coordinates, v = idx.get(key(p));
    const big = ['cable_car', 'gondola', 'mixed_lift'].includes(v?.type);
    const [len, wid, h] = big ? [26, 14, 10] : [16, 9, 6];
    const brg = v?.bearing ?? 0;
    const props = { kind: 'station', name: f.properties.name ?? null, lift: v?.type ?? null };
    out.push(box(`station-${f.id}`, orientedRect(p, brg, len, wid), { ...props, part: 'body', base: 0, height: h }));
    out.push(box(`station-roof-${f.id}`, orientedRect(p, brg, len + 2, wid + 2), { ...props, part: 'roof', base: h, height: h + 1.6 }));
  }
  return out;
}

// Cabin spacing along the cable (metres) and size; null = no cabins (drag lifts: skiers are pulled).
const CABIN = {
  gondola: { every: 70, along: 2.6, across: 2.2, drop: 1.4, tall: 2.4 },
  mixed_lift: { every: 70, along: 2.6, across: 2.2, drop: 1.4, tall: 2.4 },
  chair_lift: { every: 28, along: 1.2, across: 3.2, drop: 1.6, tall: 0.6 },
  cable_car: { every: null, along: 7, across: 4, drop: 3, tall: 3.2 },   // two big cabins per lift
};

/**
 * Cabins hanging under the cable, from the cable chunks of buildCableSpans.
 * Base/height are metres above ground: just below the cable's clearance at that point.
 */
export function buildCabins(spans) {
  const out = [];
  const byLift = new Map();
  for (const f of spans.features) {
    if (!CABIN[f.properties.aerialway]) continue;
    if (!byLift.has(f.properties.lift_id)) byLift.set(f.properties.lift_id, []);
    byLift.get(f.properties.lift_id).push(f);
  }
  for (const [liftId, chunks] of byLift) {
    const type = chunks[0].properties.aerialway, c = CABIN[type];
    // Walk the cable stop by stop, measuring distance.
    const stops = [];
    let dist = 0, prev = null;
    for (const f of chunks) {
      f.geometry.coordinates.forEach((p, k) => {
        if (prev) dist += Math.hypot((p[0] - prev[0]) * M_PER_DEG_LAT * Math.cos(rad(p[1])), (p[1] - prev[1]) * M_PER_DEG_LAT);
        prev = p;
        const next = f.geometry.coordinates[Math.min(k + 1, NSTOPS - 1)], back = f.geometry.coordinates[Math.max(k - 1, 0)];
        stops.push({ p, dist, z: f.properties[`z${k}`], brg: bearing(back, next) });
      });
    }
    const total = dist;
    const targets = c.every ? [] : [total / 3, (2 * total) / 3];
    if (c.every) for (let d = c.every / 2; d < total - c.every / 4; d += c.every) targets.push(d);
    let i = 0;
    targets.forEach((d, n) => {
      while (i < stops.length - 1 && stops[i].dist < d) i++;
      const s = stops[i];
      const top = s.z - c.drop;
      if (top - c.tall < 0.5) return;                 // too close to the snow: leave it out
      out.push(box(`cabin-${liftId}-${n}`, orientedRect(s.p, s.brg, c.along, c.across),
        { kind: 'cabin', lift: type, base: Math.round((top - c.tall) * 10) / 10, height: Math.round(top * 10) / 10 }));
    });
  }
  return { type: 'FeatureCollection', features: out };
}

// ---------- moving cabins ----------
// Miniature-world speeds (metres per second along the cable): faster than real lifts so the
// movement reads at map scale, slow enough to stay calm.
const SPEED = { gondola: 9, mixed_lift: 9, cable_car: 7, chair_lift: 6 };
const LANE = { gondola: 2.4, mixed_lift: 2.4, cable_car: 3.2, chair_lift: 2.6 };  // half the cable spacing

/**
 * One track per aerial lift with cabins: every cable stop in order with distance, clearance and
 * direction, plus a bbox for culling. Build once per resort.
 */
export function liftTracks(spans) {
  const byLift = new Map();
  for (const f of spans.features) {
    if (!CABIN[f.properties.aerialway]) continue;
    if (!byLift.has(f.properties.lift_id)) byLift.set(f.properties.lift_id, []);
    byLift.get(f.properties.lift_id).push(f);
  }
  const tracks = [];
  for (const [id, chunks] of byLift) {
    const type = chunks[0].properties.aerialway;
    const stops = [];
    let dist = 0, prev = null;
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const f of chunks) {
      f.geometry.coordinates.forEach((p, k) => {
        if (prev && p[0] === prev[0] && p[1] === prev[1]) return;
        if (prev) dist += Math.hypot((p[0] - prev[0]) * M_PER_DEG_LAT * Math.cos(rad(p[1])), (p[1] - prev[1]) * M_PER_DEG_LAT);
        stops.push({ p, d: dist, z: f.properties[`z${k}`] });
        prev = p;
        w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]);
      });
    }
    if (dist < 20) continue;
    for (let i = 0; i < stops.length; i++) {
      stops[i].brg = bearing(stops[Math.max(0, i - 1)].p, stops[Math.min(stops.length - 1, i + 1)].p);
    }
    tracks.push({ id, type, name: chunks[0].properties.name, total: dist, stops, bbox: [w, s, e, n] });
  }
  return tracks;
}

function pointAt(track, d) {
  const st = track.stops;
  let lo = 0, hi = st.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (st[mid].d <= d) lo = mid; else hi = mid; }
  const a = st[lo], b = st[hi], t = b.d > a.d ? (d - a.d) / (b.d - a.d) : 0;
  return { p: [a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t], z: a.z + (b.z - a.z) * t, brg: a.brg };
}

/**
 * Cabin boxes at time `seconds`: up the right-hand cable, down the left-hand one, for tracks whose
 * bbox meets `view` ([w, s, e, n], optional). Returns at most `limit` features.
 */
export function carsAt(tracks, seconds, view = null, limit = 600) {
  const out = [];
  for (const tr of tracks) {
    if (view && (tr.bbox[2] < view[0] || tr.bbox[0] > view[2] || tr.bbox[3] < view[1] || tr.bbox[1] > view[3])) continue;
    const c = CABIN[tr.type];
    const every = c.every ?? tr.total / 2;               // cable car: two cabins shuttling
    const shift = ((seconds * (SPEED[tr.type] ?? 6)) % every + every) % every;
    const lane = LANE[tr.type] ?? 2.5;
    for (const dir of [1, -1]) {
      for (let d0 = shift; d0 < tr.total; d0 += every) {
        const d = dir === 1 ? d0 : tr.total - d0;
        const at = pointAt(tr, d);
        const top = at.z - c.drop;
        if (top - c.tall < 0.5) continue;
        // Offset sideways from the line: right of travel uphill, left coming down.
        const side = rad(at.brg + 90), mLon = M_PER_DEG_LAT * Math.cos(rad(at.p[1]));
        const p = [at.p[0] + (Math.sin(side) * lane * dir) / mLon, at.p[1] + (Math.cos(side) * lane * dir) / M_PER_DEG_LAT];
        out.push({ type: 'Feature', geometry: orientedRect(p, at.brg, c.along, c.across),
          properties: { kind: 'cabin', lift: tr.type, name: tr.name ?? null,
            base: Math.round((top - c.tall) * 10) / 10, height: Math.round(top * 10) / 10 } });
        if (out.length >= limit) return { type: 'FeatureCollection', features: out };
      }
    }
  }
  return { type: 'FeatureCollection', features: out };
}
