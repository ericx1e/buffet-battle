import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { finishBattle, newRun } from '../../src/sim/run';
import keys from './google-keys.json';
import { type Json, call, newPlayer } from './helpers';

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const part = (o: object) => b64url(new TextEncoder().encode(JSON.stringify(o)));

/** An ID token as Google would sign it (with the tests' stand-in key). */
async function idToken(claims: Json = {}, kid = 'test-key') {
  const key = await crypto.subtle.importKey('jwk', keys.private as JsonWebKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const body = `${part({ alg: 'RS256', kid, typ: 'JWT' })}.${part({ iss: 'https://accounts.google.com', aud: 'test-client', sub: 'google-1', exp: Math.floor(Date.now() / 1000) + 600, ...claims })}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(body)));
  return `${body}.${b64url(sig)}`;
}

const google = async (credential: string, token?: string) => call('POST', '/auth/google', { body: { credential }, token });

describe('Sign in with Google', () => {
  it('links the chef on this device, then signs other devices into it', async () => {
    const p = await newPlayer('First Device');
    const linked = await google(await idToken(), p.token);
    expect(linked.status).toBe(200);
    expect(linked.body).toEqual({ playerId: p.playerId, token: null, name: 'First Device', google: true });
    expect((await call('GET', '/players/me', { token: p.token })).body.google).toBe(true);

    // Another device: a token of its own, for the same chef; the first device keeps working.
    const other = await google(await idToken());
    expect(other.body).toMatchObject({ playerId: p.playerId, name: 'First Device', google: true });
    expect(other.body.token).toEqual(expect.any(String));
    expect((await call('GET', '/players/me', { token: other.body.token })).body.playerId).toBe(p.playerId);
    expect((await call('GET', '/players/me', { token: p.token })).status).toBe(200);

    // Signing out forgets that device's token only.
    expect((await call('POST', '/auth/signout', { token: other.body.token })).status).toBe(200);
    expect((await call('GET', '/players/me', { token: other.body.token })).status).toBe(401);
    expect((await call('GET', '/players/me', { token: p.token })).status).toBe(200);
  });

  it('makes a new chef for an account with none', async () => {
    const res = await google(await idToken({ sub: 'google-new' }));
    expect(res.status).toBe(201);
    expect(res.body.name).toEqual(expect.any(String));
    const row = await env.DB.prepare('SELECT google_sub FROM players WHERE id = ?').bind(res.body.playerId).first<Json>();
    expect(row!.google_sub).toBe('google-new');
  });

  it('refuses tokens that are not Google ones for this game', async () => {
    const p = await newPlayer();
    const good = await idToken();
    const [h, c] = good.split('.');
    for (const bad of [
      await idToken({ aud: 'someone-else' }),
      await idToken({ iss: 'evil.example' }),
      await idToken({ exp: Math.floor(Date.now() / 1000) - 10 }),
      await idToken({}, 'unknown-key'),
      `${h}.${part({ iss: 'https://accounts.google.com', aud: 'test-client', sub: 'forged', exp: 9e9 })}.${good.split('.')[2]}`,
      `${h}.${c}`,
      'nonsense',
      42,
    ]) {
      expect((await call('POST', '/auth/google', { body: { credential: bad }, token: p.token })).status).toBe(401);
    }
    expect((await call('GET', '/players/me', { token: p.token })).body.google).toBe(false);
  });

  it("won't sign out a chef that isn't linked (it would be lost)", async () => {
    const p = await newPlayer();
    expect((await call('POST', '/auth/signout', { token: p.token })).status).toBe(409);
  });
});

/** A run of the player's that has just been won (stored as the server would after the tenth win). */
async function wonRun(playerId: string) {
  const state = newRun(9);
  state.plate = [{ uid: 1, defId: 'cherry', copies: 1, attack: 4, hp: 8 }, { uid: 2, defId: 'cherry', copies: 1, attack: 4, hp: 8 }, { uid: 3, defId: 'kebab', copies: 3, attack: 9, hp: 20 }, null, null, null];
  state.courses = 9;
  finishBattle(state, 'win');
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO runs (id, player_id, version, seed, day, wins, lives, status, state, created_at, updated_at) VALUES ('won-run', ?, 'v', 9, ?, 10, ?, 'won', ?, ?, ?)",
  )
    .bind(playerId, state.turn, state.lives, JSON.stringify(state), now, now)
    .run();
  return state;
}

describe('endless and the win counter', () => {
  it('carries a won run on, once, and counts it', async () => {
    const p = await newPlayer();
    const won = await wonRun(p.playerId);
    expect((await call('GET', '/players/me', { token: p.token })).body).toMatchObject({ trophies: 1, bestEndless: null });

    const res = await call('POST', '/runs/won-run/endless', { token: p.token });
    expect(res.status).toBe(200);
    expect(res.body.run).toMatchObject({ id: 'won-run', status: 'active', day: won.turn, wins: 10 });
    expect(res.body.run.state.endless).toBe(true);
    expect(res.body.run.state.gold).toBeGreaterThan(won.gold);
    expect((await call('GET', '/runs/current', { token: p.token })).body.run.id).toBe('won-run');
    expect((await call('POST', '/runs/won-run/endless', { token: p.token })).status).toBe(409);

    // The run ends with 13 courses: still one trophy, and the best endless is 13.
    await env.DB.prepare("UPDATE runs SET status = 'won', wins = 13 WHERE id = 'won-run'").run();
    expect((await call('GET', '/players/me', { token: p.token })).body).toMatchObject({ trophies: 1, bestEndless: 13 });
  });

  it('lists the foods on winning plates, once a run each', async () => {
    const p = await newPlayer();
    expect((await call('GET', '/players/me/foods', { token: p.token })).body).toEqual({ foods: {} });
    await wonRun(p.playerId);
    expect((await call('GET', '/players/me/foods', { token: p.token })).body).toEqual({ foods: { cherry: 1, kebab: 1 } });
  });

  it('only for your own won run, and not once another has started', async () => {
    const p = await newPlayer();
    const q = await newPlayer('Someone Else');
    await wonRun(p.playerId);
    expect((await call('POST', '/runs/won-run/endless', { token: q.token })).status).toBe(404);
    await call('POST', '/runs', { token: p.token });
    expect((await call('POST', '/runs/won-run/endless', { token: p.token })).status).toBe(409);
  });
});

describe('signing the desktop app in through the browser', () => {
  const collect = (code: string, poll: string) => call('POST', '/auth/link/collect', { body: { code, poll } });

  it("links the app's chef, and the app collects the result once", async () => {
    const app = await newPlayer('Desktop Chef');
    const browser = await newPlayer('Browser Chef');
    const { code, poll } = (await call('POST', '/auth/link', { token: app.token })).body;
    expect((await collect(code, poll)).body).toEqual({ waiting: true });
    expect((await collect(code, 'wrong-poll-secret-xxxxxxxx')).status).toBe(404);

    const res = await call('POST', '/auth/google', { body: { credential: await idToken({ sub: 'g-desk' }), link: code }, token: browser.token });
    expect(res.body).toEqual({ ok: true, name: 'Desktop Chef' });
    // The app's chef was linked (it keeps its own token); the browser's chef wasn't touched.
    expect((await collect(code, poll)).body).toEqual({ playerId: app.playerId, token: null, name: 'Desktop Chef', google: true });
    expect((await collect(code, poll)).status).toBe(404);
    expect((await call('GET', '/players/me', { token: browser.token })).body.google).toBe(false);
    // The link is used up.
    expect((await call('POST', '/auth/google', { body: { credential: await idToken({ sub: 'g-desk' }), link: code } })).status).toBe(404);
  });

  it('signs the app into an account that already has a chef', async () => {
    const owner = await newPlayer('Owner');
    await call('POST', '/auth/google', { body: { credential: await idToken({ sub: 'g-own' }) }, token: owner.token });
    const { code, poll } = (await call('POST', '/auth/link')).body;
    await call('POST', '/auth/google', { body: { credential: await idToken({ sub: 'g-own' }), link: code } });
    const got = (await collect(code, poll)).body;
    expect(got).toMatchObject({ playerId: owner.playerId, name: 'Owner', google: true });
    expect((await call('GET', '/players/me', { token: got.token })).body.playerId).toBe(owner.playerId);
  });

  it('refuses unknown links', async () => {
    expect((await call('POST', '/auth/google', { body: { credential: await idToken(), link: 'no-such-link' } })).status).toBe(404);
    expect((await collect('no-such-link', 'x')).status).toBe(404);
  });
});
