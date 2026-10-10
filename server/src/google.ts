// Sign in with Google: the game gets an ID token (a JWT signed by Google) from Google's button and sends it here. We
// check its signature against Google's published keys, that it was made for our client ID, and that it hasn't
// expired; its "sub" is the Google account's stable id.
import { HttpError } from './http';

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

interface Jwk extends JsonWebKey {
  kid: string;
}

/** Google's keys, kept until the time their response says they may be cached for. */
let cache: { keys: Jwk[]; until: number } | null = null;

async function googleKeys(env: Env): Promise<Jwk[]> {
  // Tests hand the keys in (there is no Google to ask).
  if (env.GOOGLE_JWKS) return (JSON.parse(env.GOOGLE_JWKS) as { keys: Jwk[] }).keys;
  if (cache && cache.until > Date.now()) return cache.keys;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new HttpError(502, "Couldn't reach Google. Try again in a moment.");
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  cache = { keys: ((await res.json()) as { keys: Jwk[] }).keys, until: Date.now() + maxAge * 1000 };
  return cache.keys;
}

const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const decode = <T>(part: string): T => JSON.parse(new TextDecoder().decode(fromB64url(part))) as T;

/** The Google account behind an ID token, or 401 when the token isn't a valid one for this game. */
export async function verifyGoogle(env: Env, token: unknown): Promise<{ sub: string }> {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new HttpError(503, 'Google sign-in is not set up.');
  const bad = () => new HttpError(401, "Google sign-in didn't work. Try again.");
  if (typeof token !== 'string' || token.length > 4096) throw bad();
  const parts = token.split('.');
  if (parts.length !== 3) throw bad();
  let header: { alg?: string; kid?: string };
  let claims: { iss?: string; aud?: string; sub?: string; exp?: number };
  try {
    header = decode(parts[0]);
    claims = decode(parts[1]);
  } catch {
    throw bad();
  }
  if (header.alg !== 'RS256') throw bad();
  const jwk = (await googleKeys(env)).find((k) => k.kid === header.kid);
  if (!jwk) throw bad();
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64url(parts[2]), signed);
  if (!ok) throw bad();
  if (!ISSUERS.includes(claims.iss ?? '') || claims.aud !== clientId || typeof claims.sub !== 'string' || !claims.sub) throw bad();
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) throw bad();
  return { sub: claims.sub };
}
