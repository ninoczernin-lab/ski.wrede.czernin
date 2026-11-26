// Locates every resort in resort-list-2026.txt with Mapbox Search (ski-area POIs first), checks
// each position against real terrain, merges entries already in catalog.mjs, and writes
// catalog-extra.json for build-resorts.mjs.
//
//   MAPBOX_TOKEN=pk.… node geocode-list.mjs
//
// Answers are cached in .geocode-cache.json, so re-runs cost no extra requests.
import fs from 'node:fs/promises';
import { PNG } from 'pngjs';
import { CATALOG } from './catalog.mjs';

const TOKEN = process.env.MAPBOX_TOKEN;
if (!TOKEN) throw new Error('Set MAPBOX_TOKEN to a Mapbox public token');
const here = new URL('.', import.meta.url);
const cacheFile = new URL('.geocode-cache.json', here);
const cache = JSON.parse(await fs.readFile(cacheFile, 'utf8').catch(() => '{}'));
let requests = 0;

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ıİ]/g, 'i').replace(/ß/g, 'ss')
  .replace(/[øØ]/g, 'o').replace(/[æÆ]/g, 'ae').replace(/[łŁ]/g, 'l').toLowerCase();
const STOP = new Set(['ski', 'resort', 'mountain', 'mount', 'mont', 'area', 'the', 'les', 'la', 'le', 'de', 'del', 'di', 'am', 'im',
  'an', 'der', 'and', 'park', 'center', 'centre', 'valley', 'peak', 'station', 'alpine', 'snow', 'saint', 'sankt', 'san', 'st', 'mt',
  'lake', 'monte', 'glacier', 'peaks', 'sierra', 'national', 'village', 'ridge', 'hill', 'hills', 'forest', 'springs', 'lodge',
  'sport', 'sports', 'lifts', 'lift', 'bergbahnen', 'skilift', 'international', 'pass', 'high', 'big', 'grand', 'little', 'north', 'south',
  'east', 'west', 'upper', 'lower', 'alm', 'alpe', 'mountains', 'resorts', 'skiing', 'ltd', 'inc', 'gmbh', 'srl', 'skisenter', 'alpinsenter', 'kogen', 'onsen', 'en', 'sur', 'ob', 'bei', 'club', 'temporarily', 'closed', 'planned']);
const tokens = (s) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
const overlap = (a, b) => { const t = new Set(tokens(a)); return tokens(b).some((w) => t.has(w)); };
/** A name reduced to its identity: folded words, without "ski", "resort", "area", brackets and the like. */
const core = (s) => fold(s.replace(/\(.*?\)/g, '')).split(/[^a-z0-9]+/).filter((w) => w && !['ski', 'resort', 'area', 'the', 'skigebiet', 'station'].includes(w)).join(' ');
/** Strict name check for a Mapbox hit: the resort's own leading distinctive word must be in the hit's name. */
const named = (main, clean, hitName) => {
  const want = tokens(main), got = new Set(tokens(hitName));
  if (!want.length) return overlap(clean, hitName);
  // The leading distinctive word must match, and for two-word names a second one too ("Champ du Feu" ≠ "Ski resort Champ").
  return got.has(want[0]) && want.filter((w) => got.has(w)).length >= Math.min(2, want.length);
};

async function search(q) {
  if (cache[q]) return cache[q];
  const url = new URL('https://api.mapbox.com/search/searchbox/v1/forward');
  url.search = new URLSearchParams({ q, access_token: TOKEN, limit: '6', language: 'en' });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    requests++;
    if (res.ok) {
      const d = await res.json();
      cache[q] = (d.features ?? []).map((f) => ({ id: f.properties.mapbox_id, name: f.properties.name, type: f.properties.feature_type,
        cats: f.properties.poi_category_ids ?? [], cc: f.properties.context?.country?.country_code ?? null, c: f.geometry.coordinates }));
      return cache[q];
    }
    if (res.status === 429 && attempt < 6) { await new Promise((r) => setTimeout(r, 2000 * attempt)); continue; }
    throw new Error(`Mapbox search ${res.status} for "${q}"`);
  }
}

/** Ski areas Mapbox knows within ~12 km of a point (cached like searches). */
async function skiAreasNear([lon, lat]) {
  const key = `cat2:${lon.toFixed(3)},${lat.toFixed(3)}`;
  if (cache[key]) return cache[key];
  const d = 0.12, url = new URL('https://api.mapbox.com/search/searchbox/v1/category/ski_area');
  url.search = new URLSearchParams({ access_token: TOKEN, proximity: `${lon},${lat}`, limit: '25', language: 'en' });
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    requests++;
    if (res.ok) {
      const j = await res.json();
      cache[key] = (j.features ?? []).map((f) => ({ name: f.properties.name, cc: f.properties.context?.country?.country_code ?? null, c: f.geometry.coordinates }));
      return cache[key];
    }
    if (res.status === 429 && attempt < 6) { await new Promise((r) => setTimeout(r, 2000 * attempt)); continue; }
    throw new Error(`Mapbox category ${res.status}`);
  }
}

