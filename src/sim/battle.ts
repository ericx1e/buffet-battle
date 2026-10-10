import { abilitiesOf, flavorTally, flavorsOf, unitDef } from './data';
import { Rng } from './rng';
import {
  type AbilityDef,
  type AttackPattern,
  FLAVORS,
  type Flavor,
  type HeldItemId,
  type Level,
  OPENING_THROWS,
  PROJECTILES,
  type Plate,
  PLATE_SIZE,
  type Trigger,
  type UnitInstance,
  isAdjacent,
  laneOf,
  levelOf,
  rowOf,
  slotAt,
} from './types';

// Last food standing (DESIGN.md, The Plate). Each food has its own HP. Every round, front-row foods
// attack (by their attack pattern), statuses tick, and a food at 0 HP is eaten while the food behind it steps
// up. The plate with food left wins. Abilities are data (AbilityDef in types.ts); `fire` runs any of them.

type Side = 0 | 1;

interface BattleUnit {
  uid: number;
  defId: string;
  side: Side;
  slot: number;
  level: Level;
  /** Main flavor (shown on the tile). */
  flavor: Flavor;
  /** Every flavor it counts as (main, second, gained). */
  flavors: Flavor[];
  attack: number;
  hp: number;
  /** HP it came onto the plate with: what an extra life brings it back to (there is no max HP). */
  startHp: number;
  crust: number;
  item?: HeldItemId;
  token: boolean;
  hitsTaken: number;
  /** Times each of this food's abilities has fired (by ability index), for `limitToAmount` and `grows`. */
  fired: number[];
  firstAttackDone: boolean;
  /** Attacks it has made this battle (each swing of an attack-twice counts): what an escalating attack grows with. */
  swings: number;
  /** Extra swings: one entry per source (Coffee Bean, Chopsticks...), the attacks it has left. They stack: two sources mean three swings. */
  extraAttacks: number[];
  tupperwareUsed: boolean;
  /** Added to this unit's ability amounts this battle. */
  abilityBonus: number;
  /** Abilities gained for this battle (copyAbility), with their numbers fixed in `values`. */
  extra: AbilityDef[];
  /** Times it can still come back (with the HP it started with). */
  lives: number;
  /** Counts as every flavor. */
  allFlavors: boolean;
  // statuses
  burn: number;
  rot: number;
  chill: number;
  /** Attack gained from rally auras this battle (capped). */
  rallied: number;
  /** Sweet x8 already saved it once this battle. */
  rushed: boolean;
  /** A Chicken Tender Tower already brought it back once this battle. */
  towered: boolean;
}

export interface UnitView {
  uid: number;
  defId: string;
  level: Level;
  flavor: Flavor;
  flavors: Flavor[];
  attack: number;
  hp: number;
  crust: number;
  token: boolean;
  item?: HeldItemId;
  burn: number;
  rot: number;
  chill: number;
  /** Abilities that only go off so many times a battle: [times left, times in all], in ability order. */
  uses: [number, number][];
}

export type MarkKind =
  | 'attack' | 'hit' | 'heal' | 'blocked' | 'buff' | 'debuff' | 'crust' | 'summon' | 'ability' | 'faint'
  | 'burn' | 'rot' | 'chill' | 'cleanse'
  /** A cooked bonus (level 3) went off, or Golden Truffle cooked this food. */
  | 'cooked'
  /** It threw a projectile (see PROJECTILES). */
  | 'shoot';

/** A visual cue for playback, on a slot of one side's plate. */
export interface Mark {
  side: Side;
  slot: number;
  kind: MarkKind;
  amount?: number;
  /** buff: the HP gained (`amount` is the attack). */
  hp?: number;
}

export interface BattleFrame {
  plates: [(UnitView | null)[], (UnitView | null)[]];
  round: number;
  text: string;
  marks: Mark[];
}

export type Outcome = 'win' | 'loss' | 'draw';

export interface BattleResult {
  /** From side 0's point of view. */
  outcome: Outcome;
  frames: BattleFrame[];
  /** How many of each flavor each side counts toward flavor bonuses (Saffron's neighbours count twice). */
  flavors: [Partial<Record<Flavor, number>>, Partial<Record<Flavor, number>>];
}

export const MAX_ROUNDS = 40;
/** From the round after this one, every food loses more HP each round, so stalemates end with food eaten. */
export const OVERTIME_AFTER = 15;
/** Most a food's attack can grow from rally auras in one battle. */
export const RALLY_CAP = 3;
const TRIGGER_BUDGET = 1000;
const LANE_NAMES = ['far', 'middle', 'near'];

/** Flavor bonus tier for a count of foods: 2 / 4 / 6 / 8 (8 needs foods that count as two flavors, or Saffron). */
export const flavorTier = (n: number) => (n >= 8 ? 4 : n >= 6 ? 3 : n >= 4 ? 2 : n >= 2 ? 1 : 0);

/** Caption lines joined with " · ", the same line repeated shown once with a count ("... +1/+1 ×3"). */
function joinLines(lines: string[]): string {
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts].map(([l, n]) => (n > 1 ? `${l} ×${n}` : l)).join(' · ');
}

/** The longest caption that fits its two lines; longer ones are split over several frames. */
const CAPTION_MAX = 170;

/** Groups caption lines (as joinLines does) into captions that each fit, in order. */
function captionChunks(lines: string[]): string[] {
  if (lines.length === 0) return [];
  const parts = joinLines(lines).split(' · ');
  const out: string[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last !== undefined && last.length + 3 + p.length <= CAPTION_MAX) out[out.length - 1] = `${last} · ${p}`;
    else out.push(p);
  }
  return out;
}

/** Deterministic: the same plates and seed always produce the same result and frames. */
export function simulateBattle(a: Plate, b: Plate, seed: number): BattleResult {
  return new Battle(a, b, seed).run();
}

interface FireContext {
  source?: BattleUnit; // hit: who hit this food; friendAheadHit: who hit the friend ahead; friendAheadAttacks: who it attacked
  summoned?: BattleUnit; // friendSummoned: who just arrived
  friend?: BattleUnit; // friendHealed: who was healed; plateCrustBreak: whose Crust broke
}

/** What each side's flavor bonuses switched on (see applySynergies). */
interface SideBonus {
  spicyBurn: number; // Burn each Spicy attack inflicts
  burnSticks: boolean; // Burn on this side's enemies fades by 1 a turn instead of halving
  sweetHeal: number; // front row heals this much each round
  sweetCleanse: boolean; // and loses 1 Burn and 1 Rot
  sweetAll: boolean; // the back row is soothed too
  saltyRegen: number; // front row regains this much Crust each round
  summonBonus: number; // summons +n/+n
  hearty: boolean; // a friend eaten: its adjacent friends +1/+1
  crumbs: boolean; // a friend eaten leaves a 2/2 Crumb
  rotSpreads: boolean; // an enemy eaten passes half its Rot to its adjacent friends
  flare: boolean; // Spicy x8: Burning enemies take +2 from every hit
  rotWeakens: boolean; // Sour x6: Rotting enemies deal 1 less damage
  sugarRush: boolean; // Sweet x8: each friend survives being eaten once, at 1 HP
  thorns: boolean; // Salty x8: Crust that blocks a hit deals that much back
  feast: boolean; // Savory x8: a friend eaten gives every friend +2/+2
}

const NO_BONUS: SideBonus = {
  spicyBurn: 0, burnSticks: false, sweetHeal: 0, sweetCleanse: false, sweetAll: false, saltyRegen: 0,
  summonBonus: 0, hearty: false, crumbs: false, rotSpreads: false, flare: false, rotWeakens: false, sugarRush: false,
  thorns: false, feast: false,
};

