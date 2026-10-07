import { defineConfig } from 'vite';

// Relative asset paths, so the built app (dist/) works from any folder or subpath it's hosted at.
export default defineConfig({
  base: './',
});
