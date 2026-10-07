// The bigger ability blocks (auras, statuses, attack patterns, copying, splitting, extra lives...) on small
// test-only foods. See "Designing foods" in DESIGN.md.
import { describe, expect, it } from 'vitest';
import { type BattleResult, RALLY_CAP, simulateBattle } from './battle';
import { registerUnit } from './data';
import type { AbilityDef, Plate, UnitDef, UnitInstance } from './types';

let uid = 1;
function food(id: string, attack: number, hp: number, abilities: AbilityDef[] = [], extra: Partial<UnitDef> = {}, amount = 1): UnitDef {
  const def: UnitDef = { id, name: id, cookedName: id, emoji: '🍽️', tier: 1, flavor: 'savory', attack, hp, values: [amount, amount, amount], abilities, text: '', ...extra };
  registerUnit(def);
  return def;
}
const inst = (def: UnitDef, over: Partial<UnitInstance> = {}): UnitInstance => ({ uid: uid++, defId: def.id, copies: 1, attack: def.attack, hp: def.hp, ...over });
const plate = (...units: (UnitInstance | null)[]): Plate => [...units, ...Array(6 - units.length).fill(null)];
const texts = (r: BattleResult) => r.frames.map((f) => f.text).join('|');
const count = (r: BattleResult, s: string) => texts(r).split(s).length - 1;
/** The lowest HP a slot of a side reached before overtime. */
const lowest = (r: BattleResult, side: 0 | 1, slot: number) => Math.min(...r.frames.filter((f) => f.round <= 10).map((f) => f.plates[side][slot]?.hp ?? Infinity));
const highest = (r: BattleResult, side: 0 | 1, slot: number, key: 'attack' | 'burn' | 'rot') =>
  Math.max(...r.frames.map((f) => f.plates[side][slot]?.[key] ?? 0));

const zapper = food('t_zapper', 1, 10, [{ trigger: 'startOfBattle', effect: 'damage', target: 'enemyInLane' }], {}, 2);
const wall = food('t_wall', 1, 60);
const brute = food('t_brute', 99, 99);

describe('auras', () => {
  it('echo: only the friend ahead of the echo food triggers twice', () => {
    const echo = food('t_echo', 1, 10, [], { aura: 'echo' });
    expect(count(simulateBattle(plate(inst(zapper)), plate(inst(wall)), 1), 't_zapper hits')).toBe(1);
    expect(count(simulateBattle(plate(inst(zapper), null, null, inst(echo)), plate(inst(wall)), 1), 't_zapper hits')).toBe(2);
    expect(count(simulateBattle(plate(inst(zapper), inst(echo)), plate(inst(wall)), 1), 't_zapper hits')).toBe(1);
  });

  it('rally: a neighbour gains +1 attack when its ability fires, up to the cap', () => {
    const ticker = food('t_ticker', 1, 60, [{ trigger: 'round', effect: 'damage', target: 'enemyInLane' }]);
    const rally = food('t_rally', 1, 60, [], { aura: 'rally' });
    const r = simulateBattle(plate(inst(ticker), inst(rally)), plate(inst(wall)), 1);
    expect(highest(r, 0, 0, 'attack')).toBe(1 + RALLY_CAP);
  });

});

