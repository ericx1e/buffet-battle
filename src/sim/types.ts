export type Flavor = 'spicy' | 'sweet' | 'sour' | 'salty' | 'savory';
export const FLAVORS: readonly Flavor[] = ['spicy', 'sweet', 'sour', 'salty', 'savory'];

export type Trigger =
  // battle
  | 'startOfBattle'
  | 'hit'
  | 'round'
  | 'roundStart' // every turn, before throws and attacks
  | 'faint'
  | 'friendSummoned'
  | 'firstAttack'
  | 'friendAheadHit' // the friend ahead of this food is hit (`attacker` = who hit it)
  | 'friendAheadAttacks' // the friend ahead of this food attacks (`attacker` = the food it attacked)
  | 'neighbourAttacks' // an adjacent friend attacks (`attacker` = the food it attacked)
  | 'neighbourHit' // an adjacent friend is hit by an enemy (`attacker` = who hit it)
  | 'friendFaint' // an adjacent friend is eaten
  | 'anyFriendEaten' // any friend is eaten
  | 'crustBreak' // a hit uses up the last of this food's Crust
  | 'plateCrustBreak' // a hit uses up the last of the Crust of any food on this plate (`friend` = whose)
  | 'friendHealed' // an adjacent friend is healed (`friend` = who)
  | 'crustBlock' // Crust blocks damage on this food or an adjacent friend (`attacker` = who hit)
  // kitchen
  | 'buy' // this food is bought (also when bought onto a copy)
  | 'sell' // this food is sold
  | 'friendSold' // you sell another food (foods on the plate)
  | 'levelUp' // this food reaches level 2 or 3
  | 'reroll' // you restock the market (fires for foods on the plate)
  | 'startTurn' // a new turn starts, after income and interest (foods on the plate)
  | 'endTurn' // you press Serve (foods on the plate)
  | 'fridgeTurn'; // you press Serve while this food is in the fridge

/** Statuses: Burn (Spicy) and Rot (Sour) deal damage at the end of each round; Chill skips attacks. Burn stacks to BURN_CAP, Rot to ROT_CAP. */
export type Status = 'burn' | 'rot' | 'chill';
export const STATUSES: readonly Status[] = ['burn', 'rot', 'chill'];

/**
 * How a front-row food's attack lands. single: the enemy in its lane. pierce: also half damage to the food behind
 * it. splash: also 1 damage to the front-most enemies in the neighbouring lanes. fork: hits both other lanes instead
 * of its own. snipe: hits the back row of its lane first. escalate: one target in rounds 1-2, the whole enemy front
 * row in rounds 3-4, every enemy from round 5 (secondary targets take half).
 * Projectiles (see PROJECTILES) are thrown from either row, before the front rows attack, and always hit for half
 * the thrower's attack. shot: the enemy in its lane. lob: the back row of its lane first. spray: 3 at random
 * enemies. volley: every enemy in the front row. Opening throws (see OPENING_THROWS) fly once, on the first turn;
 * after that the food attacks like any other. A volley flies every turn instead of attacking.
 */
export type AttackPattern = 'single' | 'pierce' | 'splash' | 'fork' | 'snipe' | 'escalate' | 'shot' | 'lob' | 'spray' | 'volley' | 'scatter';
export const ATTACK_PATTERNS: readonly AttackPattern[] = ['single', 'pierce', 'splash', 'fork', 'snipe', 'escalate', 'shot', 'lob', 'spray', 'volley', 'scatter'];
/** Patterns thrown from either row. */
export const PROJECTILES: readonly AttackPattern[] = ['shot', 'lob', 'spray', 'volley', 'scatter'];
/** Projectiles thrown once, on the first turn; the food then attacks normally. The rest are thrown every turn. */
export const OPENING_THROWS: readonly AttackPattern[] = ['shot', 'lob', 'spray'];

export type Tier = 1 | 2 | 3 | 4 | 5 | 6;
export type Level = 1 | 2 | 3;

// ---------- abilities: building blocks (see DESIGN.md, "Designing foods") ----------

