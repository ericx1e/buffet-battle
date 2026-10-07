// Recipes mode: the kitchen rules (prototype; see RECIPES-DRAFT.md). run.ts calls into here when
// run.mode === 'recipes'. Cooking is final: a dish can't be taken apart again.
import type { EndState, Outcome } from './battle';
import { ITEMS, unitDef } from './data';
import {
  APPLIANCES,
  type ApplianceId,
  INGREDIENTS,
  MAX_APPLIANCES,
  RECIPES,
  RECIPE_BONUS,
  applianceDef,
  dishFor,
  isBase,
} from './recipes';
import type { Rng } from './rng';
import type { ActionResult, Offer, RunState } from './run';
import type { Tier, UnitDef, UnitInstance } from './types';

export const INGREDIENT_COST = 3;
export const RESTOCK_COST = 1;
const GARNISH_BONUS = 3;

const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (error: string): ActionResult => ({ ok: false, error });

export const isRecipes = (run: RunState) => run.mode === 'recipes';

/** Turn → highest ingredient tier and number of ingredient cubbies filled. */
export function kitchenTurnConfig(turn: number): { maxTier: Tier; slots: number } {
  if (turn >= 7) return { maxTier: 3, slots: 6 };
  if (turn >= 5) return { maxTier: 3, slots: 5 };
  if (turn >= 3) return { maxTier: 2, slots: 5 };
  return { maxTier: 1, slots: 4 };
}

/** Three named recipes to aim for this run: two everyday ones and a feast. */
export function pickSpecials(rng: Rng): string[] {
  const named = RECIPES.filter((r) => r.recipeTier !== 'feast');
  const feasts = RECIPES.filter((r) => r.recipeTier === 'feast');
  return [...rng.sample(named, 2), rng.pick(feasts)].map((r) => r.id);
}

/** Restocks the market: ingredients (always at least one base and one topping), an appliance and a pantry item. */
export function rollKitchen(run: RunState, rng: Rng): (Offer | null)[] {
  const { maxTier, slots } = kitchenTurnConfig(run.turn);
  const pool = INGREDIENTS.filter((d) => d.tier <= maxTier);
  const bases = pool.filter((d) => d.role === 'base');
  const toppings = pool.filter((d) => d.role === 'topping');
  const picks: UnitDef[] = [rng.pick(bases), rng.pick(toppings)];
  if (run.eggNext) picks.push(unitDef('r_egg'));
  while (picks.length < slots) picks.push(rng.pick(pool));
  run.eggNext = false;
  const market: (Offer | null)[] = rng.sample(picks, picks.length).map((d) => ({ kind: 'unit', defId: d.id }));
  // Teal cubbies: an appliance you don't own yet (from turn 3), and a pantry item.
  const owned = run.appliances ?? [];
  const appliances = APPLIANCES.filter((a) => !owned.includes(a.id));
  market.push(run.turn >= 3 && owned.length < MAX_APPLIANCES && appliances.length > 0 ? { kind: 'appliance', id: rng.pick(appliances).id } : null);
  const pantry = ITEMS.filter((it) => ['butter', 'hotSauce', 'saltShaker', 'tupperware', 'lunchbox'].includes(it.id) && it.tier <= maxTier + 2);
  market.push({ kind: 'item', itemId: rng.pick(pantry).id });
  return market;
}

/** What an ingredient costs right now (Bread makes the next base 1 cheaper). */
export function ingredientCost(run: RunState, defId: string): number {
  return Math.max(0, INGREDIENT_COST - (isBase(defId) ? (run.baseDiscount ?? 0) : 0));
}

/** What a restock costs right now: free with Lemon (once a turn) or Taco Tuesday (every third turn). */
export function restockCost(run: RunState): number {
  const plate = run.plate.filter((u): u is UnitInstance => !!u).map((u) => unitDef(u.defId).kitchen ?? {});
  if (plate.some((k) => k.freeRestockEvery3) && run.turn % 3 === 0) return 0;
  if (plate.some((k) => k.freeFirstRestock) && !run.freeRestockUsed) return 0;
  return RESTOCK_COST;
}

/** Pays for a restock (marks Lemon's free one as used). */
export function payRestock(run: RunState): number {
  const cost = restockCost(run);
  const lemon = run.plate.some((u) => u && unitDef(u.defId).kitchen?.freeFirstRestock);
  const taco = run.plate.some((u) => u && unitDef(u.defId).kitchen?.freeRestockEvery3) && run.turn % 3 === 0;
  if (cost === 0 && lemon && !taco) run.freeRestockUsed = true;
  return cost;
}

