// Web version of the ski map. Same data code as pipeline/ and the same run colours as the iOS
// app (PisteStyle.swift). Mapbox GL JS v3 with Standard / Standard Satellite.
import { overpassQuery } from '../pipeline/query.mjs';
import { convert } from '../pipeline/convert.mjs';
import { buildCableSpans, NSTOPS } from '../pipeline/cables.mjs';
import { buildCabins } from '../pipeline/lift3d.mjs';
import { elevationAt } from './elevation-browser.js';
import { MAPBOX_TOKEN } from './config.js';

const EXAGGERATION = 1.5;
const PITCH_3D = 65;
const SHADOW = 0.22;
const GROUND_LIFTS = ['rope_tow', 'magic_carpet', 'zip_line'];
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const DATA_LAYERS = ['pistes', 'piste_areas', 'lifts', 'structures', 'lift_spans', 'cabins'];

// --- Run colours (mirror PisteStyle.swift) ---------------------------------------------------
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
const LINE_W = widthExpr([[10, 1.8], [12, 3], [14, 5], [16, 7.5]]);
// Casing = line + ~2.6 px: a crisp white gap between parallel runs so colours never bleed together.
const CASING_W = widthExpr([[10, 3.6], [12, 5.4], [14, 7.8], [16, 10.8]]);
const byZoom = (a, b) => ['interpolate', ['linear'], ['zoom'], 11, a, 16, b];

// --- Lifts -----------------------------------------------------------------------------------
const LIFT_NAMES = {
  cable_car: 'Cable car', gondola: 'Gondola', mixed_lift: 'Combined lift', chair_lift: 'Chairlift',
  drag_lift: 'Drag lift', t_bar: 'T-bar', j_bar: 'J-bar', platter: 'Button lift', rope_tow: 'Rope tow',
  magic_carpet: 'Magic carpet', zip_line: 'Zip line',
};
const LIFT = {
  cable: '#2b313b', shadow: '#3a414c',                 // thin charcoal for every unselected lift
  select: '#38bdf8', selectCore: '#ffffff',             // glow + core of the selected lift
  terminal: '#ffffff',
  mast: '#727d8c', arm: '#3c4552', wall: '#efe9dd', roof: '#8e2f29',
  cabin: '#d42a2f', chair: '#2b323c',
};
const liftLabelExpr = ['match', ['get', 'aerialway'], ...Object.entries(LIFT_NAMES).flat(), 'Lift'];
const NO_MATCH = ['boolean', false];               // filter that hides a layer until a lift is selected
const DIM = 0.4;                                        // opacity of unselected lifts while one is selected
let selectedLift = 'Valfagehrbahn';                     // tap another lift to change, × on the card clears
const nameKey = ['downcase', ['coalesce', ['get', 'name'], '']];

// --- Map looks ---------------------------------------------------------------------------------
// Winter: Standard style repainted as a snowy piste map (white land, blue-grey shadows, contours).
// Satellite: real imagery on the same terrain.
const LOOKS = {
  winter: {
    label: 'Winter map', style: 'mapbox://styles/mapbox/standard',
    // Greenspace close to the snow tone: forest edges stop drawing a hard line; valley-tint adds the green.
    config: { theme: 'faded', colorLand: '#f4f7fb', colorGreenspace: '#e6ede8', colorWater: '#9cc3e6',
      show3dObjects: true, showPointOfInterestLabels: false, showTransitLabels: false, showRoadLabels: false,
      showPlaceLabels: false },
    shade: { 'hillshade-exaggeration': 0.85, 'hillshade-shadow-color': '#3b5578',
      'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#22324a' },
    valleyTint: true,
    contour: { minor: 'rgba(70, 92, 124, 0.26)', major: 'rgba(70, 92, 124, 0.55)', text: '#34465f', halo: '#ffffff' },
    label: { text: '#1d2836', halo: '#ffffff', peak: '#34465f' },
    fog: { range: [0.5, 8], color: '#e6eef6', 'high-color': '#86abd8', 'horizon-blend': 0.12,
      'space-color': '#bcd2ec', 'star-intensity': 0 },
  },
  satellite: {
    label: 'Satellite', style: 'mapbox://styles/mapbox/standard-satellite',
    config: { showPointOfInterestLabels: false, showTransitLabels: false, showRoadLabels: false, showPlaceLabels: false },
    shade: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#1f3350',
      'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#16243a' },
    valleyTint: false,                                  // imagery already has real valley colours
    contour: { minor: 'rgba(255, 255, 255, 0.2)', major: 'rgba(255, 255, 255, 0.45)', text: '#ffffff', halo: 'rgba(14, 22, 34, 0.85)' },
    label: { text: '#ffffff', halo: 'rgba(14, 22, 34, 0.9)', peak: '#ffffff' },
    fog: { range: [0.6, 9], color: '#dbe5f0', 'high-color': '#6f9bd2', 'horizon-blend': 0.1,
      'space-color': '#b5cdea', 'star-intensity': 0 },
  },
};

