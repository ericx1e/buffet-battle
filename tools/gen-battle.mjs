// Generates the 640x360 battle background (art/scenes/battle.png): a sunny dining room with a gingham-covered
// table, two platters where the teams stand, painted HUD plaques, and a tiled floor. Same flat style as the kitchen.
// Usage: node tools/gen-battle.mjs [--preview out.png] [--guide]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Sprite, encodePng, ramp, shade as shadeHex, upscale } from './pixel.mjs';

const LAYOUT = JSON.parse(readFileSync(new URL('../src/ui/battle-layout.json', import.meta.url), 'utf8'));
const W = 640, H = 360;
const s = new Sprite(W, H);
const P = {
  outline: '#2a1b14',
  wall: '#f4ead6', wallStripe: '#f8f1e3', wallDot: '#e9dcc2',
  bead: '#f5f1e8', beadLine: '#e3ddd0', beadShade: '#d4ccbc', rail: '#b9cdbf', railHi: '#d6e3da', railDark: '#8ea697',
  oak: '#cfa57a', oakHi: '#ddb994', oakLine: '#b88e64', oakDark: '#9a7350', oakDeep: '#7c5b3e',
  cloth: '#fbf6ee', clothMid: '#f0e3da', clothDeep: '#e4cdc2', clothTrim: '#c99a8c', clothLine: '#dcc3b8',
  plate: '#ebe5da', plateRim: '#dcd5c9', plateShade: '#c8c0b2', plateEdge: '#8a8074',
  floor: '#d9c4a4', floorLine: '#c4ab88', floorHi: '#e4d2b6',
  sky1: '#a9d6eb', sky2: '#bfe1f0', sky3: '#d6edf6', cloud: '#ffffff', cloudShade: '#e6f1f6', sun: '#fbe7a0',
  frame: '#ffffff', frameShade: '#d9d3c4',
  plaque: '#fbf2da', plaqueShade: '#e2d1aa', chalk: '#2e3b33',
  leaf: '#8aab76', leafDark: '#66875a', pot: '#c99a7c', potDark: '#a07658',
};
const FLAGS = ['#d89a8a', '#e6d3a4', '#b6cdbe', '#adc2d4', '#dcb2b9'];
const rect = (x, y, w, h, c, a) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) s.px(i, j, c, a); };
const frame = (x, y, w, h, c) => { rect(x, y, w, 1, c); rect(x, y + h - 1, w, 1, c); rect(x, y, 1, h, c); rect(x + w - 1, y, 1, h, c); };
function panel(x, y, w, h, fill, hi, sh) {
  rect(x, y, w, h, fill);
  rect(x + 1, y + 1, w - 2, 1, hi); rect(x + 1, y + 1, 1, h - 2, hi);
  rect(x + 1, y + h - 2, w - 2, 1, sh); rect(x + w - 2, y + 1, 1, h - 2, sh);
  frame(x, y, w, h, P.outline);
}
const inEll = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const ell = (cx, cy, rx, ry, c) => s.fill(cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => (inEll(x, y, cx, cy, rx, ry) ? c : null));
/** Ellipse with alpha (255 = solid), blended over what is there. */
/**
 * Paints a shape and a clean 1px dark outline around it, like the food sprites: inside(x, y) says whether a pixel is
 * in the shape, color(x, y) colours it (null: keep what is drawn there), and every pixel just outside it (sharing
 * an edge) becomes the outline.
 */
function outlined(x0, y0, x1, y1, inside, color) {
  // Measure the shape first, so painting the outline can't change what counts as inside.
  const w = x1 - x0 + 3;
  const mask = [];
  for (let y = y0 - 2; y <= y1 + 2; y++) for (let x = x0 - 2; x <= x1 + 2; x++) mask.push(!!inside(x, y));
  const at = (x, y) => x >= x0 - 2 && x <= x1 + 2 && y >= y0 - 2 && y <= y1 + 2 && mask[(y - y0 + 2) * (w + 2) + (x - x0 + 2)];
  for (let y = y0 - 1; y <= y1 + 1; y++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (at(x, y)) { if (color) s.px(x, y, color(x, y)); }
      else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) s.px(x, y, P.outline);
    }
  }
}
const ellA = (cx, cy, rx, ry, c, a) => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (inEll(x, y, cx, cy, rx, ry)) s.px(x, y, c, a);
};

