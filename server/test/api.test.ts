import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { GAME_VERSION } from '../../src/sim/version';
import { hashToken } from '../src/auth';

type Json = Record<string, any>;

async function call(method: string, path: string, opts: { token?: string; body?: unknown; origin?: string; raw?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.origin) headers.origin = opts.origin;
  if (opts.body !== undefined || opts.raw !== undefined) headers['content-type'] = 'application/json';
  const res = await exports.default.fetch(`https://api.test${path}`, { method, headers, body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)) });
  return { status: res.status, headers: res.headers, body: (res.status === 204 ? {} : await res.json()) as Json };
}

async function newPlayer(name = 'Chef Test') {
  const res = await call('POST', '/players', { body: { name } });
  expect(res.status).toBe(201);
  return res.body as { playerId: string; token: string; name: string };
}

describe('players', () => {
  it('signs up anonymously and keeps only a hash of the token', async () => {
    const p = await newPlayer('  Gordon   R. ');
    expect(p.name).toBe('Gordon R.');
    expect(p.token.length).toBeGreaterThanOrEqual(40);
    const me = await call('GET', '/players/me', { token: p.token });
    expect(me.body).toEqual({ playerId: p.playerId, name: 'Gordon R.' });
    const row = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(p.playerId).first<Json>();
    expect(row!.token_hash).toBe(await hashToken(p.token));
    expect(JSON.stringify(row)).not.toContain(p.token);
  });

  it('refuses bad names', async () => {
    for (const name of ['', '   ', 'x'.repeat(17), '<script>', 'a\u0000b', 42, undefined]) {
      expect((await call('POST', '/players', { body: { name } })).status).toBe(400);
    }
    expect((await call('POST', '/players', { body: { name: 'Café Ñoño 9' } })).status).toBe(201);
  });

  it('renames', async () => {
    const p = await newPlayer();
    expect((await call('PATCH', '/players/me', { token: p.token, body: { name: 'Sous' } })).body.name).toBe('Sous');
    expect((await call('GET', '/players/me', { token: p.token })).body.name).toBe('Sous');
  });

  it('needs a valid token', async () => {
    expect((await call('GET', '/players/me')).status).toBe(401);
    expect((await call('GET', '/players/me', { token: 'x'.repeat(43) })).status).toBe(401);
    expect((await call('GET', '/runs/current', { token: 'not a token' })).status).toBe(401);
  });
});

describe('runs', () => {
  it('starts a run on the current rules, on day 1', async () => {
    const p = await newPlayer();
    expect((await call('GET', '/runs/current', { token: p.token })).body.run).toBeNull();
    const { status, body } = await call('POST', '/runs', { token: p.token });
    expect(status).toBe(201);
    const run = body.run;
    expect(run).toMatchObject({ version: GAME_VERSION, day: 1, wins: 0, status: 'active' });
    expect(run.state.turn).toBe(1);
    expect(run.state.market.length).toBeGreaterThan(0);
    expect((await call('GET', '/runs/current', { token: p.token })).body.run).toEqual(run);
  });

  it('a new run abandons the old one', async () => {
    const p = await newPlayer();
    const first = (await call('POST', '/runs', { token: p.token })).body.run;
    const second = (await call('POST', '/runs', { token: p.token })).body.run;
    expect(second.id).not.toBe(first.id);
    expect((await call('GET', '/runs/current', { token: p.token })).body.run.id).toBe(second.id);
    const old = await env.DB.prepare('SELECT status FROM runs WHERE id = ?').bind(first.id).first<Json>();
    expect(old!.status).toBe('abandoned');
  });

  it('abandons only your own run', async () => {
    const a = await newPlayer('A');
    const b = await newPlayer('B');
    const run = (await call('POST', '/runs', { token: a.token })).body.run;
    expect((await call('POST', `/runs/${run.id}/abandon`, { token: b.token })).status).toBe(404);
    expect((await call('POST', `/runs/${run.id}/abandon`, { token: a.token })).status).toBe(200);
    expect((await call('GET', '/runs/current', { token: a.token })).body.run).toBeNull();
  });

  it('moves a run from older rules onto the current ones', async () => {
    const p = await newPlayer();
    const run = (await call('POST', '/runs', { token: p.token })).body.run;
    await env.DB.prepare("UPDATE runs SET version = 'old' WHERE id = ?").bind(run.id).run();
    expect((await call('GET', '/runs/current', { token: p.token })).body.run.version).toBe(GAME_VERSION);
  });
});

describe('requests', () => {
  it('refuses bodies over 64 KB and bodies that are not JSON objects', async () => {
    expect((await call('POST', '/players', { raw: JSON.stringify({ name: 'x', pad: 'y'.repeat(70_000) }) })).status).toBe(413);
    expect((await call('POST', '/players', { raw: '{nope' })).status).toBe(400);
    expect((await call('POST', '/players', { raw: '[1,2]' })).status).toBe(400);
  });

  it('answers CORS for the game and localhost only', async () => {
    for (const origin of ['https://ericx1e.github.io', 'http://localhost:5173']) {
      const pre = await call('OPTIONS', '/runs', { origin });
      expect(pre.status).toBe(204);
      expect(pre.headers.get('access-control-allow-origin')).toBe(origin);
      expect(pre.headers.get('access-control-allow-headers')).toContain('authorization');
    }
    const evil = await call('GET', '/', { origin: 'https://evil.example' });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('reports the version and 404s unknown routes', async () => {
    expect((await call('GET', '/')).body).toEqual({ ok: true, version: GAME_VERSION });
    const p = await newPlayer();
    expect((await call('GET', '/nope', { token: p.token })).status).toBe(404);
  });
});
