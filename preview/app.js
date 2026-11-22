// Browser preview of the iOS map. Same Mapbox style, terrain, layers and colours as
// ios/SkiMaps/ResortMapView.swift + PisteStyle.swift, and the same data code as pipeline/.
import { overpassQuery } from '../pipeline/query.mjs';
import { convert } from '../pipeline/convert.mjs';
import { buildCableSpans, NSTOPS } from '../pipeline/cables.mjs';
import { elevationAt } from './elevation-browser.js';
import { MAPBOX_TOKEN } from './config.js';

const EXAGGERATION = 1.5;
const PITCH_3D = 65;
const SHADOW = 0.25;
const GROUND_LIFTS = ['rope_tow', 'magic_carpet', 'zip_line'];
const OVERPASS = 'https://overpass-api.de/api/interpreter';

// --- Mirrors PisteStyle.swift ---------------------------------------------------------
const DIFF = {
  novice: ['#009e4a', 'Beginner'], easy: ['#0066e6', 'Easy'], intermediate: ['#e31221', 'Intermediate'],
  advanced: ['#0d0d0d', 'Difficult'], expert: ['#0d0d0d', 'Expert'], freeride: ['#fa8c00', 'Freeride'],
  unknown: ['#737380', 'Not classified'],
};
const legendFor = (country) => country === 'FR'
  ? ['novice', 'easy', 'intermediate', 'advanced'] : ['easy', 'intermediate', 'advanced', 'freeride'];
const colorExpr = ['match', ['get', 'piste:difficulty'],
  ...Object.entries(DIFF).filter(([k]) => k !== 'unknown').flatMap(([k, [c]]) => [k, c]), DIFF.unknown[0]];
const widthExpr = (stops) => ['interpolate', ['exponential', 1.4], ['zoom'], ...stops.flat()];
const LINE_W = widthExpr([[10, 2.2], [12, 3.5], [14, 5.5], [16, 8]]);
const CASING_W = widthExpr([[10, 4], [12, 6], [14, 9], [16, 13]]);
const byZoom = (a, b) => ['interpolate', ['linear'], ['zoom'], 11, a, 16, b];

// --- UI state ---------------------------------------------------------------------------
const $ = (s) => document.querySelector(s);
// Standard-style config; a no-op (not a crash) if the style has no "basemap" import.
const setBasemap = (key, value) => { try { map.setConfigProperty('basemap', key, value); } catch (e) { console.warn(e.message); } };
const status = (t) => { $('#status').textContent = t ?? ''; };
let is3D = true;
const presets = ['day', 'dusk', 'night', 'dawn'];
let preset = 0;

const TOKEN_KEY = 'mapbox-token';
const readToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const params = new URLSearchParams(location.search);
// Order: ?token= in the link, then one the viewer pasted earlier, then the built-in token.
let token = params.get('token') || readToken() || MAPBOX_TOKEN || null;
if (!token) {
  $('#token').classList.add('show');
  token = await new Promise((resolve) => $('#token form').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = new FormData(e.target).get('t').trim();
    try { localStorage.setItem(TOKEN_KEY, t); } catch { /* private mode: keep for this visit only */ }
    $('#token').classList.remove('show');
    resolve(t);
  }));
}

const resorts = await (await fetch('../pipeline/resorts.json')).json();
for (const r of resorts) $('#resort').add(new Option(r.name, r.id));
const initial = resorts.find((r) => r.id === params.get('resort')) ?? resorts[0];
$('#resort').value = initial.id;

// --- Map --------------------------------------------------------------------------------
mapboxgl.accessToken = token;
const map = new mapboxgl.Map({
  container: 'map', style: 'mapbox://styles/mapbox/standard',
  center: [initial.camera.lon, initial.camera.lat], zoom: initial.camera.zoom,
  bearing: initial.camera.bearing, pitch: PITCH_3D, maxPitch: 85, hash: false,
  config: { basemap: { lightPreset: 'day', show3dObjects: true, showTransitLabels: false } },
});
map.on('error', (e) => {
  const msg = e.error?.message ?? String(e.error);
  console.warn(msg);
  if (/401|access token/i.test(msg)) {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    status('Mapbox rejected the token. Reload and paste a valid pk. token.');
  }
});
await new Promise((r) => map.on('style.load', r));

