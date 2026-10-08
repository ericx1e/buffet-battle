import { type AbilityDef, FLAVORS, type Flavor, type ItemDef, type ItemId, type Level, type Plate, type Rarity, type Tier, type UnitDef, isAdjacent, laneOf, levelOf, rowOf, slotAt } from './types';

// The roster. Each food: stats, level 1/2/3 ability numbers (`values`), and a list of abilities built from
// triggers, targets and effects (see AbilityDef in types.ts and "Designing foods" in DESIGN.md).
// `cooked` is a bonus that only switches on at level 3 (6 copies). It gets much stronger with tier: a small extra at
// tier 1, the whole plate at tier 6 and for mythics. Its numbers are fixed (the same `values` at every level).
// `text` is what players read; keep it in step with `abilities`. Tune numbers with `npm run balance`.
// Attack stays low next to HP and Crust on purpose: fights are slow, and flavors (Burn, Rot, Crust, healing)
// decide them as much as raw hits.
export const UNITS: UnitDef[] = [
  // Tier 1 (3 gold)
  { id: 'egg', name: 'Egg', cookedName: 'Omelette', emoji: '🥚', tier: 1, flavor: 'savory', attack: 1, hp: 6, values: [1, 2, 3],
    text: 'First time hit: crack and summon a {v}/{v} Yolk.',
    cooked: { text: 'Eaten: summon a 3/3 Yolk.', abilities: [{ trigger: 'faint', effect: 'summon', summon: { id: 'yolk' }, values: [3, 3, 3] }] },
    abilities: [{ trigger: 'hit', once: true, effect: 'summon', summon: { id: 'yolk' } }] },
  { id: 'chili', name: 'Chili Pepper', cookedName: 'Roasted Chili', emoji: '🌶️', tier: 1, flavor: 'spicy', attack: 2, hp: 4, values: [2, 3, 4],
    text: 'Start of battle: the enemy across Burns {v}.',
    cooked: { text: 'Hit: the attacker Burns 2.', abilities: [{ trigger: 'hit', effect: 'burn', target: 'attacker', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'enemyInLane' }] },
  { id: 'sugar', name: 'Sugar Cube', cookedName: 'Caramel', emoji: '🍬', tier: 1, flavor: 'sweet', attack: 1, hp: 4, values: [1, 2, 3],
    text: 'Sell: give 2 random friends +{v}/+{v}.',
    cooked: { text: 'Start of battle: a random friend gains +2/+2.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'randomFriends', count: 1, values: [2, 2, 2] }] },
    abilities: [{ trigger: 'sell', effect: 'buff', target: 'randomFriends', count: 2 }] },
  { id: 'lemon', name: 'Lemon', cookedName: 'Lemonade', emoji: '🍋', tier: 1, flavor: 'sour', attack: 2, hp: 4, values: [1, 2, 3],
    text: 'Hit: the attacker loses {v} attack.',
    cooked: { text: 'Start of battle: the enemy across loses 2 attack.', abilities: [{ trigger: 'startOfBattle', effect: 'debuff', target: 'enemyInLane', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'hit', effect: 'debuff', target: 'attacker' }] },
  { id: 'pretzel', name: 'Pretzel', cookedName: 'Pretzel Bites', emoji: '🥨', tier: 1, flavor: 'salty', attack: 1, hp: 6, values: [2, 4, 6],
    text: 'Start of battle: in the back row, give the friend ahead {v} Crust; in the front row, give adjacent friends {v} Crust.',
    cooked: { text: 'Every 2 turns: adjacent friends gain 2 Crust.', abilities: [{ trigger: 'round', every: 2, effect: 'crust', target: 'adjacentFriends', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'aheadElseAdjacent' }] },
  { id: 'apple', name: 'Apple', cookedName: 'Apple Pie', emoji: '🍎', tier: 1, flavor: 'sweet', attack: 1, hp: 5, values: [1, 1, 2],
    text: 'An apple a day: at the end of every turn, heal your most damaged food by {v}.',
    cooked: { text: 'Eaten: heal your friends 4.', abilities: [{ trigger: 'faint', effect: 'heal', target: 'allFriends', values: [4, 4, 4] }] },
    abilities: [{ trigger: 'round', effect: 'heal', target: 'mostDamagedFriend' }] },
  { id: 'tofu', name: 'Tofu', cookedName: 'Mapo Tofu', emoji: '🧈', tier: 1, flavor: 'savory', attack: 1, hp: 6, values: [1, 2, 3],
    text: 'Soaks up flavor: each level up, it gains a random new flavor. Hit: gain {v} Crust.',
    cooked: { text: 'Start of battle: the enemy across Burns 2.', abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'enemyInLane', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'levelUp', effect: 'gainFlavor' }, { trigger: 'hit', effect: 'crust' }] },
  { id: 'coinChocolate', name: 'Coin Chocolate', cookedName: 'Gold Truffle Coin', emoji: '🪙', tier: 1, flavor: 'sweet', attack: 1, hp: 4, values: [1, 1, 2],
    text: 'Piggy bank: end of day, +{v} sell value, for {d} days.',
    cooked: { text: 'End of day: +1 gold tomorrow, for 8 days.', abilities: [{ trigger: 'endTurn', effect: 'gold', values: [1, 1, 1], days: [8, 8, 8] }] },
    abilities: [{ trigger: 'endTurn', effect: 'sellValue', days: [3, 5, 8] }] },
  { id: 'breadstick', name: 'Breadstick', cookedName: 'Grissini Bundle', emoji: '🥖', tier: 1, flavor: 'salty', attack: 2, hp: 4, values: [1, 2, 3],
    text: 'Bought: give a random friend +{v}/+{v}.',
    cooked: { text: 'First attack each battle deals +3 damage.', abilities: [{ trigger: 'firstAttack', effect: 'bonusDamage', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'buy', effect: 'buff', target: 'randomFriends', count: 1 }] },

  { id: 'beanSprout', name: 'Bean Sprout', cookedName: 'Sprout Salad', emoji: '🌱', tier: 1, flavor: 'savory', attack: 1, hp: 4, values: [1, 1, 2],
    text: 'Grows its neighbour: end of day, the friend ahead gains +{v}/+{v}, for {d} days.',
    cooked: { text: 'End of day: adjacent friends gain +1/+1, for 8 days.', abilities: [{ trigger: 'endTurn', effect: 'buff', target: 'adjacentFriends', values: [1, 1, 1], days: [8, 8, 8] }] },
    abilities: [{ trigger: 'endTurn', effect: 'buff', target: 'friendAhead', days: [3, 5, 8] }] },
  { id: 'edamame', name: 'Edamame', cookedName: 'Garlic Edamame', emoji: '🫛', tier: 1, flavor: 'savory', attack: 3, hp: 5, values: [1, 2, 3],
    attackPattern: 'shot',
    text: 'Opening shot: on the first turn, from either row, a bean at the enemy in its lane for half its attack.',
    cooked: { text: 'Its opening shot fires twice.', abilities: [{ trigger: 'startOfBattle', effect: 'extraAttacks', values: [1, 1, 1] }] },
    abilities: [] },
  // Tier 2 (3 gold)
  { id: 'popcorn', name: 'Popcorn', cookedName: 'Kettle Corn', emoji: '🍿', tier: 2, flavor: 'salty', attack: 1, hp: 8, values: [1, 2, 3],
    text: 'Hit: pop a 1/2 Kernel into an empty slot (up to {v} times per battle).',
    cooked: { text: 'Hit: deal 1 damage to the attacker.', abilities: [{ trigger: 'hit', effect: 'damage', target: 'attacker', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'hit', limitToAmount: true, effect: 'summon', summon: { id: 'kernel', attack: 1, hp: 2 } }] },
  { id: 'onion', name: 'Onion', cookedName: 'Onion Rings', emoji: '🧅', tier: 2, flavor: 'sour', attack: 2, hp: 8, values: [1, 2, 3],
    text: 'Every 3rd time hit: all enemies lose {v} attack (they cry).',
    cooked: { text: 'Start of battle: all enemies lose 1 attack.', abilities: [{ trigger: 'startOfBattle', effect: 'debuff', target: 'allEnemies', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'hit', every: 3, effect: 'debuff', target: 'allEnemies' }] },
  { id: 'garlic', name: 'Garlic', cookedName: 'Garlic Bread', emoji: '🧄', tier: 2, flavor: 'spicy', attack: 2, hp: 5, values: [1, 2, 3],
    text: 'Start of battle: the enemy across and the enemies in the neighbouring lanes Burn {v}, +1 for each other Spicy friend.',
    cooked: { text: 'Start of battle: the enemy front row Burns 2.', abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'enemyFrontRow', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'enemyLaneAndAdjacent', perFriend: 'spicy' }] },
  { id: 'marshmallow', name: 'Marshmallow', cookedName: "S'more", emoji: '☁️', tier: 2, flavor: 'sweet', attack: 1, hp: 8, values: [1, 2, 3],
    text: 'Hit: the friend behind gains +{v}/+{v} (double if it is Sweet).',
    cooked: { text: 'Start of battle: the friend behind gains 6 Crust.', abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'friendBehind', values: [6, 6, 6] }] },
    abilities: [{ trigger: 'hit', effect: 'buff', target: 'friendBehind', forFlavor: { flavor: 'sweet', mult: 2 } }] },
  { id: 'potato', name: 'Potato', cookedName: 'Loaded Fries', emoji: '🥔', tier: 2, flavor: 'savory', attack: 2, hp: 6, values: [1, 2, 3],
    text: "End of day: gain +{v}/+{v} if you didn't reroll, for {d} days.",
    cooked: { text: 'Eaten: adjacent friends gain +3/+3.', abilities: [{ trigger: 'faint', effect: 'buff', target: 'adjacentFriends', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'endTurn', effect: 'buff', ifNoReroll: true, days: [3, 5, 8] }] },
  { id: 'mustard', name: 'Mustard', cookedName: 'Honey Mustard', emoji: '🟡', tier: 2, flavor: 'spicy', attack: 1, hp: 6, values: [2, 3, 4],
    text: 'Back-row kick: when the friend ahead attacks, its target Burns {v}.',
    cooked: { text: 'Start of battle: the friend ahead gains +2 attack.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'friendAhead', hp: 0, values: [2, 2, 2] }] },
    abilities: [{ trigger: 'friendAheadAttacks', effect: 'burn', target: 'attacker' }] },
  { id: 'cabbage', name: 'Cabbage', cookedName: 'Sauerkraut', emoji: '🥬', tier: 2, flavor: 'sour', attack: 1, hp: 8, values: [1, 1, 2],
    text: 'Leafy shield: when the friend ahead is hit, the attacker Rots {v}.',
    cooked: { text: 'Start of battle: the enemy front row Rots 1.', abilities: [{ trigger: 'startOfBattle', effect: 'rot', target: 'enemyFrontRow', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'friendAheadHit', effect: 'rot', target: 'attacker' }] },
  { id: 'iceCream', name: 'Ice Cream', cookedName: 'Sundae', emoji: '🍦', tier: 2, flavor: 'sweet', attack: 2, hp: 5, values: [1, 1, 2],
    text: 'Start of battle: the enemy across is Chilled {v} (skips an attack). In the freezer: +1/+1 a day, for {d} days.',
    cooked: { text: 'Start of battle: adjacent friends gain +1/+2.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'adjacentFriends', hp: 2, values: [1, 1, 1] }] },
    abilities: [
      { trigger: 'startOfBattle', effect: 'chill', target: 'enemyInLane' },
      { trigger: 'fridgeTurn', effect: 'buff', values: [1, 1, 1], days: [3, 5, 8] },
    ] },
  { id: 'sourdough', name: 'Sourdough Starter', cookedName: 'Sourdough Loaf', emoji: '🍞', tier: 2, flavor: 'sour', attack: 2, hp: 6, values: [1, 1, 2],
    text: 'Sell: everything you buy for the rest of the day gets +{v}/+{v}.',
    cooked: { text: 'Start of day: everything you buy today gets +1/+1.', abilities: [{ trigger: 'startTurn', effect: 'buyBonus', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'sell', effect: 'buyBonus' }] },

  { id: 'mochi', name: 'Mochi', cookedName: 'Daifuku', emoji: '🍡', tier: 2, flavor: 'sweet', attack: 1, hp: 7, values: [1, 2, 3],
    text: 'Chewy: when hit, gain +{v} HP (up to 4 times a battle).',
    cooked: { text: 'Eaten: adjacent friends gain +4 HP.', abilities: [{ trigger: 'faint', effect: 'buff', target: 'adjacentFriends', attack: 0, values: [4, 4, 4] }] },
    abilities: [{ trigger: 'hit', effect: 'buff', attack: 0, max: 4 }] },
  { id: 'breadDough', name: 'Bread Dough', cookedName: 'Country Loaf', emoji: '🥯', tier: 2, flavor: 'salty', attack: 1, hp: 7, values: [2, 2, 3],
    text: 'Rises: end of day, gain +{v} HP, for {d} days.',
    cooked: { text: 'End of day: adjacent friends gain +2 HP, for 8 days.', abilities: [{ trigger: 'endTurn', effect: 'buff', target: 'adjacentFriends', attack: 0, values: [2, 2, 2], days: [8, 8, 8] }] },
    abilities: [{ trigger: 'endTurn', effect: 'buff', attack: 0, days: [3, 5, 8] }] },
  { id: 'olive', name: 'Olive', cookedName: 'Tapenade', emoji: '🫒', tier: 2, flavor: 'salty', attack: 3, hp: 6, values: [2, 3, 4],
    attackPattern: 'lob',
    text: 'Opening lob: on the first turn, from either row, its pit hits the enemy back row in its lane (the front if the back is empty) for half its attack. Start of battle: the friend ahead gains {v} Crust.',
    cooked: { text: 'Start of battle: your friends gain 2 Crust.', abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'allFriends', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'friendAhead' }] },
  { id: 'hotCocoa', name: 'Hot Cocoa', cookedName: 'Cocoa Deluxe', emoji: '☕', tier: 2, flavor: 'sweet', attack: 1, hp: 7, values: [1, 1, 2],
    text: 'Whenever an adjacent friend is healed, it gains +{v} attack (up to 4 times a battle).',
    cooked: { text: 'Every turn: heal adjacent friends 1.', abilities: [{ trigger: 'round', effect: 'heal', target: 'adjacentFriends', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'friendHealed', effect: 'buff', target: 'thatFriend', hp: 0, max: 4 }] },
  // Tier 3 (4 gold)
  { id: 'cheese', name: 'Cheese', cookedName: 'Fondue', emoji: '🧀', tier: 3, flavor: 'savory', attack: 2, hp: 8, values: [1, 1, 2],
    text: 'Ages: end of day, +{v}/+{v}, twice as much next to a Savory friend, for {d} days.',
    cooked: { text: 'Start of battle: adjacent friends gain +2/+2.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'adjacentFriends', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'endTurn', effect: 'buff', doubleNextTo: 'savory', days: [4, 6, 10] }] },
  { id: 'wasabi', name: 'Wasabi', cookedName: 'Wasabi Peas', emoji: '🌿', tier: 3, flavor: 'spicy', attack: 3, hp: 7, values: [3, 5, 7],
    text: 'First attack each battle deals +{v} damage.',
    cooked: { text: 'Start of battle: deal 6 damage to the enemy across.', abilities: [{ trigger: 'startOfBattle', effect: 'damage', target: 'enemyInLane', values: [6, 6, 6] }] },
    abilities: [{ trigger: 'firstAttack', effect: 'bonusDamage' }] },
  { id: 'honey', name: 'Honey', cookedName: 'Honeycomb', emoji: '🍯', tier: 3, flavor: 'sweet', attack: 2, hp: 10, values: [1, 2, 3],
    text: 'Start of battle: adjacent friends gain +{v}/+{v}, double for Spicy neighbours.',
    cooked: { text: 'Every 2 turns: adjacent friends gain +1/+1.', abilities: [{ trigger: 'round', every: 2, effect: 'buff', target: 'adjacentFriends', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'adjacentFriends', forFlavor: { flavor: 'spicy', mult: 2 } }] },
  { id: 'pickle', name: 'Pickle', cookedName: 'Fried Pickle', emoji: '🥒', tier: 3, flavor: 'sour', attack: 2, hp: 8, values: [2, 3, 4],
    text: 'Start of battle: the strongest enemy loses {v} attack. In the freezer: +1/+1 a day, for {d} days.',
    cooked: { text: 'Hit: the attacker loses 1 attack.', abilities: [{ trigger: 'hit', effect: 'debuff', target: 'attacker', values: [1, 1, 1] }] },
    abilities: [
      { trigger: 'startOfBattle', effect: 'debuff', target: 'highestAttackEnemy' },
      { trigger: 'fridgeTurn', effect: 'buff', values: [1, 1, 1], days: [4, 6, 10] },
    ] },
  { id: 'anchovy', name: 'Anchovy', cookedName: 'Caesar Salad', emoji: '🐟', tier: 3, flavor: 'salty', attack: 2, hp: 7, values: [2, 3, 4],
    text: 'Every 2 turns: this and the friend in its lane gain {v} Crust.',
    cooked: { text: 'Start of battle: front-row friends gain 3 Crust.', abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'frontRowFriends', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'round', every: 2, effect: 'crust', target: 'laneFriends' }] },
  { id: 'fortuneCookie', name: 'Fortune Cookie', cookedName: 'Lucky Cookie Jar', emoji: '🥠', tier: 3, flavor: 'sweet', attack: 2, hp: 7, values: [1, 1, 2],
    text: 'Interest cap +1/2/3. Start of day, if you earned interest: +{v}/+{v}, for {d} days.',
    interestCap: [1, 2, 3],
    cooked: { text: 'End of day: +2 gold tomorrow.', abilities: [{ trigger: 'endTurn', effect: 'gold', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'startTurn', effect: 'buff', ifInterest: true, days: [4, 6, 10] }] },
  { id: 'kebab', name: 'Kebab', cookedName: 'Shish Platter', emoji: '🍢', tier: 3, flavor: 'savory', attack: 3, hp: 9, values: [1, 2, 3],
    attackPattern: 'pierce',
    text: 'Pierce attack: also hits the food behind its target, for half. Start of battle: the friend behind it gains +{v} attack.',
    cooked: { text: 'Start of battle: attacks twice on its first 2 attacks.', abilities: [{ trigger: 'startOfBattle', effect: 'extraAttacks', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'friendBehind', hp: 0 }] },
  { id: 'nachos', name: 'Nachos', cookedName: 'Supreme Nachos', emoji: '🧀', tier: 3, flavor: 'salty', attack: 2, hp: 9, values: [1, 2, 3],
    attackPattern: 'splash', art: 'nachos',
    text: 'Splash attack: also hits the front foods in both neighbouring lanes, for 1. Hit: gain {v} Crust.',
    cooked: { text: 'Every 2 turns: deal 3 damage to the enemy front row.', abilities: [{ trigger: 'round', every: 2, effect: 'damage', target: 'enemyFrontRow', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'hit', effect: 'crust' }] },

  { id: 'yogurt', name: 'Yogurt', cookedName: 'Frozen Yogurt', emoji: '🥛', tier: 3, flavor: 'sour', attack: 2, hp: 8, values: [1, 2, 3],
    text: 'Live cultures: start of day, +{v} HP, twice as much next to a Sour friend, for {d} days.',
    cooked: { text: 'Start of battle: the enemy across is Chilled 2.', abilities: [{ trigger: 'startOfBattle', effect: 'chill', target: 'enemyInLane', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'startTurn', effect: 'buff', attack: 0, doubleNextTo: 'sour', days: [4, 6, 10] }] },
  { id: 'chiliOil', name: 'Chili Oil', cookedName: 'Chili Crisp', emoji: '🫙', tier: 3, flavor: 'spicy', attack: 2, hp: 7, values: [1, 1, 2],
    text: 'Infuses: start of day, +{v} attack, twice as much next to a Spicy friend, for {d} days.',
    cooked: { text: 'Start of battle: Spicy friends gain +3 attack.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'allFriends', onlyFlavor: 'spicy', hp: 0, values: [3, 3, 3] }] },
    abilities: [{ trigger: 'startTurn', effect: 'buff', hp: 0, doubleNextTo: 'spicy', days: [4, 6, 10] }] },
  { id: 'mapleSyrup', name: 'Maple Syrup', cookedName: 'Maple Taffy', emoji: '🍁', tier: 3, flavor: 'sweet', attack: 2, hp: 8, values: [1, 1, 2],
    text: 'End of day: 2 random friends gain +{v} HP, for {d} days.',
    cooked: { text: 'Start of battle: your friends gain +3 HP.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'allFriends', attack: 0, values: [3, 3, 3] }] },
    abilities: [{ trigger: 'endTurn', effect: 'buff', target: 'randomFriends', count: 2, attack: 0, days: [4, 6, 10] }] },
  { id: 'peppercorn', name: 'Peppercorns', cookedName: 'Pepper Steak Rub', emoji: '🌶️', tier: 3, flavor: 'spicy', attack: 2, hp: 7, values: [1, 1, 2],
    attackPattern: 'spray',
    text: 'Opening spray: on the first turn, from either row, 3 peppercorns at random enemies, each for half its attack (Spicy bonuses Burn with each one).',
    cooked: { text: 'Start of battle: every enemy Burns 2.', abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'allEnemies', values: [2, 2, 2] }] },
    abilities: [] },
  { id: 'porkCrackling', name: 'Pork Crackling', cookedName: 'Chicharrón', emoji: '🥓', tier: 3, flavor: 'salty', attack: 2, hp: 11, values: [2, 3, 4],
    text: 'Crackles: whenever Crust blocks a hit on it or an adjacent friend, the attacker takes {v} damage (up to 6 times a battle).',
    cooked: { text: 'Start of battle: adjacent friends gain 3 Crust.', abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'adjacentFriends', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'crustBlock', effect: 'damage', target: 'attacker', max: 6 }] },
  { id: 'pepperoni', name: 'Pepperoni', cookedName: 'Pepperoni Roll', emoji: '🍕', tier: 3, flavor: 'spicy', attack: 2, hp: 8, values: [2, 3, 4],
    text: 'Friend summoned: the enemy across Burns {v}.',
    cooked: { text: 'Friend summoned: it gains +2/+2.', abilities: [{ trigger: 'friendSummoned', effect: 'buff', target: 'summoned', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'friendSummoned', effect: 'burn', target: 'enemyInLane' }] },
  // Tier 4 (4 gold)
  { id: 'mushroom', name: 'Mushroom', cookedName: 'Risotto', emoji: '🍄', tier: 4, flavor: 'savory', attack: 2, hp: 11, values: [2, 3, 4],
    text: 'Every 2 turns: summon a {v}/{v} Spore into an empty slot.',
    cooked: { text: 'Eaten: summon two 4/4 Spores.', abilities: [{ trigger: 'faint', effect: 'summon', count: 2, summon: { id: 'spore' }, values: [4, 4, 4] }] },
    abilities: [{ trigger: 'round', every: 2, effect: 'summon', summon: { id: 'spore' } }] },
  { id: 'coffee', name: 'Coffee Bean', cookedName: 'Espresso', emoji: '☕', tier: 4, flavor: 'spicy', attack: 3, hp: 8, values: [1, 2, 3],
    text: 'Start of battle: the friend ahead (or this, if in front) attacks twice on its first {v} attacks, one more if that friend is Sweet.',
    cooked: { text: 'Start of battle: your front row attacks twice on its first attack.', abilities: [{ trigger: 'startOfBattle', effect: 'extraAttacks', target: 'frontRowFriends', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'extraAttacks', target: 'friendAheadOrSelf', forFlavor: { flavor: 'sweet', add: 1 } }] },
  { id: 'watermelon', name: 'Watermelon', cookedName: 'Fruit Salad', emoji: '🍉', tier: 4, flavor: 'sweet', attack: 2, hp: 16, values: [2, 3, 4],
    text: 'Every 2nd time hit: drop a {v}/{v} Slice into an empty slot.',
    cooked: { text: 'Eaten: summon three 4/4 Slices.', abilities: [{ trigger: 'faint', effect: 'summon', count: 3, summon: { id: 'slice' }, values: [4, 4, 4] }] },
    abilities: [{ trigger: 'hit', every: 2, effect: 'summon', summon: { id: 'slice' } }] },
  { id: 'grapefruit', name: 'Grapefruit', cookedName: 'Sorbet', emoji: '🍊', tier: 4, flavor: 'sour', attack: 3, hp: 10, values: [1, 1, 2],
    text: 'Start of battle: the enemy front row loses {v} attack.',
    cooked: { text: 'Start of battle: the enemy front row is Chilled 1 and loses 1 attack.', abilities: [{ trigger: 'startOfBattle', effect: 'chill', target: 'enemyFrontRow', values: [1, 1, 1] }, { trigger: 'startOfBattle', effect: 'debuff', target: 'enemyFrontRow', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'debuff', target: 'enemyFrontRow' }] },
  { id: 'bacon', name: 'Bacon', cookedName: 'BLT', emoji: '🥓', tier: 4, flavor: 'salty', attack: 4, hp: 8, values: [2, 3, 4],
    text: 'Hit: grease splatter deals {v} damage to the attacker.',
    cooked: { text: 'Start of battle: adjacent friends gain 3 Crust.', abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'adjacentFriends', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'hit', effect: 'damage', target: 'attacker' }] },
  { id: 'soySauce', name: 'Soy Sauce', cookedName: 'Aged Shoyu', emoji: '🫗', tier: 4, flavor: 'salty', attack: 2, hp: 10, values: [1, 1, 2],
    text: 'Reroll: a random level 3 friend gains +{v}/+{v}. Start of day: if you have a level 3 food, your first restock is free.',
    cooked: { text: 'Start of battle: level 3 friends gain +3/+3.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'level3Friends', values: [3, 3, 3] }] },
    abilities: [
      { trigger: 'reroll', effect: 'buff', target: 'level3Friends', count: 1 },
      { trigger: 'startTurn', effect: 'freeReroll', ifLevel3: true, values: [1, 1, 1] },
    ] },
  { id: 'blueCheese', name: 'Blue Cheese', cookedName: 'Roquefort', emoji: '🧀', tier: 4, flavor: 'sour', flavor2: 'savory', attack: 3, hp: 10, values: [1, 2, 3],
    art: 'blueCheese',
    text: 'Hit: the attacker Rots {v}.',
    cooked: { text: 'Start of battle: all enemies Rot 1.', abilities: [{ trigger: 'startOfBattle', effect: 'rot', target: 'allEnemies', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'hit', effect: 'rot', target: 'attacker' }] },
  { id: 'sweetSour', name: 'Sweet & Sour Pork', cookedName: 'Gu Lao Rou', emoji: '🍖', tier: 4, flavor: 'sweet', flavor2: 'sour', attack: 3, hp: 10, values: [1, 2, 3],
    text: 'Every 2 turns: the enemy across Rots 1. Every turn: this heals {v}.',
    cooked: { text: 'Every 2 turns: the enemy front row Rots 2.', abilities: [{ trigger: 'round', every: 2, effect: 'rot', target: 'enemyFrontRow', values: [2, 2, 2] }] },
    abilities: [
      { trigger: 'round', every: 2, effect: 'rot', target: 'enemyInLane', values: [1, 1, 1] },
      { trigger: 'round', effect: 'heal' },
    ] },

  { id: 'peanutButter', name: 'Peanut Butter', cookedName: 'PB&J', emoji: '🥜', tier: 4, flavor: 'salty', attack: 3, hp: 10, values: [1, 1, 2],
    text: 'Sticks together: end of day, adjacent friends gain +{v} HP, for {d} days.',
    cooked: { text: 'Start of battle: adjacent friends gain 4 Crust.', abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'adjacentFriends', values: [4, 4, 4] }] },
    abilities: [{ trigger: 'endTurn', effect: 'buff', target: 'adjacentFriends', attack: 0, days: [4, 6, 10] }] },
  // Tier 5 (5 gold)
  { id: 'steak', name: 'Steak', cookedName: 'Steak Frites', emoji: '🥩', tier: 5, flavor: 'savory', attack: 4, hp: 13, values: [2, 3, 4],
    text: 'Friend summoned: give it +{v}/+{v}.',
    cooked: { text: 'Start of battle: adjacent friends gain +3/+3.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'adjacentFriends', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'friendSummoned', effect: 'buff', target: 'summoned' }] },
  { id: 'ghostPepper', name: 'Ghost Pepper', cookedName: 'Ghost Pepper Wings', emoji: '👻', tier: 5, flavor: 'spicy', attack: 4, hp: 10, values: [3, 5, 7],
    text: 'Start of battle: a random back-row enemy (front row if none) Burns {v}.',
    cooked: { text: 'Start of battle: all enemies Burn 3.', abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'allEnemies', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'randomBackEnemy' }] },
  { id: 'pineapple', name: 'Pineapple', cookedName: 'Pina Colada', emoji: '🍍', tier: 5, flavor: 'sweet', attack: 3, hp: 12, values: [1, 1, 2],
    text: 'Hit: adjacent friends gain +{v}/+{v} (up to 3 times a battle).',
    cooked: { text: 'Every turn: your friends gain +1/+1.', abilities: [{ trigger: 'round', effect: 'buff', target: 'allFriends', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'hit', effect: 'buff', target: 'adjacentFriends', max: 3 }] },
  { id: 'durian', name: 'Durian', cookedName: 'Durian Crepe', emoji: '🦔', tier: 5, flavor: 'sour', attack: 4, hp: 16, values: [1, 1, 2],
    text: 'Hit: the stench makes every enemy in the front row Rot {v} (up to 3 times a battle).',
    cooked: { text: 'Start of battle: all enemies Rot 2.', abilities: [{ trigger: 'startOfBattle', effect: 'rot', target: 'allEnemies', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'hit', effect: 'rot', target: 'enemyFrontRow', max: 3 }] },
  { id: 'caviar', name: 'Caviar', cookedName: 'Blini Platter', emoji: '🫙', tier: 5, flavor: 'salty', attack: 3, hp: 11, values: [2, 3, 4],
    text: 'Raises your interest cap by 1/2/3. Hit: gain {v} Crust.',
    interestCap: [1, 2, 3],
    cooked: { text: 'End of day: +3 gold tomorrow. Start of battle: your friends gain 2 Crust.', abilities: [{ trigger: 'endTurn', effect: 'gold', values: [3, 3, 3] }, { trigger: 'startOfBattle', effect: 'crust', target: 'allFriends', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'hit', effect: 'crust' }] },
  { id: 'spaghetti', name: 'Spaghetti', cookedName: 'Spaghetti Bolognese', emoji: '🍝', tier: 5, flavor: 'savory', attack: 3, hp: 14, values: [1, 1, 2],
    attackPattern: 'escalate',
    text: 'Escalating attack: one target, then the whole front row from turn 3, then every enemy from turn 5 (extra targets take half). Start of battle: adjacent friends gain +{v}/+{v}.',
    cooked: { text: 'Start of battle: attacks twice on its first 3 attacks.', abilities: [{ trigger: 'startOfBattle', effect: 'extraAttacks', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'adjacentFriends' }] },

  { id: 'takoyaki', name: 'Takoyaki', cookedName: 'Takoyaki Boat', emoji: '🐙', tier: 5, flavor: 'savory', attack: 3, hp: 12, values: [1, 2, 3],
    attackPattern: 'volley',
    text: 'Volleys every turn, from either row, instead of attacking: a ball at every enemy in the front row, each for half its attack.',
    cooked: { text: 'Start of battle: the enemy front row Burns 2.', abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'enemyFrontRow', values: [2, 2, 2] }] },
    abilities: [] },
  // Tier 6 (5 gold)
  { id: 'pizza', name: 'Pizza', cookedName: 'Deep Dish', emoji: '🍕', tier: 6, flavor: 'savory', attack: 4, hp: 15, values: [1, 2, 3],
    text: 'Start of battle: adjacent friends gain +{v} HP for each different flavor on your plate.',
    cooked: { text: 'Start of battle: your friends gain +1/+1 for each different flavor on your plate.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'allFriends', perDistinctFlavor: true, values: [1, 1, 1] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'adjacentFriends', perDistinctFlavor: true, attack: 0 }] },
  { id: 'hotPot', name: 'Hot Pot', cookedName: 'Mala Hot Pot', emoji: '🍲', tier: 6, flavor: 'spicy', attack: 4, hp: 18, values: [1, 2, 3],
    attackPattern: 'fork',
    text: 'Fork attack: hits both other lanes instead of its own. Start of battle: the enemy front row Burns {v}.',
    cooked: { text: 'Start of battle: all enemies Burn 4. Every turn: 2 more.', abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'allEnemies', values: [4, 4, 4] }, { trigger: 'round', effect: 'burn', target: 'allEnemies', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'enemyFrontRow' }] },
  { id: 'cake', name: 'Birthday Cake', cookedName: 'Wedding Cake', emoji: '🎂', tier: 6, flavor: 'sweet', attack: 3, hp: 20, values: [2, 3, 4],
    aura: 'soothe',
    text: 'Your heals are +1. Eaten: summon three {v}/{v} Cake Slices.',
    cooked: { text: 'Start of battle: your friends gain +2/+4.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'allFriends', attack: 2, hp: 4, values: [1, 1, 1] }] },
    abilities: [{ trigger: 'faint', effect: 'summon', count: 3, summon: { id: 'cakeSlice' } }] },
  { id: 'kimchi', name: 'Kimchi', cookedName: 'Kimchi Jjigae', emoji: '🥬', tier: 6, flavor: 'sour', flavor2: 'spicy', attack: 4, hp: 15, values: [1, 1, 2],
    art: 'kimchi',
    text: 'Start of battle: the enemy front row Rots {v} and Burns {v}.',
    cooked: { text: 'Every turn: all enemies Rot 1 and Burn 1.', abilities: [{ trigger: 'round', effect: 'rot', target: 'allEnemies', values: [1, 1, 1] }, { trigger: 'round', effect: 'burn', target: 'allEnemies', values: [1, 1, 1] }] },
    abilities: [
      { trigger: 'startOfBattle', effect: 'rot', target: 'enemyFrontRow' },
      { trigger: 'startOfBattle', effect: 'burn', target: 'enemyFrontRow' },
    ] },
  { id: 'ramen', name: 'Ramen', cookedName: 'Tonkotsu Ramen', emoji: '🍜', tier: 6, flavor: 'salty', attack: 4, hp: 18, values: [2, 3, 4],
    text: 'Start of battle: front-row friends gain {v} Crust (double for Savory friends).',
    cooked: { text: 'Start of battle: your friends gain 6 Crust. Every 2 turns: 3 more.', abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'allFriends', values: [6, 6, 6] }, { trigger: 'round', every: 2, effect: 'crust', target: 'allFriends', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'frontRowFriends', forFlavor: { flavor: 'savory', mult: 2 } }] },
  { id: 'bento', name: 'Bento Box', cookedName: 'Jubako', emoji: '🍱', tier: 6, flavor: 'savory', flavor2: 'salty', attack: 3, hp: 16, values: [1, 2, 3],
    aura: 'echo',
    text: "The friend ahead's abilities trigger twice. Start of battle: the friend ahead gains {v} Crust.",
    cooked: { text: 'Start of battle: your friends gain +3/+3.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'allFriends', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'friendAhead' }] },
  { id: 'smoothie', name: 'Smoothie', cookedName: 'Smoothie Bowl', emoji: '🥤', tier: 6, flavor: 'sweet', flavor2: 'sour', attack: 3, hp: 16, values: [1, 1, 2],
    aura: 'rally',
    text: 'A friend next to it gains +1 attack whenever its ability fires (up to +3). Every 2 turns: heal adjacent friends {v}.',
    cooked: { text: 'Start of battle: your friends gain +2 attack. Every turn: heal your friends 2.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'allFriends', hp: 0, values: [2, 2, 2] }, { trigger: 'round', effect: 'heal', target: 'allFriends', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'round', every: 2, effect: 'heal', target: 'adjacentFriends' }] },
  { id: 'roastTurkey', name: 'Roast Turkey', cookedName: 'Holiday Feast', emoji: '🦃', tier: 6, flavor: 'savory', attack: 4, hp: 18, values: [2, 3, 4],
    text: 'Feeds the table: end of day, 3 random friends gain +{v} HP, for {d} days.',
    cooked: { text: 'End of day: all your foods gain +1/+2, for 8 days.', abilities: [{ trigger: 'endTurn', effect: 'buff', target: 'allFriends', hp: 2, values: [1, 1, 1], days: [8, 8, 8] }] },
    abilities: [{ trigger: 'endTurn', effect: 'buff', target: 'randomFriends', count: 3, attack: 0, days: [5, 8, 12] }] },

  // Mythic: never in the market; delivered by the special cubby late in a run (7 gold)
  // Each mythic bends one rule, and where it sits decides who it reaches (see Aura in types.ts). Cooked, the rule
  // reaches further. No numbers to track beyond Black Garlic's opening Rot.
  { id: 'goldenTruffle', name: 'Golden Truffle', cookedName: 'Truffle Feast', emoji: '🍄', tier: 6, flavor: 'savory', attack: 3, hp: 16, values: [0, 0, 0],
    rarity: 'mythic', aura: 'cook',
    text: 'In battle, the friend in its lane is cooked: it uses its level 3 numbers and its cooked bonus.',
    cooked: { text: 'Every friend is cooked in battle.', abilities: [] },
    abilities: [] },
  { id: 'saffron', name: 'Saffron', cookedName: 'Saffron Paella', emoji: '🌼', tier: 6, flavor: 'spicy', attack: 3, hp: 14, values: [0, 0, 0],
    rarity: 'mythic', allFlavors: true, aura: 'infuse',
    text: 'Counts as every flavor. Adjacent friends count twice toward flavor bonuses.',
    cooked: { text: 'Every friend counts twice toward flavor bonuses.', abilities: [] },
    abilities: [] },
  { id: 'wagyu', name: 'Wagyu', cookedName: 'Wagyu Sukiyaki', emoji: '🥩', tier: 6, flavor: 'salty', flavor2: 'sweet', attack: 4, hp: 22, values: [4, 5, 6],
    rarity: 'mythic', art: 'wagyu', aura: 'baste',
    text: 'Adjacent friends get double from Crust and heals. Start of battle: they gain {v} Crust.',
    cooked: { text: 'Every friend gets double from Crust and heals.', abilities: [] },
    abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'adjacentFriends' }] },
  { id: 'blackGarlic', name: 'Black Garlic', cookedName: 'Black Garlic Ramen', emoji: '🧄', tier: 6, flavor: 'sour', flavor2: 'spicy', attack: 3, hp: 15, values: [1, 2, 3],
    rarity: 'mythic', aura: 'ferment',
    text: 'Enemies in its lane take double damage from Burn and Rot. Start of battle: they Rot {v}.',
    cooked: { text: 'Every enemy takes double damage from Burn and Rot.', abilities: [] },
    abilities: [{ trigger: 'startOfBattle', effect: 'rot', target: 'enemyLane' }] },

  // Summoned tokens (stats are set by the summoner)
  { id: 'yolk', name: 'Yolk', cookedName: 'Yolk', emoji: '🍳', tier: 1, flavor: 'savory', attack: 1, hp: 1,
    values: [0, 0, 0], abilities: [], text: 'Summoned by Egg.', token: true },
  { id: 'kernel', name: 'Kernel', cookedName: 'Kernel', emoji: '🌽', tier: 1, flavor: 'salty', attack: 1, hp: 2,
    values: [0, 0, 0], abilities: [], text: 'Summoned by Popcorn.', token: true },
  { id: 'spore', name: 'Spore', cookedName: 'Spore', emoji: '🟤', tier: 1, flavor: 'savory', attack: 1, hp: 1,
    values: [0, 0, 0], abilities: [], text: 'Summoned by Mushroom.', token: true },
  { id: 'slice', name: 'Watermelon Slice', cookedName: 'Watermelon Slice', emoji: '🍉', tier: 1, flavor: 'sweet', attack: 1, hp: 1,
    values: [0, 0, 0], abilities: [], text: 'Summoned by Watermelon.', token: true },
  { id: 'cakeSlice', name: 'Cake Slice', cookedName: 'Cake Slice', emoji: '🍰', tier: 1, flavor: 'sweet', attack: 1, hp: 1,
    values: [0, 0, 0], abilities: [], text: 'Summoned by Birthday Cake.', token: true },
  { id: 'crumb', name: 'Crumb', cookedName: 'Crumb', emoji: '🍞', tier: 1, flavor: 'savory', attack: 2, hp: 2,
    values: [0, 0, 0], abilities: [], text: 'Left behind by an eaten friend (Savory x6).', token: true },
];

export const ITEMS: ItemDef[] = [
  { id: 'butter', name: 'Butter', emoji: '🧈', tier: 1, cost: 3, held: false, text: '+1/+2 permanently.' },
  { id: 'hotSauce', name: 'Hot Sauce', emoji: '🔥', tier: 1, cost: 2, held: false, text: '+3 attack for the next battle only.' },
  { id: 'flavorPacket', name: 'Flavor Packet', emoji: '🧂', tier: 1, cost: 3, held: false, text: 'The food gains a random flavor it doesn\'t have (up to 3 flavors).' },
  { id: 'oliveOil', name: 'Olive Oil', emoji: '🫒', tier: 1, cost: 4, held: false, text: '+1/+1 and +2 sell value, permanently.' },
  { id: 'saltShaker', name: 'Salt Shaker', emoji: '🧂', tier: 2, cost: 4, held: true, text: 'Held: gain 4 Crust at Start of battle.' },
  { id: 'toothpick', name: 'Toothpick', emoji: '🥢', tier: 2, cost: 4, held: true, text: "Held: this unit's attacks ignore Crust." },
  { id: 'boneBroth', name: 'Bone Broth', emoji: '🍵', tier: 2, cost: 3, held: false, text: '+4 HP permanently.' },
  { id: 'seasoning', name: 'Seasoning Blend', emoji: '🫚', tier: 3, cost: 3, held: false, text: "Change the unit's flavor." },
  { id: 'tupperware', name: 'Tupperware', emoji: '🥡', tier: 3, cost: 4, held: true, text: 'Held: the first hit on this unit each battle is fully blocked.' },
  { id: 'microwave', name: 'Microwave', emoji: '♨️', tier: 4, cost: 6, held: false, text: '+1 merge progress (counts as one extra copy).' },
  { id: 'lunchbox', name: 'Lunchbox', emoji: '🍱', tier: 5, cost: 7, held: false, text: 'All friends +1/+2 permanently.' },
];

const unitById = new Map(UNITS.map((u) => [u.id, u]));
const itemById = new Map(ITEMS.map((i) => [i.id, i]));

/** Whether a food id still exists (saves and ghosts can hold foods that were removed since). */
export const isUnit = (id: string) => unitById.has(id);

/** Adds a food at runtime (tests and quick experiments; real foods belong in UNITS). */
export function registerUnit(def: UnitDef) {
  unitById.set(def.id, def);
}

export function unitDef(id: string): UnitDef {
  const def = unitById.get(id);
  if (!def) throw new Error(`Unknown unit: ${id}`);
  return def;
}

export function itemDef(id: ItemId): ItemDef {
  const def = itemById.get(id);
  if (!def) throw new Error(`Unknown item: ${id}`);
  return def;
}

/** A food's abilities at a level: its own, plus its cooked bonus at level 3 (always after its own, so indexes hold). */
export function abilitiesOf(def: UnitDef, level: Level): AbilityDef[] {
  return level === 3 && def.cooked ? [...def.abilities, ...def.cooked.abilities] : def.abilities;
}

/** The number of growth days a food's ability text means by {d}: its first day-gated ability, at this level. */
export function daysOf(def: UnitDef, level: Level): number | undefined {
  return abilitiesOf(def, level).find((ab) => ab.days)?.days?.[level - 1];
}

const RARITY_BY_TIER: Record<Tier, Rarity> = { 1: 'common', 2: 'common', 3: 'rare', 4: 'rare', 5: 'epic', 6: 'legendary' };

/** A food's rarity: its own `rarity`, else the default for its tier. */
export function rarityOf(def: UnitDef): Rarity {
  return def.rarity ?? RARITY_BY_TIER[def.tier];
}

/** Foods the market can offer: no summoned tokens and no mythics. */
export const MARKET_UNITS = UNITS.filter((u) => !u.token && rarityOf(u) !== 'mythic');
/** Mythic foods, only delivered by the special cubby. */
export const MYTHIC_UNITS = UNITS.filter((u) => !u.token && rarityOf(u) === 'mythic');

/** Gold a food costs: 3 for tiers 1-2, 4 for tiers 3-4, 5 for tiers 5-6, 7 for mythics. */
export function unitCost(def: UnitDef): number {
  if (rarityOf(def) === 'mythic') return 7;
  return def.tier <= 2 ? 3 : def.tier <= 4 ? 4 : 5;
}

/** Every flavor a food counts as: its (possibly seasoned) flavor, any second flavor, and flavors it gained. */
export function flavorsOf(u: { defId: string; flavorOverride?: Flavor; extraFlavors?: Flavor[] }): Flavor[] {
  const def = unitDef(u.defId);
  const main = u.flavorOverride ?? def.flavor;
  return [...new Set([main, ...(def.flavor2 ? [def.flavor2] : []), ...(u.extraFlavors ?? [])])];
}

/**
 * Foods of each flavor on a plate, for the 2/4/6 flavor bonuses. A food counts once for every flavor it has (all five
 * for Saffron), and twice when it sits next to a Saffron (every food, once Saffron is cooked). The kitchen and the
 * battle both count with this, from where the foods were placed.
 */
export function flavorTally(plate: Plate): Map<Flavor, number> {
  const infusers = plate.flatMap((u, slot) => (u && unitDef(u.defId).aura === 'infuse' ? [{ slot, cooked: levelOf(u.copies) === 3 }] : []));
  const counts = new Map<Flavor, number>();
  plate.forEach((u, slot) => {
    if (!u || unitDef(u.defId).token) return;
    const weight = infusers.some((f) => f.slot !== slot && (f.cooked || isAdjacent(f.slot, slot))) ? 2 : 1;
    for (const fl of unitDef(u.defId).allFlavors ? FLAVORS : flavorsOf(u)) counts.set(fl, (counts.get(fl) ?? 0) + weight);
  });
  return counts;
}

/**
 * Plate slots a food at `slot` reaches with its position-based abilities (adjacent friends, the friend ahead or
 * behind, lane friends, reactions to the friend ahead, auras, and kitchen "next to a <flavor> friend" conditions).
 * Used to show links on the plate.
 */
export function linkedSlots(def: UnitDef, slot: number, level: Level = 1): number[] {
  const lane = laneOf(slot);
  const back = rowOf(slot) === 1;
  const ahead = slotAt(lane, 0);
  const behind = slotAt(lane, 1);
  const adjacent = [0, 1, 2, 3, 4, 5].filter((o) => isAdjacent(o, slot));
  const out = new Set<number>();
  for (const ab of abilitiesOf(def, level)) {
    const t = ab.target;
    if (t === 'adjacentFriends' || (t === 'aheadElseAdjacent' && !back) || ab.ifAdjacentFlavor) adjacent.forEach((o) => out.add(o));
    if (back && (t === 'friendAhead' || t === 'friendAheadOrSelf' || t === 'aheadElseAdjacent')) out.add(ahead);
    if (back && (ab.trigger === 'friendAheadHit' || ab.trigger === 'friendAheadAttacks')) out.add(ahead);
    if (!back && t === 'friendBehind') out.add(behind);
    if (t === 'laneFriends') out.add(back ? ahead : behind);
  }
  if (back && def.aura === 'echo') out.add(ahead);
  if (def.aura === 'rally' || def.aura === 'infuse' || def.aura === 'baste') adjacent.forEach((o) => out.add(o));
  if (def.aura === 'cook') out.add(back ? ahead : behind);
  return [...out];
}