/** Who an ability affects. "Lane" targets use the food's own lane; "attacker" only exists for hit triggers. */
export type Target =
  | 'self'
  | 'enemyInLane' // front-most enemy in this lane, else the nearest lane with food
  | 'enemyLaneAndAdjacent' // front-most enemy in this lane and in each neighbouring lane
  | 'enemyLane' // every enemy in this lane (front and back)
  | 'enemyFrontRow'
  | 'allEnemies'
  | 'randomBackEnemy' // random back-row enemy, front row if the back is empty
  | 'crustedFriends' // every friend that has Crust
  | 'highestAttackEnemy'
  | 'nearestEnemyLanes' // front-row enemies in the N lanes nearest this one (N = the ability's amount)
  | 'attacker' // hit trigger: the enemy that hit this food
  | 'adjacentFriends'
  | 'friendAhead'
  | 'friendBehind'
  | 'friendAheadOrSelf' // the friend ahead if this food is in the back row, else itself
  | 'aheadElseAdjacent' // back row: the friend ahead; front row: adjacent friends
  | 'laneFriends' // this food and the friend in its lane
  | 'frontRowFriends'
  | 'backRowFriends'
  | 'allFriends'
  | 'randomFriends' // `count` random friends (shop: on the plate)
  | 'lowestHpFriend'
  | 'summoned' // friendSummoned trigger: the food that was just summoned
  | 'level3Friends' // kitchen: a random friend at level 3 (`count` of them)
  | 'thatFriend' // friendHealed / plateCrustBreak: the friend that was healed, or whose Crust broke
  | 'statusEnemies' // enemies that have any status
  | 'rottingEnemies'; // enemies that Rot

export type Effect =
  | 'damage' // deal `amount` damage
  | 'buff' // +attack/+HP (scaled by the ability's `attack` and `hp`, default 1 each)
  | 'debuff' // -attack
  | 'halveAttack'
  | 'crust'
  | 'heal'
  | 'summon' // summon `count` of `summon.id` near this food
  | 'extraAttacks' // the target attacks twice on its next `amount` attacks
  | 'bonusDamage' // firstAttack trigger: the first attack deals +amount
  | 'season' // targets' ability numbers +amount this battle (Salt)
  | 'gold' // shop: +amount gold next turn
  | 'copyAbility' // this food gains the target's abilities for the battle, with their current numbers
  | 'bequeath' // the targets gain this food's attack and max HP (use with faint)
  | 'split' // fills every empty slot with `summon.id` tokens, each with a third of this food's attack and HP (use with faint)
  | 'burn' // +amount Burn
  | 'rot' // +amount Rot
  | 'chill' // +amount Chill
  | 'cleanse' // removes up to amount Burn and Rot
  | 'spreadBurn' // the enemy with the most Burn passes amount Burn to each enemy beside it (Habanero Salsa)
  | 'doubleCrust' // the targets' Crust doubles (Salt-Crusted Fish)
  | 'siphon' // the targets lose amount attack and your front row gains amount attack (Fondue)
  | 'sticky' // the next amount neighbours that would be eaten hold on at 1 HP instead (Rice)
  // kitchen
  | 'sellValue' // +amount sell value, for good
  | 'freeReroll' // your next amount restocks this turn are free
  | 'gainFlavor' // gains a random flavor it doesn't have yet (up to 3 flavors)
  | 'soakFlavor' // gains the flavor of a friend next to it that it doesn't have yet (Rice)
  | 'buyBonus'; // everything you buy for the rest of this turn gets +amount/+amount

export interface AbilityDef {
  trigger: Trigger;
  effect: Effect;
  target?: Target; // default 'self'
  /** Overrides the food's level 1/2/3 values for this ability. */
  values?: [number, number, number];
  /** Buff scaling: +attack x amount and +HP x amount (default 1 and 1; use 0 to skip one). */
  attack?: number;
  hp?: number;
  /** round / hit triggers: fire only every Nth round or Nth hit. Kitchen: only on days divisible by N. */
  every?: number;
  /** hit trigger: only the first time this food is hit. */
  once?: boolean;
  /** hit trigger (and other reactions): at most `amount` times per battle (Popcorn). */
  limitToAmount?: boolean;
  /** The effect's own number, when the level's number counts something else (with limitToAmount: how often). */
  fixed?: number;
  /** randomFriends: how many; summon: how many; kitchen adjacentFriends: at most this many, at random. */
  count?: number;
  /** summon: which token, and fixed stats (otherwise attack/HP = amount). */
  summon?: { id: string; attack?: number; hp?: number };
  /** +1 to the amount for each other friend of this flavor. */
  perFriend?: Flavor;
  /** Amount x the number of distinct flavors among your foods (Pizza). */
  perDistinctFlavor?: boolean;
  /** Only affects targets of this flavor. */
  onlyFlavor?: Flavor;
  /** Targets of this flavor get amount x mult + add. */
  forFlavor?: { flavor: Flavor; mult?: number; add?: number };
  /** Shop conditions: only if you didn't reroll this turn / only next to a friend of this flavor. */
  ifNoReroll?: boolean;
  ifAdjacentFlavor?: Flavor;
  /** Start of battle: resolve before every other Start of battle ability (e.g. copyAbility, so copies fire). */
  early?: boolean;
  /** Start of battle: goes off after every other Start of battle ability (to see the Crust they gave, say). */
  late?: boolean;
  /** Shown as a thrown projectile (a lob) rather than a spark. */
  thrown?: boolean;
  /** The amount goes up by 1 every time this ability fires this battle. */
  grows?: boolean;
  /** Kitchen: this ability gives at most this much in total over the run (per stat). Battle: it fires at most this many times a battle. */
  max?: number;
  /** Kitchen: fires at most this many times a day (Hot Cocoa), when that should differ from `max` in battle. */
  dayMax?: number;
  /** Kitchen: only if you own a level 3 food. */
  ifLevel3?: boolean;
  /** Kitchen startTurn: amount x the interest you earned this turn. */
  perInterest?: boolean;
  /** Kitchen, randomFriends: as many friends as the gold of interest you earned this turn. */
  countPerInterest?: boolean;
  /** Kitchen startTurn: only if you earned interest this turn. */
  ifInterest?: boolean;
  /** +1 to the amount for each level 3 friend (Golden Truffle). */
  perLevel3?: boolean;
  /** Kitchen: fires on at most this many days over the run, by level (Cheese ages for 4/6/10 days). */
  days?: [number, number, number];
  /** Kitchen: +1 to the amount next to a friend of this flavor. */
  moreNextTo?: Flavor;
  /** Amount x the number of friends of this flavor (Macarons). */
  timesFlavor?: Flavor;
  /** With timesFlavor: per two friends of that flavor instead of each. */
  perPair?: boolean;
  /** Amount x the number of flavors this food has (Rice). */
  perOwnFlavor?: boolean;
}

