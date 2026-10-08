// Generates the 640x360 pixel-art kitchen background (art/scenes/kitchen.png) from the layout in DESIGN.md.
// Usage: node tools/gen-kitchen.mjs [--preview out.png] [--guide]
//   --preview  also writes a 3x nearest-neighbour preview
//   --guide    outlines the gameplay slots in magenta (for checking alignment, not for the game)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname } from 'node:path';

const W = 640;
const H = 360;

/** Top-left corners of the 40x48 gameplay slots, shared with the game so the art and the slots line up. */
const SLOTS = JSON.parse(readFileSync(new URL('../src/ui/kitchen-layout.json', import.meta.url), 'utf8'));
const buf = new Uint8Array(W * H * 4);

// ---------- palette ----------
const P = {
  outline: '#2a1b14',
  wall: '#f0e2c6', wallStripe: '#e8d7b6',
  woodDark: '#6e4024', wood: '#a3633a', woodMid: '#bd7c48', woodLight: '#d89c62', woodHi: '#ecbf86',
  cubby: '#4e2b17', cubbyShade: '#3c2011', cubbyTeal: '#2f5553', cubbyTealShade: '#24423f',
  block1: '#d39a5f', block2: '#c78c53', block3: '#dba76d', blockGrain: '#b67b45', blockShade: '#a86f3e',
  tile: '#f6f2ea', tileShade: '#e3dccf', grout: '#bdb3a3',
  fridge: '#e6efec', fridgeShade: '#c4d3d0', fridgeDark: '#8ea4a3', fridgeHi: '#f7fbfa',
  glass: '#cfe8ee', glassHi: '#eef9fb', glassDark: '#9cc6d2', interior: '#e4f2f5',
  steel: '#b5c0c6', steelDark: '#76848d', steelHi: '#e4eaee',
  brass: '#e2b043', brassHi: '#fbe395', brassDark: '#a06d1c',
  black: '#3a302c', blackHi: '#5a4d47',
  chalk: '#2e3b33', chalkSmudge: '#3b4a40', chalkLine: '#d9e2d6',
  paper: '#fbf2da', paperShade: '#e8d6ae', paperLine: '#e4dcc6',
  red: '#c3443a', redDark: '#8a2b24', redHi: '#e06b5b',
  sage: '#8aa58f', sageDark: '#5f7a66', sageHi: '#adc6b1',
  leaf: '#5d9c45', leafDark: '#3d6d2f', leafHi: '#8ec86a',
  terracotta: '#c26a43', terracottaDark: '#8c4428',
  crock: '#5f86b0', crockDark: '#3f5f82', crockHi: '#8fb0d2',
  plate: '#ffffff', plateRim: '#e8edf0', plateShade: '#c6d0d6', plateEdge: '#8d9aa2',
  jar: '#d6ebee', jarEdge: '#7fa5ac', coin: '#f2c94c', coinDark: '#b8892a', cork: '#b88452', corkDark: '#7f5531',
  bin: '#6f8a74', binDark: '#4a6150', binHi: '#a1b8a4',
  spicy: '#e4502a', sweet: '#e86fa8', sour: '#e3c13a', salty: '#5f8eb0', savory: '#9a5d33',
  spicyDark: '#a53318', sweetDark: '#b24479', sourDark: '#a8891c', saltyDark: '#3f6788', savoryDark: '#6a3d1f',
  guide: '#ff00ff',
};

