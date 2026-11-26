// Builds resorts.json from catalog.mjs: id, tier, search words, a bbox that covers the ski area
// (centre ± radius) and a starting camera. Hand-tuned bbox/camera already in resorts.json are kept.
import fs from 'node:fs/promises';
import { CATALOG } from './catalog.mjs';

const file = new URL('./resorts.json', import.meta.url);
const existing = new Map(JSON.parse(await fs.readFile(file, 'utf8')).map((r) => [r.id, r]));
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

const out = CATALOG.map(([name, country, tier, lat, lon, radiusKm, words = '']) => {
  const id = slug(name);
  const dLat = radiusKm / 111.32, dLon = dLat / Math.cos((lat * Math.PI) / 180);
  const old = existing.get(id);
  return {
    id, name, country, tier,
    villages: old?.villages ?? words.split('|').filter(Boolean),
    bbox: old?.bbox ?? { south: round(lat - dLat), west: round(lon - dLon), north: round(lat + dLat), east: round(lon + dLon) },
    camera: old?.camera ?? {
      lat, lon, bearing: 0, pitch: 62,
      zoom: round(Math.min(13.4, Math.max(10.8, 12.9 - 0.9 * Math.log2(radiusKm / 4))), 2),
    },
  };
});
// The 2026 list (resort-list-2026.txt): Mapbox-located entries plus hand-placed ones, as tier 4.
const extra = JSON.parse(await fs.readFile(new URL('./catalog-extra.json', import.meta.url), 'utf8'));
const manual = JSON.parse(await fs.readFile(new URL('./catalog-manual.json', import.meta.url), 'utf8'));
const byName = new Map(out.map((r) => [r.name, r]));
for (const { name, words } of extra.aliases) byName.get(name)?.villages.push(...words);
for (const [name, words] of manual.aliases) byName.get(name)?.villages.push(...words.split('|'));
for (const r of out) r.villages = [...new Set(r.villages)].filter((w) => w !== r.name);
const more = [
  ...extra.added.filter((a) => !manual.added.some((m) => m[2] === a.rank)).map((a) => ({ name: a.name, country: a.cc, lat: a.lat, lon: a.lon, radiusKm: a.radiusKm, rank: a.rank, status: a.status,
    words: a.words.split('|').slice(1) })),
  ...manual.added.map(([name, country, rank, lat, lon, radiusKm, words]) => ({ name, country, lat, lon, radiusKm, rank, status: null,
    words: words.split('|').filter(Boolean) })),
].sort((a, b) => a.rank - b.rank);
const taken = new Set(out.map((r) => r.id));
for (const m of more) {
  let id = slug(m.name);
  if (taken.has(id)) id = `${id}-${m.country.toLowerCase()}`;
  for (let n = 2; taken.has(id); n++) id = `${slug(m.name)}-${n}`;
  taken.add(id);
  const dLat = m.radiusKm / 111.32, dLon = dLat / Math.cos((m.lat * Math.PI) / 180), old = existing.get(id);
  out.push({
    id, name: m.name, country: m.country ?? '', tier: 4, rank: m.rank, ...(m.status && { status: m.status }),
    villages: old?.villages ?? [...new Set(m.words)].filter((w) => w !== m.name),
    bbox: old?.bbox ?? { south: round(m.lat - dLat), west: round(m.lon - dLon), north: round(m.lat + dLat), east: round(m.lon + dLon) },
    camera: old?.camera ?? { lat: m.lat, lon: m.lon, bearing: 0, pitch: 62,
      zoom: round(Math.min(13.4, Math.max(10.8, 12.9 - 0.9 * Math.log2(m.radiusKm / 4))), 2) },
  });
}
const ids = out.map((r) => r.id);
const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
if (dupes.length) throw new Error(`duplicate ids: ${dupes}`);
await fs.writeFile(file, JSON.stringify(out, null, 1) + '\n');
console.log(`resorts.json: ${out.length} resorts (${[1, 2, 3, 4].map((t) => out.filter((r) => r.tier === t).length).join(' / ')} by tier)`);