/** A freshly bought ingredient: Garlic's sell bonus applies, Bread and Egg do their thing. */
export function boughtIngredient(run: RunState, defId: string, uid: number): UnitInstance {
  const def = unitDef(defId);
  const bonus = run.buyBonus ?? 0;
  const inst: UnitInstance = { uid, defId, copies: 1, attack: def.attack + bonus, hp: def.hp + bonus };
  if (isBase(defId)) run.baseDiscount = 0; // the discount is spent on this base
  if (def.kitchen?.onBuy === 'baseDiscount') run.baseDiscount = (run.baseDiscount ?? 0) + 1;
  if (def.kitchen?.onBuy === 'eggNext') run.eggNext = true;
  return inst;
}

// ---------- cooking ----------

const ingredientsOf = (u: UnitInstance) => u.ingredients ?? [u.defId];
const isDish = (u: UnitInstance) => unitDef(u.defId).role === 'dish';

export type CookPreview =
  | { kind: 'dish'; def: UnitDef; garnish: false }
  | { kind: 'garnish'; def: UnitDef; garnish: true; with: string }
  | { kind: 'wrap'; def: UnitDef }
  | { kind: 'none'; error: string };

/** What dropping `incoming` (ingredient ids, or a food) onto `target` would make. Nothing changes. */
export function cookPreview(target: UnitInstance, incoming: UnitInstance | string): CookPreview {
  const inc: UnitInstance = typeof incoming === 'string' ? { uid: -1, defId: incoming, copies: 1, attack: 0, hp: 0 } : incoming;
  const tdef = unitDef(target.defId);
  if (tdef.kitchen?.wraps && !target.inside) return { kind: 'wrap', def: tdef };
  const all = [...ingredientsOf(target), ...ingredientsOf(inc)];
  if (all.length > 3) return { kind: 'none', error: 'That would be too much: three ingredients is the most a dish holds.' };
  const dish = dishFor(all);
  if (dish) return { kind: 'dish', def: dish, garnish: false };
  // A third ingredient on a two-ingredient dish that isn't a feast: a garnish.
  if (all.length === 3) {
    const [dishSide, extra] = isDish(target) ? [target, inc] : isDish(inc) ? [inc, target] : [null, null];
    if (dishSide && extra && ingredientsOf(dishSide).length === 2 && unitDef(extra.defId).role === 'topping') {
      return { kind: 'garnish', def: unitDef(dishSide.defId), garnish: true, with: extra.defId };
    }
  }
  return { kind: 'none', error: "Those don't cook together. Try a base (Bread, Rice, Noodles, Tortilla, Dough) with a topping." };
}

/** Cooks `incoming` into `target` (which becomes the dish; cooking is final). */
export function cook(run: RunState, target: UnitInstance, incoming: UnitInstance): ActionResult & { cooked?: UnitDef } {
  const preview = cookPreview(target, incoming);
  if (preview.kind === 'none') return fail(preview.error);
  if (preview.kind === 'wrap') {
    target.inside = { ...incoming };
    return ok(`${unitDef(incoming.defId).name} is wrapped inside the Burrito.`); // not a new dish: no celebration
  }
  const def = preview.def;
  const bonus = preview.garnish ? GARNISH_BONUS : RECIPE_BONUS[def.recipeTier ?? 'homestyle'];
  target.ingredients = [...ingredientsOf(target), ...ingredientsOf(incoming)].sort(); // before defId changes
  target.defId = def.id;
  target.attack += incoming.attack + bonus;
  target.hp += incoming.hp + bonus;
  target.abilityBonus = (target.abilityBonus ?? 0) + (incoming.abilityBonus ?? 0) + (preview.garnish ? 1 : 0);
  target.appliances = [...new Set([...(target.appliances ?? []), ...(incoming.appliances ?? [])])];
  target.item ??= incoming.item;
  target.inside ??= incoming.inside;
  applyAppliances(run, target);
  const message = preview.garnish
    ? `${def.name} is garnished with ${unitDef(preview.with).name}: +${GARNISH_BONUS}/+${GARNISH_BONUS} and +1 to its ability.`
    : def.recipeTier === 'homestyle'
      ? `You cooked ${def.name}.`
      : `${def.recipeTier === 'feast' ? 'A feast! ' : ''}You cooked ${def.name}!`;
  return { ok: true, message, cooked: def };
}

// ---------- appliances ----------