const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const cache = new Map();
/** While a prop is being drawn, pixels go to its own transparent layer instead of the scene (see `prop`). */
let layer = null;
function px(x, y, c, target = layer ?? buf) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  let v = cache.get(c);
  if (!v) cache.set(c, (v = rgb(c)));
  const i = (y * W + x) * 4;
  target[i] = v[0];
  target[i + 1] = v[1];
  target[i + 2] = v[2];
  target[i + 3] = 255;
}
function rect(x, y, w, h, c) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px(i, j, c);
}
function frame(x, y, w, h, c) {
  rect(x, y, w, 1, c);
  rect(x, y + h - 1, w, 1, c);
  rect(x, y, 1, h, c);
  rect(x + w - 1, y, 1, h, c);
}
/** Filled box with a 1px outline, a highlight on the top/left and shade on the bottom/right. */
function panel(x, y, w, h, fill, hi, shade, outline = P.outline) {
  rect(x, y, w, h, fill);
  rect(x + 1, y + 1, w - 2, 1, hi);
  rect(x + 1, y + 1, 1, h - 2, hi);
  rect(x + 1, y + h - 2, w - 2, 1, shade);
  rect(x + w - 2, y + 1, 1, h - 2, shade);
  frame(x, y, w, h, outline);
}
function ellipse(cx, cy, rx, ry, c) {
  for (let j = -ry; j <= ry; j++) {
    const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (j * j) / (ry * ry || 1))));
    rect(cx - span, cy + j, span * 2 + 1, 1, c);
  }
}
function roundRect(x, y, w, h, r, c) {
  rect(x + r, y, w - 2 * r, h, c);
  rect(x, y + r, w, h - 2 * r, c);
  for (const [ox, oy] of [[x + r, y + r], [x + w - 1 - r, y + r], [x + r, y + h - 1 - r], [x + w - 1 - r, y + h - 1 - r]]) ellipse(ox, oy, r, r, c);
}

/**
 * Objects the game animates (bell, bin, jars) are drawn on their own transparent layer and saved as separate
 * sprites in art/scenes/props/, with their positions in src/ui/kitchen-props.json. The scene keeps only their
 * shadows, so a sprite can hop or rattle without dragging a patch of counter along with it.
 */
const props = {};
const propLayers = {};
function prop(name, draw) {
  layer = new Uint8Array(W * H * 4);
  draw();
  propLayers[name] = layer;
  layer = null;
}

// Deterministic noise so the image is the same every run.
let seed = 1234567;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

// ---------- wall ----------
rect(0, 0, W, H, P.wall);
for (let x = 0; x < W; x += 16) rect(x, 0, 8, H, P.wallStripe);

// ---------- order rail (0..24) ----------
panel(0, 0, W, 24, P.woodMid, P.woodHi, P.wood);
rect(0, 22, W, 2, P.woodDark);
rect(140, 11, 360, 4, P.steel);
rect(140, 11, 360, 1, P.steelHi);
rect(140, 14, 360, 1, P.steelDark);
for (const x of [138, 498]) panel(x, 9, 5, 8, P.steelDark, P.steelHi, P.outline);
// Blank order ticket (the game prints the turn on it)
rect(298, 8, 44, 15, P.paper);
frame(298, 8, 44, 15, P.paperShade);
for (let x = 299; x < 341; x += 4) px(x, 22, P.paperShade);
rect(316, 10, 8, 3, P.steelDark);

// ---------- upper cabinet = market (80..480, 24..112) ----------
panel(80, 26, 400, 86, P.woodMid, P.woodHi, P.wood);
panel(76, 24, 408, 7, P.woodLight, P.woodHi, P.wood); // crown molding
for (let i = 0; i < 8; i++) {
  const ox = 86 + 48 * i;
  const teal = i >= 6;
  rect(ox, 36, 44, 64, teal ? P.cubbyTeal : P.cubby);
  rect(ox, 36, 44, 6, teal ? P.cubbyTealShade : P.cubbyShade); // shadow under the shelf above
  rect(ox, 36, 2, 64, teal ? P.cubbyTealShade : P.cubbyShade);
  frame(ox - 1, 35, 46, 66, P.outline);
  panel(ox - 1, 98, 46, 6, P.woodLight, P.woodHi, P.wood); // shelf lip
}
// Thicker divider between foods and items
rect(372, 34, 6, 70, P.woodDark);
rect(373, 34, 1, 70, P.woodMid);
panel(80, 104, 400, 8, P.wood, P.woodLight, P.woodDark); // bottom rail
// Open glass doors folded back at both ends
for (const x of [74, 480]) {
  panel(x, 32, 6, 76, P.glass, P.glassHi, P.glassDark);
  px(x + 2, 44, P.brass);
  px(x + 2, 92, P.brass);
}

