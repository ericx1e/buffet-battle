import { describe, expect, it } from 'vitest';
import { MAX_ROUNDS, OVERTIME_AFTER, simulateBattle } from './battle';
import { applyAction } from './actions';
import { generateGhost } from './bot';
import { MARKET_UNITS, PAIRS, UNITS, flavorTally, partnersOf, flavorsOf, rarityOf, unitCost, unitDef } from './data';
import {
  INCOME,
  START_GOLD,
  buySpecial,
  buyUnit,
  endDay,
  finishBattle,
  freezeOffer,
  goEndless,
  isOver,
  isWon,
  interestCap,
  marketOdds,
  moveUnit,
  newRun,
  pickPack,
  reroll,
  rerollCost,
  sellPrice,
  sellUnit,
  serve,
  thawOffer,
  serveBlocker,
  useItem,
} from './run';
import { type Plate, type UnitInstance, levelOf } from './types';

let uid = 1;
function unit(defId: string, overrides: Partial<UnitInstance> = {}): UnitInstance {
  const def = unitDef(defId);
  return { uid: uid++, defId, copies: 1, attack: def.attack, hp: def.hp, ...overrides };
}

function plate(slots: Record<number, UnitInstance>): Plate {
  return [0, 1, 2, 3, 4, 5].map((i) => slots[i] ?? null);
}

