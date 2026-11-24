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
// Regional run-colour conventions. Each scheme maps an OSM difficulty to a colour name and gives
// the legend in the order and words skiers there know.
const SCHEMES = {
  // Europe: blue easy, red intermediate, black difficult (France and Spain add green for beginners).
  eu: { colors: { novice: 'green', easy: 'blue', intermediate: 'red', advanced: 'black', expert: 'black', freeride: 'orange' },
    legend: [['easy', 'Easy'], ['intermediate', 'Intermediate'], ['advanced', 'Difficult'], ['freeride', 'Freeride']],
    legendGreen: [['novice', 'Beginner'], ['easy', 'Easy'], ['intermediate', 'Intermediate'], ['advanced', 'Difficult']] },
  // North America and Oceania: green circle, blue square, black diamond, double black.
  na: { colors: { novice: 'green', easy: 'green', intermediate: 'blue', advanced: 'black', expert: 'black', freeride: 'orange' },
    legend: [['easy', 'Easiest'], ['intermediate', 'More difficult'], ['advanced', 'Most difficult'], ['expert', 'Experts only']] },
  // Japan, Korea, China: green beginner, red intermediate, black advanced.
  asia: { colors: { novice: 'green', easy: 'green', intermediate: 'red', advanced: 'black', expert: 'black', freeride: 'orange' },
    legend: [['easy', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']] },
};
const schemeFor = (country) => (['US', 'CA', 'AU', 'NZ'].includes(country) ? 'na'
  : ['JP', 'KR', 'CN'].includes(country) ? 'asia' : 'eu');
const legendFor = (country) => {
  const sc = SCHEMES[schemeFor(country)];
  return (['FR', 'ES'].includes(country) && sc.legendGreen) || sc.legend;
};
const runLabel = (country, difficulty) =>
  legendFor(country).find(([k]) => k === difficulty)?.[1] ?? DIFF[difficulty]?.[1] ?? 'Run';
// Run colours: the look's palette (a look can brighten it) mapped through the resort's regional scheme.
const RUN_BASE = Object.fromEntries(Object.entries(DIFF).map(([k, [c]]) => [k, c]));
let RUN = RUN_BASE;
function computeRun(L, country) {
  const base = { ...RUN_BASE, ...(L.runs ?? {}) };
  const named = { green: base.novice, blue: base.easy, red: base.intermediate, black: base.advanced, orange: base.freeride };
  const scheme = SCHEMES[schemeFor(country)].colors;
  return { ...Object.fromEntries(Object.entries(scheme).map(([k, c]) => [k, named[c]])), unknown: base.unknown };
}
const runColor = () => ['match', ['get', 'piste:difficulty'],
  ...Object.entries(RUN).filter(([k]) => k !== 'unknown').flat(), RUN.unknown];
const widthExpr = (stops) => ['interpolate', ['exponential', 1.4], ['zoom'], ...stops.flat()];
const LINE_W = widthExpr([[10, 1.8], [12, 3], [14, 5], [16, 7.5]]);
// Casing = line + ~2.6 px: a crisp white gap between parallel runs so colours never bleed together.
const CASING_W = widthExpr([[10, 3.6], [12, 5.4], [14, 7.8], [16, 10.8]]);
// Playful look: chunkier, rounder runs with a thicker white outline.
const LINE_W_CHUNKY = widthExpr([[10, 2.6], [12, 4.2], [14, 6.8], [16, 10]]);
const CASING_W_CHUNKY = widthExpr([[10, 5.4], [12, 7.6], [14, 11], [16, 15]]);
const byZoom = (a, b) => ['interpolate', ['linear'], ['zoom'], 11, a, 16, b];

// --- Lifts -----------------------------------------------------------------------------------
const LIFT_NAMES = {
  cable_car: 'Cable car', gondola: 'Gondola', mixed_lift: 'Combined lift', chair_lift: 'Chairlift',
  drag_lift: 'Drag lift', t_bar: 'T-bar', j_bar: 'J-bar', platter: 'Button lift', rope_tow: 'Rope tow',
  magic_carpet: 'Magic carpet', zip_line: 'Zip line',
};
const LIFT_BASE = {
  cable: '#2b313b', shadow: '#3a414c',                 // thin charcoal for every unselected lift
  select: '#38bdf8', selectCore: '#ffffff',             // glow + core of the selected lift
  terminal: '#ffffff',
  mast: '#727d8c', arm: '#3c4552', wall: '#efe9dd', roof: '#8e2f29',
  cabin: '#d42a2f', chair: '#2b323c',
};
let LIFT = LIFT_BASE;
const liftLabelExpr = ['match', ['get', 'aerialway'], ...Object.entries(LIFT_NAMES).flat(), 'Lift'];
const NO_MATCH = ['boolean', false];               // filter that hides a layer until a lift is selected
const DIM = 0.4;                                        // opacity of unselected lifts while one is selected
let selectedLift = 'Valfagehrbahn';                     // tap another lift to change, × on the card clears
const nameKey = ['downcase', ['coalesce', ['get', 'name'], '']];

// --- Map looks ---------------------------------------------------------------------------------
// Winter: Standard style repainted as a snowy piste map (white land, blue-grey shadows, contours).
// Satellite: real imagery on the same terrain.
const LOOKS = {
  // Playful: bright, saturated, cartoon-like map with a vivid sky, soft periwinkle shading,
  // chunky runs and white bubble labels.
  playful: {
    label: 'Playful', style: 'mapbox://styles/mapbox/standard',
    config: { theme: 'default', colorLand: '#f5f9ff', colorGreenspace: '#c4ebb2', colorWater: '#3fb8ff',
      colorRoads: '#ffffff', colorTrunks: '#ffe08a', colorMotorways: '#ffc94d', colorBuildings: '#ffffff',
      show3dObjects: true, showPointOfInterestLabels: false, showTransitLabels: false, showRoadLabels: false,
      showPlaceLabels: false },
    shade: { 'hillshade-exaggeration': 0.6, 'hillshade-shadow-color': '#7b86e0',
      'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#5b5fc7' },
    valleyTint: [500, 'rgba(110, 214, 96, 0.5)', 1100, 'rgba(146, 222, 120, 0.36)', 1500, 'rgba(196, 236, 180, 0.18)',
      1900, 'rgba(236, 246, 255, 0.05)', 2200, 'rgba(255, 255, 255, 0)'],
    contour: { minor: 'rgba(110, 118, 210, 0.16)', major: 'rgba(110, 118, 210, 0.32)', text: '#5b5fc7', halo: '#ffffff' },
    labels: { text: '#1f2340', halo: '#ffffff', peak: '#3d47b8' },
    fog: { range: [0.8, 10], color: '#ffffff', 'high-color': '#4fb3ff', 'horizon-blend': 0.2,
      'space-color': '#7fcbff', 'star-intensity': 0 },
    lights: [
      { id: 'ambient', type: 'ambient', properties: { color: '#eef2ff', intensity: 0.7 } },
      { id: 'sun', type: 'directional', properties: { direction: [205, 40], color: '#fff1d0', intensity: 0.55,
        'cast-shadows': true, 'shadow-intensity': 0.45 } },
    ],
    runs: { novice: '#1fcf6b', easy: '#2b8bff', intermediate: '#ff3d5f', advanced: '#24263f', expert: '#24263f',
      freeride: '#ff9a1f', unknown: '#9aa0b8' },
    lift: { cable: '#24263f', shadow: '#5a5f86', cabin: '#ff4d6d', chair: '#3b3f6b', roof: '#ff8a3d', wall: '#ffffff',
      mast: '#8c93b8', arm: '#4a4f7a', select: '#ffcf33' },
    chunky: true, bubbles: true,
  },
  winter: {
    label: 'Winter map', style: 'mapbox://styles/mapbox/standard',
    // Greenspace close to the snow tone: forest edges stop drawing a hard line; valley-tint adds the green.
    config: { theme: 'faded', colorLand: '#f4f7fb', colorGreenspace: '#e6ede8', colorWater: '#9cc3e6',
      show3dObjects: true, showPointOfInterestLabels: false, showTransitLabels: false, showRoadLabels: false,
      showPlaceLabels: false },
    shade: { 'hillshade-exaggeration': 0.85, 'hillshade-shadow-color': '#3b5578',
      'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#22324a' },
    valleyTint: [500, 'rgba(104, 138, 96, 0.34)', 1100, 'rgba(124, 152, 114, 0.26)', 1500, 'rgba(166, 184, 160, 0.15)',
      1900, 'rgba(226, 233, 234, 0.05)', 2200, 'rgba(255, 255, 255, 0)'],
    contour: { minor: 'rgba(70, 92, 124, 0.26)', major: 'rgba(70, 92, 124, 0.55)', text: '#34465f', halo: '#ffffff' },
    labels: { text: '#1d2836', halo: '#ffffff', peak: '#34465f' },
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
    labels: { text: '#ffffff', halo: 'rgba(14, 22, 34, 0.9)', peak: '#ffffff' },
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
const LOOK_ORDER = ['playful', 'winter', 'satellite'];
let look = LOOKS[store.get('map-look')] ? store.get('map-look') : 'playful';
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
let current = resorts.find((r) => r.id === params.get('resort')) ?? resorts[0];
$('#resort-q').value = current.name;
$('#resort-q').placeholder = `Search ${resorts.length} ski resorts`;

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
  RUN = computeRun(L, current.country);
  LIFT = { ...LIFT_BASE, ...(L.lift ?? {}) };
  addLabelImages();
  const lw = L.chunky ? LINE_W_CHUNKY : LINE_W, cw = L.chunky ? CASING_W_CHUNKY : CASING_W;
  // White bubble behind a label (Playful look), or a plain halo (other looks).
  const bubble = (img) => (L.bubbles
    ? { 'icon-image': img, 'icon-text-fit': 'both', 'icon-text-fit-padding': [4, 9, 4, 9],
        'icon-rotation-alignment': 'viewport', 'icon-pitch-alignment': 'viewport' } : {});
  const bubbleHalo = (width) => (L.bubbles ? { 'text-halo-width': 0 } : { 'text-halo-width': width });
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
      'raster-color': ['interpolate', ['linear'], ['raster-value'], ...L.valleyTint],
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
      'symbol-sort-key': ['-', ['coalesce', ['get', 'elevation_m'], 0]], ...bubble('bubble-peak') },
    paint: { 'text-color': L.labels.peak, 'text-halo-color': L.labels.halo, ...bubbleHalo(2.2), 'text-halo-blur': 0.2,
      'text-emissive-strength': 1, 'icon-emissive-strength': 1 } });
  map.addLayer({ id: 'place-labels', type: 'symbol', source: 'streets', 'source-layer': 'place_label', slot: 'top', minzoom: 9,
    filter: ['match', ['get', 'class'], ['settlement', 'settlement_subdivision'], true, false],
    layout: { 'text-field': ['get', 'name'], 'text-font': FONT.bold, 'text-padding': 6,
      'text-size': ['match', ['get', 'type'], ['city', 'town'], 16, 'village', 14, 12.5],
      'text-letter-spacing': 0.02, 'symbol-sort-key': ['coalesce', ['get', 'symbolrank'], 99], ...bubble('bubble') },
    paint: { 'text-color': L.labels.text, 'text-halo-color': L.labels.halo, ...bubbleHalo(2.4), 'text-halo-blur': 0.2,
      'text-emissive-strength': 1, 'icon-emissive-strength': 1 } });

  // Data sources (refilled from the cache below).
  for (const id of DATA_LAYERS) {
    map.addSource(id, { type: 'geojson', data: cache.get(current.id)?.[id] ?? empty, ...(id === 'lift_spans' && { lineMetrics: true }) });
  }
  map.addSource('lift_terminals', { type: 'geojson', data: terminalsFrom(cache.get(current.id)?.lifts) });

  // Every resort as a dot when zoomed out: big coral = tier 1 (2 M+ skier visits), blue = tier 2, grey = tier 3.
  map.addSource('all-resorts', { type: 'geojson', data: resortPoints });
  const fadeOut = (v) => ['interpolate', ['linear'], ['zoom'], 9, v, 10.5, 0];
  map.addLayer({ id: 'resort-dots', type: 'circle', source: 'all-resorts', slot: 'top', maxzoom: 10.5,
    layout: { 'circle-sort-key': ['-', 4, ['get', 'tier']] },
    paint: { 'circle-color': ['match', ['get', 'tier'], 1, TIER[1].color, 2, TIER[2].color, TIER[3].color],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, ['match', ['get', 'tier'], 1, 4.5, 2, 3.5, 2.5],
        8, ['match', ['get', 'tier'], 1, 9, 2, 7.5, 6]],
      'circle-stroke-color': '#ffffff', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 1, 1, 8, 2.5],
      'circle-opacity': fadeOut(1), 'circle-stroke-opacity': fadeOut(1), 'circle-emissive-strength': 1,
      'circle-pitch-alignment': 'viewport' } });
  map.addLayer({ id: 'resort-dot-labels', type: 'symbol', source: 'all-resorts', slot: 'top', maxzoom: 10.5,
    // Tier 1 names from zoom 3, tier 2 from 5, tier 3 from 6.5; the rest appear as space allows.
    filter: ['>=', ['zoom'], ['match', ['get', 'tier'], 1, 3, 2, 5, 6.5]],
    layout: { 'text-field': ['get', 'name'], 'text-font': FONT.bold, 'text-size': ['match', ['get', 'tier'], 1, 13, 2, 12, 11],
      'text-anchor': 'left', 'text-offset': [0.9, 0], 'text-padding': 4, 'text-optional': true,
      'symbol-sort-key': ['get', 'tier'], ...bubble('bubble') },
    paint: { 'text-color': L.labels.text, 'text-halo-color': L.labels.halo, ...bubbleHalo(2.2),
      'text-opacity': fadeOut(1), 'icon-opacity': fadeOut(1), 'text-emissive-strength': 1, 'icon-emissive-strength': 1 } });

  // Runs.
  map.addLayer({ id: 'piste-areas-fill', type: 'fill', source: 'piste_areas', slot: 'middle',
    paint: { 'fill-color': runColor(), 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.06, 15, 0.14] } });
  map.addLayer({ id: 'pistes-casing', type: 'line', source: 'pistes', slot: 'top', filter: downhill,
    layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'rank'] },
    paint: { 'line-color': '#ffffff', 'line-opacity': 1, 'line-width': cw, 'line-blur': 0, 'line-emissive-strength': 1 } });
  map.addLayer({ id: 'pistes-line', type: 'line', source: 'pistes', slot: 'top', filter: ['all', downhill, ['!', unknown]],
    layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'rank'] },
    paint: { 'line-color': runColor(), 'line-width': lw, 'line-emissive-strength': 1 } });
  map.addLayer({ id: 'pistes-unknown', type: 'line', source: 'pistes', slot: 'top', filter: ['all', downhill, unknown],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': DIFF.unknown[0], 'line-width': lw, 'line-dasharray': [1.5, 1], 'line-emissive-strength': 1 } });

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
  map.addLayer({ id: 'pistes-label', type: 'symbol', source: 'pistes', slot: 'top', minzoom: 12.5,
    filter: ['all', downhill, ['has', 'ref']],
    layout: { 'symbol-placement': 'line', 'symbol-spacing': 420, 'text-keep-upright': true,
      // Upright pill badge in the run's colour with the run number in white.
      'icon-image': ['concat', 'badge-', ['coalesce', ['get', 'piste:difficulty'], 'unknown']],
      'icon-text-fit': 'both', 'icon-text-fit-padding': [2, 6, 2, 6],
      'icon-rotation-alignment': 'viewport', 'icon-pitch-alignment': 'viewport',
      'text-rotation-alignment': 'viewport', 'text-pitch-alignment': 'viewport',
      'text-field': ['get', 'ref'], 'text-size': byZoom(11, 13.5), 'text-font': FONT.bold,
      // Wide collision padding at medium zoom keeps number shields apart; it relaxes when zoomed in.
      'text-padding': ['interpolate', ['linear'], ['zoom'], 12.5, 12, 15, 4],
      'symbol-sort-key': ['-', ['coalesce', ['get', 'rank'], 0]] },
    paint: { 'text-color': '#ffffff', 'text-emissive-strength': 1, 'icon-emissive-strength': 1 } });
  map.addLayer({ id: 'pistes-name', type: 'symbol', source: 'pistes', slot: 'top', minzoom: 14.5,
    filter: ['all', downhill, ['has', 'name']],
    layout: { 'symbol-placement': 'line', 'symbol-spacing': 500, 'text-field': ['get', 'name'], 'text-font': FONT.bold,
      'text-size': 12.5, 'text-offset': [0, 1.1], 'text-pitch-alignment': 'viewport', 'text-keep-upright': true,
      'text-padding': 6, 'text-max-angle': 30 },
    paint: { 'text-color': runColor(), 'text-halo-color': '#ffffff', 'text-halo-width': 2.4, 'text-emissive-strength': 1 } });
  map.addLayer({ id: 'lifts-label', type: 'symbol', source: 'lifts', slot: 'top', minzoom: 13,
    filter: ['has', 'name'],
    layout: { 'symbol-placement': 'line-center', 'text-pitch-alignment': 'viewport', 'text-keep-upright': true,
      'text-field': ['format', ['get', 'name'], { 'font-scale': 1 }, '\n', {}, liftLabelExpr, { 'font-scale': 0.78 }],
      'text-size': byZoom(11, 13.5), 'text-font': FONT.medium, 'text-letter-spacing': 0.02, 'text-offset': [0, -1.2],
      'text-padding': 6, ...bubble('bubble'), ...(L.bubbles && { 'text-rotation-alignment': 'viewport' }) },
    paint: { 'text-color': LIFT.cable, 'text-halo-color': '#ffffff', ...bubbleHalo(2.2), 'text-emissive-strength': 1,
      'icon-emissive-strength': 1 } });

  apply3D(false);
  applySelection();
}

/**
 * Rounded pill drawn on a canvas, registered as a stretchable Mapbox image so icon-text-fit can
 * wrap it around any label: run badges (run colour, white rim) and white label bubbles.
 */
function pillImage(fill, rim, rimWidth, shadow) {
  const pr = 2, r = 12, pad = 4, w = 2 * r + 2 * pad + 4, h = 2 * r + 2 * pad;
  const c = document.createElement('canvas');
  c.width = w * pr; c.height = h * pr;
  const g = c.getContext('2d');
  g.scale(pr, pr);
  g.beginPath();
  g.roundRect(pad, pad, w - 2 * pad, h - 2 * pad, r);
  if (shadow) { g.shadowColor = 'rgba(30, 34, 80, 0.28)'; g.shadowBlur = 4; g.shadowOffsetY = 1.5; }
  g.fillStyle = fill; g.fill();
  g.shadowColor = 'transparent';
  if (rimWidth) { g.lineWidth = rimWidth; g.strokeStyle = rim; g.stroke(); }
  const data = g.getImageData(0, 0, c.width, c.height);
  return [{ width: c.width, height: c.height, data: new Uint8Array(data.data.buffer) }, {
    pixelRatio: pr,
    stretchX: [[(pad + r) * pr, (w - pad - r) * pr]],
    stretchY: [[(h / 2 - 0.5) * pr, (h / 2 + 0.5) * pr]],
    content: [(pad + r * 0.55) * pr, (pad + 2) * pr, (w - pad - r * 0.55) * pr, (h - pad - 2) * pr],
  }];
}
/** Re-colour runs when moving to a resort in another region (e.g. Europe → North America). */
function applyRunColors() {
  const next = computeRun(LOOKS[look], current.country);
  if (JSON.stringify(next) === JSON.stringify(RUN)) return;
  RUN = next;
  addLabelImages();
  if (map.getLayer('piste-areas-fill')) map.setPaintProperty('piste-areas-fill', 'fill-color', runColor());
  if (map.getLayer('pistes-line')) map.setPaintProperty('pistes-line', 'line-color', runColor());
  if (map.getLayer('pistes-name')) map.setPaintProperty('pistes-name', 'text-color', runColor());
}

function addLabelImages() {
  const put = (id, args) => { if (map.hasImage(id)) map.removeImage(id); map.addImage(id, ...args); };
  for (const [k, color] of Object.entries(RUN)) put(`badge-${k}`, pillImage(color, '#ffffff', 2.5, true));
  put('bubble', pillImage('#ffffff', 'rgba(30, 34, 80, 0.08)', 1, true));
  put('bubble-peak', pillImage('#eef1ff', 'rgba(61, 71, 184, 0.18)', 1, true));
}

/** Fog fades distant peaks into the horizon; in daylight a low SSW sun adds cool shadows on 3D objects. */
function applyFog() {
  const day = presets[preset] === 'day';
  try { map.setFog(day ? LOOKS[look].fog : null); } catch (e) { console.warn(e.message); }
  try { map.setLights(day ? (LOOKS[look].lights ?? DAY_LIGHTS) : null); } catch (e) { console.warn(e.message); }
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
  $('#resort-q').value = r.name;
  applyRunColors();
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
  const runs = legendFor(r.country).map(([k, label]) => `<span><i style="background:${RUN[k]}"></i>${label}</span>`).join('');
  $('#legend').hidden = false;
  $('#legend').innerHTML = `<div>${runs}</div><div class="lifts"><span><i class="cable"></i>Lift</span>`
    + `<span><b style="background:${LIFT.cabin}"></b>Gondola</span><span><b style="background:${LIFT.chair}"></b>Chair</span></div>`;
}

// --- All resorts: tiers, overview dots, search -------------------------------------------------
const TIER = {
  1: { color: '#ff3d5f', label: 'Over 2 M skier visits' },
  2: { color: '#2b8bff', label: '1–2 M skier visits' },
  3: { color: '#7a7fa8', label: '0.5–1 M skier visits' },
};
const COUNTRY = { AT: 'Austria', CH: 'Switzerland', FR: 'France', IT: 'Italy', DE: 'Germany', AD: 'Andorra', ES: 'Spain',
  SE: 'Sweden', NO: 'Norway', FI: 'Finland', SK: 'Slovakia', CZ: 'Czechia', PL: 'Poland', BG: 'Bulgaria', SI: 'Slovenia',
  RO: 'Romania', RU: 'Russia', US: 'United States', CA: 'Canada', JP: 'Japan', KR: 'South Korea', CN: 'China',
  AU: 'Australia', NZ: 'New Zealand', AR: 'Argentina' };
const resortPoints = { type: 'FeatureCollection', features: resorts.map((r) => ({ type: 'Feature', id: r.id,
  geometry: { type: 'Point', coordinates: [r.camera.lon, r.camera.lat] }, properties: { id: r.id, name: r.name, tier: r.tier ?? 3 } })) };

const fold = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const searchIndex = resorts.map((r) => ({ r, name: fold(r.name), words: fold([...(r.villages ?? []), COUNTRY[r.country] ?? '', r.country].join(' | ')) }));
function findResorts(q) {
  const f = fold(q.trim());
  if (!f) return resorts.filter((r) => r.tier === 1);
  return searchIndex.map(({ r, name, words }) => {
    const score = name.startsWith(f) ? 0 : name.split(/[^a-z0-9]+/).some((w) => w.startsWith(f)) ? 1
      : name.includes(f) ? 2 : words.split(/[^a-z0-9]+/).some((w) => w.startsWith(f)) || words.includes(f) ? 3 : 9;
    return { r, score };
  }).filter((x) => x.score < 9).sort((a, b) => a.score - b.score || (a.r.tier ?? 3) - (b.r.tier ?? 3) || a.r.name.localeCompare(b.r.name))
    .slice(0, 40).map((x) => x.r);
}

const input = $('#resort-q'), list = $('#results');
let hits = [], active = -1;
function renderResults() {
  hits = findResorts(input.value);
  active = hits.length ? 0 : -1;
  list.innerHTML = (input.value.trim() ? '' : '<li class="hint" role="presentation">Biggest resorts · type to search all</li>')
    + (hits.length ? hits.map((r, i) => `<li role="option" id="opt-${i}" data-i="${i}" aria-selected="${i === active}">
        <i style="background:${TIER[r.tier ?? 3].color}"></i>
        <span><b>${r.name}</b><small>${COUNTRY[r.country] ?? r.country} · ${TIER[r.tier ?? 3].label}</small></span></li>`).join('')
      : '<li class="hint" role="presentation">No resort found. Try a village or country.</li>');
  list.hidden = false;
  $('#search').setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-activedescendant', active >= 0 ? 'opt-0' : '');
}
function closeResults() {
  list.hidden = true;
  $('#search').setAttribute('aria-expanded', 'false');
}
function moveActive(d) {
  if (!hits.length) return;
  active = (active + d + hits.length) % hits.length;
  for (const li of list.querySelectorAll('[role=option]')) li.setAttribute('aria-selected', String(Number(li.dataset.i) === active));
  list.querySelector(`#opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  input.setAttribute('aria-activedescendant', `opt-${active}`);
}
function pickResort(r) {
  closeResults();
  input.blur();
  history.replaceState(null, '', `?resort=${r.id}`);
  stopMotion();
  showResort(r);
}
input.addEventListener('focus', () => { input.select(); renderResults(); });
input.addEventListener('input', renderResults);
input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
  else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); pickResort(hits[active]); }
  else if (e.key === 'Escape') { closeResults(); input.value = current.name; input.blur(); }
});
list.addEventListener('pointerdown', (e) => {
  const li = e.target.closest('[role=option]');
  if (li) { e.preventDefault(); pickResort(hits[Number(li.dataset.i)]); }
});
input.addEventListener('blur', () => setTimeout(() => { closeResults(); if (!input.value.trim()) input.value = current.name; }, 120));

// Globe button: zoom out to every resort.
$('#world').addEventListener('click', () => {
  stopMotion();
  $('#card').classList.remove('show');
  map.flyTo({ center: [10, 35], zoom: 1.4, pitch: 0, bearing: 0, duration: 2200, essential: true });
});

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
// The run legend only makes sense inside a resort, not over the world view.
map.on('zoom', () => { $('#legend').classList.toggle('far', map.getZoom() < 9); });
map.on('mousemove', (e) => {
  const over = map.getLayer('resort-dots') && map.getZoom() < 10.5
    && map.queryRenderedFeatures(e.point, { layers: ['resort-dots', 'resort-dot-labels'] }).length;
  map.getCanvas().style.cursor = over ? 'pointer' : '';
});

// --- Controls -----------------------------------------------------------------------------------
$('#toggle3d').addEventListener('click', () => { is3D = !is3D; if (!is3D) stopMotion(); apply3D(true); syncDial(); });
$('#light').addEventListener('click', () => {
  preset = (preset + 1) % presets.length;
  setBasemap('lightPreset', presets[preset]);
  applyFog();
  $('#light').textContent = { day: '☀︎', dusk: '◐', night: '☾', dawn: '◑' }[presets[preset]];
  status(`Lighting: ${presets[preset]}`, 1200);
});
$('#look').addEventListener('click', () => {
  look = LOOK_ORDER[(LOOK_ORDER.indexOf(look) + 1) % LOOK_ORDER.length];
  store.set('map-look', look);
  $('#look').setAttribute('aria-label', `Map style: ${LOOKS[look].label}. Switch style`);
  status(LOOKS[look].label, 1200);
  map.setStyle(LOOKS[look].style, { config: { basemap: { lightPreset: presets[preset], ...LOOKS[look].config } } });
});
let markReady;
const ready = new Promise((r) => { markReady = r; });
map.on('style.load', () => { setup(); renderLegend(current); syncDial(); markReady(); });

// Tap a run, lift, cabin or station → card (mirrors featureCard in ResortBrowserView.swift).
map.on('click', (e) => {
  const dot = map.getLayer('resort-dots') && map.getZoom() < 10.5
    && map.queryRenderedFeatures([[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]], { layers: ['resort-dots', 'resort-dot-labels'] })[0];
  if (dot) { pickResort(resorts.find((r) => r.id === dot.properties.id)); return; }
  const layers = ['pistes-line', 'pistes-unknown', 'lifts-cable', 'lifts-line', 'lift-cabins', 'lift-structures'].filter((l) => map.getLayer(l));
  const pad = 10;
  const f = map.queryRenderedFeatures([[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]], { layers })[0];
  if (!f) { $('#card').classList.remove('show'); return; }
  const p = f.properties;
  const d = DIFF[p['piste:difficulty']];
  const liftType = LIFT_NAMES[p.aerialway ?? p.lift];
  const seats = p['aerialway:occupancy'] ? `${p['aerialway:occupancy']} seats` : '';
  const title = p.name ?? p.ref ?? { pylon: 'Lift tower', cabin: liftType ?? 'Cabin', station: 'Lift station' }[p.kind] ?? 'Unnamed';
  const detail = d ? `${runLabel(current.country, p['piste:difficulty'])}${p.ref ? ` · No. ${p.ref}` : ''}`
    : [p.kind === 'station' ? 'Station' : null, liftType, seats].filter(Boolean).join(' · ');
  $('#card b').textContent = title;
  $('#card small').textContent = detail;
  $('#card .dot').style.background = d ? RUN[p['piste:difficulty']] : (p.lift === 'chair_lift' ? LIFT.chair : LIFT.cabin);
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
  findResorts, pickResort: (id) => pickResort(resorts.find((r) => r.id === id)),
};
