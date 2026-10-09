import { describe, expect, it } from 'vitest';
import { NAME_FIRST, NAME_SECOND, nameProblem, randomName, tidyName } from './names';

describe('chef names', () => {
  it('every name from the lists is allowed', () => {
    for (const a of NAME_FIRST) for (const b of NAME_SECOND) expect(nameProblem(`${a} ${b}`), `${a} ${b}`).toBeNull();
    expect(randomName(() => 0)).toBe(`${NAME_FIRST[0]} ${NAME_SECOND[0]}`);
  });

  it('refuses rude names, however they are spelled', () => {
    for (const name of ['fuck', 'F u c k', 'FUUUCK', 'Sh1t Chef', 'b!tch', 'n1gg3r', 'Big Ass', 'a$$', 'Ra.pe', 'Sexy Chef', 'p0rn', 'Hitler', 'cum', 'Fag'])
      expect(nameProblem(name), name).not.toBeNull();
  });

  it('allows ordinary names that contain rude letters', () => {
    for (const name of ['Hancock', 'Scunthorpe', 'Canal Cook', 'Nigel', 'Cucumber', 'Cumin Queen', 'Grape Ape', 'Torpedo', 'Dickens', 'Fast As Wind', 'Chef Ho', 'Shiitake', 'Analyst', 'Spice Girl'])
      expect(nameProblem(name), name).toBeNull();
  });

  it('refuses reserved names, bad characters and lengths', () => {
    for (const name of ['admin', 'Bot Chef #12', 'BotChef', '', 'x'.repeat(21), '<b>hi</b>', 'a\u0000b']) expect(nameProblem(name), name).not.toBeNull();
    expect(tidyName('  Gordon   R. ')).toBe('Gordon R.');
  });
});
