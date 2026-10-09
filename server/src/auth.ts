// Anonymous players: a random id and a secret token. Only the token's SHA-256 is stored.
import { nameProblem, tidyName } from '../../src/names';
import { HttpError } from './http';

export interface Player {
  id: string;
  name: string;
}

export function randomId(bytes = 16): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A chef's name, tidied, if it passes the shared name rules (src/names.ts). */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') throw new HttpError(400, 'A name is required.');
  const problem = nameProblem(raw);
  if (problem) throw new HttpError(400, problem, { reason: 'name' });
  return tidyName(raw);
}

/** The player whose token is on the request, or 401. Notes when they were last seen (at most hourly). */
export async function requirePlayer(req: Request, env: Env): Promise<Player> {
  const token = /^Bearer ([\w-]{20,100})$/.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!token) throw new HttpError(401, 'Sign in first.');
  const player = await env.DB.prepare('SELECT id, name FROM players WHERE token_hash = ?').bind(await hashToken(token)).first<Player>();
  if (!player) throw new HttpError(401, 'Unknown player.');
  const now = Date.now();
  await env.DB.prepare('UPDATE players SET last_seen = ? WHERE id = ? AND last_seen < ?').bind(now, player.id, now - 3600_000).run();
  return player;
}
