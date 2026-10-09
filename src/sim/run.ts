import type { Outcome } from './battle';
import { ITEMS, MARKET_UNITS, MYTHIC_UNITS, abilitiesOf, flavorsOf, itemDef, unitCost, unitDef } from './data';
import { Rng } from './rng';
import {
  FLAVORS,
  type Flavor,
  type ItemId,
  type Plate,
  PLATE_SIZE,
  type Tier,
  type Trigger,
  type UnitInstance,
  isAdjacent,
  laneOf,
  levelOf,
  rowOf,
  slotAt,
} from './types';

// Economy (DESIGN.md, Economy): gold carries over between turns, with income and capped interest.
/** Gold on turn 1. */
export const START_GOLD = 14;
/** Gold every later turn, before interest. */
export const INCOME = 9;
/** Interest: +1 gold for every this much gold held when a turn starts... */
export const INTEREST_STEP = 5;
/** ...up to this many (Fortune Cookie and Caviar raise the cap). */
export const BASE_INTEREST_CAP = 3;
/** Every refill costs this (free ones from Dumplings cost nothing). */
export const REROLL_COST = 1;
export const START_LIVES = 5;
export const COURSES_TO_WIN = 10;
export const FRIDGE_SIZE = 2;
export const OVERFLOW_SIZE = 3;
export const MARKET_ITEM_SLOTS = 1;
/** Most flavors one food can have. */
export const MAX_FLAVORS = 3;

/** `bonus`: a level-up reward (from the tier above), shown with a shine. */
export type Offer = { kind: 'unit'; defId: string; bonus?: true } | { kind: 'item'; itemId: ItemId };

/**
 * The special cubby: one offer a turn that restocking doesn't change.
 * spicePack: pick 1 of 3 consumables. farmPack: pick 1 of 3 foods, up to a tier higher. bundle (a Pair): 2 copies
 * of one food for about 1.5x the price of one. premium: restock the buffet with foods from the next tier. mythic: a
 * mythic food (late game). freeItem: the consumable picked from a Spice Pack, free to use.
 */
export type SpecialOffer =
  | { kind: 'spicePack'; cost: number }
  | { kind: 'farmPack'; cost: number }
  | { kind: 'bundle'; defId: string; count: number; cost: number }
  | { kind: 'premium'; cost: number }
  | { kind: 'mythic'; defId: string; cost: number }
  | { kind: 'freeItem'; itemId: ItemId };

/** An opened pack waiting for a pick. */
export type Pack = { kind: 'spice'; items: ItemId[] } | { kind: 'farm'; units: string[] };

export type FridgeEntry = { kind: 'offer'; offer: Offer } | { kind: 'unit'; unit: UnitInstance };

/** Where a unit can live during Prep. The counter tray holds pairs and pack foods until they're placed. */
export interface Loc {
  area: 'plate' | 'fridge' | 'overflow';
  index: number;
}

/** Where a purchasable offer comes from. */
export type OfferSource = { area: 'market'; index: number } | { area: 'fridge'; index: number } | { area: 'special'; index: 0 };

export interface RunState {
  rngState: number;
  turn: number;
  gold: number;
  lives: number;
  courses: number;
  plate: Plate;
  fridge: (FridgeEntry | null)[];
  market: (Offer | null)[];
  rerolledThisTurn: boolean;
  bonusGoldNext: number;
  bonusUnitsPending: number;
  nextUid: number;
  // Added with the economy rework; migrateRun fills them in for older saves.
  /** Refills this turn. */
  rerolls: number;
  /** Free restocks left this turn (Soy Sauce). */
  freeRerolls: number;
  /** Kitchen reactions used today (Hot Cocoa's 3 a day), by "uid:ability". */
  dayFires?: Record<string, number>;
  /** A mythic has been offered this run (only ever one). */
  mythicOffered?: boolean;
  /** Foods bought for the rest of this turn get +n/+n. */
  buyBonus: number;
  /** Interest and income paid at the start of this turn. */
  lastInterest: number;
  lastIncome: number;
  special: SpecialOffer | null;
  pack: Pack | null;
  overflow: (UnitInstance | null)[];
  /** Permanent gains since the UI last showed them (see Growth). */
  growth: Growth[];
}

/**
 * A permanent gain, logged for the kitchen to play back: which food grew, by how much, and what caused it (another
 * food's uid, or an item). Cleared by the UI once shown.
 */
export interface Growth {
  uid: number;
  attack: number;
  hp: number;
  sell?: number;
  /** The food whose ability caused it (when it isn't the food itself). */
  from?: number;
  /** What caused it, for the summary ("Bean Sprout", "Butter"). */
  source: string;
}

/** A merge that raised a food's level: which food, its new level, and where the bonus dish landed in the market. */
export interface LevelUp {
  uid: number;
  level: 2 | 3;
  bonusIndex: number | null;
}

