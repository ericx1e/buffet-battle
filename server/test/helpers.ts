import { exports } from 'cloudflare:workers';
import { expect } from 'vitest';
import { type Action, plateHash } from '../../src/sim/actions';
import { botPrep } from '../../src/sim/bot';
import { type RunState, serve } from '../../src/sim/run';
import { GAME_VERSION } from '../../src/sim/version';

export type Json = Record<string, any>;

export async function call(method: string, path: string, opts: { token?: string; body?: unknown; origin?: string; raw?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.origin) headers.origin = opts.origin;
  if (opts.body !== undefined || opts.raw !== undefined) headers['content-type'] = 'application/json';
  const res = await exports.default.fetch(`https://api.test${path}`, { method, headers, body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)) });
  return { status: res.status, headers: res.headers, body: (res.status === 204 ? {} : await res.json()) as Json };
}

export async function newPlayer(name = 'Chef Test') {
  const res = await call('POST', '/players', { body: { name } });
  expect(res.status).toBe(201);
  return res.body as { playerId: string; token: string; name: string };
}

/** A day played by the bot on a copy of the morning's state, as a client would: the actions and the plate served. */
export function playDay(morning: RunState) {
  const run = structuredClone(morning);
  const actions: Action[] = [];
  botPrep(run, actions);
  const plate = serve(run);
  return { run, actions, plate, plateHash: plateHash(plate) };
}

/** Serve body for a day played by playDay. */
export const serveBody = (day: number, d: ReturnType<typeof playDay>) => ({ day, version: GAME_VERSION, actions: d.actions, plateHash: d.plateHash });
