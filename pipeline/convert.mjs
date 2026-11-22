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
  'aerialway:bubble', 'landuse', 'website', 'height',
];

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
  const pistes = [], pisteAreas = [], lifts = [], stations = [], pylons = [], boundary = [];
  const seen = new Set();

  for (const raw of gj.features) {
    if (!raw.geometry) continue;
    const f = slim(raw);
    const p = f.properties, g = f.geometry;
    if (seen.has(f.id)) continue;
    seen.add(f.id);

    if (p.landuse === 'winter_sports' && isArea(g)) boundary.push(f);
    else if (p['piste:type'] && PISTE_KEEP.has(p['piste:type'])) {
      if (isLine(g)) pistes.push(f);
      else if (isArea(g)) pisteAreas.push(f);
    } else if (p.aerialway === 'station' && g.type === 'Point') stations.push(f);
    else if (p.aerialway === 'pylon' && g.type === 'Point') pylons.push(f);
    else if (p.aerialway && !LIFT_SKIP.has(p.aerialway) && isLine(g)) lifts.push(f);
  }
  return {
    pistes: fc(pistes), piste_areas: fc(pisteAreas), lifts: fc(lifts),
    stations: fc(stations), boundary: fc(boundary),
    structures: fc(structuresFrom(pylons, stations, lifts)),
  };
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
