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
  cubbySpecial: '#4a2346', cubbySpecialShade: '#371833',
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
rect(316, 7, 8, 3, P.steelDark); // its clip, on the rail like the order tickets beside it

// ---------- upper cabinet = market (80..480, 24..112) ----------
/** The faces of an open cubby: its back wall, the lit left side, the shadowed right side, the ceiling and the floor. */
const CUBBY_TONES = {
  food: { back: '#4e2b17', lit: '#63391f', dark: '#371d0f', ceiling: '#2e180c', floor: '#6e4226' },
  teal: { back: '#2f5553', lit: '#3d6a67', dark: '#223f3d', ceiling: '#1c3533', floor: '#457672' },
  special: { back: '#4a2346', lit: '#5d2e58', dark: '#351731', ceiling: '#2b1228', floor: '#673d61' },
};
panel(80, 26, 400, 86, P.woodMid, P.woodHi, P.wood);
panel(76, 24, 408, 7, P.woodLight, P.woodHi, P.wood); // crown molding
for (let i = 0; i < 8; i++) {
  const ox = 86 + 48 * i;
  // Foods on brown, the item on teal, and the special cubby (the last) its own plum showcase (the game outlines its
  // offer in gold). Each is an open
  // box seen straight on: a back wall, the left side lit and the right in shadow (both angling in), a shadowed
  // ceiling and a lighter floor the dish stands on.
  const special = i === 7;
  const teal = i === 6;
  const tone = special ? CUBBY_TONES.special : teal ? CUBBY_TONES.teal : CUBBY_TONES.food;
  const [x0, y0, w, h, d] = [ox, 36, 44, 64, 4];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const [l, r, t, bt] = [x - x0, x0 + w - 1 - x, y - y0, y0 + h - 1 - y];
      // Which face this pixel is on: the nearest edge wins, within the depth (the corners split on the diagonal).
      const m = Math.min(l, r, t, bt);
      px(x, y, m >= d ? tone.back : m === t ? tone.ceiling : m === bt ? tone.floor : m === l ? tone.lit : tone.dark);
    }
  }
  // The back wall's edge catches a little light along the top and left, and the floor meets it in a dark line.
  rect(x0 + d, y0 + d, w - 2 * d, 1, tone.dark);
  rect(x0 + d, y0 + h - d - 1, w - 2 * d, 1, tone.dark);
  if (special) {
    // Two little four-point sparkles on the velvet floor (single specks read as dirt, not shine).
    for (const [sx, sy] of [[ox + 7, 97], [ox + 36, 96]]) {
      px(sx, sy, '#fff6c8');
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) px(sx + dx, sy + dy, '#e6bd52');
    }
  }
  frame(ox - 1, 35, 46, 66, P.outline);
  panel(ox - 1, 98, 46, 6, P.woodLight, P.woodHi, P.wood); // shelf lip
}
// Thicker dividers: between foods and the item, and between the item and the special cubby
rect(372, 34, 6, 70, P.woodDark);
rect(373, 34, 1, 70, P.woodMid);
rect(419, 34, 4, 70, P.woodDark);
rect(420, 34, 1, 70, P.woodMid);
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
// (the jars themselves are drawn below, once the round-shape helpers exist)
// The shelf: its top, seen a little from above (darker at the back, where it meets the rack), the jars' shadows
// on it, and its front edge.
rect(485, 49, 152, 6, P.woodLight);
rect(485, 49, 152, 1, P.woodDark);
rect(485, 50, 152, 1, P.wood);
for (let j = 0; j < 5; j++) rect(493 + 29 * j, 53, 18, 1, P.wood);
panel(484, 55, 154, 7, P.woodLight, P.woodHi, P.wood);