// ---------- spice rack (480..640, 24..64) ----------
panel(486, 26, 150, 36, P.wood, P.woodLight, P.woodDark);
// One spice per flavor, coloured like that flavor's icon (src/ui/icons.ts): [fill, top-of-pile shade, speck]
const jars = [
  ['spicy: chili flakes', '#d23a3a', '#9e2238', '#ff8a6a'],
  ['sweet: pink sugar', '#ef6fa6', '#c24c84', '#ffd0e4'],
  ['sour: lemon zest', '#f2c94c', '#c8952f', '#fff0a8'],
  ['salty: sea salt', '#c8e0ee', '#9cc4dc', '#ffffff'],
  ['savory: bouillon', '#8a5a32', '#6a4224', '#b8763f'],
];
jars.forEach(([, c, d, speck], j) => prop(`spice${j}`, () => {
  const x = 494 + 29 * j;
  rect(x, 37, 16, 18, P.jar);
  rect(x + 1, 45, 14, 10, c); // ground spice
  rect(x + 1, 45, 14, 1, d);
  for (const [sx, sy] of [[3, 48], [8, 50], [12, 47], [5, 52], [10, 53]]) px(x + sx, sy, speck);
  rect(x + 2, 38, 1, 14, P.glassHi);
  frame(x, 37, 16, 18, P.jarEdge);
  panel(x - 1, 31, 18, 7, '#4a4240', '#6b615d', '#2f2927'); // matching dark lids
}));
panel(484, 55, 154, 7, P.woodLight, P.woodHi, P.wood); // shelf

// ---------- chalkboard (480..640, 64..148) ----------
panel(484, 66, 154, 80, P.woodMid, P.woodHi, P.wood);
rect(489, 71, 144, 66, P.chalk);
frame(488, 70, 146, 68, P.outline);
for (let k = 0; k < 200; k++) px(490 + Math.floor(rand() * 142), 72 + Math.floor(rand() * 64), P.chalkSmudge);
rect(492, 74, 18, 1, P.chalkSmudge); // old erased line
panel(486, 138, 150, 6, P.woodLight, P.woodHi, P.wood); // chalk tray
rect(600, 136, 9, 2, P.chalkLine);

// ---------- backsplash tiles (80..480, 112..148) ----------
rect(80, 112, 400, 36, P.grout);
for (let row = 0; row < 5; row++) {
  const y = 112 + row * 8;
  const off = row % 2 ? 8 : 0;
  for (let x = 80 - off; x < 480; x += 16) {
    rect(Math.max(80, x + 1), y + 1, Math.min(15, 480 - x - 1), 7, P.tile);
    rect(Math.max(80, x + 1), y + 7, Math.min(15, 480 - x - 1), 1, P.tileShade);
  }
}
rect(80, 112, 400, 3, P.tileShade); // shadow under the cabinet
rect(80, 112, 400, 1, P.grout);

// Refill sign hanging from the cabinet
for (const x of [406, 466]) rect(x, 104, 1, 12, P.outline);
panel(396, 115, 80, 24, P.woodLight, P.woodHi, P.wood);
rect(400, 119, 72, 16, P.red);
rect(402, 121, 68, 12, P.paper);
frame(400, 119, 72, 16, P.redDark);

// ---------- counter top: butcher block (80..640, 148..324) ----------
for (let x = 80; x < 640; x += 10) {
  const c = [P.block1, P.block2, P.block3][Math.floor(x / 10) % 3];
  rect(x, 148, 10, 176, c);
  rect(x, 148, 1, 176, P.blockGrain);
  for (let k = 0; k < 10; k++) rect(x + 2 + Math.floor(rand() * 7), 150 + Math.floor(rand() * 170), 1, 3 + Math.floor(rand() * 8), P.blockGrain);
}
rect(80, 148, 560, 3, P.blockShade); // shadow line against the backsplash
rect(80, 148, 560, 1, P.outline);

// Platter (your plate): 120..240 x 160..324
roundRect(124, 165, 120, 160, 10, P.blockShade); // shadow
roundRect(119, 159, 122, 166, 11, P.plateEdge);
roundRect(120, 160, 120, 164, 10, P.plateRim);
roundRect(126, 166, 108, 152, 7, P.plate);
rect(130, 164, 100, 1, P.plate); // rim highlight
for (const [sx, sy] of SLOTS.plate.flat()) ellipse(sx + 20, sy + 40, 13, 2, P.plateRim); // where a food stands
// "front ->" arrow on the rim
rect(198, 162, 22, 1, P.plateShade);
for (let k = 0; k < 3; k++) rect(217 + k, 160 + k, 1, 5 - 2 * k, P.plateShade);