map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
map.setTerrain({ source: 'mapbox-dem', exaggeration: EXAGGERATION });
// Separate DEM source for shading: sharing the terrain source halves hillshade resolution.
map.addSource('mapbox-dem-shade', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
map.addLayer({ id: 'relief', type: 'hillshade', source: 'mapbox-dem-shade', slot: 'bottom', paint: {
  'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#334059',
  'hillshade-highlight-color': '#ffffff', 'hillshade-illumination-anchor': 'map' } });

const empty = { type: 'FeatureCollection', features: [] };
for (const id of ['pistes', 'piste_areas', 'lifts', 'structures']) map.addSource(id, { type: 'geojson', data: empty });
map.addSource('lift_spans', { type: 'geojson', data: empty, lineMetrics: true });

const downhill = ['==', ['get', 'piste:type'], 'downhill'];
const unknown = ['==', ['get', 'piste:difficulty'], 'unknown'];
const liftOpacity = () => ['match', ['get', 'aerialway'], GROUND_LIFTS, 1, is3D ? SHADOW : 1];

map.addLayer({ id: 'piste-areas-fill', type: 'fill', source: 'piste_areas', slot: 'middle',
  paint: { 'fill-color': colorExpr, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.06, 15, 0.14] } });
map.addLayer({ id: 'pistes-casing', type: 'line', source: 'pistes', slot: 'top', filter: downhill,
  layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'rank'] },
  paint: { 'line-color': '#fff', 'line-opacity': 0.95, 'line-width': CASING_W, 'line-emissive-strength': 1 } });
map.addLayer({ id: 'pistes-line', type: 'line', source: 'pistes', slot: 'top', filter: ['all', downhill, ['!', unknown]],
  layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'rank'] },
  paint: { 'line-color': colorExpr, 'line-width': LINE_W, 'line-emissive-strength': 1 } });
map.addLayer({ id: 'pistes-unknown', type: 'line', source: 'pistes', slot: 'top', filter: ['all', downhill, unknown],
  paint: { 'line-color': DIFF.unknown[0], 'line-width': LINE_W, 'line-dasharray': [1.5, 1], 'line-emissive-strength': 1 } });
map.addLayer({ id: 'lifts-line', type: 'line', source: 'lifts', slot: 'top',
  paint: { 'line-color': '#1f1f1f', 'line-width': byZoom(1.5, 3.5), 'line-dasharray': [2, 1],
    'line-emissive-strength': 1, 'line-opacity': liftOpacity() } });

// Hanging cables: same expression the iOS app sets.
const zOffset = ['interpolate', ['linear'], ['line-progress'],
  ...Array.from({ length: NSTOPS }, (_, k) => [k / (NSTOPS - 1), ['*', EXAGGERATION, ['get', `z${k}`]]]).flat()];
map.addLayer({ id: 'lifts-cable', type: 'line', source: 'lift_spans', slot: 'top',
    layout: { 'line-cap': 'round', 'line-elevation-reference': 'ground', 'line-z-offset': zOffset },
    paint: { 'line-color': ['match', ['get', 'aerialway'], ['cable_car', 'gondola', 'mixed_lift'], '#1a1a1f', '#38383f'],
      'line-width': byZoom(1.2, 3), 'line-emissive-strength': 1 } });
// Mapbox GL skips (doesn't throw on) a layer it can't validate, so check it really exists.
const cablesOK = Boolean(map.getLayer('lifts-cable'));
if (!cablesOK) {
  console.warn('Elevated lines unavailable in this Mapbox GL version; lifts stay on the ground');
  map.setPaintProperty('lifts-line', 'line-opacity', 1);
}

map.addLayer({ id: 'structures-3d', type: 'fill-extrusion', source: 'structures', slot: 'top', minzoom: 13,
  paint: { 'fill-extrusion-height': ['*', EXAGGERATION, ['get', 'height']], 'fill-extrusion-base': 0,
    'fill-extrusion-color': ['match', ['get', 'kind'], 'station', '#d94d33', '#595959'],
    'fill-extrusion-opacity': 0.95, 'fill-extrusion-ambient-occlusion-intensity': 0.3 } });
map.addLayer({ id: 'pistes-label', type: 'symbol', source: 'pistes', slot: 'top', filter: downhill, minzoom: 12.5,
  layout: { 'symbol-placement': 'line', 'symbol-spacing': 350, 'text-pitch-alignment': 'viewport', 'text-keep-upright': true,
    'text-size': byZoom(11, 14),
    'text-field': ['step', ['zoom'], ['coalesce', ['get', 'ref'], ''], 14.5, ['coalesce', ['get', 'name'], ['get', 'ref'], '']] },
  paint: { 'text-color': '#fff', 'text-halo-color': colorExpr, 'text-halo-width': 2.5, 'text-emissive-strength': 1 } });
map.addLayer({ id: 'lifts-label', type: 'symbol', source: 'lifts', slot: 'top', minzoom: 13.5,
  layout: { 'symbol-placement': 'line', 'text-size': 12, 'text-pitch-alignment': 'viewport',
    'text-field': ['coalesce', ['get', 'name'], ['get', 'ref'], ''] },
  paint: { 'text-color': '#1a1a1a', 'text-halo-color': '#fff', 'text-halo-width': 1.5, 'text-emissive-strength': 1 } });