class Battle {
  private plates: (BattleUnit | null)[][] = [Array(PLATE_SIZE).fill(null), Array(PLATE_SIZE).fill(null)];
  private rng: Rng;
  private frames: BattleFrame[] = [];
  private marks: Mark[] = [];
  private queue: { unit: BattleUnit; source?: BattleUnit }[] = [];
  /** Reactions waiting for their own moment: each fires in its own frame after the one that caused it. */
  private later: { unit: BattleUnit; trigger?: Trigger; ctx?: FireContext; echo?: number; bonus?: { from: BattleUnit; hp?: number; crust?: number } }[] = [];
  private bonus: [SideBonus, SideBonus] = [{ ...NO_BONUS }, { ...NO_BONUS }];
  /** Summons with no free slot while a friend is being eaten: they arrive once the eaten are cleared away. */
  private waiting: { by: BattleUnit; defId: string; attack: number; hp: number; count: number }[] = [];
  private nextUid = 1;
  private triggerBudget = TRIGGER_BUDGET;
  private round = 0;
  /** Flavor counts for the flavor bonuses, from where each side placed its foods (see flavorTally). */
  private tally: [Map<Flavor, number>, Map<Flavor, number>];

  constructor(a: Plate, b: Plate, seed: number) {
    this.rng = new Rng(seed);
    this.tally = [flavorTally(a), flavorTally(b)];
    [a, b].forEach((plate, side) => {
      plate.forEach((inst, slot) => {
        if (inst) this.plates[side][slot] = this.fromInstance(inst, side as Side, slot);
      });
    });
  }

  /** A battle unit from an owned food. */
  private fromInstance(inst: UnitInstance, side: Side, slot: number): BattleUnit {
    const def = unitDef(inst.defId);
    return {
      ...this.blank(side, slot, inst.defId, Math.max(1, inst.attack + (inst.tempAttack ?? 0)), inst.hp),
      level: levelOf(inst.copies),
      flavor: inst.flavorOverride ?? def.flavor,
      flavors: flavorsOf(inst),
      item: inst.item,
      token: !!def.token,
      lives: def.lives ?? 0,
      allFlavors: !!def.allFlavors,
    };
  }

  private blank(side: Side, slot: number, defId: string, attack: number, hp: number): BattleUnit {
    const def = unitDef(defId);
    return {
      uid: this.nextUid++, defId, side, slot, level: 1, flavor: def.flavor, flavors: [def.flavor],
      attack, hp, startHp: hp, crust: 0, token: true, hitsTaken: 0, fired: [], firstAttackDone: false, swings: 0,
      extraAttacks: [], tupperwareUsed: false, abilityBonus: 0, extra: [], lives: 0, allFlavors: false,
      burn: 0, rot: 0, chill: 0, rallied: 0, rushed: false, towered: false,
    };
  }

  run(): BattleResult {
    this.stepUp();
    this.snap('Plates are served!');
    if (!this.over()) {
      this.applySynergies();
      this.startOfBattle();
    }

    for (this.round = 1; this.round <= MAX_ROUNDS && !this.over(); this.round++) {
      if (this.stepUp()) this.snap('The back row steps up.');
      this.shootStep();
      this.resolve();
      if (this.over()) break;
      if (this.stepUp()) this.snap('The back row steps up.');
      this.attackStep();
      this.resolve();
      if (this.over()) break;
      this.endOfRound();
      this.resolve();
      if (this.over()) break;
      this.statusTick();
      this.resolve();
      if (this.over()) break;
      this.overtime();
      this.resolve();
    }
    this.round = Math.min(this.round, MAX_ROUNDS);

    const empty0 = this.isEmpty(0);
    const empty1 = this.isEmpty(1);
    let outcome: Outcome;
    let text: string;
    if (empty0 || empty1) {
      outcome = empty0 && empty1 ? 'draw' : empty1 ? 'win' : 'loss';
      text = outcome === 'win' ? 'Your dish wins!' : outcome === 'loss' ? 'Your dish was eaten.' : 'Both plates are empty. A draw.';
    } else {
      // Round cap: the plate with more HP left on it wins.
      const hp = (side: Side) => this.units(side).reduce((sum, u) => sum + u.hp, 0);
      outcome = hp(0) > hp(1) ? 'win' : hp(1) > hp(0) ? 'loss' : 'draw';
      text = `Time! ${outcome === 'win' ? 'Your plate has more left. You win!' : outcome === 'loss' ? 'Their plate has more left.' : "It's a draw."}`;
    }
    this.snap(text);
    return { outcome, frames: this.frames, flavors: [Object.fromEntries(this.tally[0]), Object.fromEntries(this.tally[1])] };
  }

  private over() {
    return this.isEmpty(0) || this.isEmpty(1);
  }

  // ---- phases ----

  /** Back-row foods with an empty slot ahead step up. Returns whether anything moved. */
  private stepUp(): boolean {
    let moved = false;
    for (const side of [0, 1] as Side[]) {
      for (let lane = 0; lane < 3; lane++) {
        const front = slotAt(lane, 0);
        const back = slotAt(lane, 1);
        const u = this.plates[side][back];
        if (!this.plates[side][front] && u) {
          this.plates[side][back] = null;
          this.plates[side][front] = u;
          u.slot = front;
          moved = true;
        }
      }
    }
    return moved;
  }

  /** Flavor bonuses at 2 / 4 / 6 foods of a flavor (a food with several flavors counts for each). */
  private applySynergies() {
    for (const side of [0, 1] as Side[]) {
      const enemy = (1 - side) as Side;
      const b = this.bonus[side];
      const lines: string[] = [];
      const front = () => this.units(side).filter((u) => rowOf(u.slot) === 0);

      for (const flavor of FLAVORS) {
        const n = this.tally[side].get(flavor) ?? 0;
        const tier = flavorTier(n);
        if (tier === 0) continue;
        switch (flavor) {
          case 'spicy':
            b.spicyBurn = tier >= 2 ? 2 : 1;
            b.burnSticks = tier >= 3;
            b.flare = tier >= 4;
            lines.push(`Spicy x${n}: spicy attacks Burn ${b.spicyBurn}${tier >= 3 ? ', Burn fades by only 1' : ''}${tier >= 4 ? ', Burning enemies take +2 from every hit' : ''}`);
            break;
          case 'sweet':
            b.sweetHeal = tier >= 2 ? 2 : 1;
            b.sweetCleanse = tier >= 2;
            b.sweetAll = tier >= 3;
            b.sugarRush = tier >= 4;
            lines.push(`Sweet x${n}: ${tier >= 3 ? 'every friend' : 'front row'} gains ${b.sweetHeal} HP a turn${tier >= 2 ? ' and sheds Burn and Rot' : ''}${tier >= 4 ? ', sugar rush' : ''}`);
            break;
          case 'sour': {
            const targets = tier >= 2 ? this.units(enemy) : this.units(enemy).filter((u) => rowOf(u.slot) === 0);
            for (const u of targets) this.addStatus(u, 'rot', 1);
            b.rotWeakens = tier >= 3;
            b.rotSpreads = tier >= 4;
            lines.push(`Sour x${n}: ${tier >= 2 ? 'every enemy Rots 1' : 'enemy front row Rots 1'}${tier >= 3 ? ', Rotting enemies hit 1 softer' : ''}${tier >= 4 ? ', Rot spreads' : ''}`);
            break;
          }
          case 'salty': {
            const amount = tier >= 2 ? 4 : 2;
            for (const u of front()) this.giveCrust(u, amount);
            b.saltyRegen = tier >= 3 ? 2 : 0;
            b.thorns = tier >= 4;
            lines.push(`Salty x${n}: front row +${amount} Crust${tier >= 3 ? ', +2 more every turn' : ''}${tier >= 4 ? ', Crust bites back' : ''}`);
            break;
          }
          case 'savory':
            b.summonBonus = tier >= 2 ? 2 : 1;
            b.hearty = tier >= 2;
            b.crumbs = tier >= 3;
            b.feast = tier >= 4;
            lines.push(`Savory x${n}: summons +${b.summonBonus}/+${b.summonBonus}${tier >= 2 ? ', friends grow when a neighbour is eaten' : ''}${tier >= 3 ? ', the eaten leave Crumbs' : ''}${tier >= 4 ? ', feast' : ''}`);
            break;
        }
      }

      for (const u of this.units(side)) if (u.item === 'saltShaker') this.giveCrust(u, 5);
      for (const u of this.units(side)) if (u.item === 'chopsticks') u.extraAttacks.push(2);
      if (lines.length > 0) this.snap(`${side === 0 ? 'Your' : 'Enemy'} flavors: ${lines.join(' · ')}`);
      else if (this.marks.length > 0) this.snap('Salt Shakers: +5 Crust');
    }
  }