describe('battle', () => {
  const frameText = (r: ReturnType<typeof simulateBattle>, s: string) => r.frames.some((f) => f.text.includes(s));

  it('is deterministic for the same plates and seed', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = generateGhost(8, seed);
      const b = generateGhost(8, seed + 1000);
      expect(simulateBattle(a, b, seed)).toEqual(simulateBattle(a, b, seed));
    }
  });

  it('Pepperoni Burns the enemy across when a friend is eaten; cooked, enemy Burn ticks twice', () => {
    const tank = () => plate({ 0: unit('cheese', { attack: 30, hp: 200 }), 1: unit('cheese', { attack: 30, hp: 200 }), 2: unit('cheese', { attack: 30, hp: 200 }) });
    const eaten = simulateBattle(plate({ 0: unit('lemon', { hp: 1 }), 4: unit('pepperoni', { hp: 200 }) }), tank(), 1);
    expect(frameText(eaten, 'Pepperoni: ')).toBe(true);

    const twice = simulateBattle(plate({ 0: unit('chili', { hp: 200 }), 3: unit('pepperoni', { copies: 6, hp: 200 }) }), plate({ 0: unit('cheese', { attack: 0, hp: 200 }) }), 1);
    expect(frameText(twice, ', then burns for ')).toBe(true);
    const once = simulateBattle(plate({ 0: unit('chili', { hp: 200 }), 3: unit('pepperoni', { hp: 200 }) }), plate({ 0: unit('cheese', { attack: 0, hp: 200 }) }), 1);
    expect(frameText(once, 'then burns')).toBe(false);
  });

  describe('the October 2026 foods', () => {
    const wall = (o: Partial<UnitInstance> = {}) => unit('cheese', { attack: 1, hp: 200, ...o });
    const text = (r: ReturnType<typeof simulateBattle>) => r.frames.map((f) => f.text).join('\n');

    it('Jalapeño Burns its lane when eaten; Cranberry Rots the enemy across', () => {
      const j = simulateBattle(plate({ 0: unit('jalapeno', { hp: 1 }), 1: wall() }), plate({ 0: unit('cheese', { attack: 9, hp: 200 }), 3: wall() }), 1);
      expect(text(j)).toContain('Jalapeño: enemy Cheese, enemy Cheese Burn 2');
      expect(text(simulateBattle(plate({ 0: unit('cranberry') }), plate({ 0: wall() }), 1))).toContain('Cranberry: enemy Cheese Rots 1');
    });

    it("Popsicle Chills the enemy across, and a Chilled enemy's abilities don't go off", () => {
      const apple = () => plate({ 0: unit('apple', { hp: 200 }) });
      const appleHeals = (r: ReturnType<typeof simulateBattle>) => r.frames.filter((f) => f.round === 1 && f.text.includes('enemy Apple:')).length;
      expect(appleHeals(simulateBattle(plate({ 0: wall() }), apple(), 1))).toBeGreaterThan(0);
      expect(appleHeals(simulateBattle(plate({ 0: unit('popsicle', { copies: 3, hp: 200 }) }), apple(), 1))).toBe(0);
    });

    it('Sorbet shatters a Chilled enemy every time it attacks', () => {
      const r = simulateBattle(plate({ 0: unit('iceCream', { copies: 3, hp: 200 }), 3: unit('sorbet') }), plate({ 0: wall() }), 1);
      // Ice Cream at level 2 Chills it 2: two Chilled attacks, two shatters.
      expect(r.frames.filter((f) => f.round <= 2 && f.text.includes('Sorbet: enemy Cheese shatters for 3')).length).toBe(2);
      // On its own, it Chills the enemy across every 3 turns, and shatters it.
      const solo = simulateBattle(plate({ 0: unit('sorbet', { hp: 200 }) }), plate({ 0: wall() }), 1);
      expect(text(solo)).toContain('Sorbet: enemy Cheese is Chilled 1');
      expect(text(solo)).toContain('Sorbet: enemy Cheese shatters for 3');
    });

    it('Frozen Peas Chill random enemies every 2 turns', () => {
      const r = simulateBattle(plate({ 0: wall(), 3: unit('frozenPeas', { copies: 3 }) }), plate({ 0: wall(), 1: wall(), 2: wall() }), 1);
      const chills = r.frames.filter((f) => f.text.startsWith('Frozen Peas:'));
      expect(chills.length).toBeGreaterThan(1);
      expect(chills.every((f) => f.round % 2 === 0)).toBe(true);
      expect(chills[0].text).toMatch(/enemy Cheese, enemy Cheese are Chilled 1/);
    });

    it('Shaved Ice Chills and drains the strongest enemy every turn', () => {
      const r = simulateBattle(plate({ 0: wall(), 3: unit('shavedIce') }), plate({ 0: wall({ attack: 9 }), 1: wall({ attack: 2 }) }), 1);
      expect(text(r)).toContain('Shaved Ice: enemy Cheese is Chilled 1 · Shaved Ice: enemy Cheese -1 attack');
    });

    it('Baked Alaska: an enemy whose Chill melts away Burns', () => {
      const r = simulateBattle(plate({ 0: unit('iceCream', { hp: 200 }), 3: unit('bakedAlaska') }), plate({ 0: wall() }), 1);
      expect(text(r)).toContain('Baked Alaska: enemy Cheese thaws and Burns 3');
    });

    it('a food that lobs in reaction throws each lob on its own', () => {
      // Two friends eaten at once: Cherries lob twice, as two moments.
      const r = simulateBattle(
        plate({ 0: unit('lemon', { hp: 1 }), 1: unit('lemon', { hp: 1 }), 5: unit('cherry', { hp: 200 }) }),
        plate({ 0: unit('cheese', { attack: 9, hp: 200 }), 1: unit('cheese', { attack: 9, hp: 200 }), 3: wall(), 4: wall() }),
        1,
      );
      const lobs = r.frames.filter((f) => f.text.startsWith('Cherries'));
      expect(lobs.length).toBeGreaterThanOrEqual(2);
      expect(lobs.every((f) => !f.text.includes('(x2)'))).toBe(true);
    });

    it('Habanero Salsa spreads the most Burn to the enemies beside', () => {
      const r = simulateBattle(plate({ 0: unit('chili', { hp: 200 }), 3: unit('habaneroSalsa') }), plate({ 0: wall(), 1: wall(), 3: wall() }), 1);
      expect(text(r)).toContain("Habanero Salsa: enemy Cheese's Burn spreads");
    });

    it('Macarons buff the back row per Sweet friend; Balsamic grows Rot', () => {
      const m = simulateBattle(plate({ 0: unit('apple'), 1: wall(), 3: unit('macarons'), 4: unit('honey') }), plate({ 0: wall() }), 1);
      expect(text(m)).toContain('Macarons: Macarons, Honey +1/+1');
      const b = simulateBattle(plate({ 0: unit('cranberry', { hp: 200 }), 3: unit('balsamic') }), plate({ 0: wall() }), 1);
      expect(text(b)).toContain('Balsamic Vinegar: enemy Cheese Rots 1');
    });

    it('Salt-Crusted Fish doubles its Crust before attacks; Fondue drains the enemy front row', () => {
      const f = simulateBattle(plate({ 0: unit('saltFish') }), plate({ 0: wall() }), 1);
      expect(text(f)).toContain('Salt-Crusted Fish: its Crust doubles to 8');
      const d = simulateBattle(plate({ 0: wall(), 3: unit('fondue') }), plate({ 0: wall({ attack: 6 }) }), 1);
      expect(text(d)).toContain('Fondue: enemy Cheese -1 attack; your front row +1 attack');
    });

    it('Croquembouche grows when a friend is eaten', () => {
      const r = simulateBattle(plate({ 0: unit('lemon', { hp: 1 }), 4: unit('croquembouche') }), plate({ 0: unit('cheese', { attack: 9, hp: 200 }) }), 1);
      expect(text(r)).toContain('Croquembouche: Croquembouche +3/+3');
    });

    it('Rice soaks up a neighbour\'s flavor (no cap) and does what its flavors say', () => {
      const run = newRun(1);
      const rice = unit('rice');
      run.plate = [rice, unit('chili'), null, null, null, null];
      expect(flavorsOf(rice)).toEqual([]);
      endDay(run); // day 1: odd, it only soaks every other night
      expect(flavorsOf(rice)).toEqual([]);
      run.turn = 2;
      endDay(run);
      expect(flavorsOf(rice)).toEqual(['spicy']);
      // It only soaks flavors it doesn't have: next to the same Chili, nothing new; next to a Lemon, sour.
      run.turn = 4;
      endDay(run);
      expect(flavorsOf(rice)).toEqual(['spicy']);
      run.plate[1] = unit('lemon');
      run.turn = 6;
      endDay(run);
      expect(flavorsOf(rice)).toEqual(['spicy', 'sour']);
      // Spicy follows a neighbour's attack; Sour grows when it's hit; Salty takes damage off hits; Sweet heals as it attacks.
      const r = simulateBattle(
        plate({ 0: unit('cheese', { attack: 3, hp: 200 }), 1: unit('rice', { extraFlavors: ['spicy', 'sour', 'salty'], hp: 200 }) }),
        plate({ 0: wall({ attack: 5 }), 1: wall({ attack: 4 }) }),
        1,
      );
      expect(text(r)).toContain('Rice hits enemy Cheese for 1');
      expect(text(r)).toContain('Rice toughens up: hits on it deal 1 less');
      expect(text(r)).toContain('Rice: Rice +1 attack');
      const hits = r.frames.flatMap((f) => f.marks.filter((m) => m.kind === 'hit' && m.side === 0 && m.slot === 1).map((m) => m.amount));
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]).toBe(3); // the middle lane Cheese hits for 4, less 1 armor
      const s = simulateBattle(plate({ 0: unit('rice', { extraFlavors: ['sweet'], hp: 20 }) }), plate({ 0: wall({ attack: 3 }) }), 1);
      expect(text(s)).toContain('Rice: Rice +1 HP');
      // Savory: end of day, a neighbour gains +1/+1 for good.
      const run2 = newRun(2);
      const friend = unit('cheese');
      run2.plate = [unit('rice', { extraFlavors: ['savory'] }), friend, null, null, null, null];
      run2.turn = 3;
      const before = friend.attack;
      endDay(run2);
      expect(friend.attack).toBe(before + 1);
    });
  });

  it('front foods trade hits in their lane until one is eaten', () => {
    const r = simulateBattle(plate({ 0: unit('cheese', { attack: 5, hp: 10 }) }), plate({ 0: unit('lemon', { attack: 1, hp: 4 }) }), 1);
    expect(r.outcome).toBe('win');
    expect(frameText(r, 'got eaten')).toBe(true);
  });

  it('a food with an empty lane attacks the nearest lane that has food', () => {
    // Our food is in the far lane; the only enemy is in the near lane.
    const r = simulateBattle(plate({ 0: unit('cheese', { attack: 5, hp: 30 }) }), plate({ 2: unit('cheese', { attack: 1, hp: 4 }) }), 1);
    expect(r.outcome).toBe('win');
  });

  it('the back row steps up when the front food is eaten', () => {
    const mine = plate({ 0: unit('lemon', { attack: 1, hp: 1 }), 3: unit('cheese', { attack: 10, hp: 30 }) });
    const r = simulateBattle(mine, plate({ 0: unit('cheese', { attack: 3, hp: 25 }) }), 1);
    expect(frameText(r, 'The back row steps up.')).toBe(true);
    expect(r.outcome).toBe('win');
  });

  it('Crust blocks damage before HP', () => {
    const r = simulateBattle(plate({ 0: unit('cheese', { attack: 1, hp: 3, item: 'saltShaker' }) }), plate({ 0: unit('cheese', { attack: 3, hp: 50 }) }), 1);
    const round1 = r.frames.find((f) => f.text.startsWith('Turn 1'))!;
    expect(round1.plates[0][0]!.hp).toBe(3); // 4 Crust blocked the whole 3-damage hit
  });

  it('Egg cracks into a Yolk on its first hit', () => {
    const r = simulateBattle(plate({ 0: unit('egg') }), plate({ 0: unit('cheese', { attack: 1, hp: 50 }) }), 1);
    expect(r.frames.some((f) => f.plates[0].some((u) => u?.defId === 'yolk'))).toBe(true);
  });

  it('Watermelon drops slices when hit', () => {
    const r = simulateBattle(plate({ 0: unit('watermelon', { hp: 40 }) }), plate({ 0: unit('cheese', { attack: 1, hp: 50 }) }), 1);
    expect(r.frames.some((f) => f.plates[0].some((u) => u?.defId === 'slice'))).toBe(true);
  });

  it('Apple gives HP to the friend with the least HP (there is no max HP)', () => {
    const r = simulateBattle(plate({ 0: unit('cheese', { attack: 1, hp: 40 }), 1: unit('cheese', { attack: 1, hp: 3 }), 3: unit('apple', { hp: 30 }) }), plate({ 0: unit('cheese', { attack: 1, hp: 50 }) }), 1);
    expect(frameText(r, 'Apple: Cheese +1 HP')).toBe(true);
    expect(r.frames.some((f) => (f.plates[0][1]?.hp ?? 0) > 3)).toBe(true); // past its starting HP
  });

  it('retaliation damage does not chain: Durian and Bacon cannot ping-pong forever', () => {
    const r = simulateBattle(plate({ 0: unit('durian', { hp: 60 }) }), plate({ 0: unit('bacon', { hp: 60 }) }), 1);
    expect(r.frames.filter((f) => f.round === 1).length).toBeLessThan(10);
  });

  it('after the round cap the plate with more HP left wins', () => {
    const wall = (hp: number) => unit('cheese', { attack: 1, hp });
    expect(simulateBattle(plate({ 0: wall(500) }), plate({ 0: wall(400) }), 1).outcome).toBe('win');
    expect(simulateBattle(plate({ 0: wall(500) }), plate({ 0: wall(500) }), 1).outcome).toBe('draw');
  });

  it('overtime ends stalemates with food eaten instead of at the cap', () => {
    const wall = (hp: number) => unit('cheese', { attack: 1, hp });
    const r = simulateBattle(plate({ 0: wall(80) }), plate({ 0: wall(70) }), 1);
    const last = r.frames[r.frames.length - 1];
    expect(r.outcome).toBe('win');
    expect(last.round).toBeGreaterThan(OVERTIME_AFTER);
    expect(last.round).toBeLessThan(MAX_ROUNDS);
    expect(last.plates[1].every((u) => !u)).toBe(true);
    expect(r.frames.some((f) => f.text.startsWith('Overtime!'))).toBe(true);
  });

  it('Crust blocks damage fully while it lasts; only what it cannot cover reaches HP', () => {
    // Salt Shaker gives 5 Crust: a 3-attack hit is blocked completely, then the next one breaks through for 1.
    const r = simulateBattle(plate({ 0: unit('pretzel', { attack: 3, hp: 50 }) }), plate({ 0: unit('pretzel', { attack: 1, hp: 50, item: 'saltShaker' }) }), 1);
    const hits = r.frames.filter((f) => f.marks.some((m) => m.side === 1 && m.kind === 'crust' && (m.amount ?? 0) < 0));
    const marks = (f: (typeof hits)[number], kind: string) => f.marks.find((m) => m.side === 1 && m.kind === kind)?.amount;
    expect([marks(hits[0], 'crust'), marks(hits[0], 'hit')]).toEqual([-3, undefined]);
    expect([marks(hits[1], 'crust'), marks(hits[1], 'hit')]).toEqual([-2, 1]);
  });
});