// Heights: the rail along the wall, the far edge of the table, and its front edge. The table takes most of the
// screen so the foods (drawn at 2x) have room; the wall above is a band of room detail.
const RAIL = 76, TOP = 108, FRONT = 322;

// ---------- room (0..TOP): a back wall and two side walls in perspective ----------
// The room shares the table's vanishing point (VX, VY), so the side walls, their rails and windows recede
// toward the same spot as the tablecloth. Back wall: x 64..576. Side walls: 0..64 and 576..640.
const VX = 320, VY = -70;
const CORNER_L = 64, CORNER_R = 576;
/** Where a horizontal line at height `yb` on the back wall reaches column x on a side wall. */
const sideY = (x, yb) => VY + (yb - VY) * ((x - VX) / ((x < VX ? CORNER_L : CORNER_R) - VX));
const onSide = (x) => x < CORNER_L || x > CORNER_R;
/** Height on the back wall that a side-wall pixel lines up with (inverse of sideY). */
const backY = (x, y) => VY + (y - VY) / ((x - VX) / ((x < VX ? CORNER_L : CORNER_R) - VX));

// Wallpaper, rail and beadboard drawn per pixel so the side walls bend with the perspective.
s.fill(0, 0, W - 1, TOP - 1, (x, y) => {
  const yb = onSide(x) ? backY(x, y) : y; // the back-wall height this pixel corresponds to
  // stripes: on the side walls they stay vertical but get narrower toward the corners
  const u = onSide(x) ? (x < VX ? CORNER_L - (CORNER_L - x) * 0.6 : CORNER_R + (x - CORNER_R) * 0.6) : x;
  if (yb < RAIL) return Math.floor(u / 10) % 2 === 0 ? P.wallStripe : P.wall;
  if (yb < RAIL + 1) return P.outline;
  if (yb < RAIL + 2) return P.railHi;
  if (yb < RAIL + 6) return P.rail;
  if (yb < RAIL + 7) return P.railDark;
  if (yb < RAIL + 8) return P.outline;
  return Math.floor(u / 8) % 2 === 0 && Math.floor(u) % 8 === 4 ? P.beadLine : P.bead;
});
for (let y = 12; y < RAIL - 4; y += 16) for (let x = (y / 16) % 2 ? CORNER_L + 14 : CORNER_L + 4; x < CORNER_R; x += 20) { s.px(x, y, P.wallDot); s.px(x + 1, y, P.wallDot); }
// Side walls sit out of the window light: a touch darker, darkest near the viewer.
s.fill(0, 0, W - 1, TOP - 1, (x, y) => {
  if (!onSide(x)) return null;
  const t = x < VX ? (CORNER_L - x) / CORNER_L : (x - CORNER_R) / (W - CORNER_R);
  s.px(x, y, '#6b5236', 22 + Math.round(t * 22));
  return null;
});
// Corner lines, crown moulding along the ceiling, and soft shadow under the moulding and in the corners.
for (const cx of [CORNER_L, CORNER_R]) {
  rect(cx, 0, 1, TOP, '#cdb894');
  for (let k = 1; k <= 3; k++) rect(cx + (cx === CORNER_L ? k : -k), 0, 1, TOP, '#8a6a4a', 30 - k * 8);
}
rect(CORNER_L, 0, CORNER_R - CORNER_L, 5, '#fbf7ee');
rect(CORNER_L, 5, CORNER_R - CORNER_L, 1, '#d9cdb4');
rect(CORNER_L, 6, CORNER_R - CORNER_L, 3, '#8a6a4a', 26);
for (const side of [-1, 1]) {
  // moulding continues down the side walls toward the viewer
  const x0 = side < 0 ? 0 : CORNER_R, x1 = side < 0 ? CORNER_L : W;
  for (let x = x0; x < x1; x++) {
    const top = Math.round(sideY(x, 0)), bot = Math.round(sideY(x, 5));
    for (let y = Math.max(0, top); y < bot; y++) s.px(x, y, '#efe7d6');
    s.px(x, bot, '#cbbd9f');
  }
}
// shadow the rail casts on the beadboard
rect(0, RAIL + 8, W, 3, '#8a6a4a', 24);

