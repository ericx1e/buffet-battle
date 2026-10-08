import { describe, expect, it } from 'vitest';
import { MAX_ROUNDS, OVERTIME_AFTER, simulateBattle } from './battle';
import { generateGhost } from './bot';
import { MARKET_UNITS, PAIRS, UNITS, flavorTally, partnersOf, flavorsOf, rarityOf, unitCost, unitDef } from './data';
import {
  INCOME,
  START_GOLD,
  buySpecial,
  buyUnit,
  finishBattle,
  interestCap,
  moveUnit,
  newRun,
  pickPack,
  reroll,
  rerollCost,
  sellPrice,
  sellUnit,
  serve,
  serveBlocker,
  useItem,
} from './run';
import type { Plate, UnitInstance } from './types';

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
    // Salt Shaker gives 4 Crust: a 3-attack hit is blocked completely, then the next one breaks through for 2.
    const r = simulateBattle(plate({ 0: unit('pretzel', { attack: 3, hp: 50 }) }), plate({ 0: unit('pretzel', { attack: 1, hp: 50, item: 'saltShaker' }) }), 1);
    const hits = r.frames.filter((f) => f.marks.some((m) => m.side === 1 && m.kind === 'crust' && (m.amount ?? 0) < 0));
    const marks = (f: (typeof hits)[number], kind: string) => f.marks.find((m) => m.side === 1 && m.kind === kind)?.amount;
    expect([marks(hits[0], 'crust'), marks(hits[0], 'hit')]).toEqual([-3, undefined]);
    expect([marks(hits[1], 'crust'), marks(hits[1], 'hit')]).toEqual([-1, 2]);
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
    expect(run.plate[0]!.hp).toBe(unitDef('cheese').hp + 2); // +1, doubled next to Potato
    expect(run.plate[5]!.hp).toBe(unitDef('cheese').hp + 1); // no Savory neighbour
  });

  it('kitchen growth has no cap: it keeps growing every turn', () => {
    const run = newRun(3);
    run.plate[0] = unit('cheese', { copies: 6 }); // +3 HP a turn
    for (let i = 0; i < 5; i++) serve(run);
    expect(run.plate[0]!.hp).toBe(unitDef('cheese').hp + 15);
  });
});

