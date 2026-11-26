// Tests the converter on a tiny hand-written Overpass-shaped response (not real resort data).
import assert from 'node:assert/strict';
import { convert, summarize } from './convert.mjs';

const n = (id, lat, lon, tags) => ({ type: 'node', id, lat, lon, ...(tags && { tags }) });
const fixture = {
  elements: [
    n(1, 47.10, 10.10), n(2, 47.11, 10.11), n(3, 47.12, 10.12), n(4, 47.10, 10.12),
    n(5, 47.10, 10.10, { aerialway: 'station', name: 'Valley station' }),
    n(6, 47.105, 10.105, { aerialway: 'pylon' }),
    { type: 'way', id: 10, nodes: [1, 2, 3], tags: { 'piste:type': 'downhill', 'piste:difficulty': 'intermediate', name: 'Red run' } },
    { type: 'way', id: 11, nodes: [1, 3], tags: { aerialway: 'gondola', name: 'Gondola', 'aerialway:occupancy': '10' } },
    { type: 'way', id: 12, nodes: [1, 2, 3, 4, 1], tags: { landuse: 'winter_sports', name: 'Test area' } },
    { type: 'way', id: 13, nodes: [2, 3], tags: { aerialway: 'goods' } },
    { type: 'way', id: 14, nodes: [1, 2, 3, 4, 1], tags: { 'piste:type': 'downhill', area: 'yes', 'piste:difficulty': 'easy' } },
    n(20, 47.1101, 10.1102, { amenity: 'restaurant', name: 'Slope restaurant' }),   // on the red run, mid-mountain
    n(21, 47.1001, 10.1001, { amenity: 'bar', name: 'Village bar' }),               // at the gondola's valley end
    n(22, 47.2, 10.3, { amenity: 'cafe', name: 'Town café' }),                       // nowhere near a run
    n(23, 47.3, 10.4, { tourism: 'alpine_hut', name: 'High hut' }),                  // huts always count
  ],
};

const out = convert(fixture);
assert.equal(out.pistes.features.length, 1);
assert.equal(out.pistes.features[0].properties['piste:difficulty'], 'intermediate');
assert.equal(out.piste_areas.features.length, 1);
assert.equal(out.lifts.features.length, 1, 'goods lifts and pylons are dropped');
assert.equal(out.lifts.features[0].properties.aerialway, 'gondola');
assert.equal(out.stations.features.length, 1);
assert.equal(out.boundary.features.length, 1);
assert.deepEqual(summarize(out).downhill_by_difficulty, { intermediate: 1 });
assert.equal(out.structures.features.length, 4, 'pylon = mast + crossarm, station = body + roof');
const mast = out.structures.features.find((f) => f.properties.part === 'mast');
assert.equal(mast.geometry.type, 'Polygon');
assert.equal(mast.properties.height, 12, 'pylon off any lift line falls back to chair-lift height');
console.log('convert.test: all assertions passed');
assert.deepEqual(out.huts.features.map((f) => f.properties.name).sort(), ['High hut', 'Slope restaurant'],
  'huts always; restaurants only on a run and away from a lift\'s valley end');
assert.equal(out.huts.features.find((f) => f.properties.name === 'High hut').properties.kind, 'hut');
