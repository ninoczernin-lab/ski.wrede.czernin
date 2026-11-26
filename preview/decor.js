// Cartoon furniture for the map: tiny skiers sliding down the runs, snowmen by the huts and stations,
// and the drawn badges (lift station, hut, snowman, skier) they share one look with.
// The geometry is pure (tested in test/decor.test.mjs); the drawing needs a canvas (browser only).

const M_LAT = 111320;
const mPerLon = (lat) => M_LAT * Math.cos((lat * Math.PI) / 180);
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Jacket colours: bright, and none of them a run colour (green, blue, red, black, orange) or lift violet. */
export const JACKETS = ['#ffd21f', '#ff4fb8', '#12c2c2'];

/**
 * Downhill runs as tracks a skier can follow. OSM draws pistes in the direction you ski them, so the
 * line's own order is downhill. Runs shorter than 120 m get nobody (they're too short to see).
 */
export function skierTracks(pistes) {
  const tracks = [];
  for (const f of pistes?.features ?? []) {
    const p = f.properties ?? {};
    if (p['piste:type'] !== 'downhill') continue;
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
    for (const line of lines) {
      if (line.length < 2) continue;
      const cum = [0];
      for (let i = 1; i < line.length; i++) {
        const [x0, y0] = line[i - 1], [x1, y1] = line[i];
        cum.push(cum[i - 1] + Math.hypot((x1 - x0) * mPerLon(y0), (y1 - y0) * M_LAT));
      }
      const length = cum.at(-1);
      if (length < 120) continue;
      const id = tracks.length;
      // A light sprinkle: one skier per ~700 m of run, never more than three on one run.
      const riders = Math.min(3, Math.max(1, Math.round(length / 700)));
      tracks.push({ id, line, cum, length, riders, bbox: bboxOf(line) });
    }
  }
  return tracks;
}

function bboxOf(line) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of line) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [w, s, e, n];
}

/** Point and heading at distance d (metres) along a track. */
function along(t, d) {
  let i = 1;
  while (i < t.cum.length - 1 && t.cum[i] < d) i++;
  const seg = t.cum[i] - t.cum[i - 1] || 1, k = Math.max(0, Math.min(1, (d - t.cum[i - 1]) / seg));
  const [x0, y0] = t.line[i - 1], [x1, y1] = t.line[i];
  const dx = (x1 - x0) * mPerLon(y0), dy = (y1 - y0) * M_LAT, len = Math.hypot(dx, dy) || 1;
  return { lon: x0 + (x1 - x0) * k, lat: y0 + (y1 - y0) * k, ux: dx / len, uy: dy / len };
}

/**
 * Skiers at a moment in time: each rides its run top to bottom and starts again, carving gentle S-turns
 * across the fall line. `scale` is the miniature level of detail (faster and wider turns when zoomed
 * out, so they read as skiers rather than crawling specks). Returns GeoJSON points.
 */
export function skiersAt(tracks, seconds, view = null, limit = 60, scale = 1) {
  const features = [];
  for (const t of tracks) {
    if (view && (t.bbox[2] < view[0] || t.bbox[0] > view[2] || t.bbox[3] < view[1] || t.bbox[1] > view[3])) continue;
    for (let r = 0; r < t.riders; r++) {
      if (features.length >= limit) return { type: 'FeatureCollection', features };
      const seed = t.id * 7.13 + r * 3.7;
      const speed = (9 + 5 * hash(seed)) * scale;                 // m/s, a relaxed cruise
      const d = ((seconds * speed + hash(seed + 1) * t.length) % t.length + t.length) % t.length;
      const p = along(t, d);
      // S-turns: sideways swing of a few metres with a ~70 m wavelength.
      const swing = Math.sin((d / (70 * scale)) * 2 * Math.PI + hash(seed + 2) * 6) * 5 * scale;
      const lon = p.lon + (-p.uy * swing) / mPerLon(p.lat), lat = p.lat + (p.ux * swing) / M_LAT;
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { jacket: Math.floor(hash(seed + 3) * JACKETS.length), ux: p.ux, uy: p.uy } });
    }
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Snowmen, a light sprinkle: beside most huts and about every third lift station. Each stands at its
 * hut or station; the map layer nudges it a fixed distance sideways on screen, so it is always next to
 * the badge at any zoom or tilt (a spot measured in metres drifts behind the badge as you zoom in).
 */