// ---------- windows ----------
/** Sky with soft clouds and distant hills, for any window shape (`inside(x, y)`). */
function view(x0, y0, x1, y1, inside, cloudSeed = 0) {
  const h = y1 - y0;
  s.fill(x0, y0, x1, y1, (x, y) => {
    if (!inside(x, y)) return null;
    const t = (y - y0) / h;
    const hill = y1 - h * 0.22 - Math.sin((x + cloudSeed) / 9) * 2 - Math.sin((x + cloudSeed) / 23) * 3;
    const hill2 = y1 - h * 0.12 - Math.sin((x + cloudSeed) / 13 + 1) * 2;
    if (y > hill2) return '#a6bf95';
    if (y > hill) return '#bfd1b0';
    return t < 0.33 ? P.sky1 : t < 0.66 ? P.sky2 : P.sky3;
  });
  // a couple of small clouds
  for (const [fx, fy, k] of [[0.25, 0.3, 1], [0.7, 0.18, 0.8]]) {
    const cx = x0 + (x1 - x0) * fx + (cloudSeed % 7), cy = y0 + h * fy;
    for (const [dx, dy, rx, ry] of [[0, 1, 7, 2], [-3, 0, 4, 3], [3, -1, 5, 3]]) {
      const ex = cx + dx * k, ey = cy + dy * k;
      s.fill(ex - rx * k, ey - ry * k, ex + rx * k, ey + ry * k, (x, y) => (inside(x, y) && inEll(x, y, ex, ey, rx * k, ry * k) ? (dy > 0 ? P.cloudShade : P.cloud) : null));
    }
  }
}

// Main window (centre, behind the round board)
const win = [236, 26, 168, RAIL - 14 - 26];
{
  const [x, y, w, h] = win;
  rect(x + 3, y + 3, w, h, '#8a6a4a', 40); // shadow on the wall
  panel(x, y, w, h, P.frame, '#ffffff', P.frameShade);
  const ix = x + 6, iy = y + 6, iw = w - 12, ih = h - 12;
  view(ix, iy, ix + iw - 1, iy + ih - 1, () => true, 5);
  ellA(ix + iw - 22, iy + 12, 7, 7, P.sun, 255);
  ellA(ix + iw - 22, iy + 12, 10, 10, '#fff4b8', 90);
  rect(x + w / 2 - 2, iy, 4, ih, P.frame);
  rect(ix, iy + ih / 2 - 1, iw, 3, P.frame);
  rect(x + w / 2 + 2, iy, 1, ih, P.frameShade);
  rect(ix, iy + ih / 2 + 2, iw, 1, P.frameShade);
  frame(ix - 1, iy - 1, iw + 2, ih + 2, P.frameShade);
  rect(ix, iy, iw, 2, '#5f7f8f', 40); // the frame's shadow on the glass: the window is set into the wall
  rect(ix, iy, 2, ih, '#5f7f8f', 40);
  for (let k = 0; k < 20; k++) s.px(ix + 8 + k, iy + ih - 6 - k, '#eef8fc');
  // sill and a flower box
  rect(x - 6, y + h + 4, w + 16, 3, '#8a6a4a', 40);
  panel(x - 8, y + h - 2, w + 16, 6, P.frame, '#ffffff', P.frameShade);
  rect(x + 12, y + h + 14, w - 20, 2, '#8a6a4a', 40);
  panel(x + 10, y + h + 4, w - 20, 10, P.pot, '#ddb59a', P.potDark);
  for (let fx = x + 16; fx < x + w - 14; fx += 9) {
    s.ball(fx, y + h, 3, 2, ramp(P.leaf));
    const c = FLAGS[(fx / 9) % FLAGS.length | 0];
    s.ball(fx, y + h - 3, 2, 2, ramp(c));
  }
}

