// The Worker's bindings (wrangler.jsonc), plus the migrations the tests apply.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ALLOWED_ORIGINS: string;
    PLAYER_LIMIT: RateLimit;
    SIGNUP_LIMIT: RateLimit;
    /** The dev site's key (a secret: wrangler secret put ADMIN_KEY). */
    ADMIN_KEY?: string;
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }
  interface GlobalProps {
    mainModule: typeof import('./index');
  }
}
type Env = Cloudflare.Env;
