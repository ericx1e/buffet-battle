// How much each food's cooked bonus is worth: the same late-game plates with that food cooked (level 3), with and
// without its bonus, against the same opponents. Usage: npx tsx tools/cooked-check.ts [plates]
import { simulateBattle } from '../src/sim/battle';
import { generateGhost } from '../src/sim/bot';
import { UNITS, rarityOf } from '../src/sim/data';
import type { Plate } from '../src/sim/types';

const N = Number(process.argv[2] ?? 300);
const TURN = 12;
const rate = (def: (typeof UNITS)[number]) => {
  let wins = 0;
  for (let i = 0; i < N; i++) {
    const mine: Plate = generateGhost(TURN, 5000 + i);
    // The food, cooked, in the middle of the front row (its level 3 stats: base + 2 per merge step).
    mine[1] = { uid: 999, defId: def.id, copies: 6, attack: def.attack + 4, hp: def.hp + 4 };
    const theirs = generateGhost(TURN, 9000 + i);
    const { outcome } = simulateBattle(mine, theirs, 77 + i);
    wins += outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
  }
  return wins / N;
};

const rows: [string, number, string, number][] = [];
for (const def of UNITS.filter((u) => !u.token && u.cooked)) {
  const withBonus = rate(def);
  const cooked = def.cooked;
  def.cooked = undefined;
  const without = rate(def);
  def.cooked = cooked;
  if (process.env.SHOW) console.log(def.name, (100 * without).toFixed(0) + '% -> ' + (100 * withBonus).toFixed(0) + '%');
  rows.push([def.name, def.tier, rarityOf(def), withBonus - without]);
}
rows.sort((a, b) => a[1] - b[1] || b[3] - a[3]);
let tier = 0;
for (const [name, t, rarity, d] of rows) {
  if (t !== tier) console.log(`-- tier ${(tier = t)}`);
  console.log(`${name.padEnd(20)} ${rarity.padEnd(9)} ${d >= 0 ? '+' : ''}${(100 * d).toFixed(1)} pts win rate`);
}
const avg = (t: number) => rows.filter((r) => r[1] === t).reduce((a, r) => a + r[3], 0) / rows.filter((r) => r[1] === t).length;
console.log('\naverage by tier:', [1, 2, 3, 4, 5, 6].map((t) => `T${t} +${(100 * avg(t)).toFixed(1)}`).join('  '));