export type ActionResult = { ok: true; message?: string; levelUp?: LevelUp } | { ok: false; error: string };

const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (error: string): ActionResult => ({ ok: false, error });

/** Turn → highest unit tier and number of unit offers in the market (DESIGN.md, Tier unlocks). */
export function turnConfig(turn: number): { maxTier: Tier; unitSlots: number } {
  if (turn >= 11) return { maxTier: 6, unitSlots: 5 };
  if (turn >= 9) return { maxTier: 5, unitSlots: 5 };
  if (turn >= 7) return { maxTier: 4, unitSlots: 4 };
  if (turn >= 5) return { maxTier: 3, unitSlots: 4 };
  if (turn >= 3) return { maxTier: 2, unitSlots: 3 };
  return { maxTier: 1, unitSlots: 3 };
}

export function newRun(seed: number): RunState {
  const run: RunState = {
    rngState: seed >>> 0,
    turn: 1,
    gold: 0,
    lives: START_LIVES,
    courses: 0,
    plate: Array(PLATE_SIZE).fill(null),
    fridge: Array(FRIDGE_SIZE).fill(null),
    market: [],
    rerolledThisTurn: false,
    bonusGoldNext: 0,
    bonusUnitsPending: 0,
    nextUid: 1,
    rerolls: 0,
    freeRerolls: 0,
    buyBonus: 0,
    lastInterest: 0,
    lastIncome: 0,
    special: null,
    pack: null,
    overflow: Array(OVERFLOW_SIZE).fill(null),
    growth: [],
  };
  startTurn(run);
  return run;
}

/** Fills in fields an older save doesn't have. */
export function migrateRun(run: RunState): RunState {
  const old = run as RunState & { stars?: number };
  if (old.lives === undefined && old.stars !== undefined) run.lives = old.stars; // "stars" were renamed lives
  delete old.stars;
  run.rerolls ??= 0;
  run.freeRerolls ??= 0;
  run.buyBonus ??= 0;
  run.lastInterest ??= 0;
  run.lastIncome ??= 0;
  run.special ??= null;
  run.pack ??= null;
  run.overflow ??= Array(OVERFLOW_SIZE).fill(null);
  run.growth ??= [];
  return run;
}

export function isOver(run: RunState): boolean {
  return run.lives <= 0 || run.courses >= COURSES_TO_WIN;
}

function withRng<T>(run: RunState, fn: (rng: Rng) => T): T {
  const rng = new Rng(run.rngState);
  const out = fn(rng);
  run.rngState = rng.seed;
  return out;
}

export function nextSeed(run: RunState): number {
  return withRng(run, (rng) => rng.int(2 ** 32));
}

/** The interest cap: 3, plus what foods on the plate add. */
export function interestCap(run: RunState): number {
  return BASE_INTEREST_CAP + run.plate.reduce((sum, u) => sum + (u ? (unitDef(u.defId).interestCap?.[levelOf(u.copies) - 1] ?? 0) : 0), 0);
}

/** What each interest line pays: 1, or a Mandarin's level number (the best one on the plate). */
export function interestMult(run: RunState): number {
  return Math.max(1, ...run.plate.map((u) => (u && unitDef(u.defId).interestMult ? unitDef(u.defId).values[levelOf(u.copies) - 1] : 1)));
}

/** Interest a turn starting with `gold` would pay. */
export function interestOn(run: RunState, gold: number): number {
  return Math.min(interestCap(run), Math.floor(gold / INTEREST_STEP)) * interestMult(run);
}

function startTurn(run: RunState) {
  const interest = run.turn === 1 ? 0 : interestOn(run, run.gold);
  const income = (run.turn === 1 ? START_GOLD : INCOME) + run.bonusGoldNext;
  run.gold += income + interest;
  run.lastInterest = interest;
  run.lastIncome = income;
  run.bonusGoldNext = 0;
  run.rerolledThisTurn = false;
  run.rerolls = 0;
  run.freeRerolls = 0;
  run.dayFires = {};
  run.buyBonus = 0;
  run.pack = null;
  run.growth = run.growth.slice(-60); // the UI clears it as it plays; bots never do
  rollMarket(run);
  rollSpecial(run);
  run.plate.forEach((u, slot) => {
    if (u) fireShop(run, u, slot, 'startTurn');
  });
}

/**
 * The chance of each rarity (tier) in a food cubby on this day: the newest unlocked rarity is the most likely and
 * each older one less so (weights 4, 3, 2, 1, 1, 1 from the newest down). Then a food at random within it. Many
 * foods per rarity keep copies, and so level 3, hard to come by.
 */
export function marketOdds(turn: number): { tier: Tier; chance: number }[] {
  const { maxTier } = turnConfig(turn);
  const tiers = [...new Set(MARKET_UNITS.filter((u) => u.tier <= maxTier).map((u) => u.tier))].sort();
  const weight = (t: number) => Math.max(1, 4 - (maxTier - t));
  const total = tiers.reduce((n, t) => n + weight(t), 0);
  return tiers.map((tier) => ({ tier, chance: weight(tier) / total }));
}