describe('flavor synergy in abilities', () => {
  const wall = () => plate({ 0: unit('cheese', { attack: 1, hp: 50 }) });
  /** Burn on the enemy front food once start-of-battle abilities are done. */
  const openingBurn = (r: ReturnType<typeof simulateBattle>) => Math.max(...r.frames.filter((f) => f.round === 0).map((f) => f.plates[1][0]?.burn ?? 0));

  it('Garlic Burns +1 for each other Spicy friend', () => {
    // Garlic 1 + one other Spicy friend 1, plus Chili's own 2
    expect(openingBurn(simulateBattle(plate({ 0: unit('garlic'), 3: unit('chili') }), wall(), 1))).toBe(4);
    expect(openingBurn(simulateBattle(plate({ 0: unit('garlic') }), wall(), 1))).toBe(1);
  });

  it('Kimchi counts as both Sour and Spicy', () => {
    const r = simulateBattle(plate({ 0: unit('chili'), 3: unit('kimchi') }), wall(), 1);
    expect(r.frames.some((f) => f.text.includes('Spicy x2'))).toBe(true);
  });

  it('Cheese ages faster next to a Savory friend', () => {
    const run = newRun(3);
    run.plate[0] = unit('cheese');
    run.plate[1] = unit('potato');
    run.plate[5] = unit('cheese');
    serve(run);
    const v = unitDef('cheese').values[0];
    expect(run.plate[0]!.hp).toBe(unitDef('cheese').hp + v + 1); // 1 more next to Potato
    expect(run.plate[5]!.hp).toBe(unitDef('cheese').hp + v); // no Savory neighbour
  });

  it('kitchen growth has no cap: it keeps growing every turn', () => {
    const run = newRun(3);
    run.plate[0] = unit('cheese', { copies: 6 }); // +3 HP a turn
    for (let i = 0; i < 5; i++) serve(run);
    expect(run.plate[0]!.hp).toBe(unitDef('cheese').hp + 5 * unitDef('cheese').values[2]);
  });
});

describe('food data', () => {
  it('every food is well formed', () => {
    const ids = new Set(UNITS.map((u) => u.id));
    expect(ids.size).toBe(UNITS.length); // ids are unique
    for (const u of UNITS) {
      if (u.token) continue;
      expect(u.abilities.length + (u.aura ? 1 : 0) + (u.attackPattern ? 1 : 0) + (u.interestCap ? 1 : 0) + (u.interestMult ? 1 : 0) + (u.hitsHarder ? 1 : 0) + (u.fansBurn ? 1 : 0) + (u.rich ? 1 : 0), `${u.id} does nothing`).toBeGreaterThan(0);
      for (const ab of u.abilities) {
        if (ab.effect === 'summon') {
          expect(ab.summon && ids.has(ab.summon.id), `${u.id} summons an unknown food`).toBe(true);
          expect(UNITS.find((t) => t.id === ab.summon!.id)!.token, `${u.id} should summon a token`).toBe(true);
        }
        if (ab.target === 'attacker') expect(['hit', 'friendAheadHit', 'friendAheadAttacks', 'neighbourAttacks', 'crustBlock'], `${u.id}: 'attacker' needs a hit or friend-ahead trigger`).toContain(ab.trigger);
        if (ab.target === 'summoned') expect(ab.trigger, `${u.id}: 'summoned' needs friendSummoned`).toBe('friendSummoned');
        if (ab.effect === 'bonusDamage') expect(ab.trigger, `${u.id}: bonusDamage needs firstAttack`).toBe('firstAttack');
        const kitchen = ['buy', 'sell', 'friendSold', 'levelUp', 'reroll', 'startTurn', 'endTurn', 'fridgeTurn'];
        if (['gold', 'sellValue', 'freeReroll', 'gainFlavor', 'soakFlavor', 'buyBonus'].includes(ab.effect)) expect(kitchen, `${u.id}: ${ab.effect} is a kitchen effect`).toContain(ab.trigger);
      }
      expect(u.text.includes('{v}') || u.abilities.every((a) => a.values || a.limitToAmount || a.summon?.attack !== undefined), `${u.id}: text should show {v} (a limitToAmount count shows in the hover instead)`).toBe(true);
    }
  });

  it('every team-building pair names real foods, and each food in one has partners', () => {
    for (const p of PAIRS) for (const id of [...p.makes, ...p.uses]) expect(UNITS.some((u) => u.id === id), `${p.what}: ${id}`).toBe(true);
    expect(partnersOf('fortuneCookie')).toContain('mandarin');
    expect(partnersOf('caviar')).toContain('mandarin');
    expect(partnersOf('cremeBrulee')).toContain('pretzel');
    expect(partnersOf('spaghetti')).toContain('coffee');
  });

  it('every food grows with level: its numbers rise at level 2 and again at 3', () => {
    for (const u of UNITS.filter((d) => !d.token && rarityOf(d) !== 'mythic' && d.id !== 'tofu')) {
      const [a, b, c] = u.values;
      const scales = u.text.includes('{v}') || u.abilities.some((ab) => ab.limitToAmount) || u.interestCap;
      expect(scales && a < b && b < c, `${u.id}: ${u.values.join('/')}`).toBeTruthy();
    }
  });

  it('rarity defaults from tier, and mythics stay out of the market', () => {
    expect(rarityOf(unitDef('egg'))).toBe('common');
    expect(rarityOf(unitDef('popcorn'))).toBe('uncommon');
    expect(rarityOf(unitDef('cheese'))).toBe('rare');
    expect(rarityOf(unitDef('mushroom'))).toBe('epic');
    expect(rarityOf(unitDef('steak'))).toBe('legendary');
    expect(rarityOf(unitDef('pizza'))).toBe('exotic');
    expect(rarityOf({ ...unitDef('egg'), rarity: 'mythic' })).toBe('mythic');
    expect(MARKET_UNITS.every((u) => rarityOf(u) !== 'mythic' && !u.token)).toBe(true);
  });
});

