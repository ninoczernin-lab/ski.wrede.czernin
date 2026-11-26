// Web version of the ski map: each resort as a toy cartoon mountain at a chosen hour.
// Same data code as pipeline/ and the same run colours as the iOS app (PisteStyle.swift).
// Mapbox GL JS v3 with Standard / Standard Satellite.
import { overpassQuery } from '../pipeline/query.mjs';
import { convert } from '../pipeline/convert.mjs';
import { buildCableSpans, NSTOPS } from '../pipeline/cables.mjs';
import { buildCabins, liftTracks, carsAt } from '../pipeline/lift3d.mjs';
import { elevationAt } from './elevation-browser.js';
import { lightAt, formatHour, deviceUses12h, HOUR_MIN, HOUR_MAX } from './daylight.js';
import { pineShapes, scatterPines, avoidGrid } from './pines.js';
import { createSnow } from './snow.js';
import { skierTracks, skiersAt, snowmenNear, stationIcon, hutIcon, snowmanIcon, skierIcon, JACKETS, INK, LIFT_YELLOW, LIFT_VIOLET } from './decor.js';
import { MAPBOX_TOKEN } from './config.js';

const EXAGGERATION = 1.5;
const PITCH_3D = 62;                                    // tilted-diorama angle
const SHADOW = 0.22;
const GROUND_LIFTS = ['rope_tow', 'magic_carpet', 'zip_line'];
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const DATA_LAYERS = ['pistes', 'piste_areas', 'lifts', 'structures', 'lift_spans', 'cabins', 'huts'];

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
// Cartoon runs: a fat ribbon, a white rim, and an ink outline around both, like a sticker trail map.
const LINE_W = widthExpr([[10, 3], [12, 5], [14, 8], [16, 12]]);
const CASING_W = widthExpr([[10, 5], [12, 7.6], [14, 11.4], [16, 16]]);
const INK_W = widthExpr([[10, 6.6], [12, 9.8], [14, 14.2], [16, 19.6]]);
// Highlight: a thin light stripe down each ribbon, the glossy edge of a sticker.
const SHEEN_W = widthExpr([[12, 0.8], [14, 1.8], [16, 2.8]]);
const byZoom = (a, b) => ['interpolate', ['linear'], ['zoom'], 11, a, 16, b];

// --- Lifts -----------------------------------------------------------------------------------
const LIFT_NAMES = {
  cable_car: 'Cable car', gondola: 'Gondola', mixed_lift: 'Combined lift', chair_lift: 'Chairlift',
  drag_lift: 'Drag lift', t_bar: 'T-bar', j_bar: 'J-bar', platter: 'Button lift', rope_tow: 'Rope tow',
  magic_carpet: 'Magic carpet', zip_line: 'Zip line',
};
// Lifts are one family: violet cables (a hue no region uses for runs, so a lift never reads as a black
// run) with sunny-yellow cabins, roofs and station badges.
const LIFT_BASE = {
  cable: LIFT_VIOLET, shadow: '#8d7fd6',
  select: '#ffe680', selectCore: LIFT_VIOLET,           // selection: a sunny halo round the same bright violet, never darker
  terminal: '#ffffff',
  mast: '#5b6688', arm: INK, wall: '#ffffff', roof: LIFT_YELLOW,
  cabin: LIFT_YELLOW, chair: INK,
};
let LIFT = LIFT_BASE;
const liftLabelExpr = ['match', ['get', 'aerialway'], ...Object.entries(LIFT_NAMES).flat(), 'Lift'];
const NO_MATCH = ['boolean', false];               // filter that hides a layer until a lift is selected
const DIM = 0.4;                                        // opacity of unselected lifts while one is selected
let selectedLift = 'Valfagehrbahn';                     // tap another lift to change, × on the card clears
const nameKey = ['downcase', ['coalesce', ['get', 'name'], '']];

// --- Map looks ---------------------------------------------------------------------------------
// Cartoon: Standard repainted as a toy snow mountain with candy-bright runs; light comes from the hour.
// Satellite: real imagery on the same terrain, under the same hour, with the same cartoon furniture.
const LOOKS = {
  cartoon: {
    label: 'Cartoon', style: 'mapbox://styles/mapbox/standard',
    // Greenspace close to the snow so forest polygons draw no hard edge; valley-tint and pines add the green.
    config: { theme: 'faded', colorLand: '#f4f7fb', colorGreenspace: '#e3ebe6', colorWater: '#79aed6',
      show3dObjects: true, showPointOfInterestLabels: false, showTransitLabels: false, showRoadLabels: false,
      showPlaceLabels: false, showPedestrianRoads: false },
    relief: 0.5,                                         // soft shading: bright toy snow, not a survey model
    valleyTint: [500, 'rgba(40, 84, 64, 0.26)', 1000, 'rgba(52, 96, 74, 0.2)', 1400, 'rgba(86, 122, 102, 0.1)',
      1800, 'rgba(196, 214, 208, 0.03)', 2100, 'rgba(255, 255, 255, 0)'],
    // Trail-map ground, not a survey sheet: no 50 m lines, faint 200 m lines, sparse height labels.
    contour: { minor: false, major: 'rgba(64, 86, 120, 0.22)', text: '#5a6a82', halo: '#ffffff', labelZoom: 14.5 },
    labels: { text: '#16202c', halo: '#ffffff', peak: '#2c3b52' },
    runs: { novice: '#16c45e', easy: '#1e7bff', intermediate: '#ff2e4d', advanced: '#1b1d2b', expert: '#1b1d2b',
      freeride: '#ff9a1a', unknown: '#8a90a6' },
    pines: true,
  },
  satellite: {
    label: 'Satellite', style: 'mapbox://styles/mapbox/standard-satellite',
    config: { showPointOfInterestLabels: false, showTransitLabels: false, showRoadLabels: false, showPlaceLabels: false },
    relief: 0.4,
    valleyTint: false,                                  // imagery already has real valley colours
    contour: { minor: 'rgba(255, 255, 255, 0.2)', major: 'rgba(255, 255, 255, 0.45)', text: '#ffffff', halo: 'rgba(14, 22, 34, 0.85)' },
    labels: { text: '#ffffff', halo: 'rgba(14, 22, 34, 0.9)', peak: '#ffffff' },
    pines: false,
  },
};
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
const LOOK_ORDER = ['cartoon', 'satellite'];
let look = LOOKS[store.get('map-look')] ? store.get('map-look') : 'cartoon';   // an old 'diorama' choice lands on cartoon
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Effects quality: 2 full, 1 lighter (no snow, fewer pines, slower cabins), 0 static. Drops when frames slip.
let quality = reduceMotion ? 1 : 2;

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
$('#resort-q').placeholder = `Search ${resorts.length} resorts, villages, countries`;

