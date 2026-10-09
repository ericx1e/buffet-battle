import { type Action, applyAction } from './actions';
import { unitDef } from './data';
import { Rng } from './rng';
import { type Loc, type RunState, INTEREST_STEP, advanceTurn, interestCap, rerollCost, getUnit, newRun, offerCost, serve } from './run';
import { type Plate, PLATE_SIZE, type UnitInstance, isAdjacent, laneOf, levelOf, rowOf, slotAt } from './types';

// Placement hints come from each food's abilities, so newly designed foods get placed sensibly too.
const SUPPORT_TRIGGERS = new Set(['startOfBattle', 'round', 'endTurn', 'sell']);
const NEIGHBOUR_TARGETS = new Set(['adjacentFriends', 'friendAhead', 'friendBehind', 'friendAheadOrSelf', 'aheadElseAdjacent', 'laneFriends']);
/** Foods whose abilities all work from anywhere and don't buff themselves: keep them out of the line of fire. */
const prefersBack = (id: string) => {
  const abilities = unitDef(id).abilities;
  return abilities.length > 0 && abilities.every((a) => SUPPORT_TRIGGERS.has(a.trigger) && ((a.target && a.target !== 'self') || a.effect === 'gold' || a.effect === 'summon'));
};
/** Foods that buff their neighbours or lane partner want company. */
const buffsNeighbours = (id: string) => unitDef(id).abilities.some((a) => a.target && NEIGHBOUR_TARGETS.has(a.target));

const power = (u: UnitInstance) => unitDef(u.defId).tier * 4 + levelOf(u.copies) * 3 + u.attack + u.hp;

/**
 * Plays one Prep phase with simple heuristics: merge, buy the highest tier, upgrade weak units, spend leftovers on
 * items. Every change goes through an action, as a player's would; the ones that worked are appended to `log`.
 */
export function botPrep(run: RunState, log: Action[] = []) {
  const act = (a: Action) => {
    const ok = applyAction(run, a).ok;
    if (ok) log.push(a);
    return ok;
  };
  for (let guard = 0; guard < 40; guard++) {
    if (!botAct(run, act)) break;
  }
  arrange(run, act);
}

function botAct(run: RunState, act: (a: Action) => boolean): boolean {
  const unitOffers = run.market
    .map((o, index) => ({ o, index }))
    .filter((x): x is { o: { kind: 'unit'; defId: string }; index: number } => x.o?.kind === 'unit');
  const plateLocs: Loc[] = [...Array(PLATE_SIZE).keys()].map((index) => ({ area: 'plate', index }));

  const cheapest = Math.min(...unitOffers.map((x) => offerCost(x.o)));
  if (unitOffers.length > 0 && run.gold >= cheapest) {
    // 1. Merge into a copy we already own.
    for (const { o, index } of unitOffers) {
      const loc = plateLocs.find((l) => {
        const u = getUnit(run, l);
        return u && u.defId === o.defId && u.copies < 6;
      });
      if (loc && act({ t: 'buy', src: { area: 'market', index }, to: loc })) return true;
    }

    // 2. Fill an empty slot with the highest-tier offer.
    const best = [...unitOffers].filter((x) => offerCost(x.o) <= run.gold).sort((a, b) => unitDef(b.o.defId).tier - unitDef(a.o.defId).tier)[0];
    const empty = plateLocs.find((l) => !getUnit(run, l));
    if (best && empty && act({ t: 'buy', src: { area: 'market', index: best.index }, to: empty })) return true;

    // 3. Plate full: replace the weakest unit if the offer is a higher tier.
    if (best && !empty) {
      const weakest = plateLocs
        .map((l) => ({ l, u: getUnit(run, l)! }))
        .sort((a, b) => power(a.u) - power(b.u))[0];
      if (unitDef(best.o.defId).tier > unitDef(weakest.u.defId).tier) {
        act({ t: 'sell', at: weakest.l });
        if (act({ t: 'buy', src: { area: 'market', index: best.index }, to: weakest.l })) return true;
      }
    }
  }

  // 4. Items on the strongest unit (seasoning needs a choice and a Takeout Bag's food needs placing, so the bot skips them).
  const owned = plateLocs.filter((l) => getUnit(run, l)).sort((a, b) => power(getUnit(run, b)!) - power(getUnit(run, a)!));
  if (owned.length > 0) {
    for (let index = 0; index < run.market.length; index++) {
      const o = run.market[index];
      if (!o || o.kind !== 'item' || o.itemId === 'seasoning' || o.itemId === 'takeout' || run.gold < offerCost(o)) continue;
      const target = owned.find((l) => !getUnit(run, l)!.item) ?? owned[0];
      if (act({ t: 'item', src: { area: 'market', index }, at: target })) return true;
    }
  }

  // 5. Restock while there is gold to spare, keeping some back for interest once the plate is full.
  const full = plateLocs.every((l) => getUnit(run, l));
  const reserve = full && run.turn >= 3 ? Math.min(interestCap(run), 2) * INTEREST_STEP : 0;
  if (run.gold - rerollCost(run) >= 3 + reserve) return act({ t: 'refill' });
  return false;
}