// Sun from the south-south-west: north-facing slopes fall into cool shadow, sunny ridges go white.
const SUN_AZIMUTH = 205;
const DAY_LIGHTS = [
  { id: 'ambient', type: 'ambient', properties: { color: '#d3dff0', intensity: 0.5 } },
  { id: 'sun', type: 'directional', properties: { direction: [SUN_AZIMUTH, 42], color: '#fff6e8', intensity: 0.7,
    'cast-shadows': true, 'shadow-intensity': 0.75 } },
];
const FONT = { medium: ['DIN Pro Medium', 'Arial Unicode MS Regular'], bold: ['DIN Pro Bold', 'Arial Unicode MS Bold'] };

// --- UI state -----------------------------------------------------------------------------------
const $ = (s) => document.querySelector(s);
let statusTimer;
const status = (t, ms) => {
  clearTimeout(statusTimer);
  $('#status').textContent = t ?? '';
  if (ms) statusTimer = setTimeout(() => { $('#status').textContent = ''; }, ms);
};
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
let is3D = true;
let look = LOOKS[store.get('map-look')] ? store.get('map-look') : 'winter';
const presets = ['day', 'dusk', 'night', 'dawn'];
let preset = 0;

const TOKEN_KEY = 'mapbox-token';
const params = new URLSearchParams(location.search);
// Order: ?token= in the link, then one the viewer pasted earlier, then the built-in token.
let token = params.get('token') || store.get(TOKEN_KEY) || MAPBOX_TOKEN || null;
if (params.get('token')) store.set(TOKEN_KEY, params.get('token'));
if (!token) {
  $('#token').classList.add('show');
  token = await new Promise((resolve) => $('#token form').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = new FormData(e.target).get('t').trim();
    store.set(TOKEN_KEY, t);
    $('#token').classList.remove('show');
    resolve(t);
  }));
}

const resorts = await (await fetch('../pipeline/resorts.json')).json();
for (const r of resorts) $('#resort').add(new Option(r.name, r.id));
let current = resorts.find((r) => r.id === params.get('resort')) ?? resorts[0];
$('#resort').value = current.id;

// --- Map ------------------------------------------------------------------------------------------
mapboxgl.accessToken = token;
const map = new mapboxgl.Map({
  container: 'map', style: LOOKS[look].style,
  center: [current.camera.lon, current.camera.lat], zoom: current.camera.zoom,
  bearing: current.camera.bearing, pitch: PITCH_3D, maxPitch: 85, hash: false,
  config: { basemap: { lightPreset: 'day', ...LOOKS[look].config } },
});
map.on('error', (e) => {
  const msg = e.error?.message ?? String(e.error);
  console.warn(msg);
  if (/401|access token/i.test(msg)) {
    store.del(TOKEN_KEY);
    status('Mapbox rejected the token. Reload the page and paste a valid pk. token.');
  }
});

// Standard-style settings; a property this style version doesn't know is skipped, not fatal.
const setBasemap = (key, value) => { try { map.setConfigProperty('basemap', key, value); } catch (e) { console.warn(e.message); } };
const setLayout = (id, k, v) => { if (map.getLayer(id)) map.setLayoutProperty(id, k, v); };
const empty = { type: 'FeatureCollection', features: [] };
const downhill = ['==', ['get', 'piste:type'], 'downhill'];
const unknown = ['==', ['get', 'piste:difficulty'], 'unknown'];
const zOffset = ['interpolate', ['linear'], ['line-progress'],
  ...Array.from({ length: NSTOPS }, (_, k) => [k / (NSTOPS - 1), ['*', EXAGGERATION, ['get', `z${k}`]]]).flat()];
