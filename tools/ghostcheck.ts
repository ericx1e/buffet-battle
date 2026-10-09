// Plain bot vs handicapped bot opponent, by day: how often the opponent wins. Usage: npx tsx tools/ghostcheck.ts [n]
import { simulateBattle } from '../src/sim/battle';
import { generateGhost } from '../src/sim/bot';

const N = Number(process.argv[2] ?? 150);
const out: string[] = [];
for (let turn = 1; turn <= 14; turn++) {
  let g = 0;
  for (let i = 0; i < N; i++) {
    const me = generateGhost(turn, 5000 + i, true);
    const ghost = generateGhost(turn, 9000 + i * 7);
    const r = simulateBattle(me, ghost, i);
    if (r.outcome === 'loss') g++;
    else if (r.outcome === 'draw') g += 0.5;
  }
  out.push(`d${turn} ${Math.round((100 * g) / N)}%`);
}
console.log('opponent win rate vs a plain bot:', out.join(' · '));
