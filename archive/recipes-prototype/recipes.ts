// Recipes mode (prototype; see RECIPES-DRAFT.md). The shop sells ingredients; cooking one onto another makes
// a dish. Named recipes break the rules; any other base + topping becomes a "Homestyle" dish with a simple
// ability composed from the two. Everything here is a UnitDef with `recipes: true`, so the battle engine runs
// it like any other food. Kitchen-phase behaviour lives in `kitchen` (handled in cooking.ts).
import type { AbilityDef, Flavor, KitchenTraits, RecipeTier, Tier, UnitDef } from './types';

const v = (n: number): [number, number, number] => [n, n, n];

// ---------- ingredients ----------

function ingredient(
  id: string, name: string, emoji: string, role: 'base' | 'topping', tier: Tier, flavor: Flavor,
  attack: number, hp: number, text: string, abilities: AbilityDef[] = [], kitchen?: KitchenTraits, amount = 1, art?: string,
): UnitDef {
  return { id, name, cookedName: name, emoji, tier, flavor, attack, hp, values: v(amount), abilities, text, recipes: true, role, kitchen, art };
}

export const INGREDIENTS: UnitDef[] = [
  // Bases: what kind of dish it becomes
  ingredient('r_bread', 'Bread', '🍞', 'base', 1, 'savory', 1, 6, 'Bought: the next base you buy this turn costs 1 less.', [], { onBuy: 'baseDiscount' }),
  ingredient('r_rice', 'Rice', '🍚', 'base', 1, 'salty', 1, 7, 'Start of battle: gain {v} Crust.',
    [{ trigger: 'startOfBattle', effect: 'crust' }], undefined, 2),
  ingredient('r_noodles', 'Noodles', '🍜', 'base', 2, 'salty', 2, 6, 'Every round: heal itself {v}.',
    [{ trigger: 'round', effect: 'heal' }]),
  ingredient('r_tortilla', 'Tortilla', '🫓', 'base', 2, 'savory', 2, 5, 'Sells for 2 gold.', [], { sellValue: 2 }),
  ingredient('r_dough', 'Dough', '🥟', 'base', 3, 'sweet', 1, 9, 'In the fridge: rises, +1/+1 every turn.', [], { fridgeGrow: 1 }),
  // Toppings: what the dish is about
  ingredient('r_egg', 'Egg', '🥚', 'topping', 1, 'savory', 1, 4, 'Bought: the next restock always has an Egg.', [], { onBuy: 'eggNext' }),
  ingredient('r_chili', 'Chili', '🌶️', 'topping', 1, 'spicy', 3, 3, 'Start of battle: deal {v} damage to the enemy across.',
    [{ trigger: 'startOfBattle', effect: 'damage', target: 'enemyInLane' }]),
  ingredient('r_lemon', 'Lemon', '🍋', 'topping', 1, 'sour', 2, 4, 'On your plate: your first restock each turn is free.', [], { freeFirstRestock: true }),
  ingredient('r_garlic', 'Garlic', '🧄', 'topping', 1, 'spicy', 2, 3, 'Sell: everything you buy for the rest of this turn gets +1/+1.', [], { onSell: 'buyBonus' }),
  ingredient('r_cheese', 'Cheese', '🧀', 'topping', 2, 'savory', 2, 5, 'End turn: ages, +{v}/+{v} for good.', [], { ages: 1 }),
  ingredient('r_bacon', 'Bacon', '🥓', 'topping', 2, 'salty', 3, 4, 'Hit: deal {v} damage to the attacker.',
    [{ trigger: 'hit', effect: 'damage', target: 'attacker' }]),
  ingredient('r_tomato', 'Tomato', '🍅', 'topping', 2, 'sour', 2, 5, 'Sells for 3 gold.', [], { sellValue: 3 }),
  ingredient('r_fish', 'Fish', '🐟', 'topping', 2, 'salty', 2, 5, 'Start of battle: the friend ahead gains +{v} attack.',
    [{ trigger: 'startOfBattle', effect: 'buff', target: 'friendAhead', hp: 0 }], undefined, 2, 'anchovy'),
  ingredient('r_mushroom', 'Mushroom', '🍄', 'topping', 3, 'savory', 2, 7, "End turn: +2/+2 for good if you didn't restock.", [], { growIfNoRestock: 2 }),
  ingredient('r_honey', 'Honey', '🍯', 'topping', 3, 'sweet', 1, 7, 'End turn: if you have 3+ gold left, +1 gold next turn.', [], { thrifty: true }),
];

