// Checks a day's actions from the client have exactly the expected shape, before the sim sees them.
import type { Action } from '../../src/sim/actions';
import type { Loc, OfferSource } from '../../src/sim/run';
import { FLAVORS, type Flavor } from '../../src/sim/types';
import { HttpError } from './http';

export const MAX_ACTIONS = 500;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const isIndex = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 32;
/** Exactly these keys (optional ones may be missing). */
const keys = (o: Obj, required: string[], optional: string[] = []) =>
  required.every((k) => k in o) && Object.keys(o).every((k) => required.includes(k) || optional.includes(k));

function loc(x: unknown): Loc | null {
  if (!isObj(x) || !keys(x, ['area', 'index']) || !isIndex(x.index)) return null;
  return x.area === 'plate' || x.area === 'fridge' || x.area === 'overflow' ? { area: x.area, index: x.index } : null;
}

function source(x: unknown): OfferSource | null {
  if (!isObj(x) || !keys(x, ['area', 'index']) || !isIndex(x.index)) return null;
  if (x.area === 'market' || x.area === 'fridge') return { area: x.area, index: x.index };
  return x.area === 'special' && x.index === 0 ? { area: 'special', index: 0 } : null;
}

export function parseAction(x: unknown): Action | null {
  if (!isObj(x)) return null;
  switch (x.t) {
    case 'buy': {
      const [src, to] = [source(x.src), loc(x.to)];
      return keys(x, ['t', 'src', 'to']) && src && to ? { t: 'buy', src, to } : null;
    }
    case 'move': {
      const [from, to] = [loc(x.from), loc(x.to)];
      return keys(x, ['t', 'from', 'to']) && from && to ? { t: 'move', from, to } : null;
    }
    case 'sell': {
      const at = loc(x.at);
      return keys(x, ['t', 'at']) && at ? { t: 'sell', at } : null;
    }
    case 'refill':
      return keys(x, ['t']) ? { t: 'refill' } : null;
    case 'item': {
      const [src, at] = [source(x.src), loc(x.at)];
      if (!keys(x, ['t', 'src', 'at'], ['flavor']) || !src || !at) return null;
      if (x.flavor === undefined) return { t: 'item', src, at };
      return FLAVORS.includes(x.flavor as Flavor) ? { t: 'item', src, at, flavor: x.flavor as Flavor } : null;
    }
    case 'special':
      return keys(x, ['t']) ? { t: 'special' } : null;
    case 'pick':
      return keys(x, ['t', 'index']) && isIndex(x.index) ? { t: 'pick', index: x.index } : null;
  }
  return null;
}

/** The day's actions, or 400 naming the first bad one. */
export function parseActions(x: unknown): Action[] {
  if (!Array.isArray(x)) throw new HttpError(400, 'actions must be a list.');
  if (x.length > MAX_ACTIONS) throw new HttpError(400, `At most ${MAX_ACTIONS} actions a day.`);
  return x.map((a, i) => {
    const action = parseAction(a);
    if (!action) throw new HttpError(400, `Action ${i} is not a valid action.`);
    return action;
  });
}
