// Builds hanging-cable geometry for aerial lifts.
//
// Each vertex of an OSM lift way is a support (station at the ends, pylons in between).
// Cable altitude at a support = ground + support height. Between supports the cable sags in a
// parabola. The result is cut into short chunks; each chunk carries its clearance above ground
// at NSTOPS evenly spaced points (z0..z8), which the app feeds to Mapbox's line-z-offset
// through a line-progress interpolation. Clearance is real metres; the app multiplies it by the
// terrain exaggeration so cables stay in proportion with the exaggerated mountains.

export const NSTOPS = 9;
const CHUNK_M = 120;          // short chunks follow the ground closely between stops
const MIN_CLEARANCE = 2.5;    // never let a cable touch the snow

// Height of the cable at a support, by lift type (metres above ground).
export const SUPPORT = {
  cable_car: { station: 10, pylon: 35 },
  gondola: { station: 6, pylon: 18 },
  mixed_lift: { station: 6, pylon: 18 },
  chair_lift: { station: 5, pylon: 12 },
  drag_lift: { station: 3, pylon: 6 }, t_bar: { station: 3, pylon: 6 },
  j_bar: { station: 3, pylon: 6 }, platter: { station: 3, pylon: 6 },
};
// Lifts that run on the ground stay draped on the terrain.
export const GROUND_LIFTS = new Set(['rope_tow', 'magic_carpet', 'zip_line']);

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
function distance([lon1, lat1], [lon2, lat2]) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const lerp = ([x1, y1], [x2, y2], t) => [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];

/**
 * Sag at mid-span in metres: ~2.5% of span (4% for cable cars), but never more than half the
 * lower support's height. Real towers are built tall enough for their spans; without the cap,
 * long spans over flat ground would drag the cable into the snow.
 */
export const sagFor = (spanM, type, supportA = Infinity, supportB = Infinity) =>
  Math.min(spanM * (type === 'cable_car' ? 0.04 : 0.025), 60, 0.5 * Math.min(supportA, supportB));

/**
 * @param lifts  GeoJSON lift LineStrings (from convert.mjs)
 * @param elevationAt  async ([lon,lat]) => metres; injected so tests can use a fake terrain
 */
export async function buildCableSpans(lifts, elevationAt) {
  const out = [];
  for (const lift of lifts.features) {
    const type = lift.properties.aerialway;
    if (GROUND_LIFTS.has(type) || lift.geometry.type !== 'LineString') continue;
    const sup = SUPPORT[type] ?? SUPPORT.chair_lift;
    const pts = lift.geometry.coordinates;
    if (pts.length < 2) continue;

    const ground = await Promise.all(pts.map(elevationAt));
    const pylonHeight = Number.parseFloat(lift.properties.height);
    const cableAlt = pts.map((_, i) =>
      ground[i] + (i === 0 || i === pts.length - 1 ? sup.station : (pylonHeight || sup.pylon)));

    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s], b = pts[s + 1];
      const span = distance(a, b);
      if (span < 1) continue;
      const sag = sagFor(span, type, cableAlt[s] - ground[s], cableAlt[s + 1] - ground[s + 1]);
      const cableAt = (t) => cableAlt[s] + (cableAlt[s + 1] - cableAlt[s]) * t - 4 * sag * t * (1 - t);

      const nChunks = Math.max(1, Math.ceil(span / CHUNK_M));
      for (let c = 0; c < nChunks; c++) {
        const ts = Array.from({ length: NSTOPS }, (_, k) => (c + k / (NSTOPS - 1)) / nChunks);
        const coords = ts.map((t) => lerp(a, b, t));   // vertex at every stop
        const groundHere = await Promise.all(coords.map(elevationAt));
        const props = {
          lift_id: lift.id, aerialway: type, name: lift.properties.name ?? null,
          'aerialway:occupancy': lift.properties['aerialway:occupancy'] ?? null,
        };
        ts.forEach((t, k) => {
          props[`z${k}`] = Math.round(Math.max(MIN_CLEARANCE, cableAt(t) - groundHere[k]) * 10) / 10;
        });
        out.push({ type: 'Feature', id: `${lift.id}-${s}-${c}`, geometry: { type: 'LineString', coordinates: coords }, properties: props });
      }
    }
  }
  return { type: 'FeatureCollection', features: out };
}