export function snowmenNear(anchors, max = 40) {
  const out = [];
  anchors.forEach((a, i) => {
    if (out.length >= max) return;
    const [lon, lat] = a.coordinates;
    const seed = Math.round(lon * 1e4) * 0.37 + Math.round(lat * 1e4) * 0.71 + i * 0.01;
    if (hash(seed) > (a.kind === 'hut' ? 0.8 : 0.3)) return;
    out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { snowman: 1 } });
  });
  return { type: 'FeatureCollection', features: out };
}

// --- Drawn icons (browser) ------------------------------------------------------------------------
// One language for every marker: a round badge, a 2 px ink outline, a white rim, a drawn glyph.
export const INK = '#1b2440';
export const LIFT_YELLOW = '#ffc81e';
export const LIFT_VIOLET = '#6a3df0';

function canvas(w, h, pr = 2) {
  const c = document.createElement('canvas');
  c.width = w * pr; c.height = h * pr;
  const g = c.getContext('2d');
  g.scale(pr, pr);
  g.lineJoin = 'round'; g.lineCap = 'round';
  return { c, g, done: () => [{ width: c.width, height: c.height, data: new Uint8Array(g.getImageData(0, 0, c.width, c.height).data.buffer) }, { pixelRatio: pr }] };
}

/** Round badge with soft drop shadow, white rim and ink outline; `glyph(g, cx, cy)` draws inside. */
function badge(fill, glyph, size = 30) {
  const { g, done } = canvas(size, size + 3);
  const cx = size / 2, cy = size / 2, r = size / 2 - 3;
  g.beginPath(); g.arc(cx, cy + 1.5, r, 0, 2 * Math.PI);
  g.fillStyle = 'rgba(20, 28, 60, 0.28)'; g.filter = 'blur(1.5px)'; g.fill(); g.filter = 'none';
  g.beginPath(); g.arc(cx, cy, r, 0, 2 * Math.PI);
  g.fillStyle = '#ffffff'; g.fill();
  g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  g.beginPath(); g.arc(cx, cy, r - 3, 0, 2 * Math.PI);
  g.fillStyle = fill; g.fill();
  glyph(g, cx, cy);
  return done();
}

/** Lift station: sunny-yellow badge with an ink cable car hanging from its cable. */
export function stationIcon() {
  return badge(LIFT_YELLOW, (g, cx, cy) => {
    g.strokeStyle = LIFT_VIOLET; g.fillStyle = INK; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - 9, cy - 7); g.lineTo(cx + 9, cy - 3.5); g.stroke();          // cable
    g.strokeStyle = INK; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(cx, cy - 5.3); g.lineTo(cx, cy - 2); g.stroke();                   // hanger
    g.beginPath(); g.roundRect(cx - 5.5, cy - 2, 11, 9, 2.5); g.fill();                         // cabin
    g.fillStyle = '#ffffff';
    g.beginPath(); g.roundRect(cx - 3.8, cy - 0.4, 3.2, 3.2, 0.8); g.fill();                    // windows
    g.beginPath(); g.roundRect(cx + 0.6, cy - 0.4, 3.2, 3.2, 0.8); g.fill();
  });
}

/** Mountain hut: white badge with a little chalet (wood walls, red roof with snow on it, lit window). */
export function hutIcon() {
  return badge('#ffffff', (g, cx, cy) => {
    g.lineWidth = 1.4; g.strokeStyle = INK;
    g.fillStyle = '#b8743f';
    g.beginPath(); g.rect(cx - 6, cy - 1, 12, 8); g.fill(); g.stroke();                          // walls
    g.fillStyle = '#e8413a';
    g.beginPath(); g.moveTo(cx - 9, cy); g.lineTo(cx, cy - 8); g.lineTo(cx + 9, cy); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(cx - 4.5, cy - 4); g.lineTo(cx, cy - 8); g.lineTo(cx + 4.5, cy - 4); g.lineTo(cx, cy - 5.6); g.closePath(); g.fill();
    g.fillStyle = '#ffd86b';
    g.beginPath(); g.rect(cx - 2, cy + 1.5, 4, 3.5); g.fill(); g.stroke();                      // window
  });
}