// The hour: starts at the resort's own local time when it's daylight there, otherwise mid-afternoon.
const localHour = (r) => ((new Date().getUTCHours() + new Date().getUTCMinutes() / 60 + r.camera.lon / 15) % 24 + 24) % 24;
let hour = (() => { const h = localHour(current); return h >= 7.5 && h <= 19 ? h : 15.5; })();
let light = lightAt(hour, { south: current.camera.lat < 0 });

// --- Map ------------------------------------------------------------------------------------------
mapboxgl.accessToken = token;
const map = new mapboxgl.Map({
  container: 'map', style: LOOKS[look].style,
  // Opens high above the resort; the fly-in brings the camera down once the scene is ready.
  center: [current.camera.lon, current.camera.lat], zoom: Math.max(7, current.camera.zoom - 3.2),
  bearing: current.camera.bearing - 60, pitch: 30, maxPitch: 85, hash: false, attributionControl: true,
  config: { basemap: { lightPreset: light.preset, ...LOOKS[look].config } },
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
let pinesOK = false;
const PINE = { trunk: '#4a3a30', low: '#244c3d', mid: '#2f5f4b', snow: '#eef4f8' };

/** Everything we add on top of Mapbox's style. Runs again after every style switch. */
function setup() {
  const L = LOOKS[look];
  RUN = computeRun(L, current.country);
  LIFT = { ...LIFT_BASE, ...(L.lift ?? {}) };
  addLabelImages();
  const lw = LINE_W, cw = CASING_W;
  const bubble = () => ({});
  const bubbleHalo = (width) => ({ 'text-halo-width': width });
  for (const [k, v] of Object.entries(L.config)) setBasemap(k, v);
  setBasemap('lightPreset', light.preset);
  lastPreset = light.preset;

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
    paint: { 'hillshade-illumination-anchor': 'map' } });
  // Ridge light: a second, highlight-only pass from the sun's side so crests catch a crisp white edge.
  map.addLayer({ id: 'ridge-light', type: 'hillshade', source: 'mapbox-dem-shade', slot: 'bottom',
    paint: { 'hillshade-illumination-anchor': 'map', 'hillshade-shadow-color': 'rgba(0, 0, 0, 0)',
      'hillshade-accent-color': 'rgba(0, 0, 0, 0)', 'hillshade-highlight-color': 'rgba(255, 255, 255, 0.9)',
      'hillshade-exaggeration': 0.55 } });
  applyLight();

  // Elevation contours: thin every 50 m, stronger every 200 m with height labels.
  map.addSource('contours', { type: 'vector', url: 'mapbox://mapbox.mapbox-terrain-v2' });
  const major = ['==', ['%', ['get', 'ele'], 200], 0];
  if (L.contour.minor) map.addLayer({ id: 'contours-minor', type: 'line', source: 'contours', 'source-layer': 'contour', slot: 'bottom', minzoom: 12,
    filter: ['all', ['==', ['%', ['get', 'ele'], 50], 0], ['!', major]],
    paint: { 'line-color': L.contour.minor, 'line-width': 0.6 } });
  map.addLayer({ id: 'contours-major', type: 'line', source: 'contours', 'source-layer': 'contour', slot: 'bottom', minzoom: 11,
    filter: major, paint: { 'line-color': L.contour.major, 'line-width': byZoom(0.7, 1.3) } });
  map.addLayer({ id: 'contours-label', type: 'symbol', source: 'contours', 'source-layer': 'contour', slot: 'middle', minzoom: L.contour.labelZoom ?? 13,
    filter: major,
    layout: { 'symbol-placement': 'line', 'text-field': ['concat', ['to-string', ['get', 'ele']], ' m'],
      'text-size': 10.5, 'text-font': FONT.medium, 'text-pitch-alignment': 'map', 'text-rotation-alignment': 'map',
      'symbol-spacing': L.contour.labelZoom ? 900 : 500, 'text-padding': 4 },
    paint: { 'text-color': L.contour.text, 'text-halo-color': L.contour.halo, 'text-halo-width': 2, 'text-halo-blur': 0.2 } });

  // Peaks and villages, redrawn from Mapbox Streets with strong halos (the basemap's own place
  // labels are switched off above, since their halos can't be restyled from outside the style).
  map.addSource('streets', { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' });
  // Forest areas feed the pine scatter; drawn invisibly so their tiles stay queryable.
  map.addLayer({ id: 'forest-mask', type: 'fill', source: 'streets', 'source-layer': 'landcover', slot: 'bottom',
    filter: ['==', ['get', 'class'], 'wood'], paint: { 'fill-opacity': 0 } });
  map.addLayer({ id: 'peak-labels', type: 'symbol', source: 'streets', 'source-layer': 'natural_label', slot: 'top', minzoom: 10.5,
    filter: ['match', ['get', 'maki'], ['mountain', 'volcano'], true, false],
    layout: { 'text-field': ['format', ['get', 'name'], {},
        ['case', ['has', 'elevation_m'], ['concat', '\n', ['to-string', ['get', 'elevation_m']], ' m'], ''], { 'font-scale': 0.82 }],
      'icon-image': 'peak', 'icon-anchor': 'bottom', 'text-anchor': 'bottom', 'text-offset': [0, -0.9],
      'text-font': FONT.medium, 'text-size': byZoom(11, 13), 'text-padding': 6,
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

  // Every resort as a dot when zoomed out: big coral = tier 1 (2 M+ skier visits), blue = tier 2, slate = tier 3,
  // small pale dots = the rest of the 2026 list (they appear from zoom 4.5, where they no longer carpet the Alps).
  map.addSource('all-resorts', { type: 'geojson', data: resortPoints });
  const fadeOut = (v) => ['interpolate', ['linear'], ['zoom'], 9, v, 10.5, 0];
  map.addLayer({ id: 'resort-dots', type: 'circle', source: 'all-resorts', slot: 'top', maxzoom: 10.5,
    filter: ['any', ['<', ['get', 'tier'], 4], ['>=', ['zoom'], 4.5]],
    layout: { 'circle-sort-key': ['-', 100000, ['get', 'order']] },
    paint: { 'circle-color': ['match', ['get', 'tier'], 1, TIER[1].color, 2, TIER[2].color, 3, TIER[3].color, TIER[4].color],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, ['match', ['get', 'tier'], 1, 4.5, 2, 3.5, 3, 2.5, 2],
        8, ['match', ['get', 'tier'], 1, 9, 2, 7.5, 3, 6, 4.5]],
      'circle-stroke-color': '#ffffff', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 1, 1, 8, 2.5],
      'circle-opacity': fadeOut(1), 'circle-stroke-opacity': fadeOut(1), 'circle-emissive-strength': 1,
      'circle-pitch-alignment': 'viewport' } });
  map.addLayer({ id: 'resort-dot-labels', type: 'symbol', source: 'all-resorts', slot: 'top', maxzoom: 10.5,
    // Tier 1 names from zoom 3, tier 2 from 5, tier 3 from 6.5, the rest from 7.5; collisions thin them by rank.
    filter: ['>=', ['zoom'], ['match', ['get', 'tier'], 1, 3, 2, 5, 3, 6.5, 7.5]],
    layout: { 'text-field': ['get', 'name'], 'text-font': FONT.bold, 'text-size': ['match', ['get', 'tier'], 1, 13, 2, 12, 4, 10.5, 11],
      'text-anchor': 'left', 'text-offset': [0.9, 0], 'text-padding': 4, 'text-optional': true,
      'symbol-sort-key': ['get', 'order'], ...bubble('bubble') },
    paint: { 'text-color': L.labels.text, 'text-halo-color': L.labels.halo, ...bubbleHalo(2.2),
      'text-opacity': fadeOut(1), 'icon-opacity': fadeOut(1), 'text-emissive-strength': 1, 'icon-emissive-strength': 1 } });

  // Runs.
  map.addLayer({ id: 'piste-areas-fill', type: 'fill', source: 'piste_areas', slot: 'middle',
    paint: { 'fill-color': runColor(), 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.06, 15, 0.14] } });
  map.addLayer({ id: 'pistes-ink', type: 'line', source: 'pistes', slot: 'top', filter: downhill,
    layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'rank'] },
    paint: { 'line-color': INK, 'line-opacity': 0.92, 'line-width': INK_W, 'line-emissive-strength': 1 } });
  map.addLayer({ id: 'pistes-casing', type: 'line', source: 'pistes', slot: 'top', filter: downhill,
    layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'rank'] },
    paint: { 'line-color': '#ffffff', 'line-opacity': 1, 'line-width': cw, 'line-blur': 0, 'line-emissive-strength': 1 } });
  map.addLayer({ id: 'pistes-line', type: 'line', source: 'pistes', slot: 'top', filter: ['all', downhill, ['!', unknown]],
    layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'rank'] },
    paint: { 'line-color': runColor(), 'line-width': lw, 'line-emissive-strength': 1 } });
  map.addLayer({ id: 'pistes-sheen', type: 'line', source: 'pistes', slot: 'top', minzoom: 12, filter: downhill,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 13.5, 0.42],
      'line-width': SHEEN_W, 'line-offset': widthExpr([[12, -0.8], [14, -1.6], [16, -2.6]]), 'line-emissive-strength': 1 } });
  map.addLayer({ id: 'pistes-unknown', type: 'line', source: 'pistes', slot: 'top', filter: ['all', downhill, unknown],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': RUN.unknown, 'line-width': lw, 'line-dasharray': [1.4, 0.9], 'line-emissive-strength': 1 } });

  // Lifts: thin charcoal on the ground and in the air; the selected lift gets a bright glow
  // (lift-selected-glow on the ground for 2D, lifts-cable-glow in the air for 3D).
  // Selection carries no hue (the run palette owns colour): a wide white halo under a heavier charcoal core.
  map.addLayer({ id: 'lift-selected-glow', type: 'line', source: 'lifts', slot: 'top', filter: NO_MATCH,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': LIFT.select, 'line-width': byZoom(10, 16), 'line-blur': byZoom(0.6, 1.4), 'line-opacity': 0.95,
      'line-emissive-strength': 1 } });
  // Lifts on the ground: a solid charcoal thread with a white hairline, like the runs (2D, and ground lifts in 3D).
  map.addLayer({ id: 'lifts-line-casing', type: 'line', source: 'lifts', slot: 'top',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': byZoom(6, 9), 'line-opacity': 0.95, 'line-emissive-strength': 1 } });
  map.addLayer({ id: 'lifts-line', type: 'line', source: 'lifts', slot: 'top',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': LIFT.cable, 'line-emissive-strength': 1 } });
  map.addLayer({ id: 'lifts-cable-glow', type: 'line', source: 'lift_spans', slot: 'top', filter: NO_MATCH,
    layout: { 'line-cap': 'round', 'line-join': 'round', ...elevated },
    paint: { 'line-color': LIFT.select, 'line-width': byZoom(10, 16), 'line-blur': byZoom(0.6, 1.4), 'line-opacity': 0.95,
      'line-emissive-strength': 1 } });
  // Every cable gets a white rim so the charcoal thread reads against rock and shadowed snow.
  map.addLayer({ id: 'lifts-cable-halo', type: 'line', source: 'lift_spans', slot: 'top',
    layout: { 'line-cap': 'round', 'line-join': 'round', ...elevated },
    paint: { 'line-color': '#ffffff', 'line-width': byZoom(7.6, 11), 'line-opacity': 0.92, 'line-emissive-strength': 1 } });
  map.addLayer({ id: 'lifts-cable', type: 'line', source: 'lift_spans', slot: 'top',
    layout: { 'line-cap': 'round', 'line-join': 'round', ...elevated },
    paint: { 'line-emissive-strength': 1 } });
  // Stations: sunny-yellow cable-car badges at both ends of every lift (upright, always facing you).
  map.addLayer({ id: 'lift-terminals', type: 'symbol', source: 'lift_terminals', slot: 'top', minzoom: 11.5,
    layout: { 'icon-image': 'station', 'icon-size': byZoom(0.85, 1.2), 'icon-anchor': 'center', 'icon-padding': 1,
      'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport', 'symbol-z-order': 'source' },
    paint: { 'icon-emissive-strength': 1 } });
  // Mapbox GL skips (doesn't throw on) a layer it can't validate, so check it really exists.
  cablesOK = Boolean(map.getLayer('lifts-cable'));
  if (!cablesOK) console.warn('Elevated lines unavailable in this Mapbox GL version; lifts stay on the ground');

  // Pylons (mast + crossarm), stations (walls + roof) and cabins: 3D boxes on the terrain.
  const ex = (prop) => ['*', EXAGGERATION, ['get', prop]];
  map.addLayer({ id: 'lift-structures', type: 'fill-extrusion', source: 'structures', slot: 'top', minzoom: 11.5,
    paint: { 'fill-extrusion-base': ex('base'), 'fill-extrusion-height': ex('height'),
      'fill-extrusion-color': ['match', ['get', 'part'], 'mast', LIFT.mast, 'arm', LIFT.arm, 'roof', LIFT.roof, LIFT.wall],
      'fill-extrusion-vertical-gradient': true, 'fill-extrusion-ambient-occlusion-intensity': 0.35,
      'fill-extrusion-opacity': 1 } });
  // From afar a cabin is smaller than a pixel: draw it as a travelling dot that hands over to the 3D cabin up close.
  map.addSource('cabin-dots', { type: 'geojson', data: empty });
  map.addLayer({ id: 'lift-cabin-dots', type: 'circle', source: 'cabin-dots', slot: 'top', minzoom: 10.5, maxzoom: 14,
    // Yellow beads with an ink ring riding the cable: the lift family's colour, never a run colour.
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10.5, 2.6, 13, 3.6],
      'circle-color': LIFT.cabin, 'circle-stroke-width': 1.4, 'circle-stroke-color': LIFT.cable,
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 12.8, 1, 13.6, 0],
      'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 12.8, 1, 13.6, 0],
      'circle-pitch-alignment': 'viewport', 'circle-emissive-strength': 1 } });
  map.addLayer({ id: 'lift-cabins', type: 'fill-extrusion', source: 'cabins', slot: 'top', minzoom: 11.5,
    paint: { 'fill-extrusion-base': ex('base'), 'fill-extrusion-height': ex('height'),
      'fill-extrusion-color': ['match', ['get', 'lift'], 'chair_lift', LIFT.chair, LIFT.cabin],
      'fill-extrusion-emissive-strength': 0.4, 'fill-extrusion-opacity': 1 } });

  // Stylized pines in real forest areas: stacked octagonal tiers with a snow cap.
  pinesOK = false;
  if (L.pines) {
    map.addSource('pines', { type: 'geojson', data: empty });
    const exP = (prop) => ['*', EXAGGERATION, ['get', prop]];
    map.addLayer({ id: 'pines', type: 'fill-extrusion', source: 'pines', slot: 'middle', minzoom: 11.5,
      paint: { 'fill-extrusion-base': exP('base'), 'fill-extrusion-height': exP('height'),
        'fill-extrusion-color': ['match', ['get', 'part'], 'trunk', PINE.trunk, 'low', PINE.low, 'mid', PINE.mid, PINE.snow],
        'fill-extrusion-vertical-gradient': true, 'fill-extrusion-ambient-occlusion-intensity': 0.45,
        'fill-extrusion-ambient-occlusion-radius': 6,
        'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 11.5, 0, 12, 1] } });
    pinesOK = Boolean(map.getLayer('pines'));
  }

  // Cartoon furniture: huts, a few snowmen beside huts and stations, and tiny skiers on the runs.
  // Billboards (always upright) so they read as little figures standing on the mountain.
  const figure = { 'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport', 'icon-anchor': 'bottom',
    'icon-allow-overlap': true, 'icon-ignore-placement': true };
  map.addSource('snowmen', { type: 'geojson', data: empty });
  map.addLayer({ id: 'snowmen', type: 'symbol', source: 'snowmen', slot: 'top', minzoom: 12.5,
    layout: { ...figure, 'icon-image': 'snowman', 'icon-size': byZoom(1.05, 1.4) },
    paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 0, 12.9, 1], 'icon-emissive-strength': 1 } });
  map.addSource('skiers', { type: 'geojson', data: empty });
  map.addLayer({ id: 'skiers', type: 'symbol', source: 'skiers', slot: 'top', minzoom: 12.5,
    layout: { ...figure, 'icon-image': ['concat', 'skier-', ['to-string', ['get', 'jacket']], '-', ['get', 'face']],
      'icon-size': byZoom(0.9, 1.25) },
    paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 12.5, 0, 12.9, 1], 'icon-emissive-strength': 1 } });
  map.addLayer({ id: 'huts', type: 'symbol', source: 'huts', slot: 'top', minzoom: 12,
    layout: { 'icon-image': 'hut', 'icon-size': byZoom(1.1, 1.5), 'icon-anchor': 'center', 'icon-padding': 2,
      'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport',
      'text-field': ['step', ['zoom'], '', 14, ['coalesce', ['get', 'name'], '']], 'text-font': FONT.bold, 'text-size': 12,
      'text-anchor': 'top', 'text-offset': [0, 1.3], 'text-optional': true, 'text-padding': 4,
      'symbol-sort-key': ['case', ['==', ['get', 'kind'], 'hut'], 0, 1] },
    paint: { 'text-color': INK, 'text-halo-color': '#ffffff', 'text-halo-width': 2.2, 'text-emissive-strength': 1,
      'icon-emissive-strength': 1 } });

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
  schedulePines();
}

