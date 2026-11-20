// Ground elevation (metres above sea level) from the free AWS Terrain Tiles (Terrarium encoding).
// Tiles are cached in memory and on disk (pipeline/.tile-cache), so re-runs are fast and polite.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(here, '.tile-cache');
const URL_TEMPLATE = process.env.TERRAIN_URL ?? 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const Z = 14;   // ~6.5 m per pixel in the Alps
const SIZE = 256;

const tiles = new Map();

async function loadTile(x, y) {
  const key = `${Z}/${x}/${y}`;
  if (!tiles.has(key)) {
    tiles.set(key, (async () => {
      const file = path.join(CACHE, `${Z}-${x}-${y}.png`);
      let buf = await fs.readFile(file).catch(() => null);
      if (!buf) {
        const url = URL_TEMPLATE.replace('{z}', Z).replace('{x}', x).replace('{y}', y);
        const res = await fetch(url, { headers: { 'User-Agent': 'ski-maps-pipeline/0.1' } });
        if (!res.ok) throw new Error(`terrain tile ${key}: HTTP ${res.status}`);
        buf = Buffer.from(await res.arrayBuffer());
        await fs.mkdir(CACHE, { recursive: true });
        await fs.writeFile(file, buf);
      }
      return PNG.sync.read(buf).data;
    })());
  }
  return tiles.get(key);
}

const pixelElevation = (data, px, py) => {
  const i = (py * SIZE + px) * 4;
  return data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
};

/** Bilinear-interpolated ground elevation at [lon, lat]. */
export async function elevationAt([lon, lat]) {
  const n = 2 ** Z;
  const fx = ((lon + 180) / 360) * n * SIZE;
  const latR = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n * SIZE;
  const x0 = Math.floor(fx - 0.5), y0 = Math.floor(fy - 0.5);
  const tx = fx - 0.5 - x0, ty = fy - 0.5 - y0;
  const sample = async (gx, gy) => {
    const data = await loadTile(Math.floor(gx / SIZE), Math.floor(gy / SIZE));
    return pixelElevation(data, ((gx % SIZE) + SIZE) % SIZE, ((gy % SIZE) + SIZE) % SIZE);
  };
  const [a, b, c, d] = await Promise.all([
    sample(x0, y0), sample(x0 + 1, y0), sample(x0, y0 + 1), sample(x0 + 1, y0 + 1),
  ]);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