/** Restocks the market. `premium`: every food comes from the tier above the highest unlocked one. */
function rollMarket(run: RunState, premium = false) {
  const { maxTier, unitSlots } = turnConfig(run.turn);
  const top = Math.min(6, maxTier + 1);
  withRng(run, (rng) => {
    const units = MARKET_UNITS.filter((u) => (premium ? u.tier === top : u.tier <= maxTier));
    const odds = marketOdds(run.turn);
    const pickTier = () => {
      let r = rng.next();
      for (const o of odds) if ((r -= o.chance) < 0) return o.tier;
      return odds[odds.length - 1].tier;
    };
    const market: (Offer | null)[] = [];
    for (let i = 0; i < unitSlots; i++) {
      const t = premium ? top : pickTier();
      market.push({ kind: 'unit', defId: rng.pick(units.filter((u) => u.tier === t)).id });
    }
    // Level-up bonus: one unit from the tier above the current highest.
    const bonusPool = MARKET_UNITS.filter((u) => u.tier === top);
    for (let i = 0; i < run.bonusUnitsPending; i++) market.push({ kind: 'unit', defId: rng.pick(bonusPool).id, bonus: true });
    run.bonusUnitsPending = 0;
    const items = ITEMS.filter((it) => it.tier <= maxTier);
    for (let i = 0; i < MARKET_ITEM_SLOTS; i++) market.push({ kind: 'item', itemId: rng.pick(items).id });
    run.market = market;
  });
}

/** Rolls the special cubby's offer for this turn. */
function rollSpecial(run: RunState) {
  const { maxTier } = turnConfig(run.turn);
  run.special = withRng(run, (rng): SpecialOffer => {
    // Mythics are rare: from day 10, a 10% chance a day, and only one is ever offered in a run.
    if (run.turn >= 10 && !run.mythicOffered && rng.next() < 0.1) {
      run.mythicOffered = true;
      const def = rng.pick(MYTHIC_UNITS);
      return { kind: 'mythic', defId: def.id, cost: unitCost(def) };
    }
    const kinds: SpecialOffer['kind'][] = ['spicePack', 'bundle'];
    if (run.turn >= 2) kinds.push('farmPack');
    if (run.turn >= 3) kinds.push('premium');
    const kind = rng.pick(kinds);
    if (kind === 'bundle') {
      const def = rng.pick(MARKET_UNITS.filter((u) => u.tier <= maxTier));
      return { kind: 'bundle', defId: def.id, count: 2, cost: Math.ceil(unitCost(def) * 1.5) };
    }
    if (kind === 'farmPack') return { kind: 'farmPack', cost: 5 };
    if (kind === 'premium') return { kind: 'premium', cost: 3 };
    return { kind: 'spicePack', cost: 3 };
  });
}

/** What a refill costs: always the same (free while free refills remain). */
export function rerollCost(run: RunState): number {
  return run.freeRerolls > 0 ? 0 : REROLL_COST;
}

export function reroll(run: RunState): ActionResult {
  const cost = rerollCost(run);
  if (run.gold < cost) return fail('Not enough gold to refill.');
  run.gold -= cost;
  if (run.freeRerolls > 0) run.freeRerolls--;
  run.rerolls++;
  run.rerolledThisTurn = true;
  rollMarket(run);
  const notes = run.plate.map((u, slot) => (u ? fireShop(run, u, slot, 'reroll') : '')).filter(Boolean);
  return ok(notes.join(', ') || undefined);
}

export function offerCost(offer: Offer): number {
  return offer.kind === 'unit' ? unitCost(unitDef(offer.defId)) : itemDef(offer.itemId).cost;
}

export function specialCost(offer: SpecialOffer): number {
  return offer.kind === 'freeItem' ? 0 : offer.cost;
}

export function getOffer(run: RunState, src: OfferSource): Offer | null {
  if (src.area === 'market') return run.market[src.index] ?? null;
  if (src.area === 'special') {
    // The free consumable from a Spice Pack, or a mythic, bought like any food (straight onto the plate).
    if (run.special?.kind === 'freeItem') return { kind: 'item', itemId: run.special.itemId };
    if (run.special?.kind === 'mythic') return { kind: 'unit', defId: run.special.defId };
    return null;
  }
  const entry = run.fridge[src.index];
  return entry?.kind === 'offer' ? entry.offer : null;
}

function takeOffer(run: RunState, src: OfferSource) {
  if (src.area === 'market') run.market[src.index] = null;
  else if (src.area === 'special') run.special = null;
  else run.fridge[src.index] = null;
}