/**
 * Rounded pill drawn on a canvas, registered as a stretchable Mapbox image so icon-text-fit can
 * wrap it around any label: run badges (run colour, white rim) and white label bubbles.
 */
function pillImage(fill, rim, rimWidth, shadow, ink) {
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
  if (ink) {                                         // cartoon ink line just outside the white rim
    g.beginPath(); g.roundRect(pad - rimWidth / 2 - 0.6, pad - rimWidth / 2 - 0.6, w - 2 * pad + rimWidth + 1.2, h - 2 * pad + rimWidth + 1.2, r + rimWidth / 2);
    g.lineWidth = 1.4; g.strokeStyle = ink; g.stroke();
  }
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
  for (const [k, color] of Object.entries(RUN)) put(`badge-${k}`, pillImage(color, '#ffffff', 2.5, true, INK));
  put('peak', peakImage());
  put('station', stationIcon());
  put('hut', hutIcon());
  put('snowman', snowmanIcon());
  JACKETS.forEach((c, i) => { put(`skier-${i}-r`, skierIcon(c)); put(`skier-${i}-l`, skierIcon(c, true)); });
}

/** Small drawn summit mark for peak labels: a filled triangle with a snow cap. */
function peakImage() {
  const pr = 2, w = 14, h = 11, c = document.createElement('canvas');
  c.width = w * pr; c.height = h * pr;
  const g = c.getContext('2d');
  g.scale(pr, pr);
  g.beginPath(); g.moveTo(1, h - 1); g.lineTo(w / 2, 1); g.lineTo(w - 1, h - 1); g.closePath();
  g.fillStyle = LOOKS[look].labels.peak; g.fill();
  g.beginPath(); g.moveTo(w / 2 - 2.6, 5.2); g.lineTo(w / 2, 1.6); g.lineTo(w / 2 + 2.6, 5.2); g.lineTo(w / 2, 4.2); g.closePath();
  g.fillStyle = '#ffffff'; g.fill();
  g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.moveTo(1, h - 1); g.lineTo(w / 2, 1); g.lineTo(w - 1, h - 1); g.closePath(); g.stroke();
  const d = g.getImageData(0, 0, c.width, c.height);
  return [{ width: c.width, height: c.height, data: new Uint8Array(d.data.buffer) }, { pixelRatio: pr }];
}

