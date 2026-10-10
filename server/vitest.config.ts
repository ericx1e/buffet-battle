import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
// A stand-in for Google's signing keys (made for the tests only).
import google from './test/google-keys.json';

// Tests run inside the Workers runtime against a local D1, migrated fresh for each test file.
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' }, miniflare: { bindings: { TEST_MIGRATIONS: migrations, ADMIN_KEY: 'test-admin-key', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_JWKS: JSON.stringify(google.public) } } })],
    test: { setupFiles: ['./test/apply-migrations.ts'] },
  };
});