// ---------- counter props (bell, tip jar, scrap bin) ----------
// Each prop is a shape function returning a colour (or null) per pixel; `blob` adds a 1px outline in the
// prop's own dark hue. Shading matches the rest of the scene (see `panel`): one flat colour per material with
// a thin highlight on the top-left edge and a thin shade on the bottom-right edge. No gradients or cast shadows.
/** ramp = [unused, highlight, fill, shade, unused]; nx/ny are the position inside the shape, -1..1. */
function lit(nx, ny, ramp) {
  const r = Math.hypot(nx, ny);
  if (r > 0.62 && nx + ny < -0.3) return ramp[1];
  if (r > 0.8 && nx + ny > 0.5) return ramp[4]; // dark core along the shadow edge
  if (r > 0.55 && nx + ny > 0.25) return ramp[3];
  return ramp[2];
}
/** Cylinder side: a 2-3px highlight band on the left, a shade band and a dark core line on the right. */
const side = (t, ramp) => (t < -0.72 ? ramp[1] : t > 0.88 ? ramp[4] : t > 0.6 ? ramp[3] : ramp[2]);
/** Blends `hex` over the pixel already there (used for glass). On a prop layer it becomes a see-through pixel. */
function tint(x, y, hex, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const [r, g, b] = rgb(hex);
  const i = (y * W + x) * 4;
  if (layer) {
    layer.set([r, g, b, Math.round(a * 255)], i);
    return;
  }
  buf[i] = Math.round(buf[i] * (1 - a) + r * a);
  buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + g * a);
  buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + b * a);
}
/**
 * Draws a shape with a 1px outline. `heavy` (the default for props) uses the scene's dark outline colour and
 * adds a second outline pixel on the bottom and right edges, which gives objects weight without bloating them.
 */
function blob(x0, y0, x1, y1, colorAt, outline, heavy = true, cast = false) {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const m = new Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = colorAt(x0 + x, y0 + y);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : m[y * w + x]);
  // Drop stray single pixels at the tips of ellipses before outlining.
  const solid = (x, y) => {
    if (!at(x, y)) return false;
    return [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].filter(Boolean).length > 1;
  };
  const line = heavy ? P.outline : outline;
  // Cast shadow: the silhouette offset down-right in the counter's shadow colour, like the platter's. It stays
  // painted on the counter even when the prop is its own sprite, so the prop can hop off its shadow.
  if (cast) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (solid(x, y)) px(x0 + x + 4, y0 + y + 3, P.blockShade, buf);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid(x, y)) continue;
      const c = at(x, y);
      const edge = !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1);
      if (edge && line) px(x0 + x, y0 + y, line);
      else if (c.startsWith('~')) tint(x0 + x, y0 + y, c.slice(1), 0.4); // '~#rrggbb' = see-through glass
      else px(x0 + x, y0 + y, c);
      if (heavy) {
        if (!solid(x + 1, y)) px(x0 + x + 1, y0 + y, line);
        if (!solid(x, y + 1)) px(x0 + x, y0 + y + 1, line);
      }
    }
  }
}
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const shadow = () => {}; // props sit flat on the counter like the rest of the scene

const BRASS = ['#fff4c2', '#f6d36b', '#e2ac3c', '#b97c23', '#7f4f14'];
const STEEL = ['#ffffff', '#e6ecef', '#c3ccd2', '#929da5', '#66717a'];
const LEAF = ['#c8ef9a', '#93d066', '#62a845', '#447f33', '#2f5d25'];