describe('food data', () => {
  it('every food is well formed', () => {
    const ids = new Set(UNITS.map((u) => u.id));
    expect(ids.size).toBe(UNITS.length); // ids are unique
    for (const u of UNITS) {
      if (u.token) continue;
      expect(u.abilities.length + (u.aura ? 1 : 0) + (u.attackPattern ? 1 : 0) + (u.interestCap ? 1 : 0) + (u.hitsHarder ? 1 : 0), `${u.id} does nothing`).toBeGreaterThan(0);
      for (const ab of u.abilities) {
        if (ab.effect === 'summon') {
          expect(ab.summon && ids.has(ab.summon.id), `${u.id} summons an unknown food`).toBe(true);
          expect(UNITS.find((t) => t.id === ab.summon!.id)!.token, `${u.id} should summon a token`).toBe(true);
        }
        if (ab.target === 'attacker') expect(['hit', 'friendAheadHit', 'friendAheadAttacks', 'crustBlock'], `${u.id}: 'attacker' needs a hit or friend-ahead trigger`).toContain(ab.trigger);
        if (ab.target === 'summoned') expect(ab.trigger, `${u.id}: 'summoned' needs friendSummoned`).toBe('friendSummoned');
        if (ab.effect === 'bonusDamage') expect(ab.trigger, `${u.id}: bonusDamage needs firstAttack`).toBe('firstAttack');
        const kitchen = ['buy', 'sell', 'friendSold', 'levelUp', 'reroll', 'startTurn', 'endTurn', 'fridgeTurn'];
        if (['gold', 'sellValue', 'freeReroll', 'gainFlavor', 'buyBonus'].includes(ab.effect)) expect(kitchen, `${u.id}: ${ab.effect} is a kitchen effect`).toContain(ab.trigger);
      }
      expect(u.text.includes('{v}') || u.abilities.every((a) => a.values || a.limitToAmount), `${u.id}: text should show {v} (a limitToAmount count shows in the hover instead)`).toBe(true);
    }
  });

  it('every team-building pair names real foods, and each food in one has partners', () => {
    for (const p of PAIRS) for (const id of [...p.makes, ...p.uses]) expect(UNITS.some((u) => u.id === id), `${p.what}: ${id}`).toBe(true);
    expect(partnersOf('fortuneCookie')).toContain('caviar');
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
    expect(run.gold).toBe(7);
    expect(buyUnit(run, { area: 'market', index: 1 }, { area: 'fridge', index: 0 }).ok).toBe(true);
    expect(run.fridge[0]?.kind).toBe('unit');
    expect(run.gold).toBe(4);
    expect(sellUnit(run, { area: 'plate', index: 0 }).ok).toBe(true);
    expect(run.gold).toBe(5);
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
    run.plate[0] = unit('caviar', { copies: 6 });
    expect(interestCap(run)).toBe(6);
  });

  it('prices follow tier, and restocks get pricier each time', () => {
    expect(unitCost(unitDef('egg'))).toBe(3);
    expect(unitCost(unitDef('cheese'))).toBe(4);
    expect(unitCost(unitDef('steak'))).toBe(5);
    const run = newRun(5);
    run.gold = 20;
    expect([rerollCost(run), (reroll(run), rerollCost(run)), (reroll(run), rerollCost(run))]).toEqual([1, 2, 3]);
    expect(run.gold).toBe(17);
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

  it('Fortune Cookie turns interest into HP; Caviar raises the cap it feeds on', () => {
    const run = newRun(5);
    run.plate[0] = unit('fortuneCookie');
    run.plate[1] = unit('caviar', { copies: 6 }); // cap 3 + 3
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

  it('Croutons arm friends with Crust; Baguette gains attack when its Crust breaks', () => {
    const r = simulateBattle(plate({ 0: unit('baguette'), 1: unit('pretzel'), 3: unit('croutons') }), plate({ 0: unit('cheese', { attack: 4, hp: 60 }) }), 1);
    const said = (t: string) => r.frames.some((f) => f.text.includes(t));
    expect(said('Croutons:')).toBe(true);
    expect(said('Baguette:')).toBe(true);
    const atk = Math.max(...r.frames.map((f) => f.plates[0][0]?.attack ?? 0));
    expect(atk).toBeGreaterThanOrEqual(unitDef('baguette').attack + 1 + 2);
  });

  it('Sprinkles give 3 random foods +1/+1', () => {
    const run = newRun(9);
    for (let i = 0; i < 4; i++) run.plate[i] = unit('egg');
    run.market[run.market.length - 1] = { kind: 'item', itemId: 'sprinkles' };
    run.gold = 10;
    const before = run.plate.reduce((n, u) => n + (u?.attack ?? 0), 0);
    expect(useItem(run, { area: 'market', index: run.market.length - 1 }, { area: 'plate', index: 0 }).ok).toBe(true);
    expect(run.plate.reduce((n, u) => n + (u?.attack ?? 0), 0)).toBe(before + 3);
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

  it('Dumplings make restocks free, and Soy Sauce feeds on every restock', () => {
    const run = newRun(5);
    run.plate[0] = unit('dumplings', { copies: 3 }); // 2 free a day
    run.plate[1] = unit('soySauce');
    run.plate[2] = unit('egg');
    finishBattle(run, 'win'); // start of day: the free restocks
    run.gold = 0;
    expect(reroll(run).ok).toBe(true);
    expect(reroll(run).ok).toBe(true);
    expect(reroll(run).ok).toBe(false); // out of free ones, and broke
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
    expect(run.fridge[0]?.kind === 'unit' && run.fridge[0].unit.attack).toBe(unitDef('pickle').attack + 2);
    expect(run.plate[0]!.attack).toBe(unitDef('pickle').attack);
  });

  it('Bean Sprout grows the friend ahead', () => {
    const run = newRun(5);
    run.plate[0] = unit('egg');
    run.plate[3] = unit('beanSprout');
    for (let i = 0; i < 6; i++) serve(run);
    expect(run.plate[0]!.hp).toBe(unitDef('egg').hp + 6); // +1 HP every day, no limit
  });

  it('Bread Dough rises: HP only', () => {
    const run = newRun(5);
    run.plate[0] = unit('breadDough');
    for (let i = 0; i < 9; i++) serve(run);
    expect(run.plate[0]!.hp).toBe(unitDef('breadDough').hp + 9); // +1 every day
    expect(run.plate[0]!.attack).toBe(unitDef('breadDough').attack);
  });

  it('Yogurt grows twice as fast next to a Sour friend', () => {
    const run = newRun(5);
    run.plate[0] = unit('yogurt');
    run.plate[1] = unit('lemon');
    finishBattle(run, 'win'); // start of turn
    expect(run.plate[0]!.hp).toBe(unitDef('yogurt').hp + 2);
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
    // Bento cooked: start of battle, your friends gain +3/+3.
    const attackOf = (copies: number) => {
      const r = simulateBattle(plate({ 0: unit('bento', { copies }), 1: unit('egg', { attack: 1, hp: 50 }) }), plate({ 0: unit('egg', { hp: 50 }) }), 1);
      const egg = r.frames[2].plates[0].find((u) => u?.defId === 'egg');
      return { attack: egg?.attack, cooked: r.frames.some((f) => f.marks.some((m) => m.kind === 'cooked')) };
    };
    expect(attackOf(5)).toEqual({ attack: 1, cooked: false });
    expect(attackOf(6)).toEqual({ attack: 4, cooked: true });
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
