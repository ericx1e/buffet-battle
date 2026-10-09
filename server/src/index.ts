// The Buffet Battle API. Routes:
//   POST  /players             new anonymous player: { name } -> { playerId, token, name }
//   GET   /players/me          { playerId, name }
//   PATCH /players/me          rename: { name }
//   POST  /runs                new run (an active run is abandoned first) -> { run }
//   GET   /runs/current        the active run, this morning -> { run } (null when there is none)
//   POST  /runs/:id/serve      replay the day, battle, move on: { day, version, actions, plateHash } -> { opponent, seed, outcome, run }
//   GET   /runs/:id/battles    the run's battles, both plates and the seed -> { battles }
//   POST  /runs/:id/abandon    the New run button
//   GET   /admin/...           the dev site's data (admin.ts)
import { GAME_VERSION } from '../../src/sim/version';
import { cleanName, hashToken, randomId, requirePlayer } from './auth';
import { HttpError, allowedOrigin, json, readBody, withCors } from './http';
import { abandonRun, activeRun, startRun } from './runs';
import { battlesOf, serveDay } from './serve';
import { admin } from './admin';

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const { pathname } = url;
  const at = (method: string, path: string) => req.method === method && pathname === path;

  if (at('GET', '/')) return json({ ok: true, version: GAME_VERSION });
  if (pathname.startsWith('/admin/') && req.method === 'GET') return admin(req, env, url);

  if (at('POST', '/players')) {
    // Cloudflare always sets the caller's address; without one (tests), or from this machine (wrangler dev), there
    // is no one to count.
    const ip = req.headers.get('cf-connecting-ip');
    if (ip && ip !== '127.0.0.1' && ip !== '::1' && !(await env.SIGNUP_LIMIT.limit({ key: ip })).success) throw new HttpError(429, 'Too many new chefs from here. Try again in a minute.');
    const name = cleanName((await readBody(req)).name);
    const playerId = randomId();
    const token = randomId(32);
    const now = Date.now();
    await env.DB.prepare('INSERT INTO players (id, token_hash, name, created_at, last_seen) VALUES (?, ?, ?, ?, ?)').bind(playerId, await hashToken(token), name, now, now).run();
    return json({ playerId, token, name }, 201);
  }

  const player = await requirePlayer(req, env);
  if (!(await env.PLAYER_LIMIT.limit({ key: player.id })).success) throw new HttpError(429, 'Slow down, chef: too many requests. Try again in a minute.');

  if (at('GET', '/players/me')) return json({ playerId: player.id, name: player.name });
  if (at('PATCH', '/players/me')) {
    const name = cleanName((await readBody(req)).name);
    await env.DB.prepare('UPDATE players SET name = ? WHERE id = ?').bind(name, player.id).run();
    return json({ playerId: player.id, name });
  }

  if (at('POST', '/runs')) return json({ run: await startRun(env, player.id) }, 201);
  if (at('GET', '/runs/current')) return json({ run: await activeRun(env, player.id) });
  const [, runId, sub] = /^\/runs\/([\w-]{1,40})\/(abandon|serve|battles)$/.exec(pathname) ?? [];
  if (sub === 'abandon' && req.method === 'POST') {
    await abandonRun(env, player.id, runId);
    return json({ ok: true });
  }
  if (sub === 'serve' && req.method === 'POST') return json(await serveDay(req, env, player.id, runId));
  if (sub === 'battles' && req.method === 'GET') return json({ battles: await battlesOf(env, player.id, runId) });

  throw new HttpError(404, 'Not found.');
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
