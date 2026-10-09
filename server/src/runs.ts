// Runs: one active run per player, stored as the run's state at the start of its current day.
import { type RunState, migrateRun, newRun } from '../../src/sim/run';
import { GAME_VERSION } from '../../src/sim/version';
import { randomId } from './auth';
import { HttpError } from './http';

export type RunStatus = 'active' | 'won' | 'lost' | 'abandoned';

interface RunRow {
  id: string;
  player_id: string;
  version: string;
  seed: number;
  day: number;
  wins: number;
  lives: number;
  status: RunStatus;
  state: string;
}

/** What the client gets: the run's record and its state this morning. */
export interface RunView {
  id: string;
  version: string;
  day: number;
  wins: number;
  lives: number;
  status: RunStatus;
  state: RunState;
}

const view = (row: RunRow, state: RunState): RunView => ({ id: row.id, version: row.version, day: row.day, wins: row.wins, lives: row.lives, status: row.status, state });

/** The state as stored: without the growth log, which is only for the client's animations. */
const stored = (state: RunState) => JSON.stringify({ ...state, growth: [] });

export async function activeRun(env: Env, playerId: string): Promise<RunView | null> {
  const row = await env.DB.prepare("SELECT * FROM runs WHERE player_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").bind(playerId).first<RunRow>();
  if (!row) return null;
  const state = JSON.parse(row.state) as RunState;
  if (row.version === GAME_VERSION) return view(row, state);
  // The rules changed since this morning: the run carries on under the new ones.
  const migrated = migrateRun(state);
  await env.DB.prepare('UPDATE runs SET version = ?, state = ?, updated_at = ? WHERE id = ?').bind(GAME_VERSION, stored(migrated), Date.now(), row.id).run();
  return view({ ...row, version: GAME_VERSION }, migrated);
}

/** A new run for the player; any run they had going is abandoned. */
export async function startRun(env: Env, playerId: string): Promise<RunView> {
  const now = Date.now();
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const state = newRun(seed);
  const row: RunRow = { id: randomId(), player_id: playerId, version: GAME_VERSION, seed, day: state.turn, wins: state.courses, lives: state.lives, status: 'active', state: stored(state) };
  await env.DB.batch([
    env.DB.prepare("UPDATE runs SET status = 'abandoned', updated_at = ? WHERE player_id = ? AND status = 'active'").bind(now, playerId),
    env.DB.prepare('INSERT INTO runs (id, player_id, version, seed, day, wins, lives, status, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(
      row.id, row.player_id, row.version, row.seed, row.day, row.wins, row.lives, row.status, row.state, now, now,
    ),
  ]);
  return view(row, { ...state, growth: [] });
}

export async function abandonRun(env: Env, playerId: string, runId: string): Promise<void> {
  const result = await env.DB.prepare("UPDATE runs SET status = 'abandoned', updated_at = ? WHERE id = ? AND player_id = ? AND status = 'active'").bind(Date.now(), runId, playerId).run();
  if (result.meta.changes === 0) throw new HttpError(404, 'No such run in progress.');
}