const elevated = { 'line-elevation-reference': 'ground', 'line-z-offset': zOffset };
let cablesOK = false;

/** Everything we add on top of Mapbox's style. Runs again after every style switch. */
function setup() {
  const L = LOOKS[look];
  for (const [k, v] of Object.entries(L.config)) setBasemap(k, v);
  setBasemap('lightPreset', presets[preset]);

  // Terrain + relief shading (own DEM source: sharing one halves the shading resolution).
  map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
  if (is3D) map.setTerrain({ source: 'mapbox-dem', exaggeration: EXAGGERATION });
  map.addSource('mapbox-dem-shade', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
  // Valley tint: green below ~1100 m fading through grey-green to nothing by ~2200 m, so valleys
  // blend into the snow line instead of meeting it at a hard landcover edge.
  if (L.valleyTint) {
    map.addSource('dem-rgb', { type: 'raster', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512 });
    map.addLayer({ id: 'valley-tint', type: 'raster', source: 'dem-rgb', slot: 'bottom', paint: {
      'raster-color-mix': [6553.6, 25.6, 0.1, -10000],          // decode terrain-RGB to metres
      'raster-color-range': [0, 4000],
      'raster-color': ['interpolate', ['linear'], ['raster-value'],
        500, 'rgba(104, 138, 96, 0.34)', 1100, 'rgba(124, 152, 114, 0.26)', 1500, 'rgba(166, 184, 160, 0.15)',
        1900, 'rgba(226, 233, 234, 0.05)', 2200, 'rgba(255, 255, 255, 0)'],
      'raster-resampling': 'linear', 'raster-fade-duration': 0 } });
  }
  map.addLayer({ id: 'relief', type: 'hillshade', source: 'mapbox-dem-shade', slot: 'bottom',
    paint: { ...L.shade, 'hillshade-illumination-anchor': 'map', 'hillshade-illumination-direction': SUN_AZIMUTH } });
  applyFog();

  // Elevation contours: thin every 50 m, stronger every 200 m with height labels.
  map.addSource('contours', { type: 'vector', url: 'mapbox://mapbox.mapbox-terrain-v2' });
  const major = ['==', ['%', ['get', 'ele'], 200], 0];
  map.addLayer({ id: 'contours-minor', type: 'line', source: 'contours', 'source-layer': 'contour', slot: 'bottom', minzoom: 12,
    filter: ['all', ['==', ['%', ['get', 'ele'], 50], 0], ['!', major]],
    paint: { 'line-color': L.contour.minor, 'line-width': 0.6 } });
  map.addLayer({ id: 'contours-major', type: 'line', source: 'contours', 'source-layer': 'contour', slot: 'bottom', minzoom: 11,
    filter: major, paint: { 'line-color': L.contour.major, 'line-width': byZoom(0.7, 1.3) } });
  map.addLayer({ id: 'contours-label', type: 'symbol', source: 'contours', 'source-layer': 'contour', slot: 'middle', minzoom: 13,
    filter: major,
    layout: { 'symbol-placement': 'line', 'text-field': ['concat', ['to-string', ['get', 'ele']], ' m'],
      'text-size': 10.5, 'text-font': FONT.medium, 'text-pitch-alignment': 'map', 'text-rotation-alignment': 'map',
      'symbol-spacing': 500, 'text-padding': 4 },
    paint: { 'text-color': L.contour.text, 'text-halo-color': L.contour.halo, 'text-halo-width': 2, 'text-halo-blur': 0.2 } });

  // Peaks and villages, redrawn from Mapbox Streets with strong halos (the basemap's own place
  // labels are switched off above, since their halos can't be restyled from outside the style).
  map.addSource('streets', { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' });
  map.addLayer({ id: 'peak-labels', type: 'symbol', source: 'streets', 'source-layer': 'natural_label', slot: 'top', minzoom: 10.5,
    filter: ['match', ['get', 'maki'], ['mountain', 'volcano'], true, false],
    layout: { 'text-field': ['format', '▲ ', { 'font-scale': 0.7 }, ['get', 'name'], {},
        ['case', ['has', 'elevation_m'], ['concat', '\n', ['to-string', ['get', 'elevation_m']], ' m'], ''], { 'font-scale': 0.82 }],
      'text-font': FONT.medium, 'text-size': byZoom(11, 13), 'text-anchor': 'bottom', 'text-padding': 6,
      'symbol-sort-key': ['-', ['coalesce', ['get', 'elevation_m'], 0]] },
    paint: { 'text-color': L.label.peak, 'text-halo-color': L.label.halo, 'text-halo-width': 2.2, 'text-halo-blur': 0.2,
      'text-emissive-strength': 1 } });
  map.addLayer({ id: 'place-labels', type: 'symbol', source: 'streets', 'source-layer': 'place_label', slot: 'top', minzoom: 9,
    filter: ['match', ['get', 'class'], ['settlement', 'settlement_subdivision'], true, false],
    layout: { 'text-field': ['get', 'name'], 'text-font': FONT.bold, 'text-padding': 6,
      'text-size': ['match', ['get', 'type'], ['city', 'town'], 16, 'village', 14, 12.5],
      'text-letter-spacing': 0.02, 'symbol-sort-key': ['coalesce', ['get', 'symbolrank'], 99] },
    paint: { 'text-color': L.label.text, 'text-halo-color': L.label.halo, 'text-halo-width': 2.4, 'text-halo-blur': 0.2,
      'text-emissive-strength': 1 } });

  // Data sources (refilled from the cache below).
  for (const id of DATA_LAYERS) {
    map.addSource(id, { type: 'geojson', data: cache.get(current.id)?.[id] ?? empty, ...(id === 'lift_spans' && { lineMetrics: true }) });
  }
  map.addSource('lift_terminals', { type: 'geojson', data: terminalsFrom(cache.get(current.id)?.lifts) });

  // Runs.
  map.addLayer({ id: 'piste-areas-fill', type: 'fill', source: 'piste_areas', slot: 'middle',
    paint: { 'fill-color': colorExpr, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.06, 15, 0.14] } });
  map.addLayer({ id: 'pistes-casing', type: 'line', source: 'pistes', slot: 'top', filter: downhill,
    layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'rank'] },
    paint: { 'line-color': '#ffffff', 'line-opacity': 1, 'line-width': CASING_W, 'line-blur': 0, 'line-emissive-strength': 1 } });
  map.addLayer({ id: 'pistes-line', type: 'line', source: 'pistes', slot: 'top', filter: ['all', downhill, ['!', unknown]],
    layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'rank'] },
    paint: { 'line-color': colorExpr, 'line-width': LINE_W, 'line-emissive-strength': 1 } });
  map.addLayer({ id: 'pistes-unknown', type: 'line', source: 'pistes', slot: 'top', filter: ['all', downhill, unknown],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': DIFF.unknown[0], 'line-width': LINE_W, 'line-dasharray': [1.5, 1], 'line-emissive-strength': 1 } });

  // Lifts: thin charcoal on the ground and in the air; the selected lift gets a bright glow
  // (lift-selected-glow on the ground for 2D, lifts-cable-glow in the air for 3D).
  map.addLayer({ id: 'lift-selected-glow', type: 'line', source: 'lifts', slot: 'top', filter: NO_MATCH,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': LIFT.select, 'line-width': byZoom(8, 16), 'line-blur': byZoom(3, 6), 'line-opacity': 0.9,
      'line-emissive-strength': 1 } });
  map.addLayer({ id: 'lifts-line', type: 'line', source: 'lifts', slot: 'top',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': LIFT.shadow, 'line-dasharray': [2, 1.2], 'line-emissive-strength': 1 } });
  map.addLayer({ id: 'lifts-cable-glow', type: 'line', source: 'lift_spans', slot: 'top', filter: NO_MATCH,
    layout: { 'line-cap': 'round', 'line-join': 'round', ...elevated },
    paint: { 'line-color': LIFT.select, 'line-width': byZoom(8, 16), 'line-blur': byZoom(3, 6), 'line-opacity': 0.9,
      'line-emissive-strength': 1 } });
  map.addLayer({ id: 'lifts-cable', type: 'line', source: 'lift_spans', slot: 'top',
    layout: { 'line-cap': 'round', 'line-join': 'round', ...elevated },
    paint: { 'line-emissive-strength': 1 } });
  map.addLayer({ id: 'lift-terminals', type: 'circle', source: 'lift_terminals', slot: 'top', minzoom: 11.5,
    paint: { 'circle-radius': byZoom(2, 4.5), 'circle-color': LIFT.terminal, 'circle-stroke-color': LIFT.cable,
      'circle-stroke-width': byZoom(1.2, 1.8), 'circle-pitch-alignment': 'viewport', 'circle-emissive-strength': 1 } });
  // Mapbox GL skips (doesn't throw on) a layer it can't validate, so check it really exists.
  cablesOK = Boolean(map.getLayer('lifts-cable'));
  if (!cablesOK) console.warn('Elevated lines unavailable in this Mapbox GL version; lifts stay on the ground');

  // Pylons (mast + crossarm), stations (walls + roof) and cabins: 3D boxes on the terrain.
  const ex = (prop) => ['*', EXAGGERATION, ['get', prop]];
  map.addLayer({ id: 'lift-structures', type: 'fill-extrusion', source: 'structures', slot: 'top', minzoom: 12.5,
    paint: { 'fill-extrusion-base': ex('base'), 'fill-extrusion-height': ex('height'),
      'fill-extrusion-color': ['match', ['get', 'part'], 'mast', LIFT.mast, 'arm', LIFT.arm, 'roof', LIFT.roof, LIFT.wall],
      'fill-extrusion-vertical-gradient': true, 'fill-extrusion-ambient-occlusion-intensity': 0.35,
      'fill-extrusion-opacity': 1 } });
  map.addLayer({ id: 'lift-cabins', type: 'fill-extrusion', source: 'cabins', slot: 'top', minzoom: 13,
    paint: { 'fill-extrusion-base': ex('base'), 'fill-extrusion-height': ex('height'),
      'fill-extrusion-color': ['match', ['get', 'lift'], 'chair_lift', LIFT.chair, LIFT.cabin],
      'fill-extrusion-emissive-strength': 0.4, 'fill-extrusion-opacity': 1 } });

  // Labels: run number badges, then lift name with its type underneath.
  map.addLayer({ id: 'pistes-label', type: 'symbol', source: 'pistes', slot: 'top', filter: downhill, minzoom: 12.5,
    layout: { 'symbol-placement': 'line', 'symbol-spacing': 420, 'text-pitch-alignment': 'viewport', 'text-keep-upright': true,
      'text-size': byZoom(11, 14), 'text-font': FONT.bold, 'text-max-angle': 30,
      // Wide collision padding at medium zoom keeps number shields apart; it relaxes when zoomed in.
      'text-padding': ['interpolate', ['linear'], ['zoom'], 12.5, 12, 15, 4],
      'symbol-sort-key': ['-', ['coalesce', ['get', 'rank'], 0]],
      'text-field': ['step', ['zoom'], ['coalesce', ['get', 'ref'], ''], 14.5, ['coalesce', ['get', 'name'], ['get', 'ref'], '']] },
    paint: { 'text-color': '#ffffff', 'text-halo-color': colorExpr, 'text-halo-width': 3, 'text-halo-blur': 0, 'text-emissive-strength': 1 } });
  map.addLayer({ id: 'lifts-label', type: 'symbol', source: 'lifts', slot: 'top', minzoom: 13,
    filter: ['has', 'name'],
    layout: { 'symbol-placement': 'line-center', 'text-pitch-alignment': 'viewport', 'text-keep-upright': true,
      'text-field': ['format', ['get', 'name'], { 'font-scale': 1 }, '\n', {}, liftLabelExpr, { 'font-scale': 0.78 }],
      'text-size': byZoom(11, 13.5), 'text-font': FONT.medium, 'text-letter-spacing': 0.02, 'text-offset': [0, -1.2],
      'text-padding': 6 },
    paint: { 'text-color': LIFT.cable, 'text-halo-color': '#ffffff', 'text-halo-width': 2.2, 'text-emissive-strength': 1 } });

  apply3D(false);
  applySelection();
}

/** Fog fades distant peaks into the horizon; in daylight a low SSW sun adds cool shadows on 3D objects. */
function applyFog() {
  const day = presets[preset] === 'day';
  try { map.setFog(day ? LOOKS[look].fog : null); } catch (e) { console.warn(e.message); }
  try { map.setLights(day ? DAY_LIGHTS : null); } catch (e) { console.warn(e.message); }
}

// --- Lift selection -----------------------------------------------------------------------------
function terminalsFrom(lifts) {
  const features = (lifts?.features ?? []).filter((f) => f.geometry.type === 'LineString').flatMap((f) =>
    [f.geometry.coordinates[0], f.geometry.coordinates.at(-1)].map((c) => ({ type: 'Feature',
      geometry: { type: 'Point', coordinates: c }, properties: { name: f.properties.name ?? null, aerialway: f.properties.aerialway } })));
  return { type: 'FeatureCollection', features };
}

/** Highlight the selected lift and dim the rest; with no selection (or not in this resort) all lifts look equal. */
function applySelection() {
  if (!map.getLayer('lifts-cable')) return;
  const names = new Set((cache.get(current.id)?.lifts.features ?? []).map((f) => (f.properties.name ?? '').toLowerCase()));
  const active = Boolean(selectedLift) && names.has(selectedLift.toLowerCase());
  const sel = ['==', nameKey, active ? selectedLift.toLowerCase() : '\u0000'];
  const pick = (on, off) => (active ? ['case', sel, on, off] : off);
  const groundBase = ['match', ['get', 'aerialway'], GROUND_LIFTS, 1, is3D && cablesOK ? SHADOW : 1];
  map.setFilter('lift-selected-glow', active && (!is3D || !cablesOK) ? sel : NO_MATCH);
  map.setFilter('lifts-cable-glow', active ? sel : NO_MATCH);
  map.setPaintProperty('lifts-cable', 'line-color', pick(LIFT.selectCore, LIFT.cable));
  map.setPaintProperty('lifts-cable', 'line-width', ['interpolate', ['linear'], ['zoom'], 11, pick(2.2, 0.9), 16, pick(4, 2)]);
  map.setPaintProperty('lifts-cable', 'line-opacity', pick(1, active ? DIM : 1));
  map.setPaintProperty('lifts-line', 'line-color', pick(LIFT.selectCore, LIFT.shadow));
  map.setPaintProperty('lifts-line', 'line-width', ['interpolate', ['linear'], ['zoom'], 11, pick(2.4, 0.9), 16, pick(4.5, 2)]);
  map.setPaintProperty('lifts-line', 'line-opacity', active ? ['case', sel, is3D && cablesOK ? 0.5 : 1, ['*', DIM, groundBase]] : groundBase);
  map.setPaintProperty('lift-terminals', 'circle-opacity', pick(1, active ? DIM : 1));
  map.setPaintProperty('lift-terminals', 'circle-stroke-opacity', pick(1, active ? DIM : 1));
  map.setPaintProperty('lift-terminals', 'circle-stroke-color', pick(LIFT.select, LIFT.cable));
  map.setPaintProperty('lifts-label', 'text-opacity', pick(1, active ? 0.55 : 1));
}

function apply3D(animate) {
  map.setTerrain(is3D ? { source: 'mapbox-dem', exaggeration: EXAGGERATION } : null);
  setBasemap('show3dObjects', is3D);
  for (const id of ['lift-structures', 'lift-cabins', 'lifts-cable', 'lifts-cable-glow']) setLayout(id, 'visibility', is3D ? 'visible' : 'none');
  applySelection();
  $('#orbit').hidden = !is3D;
  $('#toggle3d').textContent = is3D ? '2D' : '3D';
  $('#toggle3d').setAttribute('aria-label', is3D ? 'Switch to flat 2D map' : 'Switch to 3D map');
  if (animate) map.easeTo({ pitch: is3D ? PITCH_3D : 0, duration: 800 });
}

// --- Data: bundled pipeline output if present, otherwise live from OSM -------------------------
const cache = new Map();
async function loadResortData(r) {
  if (cache.has(r.id)) return cache.get(r.id);
  const layers = {};
  const bundled = await Promise.all(DATA_LAYERS.map((n) =>
    fetch(`../data/${r.id}/${n}.geojson`).then((res) => (res.ok ? res.json() : null)).catch(() => null)));
  if (bundled.slice(0, 4).every(Boolean)) {
    DATA_LAYERS.forEach((n, i) => { layers[n] = bundled[i] ?? empty; });
    if (!bundled[5] && layers.lift_spans.features.length) layers.cabins = buildCabins(layers.lift_spans);
  } else {
    status(`Loading ${r.name} runs and lifts from OpenStreetMap… (20–60 s)`);
    const res = await fetch(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: overpassQuery(r.bbox) }) });
    if (!res.ok) throw new Error(`OpenStreetMap is busy (error ${res.status}). Pick the resort again in a minute.`);
    Object.assign(layers, convert(await res.json()));
    status(`Measuring the ground under ${layers.lifts.features.length} lifts…`);
    layers.lift_spans = await buildCableSpans(layers.lifts, elevationAt);
    layers.cabins = buildCabins(layers.lift_spans);
  }
  cache.set(r.id, layers);
  return layers;
}

