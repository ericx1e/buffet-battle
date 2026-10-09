import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { canonical } from '../../src/sim/actions';
import { simulateBattle } from '../../src/sim/battle';
import { generateGhost } from '../../src/sim/bot';
import { type RunState, finishBattle, nextSeed } from '../../src/sim/run';
import { GAME_VERSION } from '../../src/sim/version';
import { POOL_FULL, POOL_THIN, botChance } from '../src/serve';
import { type Json, call, newPlayer, playDay, serveBody } from './helpers';

const stateOf = (s: RunState) => canonical({ ...s, growth: [] });

/** A fresh player with a run on day 1. */
async function startedRun(name = 'Server Chef') {
  const p = await newPlayer(name);
  const run = (await call('POST', '/runs', { token: p.token })).body.run as Json;
  return { ...p, run };
}

/** `n` ghosts on `day` from another player's runs, each with the given record. */
async function seedGhosts(n: number, day: number, wins: number, lives: number, name = 'Pool Chef') {
  const other = await newPlayer(name);
  const now = Date.now();
  const stmts = [];
  for (let i = 0; i < n; i++) {
    const runId = `seed-${name.replace(/\W/g, '')}-${wins}-${i}`;
    stmts.push(
      env.DB.prepare("INSERT INTO runs (id, player_id, version, seed, day, wins, lives, status, state, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, 'active', '{}', ?, ?)").bind(runId, other.playerId, GAME_VERSION, day, wins, lives, now, now),
      env.DB.prepare('INSERT INTO ghosts (run_id, player_id, version, day, wins, lives, plate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(runId, other.playerId, GAME_VERSION, day, wins, lives, JSON.stringify(generateGhost(day, 500 + i)), now + i),
    );
  }
  await env.DB.batch(stmts);
  return other;
}

describe('serve', () => {
  it('plays a whole run through the API, and the client can replay every battle', async () => {
    const p = await startedRun();
    let run = p.run;
    let days = 0;
    while (run.status === 'active') {
      const day = playDay(run.state);
      const res = await call('POST', `/runs/${run.id}/serve`, { token: p.token, body: serveBody(run.day, day) });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const { opponent, seed, outcome } = res.body;
      // The client plays the same battle back from the plates and the seed.
      expect(simulateBattle(day.plate, opponent.plate, seed).outcome).toBe(outcome);
      // And reaches the same next morning on its own.
      nextSeed(day.run);
      nextSeed(day.run);
      finishBattle(day.run, outcome);
      expect(stateOf(res.body.run.state)).toBe(stateOf(day.run));
      expect(opponent.bot).toBe(true); // nobody else is playing
      run = res.body.run;
      days++;
    }
    expect(['won', 'lost']).toContain(run.status);
    expect(days).toBeGreaterThan(3);
    expect((await call('GET', '/runs/current', { token: p.token })).body.run).toBeNull();

    // Every battle is kept and replays to the same outcome.
    const { battles } = (await call('GET', `/runs/${run.id}/battles`, { token: p.token })).body;
    expect(battles.length).toBe(days);
    for (const b of battles) expect(simulateBattle(b.mine, b.opponent.plate, b.seed).outcome).toBe(b.outcome);
  });

  it('refuses a tampered day and leaves the run as it was', async () => {
    const p = await startedRun();
    const day = playDay(p.run.state);
    const url = `/runs/${p.run.id}/serve`;
    const send = (body: unknown) => call('POST', url, { token: p.token, body });
    const good = serveBody(1, day);
    const buy = day.actions.find((a) => a.t === 'buy')!;

    const extraBuys = await send({ ...good, actions: [...day.actions, buy, buy, buy, buy, buy, buy] });
    expect(extraBuys.status).toBe(422);
    expect(extraBuys.body.reason).toBe('replay');

    const fakePlate = await send({ ...good, plateHash: 'abc' });
    expect(fakePlate.status).toBe(409);
    expect(fakePlate.body.plateHash).toBe(day.plateHash);

    expect((await send({ ...good, day: 2 })).body.reason).toBe('day');
    expect((await send({ ...good, version: 'old' })).body.reason).toBe('version');
    expect((await send({ ...good, actions: [{ t: 'buy', src: { area: 'market', index: 0 }, to: { area: 'plate', index: 0 }, gold: 99 }] })).status).toBe(400);
    expect((await send({ ...good, actions: Array(501).fill({ t: 'refill' }) })).status).toBe(400);
    expect((await send({ ...good, actions: 'refill' })).status).toBe(400);
    expect((await send({ ...good, actions: [], plateHash: 'x' })).body.reason).toBe('empty');

    // Nothing moved: the run is still on day 1, as it was this morning, with no battles.
    const now = (await call('GET', '/runs/current', { token: p.token })).body.run;
    expect(now.day).toBe(1);
    expect(stateOf(now.state)).toBe(stateOf(p.run.state));
    expect((await call('GET', `/runs/${p.run.id}/battles`, { token: p.token })).body.battles).toEqual([]);

    // The honest day still goes through, once.
    expect((await send(good)).status).toBe(200);
    expect((await send(good)).status).toBe(409);
  });

  it("can't serve someone else's run", async () => {
    const a = await startedRun('A');
    const b = await newPlayer('B');
    const res = await call('POST', `/runs/${a.run.id}/serve`, { token: b.token, body: serveBody(1, playDay(a.run.state)) });
    expect(res.status).toBe(404);
  });
});

describe('matchmaking', () => {
  it('uses bots while the pool is thin, fewer as it fills', () => {
    expect(botChance(0)).toBe(1);
    expect(botChance(POOL_THIN - 1)).toBe(1);
    expect(botChance(55)).toBeCloseTo(0.5);
    expect(botChance(POOL_FULL)).toBe(0);
  });

  it('meets a real plate from the same day once the pool is full, from the nearest records', async () => {
    await seedGhosts(POOL_FULL, 1, 3, 2, 'Far Chef');
    await seedGhosts(30, 1, 0, 5, 'Near Chef');
    for (let i = 0; i < 4; i++) {
      const p = await startedRun(`Diner ${i}`);
      const res = await call('POST', `/runs/${p.run.id}/serve`, { token: p.token, body: serveBody(1, playDay(p.run.state)) });
      expect(res.status).toBe(200);
      expect(res.body.opponent.bot).toBeUndefined();
      expect(['Near Chef', 'Diner 0', 'Diner 1', 'Diner 2']).toContain(res.body.opponent.label); // a nearest record: 0 wins, 5 lives
      expect(res.body.opponent).toMatchObject({ wins: 0, lives: 5 });
      // The battle list names the same opponent.
      const [b] = (await call('GET', `/runs/${p.run.id}/battles`, { token: p.token })).body.battles;
      expect(b.opponent.label).toBe(res.body.opponent.label);
      expect(simulateBattle(b.mine, b.opponent.plate, b.seed).outcome).toBe(b.outcome);
    }
  });

  it('never meets your own plates, or another day, or other rules', async () => {
    const p = await startedRun('Lonely');
    const now = Date.now();
    const stmts = [];
    for (let i = 0; i < POOL_FULL; i++) {
      const runId = `own-${i}`;
      stmts.push(
        env.DB.prepare("INSERT INTO runs (id, player_id, version, seed, day, wins, lives, status, state, created_at, updated_at) VALUES (?, ?, ?, 1, 1, 0, 5, 'lost', '{}', ?, ?)").bind(runId, p.playerId, GAME_VERSION, now, now),
        env.DB.prepare('INSERT INTO ghosts (run_id, player_id, version, day, wins, lives, plate, created_at) VALUES (?, ?, ?, 1, 0, 5, ?, ?)').bind(runId, p.playerId, GAME_VERSION, JSON.stringify(generateGhost(1, i)), now),
      );
    }
    await env.DB.batch(stmts);
    await seedGhosts(POOL_FULL, 2, 0, 5, 'Day Two');
    await env.DB.prepare("UPDATE ghosts SET version = 'old' WHERE player_id IN (SELECT id FROM players WHERE name = 'Day Two')").run();
    await seedGhosts(POOL_FULL, 2, 0, 5, 'Day Two Again');
    const res = await call('POST', `/runs/${p.run.id}/serve`, { token: p.token, body: serveBody(1, playDay(p.run.state)) });
    expect(res.body.opponent.bot).toBe(true);
  });
});
