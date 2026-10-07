// Small pixel-art icons (stars, trophies, stat badges) drawn from character grids into tiny images, so they stay crisp at any
// whole-number scale instead of depending on how a font or emoji renders. Every painted cell gets a 1px dark
// outline automatically.

const OUTLINE = '#2a1b14';

/** Colour per grid character ('.' is empty). Gold: h highlight, y body, d shade. Grey: l, g, s. Brown: b. */
const PALETTE: Record<string, string> = {
  h: '#fff0a8', y: '#f2c94c', d: '#c8952f',
  l: '#ece7dc', g: '#cdc6b8', s: '#a8a092',
  b: '#8a5a32', B: '#6a4224',
  // stat badges: r heart (HP), o medallion (attack), c crust shield; + highlight, - shade
  r: '#d8394f', R: '#ff8a9a', q: '#9e2238',
  o: '#e0702c', O: '#ffb070', p: '#a8481a',
  c: '#c9893e', C: '#ecb873', k: '#8f5a25',
  // statuses: f/F/e Burn flame, v/V/w Rot blob, i/I/j Chill snowflake
  f: '#f07a26', F: '#ffd23f', e: '#c4361a',
  v: '#86a83a', V: '#c2d860', w: '#56702a',
  i: '#8fd0ee', I: '#effbff', j: '#4f93bc',
  // flavors and misc: G leaf, P/W candy, U salt blue, m/M steel, x white
  G: '#5aa63a', P: '#ef6fa6', W: '#ffd0e4', U: '#9cc4dc', m: '#c2cbd1', M: '#8f9ca5', x: '#ffffff',
};

