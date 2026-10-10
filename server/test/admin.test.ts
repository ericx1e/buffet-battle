import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { plateHash, replayDay } from '../../src/sim/actions';
import { simulateBattle } from '../../src/sim/battle';
import { botOpponent } from '../../src/sim/bot';
import { GAME_VERSION } from '../../src/sim/version';
import { type Json, call, newPlayer, playDay, serveBody } from './helpers';

const adminGet = async (path: string, key = 'test-admin-key') => {
  const res = await exports.default.fetch(`https://api.test${path}`, { headers: { authorization: `Admin ${key}` } });
  return { status: res.status, body: (await res.json()) as any };
};

/** A chef who plays `days` days through the API. */
async function playDays(name: string, days: number) {
  const p = await newPlayer(name);
  let run = (await call('POST', '/runs', { token: p.token })).body.run as Json;
  for (let i = 0; i < days && run.status === 'active'; i++) {
    const res = await call('POST', `/runs/${run.id}/serve`, { token: p.token, body: serveBody(run.day, playDay(run.state)) });
    expect(res.status).toBe(200);
    run = res.body.run;
  }
  return { ...p, run };
}

describe('admin', () => {
  it('needs the admin key', async () => {
    expect((await adminGet('/admin/overview', 'wrong')).status).toBe(401);
    const p = await newPlayer();
    const asPlayer = await exports.default.fetch('https://api.test/admin/overview', { headers: { authorization: `Bearer ${p.token}` } });
    expect(asPlayer.status).toBe(401);
    expect((await adminGet('/admin/overview')).status).toBe(200);
  });

  it('counts players, runs and battles', async () => {
    await playDays('One', 3);
    await playDays('Two', 2);
    const { body } = await adminGet('/admin/overview');
    expect(body.players).toBe(2);
    expect(body.runs.active).toBe(2);
    expect(body.battles.n).toBe(5); // some may be against each other's plates now (one is enough on the first days)
    expect(body.active.at(-1)).toMatchObject({ chefs: 2, days: 5 });
    expect(body.versions[0]).toMatchObject({ version: GAME_VERSION, plates: 5, chefs: 2 });
    expect(body.google).toEqual({ chefs: 0, linked: [], devices: 0 });
  });

  it('pages through battles, each one replayable', async () => {
    await playDays('Pager', 5);
    const first = await adminGet(`/admin/battles?version=${GAME_VERSION}&limit=3`);
    const rest = await adminGet(`/admin/battles?version=${GAME_VERSION}&after=${first.body.at(-1).id}`);
    expect(first.body.length).toBe(3);
    expect(rest.body.length).toBe(2);
    for (const b of [...first.body, ...rest.body]) {
      expect(b.name).toBe('Pager');
      const theirs = b.theirs ?? botOpponent(b.day, b.botSeed, b.wins, b.lives).plate;
      expect(simulateBattle(b.mine, theirs, b.seed).outcome).toBe(b.outcome);
    }
    expect((await adminGet('/admin/battles?version=other')).body).toEqual([]);
  });

  it("keeps each day's morning and actions, which replay to the plate served", async () => {
    await playDays('Logger', 4);
    const days = (await adminGet(`/admin/days?version=${GAME_VERSION}`)).body;
    const battles = (await adminGet(`/admin/battles?version=${GAME_VERSION}`)).body;
    expect(days.length).toBe(4);
    days.forEach((d: Json, i: number) => {
      expect(d.actions.length).toBeGreaterThan(0);
      const replay = replayDay(d.morning, d.actions);
      expect(replay.ok).toBe(true);
      if (replay.ok) expect(plateHash(replay.plate)).toBe(plateHash(battles[i].mine));
    });
  });
});
