// Battle lift: how much each food changes the fights it is in, by stage of the run, over bot runs.
// Usage: npx tsx tools/lift.ts [runs]
//
// Win rate alone credits a food with the plate around it and the day it shows up on (a rarity-6 food only ever
// fights on strong late plates). Here every battle is replayed with one food swapped for a plain stand-in
// (src/analysis/lift.ts). What it measures: the food's ability and body in a fight. What it keeps: growth the food
// already banked in the kitchen and anything it gave its friends, so kitchen scalers read low here; judge them by
// their growth (DESIGN.md, Growth budget). The dev site runs the same test on real battles.
import { STAGES, battleLift, stageOf } from '../src/analysis/lift';
import { simulateBattle } from '../src/sim/battle';
import { botPrep, generateGhost } from '../src/sim/bot';
import { MARKET_UNITS, unitDef } from '../src/sim/data';
import { finishBattle, isOver, newRun, nextSeed, serve } from '../src/sim/run';

const runs = Number(process.argv[2] ?? 300);
/** Per food, per stage: battles and the summed lift. */
const lift = new Map<string, { n: number[]; sum: number[] }>(MARKET_UNITS.map((u) => [u.id, { n: [0, 0, 0], sum: [0, 0, 0] }]));

for (let i = 0; i < runs; i++) {
  const run = newRun(1000 + i);
  while (!isOver(run)) {
    botPrep(run);
    const mine = serve(run);
    const ghost = generateGhost(run.turn, nextSeed(run), true);
    const seed = nextSeed(run);
    const { outcome } = simulateBattle(mine, ghost, seed);
    const stage = stageOf(run.turn);
    for (const { defId, lift: l } of battleLift(mine, ghost, seed, outcome)) {
      const s = lift.get(defId)!;
      s.n[stage]++;
      s.sum[stage] += l;
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
