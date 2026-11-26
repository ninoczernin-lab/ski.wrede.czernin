// Tests the cable ribbons on a hand-made span (not real lift data).
import assert from 'node:assert/strict';
import { cableRibbons, metresPerPixel } from '../cable-ribbons.js';

// One 9-vertex chunk running north, clearance high at the ends and sagging in the middle.
const z = [10, 8, 6.5, 5.5, 5, 5.5, 6.5, 8, 10];
const coords = z.map((_, k) => [10, 47 + k * 0.0001]);
const span = { type: 'Feature', geometry: { type: 'LineString', coordinates: coords },
  properties: { name: 'Test gondola', aerialway: 'gondola', lift_id: 7, ...Object.fromEntries(z.map((v, k) => [`z${k}`, v])) } };
const fc = cableRibbons({ type: 'FeatureCollection', features: [span] }, 2, 1);

assert.equal(fc.features.length, 8, 'one box between each pair of cable vertices');
const mids = fc.features.map((f) => (f.properties.base + f.properties.top) / 2);
assert.deepEqual(mids, [9, 7.25, 6, 5.25, 5.25, 6, 7.25, 9], 'each box sits at the cable height between its two vertices');
assert.ok(mids[3] < mids[0], 'the cable sags between towers');
for (const f of fc.features) {
  assert.equal(f.properties.top - f.properties.base, 1, 'thickness');
  assert.equal(f.geometry.type, 'Polygon');
  assert.equal(f.properties.name, 'Test gondola', 'lift properties carried for taps and selection');
}
assert.equal(cableRibbons({ type: 'FeatureCollection', features: [] }, 2).features.length, 0);
const mpp = metresPerPixel(14, 0);
assert.ok(Math.abs(mpp - 4.777) < 0.01, `metres per pixel at z14 on the equator, got ${mpp}`);
console.log('cable-ribbons.test: all assertions passed');
