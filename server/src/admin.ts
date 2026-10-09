// The dev site's API: counts for the overview, and raw battles and days (paged) that the dev site analyses in the
// browser (replaying battles is too much work for a request). Every route needs `Authorization: Admin <ADMIN_KEY>`.
//   GET /admin/overview                              players, activity by day, runs, battles, versions
//   GET /admin/battles?version=&after=&limit=        battles with both plates, seed, records and names (limit <= 500)
//   GET /admin/days?version=&after=&limit=           served days: the morning's state and the actions (limit <= 200)
import { HttpError, json } from './http';

const DAY_MS = 86_400_000;

async function requireAdmin(req: Request, env: Env) {
  const given = /^Admin (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
  const key = env.ADMIN_KEY ?? '';
  // Compared as hashes in constant time, so the key can't be guessed a character at a time.
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = [await digest(given), await digest(key)];
  if (!key || !crypto.subtle.timingSafeEqual(a, b)) throw new HttpError(401, 'Admin key required.');
}

/** Rows as a JSON array, with the columns in `raw` (stored JSON text) passed through unparsed. */
function rawJson(rows: Record<string, unknown>[], raw: string[]): string {
  return `[${rows
    .map((r) => `{${Object.entries(r).map(([k, v]) => `${JSON.stringify(k)}:${raw.includes(k) && typeof v === 'string' ? v : JSON.stringify(v)}`).join(',')}}`)
    .join(',')}]`;
}

function page(url: URL, max: number) {
  const version = url.searchParams.get('version') ?? '';
  const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
  const limit = Math.min(max, Math.max(1, Number(url.searchParams.get('limit')) || max));
  return { version, after, limit };
}

export async function admin(req: Request, env: Env, url: URL): Promise<Response> {
  await requireAdmin(req, env);
  const db = env.DB;

  if (url.pathname === '/admin/overview') {
    const since = Date.now() - 30 * DAY_MS;
    const dayOf = (col: string) => `date(${col} / 1000, 'unixepoch')`;
    const [players, signups, active, runs, reached, battles, versions] = await db.batch([
      db.prepare('SELECT COUNT(*) AS n FROM players'),
      db.prepare(`SELECT ${dayOf('created_at')} AS date, COUNT(*) AS n FROM players WHERE created_at > ? GROUP BY date ORDER BY date`).bind(since),
      db.prepare(`SELECT ${dayOf('created_at')} AS date, COUNT(DISTINCT player_id) AS chefs, COUNT(*) AS days FROM days WHERE created_at > ? GROUP BY date ORDER BY date`).bind(since),
      db.prepare('SELECT status, COUNT(*) AS n FROM runs GROUP BY status'),
      db.prepare("SELECT day - 1 AS days, status, COUNT(*) AS n FROM runs WHERE status IN ('won', 'lost') GROUP BY days, status ORDER BY days"),
      db.prepare("SELECT COUNT(*) AS n, SUM(opp_ghost_id IS NULL) AS bots, SUM(outcome = 'win') AS wins, SUM(outcome = 'draw') AS draws FROM battles"),
      db.prepare('SELECT version, COUNT(*) AS plates, COUNT(DISTINCT player_id) AS chefs, MIN(created_at) AS first, MAX(created_at) AS last FROM ghosts GROUP BY version ORDER BY last DESC'),
    ]);
    return json({
      players: (players.results[0] as { n: number }).n,
      signups: signups.results,
      active: active.results,
      runs: Object.fromEntries((runs.results as { status: string; n: number }[]).map((r) => [r.status, r.n])),
      reached: reached.results,
      battles: battles.results[0],
      versions: versions.results,
    });
  }

  if (url.pathname === '/admin/battles') {
    const { version, after, limit } = page(url, 500);
    const { results } = await db
      .prepare(
        `SELECT b.id, b.day, b.seed, b.outcome, b.bot_seed AS botSeed, b.created_at AS at,
           m.plate AS mine, m.wins, m.lives, pm.name, o.plate AS theirs, o.wins AS oWins, o.lives AS oLives, po.name AS oName
         FROM battles b JOIN ghosts m ON m.id = b.my_ghost_id JOIN players pm ON pm.id = m.player_id
           LEFT JOIN ghosts o ON o.id = b.opp_ghost_id LEFT JOIN players po ON po.id = o.player_id
         WHERE m.version = ? AND b.id > ? ORDER BY b.id LIMIT ?`,
      )
      .bind(version, after, limit)
      .all();
    return new Response(rawJson(results, ['mine', 'theirs']), { headers: { 'content-type': 'application/json' } });
  }

  if (url.pathname === '/admin/days') {
    const { version, after, limit } = page(url, 200);
    const { results } = await db
      .prepare('SELECT id, run_id AS runId, day, morning, actions, created_at AS at FROM days WHERE version = ? AND id > ? ORDER BY id LIMIT ?')
      .bind(version, after, limit)
      .all();
    return new Response(rawJson(results, ['morning', 'actions']), { headers: { 'content-type': 'application/json' } });
  }

  throw new HttpError(404, 'Not found.');
}