  /** Early abilities for everyone first, then the usual ones, then late ones, food by food. */
  private startOfBattle() {
    this.truffleCook();
    const order = ([0, 1] as Side[]).flatMap((side) => this.units(side));
    for (const phase of ['early', 'normal', 'late'] as const) {
      for (const u of order) {
        if (this.over()) return;
        if (!this.onPlate(u)) continue;
        const line = this.fire(u, 'startOfBattle', {}, (ab) => (ab.early ? 'early' : ab.late ? 'late' : 'normal') === phase);
        if (line) this.snap(line);
        this.resolve();
      }
    }
  }

  /** Golden Truffle: the friend in its lane (every friend, once it is cooked itself) is cooked for this battle. */
  private truffleCook() {
    for (const u of ([0, 1] as Side[]).flatMap((side) => this.units(side))) {
      if (unitDef(u.defId).aura !== 'cook') continue;
      const reach = this.units(u.side).filter((f) => f !== u && (u.level === 3 || laneOf(f.slot) === laneOf(u.slot)));
      const raw = reach.filter((f) => !f.token && f.level < 3);
      if (raw.length === 0) continue;
      const names = raw.map((f) => this.name(f)).join(', ');
      for (const f of raw) {
        f.level = 3;
        this.mark(f, 'cooked');
      }
      this.mark(u, 'ability');
      this.snap(`${this.name(u)} cooks ${names}!`);
    }
  }

  /** Who an attack lands on, by the attacker's pattern: [target, damage, main (Spicy Burn applies)]. */
  private attackTargets(attacker: BattleUnit, primary: BattleUnit, damage: number): [BattleUnit, number, boolean][] {
    const enemy = primary.side;
    const lane = laneOf(attacker.slot);
    // Pierce and escalate: extra targets take the attacker's level number as a percentage (50/75/100).
    const share = Math.max(1, Math.ceil((damage * this.levelValue(attacker)) / 100));
    const pattern: AttackPattern = unitDef(attacker.defId).attackPattern ?? 'single';
    const lanes = (l: number) => [l - 1, l + 1].filter((x) => x >= 0 && x <= 2);
    switch (pattern) {
      case 'snipe': {
        const back = this.plates[enemy][slotAt(lane, 1)];
        return [[back ?? primary, damage, true]];
      }
      case 'fork': {
        const prong = damage + this.levelValue(attacker);
        const prongs = [0, 1, 2].filter((l) => l !== lane).map((l) => this.frontMost(enemy, l)).filter((t): t is BattleUnit => !!t);
        return prongs.length > 0 ? prongs.map((t) => [t, prong, true]) : [[primary, prong, true]];
      }
      case 'pierce': {
        const behind = rowOf(primary.slot) === 0 ? this.plates[enemy][slotAt(laneOf(primary.slot), 1)] : null;
        return behind ? [[primary, damage, true], [behind, share, false]] : [[primary, damage, true]];
      }
      case 'splash':
        return [
          [primary, damage, true],
          ...lanes(laneOf(primary.slot)).map((l) => this.frontMost(enemy, l)).filter((t): t is BattleUnit => !!t).map((t): [BattleUnit, number, boolean] => [t, this.levelValue(attacker), false]),
        ];
      case 'escalate': {
        // Grows with each of its own attacks: one target, then the whole front row, then every enemy.
        if (attacker.swings === 0) return [[primary, damage, true]];
        const others = this.units(enemy).filter((t) => t !== primary && (attacker.swings >= 2 || rowOf(t.slot) === 0));
        return [[primary, damage, true], ...others.map((t): [BattleUnit, number, boolean] => [t, share, false])];
      }
      default:
        return [[primary, damage, true]];
    }
  }

  /** Whether a food throws projectiles (from either row) instead of attacking with the front row, every turn. */
  private throws(u: BattleUnit): boolean {
    const p = unitDef(u.defId).attackPattern ?? 'single';
    return PROJECTILES.includes(p) && !OPENING_THROWS.includes(p);
  }

  /** Whether a food throws this turn: every turn for a volley, only the first turn for an opening throw. */
  private throwsNow(u: BattleUnit): boolean {
    const p = unitDef(u.defId).attackPattern ?? 'single';
    return PROJECTILES.includes(p) && (!OPENING_THROWS.includes(p) || this.round === 1);
  }

  /** An attack's damage and how many times it goes off: first-attack bonuses, attack-twice, and Sour x6. */
  private swing(attacker: BattleUnit): [number, number] {
    let damage = attacker.attack;
    if (!attacker.firstAttackDone) {
      for (const ab of abilitiesOf(unitDef(attacker.defId), attacker.level)) {
        if (ab.trigger === 'firstAttack' && ab.effect === 'bonusDamage') damage += this.amountOf(attacker, ab);
      }
      attacker.firstAttackDone = true;
    }
    if (attacker.rot > 0 && this.bonus[(1 - attacker.side) as Side].rotWeakens) damage = Math.max(1, damage - 1);
    // Every source of extra attacks still going adds a swing to this attack.
    const times = 1 + attacker.extraAttacks.length;
    attacker.extraAttacks = attacker.extraAttacks.map((n) => n - 1).filter((n) => n > 0);
    return [damage, times];
  }

  /**
   * Projectiles: every thrower, front or back row, lane by lane, before the front rows attack (opening throws on the
   * first turn only). Each throw is its own
   * moment on screen, so you can follow what flew where.
   */
  private shootStep() {
    const order: Side[] = this.round % 2 === 1 ? [0, 1] : [1, 0];
    for (let lane = 0; lane < 3; lane++) {
      for (const side of order) {
        for (const row of [0, 1]) {
          const u = this.plates[side][slotAt(lane, row)];
          if (!u || !this.throwsNow(u) || !this.onPlate(u)) continue;
          if (this.over()) return;
          if (u.chill > 0) {
            u.chill--;
            this.mark(u, 'chill', 0);
            this.snap(`${this.name(u)} is chilled and skips a throw`);
            continue;
          }
          const enemy = (1 - side) as Side;
          const [damage, times] = this.swing(u);
          const half = Math.max(1, Math.ceil(damage / 2));
          const burn = this.hasFlavor(u, 'spicy') ? this.bonus[side].spicyBurn : 0;
          const pattern = unitDef(u.defId).attackPattern;
          const n = this.levelValue(u); // shots, lobs, peppercorns and balls thrown
          // A volley (Takoyaki) throws for its attack; other throws a flat amount, or half its attack (Peppercorns, and
          // Pomegranate's scatter, every turn).
          const flat = pattern === 'volley' ? damage : unitDef(u.defId).throwDamage ?? half;
          const verb = pattern === 'lob' ? 'lobs' : pattern === 'spray' ? 'sprays' : pattern === 'volley' ? 'throws' : pattern === 'scatter' ? 'bursts' : 'shoots';
          const cooked = u.level === 3 ? unitDef(u.defId).cooked : undefined;
          const land = (t: BattleUnit, dmg: number) => {
            this.hit(t, dmg + (u.item === 'toothpick' ? 1 : 0), u, u.item === 'toothpick');
            if (burn > 0 && this.onPlate(t)) this.addStatus(t, 'burn', burn);
            if (cooked?.throwRot && this.onPlate(t)) this.addStatus(t, 'rot', cooked.throwRot);
          };
          for (let i = 0; i < times; i++) {
            // One throw is one moment: its projectiles fly together, each at an enemy not hit yet in this throw.
            const hit: BattleUnit[] = [];
            for (let k = 0; k < n; k++) {
              const left = this.units(enemy).filter((e) => !hit.includes(e) && e.hp > 0);
              if (left.length === 0) break;
              const near = (e: BattleUnit) => Math.abs(laneOf(e.slot) - lane);
              let t: BattleUnit;
              if (pattern !== 'lob') t = this.rng.pick(left); // random, a different enemy each time
              else t = [...left].sort((x, y) => rowOf(y.slot) - rowOf(x.slot) || near(x) - near(y) || x.slot - y.slot)[0]; // back row first
              hit.push(t);
              land(t, flat);
            }
            // Cooked Takoyaki: one more ball in the same throw, at half damage.
            if (cooked?.halfThrow && hit.length > 0) {
              const left = this.units(enemy).filter((e) => !hit.includes(e) && e.hp > 0);
              const t = left.length > 0 ? this.rng.pick(left) : hit[hit.length - 1];
              if (this.onPlate(t)) {
                if (!hit.includes(t)) hit.push(t);
                land(t, Math.max(1, Math.ceil(flat / 2)));
              }
            }
            if (hit.length === 0) break;
            this.mark(u, 'shoot', 1);
            this.snap(`Turn ${this.round} · ${this.name(u)} ${verb} at ${hit.map((t) => this.name(t)).join(', ')}`);
          }
        }
      }
    }
  }