// Side-wall windows, drawn in perspective: vertical edges at two columns, top and bottom along the wall's lines.
function sideWindow(xa, xb, top, bottom) {
  const lo = Math.min(xa, xb), hi = Math.max(xa, xb);
  const T = (x) => sideY(x, top), B = (x) => sideY(x, bottom);
  const inFrame = (x, y) => x >= lo && x <= hi && y >= T(x) && y <= B(x);
  const inGlass = (x, y) => x >= lo + 3 && x <= hi - 3 && y >= T(x) + 4 && y <= B(x) - 4;
  // shadow on the wall, then frame, then the view
  s.fill(lo, T(lo) - 2, hi + 3, B(lo) + 4, (x, y) => (inFrame(x - 2, y - 2) && !inFrame(x, y) ? (s.px(x, y, '#6b5236', 40), null) : null));
  s.fill(lo, Math.min(T(lo), T(hi)) - 1, hi, Math.max(B(lo), B(hi)) + 1, (x, y) => (inFrame(x, y) ? P.frame : null));
  s.fill(lo, Math.min(T(lo), T(hi)), hi, Math.max(B(lo), B(hi)), (x, y) => (inFrame(x, y) && (x === lo || x === hi || Math.abs(y - T(x)) < 1 || Math.abs(y - B(x)) < 1) ? P.outline : null));
  view(lo, Math.min(T(lo), T(hi)), hi, Math.max(B(lo), B(hi)), inGlass, lo);
  // mullion and transom, also in perspective
  const mid = Math.round((lo + hi) / 2);
  s.fill(mid - 1, Math.min(T(mid), T(mid)), mid + 1, B(mid), (x, y) => (inGlass(x, y) ? P.frame : null));
  const midH = (top + bottom) / 2;
  s.fill(lo, Math.min(sideY(lo, midH), sideY(hi, midH)) - 2, hi, Math.max(sideY(lo, midH), sideY(hi, midH)) + 2, (x, y) => (inGlass(x, y) && Math.abs(y - sideY(x, midH)) <= 1 ? P.frame : null));
  // the glass is a little darker the more it turns away
  s.fill(lo, Math.min(T(lo), T(hi)), hi, Math.max(B(lo), B(hi)), (x, y) => (inGlass(x, y) ? (s.px(x, y, '#5f7f8f', 30), null) : null));
  // sill
  s.fill(lo - 1, Math.min(B(lo), B(hi)) - 1, hi + 1, Math.max(B(lo), B(hi)) + 4, (x, y) => (x >= lo - 1 && x <= hi + 1 && y > B(x) && y <= B(x) + 3 ? (y <= B(x) + 1 ? '#ffffff' : P.frameShade) : null));
}
sideWindow(12, 48, 26, 64);
sideWindow(592, 628, 26, 64);

// Gingham café curtains tied back on both sides of the main window
function gingham(x, y) {
  const a = Math.floor(x / 4) % 2, b = Math.floor(y / 4) % 2;
  return a + b === 2 ? '#d3a196' : a + b === 1 ? '#ead3cb' : '#faf4ec';
}
for (const side of [-1, 1]) {
  const edge = side < 0 ? win[0] - 2 : win[0] + win[2] + 1; // the curtain hangs from the rod at this edge
  const rodY = win[1] - 6;
  const shape = side < 0
    ? [[edge - 22, rodY], [edge + 18, rodY], [edge + 4, rodY + 28], [edge + 10, rodY + 50], [edge - 22, rodY + 50]]
    : [[edge - 18, rodY], [edge + 22, rodY], [edge + 22, rodY + 50], [edge - 10, rodY + 50], [edge - 4, rodY + 28]];
  // shadow on the wall, then the cloth with folds: darker bands where it gathers
  s.poly(shape.map(([x, y]) => [x + 3 * -side, y + 2]), (x, y) => (s.px(x, y, '#6b5236', 36), null));
  s.poly(shape, (x, y) => {
    const fold = Math.floor((x - (edge - 22)) / 7) % 2 === 1;
    const c = gingham(x, y);
    return fold ? shadeHex(c, -0.06) : c;
  });
  shape.forEach(([x0, y0], i) => { const [x1, y1] = shape[(i + 1) % shape.length]; s.line(x0, y0, x1, y1, '#a87c70'); });
  rect(side < 0 ? edge - 22 : edge - 10, rodY + 48, 32, 2, '#b98d80');
  rect(side < 0 ? edge - 8 : edge - 4, rodY + 28, 12, 3, P.rail);
  rect(side < 0 ? edge - 8 : edge - 4, rodY + 31, 12, 1, P.railDark);
}
rect(win[0] - 30, win[1] - 8, win[2] + 60, 3, '#c9a14a');
rect(win[0] - 30, win[1] - 8, win[2] + 60, 1, '#f2d27a');
for (const x of [win[0] - 33, win[0] + win[2] + 29]) { rect(x, win[1] - 9, 4, 5, '#a8812f'); frame(x, win[1] - 9, 4, 5, P.outline); }

