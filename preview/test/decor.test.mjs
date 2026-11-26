// Tests the skier tracks and snowman placement on a hand-made run (not real resort data).
import assert from 'node:assert/strict';
import { skierTracks, skiersAt, snowmenNear, JACKETS } from '../decor.js';

const run = (coords, difficulty = 'easy', type = 'downhill') => ({ type: 'Feature',
  geometry: { type: 'LineString', coordinates: coords }, properties: { 'piste:type': type, 'piste:difficulty': difficulty } });
// ~2.2 km run straight down (south), a 60 m stub, and a nordic trail.
const pistes = { type: 'FeatureCollection', features: [
  run([[10, 47.02], [10, 47.0]]), run([[10.1, 47], [10.1, 47.00054]]), run([[10.2, 47], [10.2, 47.02]], 'easy', 'nordic')] };

const tracks = skierTracks(pistes);
assert.equal(tracks.length, 1, 'only downhill runs long enough to see');
assert.equal(tracks[0].riders, 3, 'one skier per ~700 m, at most three');

const a = skiersAt(tracks, 0), b = skiersAt(tracks, 10);
assert.equal(a.features.length, 3);
for (let i = 0; i < 3; i++) {
  const [, lat0] = a.features[i].geometry.coordinates, [, lat1] = b.features[i].geometry.coordinates;
  assert.ok(lat1 < lat0 || lat1 > 47.015, 'skiers move downhill (or wrapped round to the top)');
  assert.ok(Math.abs(a.features[i].geometry.coordinates[0] - 10) < 0.0002, 'S-turns stay within a few metres of the run');
  assert.ok(a.features[i].properties.jacket < JACKETS.length);
}
assert.equal(skiersAt(tracks, 0, [11, 46, 12, 48]).features.length, 0, 'runs outside the view are skipped');
assert.equal(skiersAt(tracks, 0, null, 2).features.length, 2, 'limit caps the count');

const anchors = Array.from({ length: 60 }, (_, i) => ({ coordinates: [10 + i * 0.01, 47], kind: i % 2 ? 'hut' : 'station' }));
const men = snowmenNear(anchors);
assert.ok(men.features.length > 5 && men.features.length < 40, `a light sprinkle, got ${men.features.length}`);
assert.deepEqual(snowmenNear(anchors), men, 'deterministic: the same snowmen every time');
const nowhere = snowmenNear(anchors, { has: () => true });
assert.equal(nowhere.features.length, 0, 'never on a run or lift line');
console.log('decor.test: all assertions passed');
