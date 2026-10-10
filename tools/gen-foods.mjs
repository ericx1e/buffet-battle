// Draws 32x32 pixel-art sprites for every food and summoned token into art/units/.
// Usage: node tools/gen-foods.mjs [--sheet preview.png]
// Hand-drawn sprites are never overwritten: a file is only (re)written if this script created it before
// (tracked in art/units/.generated.json) or no sprite for that food exists yet.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Sprite, encodePng, ramp, shade, upscale } from './pixel.mjs';

const R = ramp;
const C = {
  eggshell: R('#efe4d2'), red: R('#d6352a'), stem: R('#4f8f2c'), leaf: R('#5aa63a'),
  lemon: R('#f2d035'), pretzel: R('#b4632a'), popcorn: R('#fff0c4'), stripeRed: R('#d23a33'), stripeWhite: R('#f4efe8'),
  onion: R('#c98a3c'), garlic: R('#efe6dc'), mallow: R('#f6e2e6'), potato: R('#b88a53'), wasabi: R('#8fbf3a'),
  clay: R('#b9682e'), honey: R('#f2b21e'), wood: R('#a8693a'), pickle: R('#6f9330'), fish: R('#8ea8b6'),
  capRed: R('#d23f2e'), cream: R('#efe0c3'), bean: R('#6e3f20'), melon: R('#3b8b34'), rind: R('#f0a23a'),
  pink: R('#ef7468'), meat: R('#b8443a'), fat: R('#f1dcc4'), steak: R('#8c3e24'), ghost: R('#e2501e'),
  pine: R('#e3a72a'), durian: R('#a2ad3c'), gold: R('#d6ad45'), black: R('#3a3a40'), cheese: R('#f2c34e'),
  crust: R('#c98a3e'), pepperoni: R('#c33a2c'), pot: R('#4b4b55'), broth: R('#d4472a'), frosting: R('#f39ab8'),
  white: R('#f7f4f0'), bowl: R('#e6edf3'), kimchi: R('#d9482f'), ramenBowl: R('#c43b2d'), noodle: R('#f4dc9a'),
  yolk: R('#f2a41e'), spore: R('#b99b72'), melonRed: R('#ec4a4a'), sponge: R('#f2cf8a'),
};

/**
 * A standing cylinder seen from slightly above, like everything else in the game: its side (a radius that can taper
 * from rxTop to rxBot), a bottom edge that curves toward you, and its top as an ellipse. The rim's curve also bends
 * any band on the side: side(t, v) gets the column (-1 left .. 1 right) and v, the distance below the rim at that
 * column, so a label drawn at v 5..9 curves like a real one. top(x, y) colours the top ellipse (null skips it).
 */
function cylinder(s, cx, top, bottom, rxTop, rxBot, ry, side, topFill) {
  s.fill(cx - Math.max(rxTop, rxBot) - 1, top - ry - 1, cx + Math.max(rxTop, rxBot) + 1, bottom + ry + 1, (x, y) => {
    const k = Math.max(0, Math.min(1, (y - top) / (bottom - top)));
    const rx = rxTop + (rxBot - rxTop) * k;
    const t = (x - cx) / rx;
    if (Math.abs(t) > 1) return null;
    const dip = ry * Math.sqrt(Math.max(0, 1 - t * t));
    if (y < top + dip || y > bottom + dip) return null;
    return side(t, y - (top + dip));
  });
  if (topFill) {
    s.fill(cx - rxTop, top - ry, cx + rxTop, top + ry, (x, y) => (((x - cx) / rxTop) ** 2 + ((y - top) / ry) ** 2 <= 1 ? topFill(x, y) : null));
  }
}
/**
 * A box seen from the front and a little above, like everything else: its front face (x0..x1, top..bottom) shaded
 * light on the left and dark on the right, and a thin top face `depth` tall that narrows toward the back.
 */
function box(s, x0, x1, top, bottom, depth, front, topFill) {
  s.poly([[x0, top], [x1, top], [x1, bottom], [x0, bottom]], (x) => (x < x0 + 2 ? front[1] : x > x1 - 2 ? front[3] : front[2]));
  s.poly([[x0 + 2, top - depth], [x1 - 2, top - depth], [x1, top], [x0, top]], topFill);
  s.rect(x0, top, x1 - x0 + 1, 1, front[0]); // the near edge catches the light
}
/**
 * A round bowl, dish or plate from the side and a little above: its outside (below the rim, shaded like a cylinder),
 * the rim (an ellipse `ry` tall, catching the light) and its opening, filled by `inside(x, y)`.
 */
function bowl(s, cx, rimY, rx, ry, depth, ramp, inside) {
  s.fill(Math.floor(cx - rx - 1), Math.floor(rimY - ry - 1), Math.ceil(cx + rx + 1), Math.ceil(rimY + depth + 1), (x, y) => {
    const t = (x - cx) / rx;
    if (Math.abs(t) > 1) return null;
    if (((x - cx) / rx) ** 2 + ((y - rimY) / ry) ** 2 <= 1) {
      return ((x - cx) / (rx - 1.3)) ** 2 + ((y - rimY) / (ry - 0.9)) ** 2 <= 1 ? inside(x, y) : ramp[0];
    }
    if (y < rimY || y > rimY + depth * Math.sqrt(1 - t * t)) return null;
    return cyl(ramp, t);
  });
}
/** The usual side shading for a cylinder: lit on the left, a shade band and dark core on the right. */
const cyl = (r, t) => (t < -0.62 ? r[1] : t > 0.78 ? r[4] : t > 0.45 ? r[3] : r[2]);

