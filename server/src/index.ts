// The Buffet Battle API. Routes:
//   POST  /players             new anonymous player: { name } -> { playerId, token, name }
//   POST  /auth/google         Sign in with Google: { credential } -> { playerId, token, name, google } (token null:
//                              keep yours; the chef on this device was linked to the account)
//   POST  /auth/signout        forget this device's token (a chef linked to Google)
//   GET   /players/me          { playerId, name, google, trophies, bestEndless }
//   PATCH /players/me          rename: { name }
//   POST  /runs                new run (an active run is abandoned first) -> { run }
//   GET   /runs/current        the active run, this morning -> { run } (null when there is none)
//   POST  /runs/:id/serve      replay the day, battle, move on: { day, version, actions, plateHash } -> { opponent, seed, outcome, run }
//   GET   /runs/:id/battles    the run's battles, both plates and the seed -> { battles }
//   POST  /runs/:id/abandon    the New run button
//   POST  /runs/:id/endless    a won run carries on (endless mode) -> { run }
//   GET   /admin/...           the dev site's data (admin.ts)
import { GAME_VERSION } from '../../src/sim/version';
import { randomName } from '../../src/names';
import { type Player, cleanName, hashToken, randomId, requirePlayer } from './auth';
import { verifyGoogle } from './google';
import { HttpError, allowedOrigin, json, readBody, withCors } from './http';
import { abandonRun, activeRun, endlessRun, startRun } from './runs';
import { battlesOf, serveDay } from './serve';
import { admin } from './admin';

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const { pathname } = url;
  const at = (method: string, path: string) => req.method === method && pathname === path;

  if (at('GET', '/')) return json({ ok: true, version: GAME_VERSION });
  if (pathname.startsWith('/admin/') && req.method === 'GET') return admin(req, env, url);

  if (at('POST', '/players')) {
    await limitSignups(req, env);
    const name = cleanName((await readBody(req)).name);
    return json(await newChef(env, name), 201);
  }

  if (at('POST', '/auth/google')) {
    const { sub } = await verifyGoogle(env, (await readBody(req)).credential);
    // A chef already linked to this account: this device gets a token of its own for it.
    const linked = await env.DB.prepare('SELECT id, name FROM players WHERE google_sub = ?').bind(sub).first<{ id: string; name: string }>();
    if (linked) {
      const token = randomId(32);
      await env.DB.prepare('INSERT INTO sessions (token_hash, player_id, created_at) VALUES (?, ?, ?)').bind(await hashToken(token), linked.id, Date.now()).run();
      return json({ playerId: linked.id, token, name: linked.name, google: true });
    }
    // Otherwise the chef on this device (if it isn't linked to another account) becomes this account's.
    const current = await optionalPlayer(req, env);
    if (current && !current.google) {
      await env.DB.prepare('UPDATE players SET google_sub = ? WHERE id = ?').bind(sub, current.id).run();
      return json({ playerId: current.id, token: null, name: current.name, google: true });
    }
    // No chef here: a new one, with a name from the word lists (it can be changed).
    await limitSignups(req, env);
    return json({ ...(await newChef(env, randomName(), sub)), google: true }, 201);
  }

  const player = await requirePlayer(req, env);
  if (!(await env.PLAYER_LIMIT.limit({ key: player.id })).success) throw new HttpError(429, 'Slow down, chef: too many requests. Try again in a minute.');

  if (at('GET', '/players/me')) {
    // The win counter: runs won (an endless one counts once) and the most courses an endless run reached.
    const stats = await env.DB.prepare("SELECT COUNT(*) AS trophies, MAX(CASE WHEN endless = 1 THEN wins END) AS best FROM runs WHERE player_id = ? AND status = 'won'")
      .bind(player.id)
      .first<{ trophies: number; best: number | null }>();
    return json({ playerId: player.id, name: player.name, google: player.google, trophies: stats?.trophies ?? 0, bestEndless: stats?.best ?? null });
  }
  if (at('POST', '/auth/signout')) {
    if (!player.google) throw new HttpError(409, "This chef isn't linked to Google: signing out would lose it.");
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(player.tokenHash).run();
    return json({ ok: true });
  }
  if (at('PATCH', '/players/me')) {
    const name = cleanName((await readBody(req)).name);
    await env.DB.prepare('UPDATE players SET name = ? WHERE id = ?').bind(name, player.id).run();
    return json({ playerId: player.id, name });
  }

  if (at('POST', '/runs')) return json({ run: await startRun(env, player.id) }, 201);
  if (at('GET', '/runs/current')) return json({ run: await activeRun(env, player.id) });
  const [, runId, sub] = /^\/runs\/([\w-]{1,40})\/(abandon|serve|battles|endless)$/.exec(pathname) ?? [];
  if (sub === 'abandon' && req.method === 'POST') {
    await abandonRun(env, player.id, runId);
    return json({ ok: true });
  }
  if (sub === 'endless' && req.method === 'POST') return json({ run: await endlessRun(env, player.id, runId) });
  if (sub === 'serve' && req.method === 'POST') return json(await serveDay(req, env, player.id, runId));
  if (sub === 'battles' && req.method === 'GET') return json({ battles: await battlesOf(env, player.id, runId) });

  throw new HttpError(404, 'Not found.');
}

/** New chefs: at most a few a minute from one address. */
async function limitSignups(req: Request, env: Env) {
  // Cloudflare always sets the caller's address; without one (tests), or from this machine (wrangler dev), there
  // is no one to count.
  const ip = req.headers.get('cf-connecting-ip');
  if (ip && ip !== '127.0.0.1' && ip !== '::1' && !(await env.SIGNUP_LIMIT.limit({ key: ip })).success) throw new HttpError(429, 'Too many new chefs from here. Try again in a minute.');
}

async function newChef(env: Env, name: string, googleSub: string | null = null) {
  const playerId = randomId();
  const token = randomId(32);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO players (id, token_hash, name, created_at, last_seen, google_sub) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(playerId, await hashToken(token), name, now, now, googleSub)
    .run();
  return { playerId, token, name };
}

/** The player on the request, if it carries a valid token. */
async function optionalPlayer(req: Request, env: Env): Promise<Player | null> {
  if (!req.headers.get('authorization')) return null;
  try {
    return await requirePlayer(req, env);
  } catch {
    return null;
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(req.headers.get('origin'), env);
    if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), origin);
    try {
      return withCors(await route(req, env), origin);
    } catch (e) {
      if (e instanceof HttpError) return withCors(json({ error: e.message, ...e.extra }, e.status), origin);
      console.error(e);
      return withCors(json({ error: 'Something went wrong in the kitchen.' }, 500), origin);
    }
  },
} satisfies ExportedHandler<Env>;