let lastPreset = null;
/** Apply the current hour: sky gradient fog, 3D lights, relief shading, Standard's preset and the HUD tint. */
function applyLight() {
  light = lightAt(hour, { south: current.camera.lat < 0 });
  const L = LOOKS[look];
  // Standard's own preset is a heavy relight with its own transition: switch it only when the slider
  // is let go, so dragging through 17:00–20:00 stays smooth (sky, sun and shading still move live).
  if (!scrubbing && light.preset !== lastPreset) { setBasemap('lightPreset', light.preset); lastPreset = light.preset; }
  try { map.setFog(light.fog); } catch (e) { console.warn(e.message); }
  try { map.setLights(light.lights); } catch (e) { console.warn(e.message); }
  if (map.getLayer('relief')) {
    for (const [k, v] of Object.entries(light.shade)) map.setPaintProperty('relief', k, v);
    map.setPaintProperty('relief', 'hillshade-exaggeration', light.relief * L.relief);
    map.setPaintProperty('ridge-light', 'hillshade-illumination-direction', light.azimuth);
    map.setPaintProperty('ridge-light', 'hillshade-exaggeration', light.ridge * L.relief);
  }
  const root = document.documentElement.style;
  root.setProperty('--sky-top', light.hud.skyTop);
  root.setProperty('--sky-bottom', light.hud.skyBottom);
  document.documentElement.dataset.sky = light.hud.dark ? 'dark' : 'light';
  $('#hour-label').textContent = `${formatHour(hour, twelveHour)} · ${light.part}`;
  // Never write the slider while a finger is on it: overwriting a range input mid-drag makes the thumb
  // jump back to an older value, which is what made dusk feel twitchy.
  if (!scrubbing) $('#hour').value = String(hour);
  $('#hour').setAttribute('aria-valuetext', `${formatHour(hour, twelveHour)}, ${light.part}`);
  placeSun();
}

