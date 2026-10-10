// The Buffet Battle API. Routes:
//   POST  /players             new anonymous player: { name } -> { playerId, token, name }
//   POST  /auth/google         Sign in with Google: { credential } -> { playerId, token, name, google } (token null:
//                              keep yours; the chef on this device was linked to the account)
//   POST  /auth/signout        forget this device's token (a chef linked to Google)
//   POST  /auth/link           the desktop app signs in through the browser: -> { code, poll } (the browser opens
//                              buffetbattle.com/?link=code and sends { credential, link: code } to /auth/google)
//   POST  /auth/link/collect   { code, poll } -> { waiting: true } or { playerId, token, name, google } once signed in
//   GET   /players/me          { playerId, name, google, trophies, bestEndless }
//   GET   /players/me/foods    the foods on the chef's winning plates: { foods: { [defId]: runs won with it } }
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
    const body = await readBody(req);
    const { sub } = await verifyGoogle(env, body.credential);
    // Signing the desktop app in: the result waits for the app, and this browser's own chef isn't touched.
    if (body.link !== undefined) {
      const link = await openLink(env, body.link);
      const current = link.player_id ? await playerById(env, link.player_id) : null;
      const chef = await googleChef(req, env, sub, current);
      const result = JSON.stringify({ playerId: chef.playerId, token: chef.token, name: chef.name });
      await env.DB.prepare('UPDATE sign_in_links SET result = ? WHERE code = ?').bind(result, link.code).run();
      return json({ ok: true, name: chef.name });
    }
    const { created, ...chef } = await googleChef(req, env, sub, await optionalPlayer(req, env));
    return json({ ...chef, google: true }, created ? 201 : 200);
  }

  if (at('POST', '/auth/link')) {
    await limitSignups(req, env);
    const code = randomId(12);
    const poll = randomId(24);
    const current = await optionalPlayer(req, env);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sign_in_links WHERE created_at < ?').bind(Date.now() - LINK_MS),
      env.DB.prepare('INSERT INTO sign_in_links (code, poll_hash, player_id, created_at) VALUES (?, ?, ?, ?)').bind(code, await hashToken(poll), current?.id ?? null, Date.now()),
    ]);
    return json({ code, poll }, 201);
  }
  if (at('POST', '/auth/link/collect')) {
    const { code, poll } = await readBody(req);
    if (typeof code !== 'string' || typeof poll !== 'string') throw new HttpError(400, 'A code and poll are required.');
    const link = await env.DB.prepare('SELECT * FROM sign_in_links WHERE code = ? AND created_at > ?').bind(code, Date.now() - LINK_MS).first<LinkRow>();
    if (!link || link.poll_hash !== (await hashToken(poll))) throw new HttpError(404, 'That sign-in has expired. Try again.');
    if (!link.result) return json({ waiting: true });
    await env.DB.prepare('DELETE FROM sign_in_links WHERE code = ?').bind(code).run();
    return json({ ...JSON.parse(link.result), google: true });
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
  if (at('GET', '/players/me/foods')) {
    // Each won run's plate (an endless one's as it stands now); only the plate is read out of the stored state.
    const { results } = await env.DB.prepare("SELECT json_extract(state, '$.plate') AS plate FROM runs WHERE player_id = ? AND (status = 'won' OR endless = 1)")
      .bind(player.id)
      .all<{ plate: string | null }>();
    const foods: Record<string, number> = {};
    for (const { plate } of results) {
      const ids = new Set((JSON.parse(plate ?? '[]') as ({ defId: string } | null)[]).flatMap((u) => (u ? [u.defId] : [])));
      for (const id of ids) foods[id] = (foods[id] ?? 0) + 1;
    }
    return json({ foods });
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

/**
 * The chef for a Google account: the one already linked to it (with a new token for this device); else the chef on
 * this device, if it isn't linked to another account, becomes the account's (token null: it keeps its own); else a
 * new chef with a name from the word lists (it can be changed).
 */
async function googleChef(req: Request, env: Env, sub: string, current: Player | null): Promise<{ playerId: string; token: string | null; name: string; created?: true }> {
  const linked = await env.DB.prepare('SELECT id, name FROM players WHERE google_sub = ?').bind(sub).first<{ id: string; name: string }>();
  if (linked) {
    const token = randomId(32);
    await env.DB.prepare('INSERT INTO sessions (token_hash, player_id, created_at) VALUES (?, ?, ?)').bind(await hashToken(token), linked.id, Date.now()).run();
    return { playerId: linked.id, token, name: linked.name };
  }
  if (current && !current.google) {
    await env.DB.prepare('UPDATE players SET google_sub = ? WHERE id = ?').bind(sub, current.id).run();
    return { playerId: current.id, token: null, name: current.name };
  }
  await limitSignups(req, env);
  return { ...(await newChef(env, randomName(), sub)), created: true };
}

/** How long a browser sign-in for the desktop app stays open. */
const LINK_MS = 10 * 60_000;

interface LinkRow {
  code: string;
  poll_hash: string;
  player_id: string | null;
  result: string | null;
}

/** A desktop sign-in still waiting for the browser, or 404. */
async function openLink(env: Env, code: unknown): Promise<LinkRow> {
  const link =
    typeof code === 'string'
      ? await env.DB.prepare('SELECT * FROM sign_in_links WHERE code = ? AND created_at > ? AND result IS NULL').bind(code, Date.now() - LINK_MS).first<LinkRow>()
      : null;
  if (!link) throw new HttpError(404, 'That sign-in link has expired. Start again from the game.');
  return link;
}

async function playerById(env: Env, id: string): Promise<Player | null> {
  const row = await env.DB.prepare('SELECT id, name, google_sub FROM players WHERE id = ?').bind(id).first<{ id: string; name: string; google_sub: string | null }>();
  return row && { id: row.id, name: row.name, google: row.google_sub !== null, tokenHash: '' };
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