// ---- terrain relief check (AWS Terrain Tiles, z11) ----
const tiles = new Map();
async function tile(x, y) {
  const k = `${x}/${y}`;
  if (!tiles.has(k)) tiles.set(k, fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/11/${x}/${y}.png`)
    .then(async (r) => (r.ok ? PNG.sync.read(Buffer.from(await r.arrayBuffer())).data : null)));
  return tiles.get(k);
}
async function elev(lat, lon) {
  const n = 2 ** 11 * 256, fx = ((lon + 180) / 360) * n, lr = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n;
  const gx = Math.floor(fx), gy = Math.floor(fy), d = await tile(Math.floor(gx / 256), Math.floor(gy / 256));
  if (!d) return null;
  const i = ((gy % 256) * 256 + (gx % 256)) * 4;
  return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
}
async function relief(lat, lon, km) {
  const dLat = km / 111.32, dLon = dLat / Math.cos((lat * Math.PI) / 180), v = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const e = await elev(lat + (i / 2) * dLat, lon + (j / 2) * dLon); if (e != null) v.push(e); }
  return v.length ? Math.round(Math.max(...v) - Math.min(...v)) : null;
}

const km = ([lon1, lat1], [lon2, lat2]) => Math.hypot((lon2 - lon1) * 111.32 * Math.cos((lat1 * Math.PI) / 180), (lat2 - lat1) * 111.32);
const lines = (await fs.readFile(new URL('resort-list-2026.txt', here), 'utf8')).split('\n').map((s) => s.trim()).filter(Boolean);

const existing = CATALOG.map(([name, cc, tier, lat, lon, r, words]) => ({ name, cc, c: [lon, lat], words: `${name}|${words ?? ''}`, aliases: [] }));
const added = [], unresolved = [], merged = [], unconfirmed = [];
// Checked by hand: distinct resorts whose names collide with one on the map (Valbella–Gallio is in the
// Veneto, Mont Blanc in Québec, Donner Ski Ranch next to Sugar Bowl, Bald Mountain in Idaho is not
// Sun Valley's, Glacier 3000 is its own area above Les Diablerets).
const SEPARATE = new Set([1134, 386, 778, 1526, 519]);

async function locate(raw) {
  const status = /\(temporarily closed\)/i.test(raw) ? 'temporarily closed' : /\(planned\)/i.test(raw) ? 'planned' : null;
  const clean = raw.replace(/\((temporarily closed|planned)\)/gi, '').replace(/\s+/g, ' ').trim();
  const [main, place = ''] = clean.split(/\s+–\s+/);
  const isSki = (f) => f.type === 'poi' && f.cats.some((c) => /ski/.test(c));
  for (const q of [main, clean, `${main.replace(/\(.*?\)/g, '').split('/')[0].trim()} ski resort`]) {
    const hit = (await search(q)).find((f) => isSki(f) && named(main.split('/')[0], clean, f.name));
    if (hit) return { clean, main, place, status, hit, how: 'ski area' };
  }
  // Fallback: an anchor place (the resort's own name hits, then the village after the dash), accepted only
  // when Mapbox knows a ski area within 8 km with real vertical drop there; the resort is centred on that
  // ski area. Same-named places exist worldwide, so an anchor must also agree with the country most of the
  // resort's own name hits point to.
  const vq = (place || main).split('/')[0].replace(/\(.*?\)/g, '').trim();
  const kinds = ['place', 'locality', 'neighborhood', 'poi', 'street'];
  const own = [...(await search(main)), ...(await search(clean))].filter((f) => named(main.split('/')[0], clean, f.name));
  const village = (await search(vq)).filter((f) => kinds.includes(f.type) && named(vq, vq, f.name));
  const votes = {};
  for (const f of own.length ? own : village) if (f.cc) votes[f.cc] = (votes[f.cc] ?? 0) + 1;
  const expect = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0];
  const seen = new Set(), cands = [...own, ...village].filter((f) => !seen.has(f.id) && seen.add(f.id)).slice(0, 6);
  for (const v of cands) {
    if (expect && v.cc && v.cc !== expect) continue;
    const near = (await skiAreasNear(v.c)).filter((s) => km(s.c, v.c) <= 8);
    const best = near.find((s) => overlap(clean, s.name)) ?? near.sort((a, b) => km(a.c, v.c) - km(b.c, v.c))[0];
    if (best && (!best.cc || !expect || best.cc === expect) && (await relief(best.c[1], best.c[0], 4)) >= 200)
      return { clean, main, place, status, hit: { ...v, c: best.c, anchor: v.c, name: best.name, cc: best.cc ?? v.cc }, how: `village → nearby ski area` };
  }
  const v = village[0] ?? cands[0];
  if (v) return { clean, main, place, status, hit: null, unconfirmed: { village: v.name, cc: v.cc, c: v.c } };
  return { clean, main, place, status, hit: null };
}

let done = 0;
const queue = lines.map((l, i) => ({ l, rank: i + 1 }));
async function worker() {
  while (queue.length) {
    const { l, rank } = queue.shift();
    // Already on the map? Only on an exact name match: the main name equals one of an existing entry's
    // names (every slash part, for lists of villages), or the part after the dash is that entry's name.
    // Single shared words don't count ("White Pass" is not "Big White", "Alta" is not "Alta Badia").
    const cl = l.replace(/\((temporarily closed|planned)\)/gi, '').trim(), [mn, pl = ''] = cl.split(/\s+–\s+/);
    const parts = mn.split('/').map((x) => core(x)).filter(Boolean);
    const known = !SEPARATE.has(rank) && existing.find((e) => { const names = e.words.split('|').map(core);
      return (parts.length && parts.every((x) => names.includes(x))) || (pl && core(pl) === core(e.name)); });
    if (known) { known.aliases.push(...cl.split(/[–/()]/).map((x) => x.trim()).filter((x) => x.length > 1)); merged.push({ rank, line: l, into: known.name }); done++; continue; }
    const r = await locate(l);
    done++;
    if (done % 100 === 0) console.log(`  ${done}/${lines.length} (${requests} requests)`);
    if (!r.hit) { (r.unconfirmed ? unconfirmed : unresolved).push({ rank, line: l, ...(r.unconfirmed && { guess: r.unconfirmed }) }); continue; }
    const c = r.hit.c;
    const words = [r.main, ...r.clean.split(/[–/()]/).map((s) => s.trim())].filter((w) => w && w.length > 1);
    // Same resort as one already on the map? Merge as extra search words instead of adding a duplicate.
    // Merge only when this resort's own main name is already one of an existing entry's names, and only
    // one entry claims it (a name several entries share, like "Portes du Soleil", is an umbrella: keep it).
    const claim = existing.filter((e) => km(e.c, c) <= 12 && overlap(e.words, r.main) && overlap(r.main, e.words));
    const sameNew = added.find((e) => fold(e.name) === fold(r.main) && km(e.c, c) <= 6);
    const twin = SEPARATE.has(rank) ? null : sameNew ?? (claim.length === 1 && km(claim[0].c, c) <= 6 ? claim[0] : null);
    if (twin) { twin.aliases.push(...words); merged.push({ rank, line: l, into: twin.name }); continue; }
    const radiusKm = rank <= 100 ? 7 : rank <= 400 ? 5 : rank <= 1000 ? 4 : 3;
    added.push({ name: r.main.replace(/\s*\((.*?)\)\s*$/, (m, inner) => (/davos|chamonix|sälen|skiworld|paradiski|toggenburg|mt\. naeba|mt\. kosha|sugadaira|brembo|jura sur/i.test(inner) ? ` (${inner})` : '')).trim(),
      fullName: r.clean, cc: r.hit.cc ?? '??', c, radiusKm, rank, words: `${r.clean}|${words.join('|')}`, aliases: [],
      source: r.how, status: r.status, mapboxName: r.hit.name, anchor: r.hit.anchor });
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
await fs.writeFile(cacheFile, JSON.stringify(cache));

added.sort((a, b) => a.rank - b.rank);
// A village match snaps to the nearest ski area Mapbox knows, which is sometimes a neighbouring resort
// already on the map: then the resort stays at its own village instead of sitting on top of the other.
// If it still lands on another resort's exact spot, it was matched to that resort: a duplicate when the
// names agree (merged), otherwise not trustworthy (moved to the unconfirmed list).
for (let i = 0; i < added.length; i++) {
  const a = added[i], before = [...existing, ...added.slice(0, i)];
  const clashWith = () => before.find((e) => km(e.c, a.c) < 0.3);
  if (a.anchor && clashWith()) { a.c = a.anchor; a.source = 'village'; }
  delete a.anchor;
  const e = clashWith();
  if (!e) continue;
  if (overlap(e.words ?? e.name, a.name)) { if (added.includes(e)) e.words += `|${a.name}`; else e.aliases.push(a.name); merged.push({ rank: a.rank, line: a.fullName, into: e.name }); }
  else unconfirmed.push({ rank: a.rank, line: a.fullName, guess: { village: a.mapboxName, cc: a.cc, c: a.c, sameSpotAs: e.name } });
  added.splice(i--, 1);
}
// Final relief check on everything added (flags, never silently drops).
for (const a of added) a.relief = await relief(a.c[1], a.c[0], Math.min(a.radiusKm, 4));
added.sort((a, b) => a.rank - b.rank);
await fs.writeFile(new URL('catalog-extra.json', here), JSON.stringify({
  generated: new Date().toISOString(), source: 'resort-list-2026.txt via Mapbox Search Box',
  added: added.map(({ c, aliases, ...a }) => ({ ...a, words: [...new Set([...a.words.split('|'), ...aliases])].join('|'),
    lat: Math.round(c[1] * 1e5) / 1e5, lon: Math.round(c[0] * 1e5) / 1e5 })),
  aliases: existing.filter((e) => e.aliases.length).map((e) => ({ name: e.name, words: [...new Set(e.aliases)] })),
  merged, unconfirmed, unresolved,
}, null, 1));
console.log(`done: ${added.length} new, ${merged.length} merged, ${unconfirmed.length} unconfirmed (no ski area near the village), ${unresolved.length} not found, ${requests} Mapbox requests this run`);
