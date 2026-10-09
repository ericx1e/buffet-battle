// The Worker's bindings (wrangler.jsonc), plus the migrations the tests apply.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ALLOWED_ORIGINS: string;
    PLAYER_LIMIT: RateLimit;
    SIGNUP_LIMIT: RateLimit;
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }
  interface GlobalProps {
    mainModule: typeof import('./index');
  }
}
type Env = Cloudflare.Env;