describe('mythic rules', () => {
  // A food whose level 1/2/3 Start of battle buff is +1/+2/+3, with a cooked bonus of +10 attack.
  const cookable = food('t_cookable', 1, 30, [{ trigger: 'startOfBattle', effect: 'buff', target: 'self', hp: 0 }], {
    values: [1, 2, 3],
    cooked: { text: '', abilities: [{ trigger: 'startOfBattle', effect: 'buff', hp: 0, values: [10, 10, 10] }] },
  });
  const truffle = food('t_truffle', 1, 30, [], { aura: 'cook' });

  it('cook: the friend in its lane fights at level 3 with its cooked bonus; cooked, it reaches every friend', () => {
    // The truffle in the front middle (slot 1) and its lane partner behind it (slot 4); slot 0 is a different lane.
    const attackAt = (truffleCopies: number, slot: number) => {
      const p = plate(inst(cookable), inst(truffle, { copies: truffleCopies }), null, null, inst(cookable));
      const r = simulateBattle(p, plate(inst(wall)), 1);
      return { attack: highest(r, 0, slot, 'attack'), level: r.frames[3].plates[0][slot]?.level };
    };
    expect(attackAt(1, 4)).toEqual({ attack: 1 + 3 + 10, level: 3 });
    expect(attackAt(1, 0)).toEqual({ attack: 1 + 1, level: 1 });
    expect(attackAt(6, 0)).toEqual({ attack: 1 + 3 + 10, level: 3 });
  });

  it('baste: adjacent friends get double Crust and healing; cooked, every friend does', () => {
    const baster = food('t_baster', 1, 60, [], { aura: 'baste' });
    const cruster = food('t_cruster', 1, 60, [{ trigger: 'startOfBattle', effect: 'crust', target: 'self' }], {}, 3);
    // Slot 0 is next to the baster in slot 1; slot 5 (behind slot 2) is not.
    const crustAt = (basterCopies: number, slot: number) => {
      const r = simulateBattle(plate(inst(cruster), inst(baster, { copies: basterCopies }), inst(wall), null, null, inst(cruster)), plate(inst(wall)), 1);
      return Math.max(...r.frames.map((f) => f.plates[0][slot]?.crust ?? 0));
    };
    expect(crustAt(1, 0)).toBe(6);
    expect(crustAt(1, 5)).toBe(3);
    expect(crustAt(6, 5)).toBe(6);
  });

  it('ferment: Burn and Rot deal double damage in its lane only; cooked, in every lane', () => {
    const garlic = food('t_garlic', 1, 60, [], { aura: 'ferment' });
    const rotEveryone = food('t_rotall', 1, 60, [{ trigger: 'startOfBattle', effect: 'rot', target: 'allEnemies' }]);
    const r = simulateBattle(plate(inst(garlic), null, inst(rotEveryone)), plate(inst(wall), null, inst(wall)), 1);
    expect(texts(r)).toContain('t_wall rots for 2 (doubled)'); // lane 0, across from the garlic
    expect(texts(r)).toContain('t_wall rots for 1'); // lane 2
    const cooked = simulateBattle(plate(inst(garlic, { copies: 6 }), null, inst(rotEveryone)), plate(inst(wall), null, inst(wall)), 1);
    expect(texts(cooked)).not.toContain('t_wall rots for 1');
  });
});

describe('statuses', () => {
  it('Burn deals its damage at the end of each round, then fades by 1', () => {
    const burner = food('t_burner', 1, 60, [{ trigger: 'startOfBattle', effect: 'burn', target: 'enemyInLane' }], {}, 3);
    const r = simulateBattle(plate(inst(burner)), plate(inst(wall)), 1);
    expect(texts(r)).toContain('t_wall burns for 3');
    expect(texts(r)).toContain('t_wall burns for 2');
    expect(texts(r)).toContain('t_wall burns for 1');
  });

  it('Rot deals its damage every round and never fades', () => {
    const rotter = food('t_rotter', 1, 60, [{ trigger: 'startOfBattle', effect: 'rot', target: 'enemyInLane' }]);
    const r = simulateBattle(plate(inst(rotter)), plate(inst(wall)), 1);
    expect(count(r, 't_wall rots for 1')).toBeGreaterThanOrEqual(5);
  });

  it('Chill makes a food skip its next attack', () => {
    const chiller = food('t_chiller', 1, 200, [{ trigger: 'startOfBattle', effect: 'chill', target: 'enemyInLane' }]);
    const r = simulateBattle(plate(inst(chiller)), plate(inst(brute)), 1);
    expect(texts(r)).toContain('t_brute is chilled and skips an attack');
  });
});

describe('attack patterns', () => {
  it('pierce: also hits the food behind its target', () => {
    const lance = food('t_lance', 4, 60, [], { attackPattern: 'pierce' });
    const r = simulateBattle(plate(inst(lance)), plate(inst(wall), null, null, inst(wall)), 1);
    expect(lowest(r, 1, 3)).toBeLessThan(60);
  });

  it('fork: hits the neighbouring lanes instead of its own', () => {
    const fork = food('t_fork', 4, 60, [], { attackPattern: 'fork' });
    const r = simulateBattle(plate(null, inst(fork)), plate(inst(wall), inst(wall), inst(wall)), 1);
    expect(lowest(r, 1, 0)).toBeLessThan(60);
    expect(lowest(r, 1, 2)).toBeLessThan(60);
    expect(lowest(r, 1, 1)).toBe(60);
  });

  it('snipe: hits the back row of its lane first', () => {
    const sniper = food('t_sniper', 4, 60, [], { attackPattern: 'snipe' });
    const r = simulateBattle(plate(inst(sniper)), plate(inst(wall), null, null, inst(wall)), 1);
    expect(lowest(r, 1, 3)).toBeLessThan(60);
    expect(lowest(r, 1, 0)).toBe(60);
  });

  it('escalate: one target early, the back row by round 5', () => {
    const swell = food('t_swell', 2, 200, [], { attackPattern: 'escalate' });
    const r = simulateBattle(plate(inst(swell)), plate(inst(wall), null, null, inst(wall)), 1);
    const early = r.frames.filter((f) => f.round <= 4).map((f) => f.plates[1][3]?.hp ?? 60);
    expect(Math.min(...early)).toBe(60);
    expect(lowest(r, 1, 3)).toBeLessThan(60);
  });
});

