// Tests for lift furniture geometry (synthetic inputs, not real resort data).
import assert from 'node:assert/strict';
import { bearing, orientedRect, structuresFrom, buildCabins } from './lift3d.mjs';
import { buildCableSpans } from './cables.mjs';

assert.ok(Math.abs(bearing([10, 47], [10, 47.01]) - 0) < 0.01, 'due north');
assert.ok(Math.abs(bearing([10, 47], [10.01, 47]) - 90) < 0.1, 'due east');

// A rectangle 20 m along a north-bearing line, 4 m across: 20 m tall in latitude, 4 m wide in longitude.
{
  const [ring] = orientedRect([10, 47], 0, 20, 4).coordinates;
  const lats = ring.map((p) => p[1]), lons = ring.map((p) => p[0]);
  const hM = (Math.max(...lats) - Math.min(...lats)) * 111320;
  const wM = (Math.max(...lons) - Math.min(...lons)) * 111320 * Math.cos((47 * Math.PI) / 180);
  assert.ok(Math.abs(hM - 20) < 0.01 && Math.abs(wM - 4) < 0.01, `rect ${hM}×${wM}`);
  assert.deepEqual(ring[0], ring.at(-1), 'closed ring');
}

// Gondola heading east with one pylon: crossarm turned across (north-south), 8 m wide.
const coords = [[10, 47], [10.0066, 47], [10.0132, 47]];
const lifts = [{ type: 'Feature', id: 'way/1', geometry: { type: 'LineString', coordinates: coords }, properties: { aerialway: 'gondola' } }];
const pylon = { id: 'node/2', geometry: { type: 'Point', coordinates: coords[1] }, properties: {} };
const station = { id: 'node/1', geometry: { type: 'Point', coordinates: coords[0] }, properties: { name: 'Valley' } };
const s = structuresFrom([pylon], [station], lifts);
const arm = s.find((f) => f.properties.part === 'arm'), mast = s.find((f) => f.properties.part === 'mast');
assert.equal(mast.properties.height, 18, 'gondola pylon height');
assert.ok(arm.properties.base > 16 && arm.properties.height > 18, 'arm sits at the top of the mast');
const armLats = arm.geometry.coordinates[0].map((p) => p[1]);
assert.ok(Math.abs((Math.max(...armLats) - Math.min(...armLats)) * 111320 - 8) < 0.05, 'arm spans 8 m across an east-west lift');
assert.equal(s.filter((f) => f.properties.kind === 'station').length, 2, 'station body + roof');
assert.equal(s.find((f) => f.properties.part === 'roof').properties.base, 10, 'roof on a 10 m gondola station');

// Cabins hang below the cable, roughly every 70 m on a ~1 km gondola, never into the snow.
const spans = await buildCableSpans({ type: 'FeatureCollection', features: lifts }, async () => 1000);
const cabins = buildCabins(spans).features;
assert.ok(cabins.length >= 12 && cabins.length <= 15, `cabin count ${cabins.length}`);
for (const c of cabins) assert.ok(c.properties.base >= 0.5 && c.properties.height > c.properties.base);
const maxClear = Math.max(...spans.features.flatMap((f) => Array.from({ length: 9 }, (_, k) => f.properties[`z${k}`])));
assert.ok(cabins.every((c) => c.properties.height < maxClear), 'cabins below the cable');
console.log('lift3d.test: all assertions passed');