/** Gives a dish any appliance bonuses it doesn't have yet (Pan for Bread dishes, Rice Cooker for Rice dishes...). */
export function applyAppliances(run: RunState, u: UnitInstance) {
  if (!isDish(u)) return;
  for (const id of run.appliances ?? []) {
    const a = applianceDef(id as ApplianceId);
    if (!a.base || !ingredientsOf(u).includes(a.base) || u.appliances?.includes(id)) continue;
    u.attack += a.stats ?? 0;
    u.hp += a.stats ?? 0;
    u.abilityBonus = (u.abilityBonus ?? 0) + (a.abilityBonus ?? 0);
    u.startCrust = (u.startCrust ?? 0) + (a.startCrust ?? 0);
    u.appliances = [...(u.appliances ?? []), id];
  }
}

export function buyAppliance(run: RunState, offer: Offer & { kind: 'appliance' }): ActionResult {
  const a = applianceDef(offer.id);
  const owned = run.appliances ?? [];
  if (owned.length >= MAX_APPLIANCES) return fail(`Your kitchen is full: ${MAX_APPLIANCES} appliances is the most.`);
  if (owned.includes(a.id)) return fail('You already have one.');
  if (run.gold < a.cost) return fail('Not enough gold.');
  run.gold -= a.cost;
  run.appliances = [...owned, a.id];
  if (a.id === 'walkInFridge') run.fridge.push(null);
  for (const u of [...run.plate, ...run.fridge.map((e) => (e?.kind === 'unit' ? e.unit : null))]) if (u) applyAppliances(run, u);
  return ok(`${a.name} installed. ${a.text}`);
}

// ---------- selling, end of turn, after battle ----------

export function sellValue(u: UnitInstance): number {
  const def = unitDef(u.defId);
  return def.kitchen?.sellValue ?? (def.role === 'dish' ? ingredientsOf(u).length : 1);
}

/** Selling: Garlic makes the rest of the turn's buys stronger; Fried Rice counts sold ingredients. */
export function onSold(run: RunState, u: UnitInstance) {
  const def = unitDef(u.defId);
  if (def.kitchen?.onSell === 'buyBonus') run.buyBonus = (run.buyBonus ?? 0) + 1;
  if (def.role !== 'dish') run.soldIngredients = (run.soldIngredients ?? 0) + 1;
}

/** End of turn (when you serve): foods that age, rise, slow-cook or feed on leftovers grow for good. */
export function kitchenEndTurn(run: RunState): string[] {
  const notes: string[] = [];
  const grow = (u: UnitInstance, n: number, why: string) => {
    if (n <= 0) return;
    u.attack += n;
    u.hp += n;
    notes.push(`${unitDef(u.defId).name} ${why} +${n}/+${n}`);
  };
  run.plate.forEach((u, slot) => {
    if (!u) return;
    const k = unitDef(u.defId).kitchen ?? {};
    grow(u, k.ages ?? 0, 'ages:');
    if (!run.rerolledThisTurn) grow(u, k.growIfNoRestock ?? 0, 'grows undisturbed:');
    if (k.slowCook && u.lastSlot === slot) grow(u, k.slowCook, 'slow-cooks:');
    if (k.leftovers) grow(u, run.soldIngredients ?? 0, 'eats the leftovers:');
    if (k.thrifty && run.gold >= 3) {
      run.bonusGoldNext += 1;
      notes.push(`${unitDef(u.defId).name}: +1 gold next turn`);
    }
    u.lastSlot = slot;
  });
  for (const e of run.fridge) {
    if (e?.kind !== 'unit') continue;
    grow(e.unit, unitDef(e.unit.defId).kitchen?.fridgeGrow ?? 0, 'in the fridge:');
  }
  return notes;
}

/** After a battle: Grilled Cheese keeps leftover Crust as max HP; Ramen's broth deepens with every win. */
export function kitchenAfterBattle(run: RunState, outcome: Outcome, endStates: EndState[] = []) {
  run.plate.forEach((u, slot) => {
    if (!u) return;
    const k = unitDef(u.defId).kitchen ?? {};
    const end = endStates.find((e) => e.slot === slot);
    if (k.crustToHp && end) u.hp += Math.floor(end.crust / 2);
    if (k.winGrow && outcome === 'win') u.abilityBonus = (u.abilityBonus ?? 0) + k.winGrow;
  });
}

/** Per-turn kitchen state resets at the start of each turn. */
export function resetKitchenTurn(run: RunState) {
  run.freeRestockUsed = false;
  run.baseDiscount = 0;
  run.buyBonus = 0;
  run.soldIngredients = 0;
}