/**
 * Standing effects while a food with the aura is on the plate:
 * echo: the friend ahead's abilities trigger again, battle and kitchen (a food with no abilities, that only attacks, gets nothing); rally: an adjacent friend whose ability fires gains +1 attack
 * (at most 3 times a battle each); soothe: your heals are +1.
 * Mythics each bend one rule, reaching further once they are cooked (level 3):
 * cook (Golden Truffle): in battle, the friend in its lane is cooked (every friend, once cooked);
 * infuse (Saffron): adjacent friends count twice toward flavor bonuses (every friend, once cooked);
 * baste (Wagyu): adjacent friends get double from Crust and heals (every friend, once cooked);
 * cellar (Sweet Potato): the first 1/2 foods in the fridge keep their kitchen abilities going as if on the plate
 *   (those that need a place, like adjacent friends, do nothing there); cooked, fridge foods also grow +1/+1 a day;
 * tower (Chicken Tender Tower): the friend in its lane comes back once when eaten, with 50/75/100% of its starting HP (every friend, once cooked);
 * ferment (Black Garlic): enemies in its lane and the lanes beside it take double damage from Burn and Rot (every enemy, triple, once cooked).
 * Chill: brainFreeze (Popsicle): Chilled enemies' abilities don't go off; shatter (Sorbet): an enemy whose Chill wears
 * off takes damage (its level number); coldPack (Frozen Peas): your Chilled foods take no damage from hits.
 */
export type Aura = 'echo' | 'rally' | 'soothe' | 'cook' | 'infuse' | 'baste' | 'ferment' | 'cellar' | 'tower' | 'brainFreeze' | 'shatter' | 'coldPack';

/** How special a food is. Mythic foods never appear in the market. */
/** One rarity per buffet tier (1 common ... 6 exotic), and mythic for the special-cubby foods. */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'exotic' | 'mythic';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'exotic', 'mythic'];

export interface UnitDef {
  id: string;
  name: string;
  cookedName: string;
  emoji: string;
  tier: Tier;
  flavor: Flavor;
  /** A second flavor that also counts for flavor bonuses (Kimchi is Sour and Spicy). */
  flavor2?: Flavor;
  attack: number;
  hp: number;
  /** Ability numbers at level 1/2/3 (the "amount"; Salt can raise it in battle). */
  values: [number, number, number];
  abilities: AbilityDef[];
  /** Ability text; `{v}` is replaced by the value for the unit's level. */
  text: string;
  /** A bonus that switches on at level 3 (cooked), on top of its abilities. Fixed numbers; stronger with tier. */
  cooked?: {
    text: string;
    abilities: AbilityDef[];
    /** Its throws also make each target Rot this much (Olive). */
    throwRot?: number;
    /** Chilled enemies take this much more from every hit by your foods (Ice Cream). */
    chillBite?: number;
    /** Each throw adds one more projectile, at half damage (Takoyaki). */
    halfThrow?: boolean;
    /** Its echo reaches every adjacent friend, not only the one ahead (Bento Box). */
    echoAll?: boolean;
    /** Enemy Burn ticks twice a turn, halving after each tick (Pepperoni). */
    burnTwice?: boolean;
    /** spreadBurn spreads the whole Burn of the most-Burning enemy (Habanero Salsa). */
    spreadFull?: boolean;
    /** siphon also takes HP: the enemy front row takes damage and your front row gains HP (Fondue). */
    siphonHp?: boolean;
    /** A shattering enemy Chills the one behind it (Sorbet). */
    shatterBehind?: boolean;
    /** Your Chilled foods take no Burn or Rot either (Frozen Peas). */
    coldPackStatus?: boolean;
  };
  /** Defaults from the tier: 1-2 common, 3-4 rare, 5 epic, 6 legendary. Mythic must be set by hand and keeps the food out of the market. */
  rarity?: Rarity;
  /** No flavor of its own (its `flavor` is only for colour): it has the flavors it gains, with no cap (Rice). */
  plain?: boolean;
  /** A plain food's battle abilities, one for each flavor it has gained (see flavorAbilities in data.ts). */
  flavorAbilities?: Partial<Record<Flavor, AbilityDef>>;
  /** Summoned tokens never appear in the market and don't count for synergies. */
  token?: boolean;