  /**
   * Every front-row food picks its targets at the same moment; the hits are then shown lane by lane
   * (far, middle, near) so they are easy to follow. Faints and on-hit abilities resolve after all three.
   */
  private attackStep() {
    const attacks: { attacker: BattleUnit; primary: BattleUnit; hits: [BattleUnit, number, boolean][]; times: number }[] = [];
    const chilled: BattleUnit[] = [];
    const order: Side[] = this.round % 2 === 1 ? [0, 1] : [1, 0];
    for (const side of order) {
      const enemy = (1 - side) as Side;
      for (let lane = 0; lane < 3; lane++) {
        const attacker = this.plates[side][slotAt(lane, 0)];
        if (!attacker || this.throws(attacker)) continue;
        if (attacker.chill > 0) {
          attacker.chill--;
          chilled.push(attacker);
          continue;
        }
        const primary = this.targetFor(enemy, lane);
        if (!primary) continue;
        const [damage, times] = this.swing(attacker);
        attacks.push({ attacker, primary, hits: this.attackTargets(attacker, primary, damage), times });
      }
    }
    if (chilled.length > 0) {
      for (const u of chilled) this.mark(u, 'chill', 0);
      this.snap(`${chilled.map((u) => this.name(u)).join(', ')} ${chilled.length > 1 ? 'are' : 'is'} chilled and skip${chilled.length > 1 ? '' : 's'} an attack`);
    }

    for (let lane = 0; lane < 3; lane++) {
      const inLane = attacks.filter((a) => laneOf(a.attacker.slot) === lane);
      if (inLane.length === 0) continue;
      const followUps: string[] = [];
      const swingOnce = (attacker: BattleUnit, hits: [BattleUnit, number, boolean][]) => {
        const burn = this.hasFlavor(attacker, 'spicy') ? this.bonus[attacker.side].spicyBurn : 0;
        const def = unitDef(attacker.defId);
        const harder = def.hitsHarder ? def.values[attacker.level - 1] + attacker.abilityBonus : 0;
        this.mark(attacker, 'attack', 1);
        for (const [t, dmg] of hits) {
          if (def.attackRots) this.addStatus(t, 'rot', def.attackRots);
          // Ghost Pepper fans the flames: Burn first, then the target's Burn doubles (it stacks without a cap).
          if (def.fansBurn && this.onPlate(t)) {
            this.addStatus(t, 'burn', this.levelValue(attacker));
            this.addStatus(t, 'burn', t.burn);
          }
          const stacks = def.hitsHarder ? t[def.hitsHarder] : 0;
          const bonus = stacks > 0 ? harder * (def.perStack ? stacks : 1) : 0;
          this.hit(t, dmg + bonus + (attacker.item === 'toothpick' ? 1 : 0), attacker, attacker.item === 'toothpick');
          // Spicy burns everything the attack hits (splash, pierce, fork...), as throws do.
          if (burn > 0 && this.onPlate(t)) this.addStatus(t, 'burn', burn);
        }
        attacker.swings++;
      };
      // Everyone's first swing lands together, lane by lane.
      for (const { attacker, primary, hits } of inLane) {
        swingOnce(attacker, hits);
        // The food behind an attacker can react to its attack.
        const behind = this.plates[attacker.side][slotAt(lane, 1)];
        if (behind) {
          const line = this.fire(behind, 'friendAheadAttacks', { source: primary });
          if (line) followUps.push(line);
        }
      }
      this.snap(`Turn ${this.round} · ${LANE_NAMES[lane]} lane`);
      for (const c of captionChunks(followUps)) this.snap(c);
      // A second attack (Coffee Bean, attack-twice) is its own moment: it picks its targets again (the first may be
      // eaten; an escalating attack has grown).
      for (const { attacker, primary, hits, times } of inLane) {
        for (let i = 1; i < times; i++) {
          if (!this.onPlate(attacker) || this.over()) break;
          const target = this.onPlate(primary) ? primary : this.targetFor((1 - attacker.side) as Side, lane);
          if (!target) break;
          swingOnce(attacker, this.attackTargets(attacker, target, hits[0][1]));
          this.snap(`Turn ${this.round} · ${this.name(attacker)} attacks again`);
        }
      }
    }
  }

  /** End of each turn: every-turn abilities and flavor bonuses, shown one plate at a time so each line stays short. */
  private endOfRound() {
    for (const side of [0, 1] as Side[]) {
      const lines: string[] = [];
      const b = this.bonus[side];
      for (const u of this.units(side)) {
        const line = this.fire(u, 'round', {});
        if (line) lines.push(line);
      }
      const front = this.units(side).filter((f) => b.sweetAll || rowOf(f.slot) === 0);
      if (b.sweetHeal > 0) {
        for (const f of front) {
          this.buff(f, 0, b.sweetHeal);
          if (b.sweetCleanse) this.cleanse(f, 1);
        }
        if (front.length > 0) lines.push(`${side === 0 ? 'Your' : 'Enemy'} sweets soothe ${b.sweetAll ? 'every friend' : 'the front row'}`);
      }
      if (b.saltyRegen > 0) {
        for (const f of front) this.giveCrust(f, b.saltyRegen);
        if (front.length > 0) lines.push(`${side === 0 ? 'Your' : 'Enemy'} salt cures the front row: +${b.saltyRegen} Crust`);
      }
      if (lines.length > 0) this.snap(joinLines(lines));
    }
  }

  /**
   * Burn and Rot deal their damage (ignoring Crust; not a hit). Neither has a cap: Burn then halves (rounded down), so
   * it settles near twice what is added each turn, or with Spicy x6 on the other side fades by only 1. Rot never fades,
   * so it only builds from foods that keep applying it. A cooked Pepperoni on the other side makes Burn tick twice,
   * fading after each tick.
   */
  private statusTick() {
    const lines: string[] = [];
    const ticks: string[] = [];
    for (const side of [0, 1] as Side[]) {
      const enemy = (1 - side) as Side;
      const sticks = this.bonus[enemy].burnSticks;
      const twice = this.units(enemy).some((f) => f.level === 3 && !!unitDef(f.defId).cooked?.burnTwice);
      const fade = (u: BattleUnit) => (u.burn = sticks ? u.burn - 1 : Math.floor(u.burn / 2));
      for (const u of this.units(side)) {
        const mult = this.fermented(u);
        const dmg = (u.burn + u.rot) * mult;
        if (dmg <= 0) continue;
        u.hp -= dmg;
        if (u.burn > 0) this.mark(u, 'burn', u.burn);
        if (u.rot > 0) this.mark(u, 'rot', u.rot);
        const what = u.burn > 0 && u.rot > 0 ? 'burns and rots' : u.burn > 0 ? 'burns' : 'rots';
        const times = mult === 3 ? ' (tripled)' : mult === 2 ? ' (doubled)' : '';
        if (u.burn > 0) fade(u);
        // The second tick: the Burn that's left, after fading once.
        const again = twice && u.burn > 0 ? u.burn * mult : 0;
        if (again > 0) {
          u.hp -= again;
          this.mark(u, 'burn', u.burn);
          fade(u);
        }
        ticks.push(`${this.name(u)} ${dmg}${again ? `+${again}` : ''}`);
        lines.push(`${this.name(u)} ${what} for ${dmg}${times}${again ? `, then burns for ${again}` : ''}`);
      }
    }
    // Several foods ticking at once: one compact line ("Burn & Rot: Popcorn 4, Kimchi 2").
    if (lines.length > 2) this.snap(`Burn & Rot: ${ticks.join(', ')}`);
    else if (lines.length > 0) this.snap(joinLines(lines));
  }

