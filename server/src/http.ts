// Small HTTP helpers: JSON responses, errors, size-limited bodies and CORS.

/** Thrown anywhere in a handler; becomes `{ error }` with this status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const MAX_BODY = 64 * 1024;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** The request's JSON body, refused when it's over 64 KB, isn't JSON or isn't an object. */
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) throw new HttpError(413, 'Request too large.');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Request too large.');
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, 'Body is not JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Body must be an object.');
  return body as Record<string, unknown>;
}

/** The game's own site, and localhost for development. */
export function allowedOrigin(origin: string | null, env: Env): string | null {
  if (!origin) return null;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).includes(origin) ? origin : null;
}

export function withCors(res: Response, origin: string | null): Response {
  if (!origin) return res;
  const out = new Response(res.body, res);
  out.headers.set('access-control-allow-origin', origin);
  out.headers.set('access-control-allow-methods', 'GET, POST, PATCH, OPTIONS');
  out.headers.set('access-control-allow-headers', 'authorization, content-type');
  out.headers.set('access-control-max-age', '86400');
  out.headers.append('vary', 'origin');
  return out;
}
