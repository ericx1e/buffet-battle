import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Tests run inside the Workers runtime against a local D1, migrated fresh for each test file.
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' }, miniflare: { bindings: { TEST_MIGRATIONS: migrations, ADMIN_KEY: 'test-admin-key' } } })],
    test: { setupFiles: ['./test/apply-migrations.ts'] },
  };
});