const ICONS = {
  star: [
    '....h....',
    '...hyy...',
    'hhhyyyyyd',
    '.hyyyyyd.',
    '..yyyyd..',
    '..yyddd..',
    '.yyd.ddd.',
    '.yd...dd.',
  ],
  starOff: [
    '....l....',
    '...lgg...',
    'lllggggs.',
    '.lggggs..',
    '..ggggs..',
    '..ggsss..',
    '.ggs.sss.',
    '.gs...ss.',
  ],
  starSmall: [
    '..y..',
    '.hyy.',
    'yyyyd',
    '.yyd.',
    '.y.d.',
  ],
  trophy: [
    '.hhyyyyd.',
    'y.hyyyd.d',
    'y.hyyyd.d',
    '.yhyyydd.',
    '...hyd...',
    '....d....',
    '...hyd...',
    '..bbbbB..',
  ],
  trophyOff: [
    '.llggggs.',
    'g.lgggs.s',
    'g.lgggs.s',
    '.glgggss.',
    '...lgs...',
    '....s....',
    '...lgs...',
    '..sssss..',
  ],
  // Stat badges (the number is drawn on top)
  heart: [
    '.rrr...rrr.',
    'rRRrr.rrrrr',
    'rRrrrrrrrrr',
    'rrrrrrrrrrq',
    'rrrrrrrrrrq',
    '.rrrrrrrrq.',
    '..rrrrrrq..',
    '...rrrrq...',
    '....rrq....',
    '.....q.....',
  ],
  medal: [
    '..ooooooo..',
    '.oOOooooop.',
    'oOoooooooop',
    'oOoooooooop',
    'oooooooooop',
    'oooooooooop',
    'oooooooooop',
    'oooooooooop',
    '.ooooooooo.',
    '..ppppppp..',
  ],
  shield: [
    'ccccccccccc',
    'cCCcccccccc',
    'cCccccccccc',
    'cCcccccccck',
    'cccccccccck',
    '.cccccccck.',
    '..cccccck..',
    '...cccck...',
    '....cck....',
    '.....k.....',
  ],
  flame: [
    '....f......',
    '...ff......',
    '...ffe..f..',
    '..fffe.ff..',
    '..ffFfeffe.',
    '.ffFFffffe.',
    '.fFFFFfffe.',
    '.fFFFFFffe.',
    '..fFFFffe..',
    '...eeeee...',
  ],
  rotBlob: [
    '....vv.....',
    '...vVvv....',
    '..vVvvvv...',
    '..vvvvvvw..',
    '.vVvvwvvvw.',
    '.vvvvvvvvw.',
    'vvvwvvvvvvw',
    'vvvvvvwvvvw',
    '.vvvvvvvvw.',
    '..wwwwwww..',
  ],
  snowflake: [
    '.....I.....',
    '..i.iIi.i..',
    '...iiIii...',
    '.i..jIj..i.',
    'iIIIIjIIIIi',
    '.i..jIj..i.',
    '...iiIii...',
    '..i.iIi.i..',
    '.....I.....',
    '...........',
  ],
  // Lives: a plump heart, distinct from the HP badge (no number, brighter highlight)
  life: [
    '.rr..rr.',
    'rRRrrrrr',
    'rRrrrrrq',
    'rrrrrrrq',
    '.rrrrrq.',
    '..rrrq..',
    '...rq...',
  ],
  lifeOff: [
    '.gg..gg.',
    'gllggggg',
    'glggggss',
    'ggggggss',
    '.ggggss.',
    '..ggss..',
    '...gs...',
  ],
  // Flavors
  spicy: [
    '.....GG',
    '....GG.',
    '...rrr.',
    '..rRrq.',
    '.rRrq..',
    'rrrq...',
    'rq.....',
  ],
  sweet: [
    'P.......P',
    'PP.PPP.PP',
    'PPPWWPPPP',
    'PP.PPP.PP',
    'P.......P',
  ],
  sour: [
    '..hhyy..',
    '.hyyyyd.',
    'yyyyyyyd',
    '.yyyyyd.',
    '..yddd..',
  ],
  salty: [
    '...x...',
    '..xll..',
    '.xllUU.',
    'xllUUUU',
    '.lUUUU.',
    '..UUU..',
    '...U...',
  ],
  savory: [
    '.bbb....',
    'bCCbb...',
    'bCbbbb..',
    'bbbbbB..',
    '.bbbB...',
    '..BBll..',
    '.....ll.',
    '.....lg.',
  ],
  // Messages and battle
  warn: [
    '...y...',
    '..yBy..',
    '..yBy..',
    '.yyByy.',
    '.yyyyy.',
    'yyyByyy',
    'yyyyyyy',
  ],
  fork: [
    'm.m.m',
    'm.m.m',
    'm.m.m',
    'mmmmm',
    '.mmM.',
    '..m..',
    '..m..',
    '..m..',
    '..M..',
    '..M..',
  ],
  // Held items, shown in the corner of a food
  heldSaltShaker: [
    '.mmm.',
    'xxxxx',
    'xUxUx',
    'xxxxx',
    'xUxUx',
    'xxxxx',
  ],
  heldToothpick: [
    '....r',
    '...rR',
    '..c..',
    '.c...',
    'c....',
  ],
  heldTupperware: [
    'iiiiiii',
    'IjjjjjI',
    'IoooooI',
    'IoooooI',
    '.IIIII.',
  ],
  // A covered dish: shown when a food has no sprite
  cloche: [
    '....yy....',
    '...hyyd...',
    '.hhyyyyyd.',
    'hyyyyyyyyd',
    'hyyyyyyydd',
    'dddddddddd',
    'llllllllll',
  ],
  coin: [
    '.hyyyd.',
    'hyhhydd',
    'yhyyydd',
    'yhyyydd',
    'yyyyydd',
    '.dddd..',
  ],
  soundOn: [
    '..x......',
    '.xx...m..',
    'xxx.m..m.',
    'xxx..m.m.',
    'xxx.m..m.',
    '.xx...m..',
    '..x......',
  ],
  soundOff: [
    '..x......',
    '.xx......',
    'xxx.r..r.',
    'xxx..rr..',
    'xxx..rr..',
    '.xx.r..r.',
    '..x......',
  ],
  flameOff: [
    '....g......',
    '...gg......',
    '...ggs..g..',
    '..gggs.gg..',
    '..gglgsggs.',
    '.ggllggggs.',
    '.gllllgggs.',
    '.glllllggs.',
    '..glllggs..',
    '...sssss...',
  ],
  coinOff: [
    '.lgggs.',
    'lglggss',
    'glgggss',
    'glgggss',
    'gggggss',
    '.ssss..',
  ],
} satisfies Record<string, string[]>;

export type IconName = keyof typeof ICONS;

const cache = new Map<string, string>();

/**
 * A grid of characters as a PNG data URL, one image pixel per cell. Cells take their colour from `colors` ('#'
 * cells use `fill`), and every painted cell gets a 1px dark outline. Shown with image-rendering: pixelated at a
 * whole-number size, it scales cleanly, without the hairline seams box-shadow "pixels" get on some screens.
 */