async function showResort(r, fly = true) {
  current = r;
  renderLegend(r);
  $('#card').classList.remove('show');
  if (fly) map.flyTo({ center: [r.camera.lon, r.camera.lat], zoom: r.camera.zoom, bearing: r.camera.bearing,
    pitch: is3D ? PITCH_3D : 0, duration: 2500, essential: true });
  try {
    const layers = await loadResortData(r);
    if (current !== r) return;                    // the viewer picked another resort meanwhile
    for (const id of DATA_LAYERS) map.getSource(id)?.setData(layers[id] ?? empty);
    map.getSource('lift_terminals')?.setData(terminalsFrom(layers.lifts));
    applySelection();
    const runs = layers.pistes.features.filter((f) => f.properties['piste:type'] === 'downhill').length;
    status(`${r.name}: ${runs} runs, ${layers.lifts.features.length} lifts`, 3500);
  } catch (e) {
    status(e.message);
  }
}

function renderLegend(r) {
  const runs = legendFor(r.country).map((k) => `<span><i style="background:${DIFF[k][0]}"></i>${DIFF[k][1]}</span>`).join('');
  $('#legend').innerHTML = `<div>${runs}</div><div class="lifts"><span><i class="cable"></i>Lift</span>`
    + `<span><b style="background:${LIFT.cabin}"></b>Gondola</span><span><b style="background:${LIFT.chair}"></b>Chair</span></div>`;
}