const foods = {
  apple(s) {
    s.shadow(17, 29, 10, 2);
    // Two overlapping lobes give the apple its shoulders; a dimple where the stem goes in.
    const red = R('#d4302a');
    s.ball(12, 18, 8, 9, red);
    s.ball(20, 18, 8, 9, red);
    s.ball(16, 20, 10, 8, red);
    s.px(16, 11, red[4]); s.px(15, 11, red[3]); s.px(17, 11, red[3]);
    s.tube([[16, 11], [17, 7], [18, 5]], 1, C.wood);
    s.ball(21, 7, 4, 2, C.leaf);
    s.line(19, 7, 23, 7, C.leaf[3]);
  },
  cheese(s) {
    s.shadow(18, 27, 12, 2);
    // A wedge seen from the front: lit triangular top tapering to a point on the left, a taller front face
    // toward the thick rind end, and round holes (dark upper rim, lit lower lip).
    const cheese = R('#f5c02c');
    const holes = [[12, 21, 2.2], [20, 19, 3], [26, 20, 2], [17, 24, 1.6], [16, 14, 1.8], [23, 12, 1.4]];
    const holed = (x, y, base) => {
      const h = holes.find(([hx, hy, r]) => ((x - hx) / r) ** 2 + ((y - hy) / (r * 0.85)) ** 2 <= 1);
      return h ? (y <= h[1] ? cheese[4] : cheese[3]) : base;
    };
    s.poly([[3, 22], [23, 8], [29, 13]], (x, y) => holed(x, y, cheese[1]));
    s.poly([[3, 22], [29, 13], [29, 24], [3, 24]], (x, y) => holed(x, y, x > 26 ? cheese[3] : cheese[2]));
    s.line(3, 22, 29, 13, cheese[0]);
  },
  salt(s) {
    s.shadow(17, 29, 9, 2);
    // Glass shaker of white salt with a perforated steel cap.
    const glass = R('#dbe9ec'), steel = R('#b7c1c7'), salt = R('#f7f6f2');
    s.fill(8, 13, 24, 28, (x, y) => {
      const t = (x - 16) / 8;
      if (Math.abs(t) > 1 || (y > 25 && ((x - 16) / 8) ** 2 + ((y - 25) / 3) ** 2 > 1)) return null;
      if (t < -0.78) return glass[1];
      if (t > 0.72) return glass[3];
      if (y >= 16) return (x * 5 + y * 3) % 7 === 0 ? salt[3] : t < -0.4 ? salt[1] : salt[2];
      return glass[2];
    });
    s.rect(10, 17, 1, 8, '#ffffff');
    s.fill(8, 10, 24, 14, (x, y) => (Math.abs(x - 16) <= 8 && y >= 12 ? (x < 10 ? steel[1] : x > 21 ? steel[3] : steel[2]) : null));
    s.ball(16, 10, 8, 4, steel, { clip: (x, y) => y <= 11 });
    for (const [x, y] of [[13, 8], [16, 7], [19, 8], [14, 10], [18, 10]]) s.px(x, y, steel[4]);
  },
  egg(s) {
    s.shadow(17, 28, 9, 2);
    s.ball(16, 17, 8, 10, C.eggshell);
  },
  chili(s) {
    s.shadow(18, 28, 9, 2);
    // Body starts under the cap; the stem grows out of the cap's middle and the cap hugs the shoulders.
    s.tube([[12, 12], [13, 15], [15, 19], [18, 22], [21, 25], [25, 26]], (t) => 4.4 - 3.2 * t, C.red);
    s.tube([[12, 9], [10, 6], [8, 4], [7, 2]], (t) => 1.6 - 0.4 * t, C.stem);
    s.ball(12, 10, 5, 3, C.leaf);
    s.ball(8, 11, 2, 1.5, C.leaf); // calyx lobes drooping over the shoulders
    s.ball(16, 11, 2, 1.5, C.leaf);
  },
  sugar(s) {
    s.shadow(17, 28, 11, 2);
    const speck = (x, y) => ((x * 7 + y * 13) % 9 === 0);
    s.poly([[16, 8], [26, 13], [16, 18], [6, 13]], (x, y) => (speck(x, y) ? '#e6e0ea' : '#ffffff'));
    s.poly([[6, 13], [16, 18], [16, 28], [6, 23]], (x, y) => (speck(x, y) ? '#cfc8d6' : '#e8e3ec'));
    s.poly([[16, 18], [26, 13], [26, 23], [16, 28]], (x, y) => (speck(x, y) ? '#aaa2b4' : '#c3bccb'));
  },
  lemon(s) {
    s.shadow(17, 27, 11, 2);
    s.ball(5, 18, 2, 2, C.lemon);
    s.ball(27, 18, 2, 2, C.lemon);
    s.ball(16, 18, 10, 7, C.lemon, { tone: (nx, ny, x, y) => ((x + y) % 5 === 0 && ny < 0.5 ? 1 : 0) });
    s.ball(21, 10, 4, 2, C.leaf);
    s.line(18, 11, 17, 12, C.stem[3]);
  },
  pretzel(s) {
    s.shadow(17, 28, 13, 2);
    // A pretzel lying on the table, seen from slightly above: squashed top to bottom, with its baked underside
    // showing as a darker edge below.
    const sq = ([x, y]) => [x, 17 + (y - 16) * 0.72];
    const heart = [[16, 25], [10, 21], [6, 16], [6, 10], [9, 7], [13, 7], [16, 10], [19, 7], [23, 7], [26, 10], [26, 16], [22, 21], [16, 25]].map(sq);
    const cross = [[[9, 23], [20, 12]], [[23, 23], [12, 12]]].map((l) => l.map(sq));
    const under = R('#7e3f18');
    s.tube(heart.map(([x, y]) => [x, y + 2]), 2.3, under);
    for (const l of cross) s.tube(l.map(([x, y]) => [x, y + 2]), 2.1, under);
    s.tube(heart, 2.3, C.pretzel);
    for (const l of cross) s.tube(l, 2.1, C.pretzel);
    for (const [x, y] of [[8, 9], [12, 6], [20, 6], [25, 9], [6, 14], [26, 15], [15, 16], [18, 20], [11, 21]].map(sq)) s.px(x, Math.round(y), '#fbf6ee');
  },
  popcorn(s) {
    s.shadow(17, 29, 9, 2);
    // A striped bucket seen from slightly above (curved bottom, the rim's back edge showing), heaped with popcorn.
    cylinder(s, 16, 15, 27, 8.5, 6, 2.2, (t, v) => {
      const stripe = Math.floor((t + 1) * 3.4) % 2 === 0 ? C.stripeRed : C.stripeWhite;
      return t > 0.62 ? stripe[3] : t < -0.7 ? stripe[1] : stripe[2];
    }, () => '#e8d6c0');
    for (const [x, y, r] of [[10, 13, 3], [22, 13, 3], [14, 11, 3], [18, 12, 3], [12, 8, 3], [17, 7, 3], [21, 9, 3], [15, 4, 2], [16, 14, 3]]) s.ball(x, y, r, r - 0.5, C.popcorn);
  },
  onion(s) {
    s.shadow(17, 29, 9, 2);
    s.tube([[16, 11], [16, 6], [18, 3]], (t) => 2.5 - 1.6 * t, C.onion);
    s.ball(16, 19, 9, 9, C.onion, { tone: (nx) => (Math.abs(Math.round(nx * 10)) % 4 === 2 ? 1 : 0) });
    for (const x of [14, 16, 18]) s.line(x, 28, x + (x - 16) / 2, 29, '#e9d8b4');
  },
  garlic(s) {
    s.shadow(17, 29, 9, 2);
    s.tube([[16, 12], [16, 7], [15, 4]], (t) => 3 - 2 * t, C.garlic);
    s.ball(16, 20, 9, 8, C.garlic, { tone: (nx, ny) => (Math.abs(Math.round(nx * 8)) % 3 === 1 && ny > -0.6 ? 1 : 0) });
    for (const [x, y] of [[13, 25], [17, 26], [20, 24]]) s.px(x, y, '#b98bb0');
  },
  marshmallow(s) {
    s.shadow(17, 28, 9, 2);
    s.fill(8, 12, 24, 27, (x, y) => {
      const t = (x - 16) / 8;
      if (Math.abs(t) > 1 || (y > 24 && ((x - 16) / 8) ** 2 + ((y - 24) / 3) ** 2 > 1)) return null;
      return t < -0.6 ? C.mallow[1] : t > 0.55 ? C.mallow[3] : C.mallow[2];
    });
    s.ball(16, 12, 8, 3, C.mallow, { bias: 0.35 });
  },
  potato(s) {
    s.shadow(17, 28, 11, 2);
    s.ball(16, 19, 11, 7, C.potato, {
      // Eye dimples: a dark pixel with a lit rim above it
      tone: (nx, ny, x, y) => ([[11, 17], [20, 21], [21, 16], [14, 22]].some(([ex, ey]) => ex === x && ey === y) ? 2 : [[11, 16], [21, 15]].some(([ex, ey]) => ex === x && ey === y) ? -1 : 0),
    });
  },
  wasabi(s) {
    s.shadow(17, 28, 10, 2);
    s.ball(16, 24, 10, 4, C.wasabi);
    s.ball(16, 20, 8, 4, C.wasabi);
    s.ball(16, 16, 6, 3, C.wasabi);
    s.ball(16, 13, 4, 2, C.wasabi);
    s.ball(17, 10, 2, 2, C.wasabi);
  },
  honey(s) {
    s.shadow(17, 29, 10, 2);
    s.ball(16, 21, 10, 8, C.clay);
    s.ball(16, 13, 8, 3, C.honey, { bias: 0.2 });
    for (const [x, len] of [[10, 5], [13, 3], [20, 6], [22, 3]]) s.tube([[x, 14], [x, 14 + len]], 1.3, C.honey);
    s.tube([[23, 3], [18, 11]], 1, C.wood);
    s.ball(17, 12, 3, 2, C.honey);
  },
  pickle(s) {
    s.shadow(17, 28, 11, 2);
    s.tube([[8, 24], [13, 18], [19, 13], [24, 8]], 5, C.pickle);
    for (const [x, y] of [[11, 20], [15, 17], [19, 12], [14, 21], [20, 16], [23, 11], [17, 14]]) s.px(x, y, C.pickle[1]);
  },
  anchovy(s) {
    s.shadow(17, 25, 12, 2);
    s.poly([[23, 17], [29, 11], [28, 17], [29, 23]], (x) => (x > 27 ? C.fish[3] : C.fish[2]));
    s.ball(15, 17, 10, 5, C.fish, { tone: (nx, ny) => (ny > 0.35 ? -1 : 0) });
    s.poly([[13, 12], [18, 9], [19, 13]], C.fish[3]);
    s.px(8, 16, '#1d2328');
    s.px(7, 15, '#ffffff');
  },
  mushroom(s) {
    s.shadow(17, 29, 10, 2);
    // A toadstool from the side and a little above: a stout cream stem (a cylinder, wider at the foot), the cap's
    // thick lip curving round in front, then the domed red cap with its spots squashed toward the edges.
    cylinder(s, 16, 18, 27, 3.6, 4.8, 1.5, (t) => cyl(C.cream, t));
    s.rect(13, 18, 7, 1, C.cream[4]); // shade under the cap
    cylinder(s, 16, 14, 16, 12.5, 12.5, 2.4, (t) => C.capRed[t > 0.45 ? 4 : t < -0.6 ? 3 : 3]);
    s.ball(16, 14, 12.5, 9.5, C.capRed, { clip: (x, y) => y <= 15 + 2.4 * Math.sqrt(Math.max(0, 1 - ((x - 16) / 12.5) ** 2)) - 1.2, bias: 0.15 });
    for (const [x, y, r] of [[16, 8, 2.2], [10, 11, 1.8], [22, 10, 1.8], [7, 14, 1.2], [25, 14, 1.2], [13, 14, 1.4], [19, 13.5, 1.4]]) {
      const squash = 1 - (0.55 * Math.abs(x - 16)) / 12;
      s.ball(x, y, Math.max(0.8, r * squash), r * 0.75, C.white);
    }
  },
  coffee(s) {
    s.shadow(17, 29, 9, 2);
    s.ball(16, 17, 9, 11, C.bean);
    for (let y = 8; y <= 26; y++) {
      const x = 16 + Math.round(2 * Math.sin(((y - 8) / 18) * Math.PI * 1.1));
      s.px(x, y, C.bean[4]);
      s.px(x - 1, y, C.bean[3]);
      s.px(x + 1, y, C.bean[1]);
    }
  },
  watermelon(s) {
    s.shadow(17, 29, 13, 2);
    s.ball(16, 18, 14, 10, C.melon, { tone: (nx) => (Math.sin((nx + 1) * 9) > 0.55 ? 1 : 0) });
    s.tube([[16, 8], [17, 5]], 1, C.stem);
  },
  grapefruit(s) {
    s.shadow(17, 29, 12, 2);
    s.ball(16, 19, 12, 9, C.rind);
    s.fill(5, 10, 27, 22, (x, y) => {
      const nx = (x - 16) / 10, ny = (y - 15) / 6;
      if (nx * nx + ny * ny > 1) return null;
      if (nx * nx + ny * ny > 0.78) return '#fbe9c8';
      const ang = Math.atan2(ny, nx);
      if (Math.abs(Math.sin(ang * 4)) < 0.12 || (x === 16 && y === 15)) return '#f8d2c4';
      return ny < -0.2 || nx < -0.3 ? C.pink[1] : C.pink[2];
    });
  },
  bacon(s) {
    s.shadow(17, 28, 12, 2);
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push([5 + 22 * t, 9 + 15 * t + 2.2 * Math.sin(t * Math.PI * 3)]);
    }
    s.tube(pts, 4, C.meat, (off) => (Math.abs(off) < 1.2 || off > 3 ? C.fat : C.meat));
  },
  steak(s) {
    s.shadow(17, 28, 13, 2);
    // A thick-cut steak lying on the table seen from slightly above: its seared side shows below the top, which has
    // grill marks and a rim of fat.
    s.ball(16, 20, 13, 7, R('#5a2614'));
    s.ball(16, 17, 13, 7, C.steak, {
      tone: (nx, ny, x, y) => {
        if (nx * nx + ny * ny > 0.72 && ny < 0.3) return 0;
        return (x - y + 40) % 6 === 0 && Math.abs(nx) < 0.75 ? 2 : 0; // grill marks
      },
    });
    s.fill(3, 9, 29, 25, (x, y) => {
      const nx = (x - 16) / 13.35, ny = (y - 17) / 7.35, d = nx * nx + ny * ny;
      return d <= 1 && d > 0.74 && ny < 0.2 ? (nx < 0 ? C.fat[1] : C.fat[2]) : null;
    });
    s.ball(23, 16, 3, 1.6, C.white);
  },
  ghostPepper(s) {
    s.shadow(17, 29, 9, 2);
    // A squat, wrinkled pepper that tapers to a curled point
    s.tube([[16, 14], [15, 16], [15, 19], [17, 23], [20, 26], [23, 25]], (t) => (t < 0.55 ? 6.3 - 1.5 * t : 5.5 - 9 * (t - 0.55)), C.ghost, (off, t) => (Math.sin(off * 1.8 + t * 9) > 0.75 ? C.ghost.map((c) => shade(c, -0.1)) : C.ghost));
    // The stem rises from the middle of a cap wide enough to cover the pepper's shoulders.
    s.tube([[16, 10], [16, 6], [17, 4], [19, 2]], (t) => 1.7 - 0.5 * t, C.stem);
    s.ball(16, 11, 6.5, 3, C.leaf);
    s.ball(10.5, 12.5, 2, 1.5, C.leaf);
    s.ball(21.5, 12.5, 2, 1.5, C.leaf);
  },
  pineapple(s) {
    s.shadow(17, 29, 9, 2);
    for (const [x, y] of [[10, 2], [13, 0], [16, -1], [19, 0], [22, 2]]) s.tube([[16, 11], [x, y + 2]], (t) => 1.8 - 0.8 * t, C.leaf);
    s.ball(16, 20, 8, 10, C.pine, { tone: (nx, ny, x, y) => ((x + y) % 4 === 0 || (x - y + 40) % 4 === 0 ? 1 : 0) });
  },
  durian(s) {
    s.shadow(17, 29, 12, 2);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const x = 16 + Math.cos(a) * 11.5, y = 18 + Math.sin(a) * 10.5;
      s.poly([[x - 1.5, y], [x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5], [x + 1.5, y]], C.durian[3]);
    }
    s.ball(16, 18, 11, 10, C.durian, { tone: (nx, ny, x, y) => (x % 3 === 0 && y % 3 === 0 ? -1 : (x % 3 === 1 && y % 3 === 1 ? 1 : 0)) });
    s.tube([[16, 8], [17, 5]], 1.2, C.wood);
  },
  caviar(s) {
    s.shadow(17, 27, 13, 2);
    // Classic blue tin seen from slightly above: a short side band, a gold rim, glossy black pearls, a pearl spoon.
    const tin = R('#2f5d97');
    s.fill(3, 17, 29, 26, (x, y) => {
      const t = (x - 16) / 13;
      if (Math.abs(t) > 1 || (y > 22 && ((x - 16) / 13) ** 2 + ((y - 22) / 4) ** 2 > 1)) return null;
      return t < -0.7 ? tin[1] : t > 0.55 ? tin[3] : tin[2];
    });
    s.ball(16, 17, 13, 6, C.gold, { bias: 0.25 });
    s.fill(4, 11, 28, 23, (x, y) => {
      const nx = (x - 16) / 11, ny = (y - 17) / 4.6;
      if (nx * nx + ny * ny > 1) return null;
      if ((x + y) % 2 === 0) return (x * 3 + y * 5) % 11 === 0 ? '#b9c0cc' : '#34353e';
      return '#17181d';
    });
    s.tube([[19, 15], [27, 9]], 1, R('#efe9e2'));
    s.ball(19, 16, 3, 2, R('#f3eee8'));
  },
  pizza(s) {
    s.shadow(17, 29, 14, 2);
    // A whole pizza on a wooden board, from the side and a little above: the board's edge, the round pie (an
    // ellipse) with a thick golden crust rim, flat melted cheese, pepperoni ovals and one slice cut out of it.
    bowl(s, 16, 21, 14.5, 4.5, 3, R('#b07a42'), () => '#c89058'); // the board
    const ring = (x, y, rx, ry) => ((x - 16) / rx) ** 2 + ((y - 18) / ry) ** 2;
    s.fill(2, 12, 30, 24, (x, y) => {
      const r = ring(x, y, 13, 5.4);
      if (r > 1) return null;
      if (ring(x, y, 10.6, 3.9) > 1) return y < 17 ? C.crust[1] : y > 20 ? C.crust[3] : C.crust[2]; // crust rim
      return y > 19 ? '#e8a830' : (x + y) % 7 === 0 ? '#ffe08a' : '#f6c440'; // cheese, a little darker toward you
    });
    for (const [x, y] of [[10, 17], [16, 16], [22, 17], [12, 20], [19, 20]]) { s.ball(x, y, 2, 1.1, R('#c8322a')); s.px(x - 1, y - 1, '#e8645a'); }
    s.line(16, 18, 27, 18, '#c88a2a'); // the cuts
    s.line(16, 18, 21, 21, '#c88a2a');
    s.px(13, 16, C.leaf[1]); s.px(24, 19, C.leaf[1]); s.px(18, 19, C.leaf[2]);
  },
  hotPot(s) {
    s.shadow(17, 29, 13, 2);
    for (const x of [3, 29]) s.ball(x, 18, 2, 2, C.pot);
    s.fill(4, 16, 28, 28, (x, y) => {
      const t = (x - 16) / 12;
      if (Math.abs(t) > 1 || (y > 24 && ((x - 16) / 12) ** 2 + ((y - 24) / 4) ** 2 > 1)) return null;
      return t < -0.7 ? C.pot[1] : t > 0.55 ? C.pot[3] : C.pot[2];
    });
    s.ball(16, 16, 12, 4, C.broth, { bias: 0.25, tone: (nx, ny, x, y) => ((x * 5 + y * 3) % 11 === 0 ? -2 : 0) });
    for (const [x, y] of [[11, 15], [19, 17], [21, 14]]) s.tube([[x, y], [x + 3, y - 1]], 1, C.red);
    for (const x of [11, 16, 21]) for (let y = 4; y < 11; y++) s.px(x + Math.round(Math.sin(y * 0.9 + x) * 1.2), y, '#ffffff', 70);
  },
  cake(s) {
    s.shadow(17, 29, 13, 2);
    // A round birthday cake from the side and a little above: pink sides with a cream band, the frosted top (an
    // ellipse), cream drips over the edge and a candle in the middle.
    const band = (t, v) => (v === 6 || v === 7 ? cyl(C.white, t) : cyl(C.frosting, t));
    cylinder(s, 16, 15, 26, 12, 12, 4, band, (x, y) => (y < 14 ? C.white[1] : C.white[0]));
    for (const [x, len] of [[7, 3], [12, 4], [20, 3], [25, 2]]) s.tube([[x, 17 + (Math.abs(x - 16) < 6 ? 1 : 0)], [x, 17 + len]], 0.9, C.white);
    s.rect(15, 6, 2, 8, '#8fc3e8');
    s.px(15, 8, '#ffffff'); s.px(16, 10, '#ffffff'); s.px(15, 12, '#ffffff');
    s.ball(16, 4, 1, 2, R('#ffc23a'));
  },
  curry(s) {
    s.shadow(17, 29, 13, 2);
    // A wide white plate-bowl from the side and a little above: a mound of rice on the left, brown curry on the
    // right with chunks of carrot and potato, the rice rising out of the opening.
    const curry = R('#a8642a');
    bowl(s, 16, 19, 13.5, 4.4, 7, C.bowl, (x, y) => (x < 14 ? '#f7f4ee' : (x * 3 + y * 5) % 7 === 0 ? curry[3] : y < 18 ? curry[1] : curry[2]));
    s.ball(11, 16, 6, 4, R('#f7f4f0'), { bias: 0.3, tone: (nx, ny, x, y) => ((x * 5 + y * 3) % 7 === 0 ? 1 : 0) });
    for (const [x, y, c] of [[19, 18, '#f08a2a'], [23, 19, '#f08a2a'], [21, 20, '#f0d48a'], [25, 18, '#f0d48a']]) s.ball(x, y, 1.4, 1, R(c), { bias: 0.3 });
    s.px(10, 13, '#ffffff'); s.px(13, 14, '#ffffff');
  },
  fudge(s) {
    s.shadow(17, 29, 11, 2);
    // A thick square of fudge on the diagonal, like the sugar cube: lit top with a walnut half, two shaded sides.
    const fudge = R('#6e3c22');
    const speck = (x, y) => (x * 5 + y * 3) % 11 === 0;
    s.poly([[16, 9], [27, 14], [16, 19], [5, 14]], (x, y) => (speck(x, y) ? fudge[0] : fudge[1]));
    s.poly([[5, 14], [16, 19], [16, 27], [5, 22]], (x, y) => (speck(x, y) ? fudge[3] : fudge[2]));
    s.poly([[16, 19], [27, 14], [27, 22], [16, 27]], (x, y) => (speck(x, y) ? fudge[4] : fudge[3]));
    s.line(5, 14, 16, 19, fudge[0]);
    s.ball(16, 13, 3.5, 2.2, R('#c8925a'), { bias: 0.25 }); // walnut half
    s.line(14, 13, 18, 13, '#8a5a2a');
  },
  lime(s) {
    s.shadow(17, 28, 12, 2);
    // A whole lime and a half cut open beside it, its pale face toward you with the segments showing.
    const lime = R('#5aa62e');
    s.ball(12, 18, 8, 7.5, lime, { tone: (nx, ny, x, y) => ((x + y * 2) % 7 === 0 && ny < 0.4 ? 1 : 0) });
    s.ball(4, 18, 1.6, 1.6, lime);
    s.ball(22, 19, 6.5, 7, lime); // the cut half's rind
    s.fill(16, 12, 28, 26, (x, y) => {
      const nx = (x - 22.5) / 5, ny = (y - 19) / 5.6;
      const r = nx * nx + ny * ny;
      if (r > 1) return null;
      if (r > 0.78) return '#e8f4c8'; // pith
      const a = Math.atan2(ny, nx);
      return Math.abs(Math.sin(a * 4)) < 0.16 || r < 0.04 ? '#e8f4c8' : (nx < -0.2 ? '#c2e070' : '#a8d050');
    });
  },
  onigiri(s) {
    s.shadow(17, 29, 12, 2);
    // A rice ball from the front and a little above: a soft triangle with a shaded right side for its thickness,
    // a band of nori wrapped round the bottom.
    const rice = R('#f4f1ea');
    s.poly([[16, 5], [27, 25], [24, 28], [16, 22]], (x, y) => ((x * 3 + y * 5) % 9 === 0 ? rice[4] : rice[3])); // side
    s.poly([[16, 5], [4, 25], [7, 28], [24, 28], [27, 25]], (x, y) => ((x * 3 + y * 5) % 9 === 0 ? rice[3] : x < 10 ? rice[1] : rice[2]));
    s.ball(16, 9, 3, 3, rice, { bias: 0.3 }); // the rounded tip
    s.fill(12, 22, 20, 28, (x) => (x < 13 ? '#3a5a34' : x > 18 ? '#1a2c1a' : '#243a22'));
    s.rect(12, 22, 9, 1, '#4a6a44');
    for (const [x, y] of [[9, 20], [13, 14], [18, 12], [22, 21]]) s.px(x, y, '#ffffff');
  },
  pomegranate(s) {
    s.shadow(17, 29, 11, 2);
    // A round, leathery red fruit with its little crown on top, split open at the front: ruby seeds packed in pale pith.
    const rind = R('#b8283a');
    s.ball(16, 18, 11, 10, rind);
    // The crown: a short collar with four points, lit on the left.
    s.rect(13, 7, 7, 2, rind[3]);
    s.rect(13, 7, 2, 2, rind[2]);
    for (const [x, h] of [[13, 3], [15, 4], [17, 4], [19, 3]]) {
      s.rect(x, 7 - h, 1, h, x < 16 ? rind[2] : rind[4]);
      s.px(x, 7 - h, rind[1]);
    }
    s.fill(9, 14, 23, 25, (x, y) => {
      const nx = (x - 16.5) / 6.5, ny = (y - 19.5) / 5;
      const d = nx * nx + ny * ny;
      if (d > 1) return null;
      if (d > 0.7) return '#f3e2c8'; // the pith around the split
      // Packed seeds: a ruby kernel every other pixel, offset row by row, dark gaps between, a few catching light.
      if ((x + (y % 2)) % 2 === 1) return '#7a1020';
      return (x * 7 + y * 5) % 9 === 0 || ny < -0.4 ? '#ff8a96' : '#d61e38';
    });
  },
  cremeBrulee(s) {
    s.shadow(17, 28, 12, 2);
    // A fluted white ramekin from the side and a little above, its burnt-sugar top cracked open on one side.
    const caramel = R('#c97a2a');
    cylinder(s, 16, 15, 24, 12, 11, 4.2,
      (t, v) => {
        const col = cyl(C.white, t);
        // Fluting: a darker groove every third column, curving with the rim.
        return Math.round((t + 1) * 9) % 3 === 0 && v > 0.8 ? shade(col, -0.12) : col;
      },
      (x, y) => {
        const dx = x - 16;
        const dy = y - 15;
        if (dx * dx / 144 + dy * dy / 17.6 > 0.82) return C.white[1]; // the ramekin's rim
        if (Math.abs(dy - dx * 0.45 + 1) < 0.6 && dx > -4 && dx < 7) return '#5e2e10'; // the crack
        if (dx > 2 && dx < 6 && dy > 0 && dy < 3 && dy > dx * 0.45 - 1) return '#f6e6b8'; // custard showing through
        if (dx < -4 && dy < -1) return caramel[0]; // torch glint
        return (x * 7 + y * 13) % 11 === 0 ? caramel[3] : dy < 0 ? caramel[1] : caramel[2];
      });
  },
  miso(s) {
    s.shadow(17, 29, 12, 2);
    // A lacquered soup bowl from the side and a little above: cloudy miso broth with cubes of tofu and green onion.
    const lacquer = R('#7a2a22');
    const broth = R('#d4a056');
    bowl(s, 16, 15, 12, 3.8, 12, lacquer, (x, y) => (Math.sin(x * 0.9 + y * 2.3) > 0.7 ? broth[0] : y < 14 ? broth[2] : broth[1]));
    for (const [x, y] of [[12, 15], [19, 14], [16, 16]]) {
      s.rect(x, y, 2, 2, '#fbf8ee');
      s.px(x + 1, y + 1, '#d8d2c0');
    }
    for (const [x, y] of [[9, 15], [22, 16], [14, 13], [21, 13]]) s.px(x, y, C.leaf[1]);
  },
  kimchi(s) {
    s.shadow(17, 29, 13, 2);
    // A white bowl from the side and a little above, heaped with red kimchi leaves rising out of its opening.
    bowl(s, 16, 18, 12.5, 3.8, 9, C.bowl, () => C.kimchi[3]);
    s.ball(12, 16, 6, 4.5, C.kimchi, { tone: (nx, ny, x, y) => ((x + y) % 6 === 0 ? -2 : 0) });
    s.ball(20, 16, 6, 4.5, C.kimchi, { tone: (nx, ny, x, y) => ((x * 2 + y) % 7 === 0 ? -2 : 0) });
    s.ball(16, 12, 5, 4, C.kimchi, { tone: (nx, ny, x, y) => ((x + y * 2) % 6 === 0 ? -2 : 0) });
    for (const [x, y] of [[10, 14], [18, 11], [22, 15]]) s.px(x, y, '#f2e6c8'); // pale cabbage ribs
  },
  ramen(s) {
    s.shadow(17, 29, 13, 2);
    // A red ramen bowl from the side and a little above: golden broth in the opening with noodles, a half egg, a
    // slice of chashu and scallions, a sheet of nori standing at the back, chopsticks resting across the rim.
    const broth = R('#e8a84a');
    s.rect(7, 9, 4, 8, '#2e4a2c'); // nori, behind
    s.rect(7, 9, 1, 8, '#4a6a44');
    bowl(s, 16, 16, 13, 4.2, 11, C.ramenBowl, (x, y) => (Math.sin(x * 1.3 + y * 2.1) > 0.75 ? broth[0] : y < 15 ? broth[2] : broth[1]));
    s.ball(12, 16, 3, 1.6, R('#e8a0a0'), { bias: 0.3 }); // chashu
    s.px(12, 16, '#c86a6a');
    s.ball(20, 15, 3, 1.8, C.white, { bias: 0.3 }); // half egg
    s.ball(20, 15, 1.4, 0.9, R('#f29a1e'));
    for (const [x, y] of [[15, 17], [17, 15], [24, 16], [9, 17]]) s.px(x, y, C.leaf[1]);
    s.tube([[13, 13], [29, 3]], 0.8, C.wood); // chopsticks resting on the far rim
    s.tube([[15, 14], [30, 5]], 0.8, C.wood);
  },
  dumplings(s) {
    s.shadow(17, 29, 13, 2);
    // A round bamboo steamer from the side and a little above: its rim is an ellipse (the dark inside showing behind
    // the dumplings), three pleated half-moon dumplings sit in it, then the front wall (a short wide cylinder) curves
    // down over their bottoms.
    const bamboo = R('#d9b26a');
    const rim = (x, y, rx, ry) => ((x - 16) / rx) ** 2 + ((y - 19) / ry) ** 2;
    s.fill(2, 14, 30, 24, (x, y) => (rim(x, y, 13.5, 4.5) <= 1 ? (rim(x, y, 12, 3.4) <= 1 ? '#5e3f1f' : bamboo[1]) : null));
    const dough = R('#f1dfbf'), pleat = '#b98c58';
    for (const [x, y] of [[16, 15], [10, 18], [22, 18]]) {
      s.ball(x, y, 6.5, 5.5, R(pleat), { clip: (_, py) => py <= y + 3 });
      s.ball(x, y, 5.5, 4.5, dough, { bias: 0.25, clip: (_, py) => py <= y + 2 });
      for (let i = -4; i <= 4; i += 2) {
        const top = y - 4 + Math.round((i * i) / 8);
        s.px(x + i, top, pleat); // the pinched crest
        if (Math.abs(i) < 4) s.px(x + i, top + 1, dough[3]); // a fold running down from it
      }
    }
    cylinder(s, 16, 19, 26, 13.5, 12.5, 4.5, (t, v) => (v < 1 ? bamboo[0] : v === 3 ? bamboo[4] : cyl(bamboo, t)));
  },
  jerky(s) {
    s.shadow(17, 29, 13, 2);
    // Three flat strips of dried beef piled on each other, seen a little from above: each a ragged ribbon with its
    // lit top face, a dark cut edge underneath showing its thickness, and grain running along it.
    const beef = R('#8a3a26');
    const strip = (x0, y0, x1, y1, w) => {
      const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len;
      s.fill(0, 0, 31, 31, (x, y) => {
        const along = (x - x0) * ux + (y - y0) * uy, across = -(x - x0) * uy + (y - y0) * ux;
        if (along < 0 || along > len) return null;
        const ragged = w + ((Math.round(along) * 7) % 3 === 0 ? -0.6 : 0);
        if (across < -ragged || across > ragged + 1.2) return null;
        if (across > ragged) return beef[4]; // the cut edge underneath
        if (across < -ragged + 0.9) return beef[1]; // the lit far edge
        return Math.round(along + across * 2) % 5 === 0 ? beef[3] : beef[2]; // grain
      });
    };
    strip(4, 22, 27, 16, 2.6);
    strip(6, 16, 26, 9, 2.4);
    strip(8, 26, 28, 23, 2.4);
    for (const [x, y] of [[10, 13], [17, 11], [22, 10], [12, 19], [20, 18], [14, 24], [23, 24]]) s.px(x, y, '#3a1a12');
  },
  gravy(s) {
    s.shadow(17, 29, 13, 2);
    // A gravy boat from the side and a little above: the white boat (a stretched bowl with a spout on the right and
    // a handle on the left), brown gravy showing in its open top, a drip down the spout.
    const china = R('#f1ece4'), gravy = R('#8a5428');
    s.tube([[5, 15], [3, 19], [6, 22]], 1.1, china); // handle
    s.ball(16, 18, 11, 8, china, { clip: (x, y) => y >= 17 });
    s.poly([[22, 14], [29, 11], [27, 17], [22, 19]], (x) => (x > 26 ? china[3] : china[2])); // spout
    s.ball(15, 17, 9, 2.6, gravy, { bias: 0.3 });
    s.px(28, 12, gravy[1]); s.px(28, 13, gravy[2]);
    s.rect(9, 27, 14, 1, china[3]); // foot
    s.rect(11, 28, 10, 1, china[4]);
  },
  cherry(s) {
    s.shadow(17, 29, 11, 2);
    // A pair of glossy cherries on joined stems, seen from the side and a little above.
    const cherry = R('#c8233a');
    s.tube([[11, 18], [15, 8], [18, 4]], 0.7, C.stem);
    s.tube([[22, 18], [19, 8], [18, 4]], 0.7, C.stem);
    s.ball(19, 4, 3, 1.6, C.leaf, { bias: 0.2 });
    s.ball(11, 21, 6, 6, cherry, { bias: 0.25 });
    s.ball(22, 21, 6, 6, cherry, { bias: 0.25 });
    for (const [x, y] of [[9, 18], [20, 18]]) { s.px(x, y, '#ffd0d6'); s.px(x + 1, y, '#ff9aa8'); }
  },
  croutons(s) {
    s.shadow(17, 29, 13, 2);
    // A little heap of golden toasted bread cubes, each turned on the diagonal like the sugar cube: a lit top, a
    // mid left face and a shaded right face, flecked with herbs.
    const cube = (cx, cy, r) => {
      s.poly([[cx, cy - r], [cx + r, cy - r / 2], [cx, cy], [cx - r, cy - r / 2]], '#f2c37a');
      s.poly([[cx - r, cy - r / 2], [cx, cy], [cx, cy + r], [cx - r, cy + r / 2]], '#d99a45');
      s.poly([[cx, cy], [cx + r, cy - r / 2], [cx + r, cy + r / 2], [cx, cy + r]], '#a8682c');
    };
    cube(9, 21, 5); cube(22, 21, 5); cube(15, 24, 5); cube(12, 14, 5); cube(20, 13, 5);
    for (const [x, y] of [[9, 17], [22, 17], [15, 20], [12, 10], [20, 9]]) s.px(x, y, '#5a8a3a');
  },
  baguette(s) {
    s.shadow(17, 29, 14, 2);
    // A long golden baguette lying on the table, seen from the side and a little above: its rounded top lit, the
    // diagonal scores showing pale crumb, the underside in shade.
    const crust = R('#d0893a');
    s.tube([[3, 23], [29, 13]], (t) => 4.6 - 1.2 * Math.abs(t - 0.5), crust);
    for (const x of [8, 13, 18, 23]) {
      const y = Math.round(23 - ((x - 3) * 10) / 26);
      s.line(x - 2, y - 1, x + 1, y - 3, '#f6e2b0');
      s.line(x - 1, y - 1, x + 2, y - 3, '#e8c88a');
    }
  },
  mandarin(s) {
    s.shadow(17, 29, 11, 2);
    // A round mandarin from the side and a little above, its dimpled peel lit on the left, a short stem and a leaf.
    const peel = R('#f2892a');
    s.ball(16, 19, 10, 9, peel, { bias: 0.2, tone: (nx, ny, x, y) => ((x * 3 + y * 5) % 9 === 0 ? 1 : 0) });
    s.ball(16, 11, 2.5, 1, peel.map((c) => shade(c, -0.15))); // the dimple where the stem goes in
    s.tube([[16, 11], [16, 8]], 0.7, C.stem);
    s.ball(20, 8, 4, 1.8, C.leaf, { bias: 0.2 });
  },
  // Flavor overhaul foods
  tofu(s) {
    s.shadow(17, 29, 12, 2);
    // A soft white block seen from above-front, with a sprinkle of scallion.
    const tofu = R('#f4edd9');
    s.poly([[16, 9], [27, 14], [16, 19], [5, 14]], (x, y) => ((x * 3 + y * 7) % 11 === 0 ? tofu[1] : tofu[0]));
    s.poly([[5, 14], [16, 19], [16, 28], [5, 23]], tofu[2]);
    s.poly([[16, 19], [27, 14], [27, 23], [16, 28]], tofu[3]);
    for (const [x, y] of [[12, 13], [17, 12], [20, 15], [14, 16]]) { s.px(x, y, C.leaf[1]); s.px(x + 1, y, C.leaf[2]); }
  },
  coinChocolate(s) {
    s.shadow(17, 27, 12, 2);
    // Two gold-foil chocolate coins lying flat, seen from slightly above: squashed ellipses with a visible edge, the
    // top one stamped with a star and peeled at one side to show the chocolate.
    const foil = R('#e5b93c');
    const coin = (cx, cy) => {
      s.fill(cx - 12, cy - 6, cx + 12, cy + 9, (x, y) => (((x - cx) / 11.4) ** 2 + ((y - cy - 3) / 5.2) ** 2 <= 1 ? (x < cx - 6 ? foil[3] : foil[4]) : null));
      s.fill(cx - 12, cy - 6, cx + 12, cy + 6, (x, y) => {
        const d = Math.hypot((x - cx) / 11.4, (y - cy) / 5.2);
        if (d > 1) return null;
        if (d > 0.74 && d < 0.88) return foil[3];
        return x + y * 2 < cx + cy * 2 - 2 ? foil[1] : foil[2];
      });
    };
    coin(14, 21);
    coin(18, 15);
    s.poly([[18, 11], [19, 14], [23, 14], [20, 16], [21, 19], [18, 17], [15, 19], [16, 16], [13, 14], [17, 14]], foil[3]);
    s.poly([[24, 15], [29, 13], [29, 17], [26, 19]], C.bean[2]);
    s.line(24, 15, 29, 13, foil[0]);
  },
  breadstick(s) {
    s.shadow(17, 28, 12, 2);
    // Three crisp grissini leaning together, flecked with salt.
    const stick = R('#d9a556');
    for (const [x0, x1] of [[6, 13], [12, 22], [18, 29]]) s.tube([[x0, 27], [x1, 4]], 1.6, stick);
    for (const [x, y] of [[8, 20], [11, 10], [14, 22], [18, 12], [21, 20], [25, 10], [27, 15]]) s.px(x, y, '#fbf6ee');
  },
  mustard(s) {
    s.shadow(17, 29, 8, 2);
    // A yellow squeeze bottle with a red flip cap and a band of label, seen from slightly above.
    const yellow = R('#f2c21e'), red = R('#d23a2c');
    cylinder(s, 16, 12, 27, 6, 6, 2, (t, v) => (v >= 7 && v <= 10 ? cyl(red, t) : cyl(yellow, t)), (x) => (x < 15 ? yellow[0] : yellow[1]));
    cylinder(s, 16, 8, 11, 3, 3.5, 1.2, (t) => cyl(red, t), () => red[1]);
    s.poly([[15, 8], [17, 8], [16.5, 2], [15.5, 2]], (x) => (x <= 15 ? red[1] : red[2]));
    s.rect(11, 15, 1, 5, '#fff6c0');
  },
  cabbage(s) {
    s.shadow(17, 29, 12, 2);
    // A tight pale head, cupped by big darker outer leaves that open out at the bottom, each with a pale midrib
    // fanning out into veins, and a wavy lighter edge where it curls away from the head.
    const outer = R('#4f9a38'), mid = R('#7cbf4a'), head = R('#b2d878');
    // Outer leaves: left, right and front, spread wider than the head.
    s.ball(9, 21, 7, 6, outer);
    s.ball(23, 21, 7, 6, outer);
    s.ball(16, 24, 9, 5, outer);
    // The head, and a second leaf wrapping its lower half.
    s.ball(16, 14, 8, 7.5, head);
    s.ball(16, 19, 9, 5, mid, { clip: (x, y) => y >= 17 });
    // The wrapping leaf's curled edge, wavy across the head.
    for (let x = 8; x <= 24; x++) {
      const y = 17 - Math.round(Math.sin(x * 1.1) * 0.8);
      s.px(x, y, mid[0]);
      s.px(x, y + 1, mid[1]);
    }
    // Seams where the head's leaves overlap.
    s.line(15, 8, 13, 15, head[3]);
    s.line(19, 8, 20, 15, head[3]);
    // Midribs and veins on the outer leaves.
    s.line(16, 27, 16, 21, '#d8efb0');
    s.line(15, 27, 5, 20, '#a9d77c');
    s.line(17, 27, 27, 20, '#a9d77c');
    for (const [x, y] of [[8, 19], [11, 25], [24, 19], [21, 25], [13, 22], [19, 22]]) s.px(x, y, '#a9d77c');
  },
  jalapeno(s) {
    s.shadow(17, 29, 9, 2);
    // A plump dark-green pepper curving down to a blunt tip, a shine along its back; on top, a darker cap hugging its
    // shoulders and a pale, woody stem curving up and away (a different colour from the body, so it reads as a stem).
    const green = R('#3d8f2c');
    s.tube([[13, 11], [14, 17], [16, 23], [21, 27]], (t) => 4.4 - t * 2.4, green);
    s.tube([[12, 9], [11, 6], [9, 4], [8, 2]], (t) => 1 - 0.3 * t, R('#93a04e'));
    s.ball(13, 10, 4.5, 2.4, R('#4f6f24'));
    s.ball(9, 11, 1.6, 1.2, R('#4f6f24')); // the cap's lobes drooping over the shoulders
    s.ball(17, 11, 1.6, 1.2, R('#4f6f24'));
    s.line(12, 14, 13, 20, green[0]);
  },
  cranberry(s) {
    s.shadow(17, 28, 11, 2);
    // A little heap of deep red berries, each with a dark star where the blossom was and a bright glint.
    const red = R('#b8143c');
    for (const [x, y, r] of [[10, 21, 5], [21, 22, 5], [15, 15, 5], [23, 14, 4], [16, 24, 4]]) {
      s.ball(x, y, r, r - 0.4, red);
      s.px(x + 1, y + 1, red[4]);
      s.px(x - 2, y - 2, '#ffd6de');
    }
  },
  frozenPeas(s) {
    s.shadow(17, 29, 11, 2);
    // A frosty freezer bag of peas: a crimped top, a window of green peas, frost on the plastic.
    const bag = R('#8fc8ea');
    s.poly([[7, 10], [25, 10], [27, 28], [5, 28]], (x) => (x < 9 ? bag[1] : x > 24 ? bag[3] : bag[2]));
    s.rect(7, 7, 19, 3, bag[3]);
    for (let x = 7; x <= 25; x += 2) s.px(x, 7, bag[4]);
    s.ball(16, 19, 8, 6, R('#e6f4fb'));
    // The peas through the window: round, lit from the top left.
    for (const [x, y] of [[11, 18], [16, 16], [21, 18], [13, 22], [19, 22], [16, 20]]) {
      s.ball(x, y, 2.3, 2.3, R('#5fb03a'));
      s.px(x - 1, y - 1, '#c8ec9c');
    }
    for (const [x, y] of [[9, 13], [22, 13], [24, 25], [8, 24], [12, 12]]) s.px(x, y, '#ffffff');
  },
  rice(s) {
    s.shadow(17, 29, 12, 2);
    // A heaped bowl of white rice in a dark blue bowl, a few grains catching the light.
    const grain = R('#f7f4ec');
    // The bowl first, then the heap piled over its back half (so the back rim is hidden behind the rice and only the
    // front rim shows).
    bowl(s, 16, 19, 12, 3, 8, R('#3f6f9a'), (x, y) => ((x * 5 + y) % 7 === 0 ? grain[2] : grain[1]));
    s.ball(16, 17, 10, 6, grain, { clip: (x, y) => y <= 19, tone: (nx, ny, x, y) => ((x * 3 + y * 7) % 11 === 0 ? 2 : 0) });
    s.rect(6, 23, 21, 1, R('#3f6f9a')[1]);
  },
  popsicle(s) {
    s.shadow(16, 30, 6, 1);
    // An ice pop on a stick: a strawberry top over a cream base, a bite out of one corner, frost glints.
    const pink = R('#ef6a9a'), cream = R('#f7ecd8');
    s.rect(15, 22, 3, 8, C.wood[2]);
    s.rect(15, 22, 1, 8, C.wood[1]);
    s.fill(10, 4, 22, 23, (x, y) => {
      if (y < 7 && ((x - 16) / 6) ** 2 + ((y - 7) / 3) ** 2 > 1) return null;
      if (x >= 19 && y <= 8 && (x - 22) ** 2 + (y - 5) ** 2 < 9) return null; // the bite
      const r = y > 16 ? cream : pink;
      return x < 12 ? r[1] : x > 20 ? r[3] : r[2];
    });
    s.line(11, 8, 11, 15, pink[0]);
    for (const [x, y] of [[13, 10], [18, 13], [14, 19]]) s.px(x, y, '#ffffff');
  },
  sorbet(s) {
    s.shadow(17, 30, 8, 1.5);
    // Three scoops (lemon, raspberry, mint) in a glass coupe on a short stem.
    const glass = R('#cfe6ee');
    s.rect(15, 23, 3, 5, glass[2]);
    s.ball(16, 28, 6, 1.5, glass);
    bowl(s, 16, 19, 11, 2.5, 5, glass, () => R('#e84a6a')[3]);
    // The scoops sit in the coupe: they cover its opening but not its front.
    const scoop = (x, y, rx, ry, c) => s.ball(x, y, rx, ry, R(c), { clip: (px, py) => py <= 19 + (Math.abs(px - 16) > 8 ? -1 : 0) });
    scoop(10, 16, 5, 4.5, '#f3dc5a');
    scoop(22, 16, 5, 4.5, '#7fd09a');
    scoop(16, 12, 5.5, 5, '#e84a6a');
    for (const [x, y] of [[14, 9], [8, 14], [20, 14]]) s.px(x, y, '#ffffff');
  },
  habaneroSalsa(s) {
    s.shadow(17, 29, 13, 2);
    // A clay bowl of chunky red salsa, with a bright orange habanero leaning on it.
    const salsa = R('#d4372a');
    bowl(s, 14, 17, 11, 3, 8, R('#c27a45'), (x, y) => ((x * 7 + y * 3) % 9 === 0 ? '#f2e3c4' : (x + y * 5) % 8 === 0 ? '#5aa63a' : salsa[(x + y) % 3 === 0 ? 1 : 2]));
    s.ball(25, 21, 4, 4.5, R('#f2801c'));
    s.tube([[25, 17], [26, 14], [28, 13]], 1, C.stem);
    s.px(23, 19, '#ffd8a0');
  },
  macarons(s) {
    s.shadow(17, 29, 10, 2);
    // Three macarons, two side by side and one on top: each a pair of domed shells with a cream filling and a
    // ruffled "foot" where shell meets filling.
    const macaron = (cx, cy, c) => {
      const r = R(c);
      s.ball(cx, cy + 2.5, 6, 2.6, r);
      s.fill(cx - 6, cy - 0.5, cx + 6, cy + 0.5, (x) => (Math.abs(x - cx) <= 5.5 ? '#fbf3e4' : null));
      s.ball(cx, cy - 2.5, 6, 2.8, r, { bias: 0.1 });
      for (let x = cx - 5; x <= cx + 5; x += 2) s.px(x, cy - 1, r[3]);
    };
    macaron(10, 22, '#a6d28a');
    macaron(22, 22, '#bba3e0');
    macaron(16, 13, '#f08aa8');
  },
  balsamic(s) {
    s.shadow(17, 30, 6, 1.5);
    // A tall dark bottle of aged vinegar with a cream label, a cork, and a shine down one side.
    const glass = R('#4a2533');
    s.fill(10, 12, 22, 29, (x) => (x < 12 ? glass[1] : x > 20 ? glass[4] : glass[2]));
    s.ball(16, 12, 6, 3, glass);
    s.rect(14, 4, 5, 7, glass[2]);
    s.rect(14, 2, 5, 3, R('#c9965a')[2]);
    s.rect(11, 17, 11, 7, '#efe1c0');
    s.rect(11, 19, 11, 1, '#a3452a');
    s.line(12, 13, 12, 27, glass[0]);
  },
  saltFish(s) {
    s.shadow(17, 29, 14, 2);
    // A whole fish baked in a dome of white salt on a platter, the crust cracked open to show its head and tail.
    const salt = R('#efe9dc');
    s.ball(16, 26, 14, 3, R('#d9dee3'));
    s.ball(16, 19, 11, 7, salt, { tone: (nx, ny, x, y) => ((x * 7 + y * 3) % 10 === 0 ? 2 : 0) });
    s.ball(6, 20, 4, 3, C.fish);
    s.px(5, 19, '#2a2a30');
    s.poly([[25, 20], [30, 16], [30, 24]], C.fish[2]);
    s.line(13, 14, 17, 18, salt[3]);
    s.line(17, 18, 15, 22, salt[3]);
  },
  fondue(s) {
    s.shadow(17, 29, 12, 2);
    // A red enamel pot of molten cheese, and a fork dipping a bread cube in it.
    bowl(s, 16, 16, 11, 3, 11, R('#c4442e'), (x, y) => ((x * 3 + y) % 8 === 0 ? C.cheese[1] : C.cheese[2]));
    s.rect(4, 19, 3, 2, R('#7a2a1e')[2]);
    s.rect(26, 19, 3, 2, R('#7a2a1e')[2]);
    s.tube([[26, 2], [19, 13]], 0.7, R('#c9d1d6'));
    s.ball(18, 13, 2.5, 2, R('#d9a55a'));
    s.tube([[18, 14], [18, 17]], 0.9, C.cheese);
  },
  shavedIce(s) {
    s.shadow(17, 29, 9, 2);
    // A paper cup heaped high with snowy shaved ice, streaked with strawberry and blue syrup, a spoon stuck in.
    const cup = R('#e8f1f6');
    cylinder(s, 16, 18, 28, 8, 6, 2.2, (t, v) => (v >= 3 && v <= 4 ? cyl(R('#5aa0d8'), t) : cyl(cup, t)), () => cup[1]);
    s.ball(16, 13, 9, 7.5, R('#f6fbff'), { clip: (x, y) => y <= 19, tone: (nx, ny, x, y) => ((x * 7 + y * 5) % 9 === 0 ? 1 : 0) });
    s.tube([[10, 9], [13, 14], [12, 18]], 1.2, R('#ef5a7a'));
    s.tube([[19, 7], [21, 12], [22, 17]], 1.2, R('#5ab4ef'));
    s.tube([[24, 2], [20, 10]], 0.8, R('#c9d1d6'));
    s.ball(24, 2, 1.6, 1.2, R('#c9d1d6'));
  },
  bakedAlaska(s) {
    s.shadow(17, 29, 13, 2);
    // A dome of swirled meringue, its peaks toasted brown, on a round of sponge cake on a plate.
    s.ball(16, 27, 13, 2.5, R('#e6edf3'));
    cylinder(s, 16, 22, 25, 11, 11, 2.2, (t) => cyl(R('#e7b25a'), t), () => R('#e7b25a')[1]);
    const meringue = R('#fbf1dc');
    s.ball(16, 15, 10.5, 9, meringue, { clip: (x, y) => y <= 22 });
    // Toasted peaks: browned swirls across the dome.
    for (const [x, y] of [[11, 10], [15, 8], [20, 9], [9, 15], [14, 13], [19, 14], [23, 15], [12, 19], [17, 18], [21, 20]]) {
      s.px(x, y, '#c98a3e');
      s.px(x + 1, y, '#9a6024');
      s.px(x, y - 1, '#e6b06a');
    }
    s.ball(16, 6, 1.6, 1.6, R('#e6b06a'));
  },
  croquembouche(s) {
    s.shadow(17, 30, 12, 2);
    // A cone of golden cream puffs stacked on a plate, laced with threads of caramel.
    const puff = R('#e1a24a');
    s.ball(16, 28, 12, 2.5, R('#e6edf3'));
    for (const [row, y] of [[4, 25], [3, 20], [3, 15], [2, 10], [1, 6]]) {
      for (let i = 0; i < row; i++) s.ball(16 + (i - (row - 1) / 2) * 5.6, y, 3, 2.8, puff);
    }
    for (const [a, b] of [[[8, 24], [23, 9]], [[24, 24], [10, 11]], [[12, 27], [20, 6]]]) s.line(a[0], a[1], b[0], b[1], '#f6d27a');
  },
  iceCream(s) {
    s.shadow(16, 30, 5, 1);
    // A waffle cone with a vanilla and a strawberry scoop.
    const cone = R('#d79a4e');
    s.poly([[9, 17], [23, 17], [16, 30]], (x, y) => ((x + y) % 4 === 0 || (x - y + 40) % 4 === 0 ? cone[3] : cone[2]));
    s.ball(16, 15, 7, 5, R('#f6efe0'));
    s.ball(16, 9, 6, 5, R('#f48aa8'));
    s.ball(16, 4, 1, 1, R('#d6352a'));
    s.rect(9, 17, 15, 1, R('#f6efe0')[2]);
  },
  sourdough(s) {
    s.shadow(17, 29, 13, 2);
    // A round crusty boule with a scored ear and a dusting of flour.
    const crust = R('#b77a3a');
    s.ball(16, 20, 13, 9, crust);
    s.tube([[8, 17], [14, 14], [20, 14], [25, 18]], 1.1, R('#f0d8a8'));
    for (const [x, y] of [[9, 22], [13, 25], [19, 23], [23, 21], [11, 19], [17, 19], [22, 25]]) s.px(x, y, '#f7efe0');
  },
  fortuneCookie(s) {
    s.shadow(17, 28, 12, 2);
    // Two thin wings folded over a deep crease, with the fortune slip poking out of the fold.
    const cookie = R('#e6b25a');
    s.ball(10, 20, 7, 6, cookie);
    s.ball(22, 20, 7, 6, cookie);
    s.tube([[16, 13], [16, 26]], (t) => 1 + t * 2, cookie, () => R('#b9822e'));
    s.line(16, 14, 16, 25, cookie[4]);
    s.poly([[15, 18], [27, 10], [29, 13], [17, 21]], '#fbf8f0');
    s.line(19, 17, 26, 12, '#d6352a');
  },
  kebab(s) {
    s.shadow(17, 29, 12, 2);
    // A skewer of meat, pepper and onion, angled across the plate.
    s.tube([[4, 28], [28, 4]], 0.8, C.wood);
    const chunks = [[8, 24, C.meat], [12, 20, C.leaf], [16, 16, C.steak], [20, 12, R('#efe6dc')], [24, 8, C.meat]];
    for (const [x, y, r] of chunks) s.ball(x, y, 3, 3, r);
  },
  nachos(s) {
    s.shadow(17, 29, 14, 2);
    // A pile of tortilla chips on a shallow plate (from the side and a little above) under a molten cheese drip.
    bowl(s, 16, 24, 14, 3.6, 3, C.bowl, () => C.bowl[1]);
    const chip = R('#f0b84a');
    for (const pts of [[[4, 24], [14, 11], [18, 25]], [[12, 25], [22, 10], [28, 24]], [[8, 19], [20, 16], [12, 26]], [[17, 22], [26, 15], [27, 25]]]) {
      s.poly(pts, (x, y) => ((x * 5 + y * 3) % 13 === 0 ? chip[3] : y < 17 ? chip[1] : chip[2]));
    }
    s.tube([[11, 16], [21, 16]], 1.3, C.cheese);
    s.tube([[12, 16], [11, 21]], 1, C.cheese);
    s.tube([[20, 16], [21, 19]], 1, C.cheese);
    s.px(15, 15, C.stem[2]); s.px(18, 15, C.red[2]);
  },
  soySauce(s) {
    s.shadow(17, 29, 8, 2);
    // A teardrop glass dispenser of dark soy with a red cap whose top you can see.
    const glass = R('#4a2a1c'), cap = R('#d23a2c');
    s.ball(16, 22, 7, 7, glass);
    s.tube([[16, 16], [16, 9]], 3, glass);
    cylinder(s, 16, 6, 9, 3.5, 3.5, 1.4, (t) => cyl(cap, t), () => cap[1]);
    s.poly([[19, 7], [24, 4], [24, 6], [19, 9]], cap[2]);
    s.rect(12, 19, 1, 5, '#a8735a');
  },
  blueCheese(s) {
    s.shadow(18, 27, 12, 2);
    // A pale wedge veined with blue mould.
    const cheese = R('#efe6cf');
    const vein = (x, y) => Math.sin(x * 0.9 + y * 1.7) + Math.sin(x * 0.4 - y * 1.1) > 1.3;
    s.poly([[3, 22], [23, 8], [29, 13]], (x, y) => (vein(x, y) ? '#5c7fa8' : cheese[1]));
    s.poly([[3, 22], [29, 13], [29, 24], [3, 24]], (x, y) => (vein(x, y) ? '#4a6890' : x > 26 ? cheese[3] : cheese[2]));
    s.line(3, 22, 29, 13, cheese[0]);
  },
  sweetSour(s) {
    s.shadow(17, 29, 13, 2);
    // Glossy red-orange pork and pineapple heaped in a white bowl, seen from the side and a little above.
    bowl(s, 16, 19, 12.5, 3.8, 8, C.bowl, () => '#b8402a');
    const glaze = R('#e0532a');
    for (const [x, y] of [[11, 16], [16, 14], [21, 16], [13, 18], [19, 18]]) s.ball(x, y, 3.5, 3, glaze, { bias: 0.2 });
    for (const [x, y] of [[16, 18], [8, 18], [24, 18]]) { s.rect(x - 1, y - 1, 3, 2, C.pine[1]); s.px(x - 1, y - 1, C.pine[0]); }
    for (const [x, y] of [[12, 13], [17, 11]]) s.px(x, y, '#ffd0a0'); // the shine of the glaze
  },
  spaghetti(s) {
    s.shadow(17, 29, 14, 2);
    // A shallow white plate from the side and a little above, a mound of spaghetti on it, red sauce and a meatball.
    bowl(s, 16, 22, 14, 4.5, 3, C.bowl, (x, y) => (y < 21 ? C.bowl[1] : C.bowl[0]));
    s.ball(16, 18, 9.5, 5.5, C.noodle, { tone: (nx, ny, x, y) => (Math.sin(x * 1.3 + y * 0.9) > 0.6 ? 1 : 0) });
    s.ball(16, 15, 6, 2.6, R('#cf3524'), { bias: 0.2 });
    s.ball(19, 13, 3, 2.6, C.steak);
    s.px(12, 14, C.leaf[1]); s.px(13, 14, C.leaf[2]);
  },
  bento(s) {
    s.shadow(17, 29, 14, 2);
    // A lacquered box seen from slightly above: its dark front side with a red band, then the open top split into
    // rice with a plum, salmon, tamagoyaki and broccoli, foreshortened so the compartments are wider than tall.
    s.poly([[3, 20], [29, 20], [29, 27], [3, 27]], (x) => (x < 6 ? '#3a2224' : '#24161a')); // the box's front, in shade
    s.rect(3, 23, 27, 1, '#b8434a');
    s.poly([[6, 8], [26, 8], [29, 20], [3, 20]], (x, y) => (y <= 9 ? '#5a3430' : '#7a4440')); // the lit top rim, narrower at the back
    s.rect(3, 20, 27, 1, '#a65a50'); // the near edge catches the light
    s.poly([[8, 10.5], [16, 10.5], [16, 18], [6, 18]], (x, y) => (y <= 11 ? '#fffdf6' : '#f2eee2'));
    s.ball(11, 14, 1.6, 1.2, R('#d6455a'));
    s.poly([[18, 11], [25, 11], [26, 14], [18, 14]], '#f08a5a');
    s.rect(18, 11, 7, 1, '#ffb08a');
    s.poly([[18, 15], [22, 15], [22, 18], [18, 18]], '#f2c94c');
    s.rect(18, 15, 4, 1, '#ffe28a');
    s.ball(25, 16.5, 2, 1.6, C.leaf);
  },
  smoothie(s) {
    s.shadow(16, 30, 8, 2);
    // A tall cup of berry smoothie from the side and a little above: the rim and the pink surface inside it, a
    // striped straw and a lemon slice on the rim.
    const berry = R('#f27aa8');
    cylinder(s, 16, 10, 28, 7.5, 5.5, 3, (t) => cyl(berry, t), (x, y) => (((x - 16) / 6.2) ** 2 + ((y - 10.5) / 2.1) ** 2 <= 1 ? (y < 10 ? '#f48cb8' : '#f9a8c8') : '#fff0f6'));
    s.tube([[18, 10], [21, 2]], 1, C.stripeWhite, (off, t) => (Math.floor(t * 8) % 2 ? C.stripeRed : C.stripeWhite));
    s.ball(9, 10, 3, 3, C.lemon, { clip: (x, y) => y <= 11 });
    s.rect(11, 15, 1, 9, '#ffe0ec');
  },
  edamame(s) {
    s.shadow(17, 28, 11, 2);
    // Two green pods lying across each other, beans bulging through the skin.
    s.tube([[5, 21], [12, 17], [20, 14], [27, 11]], (t) => 3.2 - Math.abs(t - 0.5) * 2, R('#6fb03a'));
    for (const [x, y] of [[10, 18], [16, 15.5], [22, 13]]) s.ball(x, y, 3, 2.6, R('#8ad04a'));
    s.tube([[7, 26], [14, 24], [22, 24], [27, 21]], (t) => 2.8 - Math.abs(t - 0.5) * 2, R('#5a9a30'));
    for (const [x, y] of [[12, 24.5], [18, 23.5]]) s.ball(x, y, 2.6, 2.2, R('#7cc03e'));
    s.line(26, 11, 28, 9, '#3f6a22');
  },
  olive(s) {
    s.shadow(17, 29, 10, 2);
    // A fat green olive stuffed with red pimento, a darker one behind it.
    s.ball(23, 14, 5, 6, R('#5a7a24'));
    s.ball(14, 19, 8, 9, R('#8aa83a'), { bias: 0.15 });
    s.ball(10, 12, 3, 2, R('#d6352a'), { bias: 0.2 });
    s.px(9, 11, '#ff8a6a');
  },
  peppercorn(s) {
    s.shadow(17, 29, 12, 2);
    // A little wooden dish from the side and a little above, heaped with black peppercorns, a few spilled in front.
    bowl(s, 16, 20, 11, 3.4, 6, R('#a8693a'), () => '#5a3a20');
    for (const [x, y] of [[9, 19], [12, 17], [15, 15], [18, 15], [21, 16], [23, 18], [12, 20], [15, 18], [18, 18], [21, 20], [16, 21]]) s.ball(x, y, 1.6, 1.6, R('#4a3a34'));
    for (const [x, y] of [[8, 28], [24, 28], [27, 26]]) s.ball(x, y, 1.4, 1.4, R('#4a3a34'));
  },
  porkCrackling(s) {
    s.shadow(17, 28, 12, 2);
    // A heap of puffed, blistered pork crackling.
    const bumpy = { tone: (nx, ny, x, y) => ((x * 5 + y * 3) % 7 === 0 ? -1 : (x + y * 2) % 9 === 0 ? 1 : 0) };
    s.ball(10, 21, 6, 5, R('#e2a24e'), bumpy);
    s.ball(22, 21, 6, 5, R('#d8923e'), bumpy);
    s.ball(16, 14, 7, 5, R('#eab05a'), bumpy);
    s.tube([[11, 18], [19, 12]], 1, R('#f6e2b8'));
  },
  pepperoni(s) {
    s.shadow(17, 29, 13, 2);
    // A pepperoni stick with two slices cut from its end, flecked with fat; the slices lie flat, so they are ovals.
    const meat = R('#b8392c');
    const fleck = { tone: (nx, ny, x, y) => ((x * 7 + y * 3) % 6 === 0 ? -2 : 0) };
    s.tube([[4, 16], [20, 10]], 4.5, meat);
    s.ball(21, 10, 3.5, 4.5, R('#d8564a'), fleck);
    s.ball(16, 23, 6, 3.4, meat, fleck);
    s.ball(25, 25, 5, 3, meat, fleck);
    for (const [x, y] of [[6, 15], [10, 13], [14, 14], [9, 17]]) s.px(x, y, '#f1dcc4');
  },
  takoyaki(s) {
    s.shadow(17, 29, 13, 2);
    // A paper boat from the side and a little above: the inside of the tray (its far half), five takoyaki sitting in
    // it glazed with sauce, mayo and green flakes, then the tray's near wall over their bottoms.
    const tray = R('#e8d6b0');
    s.poly([[6, 15], [26, 15], [29, 20], [3, 20]], tray[3]); // inside, in shade
    const ball = (x, y) => {
      s.ball(x, y, 4.2, 3.8, R('#c88a3e'));
      s.ball(x, y - 1.5, 3.4, 1.8, R('#6a3a1e'), { bias: 0.3 });
      s.line(x - 2, y - 2, x + 2, y - 2, '#fff6e0');
      s.px(x - 1, y - 3, '#5aa63a');
    };
    for (const x of [11, 21]) ball(x, 14);
    for (const x of [7, 16, 25]) ball(x, 18);
    s.poly([[3, 20], [29, 20], [26, 27], [6, 27]], (x, y) => (y === 20 ? tray[0] : x < 8 ? tray[1] : x > 24 ? tray[3] : tray[2]));
  },
  hotCocoa(s) {
    s.shadow(16, 30, 10, 2);
    // A red mug of cocoa seen from slightly above, marshmallows bobbing on top.
    const mug = R('#d04a4a');
    s.tube([[23, 16], [28, 18], [28, 23], [23, 25]], 1.4, mug);
    s.fill(6, 13, 24, 29, (x, y) => {
      const t = (x - 15) / 9;
      if (Math.abs(t) > 1 || (y > 27 && t * t + ((y - 27) / 2.5) ** 2 > 1)) return null;
      return t < -0.6 ? mug[1] : t > 0.5 ? mug[3] : mug[2];
    });
    s.ball(15, 13, 9, 3.5, R('#f0e6e0'), { bias: 0.3 });
    s.ball(15, 13, 7.5, 2.6, R('#6e3f20'));
    for (const [x, y] of [[11, 12], [16, 13], [14, 11]]) s.rect(x, y, 2, 2, '#fffdf6');
  },
  goldenTruffle(s) {
    s.shadow(17, 28, 11, 2);
    // A knobbly black truffle flecked with gold leaf.
    const truffle = R('#4a3428');
    s.ball(16, 19, 10, 8, truffle, { tone: (nx, ny, x, y) => ((x * 7 + y * 3) % 5 === 0 ? 1 : 0) });
    s.ball(11, 15, 4, 3, truffle);
    s.ball(21, 15, 4, 3, truffle);
    for (const [x, y] of [[12, 14], [18, 16], [22, 13], [15, 21], [20, 22], [10, 19], [24, 19]]) { s.px(x, y, '#ffe27a'); s.px(x + 1, y, '#e5b93c'); }
    s.px(17, 10, '#fff6c8');
  },
  blackGarlic(s) {
    s.shadow(17, 29, 10, 2);
    // A papery bulb aged dark purple-brown, one clove broken off in front showing its glossy black flesh.
    const skin = R('#5b4552');
    s.tube([[16, 12], [16, 7], [15, 4]], (t) => 3 - 2 * t, skin);
    s.ball(15, 19, 9, 8, skin, { tone: (nx, ny) => (Math.abs(Math.round(nx * 8)) % 3 === 1 && ny > -0.6 ? 1 : 0) });
    s.ball(23, 24, 4, 4, R('#2a2128'), { bias: 0.3 });
    s.px(22, 22, '#8c7a86'); s.px(23, 22, '#6d5d68');
    for (const [x, y] of [[11, 25], [15, 26]]) s.px(x, y, '#9c6f8f');
  },
  saffron(s) {
    s.shadow(17, 28, 11, 2);
    // A tiny brass dish from the side and a little above, heaped with crimson saffron threads.
    bowl(s, 16, 20, 10.5, 3.2, 5, R('#d6ad45'), () => '#a82a14');
    s.ball(16, 18, 7.5, 3, R('#c23a1c'), { bias: 0.25, tone: (nx, ny, x, y) => ((x + y * 2) % 3 === 0 ? -1 : 0) });
    for (const [a, b] of [[[11, 18], [13, 12]], [[16, 17], [17, 10]], [[20, 18], [19, 12]], [[13, 18], [9, 13]], [[19, 18], [24, 13]]]) s.tube([a, b], 0.6, R('#d8361a'));
    for (const [x, y] of [[13, 12], [17, 10], [19, 12], [9, 13], [24, 13]]) s.px(x, y, '#f2a41e');
  },
  wagyu(s) {
    s.shadow(17, 28, 13, 2);
    // A raw slab of beef with heavy white marbling, seen from slightly above so its cut side shows below the top.
    const beef = R('#d64b55');
    const marble = (x, y) => Math.sin(x * 1.1 + Math.sin(y * 0.9) * 2) + Math.sin(y * 1.6 - x * 0.3) > 1.1;
    s.ball(16, 20, 13, 7, R('#9a2a34'), { tone: (nx, ny, x, y) => (marble(x, y + 3) ? -2 : 0) });
    s.ball(16, 17, 13, 7, beef, { tone: (nx, ny, x, y) => (marble(x, y) ? -2 : 0) });
    s.fill(3, 9, 29, 25, (x, y) => {
      const nx = (x - 16) / 13.35, ny = (y - 17) / 7.35, d = nx * nx + ny * ny;
      return d <= 1 && d > 0.78 && ny < 0.1 ? C.fat[1] : null;
    });
  },
  sweetPotato(s) {
    s.shadow(16, 28, 13, 2);
    // A long, knobbly sweet potato lying on its side, dusky purple-red skin, its near end cut to show the bright
    // orange flesh (an oval face, lit, with a paler ring of skin around it).
    const skin = R('#a3473f');
    s.ball(14, 21, 12, 6, skin, { tone: (nx, ny, x, y) => ((x * 5 + y * 7) % 11 === 0 ? 1 : 0) });
    s.ball(4, 22, 3, 3, skin);
    s.ball(24, 20, 5, 6, skin);
    s.ball(27, 20, 3, 5.5, R('#f0b37a'));
    s.ball(27, 20, 2.3, 4.6, R('#f2862a'), { bias: 0.35 });
    for (const [x, y] of [[9, 18], [15, 17], [19, 24], [11, 24]]) s.px(x, y, '#6e2a26');
    s.px(25, 17, '#ffd09a');
  },
  chickenTenderTower(s) {
    s.shadow(16, 29, 11, 2);
    // A Jenga tower of breaded chicken tenders: four layers stacked crosswise, crumbly golden coating, a cocktail
    // pick with a red flag through the top.
    const tender = R('#dc9a3c');
    s.tube([[6, 26], [26, 26]], 2.8, tender);
    // Crosswise layers point at you: two round tender ends side by side.
    s.ball(11, 21, 3.6, 3, tender);
    s.ball(21, 21, 3.6, 3, tender);
    s.tube([[7, 16], [25, 15]], 2.7, tender);
    s.ball(12, 11, 3.4, 2.8, tender);
    s.ball(20, 11, 3.4, 2.8, tender);
    // Crumbs: darker flecks over the coating.
    for (const [x, y] of [[9, 25], [13, 27], [19, 25], [23, 26], [10, 21], [22, 20], [9, 15], [14, 16], [20, 14], [24, 16], [12, 10], [20, 12]]) s.px(x, y, '#a8642a');
    s.line(16, 10, 16, 2, '#e6d3b0');
    s.poly([[17, 2], [22, 3], [17, 5]], () => '#d23a33');
  },
  // Scaling foods
  beanSprout(s) {
    s.shadow(17, 29, 9, 2);
    // A bean splitting open with a pale shoot curling up and two first leaves.
    s.ball(16, 24, 8, 4, R('#c99a5a'));
    s.line(11, 24, 21, 23, R('#c99a5a')[3]);
    s.tube([[16, 22], [14, 17], [17, 12], [16, 9]], 1.4, R('#dcecaa'));
    s.ball(11, 8, 4, 2, C.leaf);
    s.ball(21, 7, 4, 2, C.leaf);
  },
  mochi(s) {
    s.shadow(17, 30, 7, 2);
    // Three soft dango on a skewer: pink, white and green.
    s.tube([[16, 30], [16, 2]], 0.8, C.wood);
    s.ball(16, 23, 6, 5, R('#a8d88a'));
    s.ball(16, 15, 6, 5, R('#f7f2ea'));
    s.ball(16, 7, 6, 5, R('#f6a8c2'));
  },
  breadDough(s) {
    s.shadow(17, 29, 13, 2);
    // A puffy ball of risen dough with a fold across it and a dusting of flour.
    const dough = R('#f0dcae');
    s.ball(16, 20, 13, 9, dough, { bias: 0.15 });
    s.tube([[7, 19], [13, 17], [20, 17], [25, 20]], 0.8, dough, () => R('#d9be86'));
    for (const [x, y] of [[10, 14], [15, 13], [21, 14], [12, 23], [19, 24], [24, 17], [8, 20]]) s.px(x, y, '#ffffff');
  },
  yogurt(s) {
    s.shadow(17, 30, 9, 2);
    // A pot of yogurt with its lid peeled back and a berry on top.
    const pot = R('#e8eef5'), band = R('#6fa8dc');
    s.poly([[8, 13], [24, 13], [22, 29], [10, 29]], (x, y) => {
      const r = y >= 18 && y <= 22 ? band : pot;
      return x < 11 ? r[1] : x > 21 ? r[3] : r[2];
    });
    s.ball(16, 13, 8, 3, R('#fbf8f2'), { bias: 0.3 });
    s.poly([[18, 11], [27, 4], [29, 7], [21, 12]], R('#d8dee6')[1]);
    s.ball(14, 12, 2, 2, R('#c2304a'));
  },
  chiliOil(s) {
    s.shadow(17, 30, 10, 2);
    // An open glass jar of chili oil seen from slightly above: red oil through the glass, the glass rim, and the
    // oil's surface thick with flakes, a spoon resting in it.
    const oil = R('#c8331e');
    s.fill(7, 12, 25, 29, (x, y) => {
      const t = (x - 16) / 9;
      if (Math.abs(t) > 1 || (y > 26 && t * t + ((y - 26) / 3) ** 2 > 1)) return null;
      if ((x * 7 + y * 5) % 9 === 0 && y > 15) return '#5a1a10';
      return t < -0.6 ? oil[1] : t > 0.5 ? oil[3] : oil[2];
    });
    s.rect(9, 16, 1, 8, '#f6b0a0');
    s.ball(16, 12, 9, 3.5, R('#ece4e2'), { bias: 0.3 });
    s.fill(8, 9, 24, 15, (x, y) => {
      const nx = (x - 16) / 7.5, ny = (y - 12) / 2.6;
      if (nx * nx + ny * ny > 1) return null;
      if ((x * 5 + y * 3) % 4 === 0) return '#ff8a3a';
      if ((x * 3 + y * 7) % 7 === 0) return '#5a1a10';
      return '#a8260f';
    });
    s.tube([[19, 12], [25, 3]], 0.9, R('#d8dee6'));
  },
  mapleSyrup(s) {
    s.shadow(17, 30, 9, 2);
    // An amber glass jug of syrup with a loop handle and a red cap whose top you can see.
    const amber = R('#c9761e'), red = R('#d23a2c');
    s.tube([[21, 13], [26, 16], [25, 22], [21, 23]], 1.2, amber);
    s.ball(15, 22, 8, 7, amber);
    s.tube([[15, 15], [15, 9]], 2.6, amber);
    cylinder(s, 15, 5, 8, 3.5, 3.5, 1.4, (t) => cyl(red, t), () => red[1]);
    s.poly([[12, 20], [18, 20], [18, 26], [12, 26]], '#f3e3c3');
    s.px(15, 22, '#d6352a'); s.px(14, 23, '#d6352a'); s.px(16, 23, '#d6352a'); s.px(15, 24, '#d6352a');
  },
  peanutButter(s) {
    s.shadow(17, 30, 11, 2);
    // An open jar of peanut butter seen from slightly above: a red label band curving round it, the glass rim, and
    // the swirl on top.
    const glass = R('#c08a4a'), label = R('#d8394f');
    cylinder(s, 16, 12, 27, 9, 9, 3, (t, v) => (v >= 5 && v <= 11 ? cyl(label, t) : cyl(glass, t)), () => '#e9e2da');
    s.ball(16, 12, 7.5, 2.2, R('#b47a3a'), { bias: 0.3, tone: (nx, ny, x, y) => ((x + y * 2) % 7 === 0 ? 1 : 0) });
    s.ball(16, 21, 3, 2, R('#e0b070'));
    s.rect(9, 15, 1, 8, '#e2b47a');
  },
  roastTurkey(s) {
    s.shadow(17, 29, 14, 2);
    // A golden roast bird on a platter, drumsticks up, with paper frills on the bones.
    s.ball(16, 25, 14, 4, C.bowl, { bias: 0.25 });
    const roast = R('#c9762e');
    s.ball(16, 18, 11, 8, roast, { tone: (nx, ny, x, y) => ((x * 3 + y * 5) % 11 === 0 ? 1 : 0) });
    s.tube([[8, 17], [5, 11]], 2.4, roast);
    s.tube([[24, 17], [27, 11]], 2.4, roast);
    s.ball(5, 9, 2, 2, R('#f7f2ea'));
    s.ball(27, 9, 2, 2, R('#f7f2ea'));
    s.px(13, 14, roast[0]); s.px(14, 13, roast[0]); s.px(18, 13, roast[0]);
  },
  // Summoned tokens
  yolk(s) {
    s.shadow(17, 26, 12, 2);
    s.fill(3, 13, 29, 27, (x, y) => {
      const wob = 1 + 0.1 * Math.sin(x * 0.9 + y * 0.5);
      const nx = (x - 16) / (12 * wob), ny = (y - 21) / (5 * wob);
      return nx * nx + ny * ny <= 1 ? (ny < -0.4 || nx < -0.6 ? C.white[1] : C.white[2]) : null;
    });
    s.ball(15, 19, 5, 4, C.yolk);
  },
  kernel(s) {
    s.shadow(17, 27, 8, 2);
    for (const [x, y, r] of [[13, 19, 5], [19, 17, 5], [16, 22, 4], [16, 14, 4]]) s.ball(x, y, r, r - 0.5, C.popcorn);
    s.ball(16, 19, 2, 2, R('#e2a83a'));
  },
  spore(s) {
    s.shadow(17, 27, 7, 2);
    s.ball(16, 20, 7, 7, C.spore, { tone: (nx, ny, x, y) => ((x * 3 + y * 5) % 9 === 0 ? 1 : 0) });
    s.px(16, 13, C.spore[1]);
  },
  slice(s) {
    s.shadow(17, 27, 12, 2);
    const seeds = [[10, 15], [16, 15], [22, 15], [13, 18], [19, 18], [16, 21]];
    s.fill(3, 12, 29, 26, (x, y) => {
      const nx = (x - 16) / 13, ny = (y - 12) / 13;
      const d = nx * nx + ny * ny;
      if (y < 12 || d > 1) return null;
      if (d > 0.8) return d > 0.9 ? C.melon[3] : C.melon[1];
      if (d > 0.72) return '#f4f1dc';
      if (seeds.some(([sx, sy]) => sx === x && sy === y)) return '#2a1d1d';
      return y === 12 ? C.melonRed[1] : C.melonRed[2];
    });
  },
  cakeSlice(s) {
    s.shadow(17, 28, 11, 2);
    s.poly([[5, 15], [22, 9], [28, 13], [11, 20]], (x, y) => (y < 13 ? C.white[1] : C.white[2]));
    s.poly([[5, 15], [11, 20], [11, 28], [5, 23]], (x, y) => [C.frosting, C.sponge, C.white, C.sponge, C.frosting][Math.floor((y - 15) / 3) % 5][3]);
    s.poly([[11, 20], [28, 13], [28, 21], [11, 28]], (x, y) => {
      const layer = Math.floor((y - (20 - ((x - 11) * 7) / 17)) / 2.6);
      return [C.frosting, C.sponge, C.white, C.sponge, C.frosting][Math.max(0, Math.min(4, layer))][2];
    });
    s.ball(21, 9, 2, 2, R('#d6352a'));
  },
  crumb(s) {
    s.shadow(17, 27, 9, 2);
    // A little heap of golden crumbs.
    for (const [x, y, r] of [[12, 22, 3], [18, 23, 3], [15, 19, 3], [21, 20, 2], [10, 18, 2], [17, 15, 2]]) s.ball(x, y, r, r - 0.5, C.crust);
  },
};

