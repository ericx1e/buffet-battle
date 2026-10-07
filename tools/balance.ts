// Bot-vs-bot balance report. Usage: npm run balance -- [runs]
import { simulateBattle } from '../src/sim/battle';
import { botPrep, generateGhost } from '../src/sim/bot';
import { MARKET_UNITS, flavorsOf, unitDef } from '../src/sim/data';
import { COURSES_TO_WIN, finishBattle, isOver, newRun, nextSeed, serve } from '../src/sim/run';
import { FLAVORS, type Flavor } from '../src/sim/types';

const runs = Number(process.argv[2] ?? 300);
const unitStats = new Map<string, { battles: number; wins: number }>(MARKET_UNITS.map((u) => [u.id, { battles: 0, wins: 0 }]));
const flavorWins = new Map<Flavor, number>(FLAVORS.map((f) => [f, 0]));
let battles = 0;
let draws = 0;
let runWins = 0;
let totalTurns = 0;
let totalRounds = 0;

for (let i = 0; i < runs; i++) {
  const run = newRun(1000 + i);
  while (!isOver(run)) {
    botPrep(run);
    const mine = serve(run);
    const ghost = generateGhost(run.turn, nextSeed(run));
    const { outcome, frames } = simulateBattle(mine, ghost, nextSeed(run));
    battles++;
    totalRounds += frames[frames.length - 1].round;
    if (outcome === 'draw') draws++;
    for (const defId of new Set(mine.filter((u) => u).map((u) => u!.defId))) {
      const s = unitStats.get(defId)!;
      s.battles++;
      if (outcome === 'win') s.wins++;
    }
    if (outcome === 'win') {
      // Foods that count as several flavors count toward each (Saffron toward all five).
      for (const u of mine) if (u) for (const f of unitDef(u.defId).allFlavors ? FLAVORS : flavorsOf(u)) flavorWins.set(f, flavorWins.get(f)! + 1);
    }
    finishBattle(run, outcome);
  }
  totalTurns += run.turn - 1;
  if (run.courses >= COURSES_TO_WIN) runWins++;
}

const pct = (n: number, d: number) => (d === 0 ? '  -  ' : `${((100 * n) / d).toFixed(1).padStart(5)}%`);
console.log(`${runs} runs, ${battles} battles, ${pct(draws, battles)} draws, ${pct(runWins, runs)} runs won, ${(totalTurns / runs).toFixed(1)} turns per run, ${(totalRounds / battles).toFixed(1)} rounds per battle\n`);
console.log('Unit               Tier  Battles  Win rate (flag: >60% or <40%)');
const rows = [...unitStats.entries()].sort((a, b) => b[1].wins / (b[1].battles || 1) - a[1].wins / (a[1].battles || 1));
for (const [id, s] of rows) {
  const def = unitDef(id);
  const rate = s.wins / (s.battles || 1);
  const flag = s.battles > 0 && (rate > 0.6 || rate < 0.4) ? '  <--' : '';
  console.log(`${def.name.padEnd(18)} ${String(def.tier).padStart(4)}  ${String(s.battles).padStart(7)}  ${pct(s.wins, s.battles)}${flag}`);
}
const totalFlavor = [...flavorWins.values()].reduce((a, b) => a + b, 0);
console.log('\nShare of units on winning plates (target 15-25% each):');
for (const f of FLAVORS) console.log(`  ${f.padEnd(7)} ${pct(flavorWins.get(f)!, totalFlavor)}`);
