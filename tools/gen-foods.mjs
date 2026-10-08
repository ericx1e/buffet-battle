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
    s.shadow(17, 28, 11, 2);
    // A slice lying on the table, seen from slightly above: crust at the back, tip toward you, and the slice's
    // thickness showing along its near edges. Toppings are squashed ovals, as flat things look from this angle.
    s.poly([[5, 11], [27, 11], [16, 28]], C.crust[3]);
    s.poly([[5, 9], [27, 9], [16, 26]], (x, y) => (x > 21 && y > 12 ? C.cheese[3] : y < 12 ? C.cheese[1] : C.cheese[2]));
    s.tube([[5, 10], [10, 8], [16, 7], [22, 8], [27, 10]], 2.6, C.crust);
    for (const [x, y, rx, ry] of [[12, 14, 3, 2.2], [20, 14, 3, 2.2], [16, 20, 2.4, 1.8]]) s.ball(x, y, rx, ry, C.pepperoni);
    s.tube([[23, 16], [23, 19]], 1, C.cheese);
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
    s.fill(4, 14, 28, 28, (x, y) => {
      const t = (x - 16) / 12;
      if (Math.abs(t) > 1 || (y > 24 && ((x - 16) / 12) ** 2 + ((y - 24) / 4) ** 2 > 1)) return null;
      const band = y === 20 || y === 21 ? C.white : C.frosting;
      return t < -0.7 ? band[1] : t > 0.55 ? band[3] : band[2];
    });
    s.ball(16, 14, 12, 4, C.white, { bias: 0.3 });
    for (const [x, len] of [[7, 3], [12, 4], [20, 3], [25, 2]]) s.tube([[x, 16], [x, 16 + len]], 1, C.white);
    s.rect(15, 5, 2, 8, '#8fc3e8');
    s.px(15, 7, '#ffffff'); s.px(16, 9, '#ffffff'); s.px(15, 11, '#ffffff');
    s.ball(16, 3, 1, 2, R('#ffc23a'));
  },
  kimchi(s) {
    s.shadow(17, 29, 13, 2);
    s.ball(12, 17, 6, 5, C.kimchi, { tone: (nx, ny, x, y) => ((x + y) % 6 === 0 ? -2 : 0) });
    s.ball(20, 16, 6, 5, C.kimchi, { tone: (nx, ny, x, y) => ((x * 2 + y) % 7 === 0 ? -2 : 0) });
    s.ball(16, 13, 5, 4, C.kimchi, { tone: (nx, ny, x, y) => ((x + y * 2) % 6 === 0 ? -2 : 0) });
    s.ball(16, 21, 13, 7, C.bowl, { clip: (x, y) => y >= 19 });
    s.rect(4, 19, 25, 1, C.bowl[1]);
  },
  ramen(s) {
    s.shadow(17, 29, 13, 2);
    s.tube([[7, 4], [20, 15]], 0.9, C.wood);
    s.tube([[10, 3], [22, 14]], 0.9, C.wood);
    s.ball(16, 20, 13, 8, C.ramenBowl, { clip: (x, y) => y >= 18 });
    s.ball(16, 17, 12, 4, C.yolk.map((c) => shade(c, 0.05)), { bias: 0.3, tone: (nx, ny, x, y) => (Math.sin(x * 1.4 + y * 2) > 0.7 ? -2 : 0) });
    s.ball(21, 16, 3, 2, C.white);
    s.px(21, 16, '#f29a1e'); s.px(22, 16, '#f29a1e');
    s.rect(8, 14, 3, 4, '#2e4a2c');
    s.rect(3, 18, 27, 1, '#f4ece4');
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
    // A round head wrapped in loose outer leaves with pale veins.
    const leaf = R('#7cbf4a'), inner = R('#b8df7a');
    s.ball(16, 19, 12, 9, leaf, { tone: (nx, ny) => (Math.abs(Math.round(nx * 6)) % 3 === 2 && ny > -0.3 ? -1 : 0) });
    s.ball(16, 16, 8, 6, inner, { tone: (nx) => (Math.abs(Math.round(nx * 5)) % 3 === 1 ? 1 : 0) });
    s.line(16, 12, 16, 21, inner[0]);
    s.line(9, 19, 6, 25, leaf[0]);
    s.line(23, 19, 26, 25, leaf[0]);
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
    s.shadow(17, 29, 13, 2);
    // A pile of tortilla chips under a molten cheese drip.
    const chip = R('#f0b84a');
    for (const pts of [[[4, 26], [14, 12], [18, 27]], [[12, 27], [22, 11], [28, 26]], [[8, 20], [20, 17], [12, 28]], [[17, 23], [26, 16], [27, 28]]]) {
      s.poly(pts, (x, y) => ((x * 5 + y * 3) % 13 === 0 ? chip[3] : y < 18 ? chip[1] : chip[2]));
    }
    s.tube([[11, 17], [21, 17]], 1.3, C.cheese);
    s.tube([[12, 17], [11, 22]], 1, C.cheese);
    s.tube([[20, 17], [21, 20]], 1, C.cheese);
    for (const x of [8, 15, 23]) s.line(x, 25, x + 2, 23, chip[4]); // chip edges
    s.px(15, 16, C.stem[2]); s.px(18, 16, C.red[2]);
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
    // Glossy red-orange pork chunks and pineapple in a white bowl.
    s.ball(16, 21, 13, 7, C.bowl, { clip: (x, y) => y >= 19 });
    const glaze = R('#e0532a');
    for (const [x, y] of [[10, 16], [16, 14], [22, 16], [13, 19], [20, 19]]) s.ball(x, y, 3.5, 3, glaze, { bias: 0.15 });
    for (const [x, y] of [[17, 18], [8, 19], [24, 19]]) s.rect(x - 1, y - 1, 3, 2, C.pine[1]);
    s.rect(3, 19, 27, 1, '#f4ece4');
  },
  spaghetti(s) {
    s.shadow(17, 29, 13, 2);
    // A twirl of noodles under red sauce and a meatball.
    s.ball(16, 22, 14, 6, C.bowl, { bias: 0.2 });
    s.ball(16, 18, 10, 6, C.noodle, { tone: (nx, ny, x, y) => (Math.sin(x * 1.3 + y * 0.7) > 0.6 ? 1 : 0) });
    s.ball(16, 16, 6, 3, R('#cf3524'), { bias: 0.2 });
    s.ball(19, 14, 3, 3, C.steak);
    s.px(13, 14, C.leaf[1]); s.px(14, 14, C.leaf[2]);
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
    // A tall cup of berry smoothie seen from slightly above: the pink drink's surface inside the rim, a striped straw
    // and a lemon slice on the rim.
    const berry = R('#f27aa8');
    cylinder(s, 16, 10, 28, 7.5, 5.5, 2.2, (t) => cyl(berry, t), (x, y) => (((x - 16) / 6.2) ** 2 + ((y - 10.4) / 1.5) ** 2 <= 1 ? '#f9a8c8' : '#fff0f6'));
    s.tube([[18, 10], [21, 2]], 1, C.stripeWhite, (off, t) => (Math.floor(t * 8) % 2 ? C.stripeRed : C.stripeWhite));
    s.ball(9, 10, 3, 3, C.lemon, { clip: (x, y) => y <= 11 });
    s.rect(11, 14, 1, 9, '#ffe0ec');
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
    // A little wooden dish heaped with black peppercorns, a few spilled in front.
    const wood = R('#a8693a');
    s.fill(5, 20, 27, 27, (x, y) => {
      const nx = (x - 16) / 11, ny = (y - 20) / 7;
      if (nx * nx + ny * ny > 1) return null;
      return nx < -0.6 ? wood[1] : nx > 0.5 ? wood[3] : wood[2];
    });
    s.ball(16, 20, 11, 3.5, R('#7a4a26'), { bias: 0.2 });
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
    // Three takoyaki in a paper boat seen from slightly above, glazed with sauce, a line of mayo and green flakes.
    const tray = R('#e8d6b0');
    s.poly([[3, 19], [29, 19], [26, 27], [6, 27]], (x, y) => (y < 21 ? tray[1] : tray[2]));
    for (const [x, y] of [[9, 17], [16, 16], [23, 17]]) {
      s.ball(x, y, 5, 4.5, R('#c88a3e'));
      s.ball(x, y - 2, 4, 2.2, R('#6a3a1e'), { bias: 0.3 });
      s.line(x - 3, y - 2, x + 2, y - 3, '#fff6e0');
      s.px(x - 1, y - 3, '#5aa63a');
      s.px(x + 2, y - 1, '#5aa63a');
    }
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
    // A tiny brass dish heaped with crimson saffron threads.
    s.ball(16, 22, 11, 5, R('#d6ad45'), { bias: 0.2 });
    s.ball(16, 20, 9, 3, R('#c23a1c'), { bias: 0.25, tone: (nx, ny, x, y) => ((x + y * 2) % 3 === 0 ? -1 : 0) });
    for (const [a, b] of [[[10, 19], [13, 12]], [[16, 19], [17, 10]], [[21, 19], [19, 12]], [[13, 18], [9, 13]], [[19, 18], [24, 13]]]) s.tube([a, b], 0.6, R('#d8361a'));
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
    s.shadow(17, 29, 12, 2);
    // A kraft-paper pouch from the side and a little above: its gathered neck tied with twine, the open top showing
    // its dark inside, and a red flavor tag on the front. It bulges, so it is shaded like a cylinder.
    const kraft = R('#c9925a');
    cylinder(s, 16, 13, 27, 8.5, 11, 2, (t) => cyl(kraft, t));
    cylinder(s, 16, 6, 12, 6.5, 5, 1.6, (t, v) => (v % 2 ? kraft[1] : cyl(kraft, t)), () => R('#5a3a1e')[2]);
    s.rect(9, 11, 15, 2, '#efe0c3'); // twine
    s.rect(9, 12, 15, 1, '#cbb894');
    s.poly([[17, 16], [25, 15], [25, 22], [17, 23]], '#d8394f');
    s.rect(17, 16, 1, 7, '#ec5a6e');
    s.ball(21, 19, 1.8, 1.8, R('#ffd23f'));
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
    // A gilded gift box from the front and a little above: its front, the lid's top face narrowing to the back with
    // the ribbon crossing it, and a red bow sitting on top.
    const gold = R('#e5b93c'), ribbon = R('#d23a2c');
    box(s, 6, 26, 16, 28, 0, gold, () => gold[1]);
    box(s, 4, 28, 13, 16, 5, gold, (x, y) => (y <= 9 ? gold[1] : gold[0]));
    s.rect(14, 13, 4, 16, ribbon[2]); // down the front
    s.rect(14, 13, 1, 16, ribbon[1]);
    s.rect(17, 13, 1, 16, ribbon[3]);
    s.poly([[15, 8], [17, 8], [18, 13], [14, 13]], ribbon[2]); // across the lid, front to back
    s.poly([[6, 10], [26, 10], [27, 11.5], [5, 11.5]], ribbon[2]); // and side to side
    s.ball(12, 7, 4, 2.6, ribbon, { bias: 0.2 });
    s.ball(20, 7, 4, 2.6, ribbon, { bias: 0.2 });
    s.ball(16, 8, 2, 1.6, ribbon);
    s.px(16, 7, R('#ffe27a')[1]);
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