  /** Wagyu: friends next to it (every friend, once it is cooked) get double from Crust and heals. */

/** Cooked Ice Cream on a side: how much more its hits deal to Chilled enemies. */
  private chillBite(side: Side): number {
    let most = 0;
    for (const u of this.units(side)) if (u.level === 3) most = Math.max(most, unitDef(u.defId).cooked?.chillBite ?? 0);
    return most;
  }

  /** The Wagyu basting this food, if any. */
  private bastedBy(u: BattleUnit): BattleUnit | undefined {
    return this.units(u.side).find((w) => w !== u && unitDef(w.defId).aura === 'baste');
  }

/** Black Garlic on the other side: how many times over this food takes Burn and Rot damage. Its lane and the lanes
   * beside it take double; once it is cooked, every enemy takes triple. */
  private fermented(u: BattleUnit): number {
    let mult = 1;
    for (const g of this.units((1 - u.side) as Side)) {
      if (unitDef(g.defId).aura !== 'ferment') continue;
      if (g.level === 3) mult = 3;
      else if (Math.abs(laneOf(g.slot) - laneOf(u.slot)) <= 1) mult = Math.max(mult, 2);
    }
    return mult;
  }

  /** The food is going cold: every food loses 1 HP in round 16, 2 in round 17 and so on. Ignores Crust and Tupperware, and isn't a hit. */
  private overtime() {
    const amount = this.round - OVERTIME_AFTER;
    if (amount <= 0) return;
    for (const side of [0, 1] as Side[]) {
      for (const u of this.units(side)) {
        u.hp -= amount;
        this.mark(u, 'hit', amount);
      }
    }
    this.snap(`Overtime! The food is going cold: everyone loses ${amount} HP.`);
  }

  /** On-hit abilities, then faints (and "eaten" abilities), repeated until nothing else happens. */
  private resolve() {
    for (;;) {
      if (this.queue.length > 0) {
        const batch = this.queue;
        this.queue = [];
        const lines: string[] = [];
        // A food that is about to be eaten still reacts to the hit that finished it (Egg cracks, Bacon splatters).
        for (const { unit, source } of batch) {
          if (!this.onPlate(unit)) continue;
          const line = this.fire(unit, 'hit', { source });
          if (line) lines.push(line);
          // The food behind a front-row food can react to it being hit.
          const behind = rowOf(unit.slot) === 0 ? this.plates[unit.side][slotAt(laneOf(unit.slot), 1)] : null;
          if (behind) {
            const l2 = this.fire(behind, 'friendAheadHit', { source });
            if (l2) lines.push(l2);
          }
        }
        for (const c of captionChunks(lines)) this.snap(c);
        continue;
      }
      // Reactions, one food at a time, each its own frame (Steak feeding a summon, Pork Crackling biting back...).
      if (this.later.length > 0) {
        const next = this.later[0];
        if (next.bonus) {
          // A modifier's buffs: every one waiting from the same food lands together, in one frame from it.
          const from = next.bonus.from;
          const batch = this.later.filter((l) => l.bonus?.from === from);
          this.later = this.later.filter((l) => l.bonus?.from !== from);
          if (!this.onPlate(from)) continue;
          const got: string[] = [];
          for (const { unit, bonus } of batch) {
            if (!this.onPlate(unit) || !bonus) continue;
            if (bonus.hp) {
              unit.hp += bonus.hp;
              this.mark(unit, 'buff', 0, bonus.hp);
              got.push(`${this.name(unit)} +${bonus.hp} HP`);
            }
            if (bonus.crust) {
              unit.crust += bonus.crust;
              this.mark(unit, 'crust', bonus.crust);
              got.push(`${this.name(unit)} +${bonus.crust} Crust`);
            }
          }
          if (got.length === 0) continue;
          this.mark(from, 'ability');
          this.snap(`${this.name(from)}: ${joinLines(got)}`);
          continue;
        }
        // A food reacting several times to the same thing at once (Pork Crackling to each blocked hit, Crème Brûlée to
        // each Crust that broke) does it all in one step.
        const first = this.later.shift()!;
        const same = this.later.filter((l) => !l.bonus && l.unit === first.unit && l.trigger === first.trigger && l.echo === first.echo);
        this.later = this.later.filter((l) => !same.includes(l));
        const lines: string[] = [];
        for (const { unit, trigger, ctx, echo } of [first, ...same]) {
          if (!this.onPlate(unit) || !trigger) continue;
          const line = this.fire(unit, trigger, ctx ?? {}, undefined, echo);
          if (line) lines.push(line);
        }
        if (lines.length === 0) continue;
        let counted = [...new Set(lines)].map((l) => {
          const n = lines.filter((x) => x === l).length;
          return n > 1 ? `${l} (x${n})` : l;
        });
        // "Crème Brûlée: Cheese +1 attack" three times over reads as one line naming the food once.
        const prefix = counted[0].includes(': ') ? counted[0].slice(0, counted[0].indexOf(': ') + 2) : '';
        if (counted.length > 1 && prefix && counted.every((l) => l.startsWith(prefix))) {
          counted = [prefix + counted.map((l) => l.slice(prefix.length)).join(', ')];
        }
        // Each echo is its own step, so a level 2 or 3 Bento Box clearly casts twice or three times.
        if (first.echo !== undefined) for (const l of lines) for (const c of captionChunks([`Echo! ${l}`])) this.snap(c);
        else for (const c of captionChunks(counted)) this.snap(c);
        continue;
      }

      let dead = ([0, 1] as Side[]).flatMap((side) => this.units(side).filter((u) => u.hp <= 0));
      // Extra lives: back with the HP it started with instead of being eaten.
      const revived = dead.filter((u) => u.lives > 0);
      for (const u of revived) {
        u.lives--;
        u.hp = u.startHp;
        u.burn = 0;
        u.rot = 0;
        this.mark(u, 'heal', u.startHp);
      }
      if (revived.length > 0) this.snap(`${revived.map((u) => this.name(u)).join(', ')} comes back for more!`);
      // Sweet x8: each friend hangs on once at 1 HP.
      const rushed = dead.filter((u) => u.hp <= 0 && !u.token && !u.rushed && this.bonus[u.side].sugarRush);
      for (const u of rushed) {
        u.rushed = true;
        u.hp = 1;
        this.mark(u, 'heal', 1);
      }
      if (rushed.length > 0) this.snap(`Sugar rush! ${rushed.map((u) => this.name(u)).join(', ')} ${rushed.length > 1 ? 'hang' : 'hangs'} on at 1 HP`);
      // Chicken Tender Tower: the friend in its lane (every friend, once cooked) is back once, with part of its HP.
      const towered: BattleUnit[] = [];
      for (const u of dead) {
        if (u.hp > 0 || u.lives > 0 || u.token || u.towered) continue;
        const tower = this.units(u.side).find((g) => g !== u && g.hp > 0 && unitDef(g.defId).aura === 'tower' && (g.level === 3 || laneOf(g.slot) === laneOf(u.slot)));
        if (!tower) continue;
        u.towered = true;
        u.hp = Math.max(1, Math.floor((u.startHp * this.levelValue(tower)) / 100));
        u.burn = 0;
        u.rot = 0;
        this.mark(u, 'heal', u.hp);
        this.mark(tower, 'ability');
        towered.push(u);
      }
      if (towered.length > 0) this.snap(`The Tender Tower stacks ${towered.map((u) => this.name(u)).join(', ')} back up!`);
      dead = dead.filter((u) => u.lives === 0 && u.hp <= 0);
      if (dead.length === 0) {
        this.waiting = []; // nobody was eaten after all, so no room was made
        if (revived.length > 0 || towered.length > 0) continue;
        return;
      }
      for (const u of dead) {
        this.plates[u.side][u.slot] = null;
        this.mark(u, 'faint');
      }
      this.snap(`${dead.map((u) => this.name(u)).join(', ')} got eaten!`);
      const lines: string[] = [];
      for (const u of dead) {
        const line = this.fire(u, 'faint', {});
        if (line) lines.push(line);
        const b = this.bonus[u.side];
        const neighbours = this.units(u.side).filter((o) => isAdjacent(o.slot, u.slot));
        for (const n of neighbours) {
          const l2 = this.fire(n, 'friendFaint', {});
          if (l2) lines.push(l2);
        }
        for (const f of this.units(u.side)) if (f.hp > 0) this.later.push({ unit: f, trigger: 'anyFriendEaten', ctx: {} });
        if (b.hearty && !u.token && neighbours.length > 0) {
          for (const n of neighbours) this.buff(n, 1, 1);
          lines.push(`hearty: ${this.name(u)}'s neighbours +1/+1`);
        }
        if (b.feast && !u.token) {
          for (const f of this.units(u.side)) this.buff(f, 2, 2);
          lines.push(`feast: every friend +2/+2`);
        }
        if (b.crumbs && !u.token && unitDef(u.defId).id !== 'crumb') {
          if (this.summon(u.side, u.slot, 'crumb', 2, 2, u.flavor)) lines.push(`${this.name(u)} leaves a Crumb behind`);
        }
        // Sour x6 on the other side: half its Rot (rounded up) spreads to each of its neighbours.
        if (u.rot > 0 && this.bonus[(1 - u.side) as Side].rotSpreads) {
          for (const n of neighbours) this.addStatus(n, 'rot', Math.ceil(u.rot / 2));
          if (neighbours.length > 0) lines.push(`the Rot spreads from ${this.name(u)}`);
        }
      }
      // Summons that were waiting for room: the eaten are gone, so they arrive now.
      for (const w of this.waiting.splice(0)) {
        let n = 0;
        while (n < w.count && this.summon(w.by.side, w.by.slot, w.defId, w.attack, w.hp, w.by.flavor)) n++;
        if (n === 0) continue;
        if (this.onPlate(w.by)) this.mark(w.by, 'ability');
        lines.push(`${this.name(w.by)} summons ${n > 1 ? `${n} ` : 'a '}${unitDef(w.defId).name}${n > 1 ? 's' : ''}`);
      }
      for (const c of captionChunks(lines)) this.snap(c);
    }
  }

