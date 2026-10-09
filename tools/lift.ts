// Battle lift: how much each food changes the fights it is in, by stage of the run. Usage: npx tsx tools/lift.ts [runs]
//
// Win rate alone credits a food with the plate around it and the day it shows up on (a rarity-6 food only ever
// fights on strong late plates). Here every battle is replayed with one food swapped for a plain stand-in: an
// average body of the same rarity, same flavors and item, no ability. Same plate, same opponent, same seed. The lift
// is the food's score minus the stand-in's (win 1, draw 0.5, loss 0), in points.
//
// What it measures: the food's ability and body in a fight. What it keeps: growth the food already banked in the
// kitchen (its own stats over its base body) and anything it gave its friends, so kitchen scalers read low here;
// judge them by their growth (DESIGN.md, Growth budget).
import { type Outcome, simulateBattle } from '../src/sim/battle';
import { botPrep, generateGhost } from '../src/sim/bot';
import { MARKET_UNITS, flavorsOf, registerUnit, unitDef } from '../src/sim/data';
import { finishBattle, isOver, newRun, nextSeed, serve } from '../src/sim/run';
import type { Plate, Tier } from '../src/sim/types';

const runs = Number(process.argv[2] ?? 300);
const STAGES = [
  { name: 'early 1-4', from: 1, to: 4 },
  { name: 'mid 5-8', from: 5, to: 8 },
  { name: 'late 9+', from: 9, to: 99 },
];
const stageOf = (day: number) => STAGES.findIndex((s) => day >= s.from && day <= s.to);

// One stand-in per rarity: the average market body of that tier, with no ability.
for (const tier of [1, 2, 3, 4, 5, 6] as Tier[]) {
  const pool = MARKET_UNITS.filter((u) => u.tier === tier);
  const avg = (k: 'attack' | 'hp') => Math.round(pool.reduce((n, u) => n + u[k], 0) / pool.length);
  registerUnit({ id: `standIn${tier}`, name: `Stand-in ${tier}`, cookedName: `Stand-in ${tier}`, emoji: '?', tier, flavor: 'savory', attack: avg('attack'), hp: avg('hp'), values: [0, 0, 0], abilities: [], text: '' });
}

const score = (o: Outcome) => (o === 'win' ? 1 : o === 'draw' ? 0.5 : 0);
/** Per food, per stage: battles and the summed lift. */
const lift = new Map<string, { n: number[]; sum: number[] }>(MARKET_UNITS.map((u) => [u.id, { n: [0, 0, 0], sum: [0, 0, 0] }]));

/** The plate with every copy of `defId` swapped for its rarity's stand-in (keeping banked growth, flavors and item). */
function swapped(plate: Plate, defId: string): Plate {
  const def = unitDef(defId);
  const standIn = unitDef(`standIn${def.tier}`);
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

for (let i = 0; i < runs; i++) {
  const run = newRun(1000 + i);
  while (!isOver(run)) {
    botPrep(run);
    const mine = serve(run);
    const ghost = generateGhost(run.turn, nextSeed(run), true);
    const seed = nextSeed(run);
    const { outcome } = simulateBattle(mine, ghost, seed);
    const stage = stageOf(run.turn);
    for (const defId of new Set(mine.filter((u) => u).map((u) => u!.defId))) {
      const s = lift.get(defId);
      if (!s) continue;
      const without = simulateBattle(swapped(mine, defId), ghost, seed).outcome;
      s.n[stage]++;
      s.sum[stage] += score(outcome) - score(without);
    }
    finishBattle(run, outcome);
  }
}

const fmt = (sum: number, n: number) => (n < 30 ? '    -' : `${sum / n >= 0 ? '+' : ''}${((100 * sum) / n).toFixed(1)}`.padStart(5));
const overall = (s: { n: number[]; sum: number[] }) => s.sum.reduce((a, b) => a + b, 0) / Math.max(1, s.n.reduce((a, b) => a + b, 0));
console.log(`${runs} runs. Lift: points of win rate the food adds over a plain body of its rarity, same fight. "-": under 30 battles.\n`);
console.log(`Food               Tier  ${STAGES.map((s) => s.name.padStart(10)).join('')}   overall  battles`);
for (const [id, s] of [...lift].sort((a, b) => overall(b[1]) - overall(a[1]))) {
  const n = s.n.reduce((a, b) => a + b, 0);
  if (n === 0) continue;
  const def = unitDef(id);
  console.log(`${def.name.padEnd(18)} ${String(def.tier).padStart(4)}  ${s.n.map((k, j) => fmt(s.sum[j], k).padStart(10)).join('')}   ${fmt(overall(s) * n, n).padStart(7)}  ${String(n).padStart(7)}`);
}