// Items: condiments and kitchen tools (art/items/). Drawn so none of them can be mistaken for a food.
const I = {
  butter: R('#f6dc7a'), dish: R('#e9eef1'), paper: R('#f3efe6'), sauce: R('#cf2b22'), capGreen: R('#3f8f3a'),
  ceramic: R('#f2f4f6'), blue: R('#3f6fb3'), chrome: R('#c2cbd1'), pick: R('#e2bf86'), frill: R('#e04a6a'),
  stone: R('#9a9690'), spiceMix: R('#b8742e'), lid: R('#bfe2ee'), clip: R('#3c7fc4'), tub: R('#eef3f6'),
  stew: R('#d9822b'), oven: R('#c9cfd4'), lunch: R('#c8443a'), latch: R('#d6ad45'),
};
const items = {
  sprinkles(s) {
    s.shadow(17, 29, 9, 2);
    // A little shaker jar of rainbow sprinkles from the side and a little above: the glass shows the sprinkles, a
    // white cap with holes on top.
    cylinder(s, 16, 12, 28, 7.5, 7.5, 2.4, (t) => cyl(R('#f4eadc'), t));
    const dots = ['#e8504a', '#f2c21e', '#4aa8e0', '#6cc95a', '#e86fa8'];
    let k = 0;
    for (let y = 16; y <= 27; y += 2) for (let x = 10 + (y % 4 === 0 ? 1 : 0); x <= 22; x += 3) s.px(x, y, dots[k++ % dots.length]);
    cylinder(s, 16, 8, 12, 7.5, 7.5, 2.4, (t) => cyl(R('#f2f4f6'), t), (x, y) => ((x + y) % 3 === 0 ? '#b8c2c8' : '#ffffff'));
  },
  partyMix(s) {
    s.shadow(17, 29, 13, 2);
    // A bowl of party mix from the side and a little above: nuts, pretzels and crackers heaped in a blue bowl.
    bowl(s, 16, 20, 12.5, 3.6, 8, R('#4f7fc4'), () => '#8a5a2a');
    for (const [x, y, c] of [[11, 17, '#c8833a'], [16, 15, '#e0a85a'], [21, 17, '#a8642a'], [13, 19, '#f0c47a'], [19, 19, '#c8833a'], [16, 18, '#7a4a22']]) s.ball(x, y, 2.6, 2, R(c), { bias: 0.25 });
    s.tube([[7, 18], [10, 15], [12, 18]], 0.7, R('#a8642a')); // a little pretzel
    s.px(24, 15, '#f2e2b0'); s.px(9, 14, '#f2e2b0');
  },
  butter(s) {
    s.shadow(17, 27, 13, 2);
    s.ball(16, 23, 13, 4, I.dish, { bias: 0.25 });
    s.poly([[6, 15], [21, 10], [27, 13], [12, 18]], I.butter[1]);
    s.poly([[6, 15], [12, 18], [12, 23], [6, 20]], I.butter[3]);
    s.poly([[12, 18], [27, 13], [27, 18], [12, 23]], I.butter[2]);
    // Paper wrapper peeled back over the right end
    s.poly([[20, 10], [27, 13], [27, 18], [20, 15]], I.paper[2]);
    s.poly([[20, 10], [24, 6], [29, 10], [27, 13]], I.paper[1]);
    s.line(20, 15, 27, 18, I.paper[3]);
  },
  hotSauce(s) {
    s.shadow(17, 29, 7, 2);
    s.fill(10, 12, 22, 28, (x, y) => {
      const t = (x - 16) / 6;
      if (Math.abs(t) > 1 || (y > 26 && ((x - 16) / 6) ** 2 + ((y - 26) / 2) ** 2 > 1)) return null;
      const r = y >= 17 && y <= 23 ? I.paper : I.sauce; // label band
      return t < -0.65 ? r[1] : t > 0.55 ? r[3] : r[2];
    });
    s.tube([[16, 12], [16, 7]], 2.4, I.sauce);
    s.rect(14, 3, 5, 4, I.capGreen[2]);
    s.rect(14, 3, 1, 4, I.capGreen[1]);
    s.rect(18, 3, 1, 4, I.capGreen[3]);
    s.ball(16, 20, 2, 2, I.sauce); // chili mark on the label
    s.rect(12, 14, 1, 12, '#ffffff');
  },
  saltShaker(s) {
    s.shadow(17, 29, 8, 2);
    s.fill(10, 11, 22, 28, (x, y) => {
      const t = (x - 16) / 6;
      if (Math.abs(t) > 1 || (y > 26 && ((x - 16) / 6) ** 2 + ((y - 26) / 2) ** 2 > 1)) return null;
      const r = (y >= 15 && y <= 16) || (y >= 22 && y <= 23) ? I.blue : I.ceramic;
      return t < -0.65 ? r[1] : t > 0.55 ? r[3] : r[2];
    });
    s.ball(16, 10, 6, 5, I.chrome, { clip: (x, y) => y <= 11 });
    s.rect(10, 11, 13, 2, I.chrome[3]);
    for (const [x, y] of [[14, 7], [16, 6], [18, 7], [16, 8]]) s.px(x, y, I.chrome[4]);
    s.rect(11, 18, 1, 3, '#ffffff');
  },
  toothpick(s) {
    s.shadow(16, 27, 9, 2);
    s.tube([[8, 26], [22, 9]], 1, I.pick);
    // Cocktail frill at the top
    for (let k = 0; k < 7; k++) s.tube([[21, 10], [21 + Math.cos(k * 0.9) * 5, 8 + Math.sin(k * 0.9) * 5 - 2]], 1, k % 2 ? I.frill : R('#f2c94c'));
    s.ball(21, 9, 2, 2, I.frill);
  },
  seasoning(s) {
    s.shadow(17, 28, 12, 2);
    s.tube([[18, 18], [25, 5]], 2.2, I.stone); // pestle
    s.ball(16, 22, 11, 7, I.stone, { clip: (x, y) => y >= 19 }); // mortar bowl
    s.ball(16, 19, 10, 3, I.spiceMix, { bias: 0.3, tone: (nx, ny, x, y) => ((x * 5 + y * 7) % 6 === 0 ? -2 : (x + y) % 5 === 0 ? 2 : 0) });
    s.rect(6, 19, 21, 1, I.stone[1]);
  },
  bouillon(s) {
    s.shadow(17, 28, 10, 2);
    // A stock cube in gold foil on the diagonal, the foil folded back on top to show the brown cube.
    const foil = R('#e2b03a');
    s.poly([[16, 9], [26, 14], [16, 19], [6, 14]], (x, y) => ((x + y) % 4 === 0 ? '#8a5226' : '#a8642a')); // the cube's top
    s.poly([[6, 14], [16, 19], [16, 28], [6, 23]], (x, y) => ((x * 2 + y) % 5 === 0 ? foil[1] : foil[2]));
    s.poly([[16, 19], [26, 14], [26, 23], [16, 28]], (x, y) => ((x * 2 + y) % 5 === 0 ? foil[3] : foil[4]));
    s.line(6, 14, 16, 19, foil[0]);
    s.poly([[6, 14], [10, 12], [11, 16]], foil[1]); // folded-back corners of foil
    s.poly([[26, 14], [22, 12], [21, 16]], foil[3]);
    s.rect(8, 19, 1, 3, '#fff2b0');
  },
  takeout(s) {
    s.shadow(17, 29, 11, 2);
    // A white takeout box with its flaps folded shut and a wire handle: the front face narrowing to the bottom, a
    // darker side face for depth, a red pagoda on the front.
    const box = R('#f4f1ec');
    s.poly([[7, 12], [23, 12], [21, 28], [9, 28]], (x) => (x < 10 ? box[1] : box[2]));
    s.poly([[23, 12], [27, 10], [25, 25], [21, 28]], box[3]);
    s.poly([[7, 12], [11, 8], [19, 8], [23, 12]], box[1]); // the folded flaps
    s.poly([[19, 8], [23, 6], [27, 10], [23, 12]], box[2]);
    s.line(11, 8, 23, 12, box[3]);
    s.tube([[9, 10], [12, 2], [21, 2], [25, 8]], 0.6, R('#9aa4aa'));
    s.rect(14, 17, 5, 1, '#d23a33'); // pagoda
    s.rect(13, 19, 7, 1, '#d23a33');
    s.rect(15, 20, 3, 3, '#d23a33');
    s.rect(14, 23, 5, 1, '#d23a33');
  },
  chopsticks(s) {
    s.shadow(16, 28, 12, 2);
    // A pair of lacquered chopsticks resting on a little ceramic rest, seen a little from above.
    const stick = R('#9a3a2a');
    s.ball(22, 24, 4, 2.4, R('#e8eef2'), { bias: 0.2 }); // the rest
    s.tube([[4, 9], [26, 22]], (t) => 1.3 - 0.5 * t, stick);
    s.tube([[6, 5], [28, 19]], (t) => 1.3 - 0.5 * t, stick);
    s.tube([[4, 9], [8, 11.4]], 1.4, R('#d6ad45')); // gold tips at the held end
    s.tube([[6, 5], [10, 7.4]], 1.4, R('#d6ad45'));
  },
  tupperware(s) {
    s.shadow(17, 28, 13, 2);
    s.poly([[5, 16], [27, 16], [25, 27], [7, 27]], (x) => (x < 8 ? I.tub[1] : x > 24 ? I.tub[3] : I.tub[2]));
    s.poly([[7, 17], [25, 17], [24, 25], [8, 25]], (x, y) => ((x + y) % 4 === 0 ? I.stew[1] : I.stew[2])); // food seen through
    s.poly([[4, 12], [28, 12], [28, 16], [4, 16]], (x, y) => (y === 12 ? I.lid[1] : I.lid[2]));
    for (const x of [6, 25]) { s.rect(x, 15, 2, 4, I.clip[2]); s.rect(x, 15, 1, 4, I.clip[1]); }
    s.rect(7, 13, 8, 1, '#ffffff');
  },
  microwave(s) {
    s.shadow(17, 28, 13, 2);
    // A microwave from the front and a little above: its top face, the dark window and the button panel.
    box(s, 4, 28, 12, 26, 4, I.oven, (x, y) => (y <= 9 ? I.oven[1] : I.oven[0]));
    s.rect(6, 14, 15, 11, '#2c3438'); // window
    s.rect(7, 15, 13, 1, '#5a6a72');
    s.rect(7, 16, 1, 8, '#43525a');
    for (let y = 15; y <= 23; y += 3) { s.rect(23, y, 3, 2, I.oven[3]); s.px(23, y, I.oven[1]); }
    s.rect(4, 26, 2, 2, I.oven[4]); s.rect(26, 26, 2, 2, I.oven[4]);
  },
  lunchbox(s) {
    s.shadow(17, 29, 13, 2);
    // A tin lunchbox from the front and a little above: its front with the lid seam and latch, the top face, and
    // the handle standing up from it.
    box(s, 4, 28, 13, 27, 4, I.lunch, (x, y) => (y <= 10 ? I.lunch[1] : I.lunch[0]));
    s.tube([[11, 11], [11, 6], [21, 6], [21, 11]], 1.3, I.chrome); // handle
    s.rect(4, 18, 25, 1, I.lunch[4]); // lid seam
    s.rect(14, 17, 4, 4, I.latch[2]);
    s.rect(14, 17, 4, 1, I.latch[1]);
    s.rect(8, 22, 16, 4, I.lunch[1]); // decal panel
  },
  flavorPacket(s) {
    s.shadow(17, 29, 11, 2);
    // A puffy paper sachet, its crimped top edge and the slight top of the pillow showing, printed with a dot of
    // every flavor. It bulges in the middle, so it's lit on the left and shaded on the right.
    s.fill(7, 8, 25, 28, (x, y) => {
      const t = (x - 16) / 9;
      return t < -0.7 ? I.paper[1] : t > 0.7 ? I.paper[4] : t > 0.35 ? I.paper[3] : I.paper[2];
    });
    s.poly([[9, 6], [23, 6], [25, 8], [7, 8]], I.paper[1]); // the top of the pillow
    for (let x = 7; x <= 25; x += 2) s.px(x, 5 + (x % 4 === 1 ? 0 : 1), I.paper[2]); // crimp
    for (let x = 7; x <= 25; x += 2) s.px(x, 28, I.paper[3]);
    s.rect(7, 11, 19, 2, '#d8394f');
    s.rect(7, 11, 19, 1, '#ec5a6e');
    const dots = ['#e4502a', '#e86fa8', '#d9b21f', '#5f8eb0', '#9a5d33'];
    dots.forEach((c, i) => s.ball(10 + (i % 3) * 6, 17 + Math.floor(i / 3) * 6, 2, 2, R(c)));
  },
  oliveOil(s) {
    s.shadow(17, 29, 7, 2);
    // A tall bottle of golden-green oil with a cork and an olive on the label.
    const oil = R('#a8b23a');
    s.fill(10, 12, 22, 28, (x, y) => {
      const t = (x - 16) / 6;
      if (Math.abs(t) > 1 || (y > 26 && ((x - 16) / 6) ** 2 + ((y - 26) / 2) ** 2 > 1)) return null;
      const r = y >= 18 && y <= 23 ? I.paper : oil;
      return t < -0.6 ? r[1] : t > 0.5 ? r[3] : r[2];
    });
    s.tube([[16, 12], [16, 6]], 2, oil);
    s.rect(14, 2, 5, 4, I.pick[2]);
    s.ball(16, 20, 2, 2, R('#4f6b2a'));
    s.rect(12, 13, 1, 4, '#e8f0a8');
  },
  boneBroth(s) {
    s.shadow(17, 29, 12, 2);
    // A steaming mug of broth with a bone poking out.
    s.fill(7, 13, 25, 28, (x, y) => {
      const t = (x - 16) / 9;
      if (Math.abs(t) > 1 || (y > 26 && ((x - 16) / 9) ** 2 + ((y - 26) / 2) ** 2 > 1)) return null;
      return t < -0.7 ? I.ceramic[1] : t > 0.55 ? I.ceramic[3] : I.ceramic[2];
    });
    s.tube([[25, 17], [28, 19], [25, 23]], 1.2, I.ceramic);
    s.ball(16, 14, 8, 2, R('#c98a3e'), { bias: 0.3 });
    s.tube([[13, 13], [19, 6]], 1.3, R('#f2ead8'));
    s.ball(19, 5, 2, 2, R('#f2ead8'));
    s.ball(20, 7, 2, 2, R('#f2ead8'));
    for (const [x, y] of [[9, 9], [10, 7], [9, 5], [23, 10], [24, 8]]) s.px(x, y, '#e8eef2');
  },
};