// Service bell: brass dome seated in the middle of a black lacquered base.
prop('bell', () => {
  const cx = 280, baseY = 304; // baseY = centre of the base's top face
  const TOP = ['#7c6f6a', '#6a5e59', '#54484400', '#3d3431', '#2c2422'];
  // Base: oval top face plus a 4px front band, outlined, casting the counter shadow.
  blob(cx - 23, baseY - 6, cx + 23, baseY + 10, (x, y) => {
    if (inEllipse(x, y, cx, baseY, 22, 5)) {
      // Top face: flat, with a lighter rim along its front-left edge
      const front = !inEllipse(x, y - 1, cx, baseY, 22, 5);
      return front && x < cx + 8 ? '#6a5e59' : '#4a3f3b';
    }
    const band = y >= baseY && y <= baseY + 4 && Math.abs(x - cx) <= 22;
    if (band || (y > baseY + 4 && inEllipse(x, y, cx, baseY + 4, 22, 5))) {
      const t = (x - cx) / 22;
      return t < -0.75 ? '#4e4440' : t > 0.7 ? '#1f1918' : '#2f2725';
    }
    return null;
  }, P.outline, true, true);
  // Dome: a half-sphere whose flat bottom sits on the centre line of the base's top face.
  const rx = 15, ry = 15;
  blob(cx - rx, baseY - ry, cx + rx, baseY, (x, y) => {
    const nx = (x - cx) / rx;
    const ny = (y - baseY) / ry;
    if (nx * nx + ny * ny > 1) return null;
    return lit(nx, ny, BRASS);
  }, P.outline);
  // Brass collar where the dome meets the base
  rect(cx - rx, baseY - 1, rx * 2 + 1, 2, BRASS[3]);
  rect(cx - rx + 1, baseY - 1, 6, 1, BRASS[2]);
  rect(cx - rx - 1, baseY - 1, 1, 2, P.outline);
  rect(cx + rx + 1, baseY - 1, 1, 2, P.outline);
  // Plunger: rod running into the top of the dome, capped with a knob
  const rodTop = baseY - ry - 6;
  rect(cx - 2, rodTop, 4, 8, P.outline);
  rect(cx - 1, rodTop, 2, 8, BRASS[2]);
  rect(cx - 1, rodTop, 1, 8, BRASS[1]);
  rect(cx - 3, rodTop - 3, 7, 4, P.outline);
  rect(cx - 2, rodTop - 2, 5, 2, BRASS[2]);
  rect(cx - 2, rodTop - 2, 2, 1, BRASS[1]);
  rect(cx + 2, rodTop - 1, 1, 1, BRASS[3]);
});

// Tip jar: glass mason jar with a pile of coins and a blank label for the gold count.
prop('tipjar', () => {
  const cx = 332, neckTop = 257, bodyTop = 265, bottom = 310, rx = 15;
  shadow(cx + 3, bottom + 4, 18);
  const GLASS = ['#ffffff', '#eef8f6', '#d4ebe7', '#b4d3cf', '#93b8b4'];
  const coinTop = (x) => 292 + Math.round(5 * ((x - cx) / rx) ** 2);
  blob(cx - rx, neckTop - 3, cx + rx, bottom + 3, (x, y) => {
    const t = (x - cx) / rx;
    // Opening seen from above
    if (y <= neckTop + 2 && inEllipse(x, y, cx, neckTop, 12, 3)) {
      return inEllipse(x, y, cx, neckTop + 1, 10, 2) ? '#7da3a1' : GLASS[1];
    }
    // Threaded neck
    if (y > neckTop && y < bodyTop) {
      if (Math.abs(x - cx) > 12) return null;
      return y === neckTop + 3 || y === neckTop + 6 ? GLASS[4] : side((x - cx) / 12, GLASS);
    }
    // Body with a rounded bottom
    const inBody = y <= bottom ? Math.abs(t) <= 1 && y >= bodyTop : inEllipse(x, y, cx, bottom, rx, 3);
    if (!inBody) return null;
    if (y === bodyTop || y === bodyTop + 1) return Math.abs(t) > 0.85 ? null : GLASS[2]; // shoulder
    // Label (blank, for the gold count)
    if (y >= 274 && y <= 286 && x >= cx - 10 && x <= cx + 10) {
      if (y === 274 || y === 286) return '#d9c89f';
      return x >= cx + 8 ? '#eadcb8' : '#fbf2da';
    }
    // Coins inside: rows of small flat coins (bright top face, darker rim), staggered row to row
    if (y >= coinTop(x)) {
      const row = Math.floor((bottom + 3 - y) / 3);
      const rowY = bottom + 2 - row * 3; // y of this row's rim
      const off = row % 2 ? 4 : 0;
      const k = Math.round((x - (cx - 14) - off) / 7);
      const ccx = cx - 14 + off + 7 * k;
      if (Math.abs(x - ccx) <= 3) {
        if (y === rowY) return x > ccx ? '#a8781f' : '#c8952f'; // rim
        return x === ccx - 3 ? '#fbe08a' : '#f2c94c'; // face, lit on its left edge like everything else
      }
      return '#8d661c'; // gap between coins
    }
    // Glass: the counter shows through, tinted, with highlight streaks and a darker right edge
    if (t > -0.72 && t < -0.55) return GLASS[0];
    if (t > -0.45 && t < -0.38) return GLASS[1];
    return t > 0.7 ? GLASS[4] : t > 0.45 ? '~#9ec3bf' : '~#cfe9e5';
  }, '#4f7472', true, true);
});

