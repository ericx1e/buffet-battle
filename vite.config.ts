import { type Plugin } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Cloudflare Web Analytics (visits, countries, devices; no cookies) on the game page, when the build has a beacon
 * token in VITE_CF_BEACON. The dev site isn't counted.
 */
function webAnalytics(): Plugin {
  return {
    name: 'cf-web-analytics',
    transformIndexHtml(html, ctx) {
      const token = process.env.VITE_CF_BEACON;
      if (!token || !/^[\w-]+$/.test(token) || ctx.filename.endsWith('admin.html')) return html;
      return html.replace('</body>', `  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${token}"}'></script>\n  </body>`);
    },
  };
}

// Relative asset paths, so the built app (dist/) works from any folder or subpath it's hosted at.
export default defineConfig({
  base: './',
  plugins: [webAnalytics()],
  // The game, the dev site (admin.html) that reads the API's admin routes, and the privacy and terms pages.
  build: { rollupOptions: { input: { main: 'index.html', admin: 'admin.html', privacy: 'privacy.html', terms: 'terms.html' } } },
  // server/ has its own tests, run in the Workers runtime (cd server && npm test).
  test: { exclude: [...configDefaults.exclude, 'server/**'] },
});