/** The sun glyph rides an arc over the hour track: low at the ends of the day, high at noon. */
function placeSun() {
  const t = (hour - HOUR_MIN) / (HOUR_MAX - HOUR_MIN);
  const up = Math.max(-0.25, light.altitude / 46);
  $('#sun').style.setProperty('--x', `${(t * 100).toFixed(2)}%`);
  $('#sun').style.setProperty('--y', `${(-up * 22).toFixed(1)}px`);
  $('#sun').dataset.below = light.altitude <= 0 ? 'true' : 'false';
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
  const shadowLine = is3D && cablesOK;                    // in 3D the ground line is only the cable's shadow
  map.setPaintProperty('lifts-cable', 'line-color', pick(LIFT.selectCore, LIFT.cable));
  // Cables in the air are drawn in perspective and thin out with distance: give them extra width.
  map.setPaintProperty('lifts-cable', 'line-width', ['interpolate', ['linear'], ['zoom'], 11, pick(5.2, 3.8), 16, pick(8, 6)]);
  map.setPaintProperty('lifts-cable', 'line-opacity', pick(1, active ? DIM : 1));
  map.setPaintProperty('lifts-cable-halo', 'line-opacity', pick(0.85, active ? DIM * 0.85 : 0.85));
  map.setPaintProperty('lifts-line', 'line-color', pick(LIFT.selectCore, shadowLine ? LIFT.shadow : LIFT.cable));
  map.setPaintProperty('lifts-line', 'line-width', ['interpolate', ['linear'], ['zoom'], 11, pick(4.6, 3.2), 16, pick(7, 5)]);
  map.setPaintProperty('lifts-line', 'line-opacity', active ? ['case', sel, shadowLine ? 0.5 : 1, ['*', DIM, groundBase]] : groundBase);
  map.setPaintProperty('lifts-line-casing', 'line-opacity', ['*', active ? ['case', sel, 1, DIM] : 1,
    ['match', ['get', 'aerialway'], GROUND_LIFTS, 0.9, shadowLine ? 0 : 0.9]]);
  map.setPaintProperty('lift-terminals', 'icon-opacity', pick(1, active ? 0.6 : 1));
  map.setPaintProperty('lifts-label', 'text-opacity', pick(1, active ? 0.55 : 1));
}