/** Snowman, drawn like a sticker: two snowballs, coal eyes, carrot nose, red scarf, ink outline. */
export function snowmanIcon() {
  const w = 22, h = 30, { g, done } = canvas(w, h);
  const ball = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke(); };
  g.beginPath(); g.ellipse(w / 2, h - 2.5, 8, 2, 0, 0, 2 * Math.PI); g.fillStyle = 'rgba(20, 28, 60, 0.22)'; g.fill();
  ball(w / 2, h - 9, 7.2);
  ball(w / 2, h - 19.5, 5.2);
  g.fillStyle = INK;                                                                          // hat
  g.fillRect(w / 2 - 4.5, h - 25.2, 9, 1.8); g.fillRect(w / 2 - 3, h - 29.5, 6, 4.6);
  g.beginPath(); g.arc(w / 2 - 1.9, h - 20.6, 0.9, 0, 2 * Math.PI); g.arc(w / 2 + 1.9, h - 20.6, 0.9, 0, 2 * Math.PI); g.fill();
  g.fillStyle = '#ff8a1f';                                                                    // carrot
  g.beginPath(); g.moveTo(w / 2, h - 19.4); g.lineTo(w / 2 + 4.6, h - 18.4); g.lineTo(w / 2, h - 18); g.closePath(); g.fill();
  g.strokeStyle = '#e8413a'; g.lineWidth = 2.2;                                               // scarf
  g.beginPath(); g.moveTo(w / 2 - 4.4, h - 15); g.lineTo(w / 2 + 4.4, h - 15); g.moveTo(w / 2 + 2.6, h - 15); g.lineTo(w / 2 + 3.6, h - 11.5); g.stroke();
  g.fillStyle = INK;                                                                          // buttons
  g.beginPath(); g.arc(w / 2, h - 11, 0.9, 0, 2 * Math.PI); g.arc(w / 2, h - 7.5, 0.9, 0, 2 * Math.PI); g.fill();
  return done();
}

/** Tiny skier in a bright jacket, side-on and tucked, facing right (`flip` faces left). */
export function skierIcon(jacket, flip = false) {
  const w = 22, h = 22, { g, done } = canvas(w, h);
  if (flip) { g.translate(w, 0); g.scale(-1, 1); }
  g.beginPath(); g.ellipse(11, 19.6, 8, 1.6, 0, 0, 2 * Math.PI); g.fillStyle = 'rgba(20, 28, 60, 0.2)'; g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.7;
  g.beginPath(); g.moveTo(2.5, 17.2); g.lineTo(19, 17.2); g.quadraticCurveTo(20.8, 17.2, 20.8, 15.6); g.stroke();   // skis
  g.lineWidth = 2.4; g.strokeStyle = '#2a3354';
  g.beginPath(); g.moveTo(8.6, 16.6); g.lineTo(10.4, 12.4); g.lineTo(9.2, 9.6); g.stroke();                         // legs
  g.beginPath(); g.moveTo(12.8, 16.6); g.lineTo(13.2, 12.6); g.lineTo(10.6, 9.6); g.stroke();
  g.fillStyle = jacket; g.strokeStyle = INK; g.lineWidth = 1.3;                                                       // jacket
  g.beginPath(); g.ellipse(11.4, 7.6, 3.6, 3.1, -0.5, 0, 2 * Math.PI); g.fill(); g.stroke();
  g.lineWidth = 1.2;                                                                                                   // pole
  g.beginPath(); g.moveTo(13.6, 8.4); g.lineTo(17.6, 15.4); g.stroke();
  g.fillStyle = '#ffd9b8';                                                                                             // face
  g.beginPath(); g.arc(14.4, 3.6, 2.4, 0, 2 * Math.PI); g.fill(); g.stroke();
  g.fillStyle = jacket;                                                                                                // beanie
  g.beginPath(); g.arc(14.2, 2.9, 2.5, Math.PI * 1.05, Math.PI * 1.95); g.closePath(); g.fill(); g.stroke();
  return done();
}
