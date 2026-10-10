// Draws the game's icons from one food sprite (the Apple, resting on a table in perspective): the favicons at the site root (favicon.ico with 16, 32
// and 64 px, and favicon-32.png), the one inlined in index.html (so the single-page build has it too), and the
// home-screen icons in public/icons/ on the kitchen's tile cream. The sprite is trimmed to its opaque pixels (no
// drop shadow, no margin) so the food fills the icon, and scaled by whole pixels so it stays crisp.
// Usage: node tools/gen-app-icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Sprite, decodePng, encodePng, hexToRgb, ramp } from './pixel.mjs';

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

// The icon is a little scene, drawn once at 32 px: the apple resting on a wooden table that runs back to a vanishing
// point above it, with its shadow under it. Bigger icons are the same scene, scaled up by whole pixels.
const WOOD = hexToRgb('#c98a4e'), NEAR = hexToRgb('#d89a5c'), GRAIN = hexToRgb('#8a5530'), FAR = hexToRgb('#e8b878'), EDGE = hexToRgb('#6e4024');
const TOP = 14; // the table's far edge, just behind the apple (the vanishing point is above it, around y 10)
const halfWidth = (y) => 3 + ((y - TOP) * 13) / 16; // narrow at the far edge, the full width at the near one

function scene() {
  const out = new Uint8ClampedArray(32 * 32 * 4);
  const put = (x, y, c, a = 255) => out.set([...c, a], (y * 32 + x) * 4);
  for (let y = TOP; y < 32; y++) {
    const hw = halfWidth(y);
    for (let x = 0; x < 32; x++) {
      const u = (x + 0.5 - 16) / hw;
      if (Math.abs(u) > 1) continue;
      if (y >= 30) put(x, y, EDGE); // the near edge of the table top, catching shadow
      else if (y === TOP) put(x, y, FAR); // the far edge catches the light
      else {
        // Planks run toward the vanishing point: a dark seam where u crosses a plank line.
        const seam = [-2 / 3, -1 / 3, 0, 1 / 3, 2 / 3].some((k) => Math.abs(u - k) * hw < 0.5);
        put(x, y, seam ? GRAIN : y > 22 ? NEAR : WOOD);
      }
    }
  }
  // The apple's shadow on the table, then the apple (drawn small for the icon), resting just above the near edge.
  const by = 26;
  for (let y = by - 2; y <= by + 1; y++) for (let x = 0; x < 32; x++) {
    const d = ((x + 0.5 - 17) / 7) ** 2 + ((y + 0.5 - by) / 1.6) ** 2;
    const i = (y * 32 + x) * 4;
    if (d <= 1 && out[i + 3]) out.set([out[i] * 0.62, out[i + 1] * 0.62, out[i + 2] * 0.62, 255], i);
  }
  const apple = miniApple();
  for (let i = 0; i < 32 * 32; i++) if (apple[i * 4 + 3] === 255) out.set(apple.subarray(i * 4, i * 4 + 4), i * 4);
  return out;
}
/** The Apple sprite's shapes (tools/gen-foods.mjs) at about half size, its bottom on the table at y 26. */
function miniApple() {
  const s = new Sprite(32, 32);
  const red = ramp('#d4302a');
  s.ball(14, 20, 4.5, 5, red);
  s.ball(18, 20, 4.5, 5, red);
  s.ball(16, 21, 5.5, 4.5, red);
  s.px(16, 15, red[4]);
  s.tube([[16, 15], [16.6, 12.5], [17.2, 11.5]], 0.7, ramp('#a8693a'));
  s.ball(19.5, 12, 2.2, 1.2, ramp('#5aa63a'));
  s.clean();
  s.outline();
  return s.data;
}
const SCENE = scene();

/** The 32 px scene, `n` times its size, centred on a `size` square: transparent, or on `bg`. */
function icon(size, n, bg) {
  const out = new Uint8ClampedArray(size * size * 4);
  if (bg) for (let i = 0; i < size * size; i++) out.set([...bg, 255], i * 4);
  const o = Math.floor((size - 32 * n) / 2);
  for (let y = 0; y < 32 * n; y++) for (let x = 0; x < 32 * n; x++) {
    const i = (Math.floor(y / n) * 32 + Math.floor(x / n)) * 4;
    if (SCENE[i + 3] === 0) continue;
    out.set(SCENE.subarray(i, i + 4), ((o + y) * size + o + x) * 4);
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

const fit = (size, room) => Math.max(1, Math.floor((size * room) / 32));
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
writeFileSync(new URL('icon-192.png', dir), encodePng(icon(192, fit(192, 0.9), BG), 192, 192));
writeFileSync(new URL('icon-512.png', dir), encodePng(icon(512, fit(512, 0.9), BG), 512, 512));
// iOS rounds the corners and adds no margin of its own, so the food sits a little smaller there.
writeFileSync(new URL('apple-touch-icon.png', dir), encodePng(icon(180, fit(180, 0.85), BG), 180, 180));

// index.html's first icon: the same 32 px favicon, inlined (the single-page build keeps only this one).
const html = new URL('../index.html', import.meta.url);
const page = readFileSync(html, 'utf8');
const inlined = `<link rel="icon" type="image/png" href="data:image/png;base64,${fav32.toString('base64')}" />`;
const next = page.replace(/<link rel="icon" (?:type="image\/png" )?href="data:image\/[^"]*" \/>/, inlined);
if (next === page && !page.includes(inlined)) throw new Error('index.html: inlined icon link not found');
writeFileSync(html, next);

console.log(`icons from ${SOURCE.pathname.split('/').pop()} (trimmed to ${cw}x${ch}): public/favicon.ico (16, 32, 64), favicon-32.png, icons/icon-192, icon-512, apple-touch-icon; index.html`);
