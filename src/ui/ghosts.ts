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
}

function load(): Ghost[] {
  try {
    // Plates holding a food that has since been removed from the game are skipped.
    return (JSON.parse(localStorage.getItem(KEY) ?? '[]') as Ghost[]).filter((g) => g.plate.every((u) => !u || isUnit(u.defId)));
  } catch {
    return [];
  }
}

export function saveGhost(runId: string, turn: number, plate: Plate) {
  if (plate.every((u) => !u)) return;
  try {
    const ghosts = load();
    ghosts.push({ runId, turn, plate });
    localStorage.setItem(KEY, JSON.stringify(ghosts.slice(-MAX_GHOSTS)));
  } catch {
    // Storage unavailable: the game still works against bots.
  }
}

export function pickOpponent(runId: string, turn: number, seed: number): { plate: Plate; label: string } {
  const rng = new Rng(seed);
  const past = load().filter((g) => g.turn === turn && g.runId !== runId);
  if (past.length > 0 && rng.next() < 0.5) {
    return { plate: rng.pick(past).plate, label: `Ghost of one of your past runs (day ${turn})` };
  }
  return { plate: generateGhost(turn, seed), label: `Bot Chef #${seed % 1000}` };
}