describe('run', () => {
  it('carries on in endless mode after a win, until the lives run out', () => {
    const run = newRun(3);
    expect(goEndless(run)).toBe(false); // not won yet
    run.courses = 9;
    finishBattle(run, 'win');
    expect(isOver(run)).toBe(true);
    const gold = run.gold;
    expect(goEndless(run)).toBe(true);
    expect(goEndless(run)).toBe(false);
    expect(isOver(run)).toBe(false);
    expect(run.gold).toBeGreaterThan(gold); // the next day started: income
    finishBattle(run, 'win');
    expect(run.courses).toBe(11);
    run.lives = 1;
    finishBattle(run, 'loss');
    expect(isOver(run) && isWon(run)).toBe(true);
  });

  it('makes bots for endless days that grow exponentially, without playing every day out', () => {
    const late = generateGhost(15, 7);
    const deep = generateGhost(25, 7);
    const attack = (p: Plate) => p.reduce((n, u) => n + (u ? u.attack : 0), 0);
    expect(attack(deep)).toBeCloseTo(attack(late) * 1.1 ** 10, -1);
    expect(attack(generateGhost(45, 7))).toBeGreaterThan(attack(late) * 15);
  });

  it('merges copies into levels and cooks at 6', () => {
    const run = newRun(42);
    run.plate[0] = unit('egg', { copies: 5 });
    run.plate[1] = unit('egg');
    expect(moveUnit(run, { area: 'plate', index: 1 }, { area: 'plate', index: 0 }).ok).toBe(true);
    expect(run.plate[0]!.copies).toBe(6);
    expect(run.plate[1]).toBeNull();
  });

  it('a level-up drops a bonus dish from the tier above into the buffet right away', () => {
    const run = newRun(42);
    run.plate[0] = unit('egg', { copies: 2 });
    run.market[0] = { kind: 'unit', defId: 'egg' };
    const result = buyUnit(run, { area: 'market', index: 0 }, { area: 'plate', index: 0 });
    expect(result.ok && result.levelUp).toEqual({ uid: run.plate[0]!.uid, level: 2, bonusIndex: 0 });
    const bonus = run.market[0];
    expect(bonus?.kind === 'unit' && bonus.bonus && unitDef(bonus.defId).tier).toBe(2); // turn 1 unlocks tier 1
    expect(run.bonusUnitsPending).toBe(0);
  });

  it('with every food cubby full, the bonus waits for the next restock', () => {
    const run = newRun(42);
    run.plate[0] = unit('egg', { copies: 2 });
    run.plate[1] = unit('egg');
    run.market = [...Array.from({ length: 6 }, () => ({ kind: 'unit' as const, defId: 'apple' })), ...run.market.filter((o) => o?.kind === 'item')];
    const result = moveUnit(run, { area: 'plate', index: 1 }, { area: 'plate', index: 0 });
    expect(result.ok && result.levelUp?.bonusIndex).toBeNull();
    expect(run.bonusUnitsPending).toBe(1);
  });

  it('buys onto the plate or into the fridge (the fridge holds foods you own), and sells', () => {
    const run = newRun(7);
    expect(buyUnit(run, { area: 'market', index: 0 }, { area: 'plate', index: 0 }).ok).toBe(true);
    expect(run.gold).toBe(START_GOLD - 3);
    expect(buyUnit(run, { area: 'market', index: 1 }, { area: 'fridge', index: 0 }).ok).toBe(true);
    expect(run.fridge[0]?.kind).toBe('unit');
    expect(run.gold).toBe(START_GOLD - 6);
    expect(sellUnit(run, { area: 'plate', index: 0 }).ok).toBe(true);
    expect(run.gold).toBe(START_GOLD - 5);
  });

  it('freezes a buffet offer through refills and new days; it is still bought at its price, or thawed back', () => {
    const run = newRun(7);
    const offer = run.market[0]!;
    expect(freezeOffer(run, 0, 0).ok).toBe(true);
    expect(run.freezer[0]).toEqual(offer);
    expect(run.market[0]).toBeNull();
    expect(run.gold).toBe(START_GOLD); // freezing is free
    reroll(run);
    serve(run);
    finishBattle(run, 'win');
    expect(run.freezer[0]).toEqual(offer);
    // Freezing another food swaps them: the frozen one goes back on the buffet.
    const next = run.market[1]!;
    expect(freezeOffer(run, 1, 0).ok).toBe(true);
    expect(run.freezer[0]).toEqual(next);
    expect(run.market[1]).toEqual(offer);
    // Thawed, it goes back to the buffet (in an empty food cubby).
    run.market[2] = null;
    expect(thawOffer(run, 0).ok).toBe(true);
    expect(run.freezer[0]).toBeNull();
    expect(run.market[2]).toEqual(next);
    // Bought from the freezer: it costs its price.
    freezeOffer(run, 2, 0);
    const gold = run.gold;
    expect(buyUnit(run, { area: 'freezer', index: 0 }, { area: 'plate', index: 0 }).ok).toBe(true);
    expect(run.plate[0]?.defId).toBe(next.kind === 'unit' && next.defId);
    expect(run.gold).toBeLessThan(gold);
    expect(run.freezer[0]).toBeNull();
  });

  it('two level 2 foods merge into level 3', () => {
    const run = newRun(42);
    run.plate[0] = unit('egg', { copies: 3 });
    run.plate[1] = unit('egg', { copies: 3 });
    const result = moveUnit(run, { area: 'plate', index: 1 }, { area: 'plate', index: 0 });
    expect(result.ok && result.levelUp?.level).toBe(3);
    expect(run.plate[0]!.copies).toBe(6);
  });

  it('gold carries over with income and capped interest', () => {
    const run = newRun(5);
    expect(run.gold).toBe(START_GOLD);
    run.gold = 12;
    finishBattle(run, 'win');
    expect(run.lastInterest).toBe(2);
    expect(run.gold).toBe(12 + INCOME + 2);
    run.gold = 100;
    finishBattle(run, 'win');
    expect(run.lastInterest).toBe(3); // capped
    run.plate[0] = unit('mandarin', { copies: 6 });
    expect(interestCap(run)).toBe(6);
  });

  it('prices follow tier, and a refill always costs the same', () => {
    expect(unitCost(unitDef('egg'))).toBe(3);
    expect(unitCost(unitDef('cheese'))).toBe(4);
    expect(unitCost(unitDef('steak'))).toBe(5);
    const run = newRun(5);
    run.gold = 20;
    expect([rerollCost(run), (reroll(run), rerollCost(run)), (reroll(run), rerollCost(run))]).toEqual([1, 1, 1]);
    expect(run.gold).toBe(18);
  });

  it('sells for half the gold put in, plus sell value', () => {
    expect(sellPrice(unit('egg'))).toBe(1);
    expect(sellPrice(unit('egg', { copies: 3 }))).toBe(4);
    expect(sellPrice(unit('steak', { copies: 6 }))).toBe(15);
    expect(sellPrice(unit('egg', { sellBonus: 3 }))).toBe(4);
  });

  it('Coin Chocolate gains sell value every day, with no limit', () => {
    const run = newRun(5);
    run.plate[0] = unit('coinChocolate');
    for (let i = 0; i < 9; i++) serve(run);
    expect(run.plate[0]!.sellBonus).toBe(9);
  });

  it('Fortune Cookie turns interest into HP; Mandarin raises the cap it feeds on', () => {
    const run = newRun(5);
    run.plate[0] = unit('fortuneCookie');
    run.plate[1] = unit('mandarin', { copies: 6 }); // cap 3 + 3
    run.gold = 0;
    finishBattle(run, 'win'); // into turn 2, no interest yet
    run.gold = 100;
    finishBattle(run, 'win');
    expect(run.lastInterest).toBe(6);
    expect(run.plate[0]!.hp).toBe(unitDef('fortuneCookie').hp + 6);
  });

  it('Cherries lob a pit at the enemy back row whenever a friend is eaten, in its own moment', () => {
    const r = simulateBattle(plate({ 0: unit('egg', { attack: 1, hp: 1 }), 3: unit('cherry', { hp: 40 }) }), plate({ 0: unit('cheese', { attack: 5, hp: 60 }), 3: unit('cheese', { attack: 1, hp: 60 }) }), 1);
    const lob = r.frames.find((f) => f.text.startsWith('Cherries'));
    expect(lob).toBeTruthy();
    expect(lob!.marks.some((m) => m.side === 0 && m.kind === 'shoot')).toBe(true); // drawn as a throw
    expect(lob!.marks.some((m) => m.side === 1 && m.slot === 3 && m.kind === 'hit')).toBe(true); // the back row
  });

  it('Croutons: every 2 turns, friends with Crust gain attack', () => {
    const r = simulateBattle(plate({ 0: unit('anchovy', { hp: 60 }), 3: unit('croutons') }), plate({ 0: unit('cheese', { attack: 1, hp: 90 }) }), 1);
    expect(r.frames.some((f) => f.text.includes('Croutons:'))).toBe(true);
    expect(Math.max(...r.frames.map((f) => f.plates[0][0]?.attack ?? 0))).toBeGreaterThan(unitDef('anchovy').attack);
  });

  it('Baguette gains attack when its Crust breaks', () => {
    const r = simulateBattle(plate({ 0: unit('baguette'), 1: unit('pretzel') }), plate({ 0: unit('cheese', { attack: 4, hp: 60 }) }), 1);
    expect(r.frames.some((f) => f.text.startsWith('Baguette:'))).toBe(true);
    expect(Math.max(...r.frames.map((f) => f.plates[0][0]?.attack ?? 0))).toBeGreaterThanOrEqual(unitDef('baguette').attack + 2);
  });

  it('Sprinkles give 2 random foods +1/+1', () => {
    const run = newRun(9);
    for (let i = 0; i < 4; i++) run.plate[i] = unit('egg');
    run.market[run.market.length - 1] = { kind: 'item', itemId: 'sprinkles' };
    run.gold = 10;
    const before = run.plate.reduce((n, u) => n + (u?.attack ?? 0), 0);
    expect(useItem(run, { area: 'market', index: run.market.length - 1 }, { area: 'plate', index: 0 }).ok).toBe(true);
    expect(run.plate.reduce((n, u) => n + (u?.attack ?? 0), 0)).toBe(before + 2);
  });

  it('Sourdough grows whenever you sell a friend', () => {
    const run = newRun(5);
    run.plate[0] = unit('sourdough');
    run.plate[1] = unit('coinChocolate');
    run.plate[2] = unit('egg');
    sellUnit(run, { area: 'plate', index: 1 });
    sellUnit(run, { area: 'plate', index: 2 });
    expect(run.plate[0]!.hp).toBe(unitDef('sourdough').hp + 2);
  });

  it('Birthday Cake adds to kitchen HP growth too', () => {
    const run = newRun(5);
    run.plate[0] = unit('breadDough');
    run.plate[1] = unit('cake');
    serve(run);
    expect(run.plate[0]!.hp).toBe(unitDef('breadDough').hp + unitDef('breadDough').values[0] + unitDef('cake').values[0]);
  });

  it('Birthday Cake adds to HP from items and merges while planning', () => {
    const run = newRun(5);
    run.plate[0] = unit('egg');
    run.plate[1] = unit('cake');
    run.market[run.market.length - 1] = { kind: 'item', itemId: 'boneBroth' };
    run.gold = 10;
    expect(useItem(run, { area: 'market', index: run.market.length - 1 }, { area: 'plate', index: 0 }).ok).toBe(true);
    expect(run.plate[0]!.hp).toBe(unitDef('egg').hp + 4 + unitDef('cake').values[0]);
    expect(run.growth.some((g) => g.from === run.plate[1]!.uid)).toBe(true); // shown as the cake's own gift
  });

  it('Birthday Cake adds to HP gains in battle', () => {
    const r = simulateBattle(plate({ 0: unit('cheese', { hp: 40 }), 3: unit('apple', { hp: 40 }), 4: unit('cake', { hp: 40 }) }), plate({ 0: unit('cheese', { attack: 3, hp: 80 }) }), 1);
    // the Apple's gain first, then the Cake's extra as its own buff, from the Cake
    const cakeFrame = r.frames.find((f) => f.text.startsWith('Birthday Cake:'));
    expect(cakeFrame).toBeTruthy();
    expect(cakeFrame!.marks.some((m) => m.side === 0 && m.kind === 'ability')).toBe(true); // from the Cake, wherever it stands
    expect(cakeFrame!.marks.find((m) => m.kind === 'buff')?.hp).toBe(unitDef('cake').values[0]);
  });

  it('Hot Cocoa turns a neighbour\'s HP gain into attack once a day in the kitchen, every time in battle', () => {
    const run = newRun(5);
    run.plate[0] = unit('hotCocoa');
    run.plate[1] = unit('breadDough'); // both neighbours gain HP at the end of day
    run.plate[3] = unit('cheese');
    serve(run);
    const gained = (slot: number) => run.plate[slot]!.attack - unitDef(run.plate[slot]!.defId).attack;
    expect(gained(1) + gained(3)).toBe(1);
    expect(unitDef('hotCocoa').abilities[0]).toMatchObject({ dayMax: 1 });
    expect(unitDef('hotCocoa').abilities[0].max).toBeUndefined();
    // In battle: an Apple heals the hurt neighbour every turn, and every heal is +1 attack, well past 4.
    const r = simulateBattle(plate({ 0: unit('cheese', { attack: 1, hp: 3 }), 1: unit('hotCocoa', { hp: 60 }), 4: unit('apple', { hp: 60 }) }), plate({ 0: unit('cheese', { attack: 1, hp: 200 }) }), 1);
    expect(Math.max(...r.frames.map((f) => f.plates[0][0]?.attack ?? 0))).toBeGreaterThan(1 + 4);
  });

  it('Sweet & Sour Pork: each attack Rots its target 1, then hits +1 per Rot (level 1)', () => {
    const r = simulateBattle(plate({ 0: unit('sweetSour', { attack: 2, hp: 200 }) }), plate({ 0: unit('cheese', { attack: 1, hp: 200 }) }), 1);
    const rot = r.frames.map((f) => f.plates[1][0]?.rot ?? 0);
    expect(Math.max(...rot)).toBeGreaterThanOrEqual(3);
    // First attack: Rot 1, so 2 + 1; the second: Rot 2, so 2 + 2.
    const hits = r.frames.filter((f) => f.marks.some((m) => m.side === 1 && m.kind === 'hit')).map((f) => f.marks.find((m) => m.side === 1 && m.kind === 'hit')!.amount);
    expect(hits.slice(0, 2)).toEqual([3, 4]);
  });

  it('Caviar raises the interest cap by 1 and, each morning, buffs one random friend per gold of interest', () => {
    const run = newRun(5);
    run.plate[0] = unit('caviar');
    for (const [i, id] of [[1, 'egg'], [2, 'apple'], [3, 'lemon'], [4, 'potato']] as const) run.plate[i] = unit(id);
    expect(interestCap(run)).toBe(4);
    run.gold = 0; // no interest into day 2
    finishBattle(run, 'win');
    run.gold = 15;
    finishBattle(run, 'win');
    expect(run.lastInterest).toBe(3);
    const fed = run.plate.filter((u) => u && u.defId !== 'caviar' && u.attack === unitDef(u.defId).attack + 1 && u.hp === unitDef(u.defId).hp + 1);
    expect(fed.length).toBe(3); // three friends, +1/+1 each
  });

  it('Dumplings make restocks free, and Soy Sauce feeds on every restock', () => {
    const run = newRun(5);
    run.plate[0] = unit('dumplings'); // 2 free a day at level 1
    run.plate[1] = unit('soySauce');
    run.plate[2] = unit('egg');
    finishBattle(run, 'win'); // start of day: the free restocks
    run.gold = 0;
    expect(reroll(run).ok).toBe(true);
    expect(reroll(run).ok).toBe(true);
    expect(reroll(run).ok).toBe(false); // out of free ones, and broke
    run.gold = 10;
    expect(rerollCost(run)).toBe(1); // the free ones didn't raise the price
    const grown = run.plate.reduce((n, u) => n + (u ? u.attack : 0), 0);
    const base = unitDef('dumplings').attack + unitDef('soySauce').attack + unitDef('egg').attack;
    expect(grown).toBe(base + 2);
  });

  it('Pickle grows in the freezer, not on the plate', () => {
    const run = newRun(5);
    run.fridge[0] = { kind: 'unit', unit: unit('pickle') };
    run.plate[0] = unit('pickle');
    serve(run);
    serve(run);
    expect(run.fridge[0]?.kind === 'unit' && run.fridge[0].unit.attack).toBe(unitDef('pickle').attack + 2 * unitDef('pickle').values[0]);
    expect(run.plate[0]!.attack).toBe(unitDef('pickle').attack);
  });

  it('Bean Sprout grows the friend ahead', () => {
    const run = newRun(5);
    run.plate[0] = unit('egg');
    run.plate[3] = unit('beanSprout');
    for (let i = 0; i < 6; i++) serve(run);
    expect(run.plate[0]!.hp).toBe(unitDef('egg').hp + 6 * unitDef('beanSprout').values[0]); // every day, no limit
  });

  it('Bread Dough rises: HP only', () => {
    const run = newRun(5);
    run.plate[0] = unit('breadDough');
    for (let i = 0; i < 9; i++) serve(run);
    expect(run.plate[0]!.hp).toBe(unitDef('breadDough').hp + 9 * unitDef('breadDough').values[0]); // every day
    expect(run.plate[0]!.attack).toBe(unitDef('breadDough').attack);
  });

  it('Yogurt grows 1 more next to a Sour friend', () => {
    const run = newRun(5);
    run.plate[0] = unit('yogurt');
    run.plate[1] = unit('lemon');
    finishBattle(run, 'win'); // start of turn
    expect(run.plate[0]!.hp).toBe(unitDef('yogurt').hp + unitDef('yogurt').values[0] + 1);
    expect(run.plate[0]!.attack).toBe(unitDef('yogurt').attack);
  });

  it('Mochi gains HP when hit, at most 4 times a battle', () => {
    const r = simulateBattle(plate({ 0: unit('mochi', { hp: 60 }) }), plate({ 0: unit('cheese', { attack: 1, hp: 90 }) }), 1);
    const gains = r.frames.flatMap((f) => f.marks).filter((m) => m.kind === 'buff' && m.side === 0 && m.slot === 0);
    expect(gains.length).toBe(4);
  });

  it('Tofu soaks up a new flavor each level up', () => {
    const run = newRun(5);
    run.plate[0] = unit('tofu', { copies: 2 });
    run.plate[1] = unit('tofu');
    moveUnit(run, { area: 'plate', index: 1 }, { area: 'plate', index: 0 });
    expect(flavorsOf(run.plate[0]!).length).toBe(2);
  });

  it('Flavor Packet adds a random flavor, up to three', () => {
    const run = newRun(5);
    run.gold = 50;
    run.plate[0] = unit('egg');
    for (let i = 0; i < 2; i++) {
      run.market[0] = { kind: 'item', itemId: 'flavorPacket' };
      expect(useItem(run, { area: 'market', index: 0 }, { area: 'plate', index: 0 }).ok).toBe(true);
    }
    expect(flavorsOf(run.plate[0]!).length).toBe(3);
    run.market[0] = { kind: 'item', itemId: 'flavorPacket' };
    expect(useItem(run, { area: 'market', index: 0 }, { area: 'plate', index: 0 }).ok).toBe(false);
  });

  it('a pair lands on the counter tray, which must be cleared before serving', () => {
    const run = newRun(5);
    run.gold = 20;
    run.special = { kind: 'bundle', defId: 'egg', count: 2, cost: 5 };
    expect(buySpecial(run).ok).toBe(true);
    expect(run.gold).toBe(15);
    expect(run.overflow.filter(Boolean).length).toBe(2);
    expect(serveBlocker(run)).not.toBeNull();
    moveUnit(run, { area: 'overflow', index: 0 }, { area: 'plate', index: 0 });
    sellUnit(run, { area: 'overflow', index: 1 });
    expect(run.plate[0]!.copies).toBe(1);
    expect(serveBlocker(run)).toBeNull();
  });

  it('a Spice Pack offers three consumables; the pick waits in the cubby, free', () => {
    const run = newRun(5);
    run.special = { kind: 'spicePack', cost: 3 };
    run.plate[0] = unit('egg');
    expect(buySpecial(run).ok).toBe(true);
    expect(run.pack?.kind === 'spice' && run.pack.items.length).toBe(3);
    expect(serveBlocker(run)).not.toBeNull();
    const butter = run.pack?.kind === 'spice' ? run.pack.items.indexOf('butter') : -1;
    expect(pickPack(run, Math.max(0, butter)).ok).toBe(true);
    expect(run.special?.kind).toBe('freeItem');
    const gold = run.gold;
    useItem(run, { area: 'special', index: 0 }, { area: 'plate', index: 0 });
    expect(run.gold).toBe(gold);
    expect(run.special).toBeNull();
  });

  it('an open pack can be skipped: nothing is taken and serving is unblocked', () => {
    const run = newRun(5);
    run.special = { kind: 'farmPack', cost: 5 };
    run.gold = 10;
    run.plate[0] = unit('egg');
    expect(buySpecial(run).ok).toBe(true);
    expect(serveBlocker(run)).not.toBeNull();
    expect(applyAction(run, { t: 'skip' }).ok).toBe(true);
    expect(run.pack).toBeNull();
    expect(run.overflow.every((u) => !u)).toBe(true);
    expect(serveBlocker(run)).toBeNull();
    expect(applyAction(run, { t: 'skip' }).ok).toBe(false);
  });

  it('Seasoning Blend adds the flavor you pick, up to 3 flavors', () => {
    const run = newRun(5);
    run.plate[0] = unit('kimchi'); // Sour and Spicy
    run.gold = 20;
    const season = (flavor: 'sweet' | 'salty' | 'sour') => {
      run.market[0] = { kind: 'item', itemId: 'seasoning' };
      return useItem(run, { area: 'market', index: 0 }, { area: 'plate', index: 0 }, flavor);
    };
    expect(season('sour').ok).toBe(false); // already Sour
    expect(season('sweet').ok).toBe(true);
    expect(flavorsOf(run.plate[0]!).sort()).toEqual(['sour', 'spicy', 'sweet']);
    expect(season('salty').ok).toBe(false); // three is the most
  });

  it('Hot Sauce (held) gives +1 attack for good at the end of each day', () => {
    const run = newRun(5);
    run.plate[0] = unit('egg', { item: 'hotSauce' });
    endDay(run);
    expect(run.plate[0]!.attack).toBe(unitDef('egg').attack + 1);
    expect(run.plate[0]!.hp).toBe(unitDef('egg').hp);
  });

  it('a premium restock stocks the buffet from the next tier', () => {
    const run = newRun(5);
    run.special = { kind: 'premium', cost: 3 };
    buySpecial(run);
    expect(run.market.every((o) => o?.kind !== 'unit' || unitDef(o.defId).tier === 2)).toBe(true);
  });

  it('losses on turns 1 and 2 cost no lives', () => {
    const run = newRun(1);
    finishBattle(run, 'loss');
    finishBattle(run, 'loss');
    expect(run.lives).toBe(5);
    finishBattle(run, 'loss');
    expect(run.lives).toBe(4);
  });
});