describe('ability blocks', () => {
  it('max: a battle ability fires at most that many times', () => {
    const capped = food('t_capped', 1, 60, [{ trigger: 'round', effect: 'damage', target: 'enemyInLane', max: 2 }]);
    expect(count(simulateBattle(plate(inst(capped)), plate(inst(wall)), 1), 't_capped hits')).toBe(2);
  });

  it('friendAheadAttacks: the food behind reacts to the target of the friend ahead', () => {
    const kicker = food('t_kicker', 1, 60, [{ trigger: 'friendAheadAttacks', effect: 'burn', target: 'attacker' }]);
    const r = simulateBattle(plate(inst(wall), null, null, inst(kicker)), plate(inst(wall)), 1);
    expect(highest(r, 1, 0, 'burn')).toBeGreaterThan(0);
  });

  it('friendAheadHit: the food behind reacts to whoever hit the friend ahead', () => {
    const leaf = food('t_leaf', 1, 60, [{ trigger: 'friendAheadHit', effect: 'rot', target: 'attacker' }]);
    const r = simulateBattle(plate(inst(wall), null, null, inst(leaf)), plate(inst(wall)), 1);
    expect(highest(r, 1, 0, 'rot')).toBeGreaterThan(0);
  });

  it('flavor bonuses grow at 2, 4 and 6 foods', () => {
    const hot = food('t_hot', 1, 10, [], { flavor: 'spicy' });
    const spicy = (n: number) => texts(simulateBattle(plate(...Array.from({ length: n }, () => inst(hot))), plate(inst(wall)), 1));
    expect(spicy(2)).toContain('Spicy x2: spicy attacks Burn 1');
    expect(spicy(4)).toContain('Spicy x4: spicy attacks Burn 2');
    expect(spicy(6)).toContain('Burn never fades');
  });

  it('extra flavors: a food that gained a flavor counts toward it', () => {
    const plain = food('t_plain', 1, 10, [], { flavor: 'savory' });
    const hot = food('t_hot2', 1, 10, [], { flavor: 'spicy' });
    const r = simulateBattle(plate(inst(plain, { extraFlavors: ['spicy'] }), inst(hot)), plate(inst(wall)), 1);
    expect(texts(r)).toContain('Spicy x2');
  });

  it('allFlavors: counts toward every flavor bonus', () => {
    const rainbow = food('t_rainbow', 1, 10, [], { allFlavors: true, flavor: 'spicy' });
    const spicy = food('t_spicy', 1, 10, [], { flavor: 'spicy' });
    const sour = food('t_sour', 1, 10, [], { flavor: 'sour' });
    const r = simulateBattle(plate(inst(rainbow), inst(spicy), inst(sour)), plate(inst(wall)), 1);
    expect(texts(r)).toContain('Spicy x2');
    expect(texts(r)).toContain('Sour x2');
  });

  it('lives: comes back at full HP before it is eaten', () => {
    const cat = food('t_cat', 1, 5, [], { lives: 2 });
    const r = simulateBattle(plate(inst(cat)), plate(inst(brute)), 1);
    expect(r.frames.filter((f) => f.text.includes('comes back')).length).toBe(2);
  });

  it('split: fills empty slots with tokens when eaten', () => {
    food('t_crumb', 1, 1, [], { token: true });
    const pie = food('t_pie', 9, 9, [{ trigger: 'faint', effect: 'split', summon: { id: 't_crumb' } }]);
    expect(texts(simulateBattle(plate(inst(pie)), plate(inst(brute)), 1))).toContain('splits into');
  });

  it('copyAbility (early): takes the enemy across abilities, which then fire', () => {
    const mimic = food('t_mimic', 1, 10, [{ trigger: 'startOfBattle', effect: 'copyAbility', target: 'enemyInLane', early: true }]);
    const t = texts(simulateBattle(plate(inst(mimic)), plate(inst(zapper)), 1));
    expect(t).toContain('copies the abilities');
    expect(t).toContain('t_mimic hits');
  });

  it('bequeath: the lane partner inherits attack and max HP', () => {
    const giver = food('t_giver', 4, 3, [{ trigger: 'faint', effect: 'bequeath', target: 'laneFriends' }]);
    const r = simulateBattle([inst(giver), null, null, inst(wall), null, null], plate(inst(brute)), 1);
    expect(texts(r)).toContain('passes its strength');
  });

  it('grows: the amount goes up each time it fires', () => {
    const heater = food('t_heater', 1, 30, [{ trigger: 'round', effect: 'damage', target: 'allEnemies', grows: true }]);
    const r = simulateBattle(plate(inst(heater)), plate(inst(wall)), 1);
    const amounts = r.frames.map((f) => /t_heater hits .* for (\d+)/.exec(f.text)?.[1]).filter(Boolean).map(Number);
    expect(amounts.slice(0, 3)).toEqual([1, 2, 3]);
  });
});