export function getUnit(run: RunState, loc: Loc): UnitInstance | null {
  if (loc.area === 'plate') return run.plate[loc.index];
  if (loc.area === 'overflow') return run.overflow[loc.index] ?? null;
  const entry = run.fridge[loc.index];
  return entry?.kind === 'unit' ? entry.unit : null;
}

function setUnit(run: RunState, loc: Loc, unit: UnitInstance | null) {
  if (loc.area === 'plate') run.plate[loc.index] = unit;
  else if (loc.area === 'overflow') run.overflow[loc.index] = unit;
  else run.fridge[loc.index] = unit ? { kind: 'unit', unit } : null;
}

function isFree(run: RunState, loc: Loc): boolean {
  if (loc.area === 'plate') return !run.plate[loc.index];
  if (loc.area === 'overflow') return !run.overflow[loc.index];
  return !run.fridge[loc.index];
}

function createUnit(run: RunState, defId: string): UnitInstance {
  const def = unitDef(defId);
  return { uid: run.nextUid++, defId, copies: 1, attack: def.attack, hp: def.hp };
}

/** A freshly bought food, with this turn's buy bonus. */
function boughtUnit(run: RunState, defId: string): UnitInstance {
  const u = createUnit(run, defId);
  u.attack += run.buyBonus;
  u.hp += run.buyBonus;
  return u;
}

/** Food cubbies in the market (the kitchen has 6). */
export const MARKET_FOOD_SLOTS = 6;

/**
 * Level-up reward: a dish from the tier above the highest unlocked one joins the market right away, in an empty
 * food cubby. With every cubby full it waits for the next restock instead. Returns its market index, or null.
 */
function addBonusUnit(run: RunState): number | null {
  if (run.market.filter((o) => o?.kind === 'unit').length >= MARKET_FOOD_SLOTS) {
    run.bonusUnitsPending++;
    return null;
  }
  const tier = Math.min(6, turnConfig(run.turn).maxTier + 1);
  const offer: Offer = withRng(run, (rng) => ({ kind: 'unit', defId: rng.pick(MARKET_UNITS.filter((u) => u.tier === tier)).id, bonus: true }));
  const firstItem = run.market.findIndex((o) => o?.kind === 'item');
  const empty = run.market.findIndex((o, i) => !o && (firstItem < 0 || i < firstItem));
  if (empty >= 0) {
    run.market[empty] = offer;
    return empty;
  }
  const at = firstItem < 0 ? run.market.length : firstItem;
  run.market.splice(at, 0, offer);
  return at;
}

/**
 * Merges `incoming` into `target`: copies add up (two level 2s make a level 3), stats take the higher of each plus
 * 1/1, and gained flavors, sell value and growth carry over.
 */
function merge(run: RunState, target: UnitInstance, incoming: UnitInstance): ActionResult {
  if (target.defId !== incoming.defId) return fail('Only copies of the same food can merge.');
  if (target.copies >= 6) return fail('Already cooked: it cannot merge further.');
  const before = levelOf(target.copies);
  target.copies = Math.min(6, target.copies + incoming.copies);
  target.attack = Math.max(target.attack, incoming.attack) + 1;
  target.hp = Math.max(target.hp, incoming.hp) + 1;
  afterHpGain(run, target);
  target.item ??= incoming.item;
  target.tempAttack = (target.tempAttack ?? 0) + (incoming.tempAttack ?? 0) || undefined;
  target.sellBonus = (target.sellBonus ?? 0) + (incoming.sellBonus ?? 0) || undefined;
  if (incoming.extraFlavors) {
    const own = flavorsOf({ ...target, extraFlavors: [] });
    const extra = [...new Set([...(target.extraFlavors ?? []), ...incoming.extraFlavors])].filter((f) => !own.includes(f));
    target.extraFlavors = extra.slice(0, Math.max(0, MAX_FLAVORS - own.length));
  }
  if (incoming.gains) {
    const gains = { ...target.gains };
    for (const [k, v] of Object.entries(incoming.gains)) gains[+k] = Math.max(gains[+k] ?? 0, v);
    target.gains = gains;
  }
  const after = levelOf(target.copies);
  if (after > before) {
    const def = unitDef(target.defId);
    const note = fireShop(run, target, slotOf(run, target), 'levelUp');
    const bonusIndex = addBonusUnit(run);
    const bonus = bonusIndex === null ? null : run.market[bonusIndex];
    const head = after === 3 ? `${def.name} is cooked into ${def.cookedName}!${def.cooked ? ` Cooked bonus: ${def.cooked.text}` : ''}` : `${def.name} reached level ${after}!`;
    const mid = note ? ` ${note}.` : '';
    const tail = bonus?.kind === 'unit' ? ` Bonus: ${unitDef(bonus.defId).name} joins the buffet.` : ' A bonus dish joins the next buffet.';
    return { ok: true, message: head + mid + tail, levelUp: { uid: target.uid, level: after as 2 | 3, bonusIndex } };
  }
  return ok();
}