// --- Orbit: drag the dial (or scroll sideways) to turn the mountain ------------------------------
const PX_PER_DEG = 3;
const dial = $('#orbit'), strip = $('#orbit-strip');
(function buildDial() {
  const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  let html = '';
  for (let d = -360; d <= 720; d += 5) {
    const n = ((d % 360) + 360) % 360;
    const cls = n % 45 === 0 ? 'big' : n % 15 === 0 ? 'mid' : '';
    html += `<span class="${cls}" style="left:${(d + 360) * PX_PER_DEG}px">${names[n] && d % 45 === 0 ? `<em>${names[n]}</em>` : ''}</span>`;
  }
  strip.innerHTML = html;
})();
function syncDial() {
  const b = ((map.getBearing() % 360) + 360) % 360;
  strip.style.transform = `translateX(${dial.clientWidth / 2 - (b + 360) * PX_PER_DEG}px)`;
  dial.setAttribute('aria-valuenow', String(Math.round(b)));
}
map.on('rotate', syncDial);
addEventListener('resize', syncDial);

let spin = null;                                  // auto-orbit animation frame
let glide = null;                                 // momentum after a flick
const stopMotion = () => {
  if (spin) { cancelAnimationFrame(spin); spin = null; $('#orbit-play').setAttribute('aria-pressed', 'false'); }
  if (glide) { cancelAnimationFrame(glide); glide = null; }
};
const turn = (deg) => map.setBearing(map.getBearing() + deg);

