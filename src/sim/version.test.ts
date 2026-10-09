import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simVersion, versionFile } from '../../tools/sim-version';

describe('game version', () => {
  it('matches the rules (run `npm run version` after changing src/sim)', () => {
    const current = readFileSync(new URL('./version.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    expect(current).toBe(versionFile(simVersion()));
  });
});
