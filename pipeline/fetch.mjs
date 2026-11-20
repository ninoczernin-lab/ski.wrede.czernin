// Usage: node fetch.mjs [resort-id ...]   (no args = all resorts in resorts.json)
// Pulls pistes, lifts, stations and ski-area outlines from OpenStreetMap via Overpass,
// converts them to GeoJSON and writes ../data/<id>/*.geojson plus ../data/manifest.json.
// Data © OpenStreetMap contributors, ODbL. The app must show that attribution.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convert, summarize } from './convert.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'data');
const ENDPOINT = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';

const query = ({ south, west, north, east }) => {
  const b = `${south},${west},${north},${east}`;
  return `[out:json][timeout:180];
(
  way["piste:type"](${b});
  relation["piste:type"](${b});
  way["aerialway"](${b});
  node["aerialway"="station"](${b});
  way["landuse"="winter_sports"](${b});
  relation["landuse"="winter_sports"](${b});
);
out body;
>;
out skel qt;`;
};

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