let drag = null;
dial.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#orbit-play')) return;
  stopMotion();
  dial.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, t: performance.now(), v: 0 };
});
dial.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, now = performance.now();
  turn(-dx / PX_PER_DEG);                         // the strip follows the finger
  drag.v = (-dx / PX_PER_DEG) / Math.max(1, now - drag.t);
  drag.x = e.clientX; drag.t = now;
});
const endDrag = () => {
  if (!drag) return;
  let v = drag.v * 16;                            // degrees per frame
  drag = null;
  const step = () => {
    if (Math.abs(v) < 0.05) { glide = null; return; }
    turn(v); v *= 0.93;
    glide = requestAnimationFrame(step);
  };
  glide = requestAnimationFrame(step);
};
dial.addEventListener('pointerup', endDrag);
dial.addEventListener('pointercancel', endDrag);
dial.addEventListener('wheel', (e) => { e.preventDefault(); stopMotion(); turn((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.25); }, { passive: false });
dial.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); stopMotion(); map.easeTo({ bearing: map.getBearing() + (e.key === 'ArrowRight' ? 15 : -15), duration: 300 }); }
});
// Sideways scroll on a trackpad or mouse over the map itself also turns the view in 3D.
map.getCanvasContainer().addEventListener('wheel', (e) => {
  if (!is3D || Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 2) return;
  e.preventDefault(); e.stopPropagation(); stopMotion();
  turn(e.deltaX * 0.25);
}, { capture: true, passive: false });

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
$('#orbit-play').addEventListener('click', () => {
  if (spin) { stopMotion(); return; }
  stopMotion();
  $('#orbit-play').setAttribute('aria-pressed', 'true');
  let last = performance.now();
  const step = (now) => { turn(((now - last) / 1000) * (reduceMotion ? 3 : 8)); last = now; spin = requestAnimationFrame(step); };
  spin = requestAnimationFrame(step);
});
map.on('dragstart', stopMotion);
map.on('touchstart', () => { if (spin) stopMotion(); });

