// Draws the game's icons from one food sprite (the Apple): the favicons at the site root (favicon.ico with 16, 32
// and 64 px, and favicon-32.png), the one inlined in index.html (so the single-page build has it too), and the
// home-screen icons in public/icons/ on the kitchen's tile cream. The sprite is trimmed to its opaque pixels (no
// drop shadow, no margin) so the food fills the icon, and scaled by whole pixels so it stays crisp.
// Usage: node tools/gen-app-icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng, hexToRgb } from './pixel.mjs';

const SOURCE = new URL('../art/units/Apple.png', import.meta.url);
const BG = hexToRgb('#f2ece1'); // the kitchen's tile cream, behind the home-screen icons

const sprite = decodePng(readFileSync(SOURCE));
// Trim to the fully opaque pixels: the drop shadow under a food is see-through, so it goes too.
let [x0, y0, x1, y1] = [sprite.w, sprite.h, -1, -1];
for (let y = 0; y < sprite.h; y++) for (let x = 0; x < sprite.w; x++) {
  if (sprite.rgba[(y * sprite.w + x) * 4 + 3] < 255) continue;
  [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
}
const cw = x1 - x0 + 1;
const ch = y1 - y0 + 1;
const px = (x, y) => sprite.rgba.subarray(((y0 + y) * sprite.w + x0 + x) * 4, ((y0 + y) * sprite.w + x0 + x) * 4 + 4);

/** The trimmed food, `n` times its size, centred on a `size` square: transparent, or on `bg`. */
function icon(size, n, bg) {
  const out = new Uint8ClampedArray(size * size * 4);
  if (bg) for (let i = 0; i < size * size; i++) out.set([...bg, 255], i * 4);
  const ox = Math.floor((size - cw * n) / 2);
  const oy = Math.floor((size - ch * n) / 2);
  for (let y = 0; y < ch * n; y++) for (let x = 0; x < cw * n; x++) {
    const c = px(Math.floor(x / n), Math.floor(y / n));
    if (c[3] < 255) continue; // the drop shadow: a food's only see-through pixels
    const i = ((oy + y) * size + ox + x) * 4;
    out.set(c, i);
  }
  return out;
}

/** Half size, each pixel the average of four (weighted by how opaque they are): the 16 px favicon from the 32. */
function half(rgba, size) {
  const s = size / 2;
  const out = new Uint8ClampedArray(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    let [r, g, b, a] = [0, 0, 0, 0];
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const i = ((y * 2 + dy) * size + x * 2 + dx) * 4;
      const w = rgba[i + 3];
      r += rgba[i] * w;
      g += rgba[i + 1] * w;
      b += rgba[i + 2] * w;
      a += w;
    }
    if (a > 0) out.set([r / a, g / a, b / a, a / 4], (y * s + x) * 4);
  }
  return out;
}

/** An .ico holding PNGs. */
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(1, 2); // icon
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); // colour planes
    head.writeUInt16LE(32, e + 6); // bits per pixel
    head.writeUInt32LE(png.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => Buffer.from(p.png))]);
}

const fit = (size, room) => Math.max(1, Math.floor((size * room) / Math.max(cw, ch)));
const at32 = icon(32, 1);
const fav32 = encodePng(at32, 32, 32);

const root = new URL('../public/', import.meta.url);
writeFileSync(new URL('favicon.ico', root), ico([
  { size: 16, png: encodePng(half(at32, 32), 16, 16) },
  { size: 32, png: fav32 },
  { size: 64, png: encodePng(icon(64, 2), 64, 64) },
]));
writeFileSync(new URL('favicon-32.png', root), fav32);

const dir = new URL('icons/', root);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('icon-192.png', dir), encodePng(icon(192, fit(192, 0.72), BG), 192, 192));
writeFileSync(new URL('icon-512.png', dir), encodePng(icon(512, fit(512, 0.72), BG), 512, 512));
// iOS rounds the corners and adds no margin of its own, so the food sits a little smaller there.
writeFileSync(new URL('apple-touch-icon.png', dir), encodePng(icon(180, fit(180, 0.66), BG), 180, 180));

// index.html's first icon: the same 32 px favicon, inlined (the single-page build keeps only this one).
const html = new URL('../index.html', import.meta.url);
const page = readFileSync(html, 'utf8');
const inlined = `<link rel="icon" type="image/png" href="data:image/png;base64,${fav32.toString('base64')}" />`;
const next = page.replace(/<link rel="icon" (?:type="image\/png" )?href="data:image\/[^"]*" \/>/, inlined);
if (next === page && !page.includes(inlined)) throw new Error('index.html: inlined icon link not found');
writeFileSync(html, next);

console.log(`icons from ${SOURCE.pathname.split('/').pop()} (trimmed to ${cw}x${ch}): public/favicon.ico (16, 32, 64), favicon-32.png, icons/icon-192, icon-512, apple-touch-icon; index.html`);
