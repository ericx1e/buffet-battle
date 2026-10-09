// The game's side of the API (server/). With no VITE_API_URL the game plays locally, as before.
import type { Action } from '../sim/actions';
import type { Outcome } from '../sim/battle';
import type { Opponent } from '../sim/bot';
import type { RunState } from '../sim/run';

const API_URL: string | undefined = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || undefined;
const PLAYER_KEY = 'buffetbattle.player';
const TIMEOUT_MS = 10_000;

export const online = () => API_URL !== undefined;

export interface Player {
  playerId: string;
  token: string;
  name: string;
}

export interface ServerRun {
  id: string;
  version: string;
  day: number;
  wins: number;
  lives: number;
  status: 'active' | 'won' | 'lost' | 'abandoned';
  state: RunState;
}

export interface Served {
  opponent: Opponent;
  seed: number;
  outcome: Outcome;
  run: ServerRun;
}

/** The server said no (status and reason), as opposed to not answering at all (Offline). */
export class Refused extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly reason?: string,
  ) {
    super(message);
  }
}
export class Offline extends Error {}

export function savedPlayer(): Player | null {
  try {
    return JSON.parse(localStorage.getItem(PLAYER_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function keepPlayer(p: Player) {
  try {
    localStorage.setItem(PLAYER_KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable: the player is signed in for this visit only.
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = savedPlayer()?.token;
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(API_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new Offline("Can't reach the kitchen server.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Refused(res.status, data.error ?? `The server said ${res.status}.`, data.reason);
  return data as T;
}

export async function signUp(name: string): Promise<Player> {
  const p = await request<Player>('POST', '/players', { name });
  keepPlayer(p);
  return p;
}

export async function rename(name: string): Promise<Player> {
  const { name: kept } = await request<{ name: string }>('PATCH', '/players/me', { name });
  const p = { ...savedPlayer()!, name: kept };
  keepPlayer(p);
  return p;
}

export const currentRun = async () => (await request<{ run: ServerRun | null }>('GET', '/runs/current')).run;
export const startRun = async () => (await request<{ run: ServerRun }>('POST', '/runs')).run;
export const serveDay = (runId: string, body: { day: number; version: string; actions: Action[]; plateHash: string }) => request<Served>('POST', `/runs/${runId}/serve`, body);
