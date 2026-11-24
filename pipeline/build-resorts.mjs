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
const ids = out.map((r) => r.id);
const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
if (dupes.length) throw new Error(`duplicate ids: ${dupes}`);
await fs.writeFile(file, JSON.stringify(out, null, 1) + '\n');
console.log(`resorts.json: ${out.length} resorts (${[1, 2, 3].map((t) => out.filter((r) => r.tier === t).length).join(' / ')} by tier)`);
