// Tiny pixel-art toolkit used by the sprite and scene generators: shaded shapes, colour ramps,
// auto outlines in a darker shade of the neighbouring colour, soft drop shadows, and PNG output.
import { deflateSync } from 'node:zlib';

// ---------- colour ----------
export const hexToRgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hslToHex([h, s, l]) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
/** Shift a colour's lightness by `dl` (-1..1), nudging hue warm when lighter and cool when darker. */
export function shade(hex, dl) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const hueShift = dl > 0 ? (h > 60 && h < 240 ? -10 : 8) * dl : (h > 60 && h < 240 ? 14 : -14) * dl;
  return hslToHex([h - hueShift, Math.min(1, s * (dl < 0 ? 1.08 : 0.92)), Math.max(0, Math.min(1, l + dl))]);
}
/** 5-tone ramp from a base colour: [specular, light, base, shade, deep]. */
export const ramp = (base) => [shade(base, 0.3), shade(base, 0.12), base, shade(base, -0.14), shade(base, -0.27)];

// ---------- lighting ----------
const L = (() => { const v = [-0.55, -0.68, 0.48]; const n = Math.hypot(...v); return v.map((c) => c / n); })();
/** Sphere-style shading for a surface normal given by its in-plane components (-1..1). */
export function lit(nx, ny, r, bias = 0) {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const d = L[0] * nx + L[1] * ny + L[2] * nz + bias;
  return d > 0.93 ? r[0] : d > 0.66 ? r[1] : d > 0.32 ? r[2] : d > 0.02 ? r[3] : r[4];
}

// ---------- sprite ----------
export class Sprite {
  constructor(w = 32, h = 32) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  alpha(x, y) { return this.inside(x, y) ? this.data[(y * this.w + x) * 4 + 3] : 0; }
  get(x, y) { const i = (y * this.w + x) * 4; return toHex(this.data[i], this.data[i + 1], this.data[i + 2]); }
  px(x, y, hex, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (!hex || !this.inside(x, y)) return;
    const [r, g, b] = hexToRgb(hex), i = (y * this.w + x) * 4;
    if (a >= 255 || this.data[i + 3] === 0) { this.data.set([r, g, b, a], i); return; }
    const t = a / 255; // blend over what is there
    this.data[i] = this.data[i] * (1 - t) + r * t;
    this.data[i + 1] = this.data[i + 1] * (1 - t) + g * t;
    this.data[i + 2] = this.data[i + 2] * (1 - t) + b * t;
    this.data[i + 3] = Math.max(this.data[i + 3], a);
  }
  /** Calls color(x, y) for every pixel in a box; non-null results are drawn. */
  fill(x0, y0, x1, y1, color) {
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) this.px(x, y, color(x, y));
  }
  rect(x, y, w, h, hex) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, hex); }
  /** Shaded ellipsoid. opts.clip(x, y) limits it; opts.tone(nx, ny) returns a ramp-index offset (stripes etc). */
  ball(cx, cy, rx, ry, r, opts = {}) {
    this.fill(cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1, (x, y) => {
      const nx = (x - cx) / (rx + 0.35), ny = (y - cy) / (ry + 0.35);
      if (nx * nx + ny * ny > 1 || (opts.clip && !opts.clip(x, y))) return null;
      let c = lit(nx, ny, r, opts.bias ?? 0);
      const off = opts.tone ? opts.tone(nx, ny, x, y) : 0;
      if (off) c = r[Math.max(0, Math.min(4, r.indexOf(c) + off))];
      return c;
    });
  }
  /** Tube along a polyline; radius may be a number or (t 0..1) => number. pick(signedOffset, t) can swap ramps. */
  tube(points, radius, r, pick) {
    const segs = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i], [bx, by] = points[i + 1], len = Math.hypot(bx - ax, by - ay);
      segs.push({ ax, ay, bx, by, len, start: total });
      total += len;
    }
    const rad = typeof radius === 'function' ? radius : () => radius;
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]), m = 6;
    this.fill(Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m, (x, y) => {
      let best = null;
      for (const s of segs) {
        const dx = s.bx - s.ax, dy = s.by - s.ay;
        const u = Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / (s.len * s.len || 1)));
        const qx = s.ax + u * dx, qy = s.ay + u * dy, d = Math.hypot(x - qx, y - qy);
        if (!best || d < best.d) best = { d, qx, qy, t: (s.start + u * s.len) / (total || 1), dx, dy, len: s.len };
      }
      const rr = rad(best.t);
      if (best.d > rr + 0.3) return null;
      const nx = (x - best.qx) / (rr + 0.4), ny = (y - best.qy) / (rr + 0.4);
      const ramp_ = pick ? pick(((x - best.qx) * -best.dy + (y - best.qy) * best.dx) / (best.len || 1), best.t) : r;
      return lit(nx, ny, ramp_);
    });
  }
  /** Filled polygon; color(x, y) picks the colour per pixel. */
  poly(pts, color) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    this.fill(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (x, y) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside ? (typeof color === 'function' ? color(x, y) : color) : null;
    });
  }
  line(x0, y0, x1, y1, hex) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.px(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, hex);
  }
  /** Soft contact shadow under the object (drawn first, semi-transparent). */
  shadow(cx, cy, rx, ry = 2) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d <= 1) this.px(x, y, '#2a1610', d < 0.45 ? 110 : 70);
      }
    }
  }
  /** Outline every opaque shape with a darker shade of the colour it touches (shadow pixels don't count). */
  outline(dl = -0.32) {
    const solid = (x, y) => this.alpha(x, y) === 255;
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (solid(x, y)) continue;
      const n = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([a, b]) => solid(a, b));
      if (n.length) add.push([x, y, shade(this.get(...n[0]), dl)]);
    }
    for (const [x, y, c] of add) this.px(x, y, c);
  }
  /** Pixels with one or zero solid neighbours are dropped (stray tips from rounding). */
  clean() {
    const solid = (x, y) => this.alpha(x, y) === 255;
    const drop = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!solid(x, y)) continue;
      if ([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([a, b]) => solid(a, b)).length <= 1) drop.push((y * this.w + x) * 4);
    }
    for (const i of drop) this.data[i + 3] = 0;
  }
  png() { return encodePng(this.data, this.w, this.h); }
}

// ---------- PNG ----------
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
export function encodePng(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** Nearest-neighbour upscale (for previews). */
export function upscale(rgba, w, h, n) {
  const out = new Uint8ClampedArray(w * n * h * n * 4);
  for (let y = 0; y < h * n; y++) for (let x = 0; x < w * n; x++) {
    const s = (Math.floor(y / n) * w + Math.floor(x / n)) * 4;
    out.set(rgba.subarray(s, s + 4), (y * w * n + x) * 4);
  }
  return out;
}