// Special-cubby offers (art/specials/): packs and restocks bought once a turn.
const specials = {
  spicePack(s) {
    s.shadow(16, 29, 11, 2);
    // A burlap spice sack: a round bottom, a neck cinched with twine, the cloth above it flaring open in a ruffle, a
    // heap of red spice inside with a chili and a cinnamon stick poking out, and a little flame label on the front.
    const burlap = R('#b8844a'), spice = R('#d2452a'), cinnamon = R('#9a5a2c');
    const weave = (nx, ny, x, y) => ((x + y * 3) % 9 === 0 ? 1 : 0);
    s.ball(16, 21, 10, 8, burlap, { tone: weave });
    // the neck, gathered into folds
    s.poly([[11, 11], [21, 11], [19, 15], [13, 15]], (x) => (x % 3 === 0 ? burlap[3] : x < 14 ? burlap[1] : x > 18 ? burlap[3] : burlap[2]));
    // the ruffle flaring open above it, scalloped along the top edge
    s.poly([[8, 7], [24, 7], [21, 11], [11, 11]], (x, y) => (y === 7 && x % 4 === 1 ? null : x % 4 === 3 ? burlap[3] : x < 12 ? burlap[1] : x > 20 ? burlap[3] : burlap[2]));
    // the opening and the spice heaped in it
    s.ball(16, 7, 7, 1.6, R('#4a2a18'));
    s.ball(16, 6, 6, 2.2, spice, { clip: (x, y) => y <= 7, tone: (nx, ny, x, y) => ((x * 5 + y * 3) % 7 === 0 ? -2 : (x + y) % 5 === 0 ? 1 : 0) });
    // a cinnamon stick and a chili poking out
    s.tube([[12, 6], [10, 1]], 1.1, cinnamon);
    s.px(10, 1, cinnamon[0]);
    s.tube([[18, 6], [21, 3], [25, 1]], (t) => 2 - 1.3 * t, R('#e0302a'));
    s.ball(18, 6, 1.6, 1.2, C.stem);
    // the twine round the neck, knotted, one end hanging
    s.rect(11, 13, 11, 1, '#efe0c3');
    s.rect(12, 14, 9, 1, '#cbb894');
    s.px(21, 14, '#efe0c3'); s.px(22, 15, '#efe0c3'); s.px(22, 16, '#cbb894');
    // the label: a cream patch with a red flame on it
    s.poly([[12, 18], [20, 18], [20, 25], [12, 25]], (x, y) => (x === 12 || y === 18 ? '#fff6e0' : x === 20 || y === 25 ? '#d8c39a' : '#f4e6c4'));
    s.poly([[16, 19], [18, 22], [18, 24], [14, 24], [14, 22]], '#e4502a');
    s.px(16, 23, '#ffd23f'); s.px(15, 23, '#ffb03a'); s.px(17, 22, '#ff8a3a');
  },
  farmPack(s) {
    s.shadow(17, 29, 14, 2);
    // A slatted wooden crate brimming with a tomato, a carrot and leafy greens.
    s.ball(10, 12, 4, 4, C.red);
    s.tube([[16, 14], [21, 5]], (t) => 2.4 - 1.6 * t, R('#ec8a2a'));
    s.ball(23, 12, 4, 3, C.leaf);
    s.ball(14, 13, 3, 2, C.leaf);
    const wood = R('#b8834a');
    s.poly([[3, 14], [29, 14], [28, 28], [4, 28]], (x, y) => ((y - 14) % 5 === 0 ? wood[4] : x < 6 ? wood[1] : x > 26 ? wood[3] : wood[2]));
    s.rect(4, 14, 25, 1, wood[0]);
  },
  premium(s) {
    s.shadow(17, 29, 13, 2);
    // A gilded gift box seen from the front-left and a little above: a lit front face, a shaded right side, a lid that
    // overhangs both, a red ribbon wrapping the front, side and top, and a two-loop bow with its tails on top.
    const gold = R('#e8bd3e'), ribbon = R('#d8352a');
    // the box: front face and right side (the side recedes, rising toward the back)
    s.poly([[5, 16], [20, 16], [20, 28], [5, 28]], (x) => (x < 7 ? gold[1] : gold[2]));
    s.poly([[20, 16], [27, 13], [27, 25], [20, 28]], (x) => (x > 25 ? gold[4] : gold[3]));
    // the lid: its front band, side band and top
    s.poly([[11, 9], [29, 9], [22, 12], [4, 12]], gold[0]);
    s.poly([[4, 12], [22, 12], [22, 16], [4, 16]], (x) => (x < 6 ? gold[0] : gold[1]));
    s.poly([[22, 12], [29, 9], [29, 13], [22, 16]], gold[3]);
    s.rect(4, 16, 18, 1, gold[4]); // the lid's shadow on the box
    // ribbon: down the front of the lid and box, down the side, and crossing the top both ways
    s.poly([[11, 12], [14, 12], [14, 28], [11, 28]], (x) => (x === 11 ? ribbon[1] : x === 14 ? ribbon[3] : ribbon[2]));
    s.poly([[24, 11], [26, 10], [26, 26], [24, 27]], ribbon[3]);
    s.poly([[18, 9], [21, 9], [14, 12], [11, 12]], ribbon[1]);
    s.poly([[7, 10.5], [26, 10.5], [25, 11.5], [6, 11.5]], ribbon[2]);
    // the bow: two loops with their dark insides, a knot, two tails
    s.ball(11, 6, 4, 3, ribbon, { bias: 0.2 });
    s.ball(21, 6, 4, 3, ribbon, { bias: 0.2 });
    s.ball(11, 6, 1.6, 1, R('#7a1810'));
    s.ball(21, 6, 1.6, 1, R('#7a1810'));
    s.poly([[15, 9], [13, 13], [12, 12], [14, 9]], ribbon[3]);
    s.poly([[17, 9], [20, 12], [19, 13], [16, 9]], ribbon[3]);
    s.ball(16, 8, 2, 1.8, ribbon);
    s.px(15, 7, ribbon[0]);
    // a glint on the lid's corner
    s.px(6, 13, '#fff6c8'); s.px(5, 13, '#fff6c8');
  },
};