  // ---- abilities (data-driven) ----

  /** Runs every ability of `u` with this trigger whose conditions hold. Returns the log line, if any. */
  private fire(u: BattleUnit, trigger: Trigger, ctx: FireContext, only?: (ab: AbilityDef) => boolean, echoOf?: number): string | undefined {
    const lines: string[] = [];
    // Echo aura: a food in the back row makes the friend ahead's abilities go off again (its level number of
    // times). Each repeat waits for its own moment (see resolve); an echo doesn't echo.
    const repeats = echoOf === undefined && this.onPlate(u) ? this.echoesOn(u) : 0;
    const times = 1;
    const def = unitDef(u.defId);
    const own = abilitiesOf(def, u.level);
    [...own, ...u.extra].forEach((ab, index) => {
      if (ab.trigger !== trigger || (only && !only(ab)) || (echoOf !== undefined && index !== echoOf)) return;
      if (trigger === 'hit') {
        if (ab.once && u.hitsTaken !== 1) return;
        if (ab.every && u.hitsTaken % ab.every !== 0) return;
        if (ab.limitToAmount && (u.fired[index] ?? 0) >= this.amountOf(u, ab, index)) return;
      }
      if (trigger === 'round' && this.round % (ab.every ?? 1) !== 0) return;
      if (ab.max && (u.fired[index] ?? 0) >= ab.max) return; // at most `max` times a battle
      for (let t = 0; t < times; t++) {
        if (!this.spendTrigger()) return;
        const line = this.execute(u, ab, this.amountOf(u, ab, index), ctx, trigger === 'hit' || trigger === 'crustBlock');
        if (!line) continue;
        u.fired[index] = (u.fired[index] ?? 0) + 1;
        if (index >= def.abilities.length && index < own.length) this.mark(u, 'cooked');
        lines.push(line);
        for (let r = 0; r < repeats; r++) this.later.push({ unit: u, trigger, ctx, echo: index });
      }
    });
    // Rally aura: a friend next to a rally food gains attack (its level number) when its ability fires, a few times a battle.
    if (lines.length > 0 && this.onPlate(u) && u.rallied < RALLY_CAP) {
      const rallies = this.units(u.side).filter((f) => f !== u && unitDef(f.defId).aura === 'rally');
      if (rallies.length > 0) {
        const gain = Math.max(...rallies.map((f) => this.levelValue(f)));
        u.rallied++;
        u.attack += gain;
        this.mark(u, 'buff', gain, 0);
        lines.push(`rallied +${gain}`);
      }
    }
    return lines.length > 0 ? lines.join(' · ') : undefined;
  }

/** Bento Box: how many extra times this food's abilities go off (behind it in its lane; cooked, any neighbour). */
  private echoesOn(u: BattleUnit): number {
    let most = 0;
    for (const b of this.units(u.side)) {
      if (b === u || unitDef(b.defId).aura !== 'echo') continue;
      const behind = rowOf(u.slot) === 0 && b.slot === slotAt(laneOf(u.slot), 1);
      const beside = b.level === 3 && !!unitDef(b.defId).cooked?.echoAll && isAdjacent(b.slot, u.slot);
      if (behind || beside) most = Math.max(most, this.levelValue(b));
    }
    return most;
  }

  /** A food's level number (its value at its level): what its pattern, throw or aura scales with. */
  private levelValue(u: BattleUnit): number {
    return unitDef(u.defId).values[u.level - 1] + u.abilityBonus;
  }


  /** The ability's number: level value + bonuses, + per-friend flavor bonus, x distinct flavors, + level 3 friends. */
  private amountOf(u: BattleUnit, ab: AbilityDef, index = -1): number {
    let amount = (ab.values ?? unitDef(u.defId).values)[u.level - 1] + u.abilityBonus;
    if (ab.grows && index >= 0) amount += u.fired[index] ?? 0;
    if (ab.perFriend) amount += this.countFlavor(u.side, ab.perFriend, u);
    if (ab.perDistinctFlavor) amount *= this.distinctFlavors(u.side);
    if (ab.perLevel3) amount += this.units(u.side).filter((f) => !f.token && f.level === 3).length;
    return amount;
  }

