// The Worker's bindings (wrangler.jsonc), plus the migrations the tests apply.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ALLOWED_ORIGINS: string;
    PLAYER_LIMIT: RateLimit;
    SIGNUP_LIMIT: RateLimit;
    /** The dev site's key (a secret: wrangler secret put ADMIN_KEY). */
    ADMIN_KEY?: string;
    /** The game's Google OAuth client ID (a GitHub repository variable, passed at deploy); unset: no Google sign-in. */
    GOOGLE_CLIENT_ID?: string;
    /** Tests only: Google's signing keys as a JWKS JSON string, instead of fetching them. */
    GOOGLE_JWKS?: string;
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }
  interface GlobalProps {
    mainModule: typeof import('./index');
  }
}
type Env = Cloudflare.Env;