const ING = new Map(INGREDIENTS.map((d) => [d.id, d]));
export const isBase = (id: string) => ING.get(id)?.role === 'base';
export const isTopping = (id: string) => ING.get(id)?.role === 'topping';

// ---------- named recipes ----------

/** Stat bonus a recipe adds on top of its ingredients' stats when cooked. */
export const RECIPE_BONUS: Record<RecipeTier, number> = { homestyle: 1, home: 2, signature: 3, feast: 5 };
const RARITY = { homestyle: 'common', home: 'rare', signature: 'epic', feast: 'legendary' } as const;

function recipe(
  id: string, name: string, emoji: string, tier: RecipeTier, ingredients: string[], flavor: Flavor, amount: number,
  text: string, abilities: AbilityDef[], extra: Partial<UnitDef> = {},
): UnitDef {
  const ings = ingredients.map((i) => ING.get(i)!);
  const bonus = RECIPE_BONUS[tier];
  const base = ings.find((d) => d.role === 'base') ?? ings[0];
  return {
    id, name, cookedName: name, emoji, flavor, text, abilities, values: v(amount),
    tier: (Math.max(...ings.map((d) => d.tier)) + (tier === 'feast' ? 3 : 1)) as Tier,
    attack: ings.reduce((s, d) => s + d.attack, 0) + bonus,
    hp: ings.reduce((s, d) => s + d.hp, 0) + bonus,
    recipes: true, role: 'dish', ingredients: [...ingredients].sort(), recipeTier: tier, rarity: RARITY[tier],
    art: { base: base.art && typeof base.art === 'string' ? base.art : base.name, toppings: ings.filter((d) => d !== base).map((d) => (typeof d.art === 'string' ? d.art : d.name)) },
    ...extra,
  };
}