// ---------- bunting along the back wall ----------
function bunting(x0, y0, x1, y1, sag) {
  const n = Math.round(Math.hypot(x1 - x0, y1 - y0));
  const at = (t) => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + sag * 4 * t * (1 - t)];
  for (let i = 0; i <= n; i++) { const [x, y] = at(i / n); s.px(x, y, '#8a6a4a'); }
  const flags = Math.floor(n / 16);
  for (let f = 0; f < flags; f++) {
    const [fx, fy] = at((f + 0.5) / flags);
    const c = FLAGS[f % FLAGS.length];
    s.poly([[fx - 4, fy + 2], [fx + 6, fy + 2], [fx + 1, fy + 11]], (x, y) => (s.px(x, y, '#6b5236', 34), null)); // shadow
    s.poly([[fx - 5, fy], [fx + 5, fy], [fx, fy + 9]], c);
    s.line(fx - 5, fy, fx, fy + 9, P.outline);
    s.line(fx + 5, fy, fx, fy + 9, P.outline);
    s.line(fx - 4, fy + 1, fx - 1, fy + 6, '#ffffff');
  }
}
void bunting; // no room under the plaques with the shorter wall

// ---------- landscape paintings ----------
function painting(x, y, w, h, paint) {
  rect(x + 3, y + 3, w, h, '#6b5236', 50); // shadow on the wall
  panel(x, y, w, h, '#c4955e', '#e0b985', '#946a3c');
  rect(x + 2, y + 2, w - 4, 1, '#f0d3a2');
  const ix = x + 4, iy = y + 4, iw = w - 8, ih = h - 8;
  s.fill(ix, iy, ix + iw - 1, iy + ih - 1, (px, py) => paint((px - ix) / iw, (py - iy) / ih, px, py));
  frame(ix - 1, iy - 1, iw + 2, ih + 2, '#7c5530');
}
// left: rolling farm hills under a big sky, a lone tree and a red barn
painting(96, 42, 56, RAIL - 46, (u, v) => {
  const h1 = 0.55 + 0.08 * Math.sin(u * 5 + 1);
  const h2 = 0.7 + 0.06 * Math.sin(u * 7 + 3);
  const h3 = 0.84 + 0.04 * Math.sin(u * 9);
  if (Math.hypot(u - 0.78, (v - 0.22) * 0.75) < 0.07) return '#f6e3a6'; // sun
  if (v < h1) return v < 0.25 ? '#b9d5e3' : v < 0.45 ? '#cde0e6' : '#e3e7d8';
  // tree on the far hill
  if (Math.abs(u - 0.28) < 0.012 && v > h1 - 0.04 && v < h1 + 0.06) return '#6a5038';
  if (Math.hypot(u - 0.28, (v - (h1 - 0.1)) * 0.7) < 0.06) return '#7f9c6a';
  if (v < h2) return '#b8c99a';
  // barn on the middle hill
  if (u > 0.6 && u < 0.7 && v > h2 - 0.06 && v < h2 + 0.04) return v < h2 - 0.03 ? '#9a5a4a' : '#b97a64';
  if (v < h3) return '#9fb685';
  return Math.floor(u * 30) % 3 === 0 ? '#c7b98a' : '#b9ad7e'; // field rows
});
// right: a mountain lake with snowy peaks and pines
painting(488, 42, 56, RAIL - 46, (u, v) => {
  const peak = (c, w, top) => top + Math.abs(u - c) / w;
  const m1 = peak(0.32, 0.6, 0.18), m2 = peak(0.68, 0.55, 0.26);
  const shore = 0.66;
  if (v < Math.min(m1, m2, shore)) return v < 0.3 ? '#bcd5e2' : '#d4e3e8';
  if (v < shore) {
    const m = Math.min(m1, m2);
    if (v < m + 0.08) return '#f3f4f2'; // snow caps
    return u < (m1 < m2 ? 0.32 : 0.68) ? '#9aa8b8' : '#8796a8';
  }
  // pines along the shore
  for (const pc of [0.12, 0.2, 0.84, 0.9]) {
    const top = shore - 0.2;
    if (v > top && v < shore + 0.04 && Math.abs(u - pc) < (v - top) * 0.18) return '#6f8a68';
  }
  // the lake reflects the peaks, darker and broken by ripples
  const ripple = Math.floor(v * 40) % 3 === 0;
  const refl = shore + (shore - Math.min(m1, m2)) * 0.6;
  if (v < refl) return ripple ? '#c5d8e2' : '#a9bccb';
  return ripple ? '#b9cfdc' : '#9fb7c8';
});