// ---------- chalkboard (480..640, 64..148) ----------
panel(484, 66, 154, 80, P.woodMid, P.woodHi, P.wood);
rect(489, 71, 144, 66, P.chalk);
frame(488, 70, 146, 68, P.outline);
for (let k = 0; k < 200; k++) px(490 + Math.floor(rand() * 142), 72 + Math.floor(rand() * 64), P.chalkSmudge);
rect(492, 74, 18, 1, P.chalkSmudge); // old erased line
panel(486, 138, 150, 6, P.woodLight, P.woodHi, P.wood); // chalk tray
// The chalk on the tray is drawn by the game (you can pick it up and draw); the felt eraser beside it wipes the board.
panel(494, 133, 14, 5, '#c4935e', '#e0b47e', '#8a5a32');
rect(495, 137, 12, 1, '#55505a'); // the felt

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

// ---------- counter top: butcher block (80..640, 148..336) ----------
for (let x = 80; x < 640; x += 10) {
  const c = [P.block1, P.block2, P.block3][Math.floor(x / 10) % 3];
  rect(x, 148, 10, 188, c);
  rect(x, 148, 1, 188, P.blockGrain);
  for (let k = 0; k < 10; k++) rect(x + 2 + Math.floor(rand() * 7), 150 + Math.floor(rand() * 170), 1, 3 + Math.floor(rand() * 8), P.blockGrain);
}
rect(80, 148, 560, 3, P.blockShade); // shadow line against the backsplash
rect(80, 148, 560, 1, P.outline);

// Platter (your plate): 120..240 x 160..324
roundRect(123, 165, 122, 167, 11, P.blockShade); // shadow, down and to the right, showing under the rim too
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
/** How far a horizontal band on a round body dips toward you at `t` (-1..1 across): the camera is a little above. */
const dip = (t, ry) => Math.round(ry * Math.sqrt(Math.max(0, 1 - t * t)));
const shadow = () => {}; // props sit flat on the counter like the rest of the scene

// Spice jars on the rack: little glass cylinders seen a little from above, like the tip jar. A round dark lid with
// its top showing, and the glass lit on the left and shaded on the right. They are drawn empty: the game fills each
// one with its flavor's spice behind the see-through glass, as high as that flavor's count (like the tip jar's
// coins). Every edge across a jar (the lid's rim, the bottom) curves toward you by the same amount.
const LID = ['#8a807b', '#6b615d', '#4a4240', '#3a3331', '#2f2927'];
jars.forEach((_, j) => prop(`spice${j}`, () => {
  const cx = 501.5 + 29 * j, rx = 8.5, ry = 2.2, lidTop = 32, lidBottom = 36, bottom = 51;
  const curve = (x) => ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
  blob(Math.floor(cx - rx), lidTop - 3, Math.ceil(cx + rx), bottom + 3, (x, y) => {
    const t = (x - cx) / rx;
    if (Math.abs(t) > 1) return null;
    const k = curve(x);
    // The lid: its top (an oval) and its side, with a dark rim where it meets the glass
    if (inEllipse(x, y, cx, lidTop, rx, ry)) return inEllipse(x, y, cx - 1.5, lidTop - 0.6, rx - 3, ry - 0.9) ? LID[0] : LID[1];
    if (y < lidTop) return null; // above the lid's rim: nothing, so the lid reads round
    if (y >= lidTop && y <= lidBottom + k) return y >= lidBottom + k - 0.5 ? LID[4] : side(t, LID);
    if (y > bottom + k) return null;
    // The glass, see-through so the spice drawn behind it shows: tinted, a highlight streak on the left, the far
    // edge darker
    if (t > -0.7 && t < -0.5) return P.glassHi;
    return t > 0.8 ? P.jarEdge : '~' + P.jar;
  }, '#2f2927', true, false); // no cast shadow: it would land on the rack's back wall; the shelf has their shadows
}));

const BRASS = ['#fff4c2', '#f6d36b', '#e2ac3c', '#b97c23', '#7f4f14'];
const STEEL = ['#ffffff', '#e6ecef', '#c3ccd2', '#929da5', '#66717a'];
const LEAF = ['#c8ef9a', '#93d066', '#62a845', '#447f33', '#2f5d25'];

