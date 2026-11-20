// Cable geometry tests: a fake flat terrain and a fake slope, plus one span on real AWS terrain.
import assert from 'node:assert/strict';
import { buildCableSpans, NSTOPS, sagFor } from './cables.mjs';

const lift = (type, coords, extra = {}) => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', id: 'way/1', geometry: { type: 'LineString', coordinates: coords },
    properties: { aerialway: type, name: 'Test', ...extra } }],
});

// Flat ground at 1000 m, one 100 m chair-lift span between two stations.
{
  const flat = async () => 1000;
  const spans = (await buildCableSpans(lift('chair_lift', [[10, 47], [10.001315, 47]]), flat)).features;
  assert.equal(spans.length, 1);
  const p = spans[0].properties;
  assert.equal(spans[0].geometry.coordinates.length, NSTOPS, 'a vertex at every stop');
  assert.equal(p.z0, 5, 'cable leaves the station 5 m up');
  assert.equal(p.z8, 5);
  assert.ok(p.z4 < p.z0, 'cable sags in the middle');
  assert.ok(Math.abs(p.z4 - (5 - sagFor(100, 'chair_lift'))) < 0.2, 'parabolic sag of ~2.5% of span');
}

// A 1 km gondola up a steady slope (0 m → 300 m) with one pylon in the middle.
{
  const slope = async ([lon]) => ((lon - 10) / 0.01315) * 300;
  const fc = lift('gondola', [[10, 47], [10.006575, 47], [10.01315, 47]]);
  const spans = (await buildCableSpans(fc, slope)).features;
  assert.ok(spans.length >= 8, 'long spans are cut into short chunks');
  for (const f of spans) for (let k = 0; k < NSTOPS; k++) assert.ok(f.properties[`z${k}`] >= 2.5, 'never below the snow');
  const first = spans[0].properties, lastOfSpan1 = spans.filter((f) => f.id.startsWith('way/1-0-')).at(-1).properties;
  assert.equal(first.z0, 6, 'station height');
  assert.equal(lastOfSpan1.z8, 18, 'reaches the top of the pylon');
}

// Ground lifts are not raised.
{
  const none = await buildCableSpans(lift('magic_carpet', [[10, 47], [10.001, 47]]), async () => 0);
  assert.equal(none.features.length, 0);
}

// Real terrain: the Galzigbahn line in St. Anton (approximate station positions).
if (!process.env.OFFLINE) {
  const { elevationAt } = await import('./elevation.mjs');
  const spans = (await buildCableSpans(lift('gondola', [[10.2634, 47.1289], [10.2340, 47.1367]]), elevationAt)).features;
  const zs = spans.flatMap((f) => Array.from({ length: NSTOPS }, (_, k) => f.properties[`z${k}`]));
  assert.ok(zs.every((z) => z >= 2.5));
  console.log(`  real terrain: ${spans.length} chunks, clearance ${Math.min(...zs)}–${Math.max(...zs)} m`);
}
console.log('cables.test: all assertions passed');
