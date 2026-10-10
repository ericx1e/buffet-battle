// Builds the Windows app: the game (build-game.mjs), packaged by electron-builder, ending as desktop/release/*.exe.
// electron-builder works in the system temp folder: inside the repo, Windows (antivirus or folder protection on
// Documents) blocks the folder rename it does while unpacking Electron.
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const work = join(tmpdir(), 'buffet-battle-release');
const out = join(here, 'release');

execSync('node build-game.mjs', { cwd: here, stdio: 'inherit' });
rmSync(work, { recursive: true, force: true });
execSync(`npx electron-builder -c.directories.output="${work}"`, { cwd: here, stdio: 'inherit' });
mkdirSync(out, { recursive: true });
for (const f of readdirSync(work).filter((f) => f.endsWith('.exe'))) {
  copyFileSync(join(work, f), join(out, f));
  console.log(`\n${join(out, f)}`);
}
