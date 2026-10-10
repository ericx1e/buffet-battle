import { type Action, applyAction } from './actions';
import { flavorTier } from './battle';
import { flavorTally, partnersOf, unitDef } from './data';
import { Rng } from './rng';
import { type Loc, type RunState, INTEREST_STEP, advanceTurn, interestCap, rerollCost, getUnit, newRun, offerCost, sellPrice, serve } from './run';
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
 * What a food is worth to this plate: its tier, plus what it adds to the plate's flavors (most for reaching the next
 * flavor bonus, some for leaning into a flavor already there) and the partners it has on the plate. So a bot builds
 * toward a flavor and a pairing instead of buying the highest tier it sees.
 */
function fit(defId: string, plate: Plate): number {
  const def = unitDef(defId);
  const others = plate.filter((u): u is UnitInstance => !!u && u.defId !== defId);
  const tally = flavorTally(others);
  let v = def.tier * 6;
  for (const f of [def.flavor, def.flavor2]) {
    if (!f) continue;
    const n = tally.get(f) ?? 0;
    v += (flavorTier(n + 1) - flavorTier(n)) * 9 + n * 2;
  }
  const partners = partnersOf(defId);
  v += others.filter((u) => partners.includes(u.defId)).length * 6;
  return v;
}

/** What a food on the plate is worth keeping: its fit, plus its level and the stats it has grown. */
const worth = (u: UnitInstance, plate: Plate) => fit(u.defId, plate.map((o) => (o === u ? null : o))) + (levelOf(u.copies) - 1) * 14 + (u.attack + u.hp) / 4;

/**
 * Plays one Prep phase with simple heuristics: merge, buy what fits the plate best (its flavors and pairings), replace
 * what fits worst, spend leftovers on items. Every change goes through an action, as a player's would; the ones that worked are appended to `log`.
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

/** How much better an offer must fit than the food it replaces. */
const REPLACE_MARGIN = 10;

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

    // 2. Fill an empty slot with the offer that fits the plate best.
    const best = unitOffers
      .filter((x) => offerCost(x.o) <= run.gold)
      .map((x) => ({ ...x, v: fit(x.o.defId, run.plate) }))
      .sort((a, b) => b.v - a.v)[0];
    const empty = plateLocs.find((l) => !getUnit(run, l));
    if (best && empty && act({ t: 'buy', src: { area: 'market', index: best.index }, to: empty })) return true;

    // 3. Plate full: replace the food worth least if an offer would fit clearly better in its place.
    if (!empty) {
      const weakest = plateLocs
        .map((l) => ({ l, u: getUnit(run, l)! }))
        .map((x) => ({ ...x, w: worth(x.u, run.plate) }))
        .sort((a, b) => a.w - b.w)[0];
      const without = run.plate.map((u) => (u === weakest.u ? null : u));
      const swap = unitOffers
        .filter((x) => offerCost(x.o) <= run.gold + sellPrice(weakest.u))
        .map((x) => ({ ...x, v: fit(x.o.defId, without) }))
        .sort((a, b) => b.v - a.v)[0];
      if (swap && swap.v > weakest.w + REPLACE_MARGIN) {
        act({ t: 'sell', at: weakest.l });
        if (act({ t: 'buy', src: { area: 'market', index: swap.index }, to: weakest.l })) return true;
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
 * it gets less early and more late. Tuned with tools/bot-bench.ts against players' real plates: about 55% of battles
 * won overall, 60-70% from day 4 on.
 */
export function ghostGold(turn: number): number {
  return GHOST_GOLD[Math.min(turn, GHOST_GOLD.length) - 1];
}
const GHOST_GOLD = [-3, -1, 0, 1, 3, 4, 5, 6, 7, 8, 8, 9, 9];

/**
 * The last day a bot plays out. Past it (endless runs) its foods' attack and HP compound by ENDLESS_RATE a day: slower
 * than a strong player's plate grows at first (about 25-50 stats a day against the bot's ~20), but exponential, so it
 * overtakes any plate and every endless run ends (around day 25 for an average plate, 35-40 for a strong one).
 */
const BOT_LAST_DAY = 15;
const ENDLESS_RATE = 1.1;

/**
 * A bot's plate as served on `turn`, played from a fresh run with `seed`. `fair`: no handicap (bot-vs-bot balance
 * reports).
 */
export function generateGhost(turn: number, seed: number, fair = false): Plate {
  // Endless days: the plate from BOT_LAST_DAY, grown for every day past it (playing out every day would cost the
  // server too much time).
  if (turn > BOT_LAST_DAY) {
    const grow = ENDLESS_RATE ** Math.min(turn - BOT_LAST_DAY, 200);
    return generateGhost(BOT_LAST_DAY, seed, fair).map((u) => u && { ...u, attack: Math.round(u.attack * grow), hp: Math.round(u.hp * grow) });
  }
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
