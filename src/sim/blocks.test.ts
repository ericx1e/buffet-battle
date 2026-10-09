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

  it('baste: every friend gets double Crust and healing, wherever it stands', () => {
    const baster = food('t_baster', 1, 60, [], { aura: 'baste' });
    const cruster = food('t_cruster', 1, 60, [{ trigger: 'startOfBattle', effect: 'crust', target: 'self' }], {}, 3);
    // Slot 0 is next to the baster in slot 1; slot 5 (behind slot 2) is not.
    const crustAt = (basterCopies: number, slot: number) => {
      const r = simulateBattle(plate(inst(cruster), inst(baster, { copies: basterCopies }), inst(wall), null, null, inst(cruster)), plate(inst(wall)), 1);
      return Math.max(...r.frames.map((f) => f.plates[0][slot]?.crust ?? 0));
    };
    expect(crustAt(1, 0)).toBe(6);
    expect(crustAt(1, 5)).toBe(6);
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
  it('Burn deals its damage at the end of each round, then halves', () => {
    const burner = food('t_burner', 1, 60, [{ trigger: 'startOfBattle', effect: 'burn', target: 'enemyInLane' }], {}, 6);
    const r = simulateBattle(plate(inst(burner)), plate(inst(wall)), 1);
    expect(texts(r)).toContain('t_wall burns for 6');
    expect(texts(r)).toContain('t_wall burns for 3');
    expect(texts(r)).toContain('t_wall burns for 1');
    expect(texts(r)).not.toContain('t_wall burns for 2');
  });

  it('Spicy x6: Burn on the enemy fades by only 1 a turn', () => {
    // Rich: it alone counts as 6 Spicy foods. Burn 6 at the start, +2 from each of its spicy attacks, -1 a turn.
    const burner = food('t_burner6', 1, 60, [{ trigger: 'startOfBattle', effect: 'burn', target: 'enemyInLane' }], { flavor: 'spicy', rich: true }, 6);
    const r = simulateBattle(plate(inst(burner)), plate(inst(wall, { hp: 200 })), 1);
    for (const n of [8, 9, 10]) expect(texts(r)).toContain(`t_wall burns for ${n}`);
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

  it('escalate grows with each of its own attacks: one target, then the front row, then every enemy', () => {
    const swell = food('t_swell', 2, 200, [], { attackPattern: 'escalate' });
    const r = simulateBattle(plate(inst(swell)), plate(inst(wall), inst(wall), null, inst(wall)), 1);
    const hpAt = (round: number, slot: number) => [...r.frames].reverse().find((f) => f.round === round)!.plates[1][slot]!.hp;
    expect(hpAt(1, 1)).toBe(60); // first attack: one target
    expect(hpAt(2, 1)).toBeLessThan(60); // second: the whole front row
    expect(hpAt(2, 3)).toBe(60);
    expect(hpAt(3, 3)).toBeLessThan(60); // third: every enemy
  });

  it('attacking twice makes an escalating attack grow twice as fast', () => {
    const swell = food('t_swell', 2, 200, [], { attackPattern: 'escalate' });
    const coffee = food('t_coffee', 1, 60, [{ trigger: 'startOfBattle', effect: 'extraAttacks', target: 'allFriends', values: [3, 3, 3] }]);
    const r = simulateBattle(plate(inst(swell), null, null, null, null, inst(coffee)), plate(inst(wall), inst(wall), null, inst(wall)), 1); // the coffee waits in the back row
    const hpAt = (round: number, slot: number) => [...r.frames].reverse().find((f) => f.round === round)!.plates[1][slot]!.hp;
    expect(hpAt(1, 1)).toBeLessThan(60); // its second swing on turn 1 already hits the front row
    expect(hpAt(2, 3)).toBeLessThan(60); // and by turn 2, every enemy
  });

  it('a second attack is its own moment, after the lane attacks', () => {
    const twice = food('t_twice', 2, 60, [{ trigger: 'startOfBattle', effect: 'extraAttacks', values: [1, 1, 1] }]);
    const r = simulateBattle(plate(inst(twice)), plate(inst(wall)), 1);
    const i = r.frames.findIndex((f) => f.text.includes('t_twice attacks again'));
    expect(i).toBeGreaterThan(0);
    expect(r.frames[i].marks.some((m) => m.side === 0 && m.kind === 'attack')).toBe(true);
    expect(r.frames[i - 1].text).toContain('lane'); // the lane's first swings came just before
  });

  it('an echoed ability goes off again in its own frame', () => {
    const pinger = food('t_ping', 1, 60, [{ trigger: 'startOfBattle', effect: 'damage', target: 'enemyInLane', values: [1, 1, 1] }]);
    const echo = food('t_echo', 1, 60, [], { aura: 'echo' });
    const r = simulateBattle(plate(inst(pinger), null, null, inst(echo)), plate(inst(wall)), 1);
    const first = r.frames.findIndex((f) => f.text.startsWith('t_ping hits'));
    const again = r.frames.findIndex((f) => f.text.startsWith('Echo! t_ping hits'));
    expect(first).toBeGreaterThan(0);
    expect(again).toBeGreaterThan(first);
  });

  it('hitsHarder: attacks deal more to enemies with that status', () => {
    const payoff = food('t_payoff', 2, 200, [], { hitsHarder: 'burn', values: [3, 3, 3] });
    const burner = food('t_burner', 1, 60, [{ trigger: 'startOfBattle', effect: 'burn', target: 'enemyInLane', values: [1, 1, 1] }]);
    const plain = simulateBattle(plate(inst(payoff)), plate(inst(wall)), 1);
    const burning = simulateBattle(plate(inst(payoff), null, null, inst(burner)), plate(inst(wall)), 1);
    expect(texts(burning)).not.toBe(texts(plain));
    expect(lowest(burning, 1, 0)).toBeLessThan(lowest(plain, 1, 0) - 2);
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

  it('flavor bonuses grow at 2, 4 and 6 different foods', () => {
    const hots = Array.from({ length: 6 }, (_, i) => food(`t_hot_${i}`, 1, 10, [], { flavor: 'spicy' }));
    const spicy = (n: number) => texts(simulateBattle(plate(...hots.slice(0, n).map((h) => inst(h))), plate(inst(wall)), 1));
    expect(spicy(2)).toContain('Spicy x2: spicy attacks Burn 1');
    expect(spicy(4)).toContain('Spicy x4: spicy attacks Burn 2');
    expect(spicy(6)).toContain('Burn fades by only 1');
  });

  it('copies of one food count once toward a flavor', () => {
    const hot = food('t_hot_same', 1, 10, [], { flavor: 'spicy' });
    const r = simulateBattle(plate(inst(hot), inst(hot), inst(hot), inst(hot)), plate(inst(wall)), 1);
    expect(texts(r)).not.toContain('Spicy x');
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

describe('projectiles and patterns', () => {
  const thrower = (id: string, pattern: 'shot' | 'lob' | 'spray' | 'volley', attack = 2) => food(id, attack, 60, [], { attackPattern: pattern });
  /** HP each enemy slot lost in the first turn. */
  const lostTurn1 = (r: BattleResult) => {
    const before = [...r.frames].reverse().find((f) => f.round === 0)!;
    const after = [...r.frames].reverse().find((f) => f.round === 1)!;
    return [0, 1, 2, 3, 4, 5].map((s) => (before.plates[1][s]?.hp ?? 0) - (after.plates[1][s]?.hp ?? 0));
  };

  it('a shot is thrown from the back row too, at the enemy in its lane', () => {
    const r = simulateBattle(plate(inst(wall), null, null, inst(thrower('t_shot', 'shot', 3))), plate(inst(wall)), 1);
    expect(texts(r)).toContain('t_shot shoots');
    expect(lostTurn1(r)[0]).toBe(2 + 1); // the bean for half its 3 attack (rounded up), plus our wall's attack
  });

  it('an opening throw flies once, then the food attacks like any other; a volley flies every turn', () => {
    const shots = texts(simulateBattle(plate(inst(thrower('t_shot', 'shot', 3))), plate(inst(wall)), 1)).match(/t_shot shoots/g) ?? [];
    expect(shots.length).toBe(1);
    const volleys = texts(simulateBattle(plate(inst(wall), null, null, inst(thrower('t_volley', 'volley'))), plate(inst(wall)), 1)).match(/t_volley throws/g) ?? [];
    expect(volleys.length).toBeGreaterThan(1);
  });

  it('a throw of several projectiles hits a different enemy with each, all in one step', () => {
    const shooter = food('t_shot3', 2, 60, [], { attackPattern: 'shot', throwDamage: 2, values: [3, 3, 3] });
    const r = simulateBattle(plate(inst(shooter)), plate(inst(wall), inst(wall), inst(wall)), 1);
    const shots = r.frames.filter((f) => f.text.includes('t_shot3 shoots at'));
    expect(shots.length).toBe(1);
    const targets = shots[0].marks.filter((m) => m.side === 1 && m.kind === 'hit').map((m) => m.slot);
    expect(new Set(targets).size).toBe(3);
  });

  it('after its opening shot, a front-row thrower attacks in melee', () => {
    const r = simulateBattle(plate(inst(thrower('t_shot', 'shot', 3))), plate(inst(wall)), 1);
    const hpAfter = (round: number) => [...r.frames].reverse().find((f) => f.round === round)!.plates[1][0]!.hp;
    expect(hpAfter(1) - hpAfter(2)).toBe(3); // its full attack, in melee
    expect(texts(r)).not.toMatch(/Turn 2 · t_shot shoots/);
  });

  it('a lob hits the enemy back row of its lane', () => {
    const r = simulateBattle(plate(inst(wall), null, null, inst(thrower('t_lob', 'lob'))), plate(inst(wall), null, null, inst(wall)), 1);
    expect(lostTurn1(r)[3]).toBe(1); // half of 2
  });

  it('a volley throws its level number of balls, each at a different random enemy for its attack', () => {
    const baller = food('t_volley3', 3, 60, [], { attackPattern: 'volley', values: [2, 2, 2] });
    const r = simulateBattle(plate(null, null, null, inst(baller)), plate(inst(wall), inst(wall), inst(wall)), 1);
    const balls = r.frames.filter((f) => f.round === 1 && f.text.includes('t_volley3 throws at'));
    expect(balls.length).toBe(1); // both balls fly in one step
    const targets = balls[0].marks.filter((m) => m.side === 1 && m.kind === 'hit');
    expect(targets.length).toBe(2);
    expect(new Set(targets.map((m) => m.slot)).size).toBe(2);
    expect(targets.every((m) => m.amount === 3)).toBe(true);
  });

  it('fork hits both other lanes, from a side lane too', () => {
    const forker = food('t_fork', 3, 60, [], { attackPattern: 'fork' });
    const r = simulateBattle(plate(inst(forker)), plate(inst(wall), inst(wall), inst(wall)), 1);
    expect(lostTurn1(r).slice(0, 3)).toEqual([0, 4, 4]); // 3, +1 at level 1
  });
});

describe('Rot and the new triggers', () => {
  it('Burn and Rot have no cap', () => {
    const burner = food('t_burn9', 1, 60, [{ trigger: 'startOfBattle', effect: 'burn', target: 'enemyInLane' }], {}, 9);
    expect(highest(simulateBattle(plate(inst(burner)), plate(inst(wall)), 1), 1, 0, 'burn')).toBe(9);
    const rotter = food('t_rot7', 1, 60, [{ trigger: 'startOfBattle', effect: 'rot', target: 'enemyInLane' }], {}, 7);
    expect(highest(simulateBattle(plate(inst(rotter)), plate(inst(wall, { hp: 200 })), 1), 1, 0, 'rot')).toBe(7);
  });

  it('a summon with no room waits for a friend being eaten that turn, then takes its place', () => {
    // A full plate; the egg-like food in front is hit for lethal and summons on that hit.
    const cracker = food('t_cracker', 1, 1, [{ trigger: 'hit', effect: 'summon', summon: { id: 'yolk' } }], {}, 2);
    const r = simulateBattle(plate(inst(cracker), inst(wall), inst(wall), inst(wall), inst(wall), inst(wall)), plate(inst(brute)), 1);
    const eaten = r.frames.findIndex((f) => f.text.includes('t_cracker got eaten'));
    expect(eaten).toBeGreaterThan(0);
    const after = r.frames.slice(eaten).find((f) => f.text.includes('t_cracker summons a Yolk'));
    expect(after).toBeTruthy();
    expect(after!.plates[0].some((u) => u?.defId === 'yolk')).toBe(true);
  });

  it('friendHealed: a neighbour that gets healed gains attack', () => {
    const healer = food('t_healer', 1, 60, [{ trigger: 'round', effect: 'heal', target: 'adjacentFriends' }]);
    const cocoa = food('t_cocoa', 1, 60, [{ trigger: 'friendHealed', effect: 'buff', target: 'thatFriend', hp: 0, max: 4 }]);
    const hurt = food('t_hurt', 1, 60);
    // The hurt food (slot 1) sits between the healer (0) and the cocoa (2).
    const r = simulateBattle(plate(inst(healer), inst(hurt, { hp: 10 }), inst(cocoa)), plate(inst(wall)), 1);
    expect(highest(r, 0, 1, 'attack')).toBeGreaterThan(1);
  });

  it('crustBlock: Crust blocking a hit on a neighbour bites the attacker', () => {
    const crackle = food('t_crackle', 1, 60, [{ trigger: 'crustBlock', effect: 'damage', target: 'attacker', max: 4 }], {}, 2);
    const brute2 = food('t_hitter2', 3, 60);
    const r = simulateBattle(plate(inst(wall, { item: 'saltShaker' }), null, null, inst(crackle)), plate(inst(brute2)), 1);
    // Turn 1: the wall's Crust blocks the 3-damage hit, so the hitter takes 2 back, plus the wall's own 1.
    const end1 = [...r.frames].reverse().find((f) => f.round === 1)!;
    expect(60 - end1.plates[1][0]!.hp).toBe(2 + 1);
  });
});

describe('round of October 9', () => {
  it('extra attacks from two sources stack: an attack-twice ability and Chopsticks make three swings', () => {
    const twice = food('t_twice2', 2, 60, [{ trigger: 'startOfBattle', effect: 'extraAttacks', values: [1, 1, 1] }]);
    const r = simulateBattle(plate(inst(twice, { item: 'chopsticks' })), plate(inst(wall)), 1);
    const again = (round: number) => r.frames.filter((f) => f.round === round && f.text.includes('t_twice2 attacks again')).length;
    expect(again(1)).toBe(2); // both sources: three swings
    expect(again(2)).toBe(1); // only Chopsticks' second attack is left
    expect(again(3)).toBe(0);
  });

  it("Spicy's Burn lands on everything an area attack hits, not just its main target", () => {
    const splasher = food('t_hotsplash', 3, 60, [], { flavor: 'spicy', attackPattern: 'splash' });
    const spicy = food('t_spicy2', 1, 60, [], { flavor: 'spicy' }); // Spicy x2: spicy attacks Burn
    const r = simulateBattle(plate(null, inst(splasher), null, null, inst(spicy)), plate(inst(wall), inst(wall), inst(wall)), 1);
    expect(highest(r, 1, 1, 'burn')).toBeGreaterThan(0); // the main target
    expect(Math.max(highest(r, 1, 0, 'burn'), highest(r, 1, 2, 'burn'))).toBeGreaterThan(0); // and a splashed one
  });

  it('Rotting enemies lose attack every turn (Grapefruit); others keep theirs', () => {
    const rotter = food('t_rotter1', 1, 60, [{ trigger: 'startOfBattle', effect: 'rot', target: 'enemyInLane' }]);
    const fruit = food('t_fruit', 1, 60, [{ trigger: 'round', effect: 'debuff', target: 'rottingEnemies' }], {}, 2);
    const r = simulateBattle(plate(inst(rotter), null, null, inst(fruit)), plate(inst(wall, { attack: 20 }), inst(wall, { attack: 20 })), 1);
    const at = (round: number, slot: number) => [...r.frames].reverse().find((f) => f.round === round)!.plates[1][slot]!.attack;
    expect(at(2, 0)).toBe(20 - 2 * 2); // the Rotting one, two turns in
    expect(at(2, 1)).toBe(20);
  });

  it('Crust broken anywhere on your plate: that food gains attack (Crème Brûlée); not the enemy\'s', () => {
    const brulee = food('t_brulee', 1, 60, [{ trigger: 'plateCrustBreak', effect: 'buff', target: 'thatFriend', hp: 0 }], {}, 3);
    const crusty = food('t_crusty', 1, 60, [{ trigger: 'startOfBattle', effect: 'crust', target: 'self' }], {}, 2);
    const r = simulateBattle(plate(inst(crusty), null, null, null, inst(brulee)), plate(inst(crusty, { attack: 5 })), 1);
    expect(highest(r, 0, 0, 'attack')).toBe(1 + 3); // its Crust broke on turn 1
    expect(highest(r, 1, 0, 'attack')).toBe(5); // the enemy's broke too, but the brûlée isn't theirs
  });
});

describe('one step per reaction and per throw', () => {
  it('a food reacting to several things at once does it in one step', () => {
    const brulee = food('t_brulee2', 1, 60, [{ trigger: 'plateCrustBreak', effect: 'buff', target: 'thatFriend', hp: 0 }], {}, 2);
    const crusty = food('t_crusty2', 1, 60, [{ trigger: 'startOfBattle', effect: 'crust', target: 'self' }], {}, 1);
    // Two crusted friends in front lose their Crust in the same attack.
    const r = simulateBattle(plate(inst(crusty), inst(crusty), null, null, null, inst(brulee)), plate(inst(wall, { attack: 5 }), inst(wall, { attack: 5 })), 1);
    const steps = r.frames.filter((f) => f.round === 1 && f.text.includes('t_brulee2'));
    expect(steps.length).toBe(1);
    expect(highest(r, 0, 0, 'attack')).toBe(3);
    expect(highest(r, 0, 1, 'attack')).toBe(3);
  });

  it('scatter (Pomegranate): every turn, from the back row, half its attack at its level number of enemies, in one step', () => {
    const seeds = food('t_seeds', 4, 60, [], { attackPattern: 'scatter', values: [3, 3, 3] });
    const r = simulateBattle(plate(null, null, null, inst(seeds)), plate(inst(wall), inst(wall), inst(wall)), 1);
    for (const round of [1, 2]) {
      const bursts = r.frames.filter((f) => f.round === round && f.text.includes('t_seeds bursts at'));
      expect(bursts.length).toBe(1);
      const hits = bursts[0].marks.filter((m) => m.side === 1 && m.kind === 'hit');
      expect(new Set(hits.map((m) => m.slot)).size).toBe(3);
      expect(hits.every((m) => m.amount === 2)).toBe(true);
    }
  });
});