// ---------- potted plants on the rail: rounded, shaded leaf clumps over a terracotta pot ----------
function plant(cx) {
  const dy = RAIL - 103;
  const leaves = ramp(P.leaf);
  const pot = ramp(P.pot);
  ellA(cx + 3, 103 + dy, 10, 2, '#6b5236', 60); // shadow on the rail
  // pot: tapered, lit from the left, under a rim; one outlined shape
  const potHalf = (y) => Math.round(7 - (y - 91 - dy) * 0.2);
  const inPot = (x, y) => (y >= 88 + dy && y <= 90 + dy && Math.abs(x - cx) <= 8) || (y > 90 + dy && y <= 102 + dy && Math.abs(x - cx) <= potHalf(y));
  outlined(cx - 9, 88 + dy, cx + 9, 102 + dy, inPot, (x, y) => {
    if (y <= 90 + dy) return y === 90 + dy ? pot[3] : pot[1];
    const t = (x - cx) / potHalf(y);
    return t < -0.6 ? pot[1] : t > 0.6 ? pot[3] : pot[2];
  });
  // soil
  rect(cx - 7, 88 + dy, 15, 1, '#6a4a34');
  // leaf clumps: one outlined silhouette, then each clump shaded on top, back to front
  const clumps = [[-7, 80, 6, 5], [7, 79, 6, 5], [0, 74, 7, 6], [-4, 84, 5, 4], [5, 84, 5, 4], [0, 81, 6, 5]];
  // The silhouette is whatever the shaded balls paint, outlined afterwards so no shading covers the outline.
  const before = s.data.slice();
  for (const [ox, cy, rx, ry] of clumps) s.ball(cx + ox, cy + dy, rx, ry, leaves);
  const painted = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const i = (y * W + x) * 4;
    return s.data[i] !== before[i] || s.data[i + 1] !== before[i + 1] || s.data[i + 2] !== before[i + 2];
  };
  outlined(cx - 15, 64 + dy, cx + 15, 90 + dy, (x, y) => painted(x, y) && y < 88 + dy, null);
  // a few leaf tips and veins
  for (const [ox, oy] of [[-11, 79], [11, 78], [-2, 67], [3, 68]]) s.px(cx + ox, oy + dy, leaves[3]);
  for (const [ox, oy] of [[-8, 78], [6, 77], [-1, 72]]) rect(cx + ox, oy + dy, 2, 1, leaves[0]);
}
plant(184);
plant(456);

// ---------- table top (TOP..FRONT): a long table pushed against the wall, under a gingham tablecloth ----------
// Everything on the table shares one perspective: a point on the table at world (X, Z) (X across, Z depth, the
// eye 1 unit above the cloth) is drawn at x = VX + F * X / Z, y = VY + F / Z. The cloth checks are squares in
// that world, and so are the trays and the grid the foods stand on, so all their edges converge together.
const topY = TOP, botY = FRONT;
const F = 520; // focal length in pixels: how steeply we look down at the table
const toWorld = (x, y) => ({ X: (x - VX) / (y - VY), Z: F / (y - VY) });
const toScreen = (X, Z) => [VX + (F * X) / Z, VY + F / Z];
const CHECK = 0.07; // gingham check size, in world units
function clothAt(x, y) {
  const { X, Z } = toWorld(x + 0.5, y + 0.5);
  const v = (Math.floor(X / CHECK + 1000) % 2) + (Math.floor(Z / CHECK + 1000) % 2);
  return v === 2 ? P.clothDeep : v === 1 ? P.clothMid : P.cloth;
}
rect(0, topY, W, botY - topY, P.cloth);
s.fill(0, topY, W - 1, botY - 1, clothAt);
rect(0, topY, W, 1, P.clothLine);
// Soft shade where the cloth meets the wall.
rect(0, topY + 1, W, 2, P.clothLine, 120);
// The cloth drapes over the front edge (seen straight on): the columns carry on down, rows every 6px.
for (let y = botY; y < botY + 12; y++) {
  for (let x = 0; x < W; x++) {
    const col = Math.floor(toWorld(x + 0.5, botY).X / CHECK + 1000);
    const row = Math.floor((y - botY) / 6) + 1;
    const v = (col % 2) + (row % 2);
    s.px(x, y, v === 2 ? P.clothDeep : v === 1 ? P.clothMid : P.cloth);
  }
}
rect(0, botY, W, 1, P.clothLine);
rect(0, botY + 1, W, 1, '#ffffff', 120); // the fold catches the light
rect(0, botY + 9, W, 3, P.clothTrim);
// Under the table: its shadow on the floor.
rect(0, botY + 14, W, 10, P.oakDark);
rect(0, botY + 14, W, 1, P.oakDeep);

