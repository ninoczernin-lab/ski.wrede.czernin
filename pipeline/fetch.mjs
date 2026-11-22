// Usage: node fetch.mjs [resort-id ...]   (no args = all resorts in resorts.json)
// Pulls pistes, lifts, stations and ski-area outlines from OpenStreetMap via Overpass,
// converts them to GeoJSON and writes ../data/<id>/*.geojson plus ../data/manifest.json.
// Lift cables are given heights from AWS Terrain Tiles (Mapzen/AWS open data, attribution in README).
// Data © OpenStreetMap contributors, ODbL. The app must show that attribution.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convert, summarize } from './convert.mjs';
import { buildCableSpans } from './cables.mjs';
import { buildCabins } from './lift3d.mjs';
import { overpassQuery as query } from './query.mjs';
import { elevationAt } from './elevation.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'data');
const ENDPOINT = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';


async function overpass(q, attempt = 1) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ski-maps-pipeline/0.1' },
    body: new URLSearchParams({ data: q }),
  }).catch((e) => ({ ok: false, status: 0, statusText: e.message }));
  if (res.ok) return res.json();
  if (attempt < 4 && [0, 429, 502, 503, 504].includes(res.status)) {
    const wait = 2 ** attempt * 5000;
    console.warn(`  Overpass ${res.status} ${res.statusText}; retrying in ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
    return overpass(q, attempt + 1);
  }
  throw new Error(`Overpass failed: ${res.status} ${res.statusText}`);
}

const resorts = JSON.parse(await fs.readFile(path.join(here, 'resorts.json'), 'utf8'));
const wanted = process.argv.slice(2);
const manifest = [];

for (const r of resorts) {
  if (wanted.length && !wanted.includes(r.id)) continue;
  console.log(`→ ${r.name}`);
  const layers = convert(await overpass(query(r.bbox)));
  console.log('   sampling terrain for hanging cables…');
  layers.lift_spans = await buildCableSpans(layers.lifts, elevationAt);
  layers.cabins = buildCabins(layers.lift_spans);
  const dir = path.join(OUT, r.id);
  await fs.mkdir(dir, { recursive: true });
  for (const [name, fc] of Object.entries(layers)) {
    await fs.writeFile(path.join(dir, `${name}.geojson`), JSON.stringify(fc));
  }
  const stats = summarize(layers);
  console.log('  ', JSON.stringify(stats));
  manifest.push({ ...r, layers: Object.keys(layers), stats, fetchedAt: new Date().toISOString() });
}

await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Wrote ${OUT}`);
