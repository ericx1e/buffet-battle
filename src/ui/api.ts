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
export const goEndless = async (runId: string) => (await request<{ run: ServerRun }>('POST', `/runs/${runId}/endless`)).run;

/** The chef's card: name, whether it's linked to Google, and the win counter. */
export interface Me {
  playerId: string;
  name: string;
  google: boolean;
  /** Runs won. */
  trophies: number;
  /** The most courses an endless run reached, if any. */
  bestEndless: number | null;
}
export const me = () => request<Me>('GET', '/players/me');

// ---------- Sign in with Google ----------
// Google's own button gives the game an ID token; the server checks it and links the chef to the account.

const GOOGLE_CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;
export const googleReady = () => online() && GOOGLE_CLIENT_ID !== undefined;

/** Signs in with an ID token from Google's button: this device's chef is linked to the account, or becomes the account's chef. */
export async function googleSignIn(credential: string): Promise<Player> {
  const res = await request<{ playerId: string; token: string | null; name: string }>('POST', '/auth/google', { credential });
  const token = res.token ?? savedPlayer()?.token;
  if (!token) throw new Refused(500, 'Google sign-in went wrong. Try again.');
  const p = { playerId: res.playerId, token, name: res.name };
  keepPlayer(p);
  return p;
}

/** Forgets this device's chef (it stays linked to the Google account, to sign back into). */
export async function signOut() {
  await request('POST', '/auth/signout');
  try {
    localStorage.removeItem(PLAYER_KEY);
  } catch {
    // Nothing kept.
  }
}

interface Gis {
  accounts: { id: { initialize(o: object): void; renderButton(el: HTMLElement, o: object): void } };
}
let gis: Promise<Gis> | null = null;

/** Google's sign-in script, loaded the first time a button is shown. */
function loadGis(onCredential: (credential: string) => void): Promise<Gis> {
  gis ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      const g = (window as unknown as { google: Gis }).google;
      g.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r: { credential: string }) => onCredential(r.credential), ux_mode: 'popup' });
      resolve(g);
    };
    s.onerror = () => {
      gis = null;
      reject(new Offline("Can't reach Google."));
    };
    document.head.append(s);
  });
  return gis;
}

/** Puts Google's button into each empty `.google-slot` (renders replace them, so this runs after each one). */
export function mountGoogleButtons(root: HTMLElement, onCredential: (credential: string) => void) {
  const slots = [...root.querySelectorAll<HTMLElement>('.google-slot:not(.mounted)')];
  if (slots.length === 0 || !googleReady()) return;
  loadGis(onCredential)
    .then((g) => {
      for (const el of slots) {
        if (!el.isConnected || el.classList.contains('mounted')) continue;
        el.classList.add('mounted');
        g.accounts.id.renderButton(el, { type: 'standard', theme: 'outline', size: 'medium', text: 'signin_with', shape: 'rectangular', width: Number(el.dataset.width ?? 200) });
      }
    })
    .catch(() => slots.forEach((el) => (el.textContent = "Can't reach Google.")));
}
