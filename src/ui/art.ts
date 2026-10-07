// Pixel-art hook: drop PNGs anywhere under /art and they are used for the matching food or item (see art/README.md).
// Anything without a sprite shows a covered dish.
// Files match by id or display name, ignoring case, spaces, dashes and underscores:
// `Cheese.png`, `cheese.png` and `units/cheese.png` all work; cooked art is `<name>_cooked.png`
// or the cooked name itself (`Fondue.png`).
import { ITEMS, UNITS, itemDef, unitDef } from '../sim/data';
import type { ItemId } from '../sim/types';
import { pix } from './icons';

const files = import.meta.glob('../../art/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Normalized file basename → url. */
const byName = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  if (path.includes('/art/scenes/')) continue; // scenes and their props aren't food
  byName.set(norm(path.slice(path.lastIndexOf('/') + 1, -'.png'.length)), url);
}

function find(...names: string[]): string | undefined {
  for (const n of names) {
    const url = byName.get(norm(n));
    if (url) return url;
  }
  return undefined;
}

function unitSprite(defId: string, cooked: boolean): string | undefined {
  const def = unitDef(defId);
  const raw = find(def.id, def.name, def.art ?? '');
  return cooked ? (find(`${def.id}cooked`, `${def.name}cooked`, def.cookedName) ?? raw) : raw;
}

/** Shown where a sprite is missing: a covered dish. */
const MISSING = `<span class="missing">${pix('cloche', 2)}</span>`;

const img = (url: string) => `<img class="sprite" src="${url}" alt="" draggable="false">`;

export function unitArt(defId: string, cooked: boolean): string {
  const url = unitSprite(defId, cooked);
  return url ? img(url) : MISSING;
}

const props = import.meta.glob('../../art/scenes/props/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** A kitchen prop sprite (bell, bin, jars) cut out of the scene by tools/gen-kitchen.mjs. */
export function propArt(name: string): string {
  const url = props[`../../art/scenes/props/${name}.png`];
  return url ? `<img class="sprite prop" src="${url}" alt="" draggable="false">` : '';
}

export function itemArt(id: ItemId): string {
  const def = itemDef(id);
  const url = find(def.id, def.name);
  return url ? img(url) : MISSING;
}

/** Special-cubby offers drawn as their own sprites (art/specials/). */
export const SPECIAL_ART = ['spicePack', 'farmPack', 'premium'] as const;

export function specialArt(kind: string): string {
  const url = find(kind);
  return url ? img(url) : MISSING;
}

if (import.meta.env.DEV) {
  const known = new Set<string>();
  for (const u of UNITS) for (const n of [u.id, u.name, `${u.id}cooked`, `${u.name}cooked`, u.cookedName, u.art ?? '']) known.add(norm(n));
  for (const i of ITEMS) for (const n of [i.id, i.name]) known.add(norm(n));
  for (const n of SPECIAL_ART) known.add(norm(n));
  const unused = Object.keys(files).filter((p) => !p.includes('/art/scenes/') && !known.has(norm(p.slice(p.lastIndexOf('/') + 1, -'.png'.length))));
  if (unused.length > 0) {
    console.warn(`[art] These sprites don't match any food or item, so they aren't used: ${unused.map((p) => p.replace('../../', '')).join(', ')}`);
  }
}