  /** Use another sprite's file name instead of this food's id or name. */
  art?: string;
  /** How its attacks land (default single). */
  attackPattern?: AttackPattern;
  /** While on the plate: your interest cap is raised by this (by level). */
  interestCap?: [number, number, number];
  /** Multiplies the interest you earn by its level number (Mandarin). */
  interestMult?: boolean;
  /** Its attacks deal +value (by level) to enemies with this status: a payoff for a plate that spreads it. */
  hitsHarder?: 'burn' | 'rot';
  /** With hitsHarder: the bonus is value x the target's stacks of that status, not a flat value (Sweet & Sour Pork). */
  perStack?: boolean;
  /** Its attacks make the target Burn its level value, then double the target's Burn (Ghost Pepper). */
  fansBurn?: boolean;
  /** Its attacks make the target Rot this much just before they land (Sweet & Sour Pork). */
  attackRots?: number;
  /** Projectile foods: each throw deals this flat damage (levels add throws, not damage). */
  throwDamage?: number;
  /** A plate-wide effect while this food is on the plate (see Aura). */
  aura?: Aura;
  /** Counts as every flavor for flavor bonuses. */
  allFlavors?: boolean;
  /** Counts as its level number (values) of foods of its flavor for flavor bonuses (Curry, Fudge...). */
  rich?: boolean;
  /** Comes back at full HP this many times when eaten. */
  lives?: number;
}

export type HeldItemId = 'saltShaker' | 'toothpick' | 'tupperware' | 'bouillon' | 'chopsticks' | 'hotSauce';
export type ItemId = HeldItemId | 'butter' | 'seasoning' | 'microwave' | 'lunchbox' | 'flavorPacket' | 'oliveOil' | 'boneBroth' | 'sprinkles' | 'partyMix' | 'takeout';

export interface ItemDef {
  id: ItemId;
  name: string;
  emoji: string;
  tier: Tier;
  cost: number;
  held: boolean;
  text: string;
  /** Works on the whole plate: drop it on any of your foods. */
  anywhere?: boolean;
}

/** A unit owned by the player, between battles. Stats here are permanent. */
export interface UnitInstance {
  uid: number;
  defId: string;
  /** Copies merged in, 1 to 6. Level 2 at 3 copies, level 3 (cooked) at 6. */
  copies: number;
  attack: number;
  hp: number;
  item?: HeldItemId;
  flavorOverride?: Flavor;
  /** Hot Sauce: extra attack for the next battle only. */
  tempAttack?: number;
  /** Extra sell value gained (Coin Chocolate, Olive Oil). */
  sellBonus?: number;
  /** Flavors it gained (Tofu, Flavor Packet), on top of its own. */
  extraFlavors?: Flavor[];
  /** Kitchen growth so far, per ability index, for abilities with a `max`. */
  gains?: Record<number, number>;
}

/** 6 slots. Index = lane + 3 * row, where row 0 is the front row. */
export type Plate = (UnitInstance | null)[];

export const PLATE_SIZE = 6;
export const laneOf = (slot: number) => slot % 3;
export const rowOf = (slot: number) => Math.floor(slot / 3);
export const slotAt = (lane: number, row: number) => lane + 3 * row;

/** Orthogonal neighbours: same lane ahead/behind, or the same row in a neighbouring lane. */
export function isAdjacent(a: number, b: number): boolean {
  return Math.abs(laneOf(a) - laneOf(b)) + Math.abs(rowOf(a) - rowOf(b)) === 1;
}

export function levelOf(copies: number): Level {
  return copies >= 6 ? 3 : copies >= 3 ? 2 : 1;
}