// --- Controls -----------------------------------------------------------------------------------
$('#resort').addEventListener('change', (e) => {
  const r = resorts.find((x) => x.id === e.target.value);
  history.replaceState(null, '', `?resort=${r.id}`);
  stopMotion();
  showResort(r);
});
$('#toggle3d').addEventListener('click', () => { is3D = !is3D; if (!is3D) stopMotion(); apply3D(true); syncDial(); });
$('#light').addEventListener('click', () => {
  preset = (preset + 1) % presets.length;
  setBasemap('lightPreset', presets[preset]);
  applyFog();
  $('#light').textContent = { day: '☀︎', dusk: '◐', night: '☾', dawn: '◑' }[presets[preset]];
  status(`Lighting: ${presets[preset]}`, 1200);
});
$('#look').addEventListener('click', () => {
  look = look === 'winter' ? 'satellite' : 'winter';
  store.set('map-look', look);
  $('#look').setAttribute('aria-label', `Map style: ${LOOKS[look].label}. Switch style`);
  status(LOOKS[look].label, 1200);
  map.setStyle(LOOKS[look].style, { config: { basemap: { lightPreset: presets[preset], ...LOOKS[look].config } } });
});
let markReady;
const ready = new Promise((r) => { markReady = r; });
map.on('style.load', () => { setup(); syncDial(); markReady(); });

