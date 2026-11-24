// Time of day → light. One hour value (5.5–21) drives the sun, the sky gradient, the relief
// shading, the 3D lights and the HUD tint, interpolated between keyframes so scrubbing is smooth.

const KEYS = [
  // hour, sky (horizon), sky (zenith), space, sun colour, sun strength, sun height above horizon (°),
  // ambient colour, ambient strength, shade shadow, shade highlight, shade accent, stars
  [5.5, '#2b3559', '#141b3a', '#0b1028', '#7f8fd0', 0.0, -6, '#6676b4', 0.36, '#26335c', '#8d9bd0', '#18213f', 0.35],
  [7.0, '#f7cfbf', '#9a8fd2', '#c9b6e6', '#ffb48a', 0.45, 8, '#cbb9e6', 0.46, '#58568f', '#ffe7d8', '#3a3a6c', 0],
  [9.0, '#e9f1fa', '#7eb2e6', '#b9d5f2', '#fff0da', 0.65, 30, '#d4e0f1', 0.5, '#3c5679', '#ffffff', '#24344f', 0],
  [12.5, '#f2f7fc', '#5aa6e8', '#a8cef2', '#ffffff', 0.75, 46, '#dce7f5', 0.55, '#41618d', '#ffffff', '#253752', 0],
  [16.0, '#f6eee6', '#77a8dc', '#b4cfee', '#ffe7c3', 0.7, 28, '#e3e2ee', 0.52, '#455a85', '#fffaf0', '#2a3753', 0],
  [17.7, '#ffcf9e', '#e7887b', '#f2b28c', '#ffaf58', 0.7, 9, '#f1c6b1', 0.46, '#594885', '#ffe0b0', '#35295a', 0],
  [19.1, '#8d86c3', '#484d91', '#2c336e', '#ff8a6b', 0.22, -2, '#8a8ec8', 0.4, '#2f3367', '#c2b7e6', '#1d2147', 0.1],
  [21.0, '#1c2446', '#0c1230', '#060a1d', '#8090d0', 0.0, -10, '#5a6aa8', 0.34, '#1c2447', '#7c8bc3', '#121a36', 0.4],
];
export const HOUR_MIN = KEYS[0][0];
export const HOUR_MAX = KEYS.at(-1)[0];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
const lerp = (a, b, t) => a + (b - a) * t;
const luminance = (h) => {
  const [r, g, b] = hex(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Which of Mapbox Standard's four built-in light presets suits this hour (for its own night lights etc.). */
export const presetFor = (h) => (h < 6.4 ? 'night' : h < 8.2 ? 'dawn' : h < 17.2 ? 'day' : h < 20.2 ? 'dusk' : 'night');

/** Human name of the part of the day. */
export const dayPart = (h) => (h < 6.4 ? 'Before dawn' : h < 8.2 ? 'Sunrise' : h < 11 ? 'Morning' : h < 14 ? 'Midday'
  : h < 17 ? 'Afternoon' : h < 18.6 ? 'Golden hour' : h < 20.2 ? 'Blue hour' : 'Night');

export const formatHour = (h) => {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * Everything the map and HUD need for one hour.
 * Sun azimuth swings east (morning) → south (noon) → west (evening), as in the northern Alps;
 * for southern-hemisphere resorts pass south = true and it swings through north instead.
 */
export function lightAt(hour, { south = false } = {}) {
  const h = Math.min(HOUR_MAX, Math.max(HOUR_MIN, hour));
  let i = KEYS.findIndex((k) => k[0] > h) - 1;
  if (i < 0) i = KEYS.length - 2;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = (h - a[0]) / (b[0] - a[0]);
  const c = (k) => mix(a[k], b[k], t), n = (k) => lerp(a[k], b[k], t);

  const azimuthNorth = 90 + (h - 6) * 15;                 // 6:00 east, 12:00 south, 18:00 west
  const azimuth = ((south ? 180 - azimuthNorth : azimuthNorth) + 360) % 360;
  const altitude = n(6);
  const sunUp = altitude > 0;
  const horizon = c(1), zenith = c(2);
  const dark = luminance(horizon) < 0.22;

  return {
    hour: h, preset: presetFor(h), part: dayPart(h), azimuth, altitude,
    fog: {
      range: [0.6, 9], color: horizon, 'high-color': zenith, 'space-color': c(3),
      'horizon-blend': lerp(0.08, 0.2, Math.min(1, Math.abs(12.5 - h) / 6)),
      'star-intensity': n(12),
    },
    lights: [
      { id: 'ambient', type: 'ambient', properties: { color: c(7), intensity: n(8) } },
      { id: 'sun', type: 'directional', properties: {
        // [azimuth, polar angle from straight up]; keep the light just above the horizon when the sun is down
        direction: [azimuth, Math.min(88, 90 - Math.max(altitude, 2))],
        color: c(4), intensity: sunUp ? n(5) : Math.max(0, n(5)),
        'cast-shadows': sunUp, 'shadow-intensity': sunUp ? 0.75 : 0 } },
    ],
    shade: {
      'hillshade-shadow-color': c(9), 'hillshade-highlight-color': c(10), 'hillshade-accent-color': c(11),
      'hillshade-illumination-direction': azimuth,
    },
    // Low sun rakes across ridges: stronger relief at sunrise and golden hour.
    relief: lerp(0.95, 0.75, Math.min(1, Math.max(0, altitude) / 45)),
    hud: { skyTop: zenith, skyBottom: horizon, dark },
  };
}
