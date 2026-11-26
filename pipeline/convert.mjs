// Turns a raw Overpass JSON response into the slim GeoJSON layers the app bundles.
import osmtogeojson from 'osmtogeojson';
import { cleanElements, DIFFICULTIES } from './clean.mjs';
import { structuresFrom } from './lift3d.mjs';
export { structuresFrom };

const PISTE_KEEP = new Set(['downhill', 'nordic', 'sled', 'skitour', 'snow_park']);
const LIFT_SKIP = new Set(['pylon', 'station', 'goods']);
const PROPS = [
  'name', 'ref', 'piste:type', 'piste:difficulty', 'piste:grooming', 'piste:name', 'piste:ref',
  'aerialway', 'aerialway:occupancy', 'aerialway:duration', 'aerialway:capacity', 'aerialway:heating',
  'aerialway:bubble', 'landuse', 'website', 'height', 'tourism', 'amenity', 'cuisine', 'opening_hours', 'ele',
];
const HUT_AMENITY = new Set(['restaurant', 'cafe', 'bar', 'pub', 'biergarten', 'fast_food']);
const HUT_TOURISM = new Set(['alpine_hut', 'wilderness_hut']);

function slim(f) {
  const tags = f.properties.tags ?? f.properties;
  const props = { osm_id: f.id ?? f.properties.id };
  for (const k of PROPS) if (tags[k] != null) props[k] = tags[k];
  if (!props.name && tags['piste:name']) props.name = tags['piste:name'];
  if (!props.ref && tags['piste:ref']) props.ref = tags['piste:ref'];
  if (props['piste:difficulty']) props.rank = DIFFICULTIES.indexOf(props['piste:difficulty']);
  return { type: 'Feature', id: props.osm_id, geometry: f.geometry, properties: props };
}

const fc = (features) => ({ type: 'FeatureCollection', features });
const isLine = (g) => g.type === 'LineString' || g.type === 'MultiLineString';
const isArea = (g) => g.type === 'Polygon' || g.type === 'MultiPolygon';

export function convert(overpassJson) {
  const gj = osmtogeojson(cleanElements(overpassJson), { flatProperties: true });
  const pistes = [], pisteAreas = [], lifts = [], stations = [], pylons = [], boundary = [], forests = [], places = [];
  const seen = new Set();

  for (const raw of gj.features) {
    if (!raw.geometry) continue;
    const f = slim(raw);
    const p = f.properties, g = f.geometry;
    if (seen.has(f.id)) continue;
    seen.add(f.id);

    const tags = raw.properties.tags ?? raw.properties;
    if ((tags.landuse === 'forest' || tags.natural === 'wood') && isArea(g)) { forests.push({ type: 'Feature', geometry: g, properties: {} }); continue; }
    if (HUT_TOURISM.has(tags.tourism) || (HUT_AMENITY.has(tags.amenity) && !tags['piste:type'] && !tags.aerialway)) {
      const c = pointOf(g);
      if (c) places.push({ type: 'Feature', id: f.id, geometry: { type: 'Point', coordinates: c },
        properties: { osm_id: p.osm_id, name: p.name ?? null, kind: HUT_TOURISM.has(tags.tourism) ? 'hut' : tags.amenity } });
      continue;
    }
    if (p.landuse === 'winter_sports' && isArea(g)) boundary.push(f);
    else if (p['piste:type'] && PISTE_KEEP.has(p['piste:type'])) {
      if (isLine(g)) pistes.push(f);
      else if (isArea(g)) pisteAreas.push(f);
    } else if (p.aerialway === 'station' && g.type === 'Point') stations.push(f);
    else if (p.aerialway === 'pylon' && g.type === 'Point') pylons.push(f);
    else if (p.aerialway && !LIFT_SKIP.has(p.aerialway) && isLine(g)) lifts.push(f);
  }
  return {
    huts: fc(hutsOnTheMountain(places, pistes, lifts)),
    pistes: fc(pistes), piste_areas: fc(pisteAreas), lifts: fc(lifts),
    stations: fc(stations), boundary: fc(boundary),
    structures: fc(structuresFrom(pylons, stations, lifts)),
    // Only present when the query asked for forests; used for the pine scatter, never written out.
    ...(forests.length && { forests: fc(forests) }),
  };
}

/** A point for a node, or the mean vertex of a hut building outline. */
function pointOf(g) {
  if (g.type === 'Point') return g.coordinates;
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : g.type === 'LineString' ? g.coordinates : null;
  if (!ring?.length) return null;
  return [ring.reduce((a, c) => a + c[0], 0) / ring.length, ring.reduce((a, c) => a + c[1], 0) / ring.length];
}

/**
 * Mountain huts and ski-in restaurants: every alpine hut, plus restaurants, cafés and bars that sit
 * right on a run (within 60 m of a downhill piste) and are not at a lift's bottom station in the
 * village (more than 250 m from the lowest end of every lift). Village restaurants stay off the map.
 */
export function hutsOnTheMountain(places, pistes, lifts) {
  const M = 111320, near = (a, b) => Math.hypot((a[0] - b[0]) * M * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * M);
  const segDist = (p, a, b) => {
    const k = Math.cos((p[1] * Math.PI) / 180), ax = (a[0] - p[0]) * k, ay = a[1] - p[1], bx = (b[0] - p[0]) * k, by = b[1] - p[1];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
    return Math.hypot(ax + t * dx, ay + t * dy) * M;
  };
  const lines = (f) => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates);
  const runs = pistes.filter((f) => f.properties['piste:type'] === 'downhill').flatMap(lines);
  const onRun = (c) => runs.some((l) => l.some((_, i) => i && segDist(c, l[i - 1], l[i]) < 60));
  // A lift line's last point is its top station in OSM's convention; its first is the valley end.
  const valleys = lifts.flatMap(lines).map((l) => l[0]);
  const seen = [];
  return places.filter((h) => {
    const c = h.geometry.coordinates;
    if (seen.some((s) => near(s, c) < 40)) return false;           // one marker per building
    const keep = h.properties.kind === 'hut' || (onRun(c) && !valleys.some((v) => near(v, c) < 250));
    if (keep) seen.push(c);
    return keep;
  }).slice(0, 400);
}

export function summarize(layers) {
  const diff = {};
  for (const f of layers.pistes.features) {
    if (f.properties['piste:type'] !== 'downhill') continue;
    const d = f.properties['piste:difficulty'] ?? 'unknown';
    diff[d] = (diff[d] ?? 0) + 1;
  }
  return Object.fromEntries([
    ...Object.entries(layers).map(([k, v]) => [k, v.features.length]),
    ['downhill_by_difficulty', diff],
  ]);
}
