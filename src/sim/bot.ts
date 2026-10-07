import { unitDef } from './data';
import {
  type Loc,
  type RunState,
  INTEREST_STEP,
  advanceTurn,
  interestCap,
  rerollCost,
  buyUnit,
  getUnit,
  newRun,
  offerCost,
  reroll,
  sellUnit,
  serve,
  useItem,
} from './run';
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

/** Plays one Prep phase with simple heuristics: merge, buy the highest tier, upgrade weak units, spend leftovers on items. */
export function botPrep(run: RunState) {
  for (let guard = 0; guard < 40; guard++) {
    if (!botAct(run)) break;
  }
  arrange(run);
}

function botAct(run: RunState): boolean {
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
      if (loc && buyUnit(run, { area: 'market', index }, loc).ok) return true;
    }

    // 2. Fill an empty slot with the highest-tier offer.
    const best = [...unitOffers].filter((x) => offerCost(x.o) <= run.gold).sort((a, b) => unitDef(b.o.defId).tier - unitDef(a.o.defId).tier)[0];
    const empty = plateLocs.find((l) => !getUnit(run, l));
    if (best && empty && buyUnit(run, { area: 'market', index: best.index }, empty).ok) return true;

    // 3. Plate full: replace the weakest unit if the offer is a higher tier.
    if (best && !empty) {
      const weakest = plateLocs
        .map((l) => ({ l, u: getUnit(run, l)! }))
        .sort((a, b) => power(a.u) - power(b.u))[0];
      if (unitDef(best.o.defId).tier > unitDef(weakest.u.defId).tier) {
        sellUnit(run, weakest.l);
        if (buyUnit(run, { area: 'market', index: best.index }, weakest.l).ok) return true;
      }
    }
  }

  // 4. Items on the strongest unit (seasoning needs a choice, so the bot skips it).
  const owned = plateLocs.filter((l) => getUnit(run, l)).sort((a, b) => power(getUnit(run, b)!) - power(getUnit(run, a)!));
  if (owned.length > 0) {
    for (let index = 0; index < run.market.length; index++) {
      const o = run.market[index];
      if (!o || o.kind !== 'item' || o.itemId === 'seasoning' || run.gold < offerCost(o)) continue;
      const target = owned.find((l) => !getUnit(run, l)!.item) ?? owned[0];
      if (useItem(run, { area: 'market', index }, target).ok) return true;
    }
  }

  // 5. Restock while there is gold to spare, keeping some back for interest once the plate is full.
  const full = plateLocs.every((l) => getUnit(run, l));
  const reserve = full && run.turn >= 3 ? Math.min(interestCap(run), 2) * INTEREST_STEP : 0;
  if (run.gold - rerollCost(run) >= 3 + reserve) return reroll(run).ok;
  return false;
}

/** Hill-climbs over slot swaps: attackers in front, ability units in back, neighbours for foods that buff them. */
function arrange(run: RunState) {
  let plate = [...run.plate];
  let best = score(plate);
  for (let improved = true; improved; ) {
    improved = false;
    for (let a = 0; a < PLATE_SIZE; a++) {
      for (let b = a + 1; b < PLATE_SIZE; b++) {
        if (!plate[a] && !plate[b]) continue;
        const next = [...plate];
        [next[a], next[b]] = [next[b], next[a]];
        const s = score(next);
        if (s > best) {
          best = s;
          plate = next;
          improved = true;
        }
      }
    }
  }
  run.plate = plate;
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

/** A bot's plate as served on `turn`, played from a fresh run with `seed`. */
export function generateGhost(turn: number, seed: number): Plate {
  const run = newRun(seed);
  let plate: Plate = [];
  for (let t = 1; t <= turn; t++) {
    botPrep(run);
    plate = serve(run);
    if (t < turn) advanceTurn(run);
  }
  return plate;
}
