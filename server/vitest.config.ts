import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Tests run inside the Workers runtime against a local D1, migrated fresh for each test file.
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  // A stand-in for Google's signing keys (test/google-keys.json, made for the tests only).
  const google = JSON.parse(readFileSync('./test/google-keys.json', 'utf8'));
  return {
    plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' }, miniflare: { bindings: { TEST_MIGRATIONS: migrations, ADMIN_KEY: 'test-admin-key', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_JWKS: JSON.stringify(google.public) } } })],
    test: { setupFiles: ['./test/apply-migrations.ts'] },
  };
});