// Tap a run, lift, cabin or station → card (mirrors featureCard in ResortBrowserView.swift).
map.on('click', (e) => {
  const layers = ['pistes-line', 'pistes-unknown', 'lifts-cable', 'lifts-line', 'lift-cabins', 'lift-structures'].filter((l) => map.getLayer(l));
  const pad = 10;
  const f = map.queryRenderedFeatures([[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]], { layers })[0];
  if (!f) { $('#card').classList.remove('show'); return; }
  const p = f.properties;
  const d = DIFF[p['piste:difficulty']];
  const liftType = LIFT_NAMES[p.aerialway ?? p.lift];
  const seats = p['aerialway:occupancy'] ? `${p['aerialway:occupancy']} seats` : '';
  const title = p.name ?? p.ref ?? { pylon: 'Lift tower', cabin: liftType ?? 'Cabin', station: 'Lift station' }[p.kind] ?? 'Unnamed';
  const detail = d ? `${d[1]} run${p.ref ? ` · No. ${p.ref}` : ''}`
    : [p.kind === 'station' ? 'Station' : null, liftType, seats].filter(Boolean).join(' · ');
  $('#card b').textContent = title;
  $('#card small').textContent = detail;
  $('#card .dot').style.background = d ? d[0] : (p.lift === 'chair_lift' ? LIFT.chair : LIFT.cabin);
  $('#card').classList.add('show');
  if (liftType && p.name) { selectedLift = p.name; applySelection(); }
});
$('#card button').addEventListener('click', () => {
  $('#card').classList.remove('show');
  selectedLift = null;
  applySelection();
});

await ready;
showResort(current, false);
window.__preview = {                                    // handy in the console
  map, resorts, get cablesOK() { return cablesOK; },
  selectLift(name) { selectedLift = name; applySelection(); },
};
