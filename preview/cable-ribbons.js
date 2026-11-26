// Hanging lift cables as thin 3D ribbons. MapLibre has no lines floating above the terrain, so each
// cable chunk from pipeline/cables.mjs (9 vertices, each with its clearance z0..z8 above ground) is
// cut into short boxes that sit at the cable's height: drawn as a fill-extrusion they sag between
// towers exactly like the cable. Width is chosen per zoom by the app (a few screen pixels in metres),
// so the cable reads as a bold line close up and from afar.
import { bearing, orientedRect } from '../pipeline/lift3d.mjs';

const M_LAT = 111320;
const dist = ([x0, y0], [x1, y1]) => Math.hypot((x1 - x0) * M_LAT * Math.cos((y0 * Math.PI) / 180), (y1 - y0) * M_LAT);

/**
 * @param spans   lift_spans FeatureCollection (LineStrings with z0..z8 per vertex)
 * @param widthM  ribbon width in metres (across the cable)
 * @param thickM  ribbon thickness in metres (top − base)
 * @returns       Polygons with base/top in real metres above ground (the layer multiplies by the
 *                terrain exaggeration, like the cabins and towers)
 */
export function cableRibbons(spans, widthM, thickM = widthM * 0.7) {
  const features = [];
  for (const f of spans?.features ?? []) {
    if (f.geometry?.type !== 'LineString') continue;
    const c = f.geometry.coordinates, p = f.properties ?? {};
    for (let k = 0; k < c.length - 1; k++) {
      const len = dist(c[k], c[k + 1]);
      if (len < 0.5) continue;
      const z = ((p[`z${k}`] ?? 6) + (p[`z${k + 1}`] ?? 6)) / 2;
      const mid = [(c[k][0] + c[k + 1][0]) / 2, (c[k][1] + c[k + 1][1]) / 2];
      features.push({ type: 'Feature',
        // A little overlap so the boxes join into one continuous cable.
        geometry: orientedRect(mid, bearing(c[k], c[k + 1]), len + Math.min(widthM, 4), widthM),
        properties: { base: Math.max(0, z - thickM / 2), top: z + thickM / 2, name: p.name ?? null,
          aerialway: p.aerialway ?? null, lift_id: p.lift_id ?? null, 'aerialway:occupancy': p['aerialway:occupancy'] ?? null } });
    }
  }
  return { type: 'FeatureCollection', features };
}

/** Metres covered by one screen pixel at this zoom and latitude (512-px tiles, as in MapLibre). */
export const metresPerPixel = (zoom, lat) => (40075016.7 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