// Sunbeams from the window falling across the tablecloth.
for (const [x0, w] of [[250, 34], [302, 22], [346, 30]]) {
  s.poly([[x0, topY + 2], [x0 + w, topY + 2], [x0 + w + 80, botY], [x0 + 60, botY]], (x, y) => {
    s.px(x, y, '#fffdf2', 60);
    return null;
  });
}

// ---------- where the foods stand, and their trays ----------
// Each team is a 2x3 grid on the table: three lanes at different depths, a front and a back row across. The
// screen anchors come from projecting that grid (so near lanes spread wider than far ones), and are written to
// battle-layout.json for the game.
const LANE_Y = [162, 230, 298]; // feet of the far, middle and near lane on screen
const ROW_X = { front: -0.33, back: -0.62 }; // world X of the left team's rows (the right team is mirrored)
const anchors = [0, 1].map((side) =>
  [0, 1, 2, 3, 4, 5].map((slot) => {
    const lane = slot % 3, row = slot < 3 ? 'front' : 'back';
    const Z = toWorld(VX, LANE_Y[lane]).Z;
    const [x, y] = toScreen(ROW_X[row], Z);
    return [Math.round(side === 0 ? x : W - x), Math.round(y)];
  }),
);
// Trays: rounded rectangles in the same world, around each grid with a margin (less at the front, where the
// near lane's numbers hang over the edge, more at the back so the far foods stand well on the tray).
const zNear = toWorld(VX, LANE_Y[2]).Z, zFar = toWorld(VX, LANE_Y[0]).Z;
const r3 = (v) => Math.round(v * 1000) / 1000;
const tray = { x0: r3(ROW_X.back - 0.15), x1: r3(ROW_X.front + 0.15), z0: r3(zNear - 0.08), z1: r3(zFar + 0.32), r: 0.09 };
function inTray(X, Z, side, grow = 0) {
  const x = side === 0 ? X : -X;
  const cx = (tray.x0 + tray.x1) / 2, cz = (tray.z0 + tray.z1) / 2;
  const hw = (tray.x1 - tray.x0) / 2 + grow, hd = (tray.z1 - tray.z0) / 2 + grow, r = tray.r + grow;
  const dx = Math.max(Math.abs(x - cx) - (hw - r), 0), dz = Math.max(Math.abs(Z - cz) - (hd - r), 0);
  return dx * dx + dz * dz <= r * r;
}
for (const side of [0, 1]) {
  const at = (x, y) => toWorld(x + 0.5, y + 0.5);
  // shadow on the cloth, a little down and toward the light's far side
  s.fill(0, topY, W - 1, botY - 1, (x, y) => {
    const { X, Z } = at(x - 3, y - 5);
    if (inTray(X, Z, side)) s.px(x, y, '#8a6250', 70);
    return null;
  });
  // the tray: outline, raised rim (lit on the far edge, shaded on the near one), then the white well
  s.fill(0, topY, W - 1, botY - 1, (x, y) => {
    const { X, Z } = at(x, y);
    if (!inTray(X, Z, side)) return null;
    // a 2px outline: any pixel within 2 of the outside
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dy]) => { const q = at(x + dx, y + dy); return !inTray(q.X, q.Z, side); });
    if (edge) return P.outline;
    if (!inTray(X, Z, side, -0.035)) {
      const nearEdge = !inTray(X, Z + 0.035, side); // the rim facing the viewer is in shade
      return nearEdge ? P.plateEdge : P.plateRim;
    }
    if (!inTray(X, Z, side, -0.05)) return P.plateShade; // the well's inner lip
    return P.plate;
  });
}

const layoutUrl = new URL('../src/ui/battle-layout.json', import.meta.url);
LAYOUT.anchors = anchors;
LAYOUT.trays = { comment: 'World rect of the left tray (x0..x1 across, z0..z1 depth); the right one is mirrored. See tools/gen-battle.mjs.', ...tray };
delete LAYOUT.plates;
writeFileSync(
  layoutUrl,
  `${JSON.stringify(LAYOUT, null, 2)
    .replace(/\[\s+(-?\d+),\s+(-?\d+)\s+\]/g, '[$1, $2]')
    .replace(/\[\s+(-?\d+),\s+(-?\d+),\s+(-?\d+),\s+(-?\d+)\s+\]/g, '[$1, $2, $3, $4]')}\n`,
);