// Shared helper for shapes that compute their own normals (potato).
function litPick(nx, ny, r) {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const L = [-0.55, -0.68, 0.48], n = Math.hypot(...L);
  const d = (L[0] * nx + L[1] * ny + L[2] * nz) / n;
  return d > 0.93 ? r[0] : d > 0.66 ? r[1] : d > 0.32 ? r[2] : d > 0.02 ? r[3] : r[4];
}

// ---------- write ----------
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
// --replace apple,cheese,salt: take over sprites that were drawn by hand.
const ri = process.argv.indexOf('--replace');
const replace = new Set(ri > 0 ? process.argv[ri + 1].split(',').map(norm) : []);
const sprites = [];

/** Writes one set of sprites into a folder, never overwriting a hand-drawn file (see .generated.json). */
function writeSet(defs, folder) {
  const dir = new URL(`../art/${folder}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  const ledgerPath = new URL('.generated.json', dir);
  const ledger = new Set(existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : []);
  const existing = new Map(readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => [norm(f.slice(0, -4)), f]));
  const written = [], skipped = [];
  for (const [id, draw] of Object.entries(defs)) {
    const s = new Sprite();
    draw(s);
    s.clean();
    s.outline();
    sprites.push([id, s]);
    const file = existing.get(norm(id)) ?? `${id}.png`;
    if (existing.has(norm(id)) && !ledger.has(file) && !replace.has(norm(id))) {
      skipped.push(file);
      continue;
    }
    writeFileSync(new URL(file, dir), s.png());
    ledger.add(file);
    written.push(file);
  }
  writeFileSync(ledgerPath, JSON.stringify([...ledger].sort(), null, 2) + '\n');
  console.log(`${folder}: wrote ${written.length} sprites${skipped.length ? `; kept hand-drawn: ${skipped.join(', ')}` : ''}`);
}
writeSet(foods, 'units');
writeSet(items, 'items');
writeSet(specials, 'specials');

// Optional contact sheet: every generated sprite at 4x on a counter-coloured background.
const sheetIdx = process.argv.indexOf('--sheet');
if (sheetIdx > 0) {
  const cols = 8, n = 4, cell = 36, rows = Math.ceil(sprites.length / cols);
  const W = cols * cell, H = rows * cell, data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set([214, 160, 104, 255], i * 4);
  sprites.forEach(([, s], k) => {
    const ox = (k % cols) * cell + 2, oy = Math.floor(k / cols) * cell + 2;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const si = (y * 32 + x) * 4, a = s.data[si + 3] / 255, di = ((oy + y) * W + ox + x) * 4;
      for (let c = 0; c < 3; c++) data[di + c] = s.data[si + c] * a + data[di + c] * (1 - a);
    }
  });
  writeFileSync(process.argv[sheetIdx + 1], encodePng(upscale(data, W, H, n), W * n, H * n));
  console.log(`sheet: ${process.argv[sheetIdx + 1]} (${sprites.map(([id]) => id).join(', ')})`);
}
