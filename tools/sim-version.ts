// The game version: a short hash of the rules (every non-test file in src/sim). Ghosts only meet ghosts of the same
// version, so a change to the rules starts a fresh pool. Usage: npm run version (writes src/sim/version.ts; a test
// fails while it is out of date).
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SIM = fileURLToPath(new URL('../src/sim/', import.meta.url));
const OUT = `${SIM}version.ts`;

export function simVersion(): string {
  const hash = createHash('sha256');
  const files = readdirSync(SIM)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'version.ts')
    .sort();
  for (const f of files) hash.update(`${f}\n${readFileSync(SIM + f, 'utf8').replace(/\r\n/g, '\n')}\n`);
  return hash.digest('hex').slice(0, 10);
}

export const versionFile = (v: string) =>
  `// Written by \`npm run version\` (tools/sim-version.ts): a hash of the rules in src/sim. Do not edit.\nexport const GAME_VERSION = '${v}';\n`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const v = simVersion();
  writeFileSync(OUT, versionFile(v));
  console.log(`GAME_VERSION ${v}`);
}