function apply3D(animate) {
  map.setTerrain(is3D ? { source: 'mapbox-dem', exaggeration: EXAGGERATION } : null);
  setBasemap('show3dObjects', is3D);
  for (const id of ['lift-structures', 'lift-cabins', 'lift-cabin-dots', 'lifts-cable', 'lifts-cable-glow', 'lifts-cable-halo', 'pines']) setLayout(id, 'visibility', is3D ? 'visible' : 'none');
  applySelection();
  $('#orbit').hidden = !is3D;
  $('#toggle3d').textContent = is3D ? '2D' : '3D';
  $('#toggle3d').setAttribute('aria-label', is3D ? 'Switch to flat 2D map' : 'Switch to 3D map');
  if (animate) map.easeTo({ pitch: is3D ? PITCH_3D : 0, duration: reduceMotion ? 0 : 800 });
  updateEffects();
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

async function showResort(r) {
  current = r;
  applyRunColors();
  renderTitle(r);
  renderLegend(r);
  applyLight();                                   // hemisphere can change the sun's path
  $('#card').classList.remove('show');
  tracks = [];
  skiTracks = [];
  map.getSource('snowmen')?.setData(empty);
  map.getSource('skiers')?.setData(empty);
  pines.clear();
  flyIn(r);
  try {
    const layers = await loadResortData(r);
    if (current !== r) return;                    // the viewer picked another resort meanwhile
    for (const id of DATA_LAYERS) map.getSource(id)?.setData(layers[id] ?? empty);
    map.getSource('lift_terminals')?.setData(terminalsFrom(layers.lifts));
    tracks = liftTracks(layers.lift_spans);
    skiTracks = skierTracks(layers.pistes);
    placeSnowmen(layers);
    applySelection();
    const runs = layers.pistes.features.filter((f) => f.properties['piste:type'] === 'downhill').length;
    $('#resort-counts').textContent = `${runs} runs · ${layers.lifts.features.length} lifts`;
    renderLegend(r);
    status();
    schedulePines();
    updateEffects();
  } catch (e) {
    status(e.message);
  }
}

// --- Cinematic fly-in: a high drone pass, then a slow descending arc onto the resort's angle ---
let flight = 0;
function flyIn(r) {
  const id = ++flight;
  const target = { center: [r.camera.lon, r.camera.lat], zoom: r.camera.zoom, bearing: r.camera.bearing,
    pitch: is3D ? PITCH_3D : 0 };
  if (reduceMotion) { map.jumpTo(target); return; }
  map.flyTo({ center: target.center, zoom: target.zoom - 1.4, bearing: target.bearing - 55, pitch: is3D ? 44 : 0,
    curve: 1.6, speed: 1.1, essential: true });
  map.once('moveend', () => {
    if (id !== flight || current !== r) return;   // interrupted by the user or another resort
    map.easeTo({ ...target, duration: 3200, easing: (t) => 1 - (1 - t) ** 3, essential: true });
  });
}
map.on('dragstart', () => { flight++; });
map.on('wheel', () => { flight++; });

function renderTitle(r) {
  $('#resort-name').textContent = r.name;
  $('#resort-meta').textContent = countryName(r.country);
  $('#resort-counts').textContent = 'Loading runs and lifts…';
  document.title = `${r.name} · Ski Map`;
}

function renderLegend(r) {
  const hasUnknown = cache.get(r.id)?.pistes.features.some((f) => f.properties['piste:difficulty'] === 'unknown');
  $('#legend').innerHTML = legendFor(r.country).map(([k, label]) => `<li><i style="background:${RUN[k]}"></i>${label}</li>`).join('')
    + (hasUnknown ? `<li class="unknown"><i style="border-top-color:${RUN.unknown}"></i>Not classified</li>` : '')
    + `<li class="lift"><i></i>Lift</li>`
    + (cache.get(r.id)?.huts?.features.length ? `<li class="hut"><i></i>Hut</li>` : '');
}

// --- All resorts: tiers, overview dots, search -------------------------------------------------
const TIER = {
  1: { color: '#ff3d5f', label: 'Over 2 M skier visits' },
  2: { color: '#2b8bff', label: '1–2 M skier visits' },
  3: { color: '#7a7fa8', label: '0.5–1 M skier visits' },
  4: { color: '#a3a9bd', label: 'More resorts' },
};
const COUNTRY = { AT: 'Austria', CH: 'Switzerland', FR: 'France', IT: 'Italy', DE: 'Germany', AD: 'Andorra', ES: 'Spain',
  SE: 'Sweden', NO: 'Norway', FI: 'Finland', SK: 'Slovakia', CZ: 'Czechia', PL: 'Poland', BG: 'Bulgaria', SI: 'Slovenia',
  RO: 'Romania', RU: 'Russia', US: 'United States', CA: 'Canada', JP: 'Japan', KR: 'South Korea', CN: 'China',
  AU: 'Australia', NZ: 'New Zealand', AR: 'Argentina' };
// Country names for any ISO code (the 2026 list spans ~45 countries); the table above is the fallback.
const regionNames = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
const countryName = (cc) => COUNTRY[cc] ?? (cc && regionNames?.of(cc)) ?? cc;
// Draw order: tiers first, then the 2026 list's own ranking (lower rank = bigger resort).
const order = (r) => (r.tier ?? 4) * 10000 + (r.rank ?? 0);
const resortPoints = { type: 'FeatureCollection', features: resorts.map((r) => ({ type: 'Feature', id: r.id,
  geometry: { type: 'Point', coordinates: [r.camera.lon, r.camera.lat] }, properties: { id: r.id, name: r.name, tier: r.tier ?? 4, order: order(r) } })) };

const fold = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const searchIndex = resorts.map((r) => ({ r, name: fold(r.name), words: fold([...(r.villages ?? []), countryName(r.country) ?? '', r.country].join(' | ')) }));
function findResorts(q) {
  const f = fold(q.trim());
  if (!f) return resorts.filter((r) => r.tier === 1);
  return searchIndex.map(({ r, name, words }) => {
    const score = name.startsWith(f) ? 0 : name.split(/[^a-z0-9]+/).some((w) => w.startsWith(f)) ? 1
      : name.includes(f) ? 2 : words.split(/[^a-z0-9]+/).some((w) => w.startsWith(f)) || words.includes(f) ? 3 : 9;
    return { r, score };
  }).filter((x) => x.score < 9).sort((a, b) => a.score - b.score || order(a.r) - order(b.r) || a.r.name.localeCompare(b.r.name))
    .slice(0, 40).map((x) => x.r);
}

const input = $('#resort-q'), list = $('#results');
let hits = [], active = -1;
function renderResults() {
  hits = findResorts(input.value);
  active = hits.length ? 0 : -1;
  list.innerHTML = (input.value.trim() ? '' : '<li class="hint" role="presentation">Biggest resorts · type to search all</li>')
    + (hits.length ? hits.map((r, i) => `<li role="option" id="opt-${i}" data-i="${i}" aria-selected="${i === active}">
        <i style="background:${TIER[r.tier ?? 4].color}"></i>
        <span><b>${r.name}</b><small>${countryName(r.country)}${r.status ? ` · ${r.status}` : ''}</small></span></li>`).join('')
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
function openSearch() {
  document.body.classList.add('searching');
  input.value = '';
  input.focus();
}
function closeSearch() {
  closeResults();
  document.body.classList.remove('searching');
  input.blur();
  $('#search-open').focus({ preventScroll: true });
}
function pickResort(r) {
  closeSearch();
  history.replaceState(null, '', `?resort=${r.id}`);
  stopMotion();
  showResort(r);
}
$('#search-open').addEventListener('click', openSearch);
$('#search-close').addEventListener('click', closeSearch);
addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== input && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openSearch(); }
});
input.addEventListener('focus', () => { renderResults(); });
input.addEventListener('input', renderResults);
input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
  else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); pickResort(hits[active]); }
  else if (e.key === 'Escape') { closeSearch(); }
});
// Pick on a real tap only. Picking on pointerdown (as before) grabbed the first touch of every scroll
// gesture, so the list could never be scrolled on a phone; the browser fires no click after a scroll.
list.addEventListener('click', (e) => {
  const li = e.target.closest('[role=option]');
  if (li) pickResort(hits[Number(li.dataset.i)]);
});
// Keep the field focused when a row is pressed with a mouse (so the list doesn't lose the keyboard on desktop).
list.addEventListener('mousedown', (e) => { if (e.target.closest('[role=option]')) e.preventDefault(); });
// The list stays open when the keyboard is dismissed; it closes with ×, Escape, a pick, or touching the map.
map.on('mousedown', () => { if (document.body.classList.contains('searching')) closeSearch(); });
map.on('touchstart', () => { if (document.body.classList.contains('searching')) closeSearch(); });

