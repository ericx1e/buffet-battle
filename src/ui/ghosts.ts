// Local stand-in for the async server: every served plate is saved as a ghost, and later runs
// can be matched against ghosts from the same turn. Falls back to bot plates.
import { generateGhost } from '../sim/bot';
import { isUnit } from '../sim/data';
import { Rng } from '../sim/rng';
import type { Plate } from '../sim/types';

const KEY = 'buffetbattle.ghosts';
const MAX_GHOSTS = 300;

interface Ghost {
  runId: string;
  turn: number;
  plate: Plate;
  /** The run's courses won and lives left when it was saved (older ghosts lack them). */
  wins?: number;
  lives?: number;
}

/** An opponent: its plate, name, and its run so far (wins and lives), matched to yours. */
export interface Opponent {
  plate: Plate;
  label: string;
  wins: number;
  lives: number;
}

function load(): Ghost[] {
  try {
    // Plates holding a food that has since been removed from the game are skipped.
    return (JSON.parse(localStorage.getItem(KEY) ?? '[]') as Ghost[]).filter((g) => g.plate.every((u) => !u || isUnit(u.defId)));
  } catch {
    return [];
  }
}

export function saveGhost(runId: string, turn: number, plate: Plate, wins: number, lives: number) {
  if (plate.every((u) => !u)) return;
  try {
    const ghosts = load();
    ghosts.push({ runId, turn, plate, wins, lives });
    localStorage.setItem(KEY, JSON.stringify(ghosts.slice(-MAX_GHOSTS)));
  } catch {
    // Storage unavailable: the game still works against bots.
  }
}

/**
 * An opponent for this day, as close to your run as possible: a past run's ghost from the same day with the
 * nearest wins and lives, or a bot given a record next to yours.
 */
export function pickOpponent(runId: string, turn: number, seed: number, wins: number, lives: number): Opponent {
  const rng = new Rng(seed);
  const past = load().filter((g) => g.turn === turn && g.runId !== runId);
  if (past.length > 0 && rng.next() < 0.5) {
    const gap = (g: Ghost) => Math.abs((g.wins ?? wins) - wins) + Math.abs((g.lives ?? lives) - lives);
    const best = Math.min(...past.map(gap));
    const g = rng.pick(past.filter((p) => gap(p) === best));
    return { plate: g.plate, label: 'Ghost of a past run', wins: g.wins ?? wins, lives: g.lives ?? lives };
  }
  const near = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n + rng.int(3) - 1));
  return { plate: generateGhost(turn, seed), label: `Bot Chef #${seed % 1000}`, wins: near(wins, 0, turn - 1), lives: near(lives, 1, 5) };
}
