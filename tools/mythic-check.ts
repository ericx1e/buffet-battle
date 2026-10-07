// How strong each mythic is, and how much its spot matters: late-game plates with one food swapped for the mythic in
// each plate slot, against the same opponents. Legendaries are shown for comparison.
// Usage: npx tsx tools/mythic-check.ts [plates]
import { simulateBattle } from '../src/sim/battle';
import { generateGhost } from '../src/sim/bot';
import { UNITS, flavorsOf, rarityOf } from '../src/sim/data';
import type { Flavor, Plate } from '../src/sim/types';

const N = Number(process.argv[2] ?? 300);
const TURN = 12;
const SLOT = ['front far', 'front mid', 'front near', 'back far', 'back mid', 'back near'];

/** Plates to test with: random late-game plates, or only ones with 3+ foods of the given flavors (on theme). */
function plates(theme?: Flavor[]): Plate[] {
  const out: Plate[] = [];
  for (let seed = 5000; out.length < N && seed < 5000 + N * 40; seed++) {
    const p = generateGhost(TURN, seed);
    if (!theme || p.filter((u) => u && flavorsOf(u).some((f) => theme.includes(f))).length >= 3) out.push(p);
  }
  return out;
}
const THEME: Record<string, Flavor[]> = { blackGarlic: ['spicy', 'sour'], wagyu: ['salty', 'sweet'] };

function rate(defId: string | null, slot: number, theme?: Flavor[]): number {
  let wins = 0;
  const ps = plates(theme);
  for (let i = 0; i < ps.length; i++) {
    const mine: Plate = ps[i].map((u) => (u ? { ...u } : null));
    if (defId) {
      const def = UNITS.find((u) => u.id === defId)!;
      mine[slot] = { uid: 999, defId, copies: 1, attack: def.attack + 2, hp: def.hp + 2 };
    }
    const { outcome } = simulateBattle(mine, generateGhost(TURN, 9000 + i), 77 + i);
    wins += outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
  }
  return wins / ps.length;
}

const pct = (x: number) => `${(100 * x).toFixed(0).padStart(3)}%`;
console.log(`baseline (no swap): ${pct(rate(null, 0))}\n`);
console.log(`${'food'.padEnd(16)} ${SLOT.map((s) => s.padStart(10)).join(' ')}   best`);
for (const def of UNITS.filter((u) => !u.token && (rarityOf(u) === 'mythic' || rarityOf(u) === 'legendary'))) {
  const rates = SLOT.map((_, slot) => rate(def.id, slot));
  const best = Math.max(...rates);
  const theme = THEME[def.id];
  const onTheme = theme ? `   on theme (${theme.join('/')}): best ${pct(Math.max(...SLOT.map((_, slot) => rate(def.id, slot, theme))))} vs ${pct(rate(null, 0, theme))} without` : '';
  console.log(`${(rarityOf(def) === 'mythic' ? '* ' : '  ') + def.name.padEnd(14)} ${rates.map((r) => pct(r).padStart(10)).join(' ')}   ${pct(best)}${onTheme}`);
}
