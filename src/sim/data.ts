import { type AbilityDef, FLAVORS, type Flavor, type ItemDef, type ItemId, type Level, type Plate, type Rarity, type Tier, type UnitDef, isAdjacent, laneOf, levelOf, rowOf, slotAt } from './types';

// The roster. Each food: stats, level 1/2/3 ability numbers (`values`), and a list of abilities built from
// triggers, targets and effects (see AbilityDef in types.ts and "Designing foods" in DESIGN.md).
// `cooked` is a bonus that only switches on at level 3 (6 copies). It gets much stronger with tier: a small extra at
// tier 1, the whole plate at tier 6 and for mythics. Its numbers are fixed (the same `values` at every level).
// `text` is what players read; keep it in step with `abilities`. Tune numbers with `npm run balance`.
// Attack and HP are kept close enough that fights end in a handful of turns; flavors (Burn, Rot, Crust, healing)
// decide them as much as raw hits.
export const UNITS: UnitDef[] = [
  // Tier 1 (3 gold)
  { id: 'egg', name: 'Egg', cookedName: 'Omelette', emoji: '🥚', tier: 1, flavor: 'savory', attack: 2, hp: 6, values: [1, 2, 3],
    text: 'First time hit: summon a {v}/{v} Yolk.',
    cooked: { text: 'Eaten: summon a 3/3 Yolk.', abilities: [{ trigger: 'faint', effect: 'summon', summon: { id: 'yolk' }, values: [3, 3, 3] }] },
    abilities: [{ trigger: 'hit', once: true, effect: 'summon', summon: { id: 'yolk' } }] },
  { id: 'chili', name: 'Chili Pepper', cookedName: 'Roasted Chili', emoji: '🌶️', tier: 1, flavor: 'spicy', attack: 3, hp: 5, values: [2, 3, 4],
    text: 'Start of battle: the enemy across Burns {v}.',
    cooked: { text: 'Hit: the attacker Burns 2.', abilities: [{ trigger: 'hit', effect: 'burn', target: 'attacker', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'enemyInLane' }] },
  { id: 'sugar', name: 'Sugar Cube', cookedName: 'Caramel', emoji: '🍬', tier: 1, flavor: 'sweet', attack: 2, hp: 4, values: [1, 2, 3],
    text: 'Sell: give 2 random friends +{v}/+{v}.',
    cooked: { text: 'Start of battle: a random friend gains +2/+2.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'randomFriends', count: 1, values: [2, 2, 2] }] },
    abilities: [{ trigger: 'sell', effect: 'buff', target: 'randomFriends', count: 2 }] },
  { id: 'lemon', name: 'Lemon', cookedName: 'Lemonade', emoji: '🍋', tier: 1, flavor: 'sour', attack: 3, hp: 4, values: [1, 2, 3],
    text: 'Hit: the attacker loses {v} attack.',
    cooked: { text: 'Start of battle: the enemy across loses 2 attack.', abilities: [{ trigger: 'startOfBattle', effect: 'debuff', target: 'enemyInLane', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'hit', effect: 'debuff', target: 'attacker', max: 3 }] },
  { id: 'pretzel', name: 'Pretzel', cookedName: 'Pretzel Bites', emoji: '🥨', tier: 1, flavor: 'salty', attack: 2, hp: 6, values: [2, 4, 6],
    text: 'Start of battle: adjacent friends gain {v} Crust.',
    cooked: { text: 'Every 2 turns: adjacent friends gain 2 Crust.', abilities: [{ trigger: 'round', every: 2, effect: 'crust', target: 'adjacentFriends', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'adjacentFriends' }] },
  { id: 'apple', name: 'Apple', cookedName: 'Apple Pie', emoji: '🍎', tier: 1, flavor: 'sweet', attack: 2, hp: 4, values: [1, 2, 3],
    text: 'Every turn: your friend with the least HP gains {v} HP.',
    cooked: { text: 'Eaten: your friends gain +4 HP.', abilities: [{ trigger: 'faint', effect: 'heal', target: 'allFriends', values: [4, 4, 4] }] },
    abilities: [{ trigger: 'round', effect: 'heal', target: 'lowestHpFriend' }] },
  { id: 'tofu', name: 'Tofu', cookedName: 'Mapo Tofu', emoji: '🧈', tier: 1, flavor: 'savory', attack: 3, hp: 6, values: [1, 2, 3],
    text: 'Level up: gains a random new flavor.',
    cooked: { text: 'Start of battle: the enemy across Burns 2.', abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'enemyInLane', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'levelUp', effect: 'gainFlavor', values: [1, 1, 1] }] },
  { id: 'coinChocolate', name: 'Coin Chocolate', cookedName: 'Gold Truffle Coin', emoji: '🪙', tier: 1, flavor: 'sweet', attack: 2, hp: 4, values: [1, 2, 3],
    text: 'Piggy bank: end of day, +{v} sell value.',
    cooked: { text: 'End of day: +1 gold tomorrow.', abilities: [{ trigger: 'endTurn', effect: 'gold', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'endTurn', effect: 'sellValue' }] },
  { id: 'breadstick', name: 'Breadstick', cookedName: 'Grissini Bundle', emoji: '🥖', tier: 1, flavor: 'salty', attack: 3, hp: 4, values: [1, 2, 3],
    text: 'Bought: give a random friend +{v}/+{v}.',
    cooked: { text: 'First attack each battle deals +3 damage.', abilities: [{ trigger: 'firstAttack', effect: 'bonusDamage', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'buy', effect: 'buff', target: 'randomFriends', count: 1 }] },

  { id: 'beanSprout', name: 'Bean Sprout', cookedName: 'Sprout Salad', emoji: '🌱', tier: 1, flavor: 'savory', attack: 2, hp: 5, values: [2, 3, 4],
    text: 'End of day: the friend ahead gains +{v} HP.',
    cooked: { text: 'End of day: adjacent friends gain +1/+1.', abilities: [{ trigger: 'endTurn', effect: 'buff', target: 'adjacentFriends', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'endTurn', effect: 'buff', target: 'friendAhead', attack: 0 }] },
  { id: 'edamame', name: 'Edamame', cookedName: 'Garlic Edamame', emoji: '🫛', tier: 1, flavor: 'savory', attack: 3, hp: 5, values: [1, 2, 3],
    attackPattern: 'shot', throwDamage: 2,
    text: 'Start of battle, shoots {v} random enemies for 2.',
    cooked: { text: 'Shoots twice at the start of battle.', abilities: [{ trigger: 'startOfBattle', effect: 'extraAttacks', values: [1, 1, 1] }] },
    abilities: [] },
  // Tier 2 (3 gold)
  { id: 'popcorn', name: 'Popcorn', cookedName: 'Kettle Corn', emoji: '🍿', tier: 2, flavor: 'salty', attack: 2, hp: 8, values: [1, 2, 3],
    text: 'Hit or eaten: summon a 2/2 Kernel.',
    cooked: { text: 'Hit: deal 1 damage to the attacker.', abilities: [{ trigger: 'hit', effect: 'damage', target: 'attacker', values: [1, 1, 1] }] },
    abilities: [
      { trigger: 'hit', limitToAmount: true, effect: 'summon', summon: { id: 'kernel', attack: 2, hp: 2 } },
      { trigger: 'faint', effect: 'summon', summon: { id: 'kernel', attack: 2, hp: 2 } },
    ] },
  { id: 'onion', name: 'Onion', cookedName: 'Onion Rings', emoji: '🧅', tier: 2, flavor: 'sour', attack: 3, hp: 8, values: [1, 2, 3],
    text: 'Every 3rd time hit: all enemies lose {v} attack.',
    cooked: { text: 'Start of battle: all enemies lose 1 attack.', abilities: [{ trigger: 'startOfBattle', effect: 'debuff', target: 'allEnemies', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'hit', every: 3, effect: 'debuff', target: 'allEnemies', max: 2 }] },
  { id: 'garlic', name: 'Garlic', cookedName: 'Garlic Bread', emoji: '🧄', tier: 2, flavor: 'spicy', attack: 3, hp: 7, values: [1, 2, 3],
    text: 'Start of battle: the enemy across Burns {v}, +1 per other Spicy friend.',
    cooked: { text: 'Start of battle: the enemy front row Burns 1.', abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'enemyFrontRow', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'enemyInLane', perFriend: 'spicy' }] },
  { id: 'marshmallow', name: 'Marshmallow', cookedName: "S'more", emoji: '☁️', tier: 2, flavor: 'sweet', attack: 2, hp: 8, values: [1, 2, 3],
    text: 'Hit: the friend behind gains +{v}/+{v}, double if Sweet.',
    cooked: { text: 'Start of battle: the friend behind gains 6 Crust.', abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'friendBehind', values: [6, 6, 6] }] },
    abilities: [{ trigger: 'hit', effect: 'buff', target: 'friendBehind', forFlavor: { flavor: 'sweet', mult: 2 }, max: 3 }] },
  { id: 'potato', name: 'Potato', cookedName: 'Loaded Fries', emoji: '🥔', tier: 2, flavor: 'savory', attack: 1, hp: 4, values: [1, 2, 3],
    text: "End of day: gain +{v}/+{v} if you didn't refill.",
    cooked: { text: 'Eaten: adjacent friends gain +3/+3.', abilities: [{ trigger: 'faint', effect: 'buff', target: 'adjacentFriends', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'endTurn', effect: 'buff', ifNoReroll: true }] },
  { id: 'mustard', name: 'Mustard', cookedName: 'Honey Mustard', emoji: '🟡', tier: 2, flavor: 'spicy', attack: 3, hp: 7, values: [1, 2, 3],
    text: 'When the friend ahead attacks, its target Burns {v}.',
    cooked: { text: 'Start of battle: the friend ahead gains +2 attack.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'friendAhead', hp: 0, values: [2, 2, 2] }] },
    abilities: [{ trigger: 'friendAheadAttacks', effect: 'burn', target: 'attacker' }] },
  { id: 'cabbage', name: 'Cabbage', cookedName: 'Sauerkraut', emoji: '🥬', tier: 2, flavor: 'sour', attack: 2, hp: 8, values: [1, 2, 3],
    text: 'When the friend ahead is hit, the attacker Rots {v}.',
    cooked: { text: 'Start of battle: the enemy front row Rots 1.', abilities: [{ trigger: 'startOfBattle', effect: 'rot', target: 'enemyFrontRow', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'friendAheadHit', effect: 'rot', target: 'attacker', max: 3 }] },
  { id: 'iceCream', name: 'Ice Cream', cookedName: 'Sundae', emoji: '🍦', tier: 2, flavor: 'sweet', attack: 3, hp: 5, values: [1, 2, 3],
    text: 'Start of battle: the enemy across is Chilled {v}.',
    cooked: { text: 'Chilled enemies take +2 damage from every hit.', abilities: [], chillBite: 2 },
    abilities: [{ trigger: 'startOfBattle', effect: 'chill', target: 'enemyInLane' }] },
  { id: 'dumplings', name: 'Dumplings', cookedName: 'Dim Sum Basket', emoji: '🥟', tier: 2, flavor: 'savory', attack: 4, hp: 8, values: [2, 3, 4],
    text: 'Start of day: your first {v} refills are free.',
    cooked: { text: 'Refill: gain +1/+1.', abilities: [{ trigger: 'reroll', effect: 'buff', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'startTurn', effect: 'freeReroll' }] },
  { id: 'sourdough', name: 'Sourdough Starter', cookedName: 'Sourdough Loaf', emoji: '🍞', tier: 2, flavor: 'sour', attack: 2, hp: 5, values: [1, 2, 3],
    text: 'Friend sold: gain +{v} HP.',
    cooked: { text: 'Start of day: everything you buy today gets +1/+1.', abilities: [{ trigger: 'startTurn', effect: 'buyBonus', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'friendSold', effect: 'buff', attack: 0 }] },

  { id: 'mochi', name: 'Mochi', cookedName: 'Daifuku', emoji: '🍡', tier: 2, flavor: 'sweet', attack: 2, hp: 7, values: [1, 2, 3],
    text: 'Chewy: when hit, gain +{v} HP.',
    cooked: { text: 'Eaten: adjacent friends gain +4 HP.', abilities: [{ trigger: 'faint', effect: 'buff', target: 'adjacentFriends', attack: 0, values: [4, 4, 4] }] },
    abilities: [{ trigger: 'hit', effect: 'buff', attack: 0, max: 4 }] },
  { id: 'breadDough', name: 'Bread Dough', cookedName: 'Country Loaf', emoji: '🥯', tier: 2, flavor: 'salty', attack: 1, hp: 4, values: [3, 4, 5],
    text: 'Rises: end of day, gain +{v} HP.',
    cooked: { text: 'End of day: adjacent friends gain +2 HP.', abilities: [{ trigger: 'endTurn', effect: 'buff', target: 'adjacentFriends', attack: 0, values: [2, 2, 2] }] },
    abilities: [{ trigger: 'endTurn', effect: 'buff', attack: 0 }] },
  { id: 'olive', name: 'Olive', cookedName: 'Tapenade', emoji: '🫒', tier: 2, flavor: 'salty', attack: 4, hp: 6, values: [1, 2, 3],
    attackPattern: 'lob', throwDamage: 3,
    text: 'Start of battle, from any row: lobs {v} pits at the enemy back row in its lane for 3.',
    cooked: { text: 'Its pits also make each target Rot 1.', abilities: [], throwRot: 1 },
    abilities: [] },
  { id: 'hotCocoa', name: 'Hot Cocoa', cookedName: 'Cocoa Deluxe', emoji: '☕', tier: 2, flavor: 'sweet', attack: 2, hp: 7, values: [1, 2, 3],
    text: 'Adjacent friend gains HP: it gains +{v} attack. In the kitchen, once a day.',
    cooked: { text: 'Every turn: adjacent friends gain +1 HP.', abilities: [{ trigger: 'round', effect: 'heal', target: 'adjacentFriends', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'friendHealed', effect: 'buff', target: 'thatFriend', hp: 0, dayMax: 1 }] },
  { id: 'jerky', name: 'Jerky', cookedName: 'Smoked Brisket', emoji: '🥓', tier: 2, flavor: 'salty', attack: 3, hp: 7, values: [1, 2, 3],
    text: 'End of day: the friend ahead gains +{v} attack.',
    cooked: { text: 'End of day: adjacent friends gain +1 attack.', abilities: [{ trigger: 'endTurn', effect: 'buff', target: 'adjacentFriends', hp: 0, values: [1, 1, 1] }] },
    abilities: [{ trigger: 'endTurn', effect: 'buff', target: 'friendAhead', hp: 0 }] },
  { id: 'croutons', name: 'Croutons', cookedName: 'Garlic Croutons', emoji: '🍞', tier: 2, flavor: 'salty', attack: 3, hp: 7, values: [1, 2, 3],
    text: 'Every 2 turns: friends with Crust gain +{v} attack.',
    cooked: { text: 'Every 2 turns: friends with Crust gain 2 more Crust.', abilities: [{ trigger: 'round', every: 2, effect: 'crust', target: 'crustedFriends', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'round', every: 2, effect: 'buff', target: 'crustedFriends', hp: 0, max: 3 }] },
  // Tier 3 (4 gold)
  { id: 'cherry', name: 'Cherries', cookedName: 'Cherry Pie', emoji: '🍒', tier: 3, flavor: 'sweet', attack: 4, hp: 8, values: [2, 3, 4],
    text: 'Friend eaten: lobs a pit at a random back-row enemy for {v}.',
    cooked: { text: 'Friend eaten: lobs a second pit for 2.', abilities: [{ trigger: 'anyFriendEaten', effect: 'damage', target: 'randomBackEnemy', thrown: true, values: [2, 2, 2] }] },
    abilities: [{ trigger: 'anyFriendEaten', effect: 'damage', target: 'randomBackEnemy', thrown: true }] },
  { id: 'gravy', name: 'Gravy', cookedName: 'Giblet Gravy', emoji: '🥣', tier: 3, flavor: 'savory', attack: 5, hp: 12, values: [3, 4, 5],
    text: 'Friend summoned: it gains +{v} attack.',
    cooked: { text: 'Friend summoned: it attacks twice on its first attack.', abilities: [{ trigger: 'friendSummoned', effect: 'extraAttacks', target: 'summoned', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'friendSummoned', effect: 'buff', target: 'summoned', hp: 0 }] },
  { id: 'cheese', name: 'Cheese', cookedName: 'Fondue', emoji: '🧀', tier: 3, flavor: 'savory', attack: 2, hp: 4, values: [1, 2, 3],
    text: 'Ages: end of day, +{v} HP, +1 more next to a Savory friend.',
    cooked: { text: 'Start of battle: adjacent friends gain +2/+2.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'adjacentFriends', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'endTurn', effect: 'buff', attack: 0, moreNextTo: 'savory' }] },
  { id: 'wasabi', name: 'Wasabi', cookedName: 'Wasabi Peas', emoji: '🌿', tier: 3, flavor: 'spicy', attack: 5, hp: 9, values: [3, 5, 7],
    text: 'First attack deals +{v} damage.',
    cooked: { text: 'Start of battle: deal 6 damage to the enemy across.', abilities: [{ trigger: 'startOfBattle', effect: 'damage', target: 'enemyInLane', values: [6, 6, 6] }] },
    abilities: [{ trigger: 'firstAttack', effect: 'bonusDamage' }] },
  { id: 'honey', name: 'Honey', cookedName: 'Honeycomb', emoji: '🍯', tier: 3, flavor: 'sweet', attack: 4, hp: 9, values: [1, 2, 3],
    text: 'Start of battle: adjacent friends gain +{v}/+{v}, double if Spicy.',
    cooked: { text: 'Every 2 turns: adjacent friends gain +1/+1.', abilities: [{ trigger: 'round', every: 2, effect: 'buff', target: 'adjacentFriends', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'adjacentFriends', forFlavor: { flavor: 'spicy', mult: 2 } }] },
  { id: 'pickle', name: 'Pickle', cookedName: 'Fried Pickle', emoji: '🥒', tier: 3, flavor: 'sour', attack: 3, hp: 6, values: [2, 3, 4],
    text: 'Brines: in the fridge, +{v}/+{v} a day.',
    cooked: { text: 'Hit: the attacker loses 1 attack.', abilities: [{ trigger: 'hit', effect: 'debuff', target: 'attacker', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'fridgeTurn', effect: 'buff' }] },
  { id: 'anchovy', name: 'Anchovy', cookedName: 'Caesar Salad', emoji: '🐟', tier: 3, flavor: 'salty', attack: 4, hp: 7, values: [2, 3, 4],
    text: 'Every 2 turns: it and the friend in its lane gain {v} Crust.',
    cooked: { text: 'Start of battle: front-row friends gain 3 Crust.', abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'frontRowFriends', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'round', every: 2, effect: 'crust', target: 'laneFriends' }] },
  { id: 'fortuneCookie', name: 'Fortune Cookie', cookedName: 'Lucky Cookie Jar', emoji: '🥠', tier: 3, flavor: 'sweet', attack: 3, hp: 5, values: [1, 2, 3],
    text: 'Start of day: +{v} HP per gold of interest earned.',
    cooked: { text: 'End of day: +2 gold tomorrow.', abilities: [{ trigger: 'endTurn', effect: 'gold', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'startTurn', effect: 'buff', attack: 0, perInterest: true }] },
  { id: 'kebab', name: 'Kebab', cookedName: 'Shish Platter', emoji: '🍢', tier: 3, flavor: 'savory', attack: 6, hp: 9, values: [50, 75, 100],
    attackPattern: 'pierce',
    text: 'Pierce attack: also hits the enemy behind its target for {v}% damage.',
    cooked: { text: 'Start of battle: attacks twice on its first 2 attacks.', abilities: [{ trigger: 'startOfBattle', effect: 'extraAttacks', values: [2, 2, 2] }] },
    abilities: [] },
  { id: 'nachos', name: 'Nachos', cookedName: 'Supreme Nachos', emoji: '🧀', tier: 3, flavor: 'salty', attack: 5, hp: 11, values: [1, 2, 3],
    attackPattern: 'splash', art: 'nachos',
    text: 'Splash attack: also hits the enemies beside its target for {v}.',
    cooked: { text: 'Every 2 turns: deal 3 damage to the enemy front row.', abilities: [{ trigger: 'round', every: 2, effect: 'damage', target: 'enemyFrontRow', values: [3, 3, 3] }] },
    abilities: [] },

  { id: 'yogurt', name: 'Yogurt', cookedName: 'Frozen Yogurt', emoji: '🥛', tier: 3, flavor: 'sour', attack: 3, hp: 5, values: [2, 3, 4],
    text: 'Cultures: start of day, +{v} HP, +1 more next to a Sour friend.',
    cooked: { text: 'Cultures spread: start of day, adjacent Sour friends gain +2 HP.', abilities: [{ trigger: 'startTurn', effect: 'buff', target: 'adjacentFriends', onlyFlavor: 'sour', attack: 0, values: [2, 2, 2] }] },
    abilities: [{ trigger: 'startTurn', effect: 'buff', attack: 0, moreNextTo: 'sour' }] },
  { id: 'chiliOil', name: 'Chili Oil', cookedName: 'Chili Crisp', emoji: '🫙', tier: 3, flavor: 'spicy', attack: 2, hp: 6, values: [1, 2, 3],
    text: 'Infuses: start of day, +{v} attack, +1 more next to a Spicy friend.',
    cooked: { text: 'Start of battle: Spicy friends gain +3 attack.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'allFriends', onlyFlavor: 'spicy', hp: 0, values: [3, 3, 3] }] },
    abilities: [{ trigger: 'startTurn', effect: 'buff', hp: 0, moreNextTo: 'spicy' }] },
  { id: 'mapleSyrup', name: 'Maple Syrup', cookedName: 'Maple Taffy', emoji: '🍁', tier: 3, flavor: 'sweet', attack: 3, hp: 6, values: [2, 3, 4],
    text: 'End of day: 2 random friends gain +{v} HP.',
    cooked: { text: 'End of day: one more random friend gains +4 HP.', abilities: [{ trigger: 'endTurn', effect: 'buff', target: 'randomFriends', count: 1, attack: 0, values: [4, 4, 4] }] },
    abilities: [{ trigger: 'endTurn', effect: 'buff', target: 'randomFriends', count: 2, attack: 0 }] },
  { id: 'peppercorn', name: 'Peppercorns', cookedName: 'Pepper Steak Rub', emoji: '🌶️', tier: 3, flavor: 'spicy', attack: 2, hp: 6, values: [3, 4, 5],
    attackPattern: 'spray',
    text: 'Start of battle, {v} peppercorns hit random enemies for half its attack.',
    cooked: { text: 'Start of battle: every enemy Burns 2.', abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'allEnemies', values: [2, 2, 2] }] },
    abilities: [] },
  { id: 'porkCrackling', name: 'Pork Crackling', cookedName: 'Chicharrón', emoji: '🥓', tier: 3, flavor: 'salty', attack: 4, hp: 11, values: [2, 3, 4],
    text: 'When Crust blocks a hit on it or a neighbour, the attacker takes {v} damage.',
    cooked: { text: 'Start of battle: adjacent friends gain 3 Crust.', abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'adjacentFriends', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'crustBlock', effect: 'damage', target: 'attacker', max: 6 }] },
  { id: 'pepperoni', name: 'Pepperoni', cookedName: 'Pepperoni Roll', emoji: '🍕', tier: 3, flavor: 'spicy', attack: 5, hp: 9, values: [3, 4, 5],
    text: 'Friend eaten: the enemy across Burns {v}.',
    cooked: { text: 'Enemy Burn ticks twice a turn (halving after each tick).', abilities: [], burnTwice: true },
    abilities: [{ trigger: 'anyFriendEaten', effect: 'burn', target: 'enemyInLane' }] },

  // Tier 4 (4 gold)
  { id: 'cremeBrulee', name: 'Crème Brûlée', cookedName: 'Torched Brûlée', emoji: '🍮', tier: 4, flavor: 'sweet', attack: 3, hp: 7, values: [1, 2, 3],
    text: 'Crust broken on your plate: that food gains +{v} attack.',
    cooked: { text: 'Start of battle: your front row gains 3 Crust.', abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'frontRowFriends', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'plateCrustBreak', effect: 'buff', target: 'thatFriend', hp: 0, max: 4 }] },
  { id: 'pomegranate', name: 'Pomegranate', cookedName: 'Grenadine', emoji: '🍎', tier: 4, flavor: 'sour', attack: 4, hp: 8, values: [2, 3, 4],
    attackPattern: 'scatter',
    text: 'Every turn, from any row, instead of attacking: its seeds burst at {v} random enemies for half its attack.',
    cooked: { text: 'Start of battle: a random back-row enemy Rots 3.', abilities: [{ trigger: 'startOfBattle', effect: 'rot', target: 'randomBackEnemy', values: [3, 3, 3] }] },
    abilities: [] },
  { id: 'mushroom', name: 'Mushroom', cookedName: 'Risotto', emoji: '🍄', tier: 4, flavor: 'savory', attack: 4, hp: 11, values: [2, 3, 4],
    text: 'Every 2 turns: summon a {v}/{v} Spore.',
    cooked: { text: 'Eaten: summon two 4/4 Spores.', abilities: [{ trigger: 'faint', effect: 'summon', count: 2, summon: { id: 'spore' }, values: [4, 4, 4] }] },
    abilities: [{ trigger: 'round', every: 2, effect: 'summon', summon: { id: 'spore' } }] },
  { id: 'coffee', name: 'Coffee Bean', cookedName: 'Espresso', emoji: '☕', tier: 4, flavor: 'spicy', attack: 5, hp: 8, values: [1, 2, 3],
    text: 'Start of battle: the friend ahead (or itself) attacks twice on its first {v} attacks.',
    cooked: { text: 'Start of battle: your front row attacks twice on its first attack.', abilities: [{ trigger: 'startOfBattle', effect: 'extraAttacks', target: 'frontRowFriends', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'extraAttacks', target: 'friendAheadOrSelf' }] },
  { id: 'watermelon', name: 'Watermelon', cookedName: 'Fruit Salad', emoji: '🍉', tier: 4, flavor: 'sweet', attack: 4, hp: 16, values: [2, 3, 4],
    text: 'Eaten, and every 2nd time hit: summon a {v}/{v} Slice.',
    cooked: { text: 'Eaten: summon two more 4/4 Slices.', abilities: [{ trigger: 'faint', effect: 'summon', count: 2, summon: { id: 'slice' }, values: [4, 4, 4] }] },
    abilities: [{ trigger: 'faint', effect: 'summon', summon: { id: 'slice' } }, { trigger: 'hit', every: 2, effect: 'summon', summon: { id: 'slice' } }] },
  { id: 'grapefruit', name: 'Grapefruit', cookedName: 'Sorbet', emoji: '🍊', tier: 4, flavor: 'sour', attack: 5, hp: 11, values: [1, 2, 3],
    text: 'Every turn: Rotting enemies lose {v} attack.',
    cooked: { text: 'Start of battle: every enemy Rots 1.', abilities: [{ trigger: 'startOfBattle', effect: 'rot', target: 'allEnemies', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'round', effect: 'debuff', target: 'rottingEnemies' }] },
  { id: 'bacon', name: 'Bacon', cookedName: 'BLT', emoji: '🥓', tier: 4, flavor: 'salty', attack: 6, hp: 8, values: [2, 3, 4],
    text: 'Hit: deal {v} damage to the attacker.',
    cooked: { text: 'Start of battle: adjacent friends gain 3 Crust.', abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'adjacentFriends', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'hit', effect: 'damage', target: 'attacker' }] },
  { id: 'soySauce', name: 'Soy Sauce', cookedName: 'Aged Shoyu', emoji: '🫗', tier: 4, flavor: 'salty', attack: 4, hp: 11, values: [1, 2, 3],
    text: 'Refill: a random friend gains +{v}/+{v}.',
    cooked: { text: 'Refill: another random friend gains +1/+1 too.', abilities: [{ trigger: 'reroll', effect: 'buff', target: 'randomFriends', count: 1, values: [1, 1, 1] }] },
    abilities: [{ trigger: 'reroll', effect: 'buff', target: 'randomFriends', count: 1 }] },
  { id: 'blueCheese', name: 'Blue Cheese', cookedName: 'Roquefort', emoji: '🧀', tier: 4, flavor: 'sour', flavor2: 'savory', attack: 5, hp: 9, values: [1, 2, 3],
    art: 'blueCheese',
    text: 'Hit: the attacker Rots {v}.',
    cooked: { text: 'Start of battle: all enemies Rot 2.', abilities: [{ trigger: 'startOfBattle', effect: 'rot', target: 'allEnemies', values: [2, 2, 2] }] },
    abilities: [{ trigger: 'hit', effect: 'rot', target: 'attacker', max: 3 }] },
  { id: 'sweetSour', name: 'Sweet & Sour Pork', cookedName: 'Gu Lao Rou', emoji: '🍖', tier: 4, flavor: 'sweet', flavor2: 'sour', attack: 4, hp: 11, values: [1, 2, 3],
    text: 'Attacks: the target Rots 1, then takes +{v} damage per Rot it has.',
    cooked: { text: 'Every 2 turns: the enemy front row Rots 2.', abilities: [{ trigger: 'round', every: 2, effect: 'rot', target: 'enemyFrontRow', values: [2, 2, 2] }] },
    hitsHarder: 'rot', perStack: true, attackRots: 1,
    abilities: [] },

  { id: 'peanutButter', name: 'Peanut Butter', cookedName: 'PB&J', emoji: '🥜', tier: 4, flavor: 'salty', attack: 4, hp: 9, values: [2, 3, 4],
    text: 'End of day: adjacent friends gain +{v} HP.',
    cooked: { text: 'Start of battle: adjacent friends gain 4 Crust.', abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'adjacentFriends', values: [4, 4, 4] }] },
    abilities: [{ trigger: 'endTurn', effect: 'buff', target: 'adjacentFriends', attack: 0 }] },
  { id: 'baguette', name: 'Baguette', cookedName: 'Garlic Baguette', emoji: '🥖', tier: 4, flavor: 'salty', attack: 6, hp: 11, values: [2, 3, 4],
    text: 'Crust broken: gain +{v} attack.',
    cooked: { text: 'Crust broken: adjacent friends gain +2 attack.', abilities: [{ trigger: 'crustBreak', effect: 'buff', target: 'adjacentFriends', hp: 0, values: [2, 2, 2] }] },
    abilities: [{ trigger: 'crustBreak', effect: 'buff', hp: 0 }] },
  { id: 'mandarin', name: 'Mandarin', cookedName: 'Candied Mandarin', emoji: '🍊', tier: 4, flavor: 'sweet', attack: 4, hp: 9, values: [1, 2, 3],
    text: 'Interest cap +{v}.',
    interestCap: [1, 2, 3],
    cooked: { text: 'End of day: +2 gold tomorrow.', abilities: [{ trigger: 'endTurn', effect: 'gold', values: [2, 2, 2] }] },
    abilities: [] },
  // Rich foods: one flavor, counted several times over.
  { id: 'curry', name: 'Curry', cookedName: 'Katsu Curry', emoji: '🍛', tier: 4, flavor: 'spicy', attack: 5, hp: 9, values: [2, 3, 4], rich: true,
    text: 'Rich: counts as {v} Spicy foods for flavors.',
    cooked: { text: 'Start of battle: the enemy across Burns 3.', abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'enemyInLane', values: [3, 3, 3] }] },
    abilities: [] },
  { id: 'fudge', name: 'Fudge', cookedName: 'Rocky Road', emoji: '🍫', tier: 4, flavor: 'sweet', attack: 4, hp: 11, values: [2, 3, 4], rich: true,
    text: 'Rich: counts as {v} Sweet foods for flavors.',
    cooked: { text: 'Start of battle: adjacent friends gain +3 HP.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'adjacentFriends', attack: 0, values: [3, 3, 3] }] },
    abilities: [] },
  { id: 'lime', name: 'Lime', cookedName: 'Key Lime Pie', emoji: '🍋', tier: 4, flavor: 'sour', attack: 5, hp: 9, values: [2, 3, 4], rich: true,
    text: 'Rich: counts as {v} Sour foods for flavors.',
    cooked: { text: 'Start of battle: the enemy across Rots 2.', abilities: [{ trigger: 'startOfBattle', effect: 'rot', target: 'enemyInLane', values: [2, 2, 2] }] },
    abilities: [] },
  { id: 'onigiri', name: 'Rice Ball', cookedName: 'Yaki Onigiri', emoji: '🍙', tier: 4, flavor: 'salty', attack: 4, hp: 11, values: [2, 3, 4], rich: true,
    text: 'Rich: counts as {v} Salty foods for flavors.',
    cooked: { text: 'Start of battle: adjacent friends gain 3 Crust.', abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'adjacentFriends', values: [3, 3, 3] }] },
    abilities: [] },
  { id: 'miso', name: 'Miso', cookedName: 'Miso Soup', emoji: '🥣', tier: 4, flavor: 'savory', attack: 4, hp: 11, values: [2, 3, 4], rich: true,
    text: 'Rich: counts as {v} Savory foods for flavors.',
    cooked: { text: 'Start of battle: adjacent friends gain +1/+2.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'adjacentFriends', hp: 2, values: [1, 1, 1] }] },
    abilities: [] },
  // Tier 5 (5 gold)
  { id: 'steak', name: 'Steak', cookedName: 'Steak Frites', emoji: '🥩', tier: 5, flavor: 'savory', attack: 7, hp: 13, values: [2, 3, 4],
    text: 'Friend summoned: give it +{v}/+{v}.',
    cooked: { text: 'Friend summoned: it gains 5 Crust.', abilities: [{ trigger: 'friendSummoned', effect: 'crust', target: 'summoned', values: [5, 5, 5] }] },
    abilities: [{ trigger: 'friendSummoned', effect: 'buff', target: 'summoned' }] },
  { id: 'ghostPepper', name: 'Ghost Pepper', cookedName: 'Ghost Pepper Wings', emoji: '👻', tier: 5, flavor: 'spicy', attack: 6, hp: 12, values: [2, 3, 4],
    fansBurn: true,
    text: 'Attacks: the target Burns {v}, then its Burn doubles.',
    cooked: { text: 'Start of battle: all enemies Burn 3.', abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'allEnemies', values: [3, 3, 3] }] },
    abilities: [] },
  { id: 'pineapple', name: 'Pineapple', cookedName: 'Pina Colada', emoji: '🍍', tier: 5, flavor: 'sweet', attack: 6, hp: 10, values: [1, 2, 3],
    text: 'Hit: your friends gain +{v}/+{v}.',
    cooked: { text: 'Every turn: your friends gain +1/+1.', abilities: [{ trigger: 'round', effect: 'buff', target: 'allFriends', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'hit', effect: 'buff', target: 'allFriends', max: 3 }] },
  { id: 'durian', name: 'Durian', cookedName: 'Durian Crepe', emoji: '🦔', tier: 5, flavor: 'sour', attack: 5, hp: 10, values: [1, 2, 3],
    text: 'Hit: the enemy front row Rots {v}.',
    cooked: { text: 'Start of battle: all enemies Rot 1.', abilities: [{ trigger: 'startOfBattle', effect: 'rot', target: 'allEnemies', values: [1, 1, 1] }] },
    abilities: [{ trigger: 'hit', effect: 'rot', target: 'enemyFrontRow', max: 3 }] },
  { id: 'caviar', name: 'Caviar', cookedName: 'Blini Platter', emoji: '🫙', tier: 5, flavor: 'salty', attack: 5, hp: 10, values: [1, 2, 3],
    text: 'Interest cap +1. Start of day: a random friend per gold of interest earned gains +{v}/+{v}.',
    interestCap: [1, 1, 1],
    cooked: { text: 'End of day: +3 gold tomorrow.', abilities: [{ trigger: 'endTurn', effect: 'gold', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'startTurn', effect: 'buff', target: 'randomFriends', countPerInterest: true }] },
  { id: 'spaghetti', name: 'Spaghetti', cookedName: 'Spaghetti Bolognese', emoji: '🍝', tier: 5, flavor: 'savory', attack: 5, hp: 12, values: [50, 75, 100],
    attackPattern: 'escalate',
    text: 'Escalating attack: its 1st attack hits one enemy, its 2nd the front row, then every enemy. Extra targets take {v}%.',
    cooked: { text: 'Start of battle: attacks twice on its first 3 attacks.', abilities: [{ trigger: 'startOfBattle', effect: 'extraAttacks', values: [3, 3, 3] }] },
    abilities: [] },

  { id: 'takoyaki', name: 'Takoyaki', cookedName: 'Takoyaki Boat', emoji: '🐙', tier: 5, flavor: 'savory', attack: 5, hp: 12, values: [1, 2, 3],
    attackPattern: 'volley',
    text: 'Every turn, from any row, instead of attacking: throws {v} balls at random enemies for its attack.',
    cooked: { text: 'Throws one more ball each turn, for half its attack.', abilities: [], halfThrow: true },
    abilities: [] },
  // Tier 6 (5 gold)
  { id: 'pizza', name: 'Pizza', cookedName: 'Deep Dish', emoji: '🍕', tier: 6, flavor: 'savory', attack: 5, hp: 11, values: [1, 2, 3],
    text: 'Start of battle: your friends gain +{v}/{v} per flavor on your plate.',
    cooked: { text: 'Start of battle: your friends gain +1 attack per flavor on your plate.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'allFriends', perDistinctFlavor: true, hp: 0, values: [1, 1, 1] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'allFriends', perDistinctFlavor: true}] },
  { id: 'hotPot', name: 'Hot Pot', cookedName: 'Mala Hot Pot', emoji: '🍲', tier: 6, flavor: 'spicy', attack: 5, hp: 10, values: [1, 2, 3],
    text: 'Simmers: every turn, all enemies Burn {v}.',
    cooked: { text: 'Start of battle: all enemies Burn 4.', abilities: [{ trigger: 'startOfBattle', effect: 'burn', target: 'allEnemies', values: [4, 4, 4] }] },
    abilities: [{ trigger: 'round', effect: 'burn', target: 'allEnemies' }] },
  { id: 'cake', name: 'Birthday Cake', cookedName: 'Wedding Cake', emoji: '🎂', tier: 6, flavor: 'sweet', attack: 5, hp: 12, values: [1, 2, 3],
    aura: 'soothe',
    text: 'Every HP gain on your plate is +{v}.',
    cooked: { text: 'Start of battle: your friends gain +2/+4.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'allFriends', attack: 2, hp: 4, values: [1, 1, 1] }] },
    abilities: [] },
  { id: 'kimchi', name: 'Kimchi', cookedName: 'Kimchi Jjigae', emoji: '🥬', tier: 6, flavor: 'sour', flavor2: 'spicy', attack: 4, hp: 8, values: [1, 2, 3],
    art: 'kimchi',
    text: 'Start of battle: the enemy front row Rots {v} and Burns {v}.',
    cooked: { text: 'Every turn: all enemies Rot 1 and Burn 1.', abilities: [{ trigger: 'round', effect: 'rot', target: 'allEnemies', values: [1, 1, 1] }, { trigger: 'round', effect: 'burn', target: 'allEnemies', values: [1, 1, 1] }] },
    abilities: [
      { trigger: 'startOfBattle', effect: 'rot', target: 'enemyFrontRow' },
      { trigger: 'startOfBattle', effect: 'burn', target: 'enemyFrontRow' },
    ] },
  { id: 'ramen', name: 'Ramen', cookedName: 'Tonkotsu Ramen', emoji: '🍜', tier: 6, flavor: 'salty', attack: 7, hp: 18, values: [2, 3, 4],
    text: 'Start of battle: front-row friends gain {v} Crust, double if Savory.',
    cooked: { text: 'Start of battle: your friends gain 6 Crust. Every 2 turns: 3 more.', abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'allFriends', values: [6, 6, 6] }, { trigger: 'round', every: 2, effect: 'crust', target: 'allFriends', values: [3, 3, 3] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'frontRowFriends', forFlavor: { flavor: 'savory', mult: 2 } }] },
  { id: 'bento', name: 'Bento Box', cookedName: 'Jubako', emoji: '🍱', tier: 6, flavor: 'savory', flavor2: 'salty', attack: 6, hp: 16, values: [1, 2, 3],
    aura: 'echo',
    text: "The friend ahead's abilities trigger +{v} times, in battle and the kitchen.",
    cooked: { text: 'It echoes every friend next to it, not only the one ahead.', abilities: [], echoAll: true },
    abilities: [] },
  { id: 'smoothie', name: 'Smoothie', cookedName: 'Smoothie Bowl', emoji: '🥤', tier: 6, flavor: 'sweet', flavor2: 'sour', attack: 6, hp: 12, values: [1, 2, 3],
    text: 'Every 2 turns: your friends gain +{v}/+{v}.',
    cooked: { text: 'Start of battle: your friends gain +2 attack.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'allFriends', hp: 0, values: [2, 2, 2] }] },
    abilities: [{ trigger: 'round', every: 2, effect: 'buff', target: 'allFriends' }] },
  { id: 'roastTurkey', name: 'Roast Turkey', cookedName: 'Holiday Feast', emoji: '🦃', tier: 6, flavor: 'savory', attack: 4, hp: 8, values: [1, 2, 3],
    text: 'End of day: 3 random friends gain +{v}/+{v}.',
    cooked: { text: 'End of day: all your foods gain +1/+2.', abilities: [{ trigger: 'endTurn', effect: 'buff', target: 'allFriends', hp: 2, values: [1, 1, 1] }] },
    abilities: [{ trigger: 'endTurn', effect: 'buff', target: 'randomFriends', count: 3 }] },

  // Mythic: never in the market; delivered by the special cubby late in a run (7 gold)
  // Each mythic bends one rule, and where it sits decides who it reaches (see Aura in types.ts). Cooked, the rule
  // reaches further. No numbers to track beyond Black Garlic's opening Rot.
  { id: 'goldenTruffle', name: 'Golden Truffle', cookedName: 'Truffle Feast', emoji: '🍄', tier: 6, flavor: 'savory', attack: 6, hp: 16, values: [0, 0, 0],
    rarity: 'mythic', aura: 'cook',
    text: 'In battle, the friend in its lane is cooked.',
    cooked: { text: 'Every friend is cooked in battle.', abilities: [] },
    abilities: [] },
  { id: 'saffron', name: 'Saffron', cookedName: 'Saffron Paella', emoji: '🌼', tier: 6, flavor: 'spicy', attack: 4, hp: 10, values: [0, 0, 0],
    rarity: 'mythic', allFlavors: true, aura: 'infuse',
    text: 'Counts as every flavor. Adjacent friends count twice.',
    cooked: { text: 'Every friend counts twice toward flavor bonuses.', abilities: [] },
    abilities: [] },
  { id: 'wagyu', name: 'Wagyu', cookedName: 'Wagyu Sukiyaki', emoji: '🥩', tier: 6, flavor: 'salty', flavor2: 'sweet', attack: 4, hp: 12, values: [2, 3, 4],
    rarity: 'mythic', art: 'wagyu', aura: 'baste',
    text: 'Your friends get double Crust and HP. Start of battle: they gain {v} Crust.',
    cooked: { text: 'Start of battle: your friends gain +3 HP.', abilities: [{ trigger: 'startOfBattle', effect: 'buff', target: 'allFriends', attack: 0, values: [3, 3, 3] }] },
    abilities: [{ trigger: 'startOfBattle', effect: 'crust', target: 'allFriends' }] },
  { id: 'blackGarlic', name: 'Black Garlic', cookedName: 'Black Garlic Ramen', emoji: '🧄', tier: 6, flavor: 'sour', flavor2: 'spicy', attack: 6, hp: 15, values: [1, 2, 3],
    rarity: 'mythic', aura: 'ferment',
    text: 'Enemies in its lane and the lanes beside it take double Burn and Rot. Start of battle: the front enemy in each of those lanes Rots {v}.',
    cooked: { text: 'Every enemy takes triple damage from Burn and Rot.', abilities: [] },
    abilities: [{ trigger: 'startOfBattle', effect: 'rot', target: 'enemyLaneAndAdjacent' }] },

  { id: 'sweetPotato', name: 'Sweet Potato', cookedName: 'Candied Yams', emoji: '🍠', tier: 6, flavor: 'sweet', flavor2: 'savory', attack: 6, hp: 16, values: [1, 2, 2],
    rarity: 'mythic', aura: 'cellar',
    text: 'Root cellar: up to {v} of your fridge foods keep their kitchen abilities going, as if on your plate.',
    cooked: { text: 'Foods in your fridge also grow +1/+1 every day.', abilities: [] },
    abilities: [] },
  { id: 'chickenTenderTower', name: 'Chicken Tender Tower', cookedName: 'Tender Skyscraper', emoji: '🍗', tier: 6, flavor: 'savory', flavor2: 'salty', attack: 7, hp: 18, values: [50, 75, 100],
    rarity: 'mythic', aura: 'tower',
    text: 'The friend in its lane comes back once when eaten, with {v}% of its HP.',
    cooked: { text: 'Every friend comes back once when eaten.', abilities: [] },
    abilities: [] },

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
  { id: 'hotSauce', name: 'Hot Sauce', emoji: '🔥', tier: 1, cost: 2, held: true, text: 'Held: end of day, +1 attack permanently.' },
  { id: 'butter', name: 'Butter', emoji: '🧈', tier: 1, cost: 2, held: false, text: '+1/+2 permanently.' },
  { id: 'sprinkles', name: 'Sprinkles', emoji: '🌈', tier: 1, cost: 2, held: false, anywhere: true, text: '2 random foods on your plate +1/+1 permanently.' },
  { id: 'oliveOil', name: 'Olive Oil', emoji: '🫒', tier: 1, cost: 2, held: false, text: '+1 HP and +2 sell value, permanently.' },
  { id: 'flavorPacket', name: 'Flavor Packet', emoji: '🧂', tier: 2, cost: 2, held: false, text: 'The food gains a random flavor it doesn\'t have (up to 3 flavors).' },
  { id: 'boneBroth', name: 'Bone Broth', emoji: '🍵', tier: 2, cost: 2, held: false, text: '+4 HP permanently.' },
  { id: 'saltShaker', name: 'Salt Shaker', emoji: '🧂', tier: 2, cost: 3, held: true, text: 'Held: gain 5 Crust at Start of battle.' },
  { id: 'toothpick', name: 'Toothpick', emoji: '🥢', tier: 2, cost: 3, held: true, text: "Held: this food's attacks deal +1 damage and ignore Crust." },
  { id: 'bouillon', name: 'Bouillon Cube', emoji: '🟫', tier: 3, cost: 3, held: true, text: 'Held: this food counts as one more food of its flavors.' },
  { id: 'partyMix', name: 'Party Mix', emoji: '🥜', tier: 3, cost: 3, held: false, anywhere: true, text: '4 random foods on your plate +1/+1 permanently.' },
  { id: 'seasoning', name: 'Seasoning Blend', emoji: '🫚', tier: 3, cost: 3, held: false, text: 'The food gains a flavor you pick (up to 3 flavors).' },
  { id: 'tupperware', name: 'Tupperware', emoji: '🥡', tier: 3, cost: 3, held: true, text: 'Held: the first hit on this food each battle is fully blocked.' },
  { id: 'takeout', name: 'Takeout Bag', emoji: '🛍️', tier: 3, cost: 3, held: false, anywhere: true, text: 'A random food one rarity above the buffet arrives on the counter tray.' },
  { id: 'microwave', name: 'Microwave', emoji: '♨️', tier: 4, cost: 4, held: false, text: '+1 merge progress (counts as one extra copy).' },
  { id: 'chopsticks', name: 'Chopsticks', emoji: '🥢', tier: 4, cost: 5, held: true, text: 'Held: attacks twice on its first 2 attacks each battle.' },
  { id: 'lunchbox', name: 'Lunchbox', emoji: '🍱', tier: 5, cost: 5, held: false, anywhere: true, text: 'All friends +1/+1 permanently.' },
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

/** Whether a Bento Box can echo this food: it needs an ability (a food that only attacks, with a pattern or throws, has none). */
export function echoable(def: UnitDef, level: Level): boolean {
  return abilitiesOf(def, level).length > 0;
}

/** A food's abilities at a level: its own, plus its cooked bonus at level 3 (always after its own, so indexes hold). */
export function abilitiesOf(def: UnitDef, level: Level): AbilityDef[] {
  return level === 3 && def.cooked ? [...def.abilities, ...def.cooked.abilities] : def.abilities;
}

/**
 * Team-building pairs: foods that make something, and foods that feed on it. Each food's cookbook page names its
 * partners, so a plate gets built rather than bought. Keep this in step with the abilities.
 */
export const PAIRS: { what: string; makes: string[]; uses: string[] }[] = [
  { what: 'interest', makes: ['mandarin'], uses: ['fortuneCookie', 'caviar'] },
  { what: 'free refills', makes: ['dumplings'], uses: ['soySauce'] },
  { what: 'selling', makes: ['coinChocolate', 'sugar'], uses: ['sourdough'] },
  { what: 'summons', makes: ['egg', 'popcorn', 'mushroom', 'watermelon'], uses: ['steak', 'gravy'] },
  { what: 'HP gains', makes: ['apple', 'mochi', 'peanutButter', 'honey', 'breadDough'], uses: ['hotCocoa', 'cake'] },
  { what: 'Crust', makes: ['pretzel', 'anchovy', 'ramen'], uses: ['porkCrackling', 'croutons', 'baguette', 'cremeBrulee'] },
  { what: 'Burn', makes: ['chili', 'garlic', 'mustard', 'kimchi', 'pepperoni'], uses: ['ghostPepper'] },
  { what: 'Rot', makes: ['cabbage', 'blueCheese', 'durian', 'kimchi'], uses: ['sweetSour', 'grapefruit'] },
  { what: 'extra attacks', makes: ['coffee', 'kebab', 'spaghetti'], uses: ['spaghetti', 'kebab', 'nachos'] },
];

/** The foods that pair with this one (it makes what they use, or uses what they make). */
export function partnersOf(id: string): string[] {
  const out = new Set<string>();
  for (const p of PAIRS) {
    if (p.makes.includes(id)) p.uses.forEach((u) => out.add(u));
    if (p.uses.includes(id)) p.makes.forEach((m) => out.add(m));
  }
  out.delete(id);
  return [...out];
}

/** The number of growth days a food's ability text means by {d}: its first day-gated ability, at this level. */
export function daysOf(def: UnitDef, level: Level): number | undefined {
  return abilitiesOf(def, level).find((ab) => ab.days)?.days?.[level - 1];
}

/** Each buffet tier is its own rarity: the player only ever sees the rarity. */
export const RARITY_BY_TIER: Record<Tier, Rarity> = { 1: 'common', 2: 'uncommon', 3: 'rare', 4: 'epic', 5: 'legendary', 6: 'exotic' };

/** An item's rarity, from its tier like a food's. */
export function itemRarity(def: ItemDef): Rarity {
  return RARITY_BY_TIER[def.tier as Tier];
}

/** A food's rarity: its own `rarity`, else the default for its tier. */
export function rarityOf(def: UnitDef): Rarity {
  return def.rarity ?? RARITY_BY_TIER[def.tier];
}

/** Foods the market can offer: no summoned tokens and no mythics. */
export const MARKET_UNITS = UNITS.filter((u) => !u.token && rarityOf(u) !== 'mythic');
/** Mythic foods, only delivered by the special cubby. */
export const MYTHIC_UNITS = UNITS.filter((u) => !u.token && rarityOf(u) === 'mythic');

/** Gold a food costs: 3 for tiers 1-2, 4 for tiers 3-4, 5 for tiers 5-6, 10 for mythics. */
export function unitCost(def: UnitDef): number {
  if (rarityOf(def) === 'mythic') return 10;
  return def.tier <= 2 ? 3 : def.tier <= 4 ? 4 : 5;
}

/** Every flavor a food counts as: its (possibly seasoned) flavor, any second flavor, and flavors it gained. */
export function flavorsOf(u: { defId: string; flavorOverride?: Flavor; extraFlavors?: Flavor[] }): Flavor[] {
  const def = unitDef(u.defId);
  const main = u.flavorOverride ?? def.flavor;
  return [...new Set([main, ...(def.flavor2 ? [def.flavor2] : []), ...(u.extraFlavors ?? [])])];
}

/**
 * Foods of each flavor on a plate, for the flavor bonuses. Each DIFFERENT food counts once for every flavor it has
 * (all five for Saffron): a second Chili Pepper adds nothing, so a bonus asks for variety, not copies. A rich food
 * (Curry...) counts as its level number of foods, a Bouillon Cube adds one, and a food next to a
 * Saffron (every food, once Saffron is cooked) counts twice. The kitchen and the battle both count with this, from
 * where the foods were placed.
 */
export function flavorTally(plate: Plate): Map<Flavor, number> {
  const infusers = plate.flatMap((u, slot) => (u && unitDef(u.defId).aura === 'infuse' ? [{ slot, cooked: levelOf(u.copies) === 3 }] : []));
  // Best contribution of each food (by kind) to each flavor: copies don't stack, the best-placed one counts.
  const best = new Map<string, number>();
  plate.forEach((u, slot) => {
    if (!u || unitDef(u.defId).token) return;
    const def = unitDef(u.defId);
    const rich = def.rich ? def.values[levelOf(u.copies) - 1] : 1;
    const held = u.item === 'bouillon' ? 1 : 0;
    const weight = (rich + held) * (infusers.some((f) => f.slot !== slot && (f.cooked || isAdjacent(f.slot, slot))) ? 2 : 1);
    for (const fl of unitDef(u.defId).allFlavors ? FLAVORS : flavorsOf(u)) {
      const key = `${u.defId}|${fl}`;
      best.set(key, Math.max(best.get(key) ?? 0, weight));
    }
  });
  const counts = new Map<Flavor, number>();
  for (const [key, weight] of best) {
    const fl = key.slice(key.indexOf('|') + 1) as Flavor;
    counts.set(fl, (counts.get(fl) ?? 0) + weight);
  }
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
    if (t === 'adjacentFriends' || (t === 'aheadElseAdjacent' && !back) || ab.ifAdjacentFlavor || ab.moreNextTo) adjacent.forEach((o) => out.add(o));
    if (back && (t === 'friendAhead' || t === 'friendAheadOrSelf' || t === 'aheadElseAdjacent')) out.add(ahead);
    if (back && (ab.trigger === 'friendAheadHit' || ab.trigger === 'friendAheadAttacks')) out.add(ahead);
    if (!back && t === 'friendBehind') out.add(behind);
    if (t === 'laneFriends') out.add(back ? ahead : behind);
  }
  if (back && def.aura === 'echo') out.add(ahead);
  if (def.aura === 'echo' && level === 3 && def.cooked?.echoAll) adjacent.forEach((o) => out.add(o));
  if (def.aura === 'infuse') adjacent.forEach((o) => out.add(o));
  if (def.aura === 'cook' || def.aura === 'tower') out.add(back ? ahead : behind);
  return [...out];
}