/** A food's plate slot, or null in the fridge or overflow tray. */
function slotOf(run: RunState, u: UnitInstance): number | null {
  const i = run.plate.indexOf(u);
  return i >= 0 ? i : null;
}

/** Buys a unit offer onto an empty slot, or merges it into a copy. */
export function buyUnit(run: RunState, src: OfferSource, to: Loc): ActionResult {
  const offer = getOffer(run, src);
  if (!offer || offer.kind !== 'unit') return fail('That is not a unit offer.');
  if (to.area === 'overflow' && !run.overflow[to.index]) return fail('The counter tray is only for pairs and boxes.');
  const cost = offerCost(offer);
  if (run.gold < cost) return fail('Not enough gold.');
  const existing = getUnit(run, to);
  if (!existing && !isFree(run, to)) return fail('That fridge slot is in use.');
  const unit = boughtUnit(run, offer.defId);
  let result: ActionResult = ok();
  // Take the offer first, so a level-up bonus can land in the cubby it leaves.
  takeOffer(run, src);
  if (existing) {
    result = merge(run, existing, unit);
    if (!result.ok) {
      if (src.area === 'market') run.market[src.index] = offer;
      else if (src.area === 'fridge') run.fridge[src.index] = { kind: 'offer', offer };
      return result;
    }
  } else {
    setUnit(run, to, unit);
  }
  run.gold -= cost;
  const bought = existing ?? unit;
  const note = fireShop(run, bought, slotOf(run, bought), 'buy');
  if (note && result.ok) result = { ...result, message: [result.message, `${note}.`].filter(Boolean).join(' ') };
  return result;
}

/** Moves a unit between plate, fridge and overflow slots: into empty slots, merging into copies, or swapping. */
export function moveUnit(run: RunState, from: Loc, to: Loc): ActionResult {
  if (from.area === to.area && from.index === to.index) return ok();
  const unit = getUnit(run, from);
  if (!unit) return fail('No unit there.');
  const other = getUnit(run, to);
  if (!other && !isFree(run, to)) return fail('That fridge slot holds an offer.');
  if (!other) {
    if (to.area === 'overflow') return fail('The counter tray is only for pairs and boxes.');
    setUnit(run, from, null);
    setUnit(run, to, unit);
    return ok();
  }
  if (other.defId === unit.defId && other.copies < 6 && unit.copies < 6) {
    const result = merge(run, other, unit);
    if (result.ok) setUnit(run, from, null);
    return result;
  }
  if (from.area === 'overflow' || to.area === 'overflow') return fail('Place it in an empty slot, merge it, or sell it.');
  setUnit(run, from, other);
  setUnit(run, to, unit);
  return ok();
}

/** Gives a food a random flavor it doesn't have yet; null if it already has the most it can hold. */
function gainFlavor(run: RunState, u: UnitInstance): Flavor | null {
  const have = flavorsOf(u);
  if (have.length >= MAX_FLAVORS || unitDef(u.defId).allFlavors) return null;
  const options = FLAVORS.filter((f) => !have.includes(f));
  const f = withRng(run, (rng) => rng.pick(options));
  u.extraFlavors = [...(u.extraFlavors ?? []), f];
  return f;
}

/**
 * A food gained HP in the kitchen (from an ability, an item or a merge): Birthday Cake adds its +1/2/3 as a gift of
 * its own, and neighbours that react to a friend gaining HP (Hot Cocoa) go off.
 */
function afterHpGain(run: RunState, t: UnitInstance, parts: string[] = []) {
  if (!run.plate.includes(t)) return;
  for (const cake of run.plate) {
    if (!cake || unitDef(cake.defId).aura !== 'soothe') continue;
    const extra = unitDef(cake.defId).values[levelOf(cake.copies) - 1];
    t.hp += extra;
    run.growth.push({ uid: t.uid, attack: 0, hp: extra, from: cake.uid, source: unitDef(cake.defId).name });
  }
  kitchenHpGain(run, t, parts);
}

/**
 * A food on the plate gained HP in the kitchen: neighbours that react to a friend gaining HP (Hot Cocoa) go off,
 * a few times a day each (their `max`, or 3), just as they would in battle.
 */
function kitchenHpGain(run: RunState, t: UnitInstance, parts: string[]) {
  const at = run.plate.indexOf(t);
  if (at < 0) return;
  run.plate.forEach((o, i) => {
    if (!o || o === t || !isAdjacent(i, at)) return;
    const odef = unitDef(o.defId);
    abilitiesOf(odef, levelOf(o.copies)).forEach((ab, index) => {
      if (ab.trigger !== 'friendHealed' || ab.effect !== 'buff') return;
      const key = `${o.uid}:${index}`;
      const used = run.dayFires?.[key] ?? 0;
      if (used >= (ab.dayMax ?? ab.max ?? 3)) return;
      run.dayFires = { ...run.dayFires, [key]: used + 1 };
      const v = (ab.values ?? odef.values)[levelOf(o.copies) - 1];
      const a = v * (ab.attack ?? 1);
      const h = v * (ab.hp ?? 1);
      t.attack += a;
      t.hp += h;
      run.growth.push({ uid: t.uid, attack: a, hp: h, from: o.uid, source: odef.name });
      parts.push(`${odef.name}: ${unitDef(t.defId).name} +${a} attack`);
    });
  });
}