describe('cooked bonus', () => {
  it('every market and mythic food has one', () => {
    expect(UNITS.filter((u) => !u.token && !u.cooked).map((u) => u.id)).toEqual([]);
  });

  it('switches on only at level 3, and shows as a cooked mark', () => {
    // Smoothie cooked: start of battle, your friends gain +2 attack.
    const attackOf = (copies: number) => {
      const r = simulateBattle(plate({ 0: unit('smoothie', { copies }), 1: unit('egg', { attack: 1, hp: 50 }) }), plate({ 0: unit('egg', { hp: 50 }) }), 1);
      const egg = r.frames[2].plates[0].find((u) => u?.defId === 'egg');
      return { attack: egg?.attack, cooked: r.frames.some((f) => f.marks.some((m) => m.kind === 'cooked')) };
    };
    expect(attackOf(5)).toEqual({ attack: 1, cooked: false });
    expect(attackOf(6)).toEqual({ attack: 3, cooked: true });
  });

  it('cooked Ice Cream: Chilled enemies take +2 from every hit', () => {
    const firstHit = (copies: number) => {
      const r = simulateBattle(plate({ 0: unit('iceCream', { copies, attack: 3, hp: 50 }) }), plate({ 0: unit('cheese', { attack: 1, hp: 50 }) }), 1);
      return r.frames.flatMap((f) => f.marks).find((m) => m.side === 1 && m.kind === 'hit')?.amount;
    };
    expect(firstHit(6)).toBe((firstHit(5) ?? 0) + 2);
  });

  it('cooked Olive: its pits Rot', () => {
    const rots = (copies: number) => {
      const r = simulateBattle(plate({ 0: unit('olive', { copies, hp: 50 }) }), plate({ 0: unit('cheese', { attack: 1, hp: 50 }) }), 1);
      return Math.max(...r.frames.map((f) => f.plates[1][0]?.rot ?? 0));
    };
    expect(rots(5)).toBe(0);
    expect(rots(6)).toBeGreaterThan(0);
  });

  it('cooked Takoyaki: one more ball at half damage each throw', () => {
    const dealt = (copies: number) => {
      const r = simulateBattle(plate({ 0: unit('takoyaki', { copies, attack: 6, hp: 99 }) }), plate({ 0: unit('cheese', { attack: 1, hp: 300 }) }), 1);
      return r.frames.filter((f) => f.round === 1).flatMap((f) => f.marks).filter((m) => m.side === 1 && m.kind === 'hit').reduce((n, m) => n + (m.amount ?? 0), 0);
    };
    // One enemy: each ball needs a different target, so one ball lands (6); cooked adds the half ball (3).
    expect(dealt(5)).toBe(6);
    expect(dealt(6)).toBe(9);
  });

  it('cooked Bento Box echoes every friend next to it', () => {
    const grow = (copies: number) => {
      const run = newRun(3);
      run.plate[3] = unit('bento', { copies });
      run.plate[4] = unit('breadDough'); // beside it in the back row, not ahead
      endDay(run);
      return run.plate[4]!.hp - unitDef('breadDough').hp;
    };
    expect(grow(5)).toBe(3);
    expect(grow(6)).toBe(3 + 3 * 3); // echoed 3 more times
  });

  it('cooked Yogurt: adjacent Sour friends gain +2 HP at the start of the day', () => {
    const run = newRun(3);
    run.plate[0] = unit('yogurt', { copies: 6 });
    run.plate[1] = unit('lemon'); // Sour
    run.plate[3] = unit('egg'); // not Sour
    finishBattle(run, 'win');
    expect(run.plate[1]!.hp).toBe(unitDef('lemon').hp + 2);
    expect(run.plate[3]!.hp).toBe(unitDef('egg').hp);
  });

  it('works in the kitchen too', () => {
    // Coin Chocolate cooked: end of day, +1 gold tomorrow (on top of its sell value).
    const goldNext = (copies: number) => {
      const run = newRun(3);
      run.plate[0] = unit('coinChocolate', { copies });
      serve(run);
      return run.bonusGoldNext;
    };
    expect(goldNext(5)).toBe(0);
    expect(goldNext(6)).toBe(1);
  });
});

