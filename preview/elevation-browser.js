// Browser version of pipeline/elevation.mjs: same tiles, same maths, decoded with a canvas.
const URL_TEMPLATE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const Z = 14;
const SIZE = 256;
const tiles = new Map();

function loadTile(x, y) {
  const key = `${x}/${y}`;
  if (!tiles.has(key)) {
    tiles.set(key, (async () => {
      const url = URL_TEMPLATE.replace('{z}', Z).replace('{x}', x).replace('{y}', y);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`terrain tile ${Z}/${key}: HTTP ${res.status}`);
      const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const canvas = new OffscreenCanvas(SIZE, SIZE);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      return ctx.getImageData(0, 0, SIZE, SIZE).data;
    })());
  }
  return tiles.get(key);
}

const px = (d, x, y) => { const i = (y * SIZE + x) * 4; return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768; };

export async function elevationAt([lon, lat]) {
  const n = 2 ** Z;
  const fx = ((lon + 180) / 360) * n * SIZE;
  const latR = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n * SIZE;
  const x0 = Math.floor(fx - 0.5), y0 = Math.floor(fy - 0.5);
  const tx = fx - 0.5 - x0, ty = fy - 0.5 - y0;
  const sample = async (gx, gy) =>
    px(await loadTile(Math.floor(gx / SIZE), Math.floor(gy / SIZE)), ((gx % SIZE) + SIZE) % SIZE, ((gy % SIZE) + SIZE) % SIZE);
  const [a, b, c, d] = await Promise.all([sample(x0, y0), sample(x0 + 1, y0), sample(x0, y0 + 1), sample(x0 + 1, y0 + 1)]);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
