// The day's action log. Every change a player makes in the kitchen is one of these actions, applied through the
// matching run.ts function. The client keeps the day's log; at Serve the server replays it on the state it stored
// for the morning, so a plate can only be what the rules allow (DESIGN.md, "Async multiplayer and the backend").
import {
  type ActionResult,
  type Loc,
  type OfferSource,
  type RunState,
  buySpecial,
  buyUnit,
  freezeOffer,
  thawOffer,
  moveUnit,
  pickPack,
  skipPack,
  reroll,
  sellUnit,
  serve,
  serveBlocker,
  useItem,
} from './run';
import type { Flavor, Plate } from './types';

export type Action =
  | { t: 'buy'; src: OfferSource; to: Loc }
  | { t: 'move'; from: Loc; to: Loc }
  | { t: 'sell'; at: Loc }
  | { t: 'refill' }
  | { t: 'item'; src: OfferSource; at: Loc; flavor?: Flavor }
  | { t: 'special' }
  | { t: 'pick'; index: number }
  | { t: 'skip' }
  | { t: 'freeze'; from: number; to: number }
  | { t: 'thaw'; index: number };

/** Applies one action to the run. Garbage in (a tampered log) is a failed action, never a crash. */
export function applyAction(run: RunState, a: Action): ActionResult {
  try {
    switch (a.t) {
      case 'buy':
        return buyUnit(run, a.src, a.to);
      case 'move':
        return moveUnit(run, a.from, a.to);
      case 'sell':
        return sellUnit(run, a.at);
      case 'refill':
        return reroll(run);
      case 'item':
        return useItem(run, a.src, a.at, a.flavor);
      case 'special':
        return buySpecial(run);
      case 'pick':
        return pickPack(run, a.index);
      case 'skip':
        return skipPack(run);
      case 'freeze':
        return freezeOffer(run, a.from, a.to);
      case 'thaw':
        return thawOffer(run, a.index);
    }
  } catch {
    // Fall through: an action that throws is refused.
  }
  return { ok: false, error: 'Unknown action.' };
}

export type Replay = { ok: true; run: RunState; plate: Plate } | { ok: false; index: number; error: string };

/**
 * Replays a day: the morning's state, then every action in order (each must succeed), then Serve. Returns the run as
 * it stands after the day ended and the plate that goes into battle. The morning state is not changed.
 */
export function replayDay(morning: RunState, actions: Action[]): Replay {
  const run = structuredClone(morning);
  for (let i = 0; i < actions.length; i++) {
    const result = applyAction(run, actions[i]);
    if (!result.ok) return { ok: false, index: i, error: result.error };
  }
  const blocked = serveBlocker(run);
  if (blocked) return { ok: false, index: actions.length, error: blocked };
  return { ok: true, run, plate: serve(run) };
}

/** JSON with object keys sorted, so equal values always give equal text. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v,
  );
}

/** A short hash of a plate, for the client and the server to check they agree. Not a security measure. */
export function plateHash(plate: Plate): string {
  // cyrb53: a fast 53-bit string hash.
  const s = canonical(plate);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
