import { configDefaults, defineConfig } from 'vitest/config';

// Relative asset paths, so the built app (dist/) works from any folder or subpath it's hosted at.
export default defineConfig({
  base: './',
  // server/ has its own tests, run in the Workers runtime (cd server && npm test).
  test: { exclude: [...configDefaults.exclude, 'server/**'] },
});