/**
 * Runs a food's kitchen-phase abilities for one trigger. Effects: buff, gold, sellValue, freeReroll, gainFlavor,
 * buyBonus. Buff targets: self, randomFriends, level3Friends, adjacentFriends, friendAhead. Conditions: ifNoReroll,
 * ifAdjacentFlavor, ifLevel3; amounts: perFriend, perInterest, perLevel3; `max` caps the total over the run.
 * `slot` is the food's plate slot (null in the fridge or overflow, or just sold). Returns a summary or ''.
 */
function fireShop(run: RunState, unit: UnitInstance, slot: number | null, trigger: Trigger): string {
  const def = unitDef(unit.defId);
  const level = levelOf(unit.copies);
  const parts: string[] = [];
  abilitiesOf(def, level).forEach((ab, index) => {
    if (ab.trigger !== trigger) return;
    // Day-gated growth: it has a set number of days in it (more at higher levels).
    const days = ab.days?.[level - 1];
    if (days !== undefined && (unit.gains?.[index] ?? 0) >= days) return;
    const spend = () => {
      if (days !== undefined) unit.gains = { ...unit.gains, [index]: (unit.gains?.[index] ?? 0) + 1 };
    };
    if (ab.ifNoReroll && run.rerolledThisTurn) return;
    if (ab.ifInterest && run.lastInterest <= 0) return;
    if (ab.ifLevel3 && !run.plate.some((o) => o && levelOf(o.copies) === 3)) return;
    if (ab.ifAdjacentFlavor) {
      const want = ab.ifAdjacentFlavor;
      const next = slot !== null && run.plate.some((o, i) => o && o !== unit && isAdjacent(i, slot) && flavorsOf(o).includes(want));
      if (!next) return;
    }
    let amount = (ab.values ?? def.values)[level - 1];
    if (ab.perFriend) amount += run.plate.filter((o) => o && o !== unit && flavorsOf(o).includes(ab.perFriend!)).length;
    if (ab.perInterest) amount *= run.lastInterest;
    if (ab.perLevel3) amount += run.plate.filter((o) => o && o !== unit && levelOf(o.copies) === 3).length;
    if (ab.moreNextTo && slot !== null && run.plate.some((o, i) => o && o !== unit && isAdjacent(i, slot) && flavorsOf(o).includes(ab.moreNextTo!))) amount += 1;
    if (amount <= 0) return;
    const grew = spend;
    switch (ab.effect) {
      case 'gold':
        spend();
        run.bonusGoldNext += amount;
        parts.push(`${def.name}: +${amount} gold tomorrow`);
        return;
      case 'sellValue':
        unit.sellBonus = (unit.sellBonus ?? 0) + amount;
        grew();
        run.growth.push({ uid: unit.uid, attack: 0, hp: 0, sell: amount, source: def.name });
        parts.push(`${def.name} is worth +${amount}`);
        return;
      case 'freeReroll':
        spend();
        run.freeRerolls += amount;
        parts.push(`${def.name}: ${amount > 1 ? `${amount} free refills` : 'a free refill'}`);
        return;
      case 'buyBonus':
        spend();
        run.buyBonus += amount;
        parts.push(`${def.name}: foods bought today +${run.buyBonus}/+${run.buyBonus}`);
        return;
      case 'gainFlavor': {
        const f = gainFlavor(run, unit);
        if (f) parts.push(`${def.name} soaks up ${f}`);
        return;
      }
      case 'buff': {
        const friends = run.plate.filter((u): u is UnitInstance => !!u && u !== unit);
        let targets: UnitInstance[];
        switch (ab.target ?? 'self') {
          case 'randomFriends':
            targets = withRng(run, (rng) => rng.sample(friends, ab.count ?? 1));
            break;
          case 'level3Friends':
            targets = withRng(run, (rng) => rng.sample(friends.filter((u) => levelOf(u.copies) === 3), ab.count ?? 1));
            break;
          case 'adjacentFriends':
            targets = slot === null ? [] : run.plate.filter((u, i): u is UnitInstance => !!u && u !== unit && isAdjacent(i, slot));
            break;
          case 'friendAhead': {
            const ahead = slot !== null && rowOf(slot) === 1 ? run.plate[slotAt(laneOf(slot), 0)] : null;
            targets = ahead ? [ahead] : [];
            break;
          }
          case 'allFriends':
            targets = slot === null ? [] : run.plate.filter((u): u is UnitInstance => !!u);
            break;
          default:
            targets = [unit];
        }
        if (targets.length === 0) return;
        const a = amount * (ab.attack ?? 1);
        const h = amount * (ab.hp ?? 1);
        for (const t of targets) {
          t.attack += a;
          t.hp += h;
          run.growth.push({ uid: t.uid, attack: a, hp: h, from: t === unit ? undefined : unit.uid, source: def.name });
          if (h > 0) afterHpGain(run, t, parts);
        }
        grew();
        const who = targets.length > 1 ? `${targets.length} friends` : targets[0] === unit ? def.name : unitDef(targets[0].defId).name;
        parts.push(`${who} +${a}/+${h}`);
        return;
      }
    }
  });
  return parts.join(', ');
}