// Scrap bin: brushed-steel pedal bin with a domed lid and a compost leaf badge.
prop('bin', () => {
  const cx = 392, lidY = 252, bodyTop = 256, bottom = 309, rx = 25;
  shadow(cx + 4, bottom + 5, 30);
  blob(cx - rx - 2, lidY - 9, cx + rx + 2, bottom + 4, (x, y) => {
    const t = (x - cx) / rx;
    // Lid handle
    if (y >= lidY - 9 && y <= lidY - 7 && Math.abs(x - cx) <= 6) return y === lidY - 9 ? STEEL[1] : STEEL[3];
    if (y > lidY - 7 && y <= lidY - 5 && (x === cx - 5 || x === cx + 5)) return STEEL[4];
    // Domed lid
    if (y <= lidY + 2 && inEllipse(x, y, cx, lidY + 1, rx + 2, 6)) return lit((x - cx) / (rx + 3), (y - lidY - 1) / 7, STEEL);
    if (y > lidY + 2 && y <= bodyTop && Math.abs(x - cx) <= rx + 1) return side((x - cx) / (rx + 1), STEEL.map((c, i) => [c, '#d6dde2', '#aeb8bf', '#808b93', '#58626a'][i]));
    // Body
    const inBody = y <= bottom ? Math.abs(t) <= 1 && y > bodyTop : inEllipse(x, y, cx, bottom, rx, 4);
    if (!inBody) return null;
    if (y === 266 || y === 299) return STEEL[4]; // pressed ridges
    if (y === 267 || y === 300) return STEEL[1];
    // Pedal at the front bottom
    if (y >= bottom - 2 && Math.abs(x - cx) <= 7) return y === bottom - 2 ? '#5a5250' : '#2c2726';
    // Leaf badge
    if (inEllipse(x, y, cx, 283, 5, 7)) return x === cx ? LEAF[4] : lit((x - cx) / 5.5, (y - 283) / 7.5, LEAF);
    return side(t, STEEL);
  }, '#363e45', true, true);
});

// Cookbook on a stand: 432..632 x 156..316
panel(436, 300, 196, 12, P.woodMid, P.woodHi, P.woodDark); // ledge
rect(462, 312, 6, 6, P.woodDark);
rect(602, 312, 6, 6, P.woodDark);
panel(436, 162, 196, 140, P.red, P.redHi, P.redDark); // cover
rect(441, 296, 186, 4, P.paperShade); // page stack
for (let y = 297; y < 300; y += 2) rect(441, y, 186, 1, P.paperLine);
const page = (x0, w) => {
  rect(x0, 168, w, 128, P.paper);
  for (let y = 182; y < 292; y += 12) rect(x0 + 6, y, w - 12, 1, P.paperLine);
};
page(442, 90);
page(536, 90);
rect(442, 167, 90, 1, P.paperShade);
rect(536, 167, 90, 1, P.paperShade);
rect(529, 168, 4, 128, P.paperShade); // gutter
rect(533, 168, 3, 128, P.paperShade);
rect(532, 168, 1, 128, P.outline);
rect(540, 166, 3, 140, P.redDark); // ribbon
rect(540, 306, 3, 6, P.redDark);

// ---------- counter edge + lower cabinets (80..640, 324..360) ----------
panel(80, 324, 560, 12, P.woodMid, P.woodHi, P.woodDark);
for (let i = 0; i < 4; i++) {
  const x = 80 + 140 * i;
  panel(x, 336, 140, 24, P.sage, P.sageHi, P.sageDark);
  frame(x + 6, 340, 128, 20, P.sageDark);
  ellipse(x + 70, 345, 2, 2, P.brass);
  px(x + 69, 344, P.brassHi);
}