// Service bell: brass dome seated in the middle of a black lacquered base.
prop('bell', () => {
  const cx = 280, baseY = 304; // baseY = centre of the base's top face
  const TOP = ['#7c6f6a', '#6a5e59', '#54484400', '#3d3431', '#2c2422'];
  // Base: oval top face plus a 4px front band, outlined, casting the counter shadow.
  blob(cx - 23, baseY - 8, cx + 23, baseY + 12, (x, y) => {
    if (inEllipse(x, y, cx, baseY, 22, 7)) {
      // Top face: flat, with a lighter rim along its front-left edge
      const front = !inEllipse(x, y - 1, cx, baseY, 22, 7);
      return front && x < cx + 8 ? '#6a5e59' : '#4a3f3b';
    }
    const band = y >= baseY && y <= baseY + 4 && Math.abs(x - cx) <= 22;
    if (band || (y > baseY + 4 && inEllipse(x, y, cx, baseY + 4, 22, 7))) {
      const t = (x - cx) / 22;
      return t < -0.75 ? '#4e4440' : t > 0.7 ? '#1f1918' : '#2f2725';
    }
    return null;
  }, P.outline, true, true);
  // Dome: a round half-sphere standing on the base. Its foot is a circle seen a little from above, so it curves
  // down toward you, and the brass collar follows it.
  const rx = 15, ry = 19, footRy = 3;
  blob(cx - rx, baseY - ry, cx + rx, baseY + footRy, (x, y) => {
    const t = (x - cx) / rx;
    if (Math.abs(t) > 1) return null;
    const foot = baseY + dip(t, footRy);
    if (y > foot) return null;
    const ny = (y - foot) / ry;
    if (t * t + ny * ny > 1) return null;
    if (y >= foot - 1) return y === foot ? BRASS[3] : t < -0.5 ? BRASS[1] : BRASS[2]; // the collar
    return lit(t, ny, BRASS);
  }, P.outline);
  // Plunger: rod running into the top of the dome, capped with a knob
  const rodTop = baseY + footRy - ry - 5; // the rod runs into the top of the dome
  rect(cx - 2, rodTop, 4, 8, P.outline);
  rect(cx - 1, rodTop, 2, 8, BRASS[2]);
  rect(cx - 1, rodTop, 1, 8, BRASS[1]);
  rect(cx - 3, rodTop - 3, 7, 4, P.outline);
  rect(cx - 2, rodTop - 2, 5, 2, BRASS[2]);
  rect(cx - 2, rodTop - 2, 2, 1, BRASS[1]);
  rect(cx + 2, rodTop - 1, 1, 1, BRASS[3]);
});

// Tip jar: an empty glass mason jar with a blank label for the gold count. The game draws the coins behind it (they
// show through the see-through glass) at a height set by your gold, with interest lines at 5/10/15 gold.
prop('tipjar', () => {
  const cx = 332, neckTop = 257, bodyTop = 265, bottom = 310, rx = 15;
  shadow(cx + 3, bottom + 4, 18);
  const GLASS = ['#ffffff', '#eef8f6', '#d4ebe7', '#b4d3cf', '#93b8b4'];
  blob(cx - rx, neckTop - 6, cx + rx, bottom + 5, (x, y) => {
    const t = (x - cx) / rx;
    // Opening seen from above
    // The opening: a round rim seen a little from above, the width of the neck
    if (y <= neckTop + 4 && inEllipse(x, y, cx, neckTop, 12, 4)) {
      if (inEllipse(x, y, cx, neckTop + 0.5, 10, 2.6)) return y < neckTop ? '#6a908e' : '#7da3a1';
      return !inEllipse(x, y + 1, cx, neckTop, 12, 4) ? GLASS[4] : y > neckTop + 1 ? GLASS[2] : GLASS[0]; // the lip: a dark front edge
    }
    // Rounded shoulders: the glass swells from the neck to the body over a few pixels
    const shoulder = [12.4, 13.4, 14.2, 14.7, 15];
    if (y >= bodyTop && y < bodyTop + shoulder.length) {
      const w = shoulder[y - bodyTop];
      if (Math.abs(x - cx) > w) return null;
      const tt = (x - cx) / w;
      return tt < -0.72 ? GLASS[0] : tt > 0.7 ? GLASS[4] : '~#cfe9e5';
    }
    // Threaded neck
    if (y > neckTop && y < bodyTop) {
      if (Math.abs(x - cx) > 12) return null;
      const d = dip((x - cx) / 12, 2);
      return y === neckTop + 4 + d || y === neckTop + 7 + d ? GLASS[4] : side((x - cx) / 12, GLASS);
    }
    // Body with a rounded bottom
    const inBody = y <= bottom ? Math.abs(t) <= 1 && y >= bodyTop : inEllipse(x, y, cx, bottom, rx, 5);
    if (!inBody) return null;
    // Label (blank, for the gold count), wrapped round the jar: its edges dip toward you
    const ld = dip((x - cx) / rx, 2);
    if (y >= 273 + ld && y <= 285 + ld && x >= cx - 10 && x <= cx + 10) {
      if (y === 273 + ld || y === 285 + ld) return '#d9c89f';
      return x >= cx + 8 ? '#eadcb8' : x <= cx - 8 ? '#f2e6c8' : '#fbf2da';
    }
    // Glass: the counter shows through, tinted, with highlight streaks and a darker right edge
    if (t > -0.72 && t < -0.55) return GLASS[0];
    if (t > -0.45 && t < -0.38) return GLASS[1];
    return t > 0.7 ? GLASS[4] : t > 0.45 ? '~#9ec3bf' : '~#cfe9e5';
  }, '#4f7472', true, true);
});