/** Gold for selling a food: half what its copies cost (rounded down, at least 1), plus sell value it gained. */
export function sellPrice(u: UnitInstance): number {
  return Math.max(1, Math.floor((unitCost(unitDef(u.defId)) * u.copies) / 2)) + (u.sellBonus ?? 0);
}

export function sellUnit(run: RunState, loc: Loc): ActionResult {
  const unit = getUnit(run, loc);
  if (!unit) return fail('No unit there.');
  const value = sellPrice(unit);
  setUnit(run, loc, null);
  run.gold += value;
  const effects = [fireShop(run, unit, null, 'sell'), ...run.plate.map((u, slot) => (u ? fireShop(run, u, slot, 'friendSold') : ''))].filter(Boolean);
  return ok(`Sold ${unitDef(unit.defId).name} for ${value} gold${effects.length ? `; ${effects.join('; ')}` : ''}.`);
}

export function useItem(run: RunState, src: OfferSource, target: Loc, flavor?: Flavor): ActionResult {
  const offer = getOffer(run, src);
  if (!offer || offer.kind !== 'item') return fail('That is not an item offer.');
  const def = itemDef(offer.itemId);
  const cost = src.area === 'special' ? 0 : def.cost;
  if (run.gold < cost) return fail('Not enough gold.');
  const unit = getUnit(run, target);
  if (!unit && !def.anywhere) return fail('Use items on a unit.');

  let result: ActionResult = ok();
  let taken = false;
  switch (def.id) {
    case 'butter':
      unit!.attack += 2;
      unit!.hp += 2;
      run.growth.push({ uid: unit!.uid, attack: 2, hp: 2, source: def.name });
      afterHpGain(run, unit!);
      break;
    case 'oliveOil':
      unit!.attack += 1;
      unit!.hp += 1;
      unit!.sellBonus = (unit!.sellBonus ?? 0) + 3;
      run.growth.push({ uid: unit!.uid, attack: 1, hp: 1, sell: 3, source: def.name });
      afterHpGain(run, unit!);
      break;
    case 'boneBroth':
      unit!.hp += 6;
      run.growth.push({ uid: unit!.uid, attack: 0, hp: 6, source: def.name });
      afterHpGain(run, unit!);
      break;
    case 'flavorPacket': {
      const f = gainFlavor(run, unit!);
      if (!f) return fail('That food already has all the flavors it can hold.');
      result = ok(`${unitDef(unit!.defId).name} now also tastes ${f}.`);
      break;
    }
    case 'saltShaker':
    case 'toothpick':
    case 'tupperware':
    case 'bouillon':
    case 'chopsticks':
    case 'hotSauce':
      unit!.item = def.id;
      break;
    case 'takeout': {
      // A surprise from one rarity above the buffet, waiting on the counter tray.
      const spot = run.overflow.findIndex((u) => !u);
      if (spot < 0) return fail('Clear the counter tray first.');
      const top = Math.min(6, turnConfig(run.turn).maxTier + 1);
      const defId = withRng(run, (rng) => rng.pick(MARKET_UNITS.filter((u) => u.tier === top)).id);
      run.overflow[spot] = boughtUnit(run, defId);
      result = ok(`${unitDef(defId).name} arrives on the counter tray.`);
      break;
    }
    case 'seasoning':
      if (!flavor) return fail('Pick a flavor.');
      unit!.flavorOverride = flavor;
      break;
    case 'microwave': {
      if (unit!.copies >= 6) return fail('Already cooked.');
      // Out of its cubby first: a level-up's bonus dish may land there (see addBonusUnit).
      takeOffer(run, src);
      taken = true;
      const copy: UnitInstance = { ...unit!, copies: 1, sellBonus: undefined, extraFlavors: undefined, gains: undefined };
      result = merge(run, unit!, copy);
      break;
    }
    case 'sprinkles':
    case 'partyMix': {
      const [count, attack, hp] = def.id === 'sprinkles' ? [3, 1, 1] : [4, 2, 2];
      const foods = run.plate.filter((u): u is UnitInstance => !!u);
      for (const u of withRng(run, (rng) => rng.sample(foods, count))) {
        u.attack += attack;
        u.hp += hp;
        run.growth.push({ uid: u.uid, attack, hp, source: def.name });
        afterHpGain(run, u);
      }
      break;
    }
    case 'lunchbox':
      for (const u of run.plate) {
        if (!u) continue;
        u.attack += 2;
        u.hp += 2;
        run.growth.push({ uid: u.uid, attack: 2, hp: 2, source: def.name });
        afterHpGain(run, u);
      }
      break;
  }
  run.gold -= cost;
  if (!taken) takeOffer(run, src);
  return result;
}