// ---------- fridge (0..80, 24..360) ----------
panel(2, 24, 76, 336, P.fridge, P.fridgeHi, P.fridgeShade);
px(2, 24, P.wall); px(77, 24, P.wall); // round the top corners
rect(4, 110, 72, 3, P.fridgeDark); // gap between freezer and fridge door
rect(4, 110, 72, 1, P.outline);
panel(67, 38, 6, 60, P.steel, P.steelHi, P.steelDark); // freezer handle
// Glass door with the fridge interior behind it
rect(9, 122, 54, 224, P.interior);
rect(9, 122, 54, 8, P.glassHi); // interior light
frame(8, 121, 56, 226, P.fridgeDark);
for (const y of [185, 257]) {
  rect(9, y, 54, 3, P.glassDark);
  rect(9, y, 54, 1, P.glassHi);
}
panel(13, 276, 46, 60, P.glass, P.glassHi, P.glassDark); // crisper drawer
rect(24, 280, 24, 3, P.glassDark);
for (let k = 0; k < 16; k++) px(10 + k, 300 - k, P.glassHi); // reflections
for (let k = 0; k < 24; k++) px(54 + Math.floor(k / 3), 200 - k, P.glassHi);
panel(67, 130, 6, 100, P.steel, P.steelHi, P.steelDark); // door handle
for (let x = 8; x < 72; x += 4) rect(x, 350, 2, 6, P.fridgeDark); // kick grille

// ---------- optional alignment guide ----------
if (process.argv.includes('--guide')) {
  for (const [x, y] of [...SLOTS.fridge, ...SLOTS.market, ...SLOTS.plate.flat()]) frame(x, y, 40, 48, P.guide);
}

// ---------- PNG encoding ----------
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(pixels, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(pixels.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function scaled(src, n) {
  const out = new Uint8Array(W * n * H * n * 4);
  for (let y = 0; y < H * n; y++) {
    for (let x = 0; x < W * n; x++) {
      const s = (Math.floor(y / n) * W + Math.floor(x / n)) * 4;
      out.set(src.subarray(s, s + 4), (y * W * n + x) * 4);
    }
  }
  return out;
}
const toPath = (url) => url.pathname.replace(/^\/([A-Za-z]:)/, '$1');

const outPath = new URL('../art/scenes/kitchen.png', import.meta.url);
mkdirSync(dirname(toPath(outPath)), { recursive: true });
writeFileSync(outPath, png(buf, W, H));
console.log('wrote art/scenes/kitchen.png (640x360)');

// Props: crop each layer to its pixels and save it, with where it goes on the scene.
const propDir = new URL('../art/scenes/props/', import.meta.url);
mkdirSync(toPath(propDir), { recursive: true });
const composite = buf.slice();
for (const [name, lay] of Object.entries(propLayers)) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!lay[(y * W + x) * 4 + 3]) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const crop = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) crop.set(lay.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4), y * w * 4);
  writeFileSync(new URL(`${name}.png`, propDir), png(crop, w, h));
  props[name] = [x0, y0, w, h];
  // Alpha-blend onto the preview.
  for (let i = 0; i < W * H; i++) {
    const a = lay[i * 4 + 3] / 255;
    for (let k = 0; k < 3; k++) composite[i * 4 + k] = Math.round(composite[i * 4 + k] * (1 - a) + lay[i * 4 + k] * a);
  }
}
writeFileSync(
  new URL('../src/ui/kitchen-props.json', import.meta.url),
  `${JSON.stringify({ comment: 'Written by tools/gen-kitchen.mjs: [x, y, w, h] of each prop sprite in art/scenes/props/ on the kitchen scene.', ...props }, null, 2)
    .replace(/\[\s+([^\]]+?)\s+\]/g, (_, inner) => `[${inner.split(/,\s+/).join(', ')}]`)}\n`,
);
console.log(`wrote ${Object.keys(props).length} props to art/scenes/props/ and src/ui/kitchen-props.json`);
const previewIdx = process.argv.indexOf('--preview');
if (previewIdx > 0) {
  writeFileSync(process.argv[previewIdx + 1], png(scaled(composite, 3), W * 3, H * 3));
  console.log(`wrote ${process.argv[previewIdx + 1]} (1920x1080 preview)`);
}