describe('Saffron', () => {
  it('counts as every flavor, and adjacent friends count twice toward flavor bonuses (every friend once cooked)', () => {
    // Saffron in the middle of the back row touches the middle front slot (1) and both back corners (3, 5).
    const p = plate({ 4: unit('saffron'), 1: unit('lemon'), 0: unit('pickle'), 3: unit('chili') });
    const tally = flavorTally(p);
    expect(tally.get('sour')).toBe(1 + 2 + 1); // Saffron, Lemon (next to it, twice), Pickle (not next to it)
    expect(tally.get('spicy')).toBe(1 + 2); // Saffron, Chili (next to it, twice)
    expect(tally.get('salty')).toBe(1);
    const cooked = flavorTally(plate({ 4: unit('saffron', { copies: 6 }), 1: unit('lemon'), 0: unit('pickle') }));
    expect(cooked.get('sour')).toBe(1 + 2 + 2);
  });
});

describe('round 5 rules', () => {
  it('a rich food counts as its level number of its flavor, and a Bouillon Cube doubles what a food counts', () => {
    const tally = flavorTally(plate({ 0: unit('curry'), 1: unit('chili'), 2: unit('garlic', { item: 'bouillon' }) }));
    expect(tally.get('spicy')).toBe(unitDef('curry').values[0] + 1 + 2);
    expect(flavorTally(plate({ 0: unit('curry', { copies: 6 }) })).get('spicy')).toBe(unitDef('curry').values[2]);
  });

  it('Popcorn and Watermelon summon when eaten, into the slot they leave on a full plate', () => {
    const full = plate({ 0: unit('popcorn', { hp: 1 }), 1: unit('egg', { hp: 40 }), 2: unit('egg', { hp: 40 }), 3: unit('egg', { hp: 40 }), 4: unit('egg', { hp: 40 }), 5: unit('egg', { hp: 40 }) });
    const r = simulateBattle(full, plate({ 0: unit('cheese', { attack: 9, hp: 90 }) }), 1);
    expect(r.frames.some((f) => f.text.includes('Popcorn summons a Kernel'))).toBe(true);
    const melon = simulateBattle(plate({ 0: unit('watermelon', { hp: 1 }) }), plate({ 0: unit('cheese', { attack: 9, hp: 90 }) }), 1);
    expect(melon.frames.some((f) => f.text.includes('Watermelon summons a Watermelon Slice'))).toBe(true);
  });

  it('Hot Pot makes every enemy Burn every turn', () => {
    const r = simulateBattle(plate({ 3: unit('hotPot', { hp: 90 }), 0: unit('cheese', { attack: 1, hp: 90 }) }), plate({ 0: unit('cheese', { attack: 1, hp: 90 }), 1: unit('cheese', { attack: 1, hp: 90 }) }), 1);
    const burns = r.frames.filter((f) => f.text.startsWith('Hot Pot:'));
    expect(burns.length).toBeGreaterThan(2);
  });

  it('Bento Box echoes the friend ahead in the kitchen too, without using up its growth days', () => {
    const grow = (behind: string) => {
      const run = newRun(3);
      run.plate[0] = unit('breadDough');
      run.plate[3] = unit(behind);
      endDay(run);
      return { hp: run.plate[0]!.hp - unitDef('breadDough').hp, days: run.plate[0]!.gains };
    };
    expect(grow('cheese').hp).toBe(3);
    const echoed = grow('bento');
    expect(echoed.hp).toBe(6);
    expect(echoed.days).toEqual(grow('cheese').days);
  });

  it('Ghost Pepper: each attack Burns the target 2, then doubles its Burn (level 1)', () => {
    const r = simulateBattle(plate({ 0: unit('ghostPepper', { attack: 1, hp: 200 }) }), plate({ 0: unit('cheese', { attack: 1, hp: 300 }) }), 1);
    const burns = r.frames.map((f) => f.plates[1][0]?.burn ?? 0);
    // First attack: 0 + 2 = 2, doubled to 4. It halves at the turn's end (2), then the next attack: 2 + 2, doubled, 8.
    expect(burns).toContain(4);
    expect(burns).toContain(8);
  });

  it('Black Garlic doubles Burn and Rot in its lane and the lanes beside it; cooked, triples them everywhere', () => {
    const tick = (garlicSlot: number, copies: number, enemySlot: number) => {
      // A cooked Grapefruit behind it makes every enemy Rot, so the reach is what decides the multiplier.
      const garlic = { [garlicSlot]: unit('blackGarlic', { attack: 1, hp: 200, copies }), [garlicSlot + 3]: unit('grapefruit', { attack: 1, hp: 200, copies: 6 }) };
      const enemy = { [enemySlot]: unit('cheese', { attack: 1, hp: 200 }) };
      const r = simulateBattle(plate(garlic), plate(enemy), 1);
      return r.frames.find((f) => / rots for /.test(f.text))?.text ?? '';
    };
    expect(tick(1, 1, 0)).toContain('(doubled)'); // middle lane reaches the far lane
    expect(tick(0, 1, 2)).not.toContain('(doubled)'); // far lane doesn't reach the near lane
    expect(tick(0, 6, 2)).toContain('(tripled)');
  });

  it('Toothpick (held): attacks deal +1 and ignore Crust', () => {
    const lost = (item?: 'toothpick') => {
      const r = simulateBattle(plate({ 0: unit('cheese', { attack: 3, hp: 200, item }) }), plate({ 0: unit('cheese', { attack: 1, hp: 200 }) }), 1);
      const hit = r.frames.flatMap((f) => f.marks).find((m) => m.side === 1 && m.kind === 'hit');
      return hit?.amount;
    };
    expect(lost('toothpick')).toBe((lost() ?? 0) + 1);
  });

  it('Sweet Potato: fridge foods keep their kitchen abilities (1, then 2 of them); cooked, they also grow +1/+1', () => {
    const fridgeGrowth = (copies?: number) => {
      const run = newRun(3);
      if (copies) run.plate[0] = unit('sweetPotato', { copies });
      run.fridge[0] = { kind: 'unit', unit: unit('breadDough') }; // +3 HP a day
      run.fridge[1] = { kind: 'unit', unit: unit('breadDough') };
      endDay(run);
      return run.fridge.map((e) => (e?.kind === 'unit' ? e.unit.hp - unitDef('breadDough').hp : 0));
    };
    expect(fridgeGrowth()).toEqual([0, 0]);
    expect(fridgeGrowth(1)).toEqual([3, 0]);
    expect(fridgeGrowth(3)).toEqual([3, 3]);
    expect(fridgeGrowth(6)).toEqual([4, 4]);
  });

  it('Chicken Tender Tower: the friend in its lane comes back once with half its HP (level 1)', () => {
    const r = simulateBattle(plate({ 0: unit('cheese', { attack: 1, hp: 10 }), 3: unit('chickenTenderTower', { hp: 99 }) }), plate({ 0: unit('cheese', { attack: 30, hp: 200 }) }), 1);
    const back = r.frames.findIndex((f) => f.text.includes('Tender Tower stacks Cheese back up'));
    expect(back).toBeGreaterThan(0);
    expect(r.frames[back].plates[0][0]?.hp).toBe(5);
    expect(r.frames.filter((f) => f.text.includes('stacks Cheese back up')).length).toBe(1); // only once
  });

  it('Bento Box does nothing for a friend ahead that only attacks (a pattern, no abilities)', () => {
    const dealt = (behind: string) => {
      const r = simulateBattle(plate({ 0: unit('kebab', { hp: 99 }), 3: unit(behind) }), plate({ 0: unit('cheese', { hp: 200, attack: 1 }) }), 1);
      return r.frames.filter((f) => f.round === 1).flatMap((f) => f.marks).filter((m) => m.side === 1 && m.kind === 'hit').reduce((s, m) => s + (m.amount ?? 0), 0);
    };
    expect(dealt('bento')).toBe(dealt('cheese'));
  });

  it('a mythic copy is a whole level: two make level 2, three are cooked; it sells by mythics in it', () => {
    const run = newRun(5);
    run.gold = 100;
    run.plate[0] = unit('wagyu');
    const buyCopy = () => {
      run.market[0] = { kind: 'unit', defId: 'wagyu' };
      return buyUnit(run, { area: 'market', index: 0 }, { area: 'plate', index: 0 });
    };
    expect(buyCopy().ok).toBe(true);
    expect(levelOf(run.plate[0]!.copies)).toBe(2);
    expect(sellPrice(run.plate[0]!)).toBe(10); // two mythics at 10, half back
    expect(buyCopy().ok).toBe(true);
    expect(run.plate[0]!.copies).toBe(6);
    expect(levelOf(run.plate[0]!.copies)).toBe(3);
    expect(sellPrice(run.plate[0]!)).toBe(15);
  });

  it('mythics now and then show up on the buffet from day 5, never before', () => {
    let early = 0;
    let late = 0;
    for (let seed = 0; seed < 400; seed++) {
      const run = newRun(seed);
      for (let day = 1; day <= 9; day++) {
        const mythics = run.market.filter((o) => o?.kind === 'unit' && rarityOf(unitDef(o.defId)) === 'mythic').length;
        if (day < 5) early += mythics;
        else late += mythics;
        finishBattle(run, 'win');
      }
    }
    expect(early).toBe(0);
    expect(late).toBeGreaterThan(0);
    expect(late).toBeLessThan(400 * 4 * 6 * 0.03); // about 1% of slots
  });

  it('a mythic in the special cubby is bought straight onto the plate', () => {
    const run = newRun(5);
    run.gold = 20;
    run.special = { kind: 'mythic', defId: 'wagyu', cost: 10 };
    expect(buyUnit(run, { area: 'special', index: 0 }, { area: 'plate', index: 0 }).ok).toBe(true);
    expect(run.plate[0]?.defId).toBe('wagyu');
    expect(run.special).toBe(null);
    expect(run.gold).toBe(10);
  });

  it('a Takeout Bag brings a food from one rarity above the buffet to the counter tray', () => {
    const run = newRun(5);
    run.gold = 10;
    run.market[run.market.length - 1] = { kind: 'item', itemId: 'takeout' };
    expect(useItem(run, { area: 'market', index: run.market.length - 1 }, { area: 'plate', index: 0 }).ok).toBe(true);
    const got = run.overflow.find((u) => u);
    expect(got && unitDef(got.defId).tier).toBe(2);
  });

  it('the buffet odds add up, and lean to the newest rarity', () => {
    for (const turn of [1, 5, 9, 12]) {
      const odds = marketOdds(turn);
      expect(odds.reduce((n, o) => n + o.chance, 0)).toBeCloseTo(1);
      expect(odds[odds.length - 1].chance).toBe(Math.max(...odds.map((o) => o.chance)));
    }
  });
});

