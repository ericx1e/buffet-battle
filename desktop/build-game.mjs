// Builds the web game for the desktop app into desktop/game: online against the live API, with no web analytics, no
// service worker (the files are on disk) and no Google button (Google doesn't allow its sign-in inside an app window;
// desktop sign-in will go through Steam).
import { execSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = fileURLToPath(new URL('game', import.meta.url));
const env = { ...process.env, VITE_API_URL: process.env.VITE_API_URL ?? 'https://api.buffetbattle.com', VITE_DESKTOP: '1', VITE_CF_BEACON: '', VITE_GOOGLE_CLIENT_ID: '' };
execSync('npx vite build --outDir dist-desktop --emptyOutDir', { cwd: root, env, stdio: 'inherit' });
rmSync(out, { recursive: true, force: true });
cpSync(`${root}/dist-desktop`, out, { recursive: true });
rmSync(`${root}/dist-desktop`, { recursive: true, force: true });
// The dev site isn't part of the game.
rmSync(`${out}/admin.html`, { force: true });
