import { describe, expect, it } from 'vitest';
import { type Action, applyAction, canonical, plateHash, replayDay } from './actions';
import { simulateBattle } from './battle';
import { botPrep, generateGhost } from './bot';
import { type RunState, finishBattle, isOver, newRun, nextSeed, serve } from './run';
import { Rng } from './rng';

/** The run's state without the growth log, which is only a note for the UI's animations. */
const stateOf = (run: RunState) => canonical({ ...run, growth: [] });

/** A full bot run, day by day: each day's morning state and the actions the bot took. */
function* botDays(seed: number) {
  const run = newRun(seed);
  while (!isOver(run)) {
    const morning = structuredClone(run);
    const log: Action[] = [];
    botPrep(run, log);
    const plate = serve(run);
    yield { morning, log, run, plate };
    const ghost = generateGhost(run.turn, nextSeed(run), true);
    finishBattle(run, simulateBattle(plate, ghost, nextSeed(run)).outcome);
  }
}

describe('day replay', () => {
  it('rebuilds the same state and plate from the morning and the log, every day of many runs', () => {
    let days = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (const { morning, log, run, plate } of botDays(seed)) {
        const replay = replayDay(morning, log);
        expect(replay.ok).toBe(true);
        if (!replay.ok) return;
        expect(plateHash(replay.plate)).toBe(plateHash(plate));
        expect(stateOf(replay.run)).toBe(stateOf(run));
        days++;
      }
    }
    expect(days).toBeGreaterThan(200);
  });

  it('leaves the morning state untouched', () => {
    const { morning, log } = botDays(7).next().value!;
    const before = canonical(morning);
    replayDay(morning, log);
    expect(canonical(morning)).toBe(before);
  });

  it('refuses a tampered log', () => {
    const days = [...botDays(3)].slice(0, 4);
    for (const { morning, log } of days) {
      // Buying the same market slot twice: the second has nothing there.
      const buy = log.find((a) => a.t === 'buy');
      if (!buy) continue;
      expect(replayDay(morning, [...log, buy, buy, buy, buy, buy, buy, buy]).ok).toBe(false);
    }
    // More refills than there is gold for.
    const { morning } = days[0];
    const refills: Action[] = Array.from({ length: morning.gold + 1 }, () => ({ t: 'refill' }));
    const replay = replayDay(morning, refills);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.index).toBe(morning.gold);
  });

  it('treats garbage as a failed action, never a crash', () => {
    const run = newRun(5);
    const junk = [
      { t: 'nope' },
      { t: 'buy', src: null, to: null },
      { t: 'buy', src: { area: 'market', index: 99 }, to: { area: 'plate', index: -1 } },
      { t: 'move', from: { area: 'attic', index: 0 }, to: { area: 'plate', index: 0 } },
      { t: 'sell', at: { area: 'plate', index: 1e9 } },
      { t: 'item', src: { area: 'special', index: 0 }, at: { area: 'plate', index: 0 }, flavor: 'umami' },
      { t: 'pick', index: -3 },
      {},
    ] as unknown as Action[];
    for (const a of junk) expect(applyAction(run, a).ok).toBe(false);
    expect(replayDay(newRun(5), junk).ok).toBe(false);
  });

  it('a failed action changes nothing', () => {
    const rng = new Rng(11);
    const area = () => rng.pick(['plate', 'fridge', 'overflow', 'market', 'special'] as const);
    const loc = () => ({ area: area(), index: rng.int(7) }) as never;
    let failures = 0;
    for (const { run } of botDays(21)) {
      const probe = structuredClone(run);
      for (let i = 0; i < 60; i++) {
        const a = rng.pick<Action>([
          { t: 'buy', src: loc(), to: loc() },
          { t: 'move', from: loc(), to: loc() },
          { t: 'sell', at: loc() },
          { t: 'item', src: loc(), at: loc() },
          { t: 'special' },
          { t: 'pick', index: rng.int(4) },
          { t: 'refill' },
        ]);
        const before = canonical(probe);
        if (!applyAction(probe, a).ok) {
          failures++;
          expect(canonical(probe), JSON.stringify(a)).toBe(before);
        }
      }
    }
    expect(failures).toBeGreaterThan(100);
  });

  it("the plate hash changes when the plate does", () => {
    const { plate } = botDays(9).next().value!;
    const tweaked = structuredClone(plate);
    const u = tweaked.find((x) => x)!;
    u.attack += 1;
    expect(plateHash(tweaked)).not.toBe(plateHash(plate));
    expect(plateHash(structuredClone(plate))).toBe(plateHash(plate));
  });
});