describe('round 6 rules', () => {
  it('a Microwave that levels a food up leaves the bonus dish in the buffet, and is gone itself', () => {
    const run = newRun(7);
    run.gold = 30;
    run.plate[0] = unit('egg', { copies: 2 });
    const i = run.market.length - 1;
    run.market[i] = { kind: 'item', itemId: 'microwave' };
    const r = useItem(run, { area: 'market', index: i }, { area: 'plate', index: 0 });
    expect(r.ok && r.levelUp).toBeTruthy();
    expect(run.market.some((o) => o?.kind === 'item' && o.itemId === 'microwave')).toBe(false);
    expect(run.market.some((o) => o?.kind === 'unit' && o.bonus)).toBe(true);
  });
});

describe('Smoothie', () => {
  it('every 2 turns, every friend gains +1/+1 (level 1)', () => {
    const r = simulateBattle(plate({ 0: unit('cheese', { attack: 1, hp: 80 }), 3: unit('smoothie', { hp: 80 }) }), plate({ 0: unit('cheese', { attack: 1, hp: 80 }) }), 1);
    const attackAt = (round: number) => [...r.frames].reverse().find((f) => f.round === round)!.plates[0][0]!.attack;
    expect(attackAt(1)).toBe(1);
    expect(attackAt(2)).toBe(2);
    expect(attackAt(4)).toBe(3);
  });
});
