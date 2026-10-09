// Serve: the day is replayed from this morning's state, the plate is saved as a ghost, an opponent is found, and the
// battle is fought here. The client gets the opponent and the seed, and plays the same battle back itself.
import { plateHash, replayDay } from '../../src/sim/actions';
import { type Outcome, simulateBattle } from '../../src/sim/battle';
import { type Opponent, botOpponent } from '../../src/sim/bot';
import { Rng } from '../../src/sim/rng';
import { COURSES_TO_WIN, finishBattle, isOver, nextSeed } from '../../src/sim/run';
import type { Plate } from '../../src/sim/types';
import { GAME_VERSION } from '../../src/sim/version';
import { HttpError, readBody } from './http';
import { type RunView, ownRun, saveDay } from './runs';
import { parseActions } from './validate';

/** Below this many ghosts to choose from a bot always fills in; from POOL_FULL on, never; in between, less and less. */
export const POOL_THIN = 10;
export const POOL_FULL = 100;
const SHORTLIST = 20;

export const botChance = (pool: number) => (pool < POOL_THIN ? 1 : pool >= POOL_FULL ? 0 : (POOL_FULL - pool) / (POOL_FULL - POOL_THIN));

export interface ServeResult {
  opponent: Opponent;
  seed: number;
  outcome: Outcome;
  run: RunView;
}

/** Ghosts this run may meet today: same rules and day, someone else's, not a run it already fought. */
const ELIGIBLE = `FROM ghosts g WHERE g.version = ?1 AND g.day = ?2 AND g.player_id != ?3
  AND g.run_id NOT IN (SELECT o.run_id FROM battles b JOIN ghosts o ON o.id = b.opp_ghost_id WHERE b.run_id = ?4)`;

/**
 * The day's opponent: from the shortlist of the 20 nearest records (newest first), unless the pool is thin and a bot
 * fills in. Every random choice comes from `seed`, which comes from the run.
 */
async function findOpponent(env: Env, run: RunView, playerId: string, wins: number, lives: number, seed: number): Promise<{ opponent: Opponent; ghostId: number | null }> {
  const args = [GAME_VERSION, run.day, playerId, run.id];
  const pool = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 ${ELIGIBLE} LIMIT ${POOL_FULL})`).bind(...args).first<{ n: number }>())!.n;
  const rng = new Rng(seed);
  if (rng.next() < botChance(pool)) return { opponent: botOpponent(run.day, seed, wins, lives), ghostId: null };
  const { results } = await env.DB.prepare(
    `SELECT g.id, g.plate, g.wins, g.lives, p.name FROM (SELECT * ${ELIGIBLE}) g JOIN players p ON p.id = g.player_id
     ORDER BY ABS(g.wins - ?5) + ABS(g.lives - ?6), g.created_at DESC LIMIT ${SHORTLIST}`,
  )
    .bind(...args, wins, lives)
    .all<{ id: number; plate: string; wins: number; lives: number; name: string }>();
  const g = rng.pick(results);
  return { opponent: { plate: JSON.parse(g.plate) as Plate, label: g.name, wins: g.wins, lives: g.lives }, ghostId: g.id };
}

export async function serveDay(req: Request, env: Env, playerId: string, runId: string): Promise<ServeResult> {
  const body = await readBody(req);
  const run = await ownRun(env, playerId, runId);
  if (run.status !== 'active') throw new HttpError(409, 'This run is over.');
  if (body.version !== GAME_VERSION) throw new HttpError(409, 'The game was updated: reload to carry on.', { reason: 'version', version: GAME_VERSION });
  if (body.day !== run.day) throw new HttpError(409, `Your run is on day ${run.day}.`, { reason: 'day', day: run.day });
  const actions = parseActions(body.actions);

  // 1. The day, replayed from this morning: every action must work, and the plate must match the client's.
  const replay = replayDay(run.state, actions);
  if (!replay.ok) throw new HttpError(422, `The day didn't replay: ${replay.error}`, { reason: 'replay', index: replay.index });
  const day = replay.run;
  const mine = replay.plate;
  if (mine.every((u) => !u)) throw new HttpError(422, 'Your plate is empty.', { reason: 'empty' });
  const hash = plateHash(mine);
  if (body.plateHash !== hash) throw new HttpError(409, "Your plate doesn't match the server's.", { reason: 'plate', plateHash: hash });

  // 2. The opponent and the battle, with seeds drawn from the run in the same order as the client.
  const [wins, lives] = [day.courses, day.lives];
  const opponentSeed = nextSeed(day);
  const { opponent, ghostId } = await findOpponent(env, run, playerId, wins, lives, opponentSeed);
  const seed = nextSeed(day);
  const { outcome } = simulateBattle(mine, opponent.plate, seed);

  // 3. The run moves on (refused if this day was served meanwhile), then the plate and the battle are kept.
  finishBattle(day, outcome);
  const status = !isOver(day) ? 'active' : day.courses >= COURSES_TO_WIN ? 'won' : 'lost';
  const next = await saveDay(env, run, day, status);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO ghosts (run_id, player_id, version, day, wins, lives, plate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(
      run.id, playerId, GAME_VERSION, run.day, wins, lives, JSON.stringify(mine), now,
    ),
    env.DB.prepare(
      `INSERT INTO battles (run_id, day, my_ghost_id, opp_ghost_id, bot_seed, seed, outcome, created_at)
       VALUES (?, ?, (SELECT id FROM ghosts WHERE run_id = ? AND day = ? ORDER BY id DESC LIMIT 1), ?, ?, ?, ?, ?)`,
    ).bind(run.id, run.day, run.id, run.day, ghostId, ghostId === null ? opponentSeed : null, seed, outcome, now),
  ]);
  return { opponent, seed, outcome, run: next };
}

/** A run's battles, oldest first, with both plates and the seed, so each can be played back. */
export async function battlesOf(env: Env, playerId: string, runId: string) {
  await ownRun(env, playerId, runId);
  const { results } = await env.DB.prepare(
    `SELECT b.day, b.seed, b.outcome, b.bot_seed, m.plate AS mine, m.wins, m.lives, o.plate AS theirs, o.wins AS o_wins, o.lives AS o_lives, p.name
     FROM battles b JOIN ghosts m ON m.id = b.my_ghost_id LEFT JOIN ghosts o ON o.id = b.opp_ghost_id LEFT JOIN players p ON p.id = o.player_id
     WHERE b.run_id = ? ORDER BY b.day`,
  )
    .bind(runId)
    .all<{ day: number; seed: number; outcome: Outcome; bot_seed: number | null; mine: string; wins: number; lives: number; theirs: string | null; o_wins: number; o_lives: number; name: string | null }>();
  return results.map((b) => ({
    day: b.day,
    seed: b.seed,
    outcome: b.outcome,
    mine: JSON.parse(b.mine) as Plate,
    opponent:
      b.bot_seed !== null
        ? botOpponent(b.day, b.bot_seed, b.wins, b.lives)
        : { plate: JSON.parse(b.theirs!) as Plate, label: b.name ?? 'A chef', wins: b.o_wins, lives: b.o_lives },
  }));
}