const freeOverflow = (run: RunState) => run.overflow.flatMap((u, i) => (u ? [] : [i]));

/** Buys this turn's special-cubby offer. */
export function buySpecial(run: RunState): ActionResult {
  const s = run.special;
  if (!s || s.kind === 'freeItem') return fail('Nothing to buy there.');
  if (run.pack) return fail('Pick from the open pack first.');
  if (run.gold < s.cost) return fail('Not enough gold.');
  const { maxTier } = turnConfig(run.turn);
  let message: string | undefined;
  switch (s.kind) {
    case 'spicePack': {
      const pool = ITEMS.filter((it) => it.tier <= maxTier + 1 && it.id !== 'seasoning').map((it) => it.id);
      run.pack = { kind: 'spice', items: withRng(run, (rng) => rng.sample(pool, 3)) };
      break;
    }
    case 'farmPack': {
      const top = Math.min(6, maxTier + 1);
      const pool = MARKET_UNITS.filter((u) => u.tier >= Math.max(1, maxTier - 1) && u.tier <= top).map((u) => u.id);
      run.pack = { kind: 'farm', units: withRng(run, (rng) => rng.sample(pool, 3)) };
      break;
    }
    case 'bundle':
    case 'mythic': {
      const count = s.kind === 'bundle' ? s.count : 1;
      const free = freeOverflow(run);
      if (free.length < count) return fail('Clear the counter tray first.');
      for (let i = 0; i < count; i++) run.overflow[free[i]] = boughtUnit(run, s.defId);
      const name = unitDef(s.defId).name;
      message = `${s.kind === 'bundle' ? `${count} ${name}` : name} arrive${count > 1 ? '' : 's'} on the counter tray: place, merge or sell them before serving.`;
      break;
    }
    case 'premium':
      rollMarket(run, true);
      run.rerolledThisTurn = true;
      message = 'Premium Refill: the buffet is filled with the next rarity.';
      break;
  }
  run.gold -= s.cost;
  run.special = null;
  return ok(message);
}

/** Picks one thing from the open pack; the rest are lost. A consumable waits in the special cubby, free to use. */
export function pickPack(run: RunState, index: number): ActionResult {
  const pack = run.pack;
  if (!pack) return fail('No pack is open.');
  if (pack.kind === 'spice') {
    const itemId = pack.items[index];
    if (!itemId) return fail('Pick one of the three.');
    run.special = { kind: 'freeItem', itemId };
    run.pack = null;
    return ok(`${itemDef(itemId).name} is waiting in the special cubby: drag it onto a food.`);
  }
  const defId = pack.units[index];
  if (!defId) return fail('Pick one of the three.');
  const free = freeOverflow(run);
  if (free.length === 0) return fail('Clear the counter tray first.');
  run.overflow[free[0]] = boughtUnit(run, defId);
  run.pack = null;
  return ok(`${unitDef(defId).name} arrives on the counter tray.`);
}

/** Why you can't serve yet, or null if you can. */
export function serveBlocker(run: RunState): string | null {
  if (run.pack) return 'Pick something from the open pack first.';
  if (run.overflow.some((u) => u)) return 'Clear the counter tray first: place, merge or sell what is on it.';
  return null;
}

/** End of day: fires End of day abilities (plate) and freezer abilities (fridge). Part of serving. */
export function endDay(run: RunState) {
  run.plate.forEach((u, slot) => {
    if (u) fireShop(run, u, slot, 'endTurn');
  });
  for (const e of run.fridge) if (e?.kind === 'unit') fireShop(run, e.unit, null, 'fridgeTurn');
}

/** Ends the day and returns a frozen copy of the plate to battle with. (The UI calls endDay first, to show the growth.) */
export function serve(run: RunState): Plate {
  endDay(run);
  return clonePlate(run.plate);
}

/** Applies a battle result and starts the next turn. */
export function finishBattle(run: RunState, outcome: Outcome) {
  if (outcome === 'win') run.courses++;
  else if (outcome === 'loss' && run.turn >= 3) run.lives--;
  advanceTurn(run);
}

export function advanceTurn(run: RunState) {
  for (const u of run.plate) if (u) u.tempAttack = undefined;
  run.turn++;
  if (!isOver(run)) startTurn(run);
}

export function clonePlate(plate: Plate): Plate {
  return plate.map((u) => (u ? structuredClone(u) : null));
}