  private execute(u: BattleUnit, ab: AbilityDef, amount: number, ctx: FireContext, reaction: boolean): string | undefined {
    const name = this.name(u);
    let targets = this.targets(u, ab, amount, ctx);
    if (ab.onlyFlavor) targets = targets.filter((t) => this.hasFlavor(t, ab.onlyFlavor!));
    const amountFor = (t: BattleUnit) => {
      const f = ab.forFlavor;
      return f && this.hasFlavor(t, f.flavor) ? amount * (f.mult ?? 1) + (f.add ?? 0) : amount;
    };
    // Three or more targets are counted, not listed, so a line stays short enough to read in the caption.
    const names = (list: BattleUnit[]) => (list.length > 2 ? `${list.length} ${list[0].side === u.side ? 'friends' : 'enemies'}` : list.map((t) => this.name(t)).join(', '));

    switch (ab.effect) {
      case 'summon': {
        const def = unitDef(ab.summon!.id);
        const [a, h, count] = [ab.summon!.attack ?? amount, ab.summon!.hp ?? amount, ab.count ?? 1];
        let n = 0;
        while (n < count && this.summon(u.side, u.slot, def.id, a, h, u.flavor)) n++;
        // The plate is full but a friend is being eaten (maybe this food): the rest arrive once it is cleared away.
        if (n < count && this.units(u.side).some((t) => t.hp <= 0)) this.waiting.push({ by: u, defId: def.id, attack: a, hp: h, count: count - n });
        if (n === 0) return;
        this.mark(u, 'ability');
        return `${name} summons ${n > 1 ? `${n} ` : 'a '}${def.name}${n > 1 ? 's' : ''}`;
      }
      case 'gold':
      case 'bonusDamage':
      case 'sellValue':
      case 'freeReroll':
      case 'gainFlavor':
      case 'buyBonus':
        return; // kitchen and attack-step effects are handled elsewhere
      case 'split': {
        // One token per empty slot, each with a third of this food's attack and HP.
        const a = Math.max(1, Math.ceil(u.attack / 3));
        const h = Math.max(1, Math.ceil(u.startHp / 3));
        let n = 0;
        while (this.summon(u.side, u.slot, ab.summon!.id, a, h, u.flavor)) n++;
        if (n === 0) return;
        this.mark(u, 'ability');
        return `${name} splits into ${n} pieces`;
      }
    }
    if (targets.length === 0) return;
    this.mark(u, ab.thrown ? 'shoot' : 'ability');

    switch (ab.effect) {
      case 'damage':
        for (const t of targets) this.hit(t, amountFor(t), u, false, reaction);
        return `${name} hits ${names(targets)} for ${amountFor(targets[0])}`;
      case 'buff': {
        const a = ab.attack ?? 1;
        const h = ab.hp ?? 1;
        for (const t of targets) this.buff(t, amountFor(t) * a, amountFor(t) * h);
        const x = amountFor(targets[0]);
        const what = a && h ? `+${x * a}/+${x * h}` : a ? `+${x * a} attack` : `+${x * h} HP`;
        return `${name}: ${names(targets)} ${what}`;
      }
      case 'debuff':
        for (const t of targets) this.debuff(t, amountFor(t));
        return `${name}: ${names(targets)} -${amountFor(targets[0])} attack`;
      case 'halveAttack':
        for (const t of targets) this.debuff(t, t.attack - Math.max(1, Math.floor(t.attack / 2)));
        return `${name} halves the attack of ${names(targets)}`;
      case 'crust':
        for (const t of targets) this.giveCrust(t, amountFor(t));
        return `${name}: ${names(targets)} +${amountFor(targets[0])} Crust`;
      case 'heal': // the same as gaining HP (there is no max HP)
        for (const t of targets) this.buff(t, 0, amountFor(t));
        return `${name}: ${names(targets)} +${amountFor(targets[0])} HP`;
      case 'burn':
      case 'rot':
      case 'chill':
        for (const t of targets) this.addStatus(t, ab.effect, amountFor(t));
        const many = targets.length > 1;
        return `${name}: ${names(targets)} ${ab.effect === 'burn' ? (many ? 'Burn' : 'Burns') : ab.effect === 'rot' ? (many ? 'Rot' : 'Rots') : many ? 'are Chilled' : 'is Chilled'} ${amountFor(targets[0])}`;
      case 'cleanse':
        for (const t of targets) this.cleanse(t, amountFor(t));
        return `${name} cleanses ${names(targets)}`;
      case 'extraAttacks':
        for (const t of targets) {
          t.extraAttacks.push(amountFor(t));
          this.mark(t, 'buff');
        }
        return `${name}: ${names(targets)} attacks twice x${amountFor(targets[0])}`;
      case 'season':
        for (const t of targets) {
          t.abilityBonus += amountFor(t);
          this.mark(t, 'buff');
        }
        return `${name} seasons ${names(targets)}: abilities +${amountFor(targets[0])}`;
      case 'copyAbility': {
        // The target's abilities, with the numbers they have right now.
        const t = targets[0];
        const tdef = unitDef(t.defId);
        const copies = [...abilitiesOf(tdef, t.level), ...t.extra]
          .filter((a) => a.effect !== 'copyAbility')
          .map((a) => {
            const n = (a.values ?? tdef.values)[t.level - 1] + t.abilityBonus;
            return { ...a, early: false, values: [n, n, n] as [number, number, number] };
          });
        u.extra.push(...copies);
        this.mark(t, 'debuff', 0);
        return copies.length > 0 ? `${name} copies the abilities of ${this.name(t)}` : `${name} studies ${this.name(t)}, but it has no ability to copy`;
      }
      case 'bequeath':
        for (const t of targets) this.buff(t, u.attack, u.startHp);
        return `${name} passes its strength to ${names(targets)}: +${u.attack}/+${u.startHp}`;
    }
  }

  /** Resolves an ability's target to the foods it affects right now. */
  private targets(u: BattleUnit, ab: AbilityDef, amount: number, ctx: FireContext): BattleUnit[] {
    const enemy = (1 - u.side) as Side;
    const lane = laneOf(u.slot);
    const one = (t: BattleUnit | null | undefined) => (t ? [t] : []);
    switch (ab.target ?? 'self') {
      case 'self':
        return this.onPlate(u) ? [u] : [];
      case 'enemyInLane':
        return one(this.targetFor(enemy, lane));
      case 'enemyLaneAndAdjacent':
        return [lane - 1, lane, lane + 1].filter((l) => l >= 0 && l <= 2).flatMap((l) => one(this.frontMost(enemy, l)));
      case 'enemyFrontRow':
        return this.units(enemy).filter((t) => rowOf(t.slot) === 0);
      case 'enemyLane':
        return this.units(enemy).filter((t) => laneOf(t.slot) === lane);
      case 'allEnemies':
        return this.units(enemy);
      case 'statusEnemies':
        return this.units(enemy).filter((t) => t.burn + t.rot + t.chill > 0);
      case 'rottingEnemies':
        return this.units(enemy).filter((t) => t.rot > 0);
      case 'crustedFriends':
        return this.units(u.side).filter((t) => t !== u && t.crust > 0);
      case 'randomBackEnemy': {
        const all = this.units(enemy);
        const back = all.filter((t) => rowOf(t.slot) === 1);
        const pool = back.length > 0 ? back : all;
        return pool.length > 0 ? [this.rng.pick(pool)] : [];
      }
      case 'highestAttackEnemy': {
        const all = this.units(enemy);
        if (all.length === 0) return [];
        const top = Math.max(...all.map((t) => t.attack));
        return [this.rng.pick(all.filter((t) => t.attack === top))];
      }
      case 'nearestEnemyLanes': {
        const lanes = [0, 1, 2].sort((x, y) => Math.abs(x - lane) - Math.abs(y - lane) || x - y).slice(0, amount);
        return lanes.flatMap((l) => one(this.plates[enemy][slotAt(l, 0)]));
      }
      case 'attacker':
        return ctx.source && ctx.source.side !== u.side && this.onPlate(ctx.source) ? [ctx.source] : [];
      case 'adjacentFriends':
        return this.adjacent(u);
      case 'friendAhead':
        return rowOf(u.slot) === 1 ? one(this.plates[u.side][lane]) : [];
      case 'friendBehind':
        return rowOf(u.slot) === 0 ? one(this.plates[u.side][slotAt(lane, 1)]) : [];
      case 'friendAheadOrSelf':
        return rowOf(u.slot) === 1 && this.plates[u.side][lane] ? [this.plates[u.side][lane]!] : one(this.onPlate(u) ? u : null);
      case 'aheadElseAdjacent':
        return rowOf(u.slot) === 1 ? one(this.plates[u.side][lane]) : this.adjacent(u);
      case 'laneFriends':
        return [u, this.plates[u.side][slotAt(lane, 1 - rowOf(u.slot))]].filter((t): t is BattleUnit => !!t && this.onPlate(t));
      case 'frontRowFriends':
        return this.units(u.side).filter((t) => rowOf(t.slot) === 0);
      case 'allFriends':
        return this.units(u.side);
      case 'randomFriends':
        return this.rng.sample(this.units(u.side).filter((t) => t !== u), ab.count ?? 1);
      case 'level3Friends':
        return this.units(u.side).filter((t) => t !== u && !t.token && t.level === 3);
      case 'lowestHpFriend': {
        const all = this.units(u.side);
        all.sort((x, y) => x.hp - y.hp || x.slot - y.slot);
        return one(all[0]);
      }
      case 'summoned':
        return one(ctx.summoned && this.onPlate(ctx.summoned) ? ctx.summoned : null);
      case 'thatFriend':
        return one(ctx.friend && this.onPlate(ctx.friend) ? ctx.friend : null);
    }
  }

  // ---- primitives ----

