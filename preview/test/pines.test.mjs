// Pines: model file is a valid GLB; scatter stays in forests, off runs, below the tree line, stable.
import assert from 'node:assert/strict';
import { pineShapes, scatterPines, avoidGrid } from '../pines.js';
import { lightAt, presetFor, formatHour } from '../daylight.js';

// Shapes: four stacked parts per tree, tiers above each other, snow on top.
{
  const pts = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [10, 47] }, properties: { m: 'pine-m' } }] };
  const parts = pineShapes(pts, 20).features;
  assert.deepEqual(parts.map((p) => p.properties.part), ['trunk', 'low', 'mid', 'snow']);
  assert.equal(parts.at(-1).properties.height, 20, 'tree is as tall as asked');
  for (let i = 1; i < parts.length; i++) assert.ok(parts[i].properties.base >= parts[i - 1].properties.base);
  assert.equal(parts[1].geometry.coordinates[0].length, 9, 'closed octagon');
}
// A 600 m square forest with a run straight through the middle and a high corner above the tree line.
const forest = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[10, 47], [10.008, 47], [10.008, 47.0054], [10, 47.0054], [10, 47]]] } };
const run = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[10.004, 47], [10.004, 47.0054]] } };
const ele = ([lon]) => (lon > 10.0072 ? 2300 : 1500);
const args = { forests: [forest], bounds: [[9.99, 46.99], [10.02, 47.02]], spacingM: 40, avoid: avoidGrid([run]), elevationAt: ele, treeline: 2050 };
const a = scatterPines(args).features;
assert.ok(a.length > 80, `forest gets trees (${a.length})`);
const near = a.filter((f) => Math.abs(f.geometry.coordinates[0] - 10.004) * 111320 * Math.cos(47 * Math.PI / 180) < 20);
assert.equal(near.length, 0, 'no tree within 20 m of the run');
assert.ok(a.every((f) => f.geometry.coordinates[0] <= 10.0072), 'none above the tree line');
assert.ok(a.every((f) => ['pine-s', 'pine-m', 'pine-l'].includes(f.properties.m)));
const b = scatterPines(args).features;
assert.deepEqual(a.map((f) => f.geometry.coordinates), b.map((f) => f.geometry.coordinates), 'same trees every time');
assert.equal(scatterPines({ ...args, max: 10 }).features.length, 10, 'cap respected');

// Daylight: noon sun high in the south, evening golden and in the west, night dark.
const noon = lightAt(12.5), gold = lightAt(17.9), night = lightAt(20.8);
assert.ok(Math.abs(noon.azimuth - 187.5) < 0.01 && noon.altitude > 40);
assert.ok(gold.azimuth > 260 && gold.preset === 'dusk' && gold.part === 'Golden hour');
assert.ok(night.hud.dark && !noon.hud.dark);
assert.equal(lightAt(12.5, { south: true }).azimuth, 352.5, 'southern hemisphere sun swings through north');
assert.equal(presetFor(7), 'dawn'); assert.equal(formatHour(17.75), '17:45');
console.log('pines + daylight tests: all assertions passed');