// ---------- lighting polish ----------
// Daylight spilling from the main window onto the wall around it.
for (let k = 0; k < 3; k++) {
  const [x, y, w, h] = win;
  ellA(x + w / 2, y + h / 2 + 4, w / 2 + 26 - k * 10, h / 2 + 22 - k * 7, '#fffaf0', 26);
}
// Brass wall sconces with a tulip shade, each throwing a warm pool of light up and down the wall.
function sconce(cx) {
  const y = 44;
  ellA(cx, y + 2, 16, 20, '#ffe9b0', 34);
  ellA(cx, y + 2, 9, 12, '#fff2cc', 40);
  rect(cx - 3, y + 14, 6, 3, '#a8812f'); // wall plate
  frame(cx - 3, y + 14, 6, 3, P.outline);
  s.line(cx, y + 13, cx, y + 5, '#a8812f'); // arm, up to the shade
  // tulip shade: narrow at the top, flaring down, outlined all round, lit from the left
  const half = (yy) => Math.round(1.5 + (yy - (y - 3)) * 0.45);
  const inShade = (x, yy) => yy >= y - 3 && yy <= y + 3 && Math.abs(x - cx) <= half(yy);
  outlined(cx - 5, y - 3, cx + 5, y + 3, inShade, (x, yy) => (yy === y + 3 ? '#ffe08a' : x < cx ? '#fffaf0' : '#f2e3c4'));
  s.px(cx, y + 5, '#ffe9a8'); // the bulb, peeking out under the shade
}
sconce(166);
sconce(W - 166);

// The cloth's front fold casts a shadow on the table apron, and the cloth darkens gently toward the corners
// and the far wall, so the lit middle of the table (where the trays are) reads first.
rect(0, botY + 12, W, 2, '#6b5236', 70);
s.fill(0, topY, W - 1, botY + 11, (x, y) => {
  const dx = (x - W / 2) / (W / 2);
  const dy = (y - (topY + botY) / 2) / ((botY - topY) / 2);
  const d = Math.max(0, Math.hypot(dx * 0.9, dy * 0.6) - 0.55);
  if (d > 0) s.px(x, y, '#7a5a44', Math.min(70, Math.round(d * 110)));
  if (y < topY + 10) s.px(x, y, '#7a5a44', (10 - (y - topY)) * 4); // contact shadow against the wall
  return null;
});
// A highlight running along each tray's far rim, where the window light catches it.
for (const side of [0, 1]) {
  for (let i = 0; i <= 400; i++) {
    const t = 0.15 + (i / 400) * 0.7;
    const X = tray.x0 + (tray.x1 - tray.x0) * t;
    const [x, y] = toScreen(side === 0 ? X : -X, tray.z1 - 0.018);
    s.px(Math.round(x), Math.round(y), '#f4efe6');
  }
}

// ---------- floor (below the table): warm wooden boards running toward the room ----------
const floorY = botY + 24;
rect(0, floorY, W, H - floorY, P.floor);
for (let k = -12; k <= 12; k++) s.line(VX + k * 34, floorY, VX + k * 44, H, P.floorLine);
for (const y of [floorY + 8]) rect(0, y, W, 1, P.floorHi);
rect(0, floorY, W, 1, P.outline);

// ---------- HUD plaques (the game draws the bars, numbers and names on them) ----------
for (const [x, y, w, h] of LAYOUT.plaques) {
  panel(x, y, w, h, P.plaque, '#ffffff', P.plaqueShade);
  rect(x + 3, y + h, 3, 2, P.outline);
  rect(x + w - 6, y + h, 3, 2, P.outline);
}
{
  const [x, y, w, h] = LAYOUT.round;
  for (const sx of [x + 10, x + w - 11]) rect(sx, 0, 1, y, P.outline);
  panel(x, y, w, h, P.oak, P.oakHi, P.oakDark);
  rect(x + 3, y + 3, w - 6, h - 6, P.chalk);
}

if (process.argv.includes('--guide')) {
  for (const side of LAYOUT.anchors) for (const [ax, ay] of side) frame(ax - 32, ay - 60, 64, 64, '#ff00ff');
}

const out = new URL('../art/scenes/battle.png', import.meta.url);
mkdirSync(new URL('.', out), { recursive: true });
writeFileSync(out, s.png());
console.log('wrote art/scenes/battle.png (640x360)');
const pi = process.argv.indexOf('--preview');
if (pi > 0) {
  writeFileSync(process.argv[pi + 1], encodePng(upscale(s.data, W, H, 3), W * 3, H * 3));
  console.log(`wrote ${process.argv[pi + 1]}`);
}