export const RECIPES: UnitDef[] = [
  // Home cooking: solid, each with a twist
  recipe('d_grilledCheese', 'Grilled Cheese', '🥪', 'home', ['r_bread', 'r_cheese'], 'savory', 2,
    'Hit: gain {v} Crust. After each battle, every 2 Crust it has left becomes +1 max HP for good.',
    [{ trigger: 'hit', effect: 'crust' }], { kitchen: { crustToHp: true } }),
  recipe('d_garlicBread', 'Garlic Bread', '🥖', 'home', ['r_bread', 'r_garlic'], 'spicy', 2,
    'Eaten: every enemy loses {v} attack. Sells for 4 gold.',
    [{ trigger: 'faint', effect: 'debuff', target: 'allEnemies' }], { kitchen: { sellValue: 4 } }),
  recipe('d_honeyToast', 'Honey Toast', '🍯', 'home', ['r_bread', 'r_honey'], 'sweet', 2,
    'Every round: heal your most damaged food {v}. All your heals are doubled.',
    [{ trigger: 'round', effect: 'heal', target: 'mostDamagedFriend' }], { aura: 'doubleHeals' }),
  recipe('d_friedRice', 'Egg Fried Rice', '🍳', 'home', ['r_egg', 'r_rice'], 'savory', 1,
    'Leftovers: end turn, +1/+1 for good for every ingredient you sold this turn.',
    [], { kitchen: { leftovers: true } }),
  recipe('d_spicyNoodles', 'Spicy Noodles', '🍜', 'home', ['r_chili', 'r_noodles'], 'spicy', 1,
    'Every round: deal {v} damage to every enemy. It gets 1 hotter every time.',
    [{ trigger: 'round', effect: 'damage', target: 'allEnemies', grows: true }]),
  recipe('d_breakfastTaco', 'Breakfast Taco', '🌮', 'home', ['r_egg', 'r_tortilla'], 'savory', 1,
    'Eaten: its lane partner gains its attack and max HP.',
    [{ trigger: 'faint', effect: 'bequeath', target: 'laneFriends' }]),

  // Signature dishes: change how a plate plays
  recipe('d_sushi', 'Sushi', '🍣', 'signature', ['r_fish', 'r_rice'], 'salty', 1,
    'Start of battle (before anyone else): copies the abilities of the enemy across from it.',
    [{ trigger: 'startOfBattle', effect: 'copyAbility', target: 'enemyInLane', early: true }]),
  recipe('d_burrito', 'Burrito', '🌯', 'signature', ['r_rice', 'r_tortilla'], 'savory', 1,
    'Wrap: drop any food on it to wrap it inside. Eaten: the wrapped food bursts out at full strength.',
    [], { kitchen: { wraps: true } }),
  recipe('d_risotto', 'Mushroom Risotto', '🍲', 'signature', ['r_mushroom', 'r_rice'], 'savory', 2,
    "Slow-cooked: end turn, +{v}/+{v} for good if it hasn't moved since last turn.",
    [], { kitchen: { slowCook: 2 } }),
  recipe('d_ramen', 'Ramen', '🍜', 'signature', ['r_egg', 'r_noodles'], 'salty', 1,
    'Every round: heal adjacent friends {v}. The broth deepens: +1 to this for good after every battle won.',
    [{ trigger: 'round', effect: 'heal', target: 'adjacentFriends' }], { kitchen: { winGrow: 1 } }),
  recipe('d_ceviche', 'Ceviche', '🥗', 'signature', ['r_fish', 'r_lemon'], 'sour', 2,
    'Start of battle: the enemy across loses {v} attack. In the fridge: +2/+2 every turn.',
    [{ trigger: 'startOfBattle', effect: 'debuff', target: 'enemyInLane' }], { kitchen: { fridgeGrow: 2 } }),
  recipe('d_baconTaco', 'Taco Tuesday', '🌮', 'signature', ['r_bacon', 'r_tortilla'], 'salty', 2,
    'Hit: deal {v} damage to the attacker. On your plate: every third turn, restocks are free.',
    [{ trigger: 'hit', effect: 'damage', target: 'attacker' }], { kitchen: { freeRestockEvery3: true } }),
  recipe('d_club', 'Club Sandwich', '🥪', 'signature', ['r_bacon', 'r_bread', 'r_tomato'], 'salty', 1,
    'Three layers: the first two times it is eaten, it comes back at full HP.',
    [], { lives: 2 }),

  // Feasts: run-defining, multiply the whole plate
  recipe('d_carbonara', 'Carbonara', '🍝', 'feast', ['r_bacon', 'r_egg', 'r_noodles'], 'salty', 1,
    "Every friend's abilities trigger twice.", [], { aura: 'echo' }),
  recipe('d_pizza', 'Pizza', '🍕', 'feast', ['r_cheese', 'r_dough', 'r_tomato'], 'savory', 1,
    'Eaten: splits into slices that fill every empty slot, each with a third of its attack and HP.',
    [{ trigger: 'faint', effect: 'split' }]),
  recipe('d_bento', 'Bento Box', '🍱', 'feast', ['r_egg', 'r_fish', 'r_rice'], 'savory', 1,
    'Counts as every flavor, so every flavor bonus counts it. Start of battle: friends gain +{v}/+{v} for each different flavor on your plate.',
    [{ trigger: 'startOfBattle', effect: 'buff', target: 'allFriends', perDistinctFlavor: true }], { allFlavors: true }),
  recipe('d_hotPot', 'Hot Pot', '🍲', 'feast', ['r_chili', 'r_mushroom', 'r_noodles'], 'spicy', 1,
    "Whenever a friend's ability fires, every friend gains +1 attack.", [], { aura: 'hotpot' }),
  recipe('d_thanksgiving', 'Thanksgiving', '🦃', 'feast', ['r_bacon', 'r_dough', 'r_honey'], 'sweet', 1,
    'Everything your plate gains in battle is doubled: buffs, heals and Crust.', [], { aura: 'doubleGains' }),
];