// --- Data: bundled pipeline output if present, otherwise live from OSM -------------------
const cache = new Map();
async function loadResortData(r) {
  if (cache.has(r.id)) return cache.get(r.id);
  const layers = {};
  const names = ['pistes', 'piste_areas', 'lifts', 'structures', 'lift_spans'];
  const bundled = await Promise.all(names.map((n) =>
    fetch(`../data/${r.id}/${n}.geojson`).then((res) => (res.ok ? res.json() : null)).catch(() => null)));
  if (bundled.slice(0, 4).every(Boolean)) {
    names.forEach((n, i) => { layers[n] = bundled[i] ?? empty; });
  } else {
    status(`Loading ${r.name} runs and lifts from OpenStreetMap… (~20–60 s)`);
    const res = await fetch(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: overpassQuery(r.bbox) }) });
    if (!res.ok) throw new Error(`OpenStreetMap (Overpass) answered ${res.status}. Try again in a minute.`);
    Object.assign(layers, convert(await res.json()));
    status(`Sampling terrain for ${layers.lifts.features.length} lift cables…`);
    layers.lift_spans = await buildCableSpans(layers.lifts, elevationAt);
  }
  cache.set(r.id, layers);
  return layers;
}

async function showResort(r, fly = true) {
  renderLegend(r);
  $('#card').classList.remove('show');
  if (fly) map.flyTo({ center: [r.camera.lon, r.camera.lat], zoom: r.camera.zoom, bearing: r.camera.bearing,
    pitch: is3D ? PITCH_3D : 0, duration: 2500, essential: true });
  try {
    const layers = await loadResortData(r);
    for (const id of ['pistes', 'piste_areas', 'lifts', 'structures', 'lift_spans']) map.getSource(id).setData(layers[id] ?? empty);
    const runs = layers.pistes.features.filter((f) => f.properties['piste:type'] === 'downhill').length;
    status(`${r.name}: ${runs} runs, ${layers.lifts.features.length} lifts`);
    setTimeout(() => status(), 3500);
  } catch (e) {
    status(e.message);
  }
}

function renderLegend(r) {
  $('#legend').innerHTML = legendFor(r.country)
    .map((k) => `<span><i style="background:${DIFF[k][0]}"></i>${DIFF[k][1]}</span>`).join('');
}

// --- Controls ---------------------------------------------------------------------------
$('#resort').addEventListener('change', (e) => {
  const r = resorts.find((x) => x.id === e.target.value);
  history.replaceState(null, '', `?resort=${r.id}`);
  showResort(r);
});

$('#toggle3d').addEventListener('click', () => {
  is3D = !is3D;
  $('#toggle3d').textContent = is3D ? '2D' : '3D';
  $('#toggle3d').setAttribute('aria-label', is3D ? 'Switch to flat 2D map' : 'Switch to 3D map');
  map.setTerrain(is3D ? { source: 'mapbox-dem', exaggeration: EXAGGERATION } : null);
  setBasemap('show3dObjects', is3D);
  map.setLayoutProperty('structures-3d', 'visibility', is3D ? 'visible' : 'none');
  if (cablesOK) map.setLayoutProperty('lifts-cable', 'visibility', is3D ? 'visible' : 'none');
  map.setPaintProperty('lifts-line', 'line-opacity', cablesOK ? liftOpacity() : 1);
  map.easeTo({ pitch: is3D ? PITCH_3D : 0, duration: 800 });
});

$('#light').addEventListener('click', () => {
  preset = (preset + 1) % presets.length;
  setBasemap('lightPreset', presets[preset]);
  $('#light').textContent = { day: '☀︎', dusk: '◐', night: '☾', dawn: '◑' }[presets[preset]];
  status(`Lighting: ${presets[preset]}`);
  setTimeout(() => status(), 1200);
});

// Tap a run, lift or cable → card (mirrors featureCard in ResortBrowserView.swift).
const tappable = ['pistes-line', 'pistes-unknown', 'lifts-cable', 'lifts-line', 'structures-3d'].filter((l) => map.getLayer(l));
map.on('click', (e) => {
  const pad = 10;
  const f = map.queryRenderedFeatures([[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]], { layers: tappable })[0];
  if (!f) { $('#card').classList.remove('show'); return; }
  const p = f.properties;
  const d = DIFF[p['piste:difficulty']];
  $('#card b').textContent = p.name ?? p.ref ?? (p.kind === 'pylon' ? 'Lift pylon' : 'Unnamed');
  $('#card small').textContent = d ? `${d[1]} run${p.ref ? ` · No. ${p.ref}` : ''}`
    : (p.aerialway ?? p.kind ?? '').replace(/_/g, ' ');
  $('#card .dot').style.background = d ? d[0] : '#1f1f1f';
  $('#card').classList.add('show');
});
$('#card button').addEventListener('click', () => $('#card').classList.remove('show'));

showResort(initial, false);
window.__preview = { map, resorts, cablesOK };   // handy in the console