// Globe button: zoom out to every resort.
$('#world').addEventListener('click', () => {
  stopMotion();
  flight++;
  $('#card').classList.remove('show');
  map.flyTo({ center: [10, 35], zoom: 1.4, pitch: 0, bearing: 0, duration: reduceMotion ? 0 : 2600, essential: true });
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
// Resort title, legend and hour only make sense inside a resort, not over the world view.
map.on('zoom', () => { document.body.classList.toggle('far', map.getZoom() < 8.5); });
map.on('mousemove', (e) => {
  const over = map.getLayer('resort-dots') && map.getZoom() < 10.5
    && map.queryRenderedFeatures(e.point, { layers: ['resort-dots', 'resort-dot-labels'] }).length;
  map.getCanvas().style.cursor = over ? 'pointer' : '';
});

// --- Controls -----------------------------------------------------------------------------------
$('#toggle3d').addEventListener('click', () => { is3D = !is3D; if (!is3D) stopMotion(); apply3D(true); syncDial(); });
$('#hour').min = String(HOUR_MIN); $('#hour').max = String(HOUR_MAX);
let hourFrame = 0;
// Clock: follows the device's 12/24-hour setting; tapping the time switches it and is remembered.
let twelveHour = store.get('clock') ? store.get('clock') === '12' : deviceUses12h();
let scrubbing = false;
$('#hour-label').addEventListener('click', () => {
  twelveHour = !twelveHour;
  store.set('clock', twelveHour ? '12' : '24');
  $('#hour-label').setAttribute('aria-label', `Time shown in ${twelveHour ? '12' : '24'}-hour format. Switch`);
  applyLight();
});
$('#hour').addEventListener('pointerdown', () => { scrubbing = true; });
// Let go (or a keyboard step finishes): now apply Standard's preset for the final hour.
$('#hour').addEventListener('change', () => { scrubbing = false; applyLight(); });
addEventListener('pointerup', () => { if (scrubbing) { scrubbing = false; applyLight(); } });
$('#hour').addEventListener('input', (e) => {
  hour = Number(e.target.value);
  cancelAnimationFrame(hourFrame);
  hourFrame = requestAnimationFrame(applyLight);  // at most one relight per frame while scrubbing
});
$('#look').addEventListener('click', () => {
  look = LOOK_ORDER[(LOOK_ORDER.indexOf(look) + 1) % LOOK_ORDER.length];
  store.set('map-look', look);
  $('#look').setAttribute('aria-label', `Map style: ${LOOKS[look].label}. Switch style`);
  status(LOOKS[look].label, 1200);
  map.setStyle(LOOKS[look].style, { config: { basemap: { lightPreset: light.preset, ...LOOKS[look].config } } });
});
let markReady;
const ready = new Promise((r) => { markReady = r; });
map.on('style.load', () => { setup(); renderLegend(current); syncDial(); markReady(); });

// Tap a run, lift, cabin or station → card (mirrors featureCard in ResortBrowserView.swift).
map.on('click', (e) => {
  const dot = map.getLayer('resort-dots') && map.getZoom() < 10.5
    && map.queryRenderedFeatures([[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]], { layers: ['resort-dots', 'resort-dot-labels'] })[0];
  if (dot) { pickResort(resorts.find((r) => r.id === dot.properties.id)); return; }
  const layers = ['huts', 'lift-terminals', 'pistes-line', 'pistes-unknown', 'lifts-cable', 'lifts-line', 'lift-cabins', 'lift-structures'].filter((l) => map.getLayer(l));
  stopMotion();
  const pad = 10;
  const f = map.queryRenderedFeatures([[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]], { layers })[0];
  if (!f) { $('#card').classList.remove('show'); return; }
  const p = f.properties;
  if (f.layer.id === 'huts') {
    const what = { hut: 'Mountain hut', restaurant: 'Mountain restaurant', cafe: 'Café', bar: 'Bar', pub: 'Bar',
      biergarten: 'Beer garden', fast_food: 'Snack bar' }[p.kind] ?? 'Mountain hut';
    $('#card b').textContent = p.name || what;
    $('#card small').textContent = p.name ? what : 'On the mountain';
    $('#card .dot').className = 'dot hut';
    $('#card .dot').style.background = '';
    $('#card').classList.add('show');
    return;
  }
  $('#card .dot').className = 'dot';
  const d = DIFF[p['piste:difficulty']];
  const liftType = LIFT_NAMES[p.aerialway ?? p.lift];
  const seats = p['aerialway:occupancy'] ? `${p['aerialway:occupancy']} seats` : '';
  const station = f.layer.id === 'lift-terminals';
  const title = p.name ?? p.ref ?? { pylon: 'Lift tower', cabin: liftType ?? 'Cabin', station: 'Lift station' }[station ? 'station' : p.kind] ?? 'Unnamed';
  const detail = d ? `${runLabel(current.country, p['piste:difficulty'])}${p.ref ? ` · No. ${p.ref}` : ''}`
    : [p.kind === 'station' || station ? 'Station' : null, liftType, seats].filter(Boolean).join(' · ');
  $('#card b').textContent = title;
  $('#card small').textContent = detail;
  // Runs get their colour dot; lifts get a charcoal thread mark, never a run colour.
  $('#card .dot').classList.toggle('lift', !d);
  $('#card .dot').style.background = d ? RUN[p['piste:difficulty']] : '';
  $('#card').classList.add('show');
  if (liftType && p.name) { selectedLift = p.name; applySelection(); }
});
$('#card button').addEventListener('click', () => {
  $('#card').classList.remove('show');
  selectedLift = null;
  applySelection();
});

// --- Living scene: moving cabins, pines, snow, and a frame-budget guard -----------------------------
let tracks = [];
let carsTimer = 0, carsLast = 0;
const sceneT0 = performance.now();
function carsLoop(now) {
  carsTimer = requestAnimationFrame(carsLoop);
  const fps = quality >= 2 ? 15 : 7;
  if (now - carsLast < 1000 / fps) return;
  carsLast = now;
  const b = map.getBounds();
  const view = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  setCabins(carsAt(tracks, (now - sceneT0) / 1000, view, quality >= 2 ? 600 : 300, cabinScale()));
  setSkiers((now - sceneT0) / 1000, view);
}
/** Tiny skiers: placed along the runs, facing left or right on screen the way they're heading. */
let skiTracks = [];
function setSkiers(seconds, view) {
  const src = map.getSource('skiers');
  if (!src) return;
  if (map.getZoom() < 12.5 || !skiTracks.length) { src.setData(empty); return; }
  const fc = skiersAt(skiTracks, seconds, view, quality >= 2 ? 60 : 30, skierScale());
  const bearing = (map.getBearing() * Math.PI) / 180;
  for (const f of fc.features) {
    // Screen-right component of the heading (east/north unit vector rotated by the map bearing).
    const right = f.properties.ux * Math.cos(bearing) - f.properties.uy * Math.sin(bearing);
    f.properties.face = right >= 0 ? 'r' : 'l';
  }
  src.setData(fc);
}
const skierScale = () => { const z = map.getZoom(); return z >= 15 ? 1 : z >= 14 ? 1.4 : 2; };
function placeSnowmen(layers) {
  const terminals = terminalsFrom(layers.lifts).features.map((f) => ({ coordinates: f.geometry.coordinates, kind: 'station' }));
  const huts = (layers.huts?.features ?? []).map((f) => ({ coordinates: f.geometry.coordinates, kind: 'hut' }));
  const avoid = avoidGrid([...layers.pistes.features, ...layers.lifts.features], 16);
  map.getSource('snowmen')?.setData(snowmenNear([...huts, ...terminals], avoid));
}
/** Same cabins twice: 3D boxes, and their centres as dots for the far view. */
function setCabins(fc) {
  map.getSource('cabins')?.setData(fc);
  // Far-view dots: kept at least 14 px apart on screen so they read as a few travelling cabins on the
  // thread, never as a dotted line (which would look like an unclassified run).
  const kept = [];
  for (const f of fc.features) {
    const ring = f.geometry.coordinates[0].slice(0, 4);
    const c = [ring.reduce((a, p) => a + p[0], 0) / 4, ring.reduce((a, p) => a + p[1], 0) / 4];
    const px = map.project(c);
    if (kept.some((k) => Math.hypot(k.px.x - px.x, k.px.y - px.y) < 14)) continue;
    kept.push({ px, f: { type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { lift: f.properties.lift } } });
  }
  map.getSource('cabin-dots')?.setData({ type: 'FeatureCollection', features: kept.map((k) => k.f) });
}
/** Miniature level of detail: cabins drawn larger when zoomed out so the lifts read as lifts on arrival. */
const cabinScale = () => { const z = map.getZoom(); return z >= 14 ? 1 : z >= 13 ? 1.6 : z >= 12 ? 2.3 : 3; };
function carsWanted() {
  return quality >= 1 && !reduceMotion && (is3D && tracks.length || skiTracks.length) && map.getZoom() >= 10.5 && !document.hidden;
}
function updateCars() {
  if (carsWanted()) { if (!carsTimer) carsTimer = requestAnimationFrame(carsLoop); return; }
  if (carsTimer) { cancelAnimationFrame(carsTimer); carsTimer = 0; }
  // Parked (reduced motion, low quality, hidden tab): same miniature scale, standing still.
  setCabins(tracks.length ? carsAt(tracks, 0, null, 1500, cabinScale()) : empty);
  setSkiers(0, null);                              // parked skiers, standing still where they'd be
}

const snow = createSnow($('#snow'), {
  getBearing: () => map.getBearing(),
  // Snow shows in 3D at resort zoom; stronger as you get closer, softer in the dark.
  getStrength: () => (is3D ? Math.max(0, Math.min(1, (map.getZoom() - 11) / 2)) * (light.hud.dark ? 0.6 : 0.85) : 0),
});
function updateSnow() {
  if (is3D && quality >= 2 && !reduceMotion && map.getZoom() >= 11 && !document.hidden) snow.start(); else snow.stop();
}

const pines = {
  timer: 0,
  clear() { map.getSource('pines')?.setData(empty); },
};
const TREELINE = { eu: 2050, na: 3450, asia: 2500 };
function schedulePines() {
  clearTimeout(pines.timer);
  pines.timer = setTimeout(placePines, 350);
}
function placePines() {
  if (!pinesOK || !is3D || quality < 1 || map.getZoom() < 11.5) { pines.clear(); return; }
  const layers = cache.get(current.id);
  const forests = map.querySourceFeatures('streets', { sourceLayer: 'landcover', filter: ['==', ['get', 'class'], 'wood'] });
  const b = map.getBounds();
  const avoid = layers ? avoidGrid([...layers.pistes.features, ...layers.piste_areas.features, ...layers.lifts.features]) : null;
  const pts = scatterPines({
    forests, avoid, bounds: [[b.getWest(), b.getSouth()], [b.getEast(), b.getNorth()]],
    // Miniature level of detail: fewer, bigger trees zoomed out; a denser true-scale forest up close.
    spacingM: map.getZoom() >= 14.5 ? 26 : map.getZoom() >= 13.5 ? 36 : map.getZoom() >= 12.5 ? 60 : 95,
    treeline: TREELINE[schemeFor(current.country)] ?? 2050,
    elevationAt: ([lon, lat]) => map.queryTerrainElevation([lon, lat], { exaggerated: false }),
    max: quality >= 2 ? 1800 : 800,
  });
  // Diorama sizing: taller trees when zoomed out so they still read; near true size up close.
  const z = map.getZoom();
  map.getSource('pines')?.setData(pineShapes(pts, z < 12.5 ? 54 : z < 13.5 ? 36 : z < 14.5 ? 26 : 19));
}
map.on('moveend', () => { schedulePines(); updateEffects(); });

function updateEffects() { updateCars(); updateSnow(); }
map.on('zoomend', updateEffects);
document.addEventListener('visibilitychange', updateEffects);

// Frame-budget guard: if too many frames run long, step effects down (never back up mid-session).
(function watchFrames() {
  let last = performance.now(), slow = 0, total = 0;
  const tick = (now) => {
    const dt = now - last; last = now;
    if (!document.hidden && dt < 500) { total++; if (dt > 40) slow++; }
    if (total >= 90) {
      if (slow / total > 0.3 && quality > 0) {
        quality--;
        updateEffects(); schedulePines();
        status(quality === 1 ? 'Lighter effects for smoother movement' : 'Effects paused for smoother movement', 2500);
      }
      slow = 0; total = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();

await ready;
showResort(current);
window.__preview = {                                    // handy in the console
  map, resorts, get cablesOK() { return cablesOK; }, get pinesOK() { return pinesOK; },
  get quality() { return quality; }, setHour(h) { hour = h; applyLight(); }, get light() { return light; },
  selectLift(name) { selectedLift = name; applySelection(); },
  findResorts, pickResort: (id) => pickResort(resorts.find((r) => r.id === id)),
};