  /**
   * One damage instance on a food: Tupperware may block it, Crust blocks damage point for point (all of it, while
   * the Crust lasts), the rest comes off HP.
   * `reaction` marks damage dealt by an on-hit ability: it still lands, but isn't a "hit" itself, so two
   * retaliating foods (Bacon, Durian) can't set each other off forever.
   */
  private hit(target: BattleUnit, amount: number, source?: BattleUnit, ignoreCrust = false, reaction = false) {
    if (amount <= 0 || !this.onPlate(target)) return;
    const foe = source && source.side !== target.side ? source : undefined;
    if (foe && target.burn > 0 && this.bonus[foe.side].flare) amount += 2; // Spicy x8
    if (foe && target.chill > 0) amount += this.chillBite(foe.side); // cooked Ice Cream
    if (target.item === 'tupperware' && !target.tupperwareUsed) {
      target.tupperwareUsed = true;
      this.mark(target, 'blocked');
      return;
    }
    let rest = amount;
    if (!ignoreCrust) {
      const absorbed = Math.min(target.crust, amount);
      target.crust -= absorbed;
      rest -= absorbed;
      if (absorbed > 0) this.mark(target, 'crust', -absorbed);
      if (absorbed > 0 && target.crust === 0) {
        this.later.push({ unit: target, trigger: 'crustBreak', ctx: { source: foe } });
        for (const f of this.units(target.side)) this.later.push({ unit: f, trigger: 'plateCrustBreak', ctx: { source: foe, friend: target } });
      }
      if (absorbed > 0 && foe && !reaction) {
        if (this.bonus[target.side].thorns) this.hit(foe, absorbed, target, false, true); // Salty x8
        for (const f of [target, ...this.adjacent(target)]) this.later.push({ unit: f, trigger: 'crustBlock', ctx: { source: foe } });
      }
    }
    if (rest > 0) {
      target.hp -= rest;
      this.mark(target, 'hit', rest);
    }
    if (reaction) return;
    target.hitsTaken++;
    this.queue.push({ unit: target, source });
  }

  /**
   * Gaining HP, from a heal or a buff alike (there is no max HP): soothe auras add 1 each, a basting Wagyu doubles it,
   * Rot halves it, and adjacent friends notice (friendHealed).
   */
  private gainHp(u: BattleUnit, amount: number): number {
    if (amount <= 0) return 0;
    if (u.rot > 0) amount = Math.floor(amount / 2);
    u.hp += amount;
    if (amount > 0) {
      // Modifiers come after, each a buff of its own from the food that gives it (see resolve).
      for (const cake of this.units(u.side).filter((f) => unitDef(f.defId).aura === 'soothe')) {
        const extra = u.rot > 0 ? Math.floor(this.levelValue(cake) / 2) : this.levelValue(cake);
        if (extra > 0) this.later.push({ unit: u, bonus: { from: cake, hp: extra } });
      }
      const wagyu = this.bastedBy(u);
      if (wagyu) this.later.push({ unit: u, bonus: { from: wagyu, hp: amount } });
    }
    return amount;
  }

  private addStatus(u: BattleUnit, status: 'burn' | 'rot' | 'chill', amount: number) {
    if (amount <= 0 || !this.onPlate(u)) return;
    u[status] += amount;
    this.mark(u, status, amount);
  }

  private cleanse(u: BattleUnit, amount: number) {
    const b = Math.min(u.burn, amount);
    const r = Math.min(u.rot, amount);
    if (b + r === 0) return;
    u.burn -= b;
    u.rot -= r;
    this.mark(u, 'cleanse', b + r);
  }

  private summon(side: Side, near: number, defId: string, attack: number, hp: number, flavor: Flavor): BattleUnit | null {
    const free = [...Array(PLATE_SIZE).keys()]
      .filter((s) => !this.plates[side][s])
      .sort((x, y) => this.distance(near, x) - this.distance(near, y) || x - y);
    if (free.length === 0) return null;
    const bonus = this.bonus[side].summonBonus;
    const unit = this.blank(side, free[0], defId, attack + bonus, hp + bonus);
    unit.flavor = flavor;
    unit.flavors = [flavor];
    this.plates[side][unit.slot] = unit;
    this.mark(unit, 'summon');
    for (const friend of this.units(side)) {
      if (friend !== unit) this.later.push({ unit: friend, trigger: 'friendSummoned', ctx: { summoned: unit } });
    }
    return unit;
  }

  private buff(u: BattleUnit, attack: number, hp: number) {
    u.attack += attack;
    const gained = this.gainHp(u, hp);
    if (attack === 0 && gained === 0) return;
    this.mark(u, 'buff', attack, gained);
    if (gained > 0) for (const f of this.adjacent(u)) this.later.push({ unit: f, trigger: 'friendHealed', ctx: { friend: u } });
  }

  private debuff(u: BattleUnit, attack: number) {
    u.attack = Math.max(1, u.attack - attack);
    this.mark(u, 'debuff', attack);
  }

  /** Adds Crust (doubled next to a basting Wagyu). */
  private giveCrust(u: BattleUnit, amount: number) {
    u.crust += amount;
    this.mark(u, 'crust', amount);
    const wagyu = this.bastedBy(u);
    if (wagyu && amount > 0) this.later.push({ unit: u, bonus: { from: wagyu, crust: amount } });
  }

  // ---- queries ----

  /** Who an attack down `lane` hits: the front-most enemy there, else the nearest lane with food (middle on ties). */
  private targetFor(side: Side, lane: number): BattleUnit | null {
    const own = this.frontMost(side, lane);
    if (own) return own;
    const lanes = [0, 1, 2].filter((l) => this.frontMost(side, l));
    if (lanes.length === 0) return null;
    const best = Math.min(...lanes.map((l) => Math.abs(l - lane)));
    let nearest = lanes.filter((l) => Math.abs(l - lane) === best);
    if (nearest.includes(1)) nearest = [1];
    return this.frontMost(side, this.rng.pick(nearest));
  }

  private frontMost(side: Side, lane: number): BattleUnit | null {
    return this.plates[side][slotAt(lane, 0)] ?? this.plates[side][slotAt(lane, 1)];
  }

  private adjacent(u: BattleUnit): BattleUnit[] {
    return this.units(u.side).filter((o) => o !== u && isAdjacent(o.slot, u.slot));
  }

  private distance(a: number, b: number) {
    return Math.abs(laneOf(a) - laneOf(b)) + Math.abs(rowOf(a) - rowOf(b));
  }

  private units(side: Side): BattleUnit[] {
    return this.plates[side].filter((u): u is BattleUnit => u !== null);
  }

  private isEmpty(side: Side) {
    return this.units(side).length === 0;
  }

  private onPlate(u: BattleUnit) {
    return this.plates[u.side][u.slot] === u;
  }

  private hasFlavor(u: BattleUnit, flavor: Flavor) {
    return u.allFlavors || u.flavors.includes(flavor);
  }

  /** Non-token friends of a flavor (every flavor a food has counts), optionally leaving one out. */
  private countFlavor(side: Side, flavor: Flavor, except?: BattleUnit) {
    return this.units(side).filter((u) => !u.token && u !== except && this.hasFlavor(u, flavor)).length;
  }

  private distinctFlavors(side: Side) {
    if (this.units(side).some((f) => f.allFlavors && !f.token)) return FLAVORS.length;
    return new Set(this.units(side).filter((f) => !f.token).flatMap((f) => f.flavors)).size;
  }

  private spendTrigger() {
    return this.triggerBudget-- > 0;
  }

  private name(u: BattleUnit) {
    const def = unitDef(u.defId);
    return `${u.side === 1 ? 'enemy ' : ''}${u.level === 3 ? def.cookedName : def.name}`;
  }

  // ---- frames ----

  private mark(u: BattleUnit, kind: MarkKind, amount?: number, hp?: number) {
    this.marks.push({ side: u.side, slot: u.slot, kind, amount, ...(hp ? { hp } : {}) });
  }

  private snap(text: string) {
    const view = (u: BattleUnit | null): UnitView | null =>
      u && {
        uid: u.uid,
        defId: u.defId,
        level: u.level,
        flavor: u.flavor,
        flavors: u.allFlavors ? [...FLAVORS] : u.flavors,
        attack: u.attack,
        hp: Math.max(0, u.hp),
        crust: u.crust,
        token: u.token,
        item: u.item,
        burn: u.burn,
        rot: u.rot,
        chill: u.chill,
        uses: [...abilitiesOf(unitDef(u.defId), u.level), ...u.extra].flatMap((ab, i): [number, number][] => {
          const all = ab.max ?? (ab.limitToAmount ? this.amountOf(u, ab, i) : 0);
          return all ? [[Math.max(0, all - (u.fired[i] ?? 0)), all]] : [];
        }),
      };
    this.frames.push({
      plates: [this.plates[0].map(view), this.plates[1].map(view)],
      round: this.round,
      text,
      marks: this.marks,
    });
    this.marks = [];
  }
}
