// Tests the cleaning rules on small hand-written Overpass-shaped inputs (not real resort data).
import assert from 'node:assert/strict';
import { cleanElements, normalizeDifficulty } from './clean.mjs';
import { convert } from './convert.mjs';

assert.equal(normalizeDifficulty('Easy'), 'easy');
assert.equal(normalizeDifficulty('easy;intermediate'), 'intermediate');
assert.equal(normalizeDifficulty(undefined), 'unknown');
assert.equal(normalizeDifficulty('black'), 'advanced');
assert.equal(normalizeDifficulty('weird'), 'unknown');

const n = (id, lon) => ({ type: 'node', id, lat: 47.1, lon });
const input = { elements: [
  n(1, 10.0), n(2, 10.01), n(3, 10.02), n(4, 10.03), n(5, 10.04), n(6, 10.05),
  // A run split into 3 segments; the middle one is drawn reversed and has no tags of its own.
  { type: 'way', id: 100, nodes: [1, 2], tags: { 'piste:type': 'downhill' } },
  { type: 'way', id: 101, nodes: [3, 2], tags: {} },
  { type: 'way', id: 102, nodes: [3, 4], tags: { 'piste:type': 'downhill' } },
  // The route relation carries the difficulty and name.
  { type: 'relation', id: 900, members: [100, 101, 102].map((ref) => ({ type: 'way', ref, role: '' })),
    tags: { type: 'route', route: 'piste', 'piste:type': 'downhill', 'piste:difficulty': 'Intermediate', name: 'Kandahar', ref: '21' } },
  // Unrelated blue run sharing node 4, and an abandoned run.
  { type: 'way', id: 103, nodes: [4, 5], tags: { 'piste:type': 'downhill', 'piste:difficulty': 'easy' } },
  { type: 'way', id: 104, nodes: [5, 6], tags: { 'piste:type': 'downhill', 'piste:abandoned': 'yes' } },
] };

const cleaned = cleanElements(input);
assert.ok(!cleaned.elements.some((e) => e.type === 'relation'), 'route relation is dropped after inheriting');
assert.equal(input.elements.find((e) => e.id === 101).tags['piste:type'], undefined, 'input is not mutated');

const pistes = convert(input).pistes.features;
assert.equal(pistes.length, 2, 'red run merged into one line + the blue run; abandoned run removed');
const red = pistes.find((f) => f.properties.name === 'Kandahar');
assert.equal(red.properties['piste:difficulty'], 'intermediate');
assert.equal(red.properties.ref, '21');
assert.equal(red.geometry.type, 'LineString');
assert.equal(red.geometry.coordinates.length, 4, 'segments 1-2, 2-3, 3-4 joined end to end');
assert.equal(pistes.find((f) => f.properties.name == null).properties['piste:difficulty'], 'easy');
console.log('clean.test: all assertions passed');