// Scrap bin: a sage-green enamel compost bin with a steel lid and a cream label with a leaf.
const ENAMEL = ['#e2f0dc', '#b4d6ac', '#8cbc86', '#6a9a68', '#4c7650'];
prop('bin', () => {
  // One round body seen from the side and a little above: every edge across it (the lid's top, the lid's lower
  // rim, the pressed ridges and the bottom) is part of the same ellipse, `ry` deep, so they all curve together.
  const cx = 392, lidY = 252, bottom = 307, rx = 25, ry = 6;
  const lidRx = rx + 2, lidBand = 4;
  shadow(cx + 4, bottom + 5, 30);
  const LID = ['#ffffff', '#d6dde2', '#aeb8bf', '#808b93', '#58626a'];
  blob(cx - lidRx - 1, lidY - 10, cx + lidRx + 1, bottom + ry + 2, (x, y) => {
    const tl = (x - cx) / lidRx;
    const t = (x - cx) / rx;
    // Lid handle: a bar on two posts, standing on the middle of the lid
    if (y >= lidY - 10 && y <= lidY - 8 && Math.abs(x - cx) <= 6) return y === lidY - 10 ? STEEL[1] : STEEL[3];
    if (y > lidY - 8 && y <= lidY - 4 && (x === cx - 5 || x === cx + 5)) return STEEL[4];
    // Lid top: the ellipse, lit from the top-left
    if (inEllipse(x, y, cx, lidY, lidRx, ry)) return lit((x - cx) / (lidRx + 1), (y - lidY) / (ry + 1), STEEL);
    // Lid band: its side, from the top ellipse down to a lower rim that follows the same curve
    if (Math.abs(tl) <= 1 && y > lidY && y <= lidY + lidBand + dip(tl, ry)) return y === lidY + lidBand + dip(tl, ry) ? LID[4] : side(tl, LID);
    // Body: below the lid, down to a bottom on the same curve
    if (Math.abs(t) > 1 || y <= lidY + lidBand + dip(tl, ry) || y > bottom + dip(t, ry)) return null;
    const d = dip(t, ry);
    if (y === 264 + d || y === 295 + d) return ENAMEL[4]; // pressed ridges wrap round the body
    if (y === 265 + d || y === 296 + d) return ENAMEL[0];
    // Pedal at the front bottom
    if (y >= bottom + d - 2 && Math.abs(x - cx) <= 7) return y === bottom + d - 2 ? '#5a5250' : '#2c2726';
    // A cream label with a leaf on it
    if (inEllipse(x, y, cx, 281, 7, 8)) {
      if (inEllipse(x, y, cx, 281, 3.5, 5)) return x === cx ? LEAF[4] : lit((x - cx) / 4, (y - 281) / 5.5, LEAF);
      return inEllipse(x, y, cx, 281, 6, 7) ? '#f7f0de' : '#c9b48c';
    }
    return side(t, ENAMEL);
  }, '#33473a', true, true);
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

// ---------- counter edge + lower cabinets (80..640, 336..360): the counter runs past the platter, so its shadow shows ----------
panel(80, 336, 560, 10, P.woodMid, P.woodHi, P.woodDark);
for (let i = 0; i < 4; i++) {
  const x = 80 + 140 * i;
  panel(x, 346, 140, 14, P.sage, P.sageHi, P.sageDark);
  frame(x + 6, 349, 128, 11, P.sageDark);
  ellipse(x + 70, 353, 2, 2, P.brass);
  px(x + 69, 352, P.brassHi);
}

// ---------- fridge magnets: little pixel maps, one character per pixel ('.' is see-through) ----------
const MAGNET_INK = {
  o: P.outline, r: P.red, R: P.redHi, d: P.redDark, g: P.leaf, G: P.leafDark,
  y: '#fbe58a', Y: '#e8b52a', w: '#fffaf0', p: '#f28cb6', P: '#ffc4dc', q: '#c95a8a', b: '#d8b07a',
  f: '#6fa8d6', F: '#a8d2f0', k: '#3f6f9a',
  a: '#8cc84b', A: '#c8ea8e', s: '#5d9c45', t: '#7a4a28', C: '#f5a04a', c: '#d4702a',
};
const MAGNETS = {
  // a green apple: red would read as one of the lives on the note it pins
  apple: [
    '....tg...',
    '.oo.too..',
    'oAaaoaaao',
    'oAaaaaaao',
    'oaaaaaaso',
    'oaaaaaaso',
    '.oaaasso.',
    '..ooooo..',
  ],
  tomato: [
    '...oGo...',
    '.oogggoo.',
    'oRrrgrrro',
    'oRrrrrrro',
    'orrrrrrdo',
    'orrrrrrdo',
    '.orrrddo.',
    '..ooooo..',
  ],
  lemon: [
    '..ooooo..',
    '.oYYYYYo.',
    'oYywywyYo',
    'oYwyyywYo',
    'oYyywyyYo',
    'oYwyyywYo',
    'oYywywyYo',
    '.oYYYYYo.',
    '..ooooo..',
  ],
  popsicle: [
    '.ooo.',
    'oPppo',
    'oPppo',
    'oPpqo',
    'oPppo',
    'oPpqo',
    'opqqo',
    '.ooo.',
    '..b..',
    '..b..',
    '..o..',
  ],
  strawberry: [
    '.oGgGo.',
    'oRrgrro',
    'orryrro',
    'oyrrryo',
    '.orryo.',
    '.oryro.',
    '..odo..',
    '...o...',
  ],
  carrot: [
    'g.g.g',
    '.ggg.',
    'oCCco',
    'oCcco',
    'oCCco',
    '.oCo.',
    '.oco.',
    '..o..',
  ],
  fish: [
    '..oooo..o',
    '.oFFffoof',
    'oFkFfffo.',
    'oFFffffo.',
    '.offffoof',
    '..oooo..o',
  ],
};
/**
 * A magnet stuck on the door: its pixel map turned `deg` degrees about its centre (nearest pixel), casting a shadow
 * down and to the right so it stands off the door.
 */
function magnet(x, y, rows, deg = 0) {
  const h = rows.length, w = rows[0].length;
  const [cx, cy] = [(w - 1) / 2, (h - 1) / 2];
  const [c, s] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  const r = Math.ceil(Math.hypot(w, h) / 2) + 1;
  const at = (i, j) => {
    // the source pixel that lands on (i, j) after turning
    const [dx, dy] = [i - cx, j - cy];
    const [sx, sy] = [Math.round(cx + dx * c + dy * s), Math.round(cy - dx * s + dy * c)];
    const ch = rows[sy]?.[sx];
    return ch && ch !== '.' ? ch : null;
  };
  const cells = [];
  for (let j = Math.floor(cy - r); j <= cy + r; j++) for (let i = Math.floor(cx - r); i <= cx + r; i++) {
    const ch = at(i, j);
    if (ch) cells.push([i, j, ch]);
  }
  for (const [i, j] of cells) px(x + i + 1, y + j + 1, P.fridgeDark);
  for (const [i, j, ch] of cells) px(x + i, y + j, MAGNET_INK[ch]);
}

/**
 * A thin magnet leaning instead of turned (turning a 5px-wide sprite breaks it up): each row (lean > 0: the top
 * leans right) or column (tip < 0: the right end rises) slides over a pixel every few, so every line stays whole.
 */
function leaningMagnet(x, y, rows, lean = 0, tip = 0) {
  const h = rows.length, w = rows[0].length;
  const cells = [];
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== '.') cells.push([i + Math.round((h - 1 - j) * lean), j + Math.round(i * tip), ch]);
  }));
  for (const [i, j] of cells) px(x + i + 1, y + j + 1, P.fridgeDark);
  for (const [i, j, ch] of cells) px(x + i, y + j, MAGNET_INK[ch]);
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
for (let k = 0; k < 16; k++) px(10 + k, 300 - k, P.glassHi); // reflections
// A paper note held on the door by a magnet: the game writes lives and courses on it (LAYOUT.magnets).
{
  const [x, y, w, h] = SLOTS.magnets;
  rect(x + 1, y + 1, w, h, P.glassDark); // its shadow on the glass
  panel(x, y, w, h, P.paper, '#fffaf0', P.paperShade);
  for (let ly = y + 14; ly < y + h - 3; ly += 7) rect(x + 3, ly, w - 6, 1, P.paperLine); // ruled lines
  rect(x + 3, y + 3, 1, h - 6, '#f0c4b8'); // the margin
  // pinned by an apple magnet
  magnet(x + Math.floor(w / 2) - 4, y - 4, MAGNETS.apple, -14);
}
// The freezer's window: frosted glass onto an icy inside, where a frozen offer waits (LAYOUT.freezer)
{
  const [fx, fy] = SLOTS.freezer[0];
  const [x0, y0, x1, y1] = [fx - 1, fy - 4, fx + 41, fy + 49];
  for (let y = y0; y < y1; y++) rect(x0, y, x1 - x0, 1, y < y0 + 6 ? P.glassHi : y > y1 - 5 ? P.glass : P.interior);
  rect(x0, y1 - 4, x1 - x0, 1, P.glassDark); // the ice floor's edge
  frame(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2, P.fridgeDark);
  // icicles along the top, and frost creeping in from the corners
  for (let x = x0 + 2; x < x1 - 1; x += 3) rect(x, y0, 1, 2 + ((x * 7) % 3), '#ffffff');
  for (let k = 0; k < 40; k++) {
    const corner = k % 4;
    const d = Math.floor(rand() * 7);
    const e = Math.floor(rand() * (7 - d));
    const x = corner % 2 ? x1 - 1 - d : x0 + d;
    const y = corner < 2 ? y0 + 3 + e : y1 - 5 - e;
    px(x, y, '#ffffff');
  }
  for (let k = 0; k < 10; k++) px(x0 + 4 + k, y0 + 18 - k, P.glassHi); // a glint on the glass
}
// Fun fridge magnets, scattered where there's door to stick to (never on the glass): around the freezer window, at
// different heights and angles, and on the strip of door beside the fridge's glass, below the handle and by the note.
leaningMagnet(4, 42, MAGNETS.popsicle, 0.3);
leaningMagnet(57, 27, MAGNETS.fish, 0, 0.2);
magnet(3, 88, MAGNETS.strawberry, -14);
magnet(52, 94, MAGNETS.lemon, 16);
magnet(66, 238, MAGNETS.tomato, 12);
leaningMagnet(67, 298, MAGNETS.carrot, -0.25);
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
