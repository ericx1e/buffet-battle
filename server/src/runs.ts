// Runs: one active run per player, stored as the run's state at the start of its current day.
import { type RunState, goEndless, migrateRun, newRun } from '../../src/sim/run';
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

/** A stored run as the client sees it. If the rules changed since this morning, it carries on under the new ones. */
async function load(env: Env, row: RunRow): Promise<RunView> {
  const state = JSON.parse(row.state) as RunState;
  if (row.version === GAME_VERSION || row.status !== 'active') return view(row, state);
  const migrated = migrateRun(state);
  await env.DB.prepare('UPDATE runs SET version = ?, state = ?, updated_at = ? WHERE id = ?').bind(GAME_VERSION, stored(migrated), Date.now(), row.id).run();
  return view({ ...row, version: GAME_VERSION }, migrated);
}

export async function activeRun(env: Env, playerId: string): Promise<RunView | null> {
  const row = await env.DB.prepare("SELECT * FROM runs WHERE player_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").bind(playerId).first<RunRow>();
  return row ? load(env, row) : null;
}

/** One of the player's runs by id; 404 when it isn't theirs. */
export async function ownRun(env: Env, playerId: string, runId: string): Promise<RunView> {
  const row = await env.DB.prepare('SELECT * FROM runs WHERE id = ? AND player_id = ?').bind(runId, playerId).first<RunRow>();
  if (!row) throw new HttpError(404, 'No such run.');
  return load(env, row);
}

/** The run's state after a day: its record and status follow from the state. 409 if the day was already served. */
export async function saveDay(env: Env, run: RunView, next: RunState, status: RunStatus): Promise<RunView> {
  const result = await env.DB.prepare("UPDATE runs SET day = ?, wins = ?, lives = ?, status = ?, state = ?, updated_at = ? WHERE id = ? AND day = ? AND status = 'active'")
    .bind(next.turn, next.courses, next.lives, status, stored(next), Date.now(), run.id, run.day)
    .run();
  if (result.meta.changes === 0) throw new HttpError(409, 'That day was already served.');
  return { ...run, day: next.turn, wins: next.courses, lives: next.lives, status, state: { ...next, growth: [] } };
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

/** A won run carries on in endless mode, if the chef hasn't started another since. */
export async function endlessRun(env: Env, playerId: string, runId: string): Promise<RunView> {
  const row = await env.DB.prepare('SELECT * FROM runs WHERE id = ? AND player_id = ?').bind(runId, playerId).first<RunRow & { endless: number }>();
  if (!row) throw new HttpError(404, 'No such run.');
  if (row.status !== 'won' || row.endless) throw new HttpError(409, "This run can't go on.");
  if (await activeRun(env, playerId)) throw new HttpError(409, "You've started another run since.");
  const state = migrateRun(JSON.parse(row.state) as RunState);
  if (!goEndless(state)) throw new HttpError(409, "This run can't go on.");
  const result = await env.DB.prepare("UPDATE runs SET status = 'active', endless = 1, version = ?, state = ?, updated_at = ? WHERE id = ? AND status = 'won' AND endless = 0")
    .bind(GAME_VERSION, stored(state), Date.now(), row.id)
    .run();
  if (result.meta.changes === 0) throw new HttpError(409, "This run can't go on.");
  return view({ ...row, version: GAME_VERSION, status: 'active' }, { ...state, growth: [] });
}

export async function abandonRun(env: Env, playerId: string, runId: string): Promise<void> {
  const result = await env.DB.prepare("UPDATE runs SET status = 'abandoned', updated_at = ? WHERE id = ? AND player_id = ? AND status = 'active'").bind(Date.now(), runId, playerId).run();
  if (result.meta.changes === 0) throw new HttpError(404, 'No such run in progress.');
}