// ---------- Homestyle: any base + topping that isn't a named recipe ----------

/** Each base gives its dishes a trigger and a noun; each topping gives the effect. */
const BASE_STYLE: Record<string, { noun: string; trigger: AbilityDef['trigger']; every?: number; when: string; amount: number }> = {
  r_bread: { noun: 'Sandwich', trigger: 'hit', when: 'Hit', amount: 2 },
  r_rice: { noun: 'Rice Bowl', trigger: 'startOfBattle', when: 'Start of battle', amount: 3 },
  r_noodles: { noun: 'Noodles', trigger: 'round', every: 2, when: 'Every 2 rounds', amount: 2 },
  r_tortilla: { noun: 'Wrap', trigger: 'faint', when: 'Eaten', amount: 3 },
  r_dough: { noun: 'Pie', trigger: 'faint', when: 'Eaten', amount: 5 },
};

/** The topping's effect, phrased for any trigger. `hitTarget` is used when the base reacts to hits. */
const TOPPING_EFFECT: Record<string, { ability: Partial<AbilityDef>; hitTarget?: AbilityDef['target']; text: (n: string, onHit: boolean) => string }> = {
  r_egg: { ability: { effect: 'summon', summon: { id: 'r_yolk' } }, text: (n) => `summon a ${n}/${n} Yolk` },
  r_chili: { ability: { effect: 'damage', target: 'enemyInLane' }, hitTarget: 'attacker', text: (n, h) => `deal ${n} damage to ${h ? 'the attacker' : 'the enemy across'}` },
  r_lemon: { ability: { effect: 'debuff', target: 'enemyInLane' }, hitTarget: 'attacker', text: (n, h) => `${h ? 'the attacker' : 'the enemy across'} loses ${n} attack` },
  r_garlic: { ability: { effect: 'damage', target: 'enemyLaneAndAdjacent' }, text: (n) => `deal ${n} damage to the enemy across and its neighbours` },
  r_cheese: { ability: { effect: 'crust', target: 'adjacentFriends' }, text: (n) => `adjacent friends gain ${n} Crust` },
  r_bacon: { ability: { effect: 'damage', target: 'enemyInLane' }, hitTarget: 'attacker', text: (n, h) => `deal ${n} damage to ${h ? 'the attacker' : 'the enemy across'}` },
  r_tomato: { ability: { effect: 'heal', target: 'mostDamagedFriend' }, text: (n) => `heal your most damaged food ${n}` },
  r_fish: { ability: { effect: 'buff', target: 'adjacentFriends', hp: 0 }, text: (n) => `adjacent friends gain +${n} attack` },
  r_mushroom: { ability: { effect: 'summon', summon: { id: 'r_spore' } }, text: (n) => `summon a ${n}/${n} Spore` },
  r_honey: { ability: { effect: 'buff', target: 'adjacentFriends' }, text: (n) => `adjacent friends gain +${Math.ceil(Number(n) / 2)}/+${Math.ceil(Number(n) / 2)}` },
};

const HOMESTYLE: UnitDef[] = [];
for (const base of INGREDIENTS.filter((d) => d.role === 'base')) {
  for (const top of INGREDIENTS.filter((d) => d.role === 'topping')) {
    const ids = [base.id, top.id].sort();
    if (RECIPES.some((r) => r.ingredients!.join() === ids.join())) continue;
    const style = BASE_STYLE[base.id];
    const fx = TOPPING_EFFECT[top.id];
    const onHit = style.trigger === 'hit';
    const ability = { trigger: style.trigger, every: style.every, ...fx.ability, ...(onHit && fx.hitTarget ? { target: fx.hitTarget } : {}) } as AbilityDef;
    // Honey's buff is +n/+n, so it gets half the amount.
    const amount = top.id === 'r_honey' ? Math.ceil(style.amount / 2) : style.amount;
    const def = recipe(`h_${base.id.slice(2)}_${top.id.slice(2)}`, `${top.name} ${style.noun}`, base.emoji, 'homestyle', ids, top.flavor, amount,
      `${style.when}: ${fx.text('{v}', onHit)}.`, [ability]);
    // The text is written for the full amount; Honey's is already halved above.
    if (top.id === 'r_honey') def.text = `${style.when}: adjacent friends gain +{v}/+{v}.`;
    HOMESTYLE.push(def);
  }
}

