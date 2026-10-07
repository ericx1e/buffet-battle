// Draws the home-screen icons (public/icons/) from the pixel cloche favicon in index.html: the 12x12 cloche on the
// kitchen's cream tile colour, scaled up by whole pixels. Usage: node tools/gen-app-icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { encodePng, hexToRgb, upscale } from './pixel.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cells = [...html.matchAll(/<rect x='(\d+)' y='(\d+)' width='1' height='1' fill='%23([0-9a-f]{6})'\/>/g)].map(([, x, y, c]) => [+x, +y, `#${c}`]);
if (cells.length < 50) throw new Error('favicon cloche not found in index.html');
const BG = hexToRgb('#f2ece1'); // the kitchen's tile cream, so the cloche's dark outline reads

/** The cloche centered on a `size` x `size` canvas, scaled by `n`. */
function icon(size, n) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) data.set([...BG, 255], i * 4);
  const off = Math.floor((size - 12) / 2);
  for (const [x, y, c] of cells) data.set([...hexToRgb(c), 255], ((y + off + 1) * size + x + off) * 4);
  return encodePng(upscale(data, size, size, n), size * n, size * n);
}

const dir = new URL('../public/icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('icon-192.png', dir), icon(16, 12)); // 192 px
writeFileSync(new URL('icon-512.png', dir), icon(16, 32)); // 512 px
writeFileSync(new URL('apple-touch-icon.png', dir), icon(15, 12)); // 180 px
console.log('public/icons: icon-192.png, icon-512.png, apple-touch-icon.png');
