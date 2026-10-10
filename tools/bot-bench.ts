// How hard the bots are: players' real plates (a file of battles from /admin/battles) fought again, under today's
// rules, against fresh bots for the same day. Usage: npx tsx tools/bot-bench.ts battles.json [bots per plate]
import { readFileSync } from 'node:fs';
import { simulateBattle } from '../src/sim/battle';
import { generateGhost } from '../src/sim/bot';
import { isUnit } from '../src/sim/data';
import type { Plate } from '../src/sim/types';

const battles = (JSON.parse(readFileSync(process.argv[2], 'utf8')) as { day: number; mine: Plate }[]).filter((b) =>
  b.mine.every((u) => !u || isUnit(u.defId)),
);
const per = Number(process.argv[3] ?? 20);
const buckets = [[1, 3], [4, 6], [7, 9], [10, 12], [13, 99]];
const tally = buckets.map(() => ({ n: 0, w: 0, d: 0 }));
let seed = 1;
for (const b of battles) {
  const t = tally[buckets.findIndex(([lo, hi]) => b.day >= lo && b.day <= hi)];
  for (let i = 0; i < per; i++) {
    const s = seed++ * 7919;
    const { outcome } = simulateBattle(b.mine, generateGhost(b.day, s), s);
    t.n++;
    if (outcome === 'win') t.w++;
    if (outcome === 'draw') t.d++;
  }
}
console.log(`${battles.length} player plates x ${per} bots: player win rate by day`);
buckets.forEach(([lo, hi], i) => {
  const { n, w, d } = tally[i];
  if (n) console.log(`  days ${lo}-${hi === 99 ? '+' : hi}`.padEnd(14), `${((100 * w) / n).toFixed(0).padStart(3)}% won, ${((100 * d) / n).toFixed(0)}% drawn  (${n})`);
});
const all = tally.reduce((a, t) => ({ n: a.n + t.n, w: a.w + t.w }), { n: 0, w: 0 });
console.log(`  overall       ${((100 * all.w) / all.n).toFixed(0)}%`);