/**
 * Hill-climbs over slot swaps: attackers in front, ability units in back, neighbours for foods that buff them. Each
 * swap is a move (two copies of one food would merge instead, so those are never swapped).
 */
function arrange(run: RunState, act: (a: Action) => boolean) {
  let best = score(run.plate);
  for (let improved = true; improved; ) {
    improved = false;
    for (let a = 0; a < PLATE_SIZE; a++) {
      for (let b = a + 1; b < PLATE_SIZE; b++) {
        const [ua, ub] = [run.plate[a], run.plate[b]];
        if ((!ua && !ub) || (ua && ub && ua.defId === ub.defId)) continue;
        const next = [...run.plate];
        [next[a], next[b]] = [next[b], next[a]];
        const s = score(next);
        if (s > best && act({ t: 'move', from: { area: 'plate', index: ua ? a : b }, to: { area: 'plate', index: ua ? b : a } })) {
          best = s;
          improved = true;
        }
      }
    }
  }
}


function score(plate: Plate): number {
  let s = 0;
  plate.forEach((u, slot) => {
    if (!u) return;
    const front = rowOf(slot) === 0 || !plate[slotAt(laneOf(slot), 0)];
    if (front) s += u.attack * 2 + u.hp; // the front row trades hits, so it wants attack and HP
    if (!front && prefersBack(u.defId)) s += 4;
    if (buffsNeighbours(u.defId)) s += plate.filter((o, i) => o && isAdjacent(i, slot)).length * 2;
  });
  for (let lane = 0; lane < 3; lane++) if (plate[lane] || plate[lane + 3]) s += 6;
  return s;
}

/**
 * Gold a bot opponent gets on top of a normal day. A bot spends everything and never plans, so on its own it is too
 * strong early (a player might be saving) and too weak late (a player's plate has grown and found its synergies):
 * it gets less early and more late.
 */
export function ghostGold(turn: number): number {
  return GHOST_GOLD[Math.min(turn, GHOST_GOLD.length) - 1];
}
const GHOST_GOLD = [-3, -1, 0, 0, 0, 1, 2, 2, 3, 3, 4, 4, 5];

/**
 * A bot's plate as served on `turn`, played from a fresh run with `seed`. `fair`: no handicap (bot-vs-bot balance
 * reports).
 */
export function generateGhost(turn: number, seed: number, fair = false): Plate {
  const run = newRun(seed);
  let plate: Plate = [];
  for (let t = 1; t <= turn; t++) {
    if (!fair) run.gold = Math.max(0, run.gold + ghostGold(t));
    botPrep(run);
    plate = serve(run);
    if (t < turn) advanceTurn(run);
  }
  return plate;
}

/** An opponent for a battle: its plate, name and record. */
export interface Opponent {
  plate: Plate;
  label: string;
  wins: number;
  lives: number;
  bot?: true;
}

/** A bot opponent for `turn` from `seed`, given a record next to yours (`wins`, `lives`). */
export function botOpponent(turn: number, seed: number, wins: number, lives: number): Opponent {
  const rng = new Rng(seed ^ 0x5bd1e995);
  const near = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n + rng.int(3) - 1));
  return { plate: generateGhost(turn, seed), label: `Bot Chef #${seed % 1000}`, wins: near(wins, 0, turn - 1), lives: near(lives, 1, 5), bot: true };
}
