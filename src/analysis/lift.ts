// Battle lift: how much a food changes the fights it is in. A battle is replayed with every copy of the food swapped
// for a plain stand-in (an average body of its rarity, same flavors, item and banked growth, no ability): same
// plates otherwise, same opponent, same seed. Lift = the food's score minus the stand-in's (win 1, draw 0.5, loss 0).
// Used by tools/lift.ts (bot runs) and the dev site (real battles).
import { type Outcome, simulateBattle } from '../sim/battle';
import { MARKET_UNITS, flavorsOf, isUnit, registerUnit, unitDef } from '../sim/data';
import type { Plate, Tier } from '../sim/types';

export const STAGES = [
  { name: 'early 1-4', from: 1, to: 4 },
  { name: 'mid 5-8', from: 5, to: 8 },
  { name: 'late 9+', from: 9, to: 99 },
];
export const stageOf = (day: number) => STAGES.findIndex((s) => day >= s.from && day <= s.to);
export const score = (o: Outcome) => (o === 'win' ? 1 : o === 'draw' ? 0.5 : 0);

/** One stand-in per rarity: the average market body of that tier, with no ability. Registered once. */
function registerStandIns() {
  if (isUnit('standIn1')) return;
  for (const tier of [1, 2, 3, 4, 5, 6] as Tier[]) {
    const pool = MARKET_UNITS.filter((u) => u.tier === tier);
    const avg = (k: 'attack' | 'hp') => Math.round(pool.reduce((n, u) => n + u[k], 0) / pool.length);
    registerUnit({ id: `standIn${tier}`, name: `Stand-in ${tier}`, cookedName: `Stand-in ${tier}`, emoji: '?', tier, flavor: 'savory', attack: avg('attack'), hp: avg('hp'), values: [0, 0, 0], abilities: [], text: '' });
  }
}

/** The plate with every copy of `defId` swapped for its rarity's stand-in (keeping banked growth, flavors and item). */
export function swapped(plate: Plate, defId: string): Plate {
  registerStandIns();
  const def = unitDef(defId);
  const standIn = unitDef(`standIn${Math.min(6, def.tier)}`);
  return plate.map((u) => {
    if (!u || u.defId !== defId) return u;
    const [main, ...rest] = flavorsOf(u);
    return {
      ...u,
      defId: standIn.id,
      attack: Math.max(1, u.attack - def.attack + standIn.attack),
      hp: Math.max(1, u.hp - def.hp + standIn.hp),
      flavorOverride: main,
      extraFlavors: rest,
    };
  });
}

/** Each market food on `mine` and its lift in this battle. */
export function battleLift(mine: Plate, theirs: Plate, seed: number, outcome: Outcome): { defId: string; lift: number }[] {
  const ids = new Set(mine.filter((u) => u).map((u) => u!.defId));
  return [...ids]
    .filter((id) => MARKET_UNITS.some((u) => u.id === id))
    .map((defId) => ({ defId, lift: score(outcome) - score(simulateBattle(swapped(mine, defId), theirs, seed).outcome) }));
}