export function gridUrl(rows: string[], colors: Record<string, string> = PALETTE, fill = '#ffffff'): string {
  // The same grid can be drawn in different colours (rarity gems and saucers), so the palette is part of the key.
  const key = `${rows.join('|')}:${fill}:${colors === PALETTE ? '' : JSON.stringify(colors)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const at = (x: number, y: number) => rows[y]?.[x] ?? '.';
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length + 2;
  canvas.height = rows.length + 2;
  const ctx = canvas.getContext('2d')!;
  for (let y = -1; y <= rows.length; y++) {
    for (let x = -1; x <= rows[0].length; x++) {
      const c = at(x, y);
      const outline = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) !== '.');
      const color = c !== '.' ? (c === '#' ? fill : colors[c]) : outline ? OUTLINE : '';
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

const STAT_ICON = { atk: 'medal', hp: 'heart', crust: 'shield', burn: 'flame', rot: 'rotBlob', chill: 'snowflake' } as const;

/**
 * A stat as a pixel badge with its number on top: attack on an orange medallion, HP in a heart, Crust on a
 * shield; statuses on a flame (Burn), a mould blob (Rot) and a snowflake (Chill). `attrs` carries animation keys; `cls` adds states (boosted, hurt).
 */
export function statBadge(stat: keyof typeof STAT_ICON, value: number, scale = 1, attrs = '', cls = ''): string {
  return `<span class="stat-badge sb-${stat} ${cls}" ${attrs}>${pix(STAT_ICON[stat], scale)}<b>${value}</b></span>`;
}

/**
 * An inline pixel icon. `scale` is pixels per cell: 1 on the kitchen and battle stages (which are already scaled
 * up), 2-3 on screens drawn at the page's own size.
 */
export function pix(name: IconName, scale = 1, cls = ''): string {
  const rows = ICONS[name];
  const w = (rows[0].length + 2) * scale;
  const h = (rows.length + 2) * scale;
  return `<img class="pix ${cls}" src="${gridUrl(rows)}" style="width:${w}px;height:${h}px" alt="" draggable="false">`;
}

/**
 * Which enemy slots an attack pattern hits, as [far, middle, near] lanes of [front, back], for a food attacking
 * from the middle lane. 'r' takes full damage, 'o' takes part of it, '.' is untouched.
 */
const PATTERN_MAPS: Record<string, [string, string, string]> = {
  single: ['..', 'r.', '..'],
  pierce: ['..', 'ro', '..'],
  splash: ['o.', 'r.', 'o.'],
  fork: ['r.', '..', 'r.'],
  snipe: ['..', '.r', '..'],
  escalate: ['oo', 'ro', 'oo'],
};

/**
 * A tiny map of the enemy plate with the slots this attack pattern hits lit up (red: full damage, orange: part).
 * Enemy front column on the left, as the enemy faces you. Untouched slots are dark.
 */
export function patternIcon(pattern: string, scale = 1): string {
  const map = PATTERN_MAPS[pattern] ?? PATTERN_MAPS.single;
  const cell = (c: string) => (c === 'r' ? 'r' : c === 'o' ? 'O' : 'B');
  const rows: string[] = [];
  map.forEach((lane, i) => {
    const line = `${cell(lane[0]).repeat(2)}.${cell(lane[1]).repeat(2)}`;
    rows.push(line, line);
    if (i < 2) rows.push('.....');
  });
  const w = (rows[0].length + 2) * scale;
  const h = (rows.length + 2) * scale;
  return `<img class="pix pattern" src="${gridUrl(rows)}" style="width:${w}px;height:${h}px" alt="" draggable="false">`;
}

/** Rarity colours: h highlight, a body, b shade, d deep shade. */
const RARITY_COLORS: Record<string, Record<string, string>> = {
  common: { h: '#ffffff', a: '#d6d0c2', b: '#b2ab9c', d: '#857e70' },
  rare: { h: '#d8ecff', a: '#5aa0f0', b: '#3a78d0', d: '#24509a' },
  epic: { h: '#f2dcff', a: '#b47ce8', b: '#8a52d0', d: '#5e3296' },
  legendary: { h: '#fff6c8', a: '#f6cc4a', b: '#dca030', d: '#a8701c' },
  mythic: { h: '#ffffff', a: '#ff8ad0', b: '#e0446a', d: '#9a2a6a' },
};

/** A cut gem in the rarity's colour (mythic ones cycle colours, see .rarity-mythic in style.css). */
export function gemIcon(rarity: string, scale = 1): string {
  const rows = ['..h..', '.hab.', 'habbd', '.abd.', '..d..'];
  const url = gridUrl(rows, RARITY_COLORS[rarity] ?? RARITY_COLORS.common);
  return `<img class="pix gem-ico rarity-${rarity}" src="${url}" style="width:${7 * scale}px;height:${7 * scale}px" alt="" draggable="false">`;
}