/** Tokens summoned by recipes-mode foods. */
const TOKENS: UnitDef[] = [
  { id: 'r_yolk', name: 'Yolk', cookedName: 'Yolk', emoji: '🍳', tier: 1, flavor: 'savory', attack: 1, hp: 1, values: v(0), abilities: [], text: 'A runny yolk.', token: true, recipes: true, art: 'yolk' },
  { id: 'r_spore', name: 'Spore', cookedName: 'Spore', emoji: '🟤', tier: 1, flavor: 'savory', attack: 1, hp: 1, values: v(0), abilities: [], text: 'A mushroom spore.', token: true, recipes: true, art: 'spore' },
  { id: 'r_pizzaSlice', name: 'Pizza Slice', cookedName: 'Pizza Slice', emoji: '🍕', tier: 1, flavor: 'savory', attack: 1, hp: 1, values: v(0), abilities: [], text: 'A slice of the Pizza.', token: true, recipes: true, art: 'pizza' },
];

export const RECIPE_UNITS: UnitDef[] = [...INGREDIENTS, ...RECIPES, ...HOMESTYLE, ...TOKENS];

const BY_INGREDIENTS = new Map([...RECIPES, ...HOMESTYLE].map((d) => [d.ingredients!.join(), d]));

/** The dish these ingredients cook into (a named recipe, else Homestyle for a base + topping), or undefined. */
export function dishFor(ingredients: string[]): UnitDef | undefined {
  return BY_INGREDIENTS.get([...ingredients].sort().join());
}

/** Named recipes an ingredient is part of (for the cookbook: "cooks into..."). */
export function recipesWith(ingredientId: string): UnitDef[] {
  return RECIPES.filter((r) => r.ingredients!.includes(ingredientId));
}

// ---------- appliances: permanent kitchen upgrades bought in the shop ----------

export type ApplianceId = 'castIronPan' | 'riceCooker' | 'stockpot' | 'pizzaOven' | 'walkInFridge';

export interface ApplianceDef {
  id: ApplianceId;
  name: string;
  emoji: string;
  cost: number;
  text: string;
  /** Dishes made with this base get the bonus (now and in the future). */
  base?: string;
  stats?: number;
  abilityBonus?: number;
  startCrust?: number;
}

export const APPLIANCES: ApplianceDef[] = [
  { id: 'castIronPan', name: 'Cast-Iron Pan', emoji: '🍳', cost: 6, base: 'r_bread', stats: 2, text: 'Every Bread dish, now and future, gets +2/+2.' },
  { id: 'riceCooker', name: 'Rice Cooker', emoji: '🍚', cost: 6, base: 'r_rice', startCrust: 3, text: 'Every Rice dish starts each battle with 3 Crust.' },
  { id: 'stockpot', name: 'Stockpot', emoji: '🥘', cost: 7, base: 'r_noodles', abilityBonus: 1, stats: 1, text: "Every Noodle dish gets +1/+1 and +1 to its ability's numbers." },
  { id: 'pizzaOven', name: 'Pizza Oven', emoji: '🔥', cost: 7, base: 'r_dough', stats: 3, abilityBonus: 1, text: "Every Dough dish gets +3/+3 and +1 to its ability's numbers." },
  { id: 'walkInFridge', name: 'Walk-in Fridge', emoji: '🧊', cost: 6, text: 'One more fridge slot.' },
];
export const MAX_APPLIANCES = 3;

export function applianceDef(id: ApplianceId): ApplianceDef {
  return APPLIANCES.find((a) => a.id === id)!;
}
