import './style.css';
import { type Action, applyAction, canonical, plateHash, replayDay } from '../sim/actions';
import { GAME_VERSION } from '../sim/version';
import { NAME_FIRST, NAME_SECOND, nameProblem, randomName, tidyName } from '../names';
import * as api from './api';
import type { ServerRun } from './api';
import { type BattleFrame, type BattleResult, type Mark, type UnitView, flavorTier, simulateBattle } from '../sim/battle';
import { RARITY_BY_TIER, UNITS, abilitiesOf, daysOf, flavorTally, flavorsOf, isUnit, itemDef, itemRarity, linkedSlots, rarityOf, unitDef } from '../sim/data';
import {
  type ActionResult,
  type Growth,
  type LevelUp,
  COURSES_TO_WIN,
  type Loc,
  type Offer,
  type OfferSource,
  type RunState,
  START_LIVES,
  turnConfig,
  type SpecialOffer,
  clonePlate,
  endDay,
  finishBattle,
  getOffer,
  getUnit,
  interestCap,
  interestMult,
  interestOn,
  INCOME,
  INTEREST_STEP,
  isOver,
  marketOdds,
  migrateRun,
  newRun,
  nextSeed,
  offerCost,
  rerollCost,
  sellPrice,
  serveBlocker,
  specialCost,
} from '../sim/run';
import { type AttackPattern, FLAVORS, type Tier, type Flavor, type HeldItemId, type Plate, type UnitInstance, laneOf, levelOf, rowOf } from '../sim/types';
import kitchenUrl from '../../art/scenes/kitchen.png';
import { itemArt, propArt, specialArt, unitArt } from './art';
import { gemIcon, gridUrl, pix, statBadge } from './icons';
import PROPS from './kitchen-props.json';
import { pickOpponent, saveGhost } from './ghosts';
import LAYOUT from './kitchen-layout.json';
import BATTLE from './battle-layout.json';
import battleUrl from '../../art/scenes/battle.png';
import { type DropFx, EMPTY, WIPE_MS, animate, burst, capture, fling, floater, orb, play, stagePos, wipe } from './motion';
import { type Sfx, isMuted, sfx, toggleMute, unlockAudio } from './sound';

/** What's selected or being dragged: an offer, an owned food, the special cubby's offer, or a choice from an open pack. */
type Selection = { kind: 'offer'; src: OfferSource } | { kind: 'unit'; loc: Loc } | { kind: 'special' } | { kind: 'pick'; index: number } | null;

interface PendingBattle {
  result: BattleResult;
  opponent: string;
  /** The opponent's run so far, shown on its plaque (older saved battles lack it). */
  foe?: { wins: number; lives: number };
  /** Yours when the battle started. */
  me?: { wins: number; lives: number };
  /** Tells battles apart in animation keys (uids restart every battle). */
  id?: number;
  /** Served online: the server's run after the battle, which the kitchen continues from. */
  next?: ServerRun;
}

interface App {
  run: RunState;
  runId: string;
  battle?: PendingBattle;
  selected: Selection;
  message: string;
  seasoning?: { src: OfferSource; loc: Loc };
  frame: number;
  speed: number;
  /** Battle: the food being held down to read it (pauses playback). */
  inspect?: { side: 0 | 1; slot: number };
  /** Bumped on every restock so the new dishes animate in even where the old one had the same food. */
  marketGen: number;
  /** Today: the run as it stood this morning and every action since, which the server replays at Serve. */
  day?: { morning: RunState; log: Action[] };
  /** Set when this run lives on the server (runId is then the server's id). */
  server?: { runId: string };
  /** The chef-name card is open. */
  naming?: Naming;
}

/** The chef-name card: a name from the two word lists, or a typed one (which wins when it isn't empty). */
interface Naming {
  first: string;
  second: string;
  custom: string;
  error?: string;
  busy?: boolean;
  /** Changing the name of a chef who already has one (else: signing up). */
  renaming?: boolean;
}

const SAVE_KEY = 'buffetbattle.run';
/** Pixel icon for each held item, shown in the corner of the food holding it. */
const HELD_ICON = { saltShaker: 'heldSaltShaker', toothpick: 'heldToothpick', tupperware: 'heldTupperware', bouillon: 'heldBouillon', chopsticks: 'heldChopsticks', hotSauce: 'heldHotSauce' } as const;

/** A food's attack pattern, if it isn't a plain single-target attack. */
const patternOf = (defId: string): AttackPattern | null => {
  const p = unitDef(defId).attackPattern;
  return p && p !== 'single' ? p : null;
};

/** A flavor as its pixel icon and name. */
const flavorTag = (f: Flavor) => `<span class="fl-tag fl-${f}">${pix(f)}${f}</span>`;

// ---------- tooltips and keyword notes ----------
// Anything with data-tip shows a pixel text box on hover. The attribute holds HTML (escaped by tip()).
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tip = (html: string) => `data-tip="${escAttr(html)}"`;
/** A tooltip with a title line and a body. */
const tipBox = (title: string, body: string) => tip(`<div class="tip-title">${title}</div>${body}${glossary(body, title)}`);

/** Keywords explained at the bottom of any card or tooltip whose text mentions them. */
const GLOSSARY: { re: RegExp; icon: () => string; name: string; text: string }[] = [
  { re: /\bBurn(s|ing|ed)?\b/i, icon: () => pix('flame'), name: 'Burn', text: 'deals its stacks as damage at the end of each turn, then drops by 1. Stacks up to 4.' },
  { re: /\bRot(s|ting)?\b/i, icon: () => pix('rotBlob'), name: 'Rot', text: 'deals its stacks as damage at the end of each turn and never fades. Stacks up to 3. HP gains on a Rotting food are halved.' },
  { re: /\bChill(s|ed)?\b/i, icon: () => pix('snowflake'), name: 'Chill', text: 'the food skips its next attack for each stack.' },
  { re: /\bCrust\b/i, icon: () => pix('shield'), name: 'Crust', text: 'blocks damage before HP, point for point. Gone after the battle.' },
  { re: /\bcleans/i, icon: () => '', name: 'Cleanse', text: 'removes Burn and Rot.' },
  { re: /\bsell value\b/i, icon: () => pix('coin'), name: 'Sell value', text: 'extra gold when you sell it, on top of half its price.' },
  { re: /\binterest\b/i, icon: () => pix('coin'), name: 'Interest', text: `+1 gold at the start of each day for every ${INTEREST_STEP} gold you kept, up to your cap.` },
  { re: /\bfridge\b/i, icon: () => '', name: 'Fridge', text: 'foods you bought into the fridge sit out battles but still count for merging.' },
  { re: /\brefill/i, icon: () => '', name: 'Refill', text: 'new foods and an item in the buffet. Each refill in a day costs 1 more.' },
];

/** `topic`: what the card is about; a keyword that names it isn't explained again. */
function glossary(html: string, topic = ''): string {
  const text = html.replace(/<[^>]*>/g, ' ');
  const about = topic.replace(/<[^>]*>/g, ' ');
  const hits = GLOSSARY.filter((g) => g.re.test(text) && !g.re.test(about));
  if (hits.length === 0) return '';
  return `<div class="gloss">${hits.map((g) => `<p>${g.icon()}<b>${g.name}:</b> ${g.text}</p>`).join('')}</div>`;
}
const root = document.getElementById('app')!;
let timer: number | undefined;

const app: App = loadApp() ?? freshApp();

function freshApp(): App {
  const seed = (Date.now() ^ (Math.random() * 2 ** 32)) >>> 0;
  const run = newRun(seed);
  return {
    run,
    day: startOfDay(run),
    runId: seed.toString(36),
    selected: null,
    message: 'Drag a dish from the buffet onto your plate. Front row (right) attacks; back row (left) supports.',
    frame: 0,
    speed: 1,
    marketGen: 0,
  };
}

function loadApp(): App | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
    if (!saved) return null;
    if (saved.run?.mode === 'recipes') return null; // the recipes prototype was shelved: start fresh
    // Foods removed from the game since this was saved are dropped from the plate, fridge and buffet; a battle
    // in progress that involved one is skipped (its result still counts once you continue).
    const run: RunState = migrateRun(saved.run);
    run.overflow = run.overflow.map((u) => (u && isUnit(u.defId) ? u : null));
    if (run.special && 'defId' in run.special && !isUnit(run.special.defId)) run.special = null;
    if (run.pack?.kind === 'farm' && run.pack.units.some((id) => !isUnit(id))) run.pack = null;
    run.plate = run.plate.map((u) => (u && isUnit(u.defId) ? u : null));
    run.market = run.market.map((o) => (o?.kind === 'unit' && !isUnit(o.defId) ? null : o));
    run.fridge = run.fridge.map((e) => (e?.kind === 'unit' && !isUnit(e.unit.defId)) || (e?.kind === 'offer' && e.offer.kind === 'unit' && !isUnit(e.offer.defId)) ? null : e);
    const battle: PendingBattle | undefined = saved.battle;
    if (battle && battle.result.frames.some((f) => f.plates.some((p) => p.some((u) => u && !isUnit(u.defId))))) {
      finishBattle(run, battle.result.outcome);
      saved.battle = undefined;
      saved.day = startOfDay(run);
    }
    return { ...saved, run, selected: null, message: 'Welcome back, chef.', frame: 0, speed: 1, marketGen: 0 };
  } catch {
    return null;
  }
}

function save() {
  try {
    const { run, runId, battle, day, server } = app;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ run, runId, battle, day, server }));
  } catch {
    // Storage unavailable: progress just isn't kept across reloads.
  }
}

// ---------- actions ----------

function startOfDay(run: RunState): App['day'] {
  return { morning: structuredClone({ ...run, growth: [] }), log: [] };
}

/** Every change to the run goes through here: applied by run.ts, and logged for the day when it worked. */
function dispatch(a: Action): ActionResult {
  const result = applyAction(app.run, a);
  if (result.ok) app.day?.log.push(a);
  return result;
}

// ---------- online ----------

/** At start-up: a new chef picks a name; a returning one picks up their run from the server. */
async function connect() {
  if (!api.online()) return;
  if (!api.savedPlayer()) return openNaming(false);
  await syncRun(false);
}

/**
 * Lines the kitchen up with the server's run. The run on this device is kept when it is the same run on the same
 * day (it holds today's moves); otherwise, or with `force`, the server's morning replaces it. No active run on the
 * server: a new one, unless this device is showing that run's end.
 */
async function syncRun(force: boolean) {
  try {
    const run = await api.currentRun();
    if (!run) {
      if (app.server && isOver(app.run) && !force) return;
      return adoptRun(await api.startRun(), 'A new run, saved online. Drag a dish from the buffet onto your plate.');
    }
    const mine = app.server?.runId === run.id;
    const sameDay = app.battle ? run.day === app.run.turn + 1 : run.day === app.run.turn;
    if (mine && sameDay && !force) return;
    adoptRun(run, mine ? 'Picked up where the server left off.' : 'Welcome back, chef. Your run is saved online.');
  } catch (e) {
    app.message = `${pix('warn')} ${e instanceof api.Offline ? "Can't reach the kitchen server" : (e as Error).message}. Playing offline for now.`;
    app.server = undefined;
    render();
  }
}

/** The kitchen switches to a run from the server, at the start of its day. */
function adoptRun(run: api.ServerRun, message: string) {
  app.run = migrateRun({ ...run.state, growth: [] });
  app.runId = run.id;
  app.server = { runId: run.id };
  app.day = startOfDay(app.run);
  app.battle = undefined;
  app.selected = null;
  app.message = message;
  forceWipe = true;
  save();
  render();
}

async function newServerRun() {
  try {
    adoptRun(await api.startRun(), 'A new run. Drag a dish from the buffet onto your plate.');
  } catch (e) {
    app.message = `${pix('warn')} ${e instanceof api.Offline ? "Can't reach the kitchen server" : (e as Error).message}. Try again in a moment.`;
    render();
  }
}

const splitName = (name: string) => {
  const [first, second] = name.split(' ');
  return { first, second };
};

function openNaming(renaming: boolean) {
  const current = api.savedPlayer()?.name;
  const listed = current && NAME_FIRST.includes(splitName(current).first as never) && NAME_SECOND.includes(splitName(current).second as never);
  app.naming = { ...splitName(listed ? current : randomName()), custom: current && !listed ? current : '', renaming };
  render();
}

/** The name the card would use: the typed one if any, else the two picked words. */
const chosenName = (n: Naming) => (tidyName(n.custom) ? tidyName(n.custom) : `${n.first} ${n.second}`);

async function submitName() {
  const n = app.naming;
  if (!n || n.busy) return;
  const name = chosenName(n);
  const problem = nameProblem(name);
  if (problem) {
    n.error = problem;
    sfx('deny');
    return render();
  }
  n.busy = true;
  render();
  try {
    if (n.renaming) {
      await api.rename(name);
      app.naming = undefined;
      app.message = `You're now ${name}.`;
      sfx('select');
      return render();
    }
    await api.signUp(name);
    app.naming = undefined;
    sfx('bell');
    await syncRun(false);
  } catch (e) {
    n.busy = false;
    n.error = e instanceof api.Offline ? "Can't reach the kitchen server. Try again, or play offline." : (e as Error).message;
    sfx('deny');
    render();
  }
}

/** In development, a day that doesn't replay to the plate being served means some change skipped dispatch. */
function checkReplay(plate: Plate) {
  if (!import.meta.env.DEV || !app.day) return;
  const replay = replayDay(app.day.morning, app.day.log);
  if (!replay.ok) console.warn('Day replay refused at action', replay.index, replay.error, app.day);
  else if (plateHash(replay.plate) !== plateHash(plate)) console.warn('Day replay gives a different plate', replay.plate, plate);
}

function report(result: ActionResult, sound?: Sfx) {
  if (!result.ok) sfx('deny');
  else if (result.levelUp) sfx('merge');
  else if (sound) sfx(sound);
  app.message = result.ok ? (result.message ?? '') : `${pix('warn')} ${result.error}`;
  // Growth with nothing else to say (Butter, Bone Broth...): name it, for good.
  if (result.ok && !result.message && app.run.growth.length) app.message = `For good: ${growthSummary(app.run.growth)}.`;
  if (result.ok) app.selected = null;
  save();
  render();
  if (result.ok && result.levelUp) celebrate(result.levelUp);
  playGrowth(result.ok && result.levelUp ? 900 : 0);
}

/** "Potato +2/+2, Egg +1/+1 (Bean Sprout)": permanent gains in a line, for the toast. */
function growthSummary(events: Growth[]): string {
  const byFood = new Map<number, { name: string; attack: number; hp: number; sell: number }>();
  for (const g of events) {
    const u = findUnit(g.uid);
    if (!u) continue;
    const cur = byFood.get(g.uid) ?? { name: unitDef(u.defId).name, attack: 0, hp: 0, sell: 0 };
    cur.attack += g.attack;
    cur.hp += g.hp;
    cur.sell += g.sell ?? 0;
    byFood.set(g.uid, cur);
  }
  return [...byFood.values()]
    .map((f) => `${f.name} ${[f.attack || f.hp ? `+${f.attack}/+${f.hp}` : '', f.sell ? `+${f.sell}g` : ''].filter(Boolean).join(' ')}`)
    .join(', ');
}

/** A food the player owns, wherever it is (plate, fridge, counter tray). */
function findUnit(uid: number): UnitInstance | null {
  const { run } = app;
  return (
    run.plate.find((u) => u?.uid === uid) ??
    run.overflow.find((u) => u?.uid === uid) ??
    run.fridge.map((e) => (e?.kind === 'unit' ? e.unit : null)).find((u) => u?.uid === uid) ??
    null
  );
}

/**
 * Plays back the permanent gains the sim logged (run.growth), one food after another, as a small visual only: a line
 * from the food that caused it, a few sparkles, the food glowing and hopping, and its stat badges popping. Returns how
 * long it all takes, in ms. The log is cleared once shown.
 */
function playGrowth(delay = 0): number {
  const events = app.run.growth;
  if (events.length === 0) return 0;
  app.run.growth = [];
  save();
  const stage = root.querySelector<HTMLElement>('.stage');
  if (!stage) return 0;
  // One pop per food and cause, in the order they happened.
  const groups = new Map<string, Growth>();
  for (const g of events) {
    const k = `${g.uid}:${g.from ?? ''}:${g.source}`;
    const cur = groups.get(k);
    if (cur) {
      cur.attack += g.attack;
      cur.hp += g.hp;
      cur.sell = (cur.sell ?? 0) + (g.sell ?? 0) || undefined;
    } else groups.set(k, { ...g });
  }
  let i = 0;
  for (const g of groups.values()) {
    const el = root.querySelector<HTMLElement>(`[data-k="u:${g.uid}"]`);
    if (!el) continue; // sold, or not on screen
    const t = delay + i * 280;
    const at = stagePos(root, el);
    const src = g.from !== undefined ? root.querySelector<HTMLElement>(`[data-k="u:${g.from}"]`) : null;
    if (src) orb(stage, stagePos(root, src), at, 'k-buff', { delay: t, ms: 260 });
    burst(stage, [at[0], at[1] - 8], g.attack || g.hp ? 'star' : 'coin-spark', { delay: t + 160, count: 4, spread: 12 });
    sfx('grow', t + 160);
    setTimeout(() => {
      const now = root.querySelector<HTMLElement>(`[data-k="u:${g.uid}"]`);
      if (!now) return;
      now.classList.add('growing');
      now.querySelectorAll('.stat-badge').forEach((b) => animate(b, 'levelup'));
      setTimeout(() => now.classList.remove('growing'), 700);
    }, t + 160);
    i++;
  }
  return i === 0 ? 0 : delay + i * 280 + 700;
}

/**
 * Level-up: a burst of gold rays and a ring around the food, a "LEVEL 2!" (or "COOKED!") banner, a jolt, and the
 * bonus dish flying from the food into its cubby in the buffet.
 */
function celebrate(lv: LevelUp) {
  const stage = root.querySelector<HTMLElement>('.stage');
  const food = root.querySelector<HTMLElement>(`[data-k="u:${lv.uid}"]`);
  if (!stage || !food) return;
  const [x, y] = stagePos(root, food);
  const cooked = lv.level === 3;
  const delay = 180; // after the merge lands
  sfx(cooked ? 'cook' : 'levelUp', delay);
  burst(stage, [x, y - 4], 'ray', { delay, count: cooked ? 18 : 12, spread: cooked ? 34 : 26 });
  burst(stage, [x, y - 4], 'star', { delay: delay + 120, count: 6, spread: 18 });
  for (const [i, cls] of ['lvl-ring', 'lvl-ring late'].entries()) {
    const ring = document.createElement('div');
    ring.className = cls;
    ring.style.left = `${x}px`;
    ring.style.top = `${y - 4}px`;
    stage.appendChild(ring);
    ring.animate(
      [{ transform: 'translate(-50%, -50%) scale(0.2)', opacity: 1 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.6 }, { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 0 }],
      { duration: 520, delay: delay + i * 140, easing: 'steps(7, jump-end)', fill: 'both' },
    ).finished.then(() => ring.remove(), () => ring.remove());
  }
  const banner = document.createElement('div');
  banner.className = `lvl-banner ${cooked ? 'cooked' : ''}`;
  banner.textContent = cooked ? 'COOKED!' : `LEVEL ${lv.level}!`;
  banner.style.left = `${x}px`;
  banner.style.top = `${y - 34}px`;
  stage.appendChild(banner);
  banner.animate(
    [
      { transform: 'translate(-50%, 0) scale(2.6)', opacity: 0 },
      { transform: 'translate(-50%, 0) scale(0.9)', opacity: 1, offset: 0.14 },
      { transform: 'translate(-50%, 0) scale(1.1)', offset: 0.22 },
      { transform: 'translate(-50%, 0) scale(1)', offset: 0.3 },
      { transform: 'translate(-50%, -4px) scale(1)', opacity: 1, offset: 0.8 },
      { transform: 'translate(-50%, -12px) scale(1)', opacity: 0 },
    ],
    { duration: 1500, delay, easing: 'steps(14, jump-end)', fill: 'both' },
  ).finished.then(() => banner.remove(), () => banner.remove());
  root.querySelector('.stage-wrap')?.animate(
    [{ transform: 'translate(0, 0)' }, { transform: 'translate(-4px, 2px)' }, { transform: 'translate(4px, -2px)' }, { transform: 'translate(-2px, 0)' }, { transform: 'translate(0, 0)' }],
    { duration: 240, delay, easing: 'steps(4, jump-end)' },
  );
  if (cooked) {
    for (let i = 0; i < 24; i++) {
      fling(stage, [x, y - 10], [x + (Math.random() - 0.5) * 140, y + 10 + Math.random() * 60], `confetti c${i % 4}`, { delay: delay + Math.random() * 150, ms: 800 + Math.random() * 400, arc: 30 + Math.random() * 30 });
    }
  }
  // The bonus dish flies out of the food into the buffet.
  if (lv.bonusIndex !== null) {
    const dish = root.querySelector<HTMLElement>(`[data-drag="offer:market:${lv.bonusIndex}"]`);
    if (dish) {
      dish.getAnimations().forEach((a) => a.cancel());
      const [dx, dy] = stagePos(root, dish);
      const from = { x: x - dx, y: y - dy };
      dish.animate(
        [
          { transform: `translate(${from.x}px, ${from.y}px) scale(0.2)`, opacity: 0 },
          { transform: `translate(${from.x}px, ${from.y}px) scale(0.6)`, opacity: 1, offset: 0.15 },
          { transform: `translate(${from.x * 0.5}px, ${from.y * 0.5 - 40}px) scale(1.1)`, offset: 0.55 },
          { transform: 'translate(0, 0) scale(1.15)', offset: 0.85 },
          { transform: 'translate(0, 0) scale(1)' },
        ],
        { duration: 700, delay: delay + 300, easing: 'steps(14, jump-end)', fill: 'backwards' },
      );
      const [cx, cy] = [dx, dy];
      burst(stage, [cx, cy], 'star', { delay: delay + 1000, count: 8, spread: 16 });
      floater(stage, cx, cy - 34, 'bonus!', 'info', 1, delay + 1000);
    }
  }
}

function sameSrc(a: OfferSource, b: OfferSource) {
  return a.area === b.area && a.index === b.index;
}

// Clicking only ever selects (to read it in the cookbook). Every action is a drag and drop.

function onOffer(src: OfferSource) {
  const same = app.selected?.kind === 'offer' && sameSrc(app.selected.src, src);
  app.selected = same ? null : { kind: 'offer', src };
  if (!same) sfx('page'); // the cookbook turns to it
  const offer = getOffer(app.run, src);
  app.message = same || !offer ? '' : offer.kind === 'unit'
    ? 'Drag it onto your plate or into the fridge to buy it, or onto a copy to merge.'
    : itemDef(offer.itemId).anywhere ? `Drag the ${itemDef(offer.itemId).name} onto any food on your plate.` : 'Drag it onto one of your foods.';
  render();
}

/** Selects the special cubby's offer (or the free consumable waiting there) to read about it. */
function onSpecial() {
  const s = app.run.special;
  if (s?.kind === 'freeItem' || s?.kind === 'mythic') return onOffer({ area: 'special', index: 0 });
  const same = app.selected?.kind === 'special';
  app.selected = same || !s ? null : { kind: 'special' };
  app.message = same || !s ? '' : s.kind === 'premium' ? 'Drag it onto the refill sign or the counter tray.' : 'Drag it onto the counter tray to open it.';
  render();
}

function onPick(index: number) {
  const same = app.selected?.kind === 'pick' && app.selected.index === index;
  app.selected = same ? null : { kind: 'pick', index };
  app.message = same ? '' : app.run.pack?.kind === 'spice' ? 'Drag it onto one of your foods to use it, free.' : 'Drag it onto your plate or into the fridge.';
  render();
}

function onClickSlot(loc: Loc) {
  const { run } = app;
  const sel = app.selected;
  const same = sel?.kind === 'unit' && sel.loc.area === loc.area && sel.loc.index === loc.index;
  if (getUnit(run, loc) && !same) {
    sfx('page');
    app.selected = { kind: 'unit', loc };
    app.message = 'Drag it to move, swap or merge, or into the scrap bin to sell.';
  } else if (loc.area === 'fridge' && run.fridge[loc.index]?.kind === 'offer') {
    return onOffer({ area: 'fridge', index: loc.index });
  } else {
    app.selected = null;
  }
  render();
}

/** A drop: the dragged thing (app.selected) acts on the slot it was dropped on. */
function onDropSlot(loc: Loc) {
  const { run } = app;
  const sel = app.selected;

  if (sel?.kind === 'offer') {
    const offer = getOffer(run, sel.src);
    if (!offer) return;
    if (offer.kind === 'unit') {
      const into = getUnit(run, loc);
      // Into the fridge: you buy it, and it waits there (the fridge only holds foods you own).
      if (loc.area === 'fridge' && !into) {
        const result = dispatch({ t: 'buy', src: sel.src, to: loc });
        if (result.ok) sfx('freeze', 120);
        return report(result, 'buy');
      }
      return report(dispatch({ t: 'buy', src: sel.src, to: loc }), into?.defId === offer.defId ? 'merge' : 'buy');
    }
    if (offer.itemId === 'seasoning') {
      if (!getUnit(run, loc)) return report({ ok: false, error: 'Use items on a unit.' });
      app.seasoning = { src: sel.src, loc };
      return render();
    }
    return report(dispatch({ t: 'item', src: sel.src, at: loc }), 'item');
  }

  if (sel?.kind === 'unit') {
    if (sel.loc.area === loc.area && sel.loc.index === loc.index) {
      app.selected = null;
      return render();
    }
    const moving = getUnit(run, sel.loc);
    const into = getUnit(run, loc);
    return report(dispatch({ t: 'move', from: sel.loc, to: loc }), into && into.defId === moving?.defId ? 'merge' : loc.area === 'fridge' ? 'freeze' : 'place');
  }

  if (sel?.kind === 'pick') return pickOnto(sel.index, loc);
  if (sel?.kind === 'special') {
    if (loc.area === 'overflow') return openSpecial(); // a spot on the tray counts as the tray
    return report({ ok: false, error: 'Drag it onto the counter tray to open it.' });
  }
  render();
}

/**
 * A choice dragged out of an open pack onto a slot: a consumable is used on the food there; a food goes onto the
 * plate or into the fridge (or merges). If the second step fails, the pick waits in the special cubby or on the tray.
 */
function pickOnto(index: number, loc: Loc) {
  const { run } = app;
  const pack = run.pack;
  if (!pack) return render();
  if (pack.kind === 'spice') {
    if (!getUnit(run, loc) && !itemDef(pack.items[index]).anywhere) return report({ ok: false, error: 'Drop it onto one of your foods.' });
    const picked = dispatch({ t: 'pick', index });
    if (!picked.ok) return report(picked);
    const name = itemDef(pack.items[index]).name;
    const target = getUnit(run, loc);
    const used = dispatch({ t: 'item', src: { area: 'special', index: 0 }, at: loc });
    if (!used.ok) return report({ ok: true, message: `${used.error} ${name} waits in the special cubby, free.` }, 'place');
    return report({ ...used, message: used.message ?? `${name} on ${target ? unitDef(target.defId).name : 'your plate'}.` }, 'item');
  }
  const spot = run.overflow.findIndex((u) => !u); // where pickPack puts it
  const picked = dispatch({ t: 'pick', index });
  if (!picked.ok || loc.area === 'overflow') return report(picked);
  const moved = dispatch({ t: 'move', from: { area: 'overflow', index: spot }, to: loc });
  const food = unitDef(pack.units[index]).name;
  if (!moved.ok) return report({ ok: true, message: `${moved.error} ${food} waits on the counter tray.` }, 'place');
  return report({ ...moved, message: moved.message ?? `${food}, fresh from the farm.` }, 'place');
}

/** The special cubby's offer, dropped on the counter tray (or a premium restock on the refill sign): buy it. */
function openSpecial() {
  const { run } = app;
  const s = run.special;
  const result = dispatch({ t: 'special' });
  if (result.ok && s?.kind === 'premium') app.marketGen++;
  if (result.ok && (s?.kind === 'spicePack' || s?.kind === 'farmPack')) {
    report({ ok: true, message: 'Pick one: drag it out of the box onto your plate (the rest go back).' }, 'buy');
    return;
  }
  report(result, 'buy');
}

const centerOf = ([x, y, w, h]: Rect): [number, number] => [x + w / 2, y + h / 2];

function sellSelected() {
  if (app.selected?.kind !== 'unit') return;
  const result = dispatch({ t: 'sell', at: app.selected.loc });
  report(result, 'sell');
  if (!result.ok) return;
  for (let i = 0; i < 3; i++) sfx('coin', 120 + i * 70 + 300);
  // Coins hop from the bin into the tip jar.
  const stage = root.querySelector<HTMLElement>('.stage');
  const [bx, by] = centerOf(LAYOUT.bin);
  if (stage) for (let i = 0; i < 3; i++) fling(stage, [bx, by - 20], centerOf(PROPS.tipjar), 'coin', { delay: 120 + i * 70, ms: 320, arc: 18 });
}

function onAction(action: string, el: HTMLElement) {
  const { run } = app;
  switch (action) {
    case 'reroll': {
      const result = dispatch({ t: 'refill' });
      if (result.ok) app.marketGen++;
      return report(result, 'reroll');
    }
    case 'sell':
      return sellSelected();
    case 'serve':
      return ringBell();
    case 'season': {
      const pending = app.seasoning;
      app.seasoning = undefined;
      if (pending) report(dispatch({ t: 'item', src: pending.src, at: pending.loc, flavor: el.dataset.flavor as Flavor }), 'item');
      return;
    }
    case 'cancel-season':
      app.seasoning = undefined;
      return render();
    case 'new-run':
      if (!isOver(run) && !app.battle && !confirm('Abandon this run and start a new one?')) return;
      if (app.server) return void newServerRun();
      Object.assign(app, freshApp(), { battle: undefined });
      forceWipe = true;
      save();
      return render();
    case 'chef':
      if (!app.battle) openNaming(true);
      return;
    case 'name-shuffle':
      if (app.naming) Object.assign(app.naming, splitName(randomName()), { custom: '', error: undefined });
      sfx('select');
      return render();
    case 'name-offline':
      app.naming = undefined;
      app.message = 'Playing offline: your runs stay on this device.';
      return render();
    case 'name-cancel':
      app.naming = undefined;
      return render();
    case 'speed':
      app.speed = app.speed >= 4 ? 1 : app.speed * 2;
      sfx('select');
      return render();
    case 'sound':
      toggleMute();
      return render();
    case 'skip':
      if (app.battle) app.frame = app.battle.result.frames.length - 1;
      return render();
    case 'continue':
      sfx('select');
      return endBattle();
  }
}

let ringing = false;

/** Serve: the bell dings, then the battle starts. */
function ringBell() {
  if (ringing) return;
  if (app.run.plate.every((u) => !u)) {
    sfx('deny');
    app.message = `${pix('warn')} Your plate is empty! Grab something from the buffet first.`;
    return render();
  }
  const blocked = serveBlocker(app.run);
  if (blocked) {
    sfx('deny');
    app.message = `${pix('warn')} ${blocked}`;
    render();
    const tray = root.querySelector('.tray');
    if (tray) animate(tray, 'shake');
    return;
  }
  ringing = true;
  const stage = root.querySelector<HTMLElement>('.stage');
  const bell = root.querySelector('.bell');
  if (bell) animate(bell, 'hop');
  sfx('bell');
  if (stage) floater(stage, LAYOUT.bell[0] + 24, LAYOUT.bell[1] + 2, 'ding!', 'info');
  // End of day: growing foods grow now, in front of you, before the plate goes out. (Online, the day comes back as
  // it was if the server can't take it.)
  const beforeEnd = structuredClone(app.run);
  endDay(app.run);
  const summary = growthSummary(app.run.growth);
  if (summary) {
    app.message = `End of day: ${summary}`;
    render();
  }
  const wait = playGrowth(250);
  setTimeout(async () => {
    await startBattle(beforeEnd);
    ringing = false;
  }, Math.max(300, wait + 250));
}

async function startBattle(beforeEnd: RunState) {
  const { run } = app;
  if (app.battle || run.plate.every((u) => !u)) return;
  const mine = clonePlate(run.plate); // the day was already ended when the bell rang
  checkReplay(mine);
  if (app.server) return serveOnline(mine, beforeEnd);
  saveGhost(app.runId, run.turn, mine, run.courses, run.lives);
  const opponent = pickOpponent(app.runId, run.turn, nextSeed(run), run.courses, run.lives);
  const result = simulateBattle(mine, opponent.plate, nextSeed(run));
  app.battle = { result, opponent: opponent.label, foe: { wins: opponent.wins, lives: opponent.lives }, me: { wins: run.courses, lives: run.lives }, id: Date.now() % 1e9 };
  shownFrame = -1;
  app.selected = null;
  app.frame = 0;
  save();
  render();
}

/**
 * Serve through the server: it replays the day, picks the opponent and fights the battle; the battle is played back
 * here from the plates and the seed. A refused day starts over from this morning; no answer keeps the plate ready.
 */
async function serveOnline(mine: Plate, beforeEnd: RunState) {
  const { run } = app;
  app.message = 'Sending your plate out...';
  render();
  try {
    const res = await api.serveDay(app.server!.runId, { day: run.turn, version: GAME_VERSION, actions: app.day?.log ?? [], plateHash: plateHash(mine) });
    // Keep the run's random numbers in step with the server, which drew the opponent's and the battle's seeds.
    nextSeed(run);
    nextSeed(run);
    const result = simulateBattle(mine, res.opponent.plate, res.seed);
    if (result.outcome !== res.outcome) console.warn('This battle played back differently from the server', res);
    const foe = { wins: res.opponent.wins, lives: res.opponent.lives };
    app.battle = { result, opponent: res.opponent.label, foe, me: { wins: run.courses, lives: run.lives }, id: Date.now() % 1e9, next: res.run };
    shownFrame = -1;
    app.selected = null;
    app.frame = 0;
    save();
    render();
  } catch (e) {
    app.run = beforeEnd;
    if (e instanceof api.Refused && e.reason === 'version') app.message = `${pix('warn')} The game was updated. Reload the page to carry on.`;
    else if (e instanceof api.Refused) {
      await syncRun(true);
      app.message = `${pix('warn')} The server couldn't follow your day (${e.message}), so it starts over from this morning.`;
    } else app.message = `${pix('warn')} Can't reach the kitchen server. Ring the bell to try again.`;
    sfx('deny');
    save();
    render();
  }
}

function endBattle() {
  const battle = app.battle;
  if (!battle) return;
  finishBattle(app.run, battle.result.outcome);
  // Online, the server's run is the real one: they should match, but if not the kitchen carries on from the server's.
  if (battle.next && canonical({ ...app.run, growth: [] }) !== canonical({ ...battle.next.state, growth: [] })) {
    console.warn('The run after this battle differs from the server; using the server run', battle.next);
    app.run = migrateRun({ ...battle.next.state, growth: [] });
  }
  app.battle = undefined;
  app.day = startOfDay(app.run);
  const o = battle.result.outcome;
  app.message = o === 'win' ? `${pix('trophy')} Course won! Back to the kitchen.` : o === 'loss'
    ? (app.run.turn - 1 >= 3 ? `${pix('lifeOff')} You lost a life.` : 'Lost, but the first two days cost no lives.') : 'A draw. Nothing lost.';
  const { lastIncome, lastInterest } = app.run;
  if (!isOver(app.run)) app.message += ` +${lastIncome}g income${lastInterest ? `, +${lastInterest}g interest` : ''}.`;
  const summary = growthSummary(app.run.growth);
  if (summary && !isOver(app.run)) app.message += ` Start of day: ${summary}.`;
  save();
  render();
  const back = 2 * WIPE_MS;
  if (isOver(app.run)) sfx(app.run.courses >= COURSES_TO_WIN ? 'win' : 'lose', back);
  else {
    if (o === 'win') sfx('trophy', back);
    else if (o === 'loss' && app.run.turn - 1 >= 3) sfx('lifeLost', back);
    for (let i = 0; i <= Math.min(lastInterest, 5); i++) sfx('coin', back + 350 + i * 90);
    playGrowth(back + 400);
  }
}

// ---------- shared rendering ----------

let lastScreen = '';
/** Wipe even though the screen stays the same (a new run). */
let forceWipe = false;
/** The drag and drop the next render is the result of. */
let pendingDrop: DropFx | undefined;
/** The battle frame whose effects (lunges, popups, sparks) have already played: re-rendering it shows it still. */
let shownFrame = -1;
let toast = { text: '', id: 0, at: 0 };

function render() {
  clearTimeout(timer);
  const screen = app.battle ? 'battle' : isOver(app.run) ? 'over' : 'kitchen';
  const first = lastScreen === '';
  const changed = screen !== lastScreen || forceWipe;
  const before = changed ? EMPTY : capture(root);
  const oldNodes = changed && !first ? [...root.childNodes] : [];
  const oldScreen = lastScreen;
  lastScreen = screen;
  forceWipe = false;
  if (app.message !== toast.text) toast = { text: app.message, id: toast.id + 1, at: performance.now() };

  document.body.dataset.screen = screen;
  // Keep the images already on screen (same markup) instead of fresh copies: iPhone Safari can draw a newly inserted
  // <img> blank for a frame, which flashed the dark page through the scene on every tap.
  const keep = changed ? null : imagesByMarkup();
  let fresh = false;
  if (app.battle) fresh = renderBattle(app.battle);
  else if (isOver(app.run)) renderOver();
  else renderKitchen();
  if (keep) {
    root.querySelectorAll('img').forEach((img) => {
      const old = keep.get(img.outerHTML)?.pop();
      if (old) img.replaceWith(old);
    });
  }

  if (oldNodes.length) wipe(oldNodes, oldScreen, stageScale());
  const drop = pendingDrop;
  pendingDrop = undefined;
  const speed = app.battle ? app.speed : 1;
  const delay = changed && !first ? WIPE_MS : 0;
  play(root, before, { speed, delay, stagger: true, drop, exitDelay: fresh && app.battle ? (contactDelay(currentFrame(app.battle)) * 1000) / speed : 0 });
  if (fresh && app.battle) battleEffects(app.battle, delay);
  if (screen === 'over' && changed && app.run.courses >= COURSES_TO_WIN) overConfetti(delay);
  updateTip();
}

/** Every image on screen, by its markup. */
function imagesByMarkup(): Map<string, HTMLImageElement[]> {
  const map = new Map<string, HTMLImageElement[]>();
  root.querySelectorAll('img').forEach((img) => {
    const list = map.get(img.outerHTML) ?? [];
    list.push(img);
    map.set(img.outerHTML, list);
  });
  return map;
}

/** The sound on/off button (key m). `cls` may carry extra attributes for the kitchen's placement. */
function soundButton(cls: string): string {
  const off = isMuted();
  return `<button class="${cls}" data-action="sound" ${tip(`<p>Sound ${off ? 'off' : 'on'}: tap to turn it ${off ? 'on' : 'off'} (key m).</p>`)} aria-label="sound ${off ? 'off' : 'on'}">${pix(off ? 'soundOff' : 'soundOn')}</button>`;
}

const flavorOf = (u: { defId: string; flavorOverride?: Flavor } | null) => (u ? (u.flavorOverride ?? unitDef(u.defId).flavor) : null);

// ---------- kitchen: a fixed 640x360 stage over the painted scene ----------
// Every position comes from kitchen-layout.json (shared with tools/gen-kitchen.mjs). The stage is scaled by a
// whole number so the art's pixels stay square; only screens narrower than 640px get a fractional scale. Touch
// screens always fill the screen exactly: at 2-3 device pixels per CSS pixel a fractional scale still looks crisp.

type Rect = number[];
const at = ([x, y]: number[]) => `left:${x}px;top:${y}px`;
const box = ([x, y, w, h]: Rect) => `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;

const TOUCH = window.matchMedia('(pointer: coarse)').matches;

/** The room the stage has: the visible part of the window (phones hide some behind toolbars), less safe-area padding. */
function screenRoom(): [number, number] {
  const vv = window.visualViewport;
  const pad = (el: Element) => {
    const cs = getComputedStyle(el);
    return [parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)];
  };
  const [rx, ry] = pad(document.documentElement);
  const [bx, by] = pad(document.body);
  return [(vv?.width ?? window.innerWidth) - rx - bx, (vv?.height ?? window.innerHeight) - ry - by];
}

function stageScale(): number {
  const [w, h] = screenRoom();
  const fit = Math.min(w / LAYOUT.size[0], h / LAYOUT.size[1]);
  if (fit < 1 || TOUCH) return fit;
  return Math.floor(fit);
}

interface UnitData {
  defId: string;
  level: 1 | 2 | 3;
  copies?: number;
  attack: number;
  hp: number;
  tempAttack?: number;
  item?: HeldItemId;
  flavor: Flavor;
  /** Every flavor it counts as, when it's more than one (shown as dots). */
  flavors?: Flavor[];
}

/**
 * Every food's flavor, on the right edge of its tile: its flavor icon (two for a two-flavor food). A food with three
 * or more (Tofu that soaked up flavor, Saffron) shows them smaller, two to a row, so the tile stays clear.
 */
function flavorDots(u: UnitData): string {
  const all = unitDef(u.defId).allFlavors ? [...FLAVORS] : (u.flavors?.length ? u.flavors : [u.flavor]);
  const tipText = tip(`Counts as ${all.map((f) => flavorTag(f)).join(' ')}`);
  return `<div class="u-flavors icons ${all.length > 2 ? 'many' : ''}" ${tipText}>${all.map((f) => pix(f)).join('')}</div>`;
}

/**
 * A 40x48 food: the 32x32 sprite, an attack/HP strip, and merge pips. `attrs` carries its drag handle and animation
 * key; with a uid its stats, level and pips animate when they change.
 */
function unitTile(u: UnitData, attrs: string, extra = '', uid?: number): string {
  const atk = u.attack + (u.tempAttack ?? 0);
  const vk = (name: string, v: string | number, more = '') => (uid === undefined ? '' : `data-vk="${name}:${uid}" data-v="${v}" ${more}`);
  const pips = u.copies !== undefined
    ? `<div class="u-pips" ${vk('cp', u.copies)}>${[1, 2, 3, 4, 5, 6].map((i) => `<i class="${i <= u.copies! ? 'on' : ''}"></i>`).join('')}</div>`
    : '';
  return `
    <div class="unit flavor-${u.flavor} ${u.level === 3 ? 'cooked' : ''} ${extra}" ${attrs} ${vk('lvl', u.level, 'data-va="levelup"')}>
      <div class="u-art">${unitArt(u.defId, u.level === 3)}</div>
      ${u.level > 1 ? `<div class="u-lvl">${u.level === 3 ? pix('starSmall') : u.level}</div>` : ''}
      ${u.item ? `<div class="u-item" ${tipBox(itemDef(u.item).name, `<p>${itemDef(u.item).text}</p>`)} ${uid === undefined ? '' : `data-k="item:${uid}"`}>${pix(HELD_ICON[u.item])}</div>` : ''}
      <div class="u-stats">${statBadge('atk', atk, 1, vk('a', atk), u.tempAttack ? 'boosted' : '')}${statBadge('hp', u.hp, 1, vk('h', u.hp))}</div>
      <div class="u-gem" ${tipBox(rarityTag(u.defId), `<p>${RARITY_TEXT[rarityOf(unitDef(u.defId))]}</p>`)}>${gemIcon(rarityOf(unitDef(u.defId)))}</div>
      ${flavorDots(u)}
      ${pips}
    </div>`;
}

function offerTile(offer: Offer, attrs: string, selected: boolean): string {
  if (offer.kind === 'unit') {
    const d = unitDef(offer.defId);
    // A level-up bonus shines and wears a star tag.
    const extra = `${selected ? 'selected' : ''} ${offer.bonus ? 'bonus' : ''}`;
    return unitTile({ defId: d.id, level: 1, attack: d.attack, hp: d.hp, flavor: d.flavor, flavors: flavorsOf({ defId: d.id }) }, attrs, extra).replace(
      '<div class="u-art">',
      offer.bonus ? `<div class="bonus-tag">${pix('starSmall')}</div><div class="u-art">` : '<div class="u-art">',
    );
  }
  const r = itemRarity(itemDef(offer.itemId));
  return `<div class="unit item ${selected ? 'selected' : ''}" ${attrs}><div class="u-art">${itemArt(offer.itemId)}</div><div class="u-gem" ${tipBox(rarityName(r), `<p>${RARITY_TEXT[r]}</p>`)}>${gemIcon(r)}</div></div>`;
}

const offerId = (o: Offer) => (o.kind === 'unit' ? o.defId : o.itemId);

/** The tile data for an owned food. */
const tileOf = (u: UnitInstance) => ({ ...u, level: levelOf(u.copies), flavor: flavorOf(u)!, flavors: flavorsOf(u) });



function isSelectedLoc(loc: Loc) {
  const s = app.selected;
  return s?.kind === 'unit' && s.loc.area === loc.area && s.loc.index === loc.index;
}

function isSelectedSrc(src: OfferSource) {
  const s = app.selected;
  return s?.kind === 'offer' && sameSrc(s.src, src);
}

function marketSlots(): string {
  const { run } = app;
  // Foods fill the brown cubbies left to right, items the teal ones.
  const foods = run.market.map((o, i) => ({ o, i })).filter(({ o }) => !o || o.kind === 'unit');
  const items = run.market.map((o, i) => ({ o, i })).filter(({ o }) => o?.kind === 'item');
  // The last teal cubby is the special one (see specialSlot).
  const placed = [
    ...foods.slice(0, LAYOUT.marketFoodSlots).map((m, k) => ({ ...m, pos: LAYOUT.market[k] })),
    ...items.slice(0, LAYOUT.market.length - LAYOUT.marketFoodSlots - 1).map((m, k) => ({ ...m, pos: LAYOUT.market[LAYOUT.marketFoodSlots + k] })),
  ];
  return placed
    .map(({ o, i, pos }) => {
      if (!o) return '';
      const src: OfferSource = { area: 'market', index: i };
      const key = `${app.run.turn}:${app.marketGen}:${i}`;
      const attrs = `data-drag="offer:market:${i}" data-k="m:${key}" data-in="drop" data-out="drop-out"`;
      return `<div class="slot" style="${at(pos)}" data-offer="market:${i}">${offerTile(o, attrs, isSelectedSrc(src))}</div>
        <div class="price" style="${at([pos[0] + 8, pos[1] + 51])}" data-k="p:${key}" data-in="fade" data-out="drop-out">${offerCost(o)}g</div>`;
    })
    .join('');
}

/** Today's buffet odds as a table of rarities and chances (for tooltips). */
function oddsTable(): string {
  const rows = marketOdds(app.run.turn).map((o) => `<p>${rarityName(RARITY_BY_TIER[o.tier])} <b>${Math.round(o.chance * 100)}%</b></p>`).join('');
  return `<p class="dim">Each food cubby today:</p>${rows}`;
}

/** The buffet's odds, on the tiles beside the refill sign: a gem and a chance for each rarity on offer today. */
function oddsStrip(): string {
  const odds = marketOdds(app.run.turn);
  const cells = odds.map((o) => `<span class="odds-cell">${gemIcon(RARITY_BY_TIER[o.tier])}${Math.round(o.chance * 100)}%</span>`).join('');
  const body = `${oddsTable()}<p class="dim">Newer rarities show up more as the days go on. A level-up adds a dish from the rarity above.</p>`;
  return `<div class="odds-strip" style="${box(LAYOUT.odds as Rect)}" data-vk="odds" data-v="${app.run.turn}" data-va="flash" ${tipBox('Buffet odds', body)}>${cells}</div>`;
}

/** Names and blurbs for what the special cubby can hold. */
const SPECIALS: Record<Exclude<SpecialOffer['kind'], 'freeItem'>, { name: string; text: string }> = {
  spicePack: { name: 'Spice Pack', text: 'Open it and keep 1 of 3 consumables, maybe one the buffet does not stock yet.' },
  farmPack: { name: 'Farm Box', text: 'Open it and keep 1 of 3 foods, up to one rarity above the buffet.' },
  bundle: { name: 'Pair', text: 'Two copies of one food for about one and a half times the price. They land on the counter tray: place, merge or sell them before serving.' },
  premium: { name: 'Premium Refill', text: 'Refills the buffet with nothing but foods of the next rarity.' },
  mythic: { name: 'Mythic Delivery', text: 'A one-of-a-kind dish that never shows up in the buffet. Drag it straight onto your plate.' },
};

/** The special cubby (the last teal one): one offer a turn that restocking leaves alone. */
function specialSlot(): string {
  const s = app.run.special;
  const pos = LAYOUT.market[LAYOUT.market.length - 1];
  const tag = `<div class="special-tag" style="${at([pos[0] + 2, pos[1] - 9])}" ${tipBox('Special cubby', '<p>One special offer a day: a Spice Pack, Farm Box, Pair, Premium Refill or, late in the run, a mythic. Refilling leaves it alone.</p><p class="dim">Drag it onto the counter tray to buy it (a mythic goes straight onto your plate).</p>')}>${pix('starSmall')}special</div>`;
  if (!s) return tag;
  const key = `sp:${app.run.turn}:${s.kind}`;
  const selected = app.selected?.kind === 'special' || isSelectedSrc({ area: 'special', index: 0 });
  let tile: string;
  if (s.kind === 'freeItem') {
    tile = offerTile({ kind: 'item', itemId: s.itemId }, `data-drag="offer:special:0" data-k="${key}:${s.itemId}" data-in="drop"`, selected);
  } else {
    // A mythic is bought like any food, dragged straight onto the plate; the rest open on the counter tray.
    const attrs = `data-drag="${s.kind === 'mythic' ? 'offer:special:0' : 'special'}" data-k="${key}" data-in="drop" data-out="drop-out"`;
    if (s.kind === 'bundle' || s.kind === 'mythic') {
      const d = unitDef(s.defId);
      tile = unitTile({ defId: d.id, level: 1, attack: d.attack, hp: d.hp, flavor: d.flavor, flavors: flavorsOf({ defId: d.id }) }, attrs, `special ${selected ? 'selected' : ''}`)
        .replace('<div class="u-art">', s.kind === 'bundle' ? `<div class="bundle-tag">x${s.count}</div><div class="u-art">` : '<div class="u-art">');
    } else {
      tile = `<div class="unit item special ${selected ? 'selected' : ''}" ${attrs}><div class="u-art">${specialArt(s.kind)}</div></div>`;
    }
  }
  const price = s.kind === 'freeItem' ? 'free' : `${specialCost(s)}g`;
  return `${tag}<div class="slot" style="${at(pos)}" data-special="1">${tile}</div>
    <div class="price ${s.kind === 'freeItem' ? 'free' : ''}" style="${at([pos[0] + 8, pos[1] + 51])}" data-k="p:${key}" data-in="fade">${price}</div>`;
}

/**
 * The counter tray: pairs and boxed foods wait here (they must be placed, merged or sold before serving), and an
 * opened pack lays out its three choices. Specials are bought by dragging them onto it.
 */
function counterTray(): string {
  const { run } = app;
  const [x, y, w, h] = LAYOUT.tray;
  const pack = run.pack;
  const busy = !!pack || run.overflow.some((u) => u);
  let slots = '';
  LAYOUT.overflow.forEach((pos, index) => {
    let content = '';
    if (pack) {
      const id = pack.kind === 'spice' ? pack.items[index] : pack.units[index];
      if (id) {
        const attrs = `data-drag="pick:${index}" data-k="pick:${run.turn}:${index}:${id}" data-in="pop" data-out="drop-out"`;
        const selected = app.selected?.kind === 'pick' && app.selected.index === index;
        const offer: Offer = pack.kind === 'spice' ? { kind: 'item', itemId: pack.items[index] } : { kind: 'unit', defId: pack.units[index] };
        content = offerTile(offer, attrs, selected);
      }
      slots += `<div class="slot" style="${at(pos)}" data-pick="${index}">${content}</div>`;
      return;
    }
    const u = run.overflow[index];
    const loc: Loc = { area: 'overflow', index };
    if (u) content = unitTile(tileOf(u), `data-drag="unit:overflow:${index}" data-k="u:${u.uid}" data-in="drop"`, isSelectedLoc(loc) ? 'selected' : '', u.uid);
    slots += `<div class="slot drop ${u ? '' : 'empty'}" style="${at(pos)}" data-slot="overflow:${index}" data-drop="overflow:${index}">${content}</div>`;
  });
  const label = pack ? `${pack.kind === 'spice' ? 'spice pack' : 'farm box'}: keep one` : busy ? 'place these before serving' : 'counter tray';
  return `<div class="tray ${busy ? 'busy' : ''} ${pack ? 'pack' : ''}" style="${box([x, y, w, h])}" data-drop="tray" ${tipBox('Counter tray', '<p>Pairs, Farm Box picks and mythics land here. Place, merge or sell everything on it before you serve.</p><p class="dim">Drop the special offer here to buy it.</p>')}></div>
    <div class="label ${busy ? 'tag' : 'dark'} center tray-label" style="${box([x + 22, y - 10, w - 44, 10])}" data-vk="tray" data-v="${label}" data-va="flash">${label}</div>
    ${slots}`;
}

/** Top-left of a plate slot on the kitchen stage. */
const platePos = (slot: number) => LAYOUT.plate[laneOf(slot)][rowOf(slot) === 0 ? 1 : 0];

/**
 * A small pixel icon: '#' cells in `fill`, ringed by a 1px dark outline, drawn as a tiny image (see gridUrl).
 * Returns the element's style: (w+2)x(h+2) cells of `scale` pixels, top-left at x, y.
 */
function pixelIcon(cells: string[], fill: string, x: number, y: number, scale = 1): string {
  const w = (cells[0].length + 2) * scale, h = (cells.length + 2) * scale;
  return `left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:url(${gridUrl(cells, {}, fill)}) 0 0 / 100% 100%;image-rendering:pixelated`;
}

const ARROWS: Record<'left' | 'right' | 'up' | 'down', string[]> = {
  right: ['#..', '##.', '###', '##.', '#..'],
  left: ['..#', '.##', '###', '.##', '..#'],
  down: ['#####', '.###.', '..#..'],
  up: ['..#..', '.###.', '#####'],
};

/** Which foods on the plate reach which (food ahead, neighbours, lane partner), as [from, to] slots. */
function plateLinks(): [number, number][] {
  const out: [number, number][] = [];
  app.run.plate.forEach((u, slot) => {
    if (!u) return;
    for (const t of linkedSlots(unitDef(u.defId), slot, levelOf(u.copies))) if (app.run.plate[t]) out.push([slot, t]);
  });
  return out;
}

/** An arrow in the gap between two plate slots, pointing from the food that acts to the food it reaches. */
function linkArrows(): string {
  const links = plateLinks();
  const has = (a: number, b: number) => links.some(([x, y]) => x === a && y === b);
  return links.map(([from, to]) => {
    const [fx, fy] = platePos(from);
    const [tx, ty] = platePos(to);
    const sameLane = laneOf(from) === laneOf(to);
    const dir = sameLane ? (tx < fx ? 'left' : 'right') : ty > fy ? 'down' : 'up';
    const cells = ARROWS[dir];
    const w = cells[0].length + 2;
    const h = cells.length + 2;
    // Two foods reaching each other get two arrows side by side.
    const nudge = has(to, from) ? (from < to ? -4 : 4) : 0;
    // Same lane: in the gap between the back and front slots. Neighbouring lanes: in the gap between the tiles.
    const mx = (fx + tx) / 2 + 20 + (sameLane ? 0 : nudge);
    const my = (fy + ty) / 2 + (sameLane ? 20 + nudge : 24);
    const uids = `${app.run.plate[from]!.uid}:${app.run.plate[to]!.uid}`;
    return `<i class="link-arrow" style="${pixelIcon(cells, '#7fd86a', Math.round(mx - w / 2), Math.round(my - h / 2))}" data-k="link:${uids}"></i>`;
  }).join('');
}

/** Plate slots the food being held or dragged would reach from `slot` (shown while placing it). */
function reachFrom(slot: number, defId: string | undefined): Set<number> {
  return new Set(defId ? linkedSlots(unitDef(defId), slot) : []);
}

/** The food (by def) that is selected or being dragged, if any. */
function heldDefId(): string | undefined {
  const sel = app.selected;
  if (sel?.kind === 'unit') return getUnit(app.run, sel.loc)?.defId;
  if (sel?.kind === 'offer') {
    const o = getOffer(app.run, sel.src);
    return o?.kind === 'unit' ? o.defId : undefined;
  }
  if (sel?.kind === 'pick' && app.run.pack?.kind === 'farm') return app.run.pack.units[sel.index];
  return undefined;
}

function plateSlots(): string {
  const { run } = app;
  let html = '';
  const sel = app.selected;
  const reach = sel?.kind === 'unit' && sel.loc.area === 'plate' ? reachFrom(sel.loc.index, heldDefId()) : new Set<number>();
  for (let lane = 0; lane < 3; lane++) {
    for (const row of [1, 0]) {
      const index = lane + 3 * row;
      const pos = LAYOUT.plate[lane][row === 0 ? 1 : 0];
      const u = run.plate[index];
      const loc: Loc = { area: 'plate', index };
      const attrs = u ? `data-drag="unit:plate:${index}" data-k="u:${u.uid}"` : '';
      const content = u ? unitTile(tileOf(u), attrs, isSelectedLoc(loc) ? 'selected' : '', u.uid) : '';
      html += `<div class="slot drop ${u ? '' : 'empty'} ${reach.has(index) ? 'reach' : ''}" style="${at(pos)}" data-slot="plate:${index}" data-drop="plate:${index}">${content}</div>`;
    }
  }
  html += linkArrows();
  const [lx, ly] = LAYOUT.plateLabels;
  html += `<div class="label dark" style="${at([lx + 8, ly])}">back</div><div class="label dark" style="${at([lx + 50, ly])}">front ›</div>`;
  const [nx, ny] = LAYOUT.laneLabels;
  ['far', 'mid', 'near'].forEach((n, lane) => (html += `<div class="label dark" style="${at([nx, ny + 52 * lane + 20])}">${n}</div>`));
  return html;
}

function fridgeSlots(): string {
  return LAYOUT.fridge
    .map((pos, index) => {
      const entry = app.run.fridge[index];
      const loc: Loc = { area: 'fridge', index };
      let content = '';
      if (entry?.kind === 'unit') {
        const u = entry.unit;
        content = unitTile(tileOf(u), `data-drag="unit:fridge:${index}" data-k="u:${u.uid}"`, isSelectedLoc(loc) ? 'selected' : '', u.uid);
      } else if (entry?.kind === 'offer') {
        const attrs = `data-drag="offer:fridge:${index}" data-k="fo:${index}:${offerId(entry.offer)}"`;
        content = `${offerTile(entry.offer, attrs, isSelectedSrc({ area: 'fridge', index }))}<div class="frost" data-k="frost:${index}" data-in="fade"></div>`;
      }
      return `<div class="slot drop ${entry ? '' : 'empty'}" style="${at(pos)}" data-slot="fridge:${index}" data-drop="fridge:${index}" ${entry ? '' : tipBox('Fridge', '<p>Buy a food into it to keep it for later: drag it here from the buffet (it costs its price).</p><p class="dim">Foods in the fridge still merge, and some grow there.</p>')}>${content}</div>`;
    })
    .join('');
}

function freezerMagnets(): string {
  const { run } = app;
  const lives = Array.from({ length: START_LIVES }, (_, i) => {
    const on = i < run.lives;
    return `<span class="mag-star" data-vk="life:${i}" data-v="${on}" data-va="lose">${pix(on ? 'life' : 'lifeOff')}</span>`;
  }).join('');
  return `<div class="magnets" style="${box(LAYOUT.freezer)}">
      <div class="mag-stars" ${tipBox(`Lives: ${run.lives} of ${START_LIVES}`, '<p>Losing a battle costs a life (from day 3). Lose them all and the kitchen closes.</p>')}>${lives}</div>
      <div class="mag-course" ${tipBox(`Courses won: ${run.courses} of ${COURSES_TO_WIN}`, `<p>Win a battle to serve a course. Serve ${COURSES_TO_WIN} to win the run.</p>`)} data-vk="courses" data-va="levelup">${pix('trophy')} ${run.courses}/${COURSES_TO_WIN}</div>
    </div>`;
}

/**
 * Team flavor bonuses at 2, 4, 6 and 8 of a flavor (see battle.ts, flavor bonuses). Each tier adds to the one before.
 * 8 needs foods that count as two flavors (or Saffron), and changes a rule.
 */
const FLAVOR_BONUS: Record<Flavor, [string, string, string, string]> = {
  spicy: ['spicy hits Burn 1', 'spicy hits Burn 2', 'Burn never fades', 'Burning take +2'],
  sweet: ['front row +1 HP a turn', '+2 HP + cleanses', 'back row too', 'sugar rush'],
  sour: ['enemy front Rots 1', 'every enemy Rots 1', 'Rotting hit softer', 'Rot spreads'],
  salty: ['front row 2 Crust', 'front row 4 Crust', '+2 Crust a turn', 'Crust bites back'],
  savory: ['summons +1/+1', '+2/+2, eaten feed', 'eaten leave Crumbs', 'feast'],
};
/** The same bonuses spelled out, for tooltips. */
const FLAVOR_BONUS_LONG: Record<Flavor, [string, string, string, string]> = {
  spicy: ['Your Spicy foods\' attacks Burn their target 1.', 'They Burn 2 instead.', 'Burn on enemies never fades.', 'Burning enemies take +2 damage from every hit.'],
  sweet: ['Your front row gains 1 HP at the end of each turn.', 'It gains 2 HP and cleanses 1 Burn and 1 Rot.', 'Your back row gets it too.', 'Sugar rush: each of your foods survives being eaten once, at 1 HP.'],
  sour: ['The enemy front row Rots 1 at the start of battle.', 'Every enemy Rots 1 instead.', 'Rotting enemies deal 1 less damage.', 'When a Rotting enemy is eaten, its Rot spreads to its neighbours.'],
  salty: ['Your front row gains 2 Crust at the start of battle.', 'It gains 4 Crust instead.', 'Your front row regains 2 Crust every turn.', 'Crust bites back: damage it blocks is dealt back to the attacker.'],
  savory: ['Your summoned foods get +1/+1.', 'They get +2/+2, and when a friend is eaten its neighbours gain +1/+1.', 'Eaten friends leave a 2/2 Crumb behind.', 'Feast: when a friend is eaten, every friend gains +2/+2.'],
};
const FLAVOR_ROLE: Record<Flavor, string> = {
  spicy: 'Damage over time with Burn.',
  sweet: 'Gaining HP and cleansing.',
  sour: 'Weakens enemies with Rot.',
  salty: 'Crust to soak up hits.',
  savory: 'Summons and growth.',
};
const TIER_AT = [2, 4, 6, 8];

/** Flavor counts on the plate, exactly as the battle counts them (Saffron doubles its neighbours). */
const flavorCounts = (): Map<Flavor, number> => flavorTally(app.run.plate);

/** Tooltip for a flavor: what it does, every tier (reached ones lit), and how many more the next tier needs. */
function flavorTip(f: Flavor, n: number): string {
  const tier = flavorTier(n);
  const rows = FLAVOR_BONUS_LONG[f].map((b, i) => `<p class="tier ${n >= TIER_AT[i] ? 'on' : ''}"><b>${TIER_AT[i]}</b>${b}</p>`).join('');
  const next = tier < 4 ? `<p class="tip-next">${TIER_AT[tier] - n} more different ${f} food${TIER_AT[tier] - n === 1 ? '' : 's'} for the next bonus.${tier >= 2 ? ' Rich foods (Curry, Fudge, Lime, Rice Ball, Miso), Bouillon Cubes, foods with two flavors and Flavor Packets get you there.' : ''}</p>` : '<p class="tip-next">Every bonus is active!</p>';
  const saffron = app.run.plate.some((u) => u && unitDef(u.defId).aura === 'infuse') ? '<p class="dim">Foods next to Saffron count twice.</p>' : '';
  return tipBox(`${pix(f)} ${f[0].toUpperCase()}${f.slice(1)} on your plate: ${n}`, `<p class="dim">${FLAVOR_ROLE[f]}</p>${rows}${next}${saffron}<p class="dim">Each different food counts once (a rich food as its level number, a Bouillon Cube adds one): copies don't add more.</p>`);
}

function spiceJars(): string {
  const counts = flavorCounts();
  return FLAVORS.map((f, j) => {
    const n = counts.get(f) ?? 0;
    const tier = flavorTier(n);
    return `<div class="jar ${tier ? `active t${tier}` : ''}" style="${box(PROPS[`spice${j}` as keyof typeof PROPS] as Rect)}" ${flavorTip(f, n)} data-vk="jar:${f}" data-v="${n}" data-va="hop">${propArt(`spice${j}`)}<span>${n}</span></div>`;
  }).join('');
}

/** Chalkboard: every flavor with its count and its best bonus now; hover a line for the whole ladder. */
function chalkboard(): string {
  const counts = flavorCounts();
  const lines = FLAVORS.map((f) => {
    const n = counts.get(f) ?? 0;
    const tier = flavorTier(n);
    const pips = TIER_AT.map((at) => `<i class="${n >= at ? 'on' : ''}"></i>`).join('');
    const text = tier ? FLAVOR_BONUS[f][tier - 1] : f;
    return `<div class="chalk-line ${tier ? 'on' : ''}" data-vk="chalk:${f}" data-v="${tier}" data-va="flash" ${flavorTip(f, n)}><b>${n}</b><span class="chalk-pips">${pips}</span>${text}</div>`;
  }).join('');
  return `<div class="chalkboard" style="${box(LAYOUT.chalkboard)}"><div class="chalk-title">flavors 2·4·6·8</div>${lines}</div>`;
}

// ---------- the tip jar: gold and interest ----------
// The jar is a measuring jar. Coins fill it to a height set by your gold (drawn behind the jar sprite, so they show
// through its glass), and a line for each step of interest (5, 10, 15 gold...) is marked +1, +2, +3 on its side,
// lit once the coins reach it. "Fill it to the line to earn" is the whole rule.

/** Jar interior, in stage pixels: its centre and the bottom and top of the space coins can fill. */
const JAR = { cx: 333, bottom: 311, top: 268 };

/** Pixels of coins per gold: the top interest line sits a little below the neck. */
function jarScale(): number {
  return (JAR.bottom - JAR.top - 3) / (INTEREST_STEP * interestCap(app.run));
}

function jarCoins(): string {
  const h = Math.min(JAR.bottom - JAR.top, Math.round(app.run.gold * jarScale()));
  return h > 0 ? `<div class="jar-coins" style="left:${JAR.cx - 14}px;top:${JAR.bottom - h}px;width:28px;height:${h}px"></div>` : '';
}

function jarMarks(): string {
  const { run } = app;
  const mult = interestMult(run);
  const earn = interestOn(run, run.gold) / mult;
  return Array.from({ length: interestCap(run) }, (_, i) => {
    const y = Math.round(JAR.bottom - INTEREST_STEP * (i + 1) * jarScale());
    const on = i < earn;
    return `<div class="jar-mark ${on ? 'on' : ''}" style="left:${JAR.cx + 10}px;top:${y}px" ${interestTip()} data-vk="jm:${i}" data-v="${on ? 1 : 0}" data-va="hop"><i></i><b>+${(i + 1) * mult}</b></div>`;
  }).join('');
}

/** The jar's tooltip: gold, the interest rule, and what tomorrow brings. */
/**
 * Order tickets clipped to the rail beside the day ticket: the buffet's newest rarity and when the next opens,
 * tomorrow's gold, and what a loss today costs. Hover one for the detail.
 */
function orderTickets(): string {
  const { run } = app;
  const { maxTier } = turnConfig(run.turn);
  const unlockDay = (tier: number) => { for (let d = run.turn + 1; d < run.turn + 20; d++) if (turnConfig(d).maxTier >= tier) return d; return null; };
  const next = maxTier < 6 ? ((maxTier + 1) as Tier) : null;
  const nextDay = next ? unlockDay(next) : null;
  const schedule = ([1, 2, 3, 4, 5, 6] as const).map((t) => {
    const d = t === 1 ? 1 : (() => { for (let x = 1; x < 30; x++) if (turnConfig(x).maxTier >= t) return x; return 0; })();
    return `<p class="${t <= maxTier ? '' : 'dim'}">${rarityName(RARITY_BY_TIER[t])} from day ${d}</p>`;
  }).join('');
  const rarity = `${gemIcon(RARITY_BY_TIER[maxTier])}${next ? `<span class="t-arrow">›</span>${gemIcon(RARITY_BY_TIER[next])}d${nextDay}` : ' all'}`;
  const rarityTip = tipBox('Buffet rarities', `<p>Newest in the buffet: ${rarityName(RARITY_BY_TIER[maxTier])}.${next ? ` Next: ${rarityName(RARITY_BY_TIER[next])} on day ${nextDay}.` : ' Every rarity is open.'}</p>${schedule}<p class="dim">${turnConfig(run.turn).unitSlots} food cubbies today.</p>`);

  const interest = interestOn(run, run.gold);
  const tomorrow = INCOME + interest + run.bonusGoldNext;
  const goldTip = tipBox(`${pix('coin')} Tomorrow: +${tomorrow} gold`, `<p>+${INCOME} income, +${interest} interest on the ${run.gold} gold you hold now${run.bonusGoldNext ? `, +${run.bonusGoldNext} from your foods` : ''}.</p><p class="dim">Spend less today to earn more interest (see the tip jar).</p>`);


  const freeLoss = run.turn < 3;
  const stakes = freeLoss ? 'free loss' : `loss ${pix('lifeOff')}-1`;
  const stakesTip = tipBox(freeLoss ? 'A loss today is free' : 'A loss costs a life', `<p>${freeLoss ? 'Losses on days 1 and 2 cost no lives.' : `Lose today and you have ${run.lives - 1} of ${START_LIVES} lives left.`} A win serves a course: ${COURSES_TO_WIN - run.courses} more to win the run.</p>`);

  const t = (x: number, w: number, body: string, tip: string, key: string, cls = '') => `<div class="order-ticket ${cls}" style="${box([x, 9, w, 13])}" ${tip} data-vk="ticket:${key}" data-v="${hash(body)}" data-va="hop">${body}</div>`;
  return [
    t(226, 66, rarity, rarityTip, 'rarity'),
    t(348, 66, `${pix('coin')}+${tomorrow} next`, goldTip, 'gold'),
    t(420, 62, stakes, stakesTip, 'stakes', freeLoss ? 'safe' : ''),
  ].join('');
}

function interestTip(): string {
  const { run } = app;
  const mult = interestMult(run);
  const earn = interestOn(run, run.gold);
  const lines = earn / mult;
  const cap = interestCap(run);
  const toNext = lines < cap ? INTEREST_STEP * (lines + 1) - run.gold : 0;
  const body = `<p>Gold you don't spend stays in the jar. Each line is worth <b>+${mult} gold</b> tomorrow${mult > 1 ? ' (Mandarin)' : ''}: fill the jar to the line (every ${INTEREST_STEP} gold), up to <b>${cap}</b> lines.</p>
    <p>${toNext ? `Keep <b>${toNext}</b> more for +${earn + mult}.` : 'Every line is filled: the most interest you can earn.'}</p>
    <p class="dim">Tomorrow: +${INCOME} income +${earn} interest.</p>`;
  return tipBox(`${pix('coin')} Tip jar: ${run.gold} gold, +${earn} interest`, body);
}

/** Extra lines about a food beyond its ability text: growth days left, interest, gained sell value and flavors. */
function foodNotes(defId: string, level: 1 | 2 | 3, u?: UnitInstance): string {
  const d = unitDef(defId);
  const notes: string[] = [];
  if (u) {
    abilitiesOf(d, level).forEach((ab, i) => {
      const days = ab.days?.[level - 1];
      if (days === undefined) return;
      const left = Math.max(0, days - (u.gains?.[i] ?? 0));
      notes.push(left > 0 ? `Growing: ${left} of ${days} days left.` : `Fully grown (${days} days). Level up for more days.`);
    });
  }
  for (const ab of abilitiesOf(d, level)) {
    const all = ab.max ?? (ab.limitToAmount ? (ab.values ?? d.values)[level - 1] : 0);
    if (all) notes.push(`${all}/${all} this battle`);
  }
  if (u?.extraFlavors?.length) notes.push(`Soaked up ${u.extraFlavors.join(' and ')}.`);
  return notes.map((n) => `<p class="dim">${n}</p>`).join('');
}

function cookbook(): string {
  const s = app.selected;
  const { run } = app;
  let left = `<div class="pg-title">Chef's notes</div><p>Drag food from the buffet onto your plate.</p><p>Front column attacks. Back column supports.</p>`;
  let right = `<p>Match a copy to merge it. Six copies cook it: a bonus!</p><p>Gold you keep earns interest.</p><p>Ring the bell to serve.</p>`;
  const unitPages = (defId: string, level: 1 | 2 | 3, flavors: Flavor[], atk: number, hp: number, u?: UnitInstance, price?: string) => {
    const d = unitDef(defId);
    const values = d.values.map((v, i) => (i + 1 === level ? `<b>${v}</b>` : `${v}`)).join('/');
    const shown = d.allFlavors ? 'every flavor' : flavors.map(flavorTag).join(' ');
    left = `<div class="pg-art">${unitArt(defId, level === 3)}</div>
      <div class="pg-title">${level === 3 ? d.cookedName : d.name}</div>
      <p>${shown}</p>
      <p>${rarityTag(d.id)}${price ? ` · ${price}` : ''}</p>
      <p class="stat-line">${statBadge('atk', atk)} attack ${statBadge('hp', hp)} HP</p>
      ${u ? `<p class="dim">sells for ${sellPrice(u)}g${u.sellBonus ? ` (+${u.sellBonus})` : ''}</p>` : ''}
      ${cookedChip(defId, level)}`;
    // Only foods with a number that grows by level show the ladder.
    const days = d.text.includes('{d}') ? ` · days ${[1, 2, 3].map((l) => (l === level ? `<b>${daysOf(d, l as 1 | 2 | 3)}</b>` : daysOf(d, l as 1 | 2 | 3))).join('/')}` : '';
    right = `<p>${foodText(d.text, d.values[level - 1], daysOf(d, level))}</p>${foodNotes(defId, level, u)}${d.text.includes('{v}') ? `<p class="dim">by level: ${values}${days}</p>` : ''}`;
  };
  if (s?.kind === 'offer') {
    const offer = getOffer(run, s.src);
    if (offer?.kind === 'item') {
      const d = itemDef(offer.itemId);
      const price = s.src.area === 'special' ? 'free' : `${d.cost} gold`;
      left = `<div class="pg-art">${itemArt(d.id)}</div><div class="pg-title">${d.name}</div><p>${rarityName(itemRarity(d))} · ${price}</p>`;
      right = `<p>${keywordify(d.text)}</p><p class="dim">Drop it on one of your foods.</p>`;
    } else if (offer) {
      const d = unitDef(offer.defId);
      unitPages(d.id, 1, flavorsOf({ defId: d.id }), d.attack, d.hp, undefined, `${offerCost(offer)}g`);
    }
  } else if (s?.kind === 'unit') {
    const u = getUnit(run, s.loc);
    if (u) unitPages(u.defId, levelOf(u.copies), flavorsOf(u), u.attack + (u.tempAttack ?? 0), u.hp, u);
  } else if (s?.kind === 'special' && (run.special?.kind === 'bundle' || run.special?.kind === 'mythic')) {
    // A Pair or a mythic delivery: the food's own pages, so you can read what it does.
    const sp = run.special;
    const d = unitDef(sp.defId);
    unitPages(d.id, 1, flavorsOf({ defId: d.id }), d.attack, d.hp, undefined, sp.kind === 'bundle' ? `x${sp.count} for ${sp.cost}g` : `${sp.cost}g`);
  } else if (s?.kind === 'special' && run.special && run.special.kind !== 'freeItem') {
    const sp = run.special;
    const info = SPECIALS[sp.kind];
    const art = sp.kind === 'bundle' || sp.kind === 'mythic' ? unitArt(sp.defId, false) : specialArt(sp.kind);
    const what = sp.kind === 'bundle' ? `${sp.count} ${unitDef(sp.defId).name}` : sp.kind === 'mythic' ? unitDef(sp.defId).name : '';
    left = `<div class="pg-art">${art}</div><div class="pg-title">${info.name}</div><p>${what ? `${what} · ` : ''}${sp.cost} gold</p><p class="dim">once a day</p>`;
    right = `<p>${info.text}</p>${sp.kind === 'mythic' ? `<p>${foodText(unitDef(sp.defId).text, unitDef(sp.defId).values[0], daysOf(unitDef(sp.defId), 1))}</p>` : ''}<p class="dim">Drag it onto the counter tray${sp.kind === 'premium' ? ' or the refill sign' : ''}.</p>`;
  } else if (s?.kind === 'pick' && run.pack) {
    const pack = run.pack;
    if (pack.kind === 'spice') {
      const d = itemDef(pack.items[s.index]);
      left = `<div class="pg-art">${itemArt(d.id)}</div><div class="pg-title">${d.name}</div><p>from the Spice Pack · free</p>`;
      right = `<p>${keywordify(d.text)}</p><p class="dim">Drop it on one of your foods to keep it. The other two go back.</p>`;
    } else {
      const d = unitDef(pack.units[s.index]);
      unitPages(d.id, 1, flavorsOf({ defId: d.id }), d.attack, d.hp, undefined, 'free pick');
    }
  }
  // A new selection turns the pages.
  const sig = hash(left + right);
  return `<div class="page" style="${box(LAYOUT.pageLeft)}" data-vk="pgL" data-v="${sig}" data-va="flipL">${left}</div>
    <div class="page" style="${box(LAYOUT.pageRight)}" data-vk="pgR" data-v="${sig}" data-va="flipR">${right}</div>`;
}

/**
 * The cooked bonus on the cookbook page: a chip (lit once the food is cooked) whose tooltip has the bonus. The page
 * is too small for the text itself.
 */
function cookedChip(defId: string, level: 1 | 2 | 3): string {
  const d = unitDef(defId);
  if (!d.cooked) return '';
  const on = level === 3;
  const body = `<p>${foodText(d.cooked.text, 0)}</p><p class="dim">${on ? `On: ${d.name} is cooked into ${d.cookedName}.` : 'Switches on at level 3, when 6 copies cook it.'}</p>`;
  return `<p class="cook-chip ${on ? 'on' : ''}" ${tipBox(`${pix('flame')} Cooked bonus`, body)}>${pix(on ? 'flame' : 'flameOff')}<span>${on ? 'cooked bonus' : 'cooked bonus'}</span></p>`;
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0;
  return h;
}

function renderKitchen() {
  const { run } = app;
  const sel = app.selected;
  const unitSelected = sel?.kind === 'unit';
  const held = unitSelected ? getUnit(run, sel.loc) : null;
  const sellValue = held ? sellPrice(held) : 0;
  const [bx, by, bw] = LAYOUT.bin;
  const [cx, cy] = LAYOUT.bell;
  const cost = rerollCost(run);

  const toastAge = Math.round(performance.now() - toast.at);

  root.innerHTML = `
    <div class="stage-wrap" style="--s:${stageScale()}">
      <main class="stage ${sel ? 'holding' : ''}">
        <img class="scene-bg" src="${kitchenUrl}" alt="" draggable="false">
        <div class="ticket-text" style="${box(LAYOUT.ticket)}" data-vk="turn">day ${run.turn}</div>
        <button class="newrun" style="${box(LAYOUT.newRun)}" data-action="new-run">new run</button>
        ${soundButton(`hotspot sound-btn" style="${box(LAYOUT.sound)}`)}
        ${freezerMagnets()}
        ${orderTickets()}
        ${spiceJars()}
        ${chalkboard()}
        <button class="hotspot refill ${run.gold < cost ? 'off' : ''} ${cost === 0 ? 'free' : ''}" style="${box(LAYOUT.refill)}" data-action="reroll" data-drop="refill"
          ${tipBox('Refill the buffet', `<p>Refill every food and item cubby (key r) for <b>${cost ? `${cost} gold` : 'nothing'}</b>, as often as you like.</p>${oddsTable()}<p class="dim">The special cubby keeps its offer.</p>`)} data-vk="refill" data-v="${app.marketGen}" data-va="shake"><span>refill · ${cost ? `${cost}g` : 'free'}</span></button>
        ${marketSlots()}
        ${oddsStrip()}
        ${specialSlot()}
        ${fridgeSlots()}
        ${plateSlots()}
        ${counterTray()}
        <div class="label dark center" style="${box([cx - 6, cy - 3, 60, 9])}">serve!</div>
        ${jarCoins()}
        <div class="tip-jar" style="${box(PROPS.tipjar)}" ${interestTip()} data-vk="jar-gold" data-v="${run.gold}" data-va="hop">${propArt('tipjar')}
          <div class="tip-text" style="${box([LAYOUT.tipLabel[0] - PROPS.tipjar[0], LAYOUT.tipLabel[1] - PROPS.tipjar[1], LAYOUT.tipLabel[2], LAYOUT.tipLabel[3]])}"
            data-vk="gold" data-v="${run.gold}" data-delta>${run.gold}g</div></div>
        ${jarMarks()}
        <button class="hotspot bell" style="${box(PROPS.bell)}" data-action="serve" ${tipBox('Serve', '<p>Ring the bell to send your plate into battle.</p>')}>${propArt('bell')}</button>
        <div class="hotspot bin ${unitSelected ? 'armed' : ''}" style="${box(PROPS.bin)}" data-drop="sell" data-action="sell" ${tipBox('Scrap bin', '<p>Drop a food here to sell it for half what it cost, plus its sell value (key s).</p>')}
          data-k="bin" data-in="none" data-gulp="hop">${propArt('bin')}</div>
        ${unitSelected ? `<div class="label tag center sell-tag" style="${box([bx + 1, by - 13, bw, 10])}" data-k="sell-tag" data-in="rise">sell +${sellValue}g</div>` : ''}
        ${cookbook()}
        ${app.message ? `<div class="toast" style="${box(LAYOUT.toast)};animation-delay:-${toastAge}ms" data-k="toast:${toast.id}" data-in="rise"><span>${app.message}</span></div>` : ''}
        ${app.seasoning ? seasoningModal() : ''}
        ${chefTag()}
        ${app.naming ? namingCard(app.naming) : ''}
      </main>
    </div>`;
  if (app.naming) fillNamingCard(app.naming);
}

/** Online: the chef's name on the rail; click to change it. */
function chefTag(): string {
  const player = app.server && api.savedPlayer();
  if (!player) return '';
  return `<button class="newrun chef-tag" style="${box(LAYOUT.chef as Rect)}" data-action="chef" ${tipBox(`Chef ${esc(player.name)}`, '<p>Other chefs see this name when they meet your plate. Click to change it.</p>')}>${esc(player.name)}</button>`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The chef-name card: two word lists and a shuffle, or a name of your own. */
function namingCard(n: Naming): string {
  const options = (words: readonly string[], chosen: string) => words.map((w) => `<option${w === chosen ? ' selected' : ''}>${w}</option>`).join('');
  return `
    <div class="over-dim name-dim" data-k="name-dim" data-in="fade"></div>
    <form class="over-card name-card" style="${box([170, 62, 300, 196])}" data-k="name-card" data-in="drop" autocomplete="off">
      <div class="ribbon"><span>${n.renaming ? 'New name' : 'Hello, chef!'}</span></div>
      <p class="over-sub">${n.renaming ? 'Pick a new name.' : 'Pick your chef name. Other chefs see it when they meet your plate.'}</p>
      <div class="name-row">
        <select data-name="first" ${n.busy ? 'disabled' : ''}>${options(NAME_FIRST, n.first)}</select>
        <select data-name="second" ${n.busy ? 'disabled' : ''}>${options(NAME_SECOND, n.second)}</select>
        <button type="button" class="name-dice" data-action="name-shuffle" title="Shuffle" ${n.busy ? 'disabled' : ''}>${pix('dice')}</button>
      </div>
      <div class="over-plate-label">or write your own</div>
      <input class="name-input" data-name="custom" maxlength="20" placeholder="your own name" spellcheck="false" ${n.busy ? 'disabled' : ''}>
      <div class="name-preview">${n.error ? `<span class="name-error">${esc(n.error)}</span>` : `you'll be <b>${esc(chosenName(n))}</b>`}</div>
      <div class="name-buttons">
        <button type="button" class="newrun name-alt" data-action="${n.renaming ? 'name-cancel' : 'name-offline'}">${n.renaming ? 'cancel' : 'play offline'}</button>
        <button type="submit" class="big-btn" ${n.busy ? 'disabled' : ''}>${n.busy ? 'one moment...' : n.renaming ? 'rename ›' : 'open the kitchen ›'}</button>
      </div>
    </form>`;
}

/** The typed name isn't in the markup (so it can't break it): set it, and keep the card in step as you type. */
function fillNamingCard(n: Naming) {
  const input = root.querySelector<HTMLInputElement>('.name-input');
  if (input) input.value = n.custom;
}

function onNamingInput(el: HTMLInputElement | HTMLSelectElement) {
  const n = app.naming;
  const field = el.dataset.name as 'first' | 'second' | 'custom' | undefined;
  if (!n || !field) return;
  n[field] = el.value;
  if (field !== 'custom') n.custom = '';
  const problem = tidyName(n.custom) ? nameProblem(n.custom) : null;
  n.error = problem ?? undefined;
  const preview = root.querySelector('.name-preview');
  if (preview) preview.innerHTML = problem ? `<span class="name-error">${esc(problem)}</span>` : `you'll be <b>${esc(chosenName(n))}</b>`;
  if (field !== 'custom') {
    const input = root.querySelector<HTMLInputElement>('.name-input');
    if (input) input.value = '';
  }
}

function seasoningModal(): string {
  return `
    <div class="modal" data-k="modal" data-in="fade"></div>
    <div class="modal-card" data-k="modal-card">
      <div class="pg-title">Pick a new flavor</div>
      <div class="row">${FLAVORS.map((f) => `<button class="chip" data-action="season" data-flavor="${f}">${pix(f)} ${f}</button>`).join('')}</div>
      <button class="chip" data-action="cancel-season">cancel</button>
    </div>`;
}

// ---------- battle ----------

/** A food standing on its platter. Sprites stay at 1:1; depth comes from position and draw order (near lanes in front). */
interface FighterOpts {
  /** Battle id, for animation keys. */
  bid: number;
  /** First showing of this frame: play its lunges and popups. */
  fresh: boolean;
  /** Frame 0: foods are set down on their platters; later arrivals are summoned in. */
  opening: boolean;
  cheer: boolean;
  /** This frame: the food that acted, or a friend it reached (bracketed and joined to it by a dotted line). */
  role: '' | 'source' | 'linked' | 'target';
}

/** Hits this big shake the table and get a bigger number. */
const BIG_HIT = 5;
const ICONS = {
  buff: { cells: ['..#..', '.###.', '#####', '.###.', '.###.'], fill: '#7fd86a' },
  debuff: { cells: ['.###.', '.###.', '#####', '.###.', '..#..'], fill: '#b48cf0' },
  crust: { cells: ['#####', '#####', '.###.', '..#..'], fill: '#f0c04a' },
};

/** "+2 ⚔ +2 ♥" rising over a food that was buffed this moment, "-1 ⚔" for an attack loss: exactly what changed. */
function gainPop(marks: Mark[], fresh: boolean): string {
  if (!fresh) return '';
  const sum = (kind: string, key: 'amount' | 'hp') => marks.filter((m) => m.kind === kind).reduce((a, m) => a + (m[key] ?? 0), 0);
  const atk = sum('buff', 'amount'), hp = sum('buff', 'hp'), lost = sum('debuff', 'amount');
  const parts = [atk ? `<i>+${atk}</i>${pix('medal')}` : '', hp ? `<i>+${hp}</i>${pix('heart')}` : ''].join('');
  return (parts ? `<span class="pop gain">${parts}</span>` : '') + (lost ? `<span class="pop loss"><i>-${lost}</i>${pix('medal')}</span>` : '');
}

function fighter(side: 0 | 1, slot: number, u: UnitView | null, marks: Mark[], o: FighterOpts): string {
  const [ax, ay] = BATTLE.anchors[side][slot];
  const z = laneOf(slot) * 10 + (rowOf(slot) === 0 ? 2 : 1);
  const kinds = new Set(o.fresh ? marks.map((m) => m.kind) : []);
  // A food that was just eaten: a fork comes down where it stood.
  if (!u) return kinds.has('faint') ? `<div class="fork" style="left:${ax - 7}px;top:${ay - 52}px;z-index:${z + 1}">${pix('fork', 2)}</div>` : '';
  const sum = (kind: string) => (o.fresh ? marks.filter((m) => m.kind === kind).reduce((a, m) => a + (m.amount ?? 0), 0) : 0);
  const hit = sum('hit');
  const heal = sum('heal');
  const icon = (k: keyof typeof ICONS, x: number) => (kinds.has(k) ? `<i class="pop-ico" style="${pixelIcon(ICONS[k].cells, ICONS[k].fill, x, -12, 2)}"></i>` : '');
  // Statuses: a pixel flame, mould blob or snowflake rises with the amount (stacks added, or damage dealt).
  const status = (k: 'burn' | 'rot' | 'chill') => (kinds.has(k) ? `<span class="pop st st-${k}">${statBadge(k, sum(k) || 1, 2)}</span>` : '');
  const popups = [
    hit ? `<span class="pop dmg ${hit >= BIG_HIT ? 'big' : ''}">-${hit}</span>` : '',
    heal ? `<span class="pop heal">+${heal}</span>` : '',
    kinds.has('blocked') ? '<span class="pop info">blocked!</span>' : '',
    status('burn'),
    status('rot'),
    status('chill'),
    kinds.has('cleanse') ? '<span class="pop heal">clean!</span>' : '',
    gainPop(marks, o.fresh),
    icon('crust', 48),
  ].join('');
  const cls = [...kinds].map((k) => `fx-${k}`).join(' ') + (hit >= BIG_HIT ? ' big-hit' : '') + (o.role ? ` ${o.role}` : '');
  // Idle bob, continuous across re-renders: every food breathes on its own beat.
  const bob = -((performance.now() + slot * 270 + side * 130) % 1600);
  const id = `${o.bid}:${side}:${u.uid}`;
  return `
    <div class="fighter side-${side} ${cls} ${u.token ? 'token' : ''} ${o.cheer ? 'cheer' : ''}" data-inspect="${side}:${slot}"
      style="left:${ax - 32}px;top:${ay - 60}px;z-index:${z};--bob:${Math.round(bob)}ms" data-k="f:${id}" data-in="${o.opening ? 'drop' : 'pop'}" data-out="eaten">
      <div class="f-art">${unitArt(u.defId, u.level === 3)}</div>
      ${u.level > 1 && !u.token ? `<div class="f-lvl ${u.level === 3 ? 'cooked' : ''}" ${tip(u.level === 3 ? '<p>Cooked: level 3, with its cooked bonus.</p>' : '<p>Level 2.</p>')}>${u.level}</div>` : ''}
    </div>
    ${popups ? `<div class="f-pops" style="left:${ax - 32}px;top:${ay - 60}px;z-index:${90 + z}">${popups}</div>` : ''}
    <div class="f-tags" style="left:${ax - 45}px;top:${ay - 8}px;z-index:${40 + z}" data-k="ft:${id}" data-in="fade" data-out="fade-out">
      ${statBadge('atk', u.attack, 2, `data-vk="fa:${id}" data-v="${u.attack}"`)}${statBadge('hp', u.hp, 2, `data-vk="fh:${id}" data-v="${u.hp}"`)}${
''}${
        u.crust || u.burn || u.rot || u.chill ? `<span class="f-sts">${(['crust', 'burn', 'rot', 'chill'] as const).filter((k) => u[k] > 0).map((k) => statBadge(k, u[k], 1, `data-k="f${k}:${id}" data-vk="f${k}:${id}" data-v="${u[k]}"`)).join('')}</span>` : ''}
    </div>
`;
}

/** Team plaque: the plate's name and one pip per food still on it. */
/** A side's name plaque: its name, and its run so far (wins, the day, lives). */
function teamPlaque(side: 0 | 1, label: string, rec: { wins: number; lives: number } | undefined): string {
  const day = app.run.turn;
  const record = rec
    ? `<span class="plaque-stat" ${tip(`<p>${rec.wins} of ${COURSES_TO_WIN} courses won.</p>`)}>${pix('trophy')}<b>${rec.wins}</b></span>
       <span class="plaque-stat" ${tip(`<p>${rec.lives} lives left.</p>`)}>${pix('life')}<b>${rec.lives}</b></span>`
    : '';
  return `
    <div class="plaque side-${side}" style="${box(BATTLE.plaques[side])}">
      <div class="plaque-label">${label}</div>
      <div class="plaque-record">${record}<span class="plaque-day">day ${day}</span></div>
    </div>`;
}

/** The food whose attack or ability caused this frame's marks, if exactly one did. */
function sourceOf(f: BattleFrame): Mark | undefined {
  const sources = f.marks.filter((m) => m.kind === 'attack' || m.kind === 'ability');
  return sources.length === 1 ? sources[0] : undefined;
}
/**
 * This frame's attacks: each attacker with the enemy it hits. The two front foods in a lane usually trade
 * blows in the same frame; then they are `mutual` and charge into each other, meeting in the middle.
 */
function attackPairs(f: BattleFrame): { a: Mark; t: Mark; mutual: boolean }[] {
  const pairs = f.marks
    .filter((m) => m.kind === 'attack')
    .flatMap((a) => {
      const t = f.marks.find((m) => m.side !== a.side && (m.kind === 'hit' || m.kind === 'blocked'));
      return t ? [{ a, t }] : [];
    });
  return pairs.map(({ a, t }) => ({
    a, t, mutual: pairs.some((o) => o.a.side === t.side && o.a.slot === t.slot && o.t.side === a.side && o.t.slot === a.slot),
  }));
}
/** Seconds (at 1x) until the action lands: attackers reach their targets, or a spark arrives. */
const contactDelay = (f: BattleFrame) => (f.marks.some((m) => m.kind === 'shoot') ? 0.3 : attackPairs(f).length ? 0.26 : sourceOf(f) ? 0.27 : 0);
const currentFrame = (b: PendingBattle) => b.result.frames[Math.min(app.frame, b.result.frames.length - 1)];

const SPARK_KINDS = new Set(['hit', 'heal', 'buff', 'debuff', 'crust', 'blocked', 'summon', 'burn', 'rot', 'chill', 'cleanse', 'cooked']);

/** Stage point at the middle of a food standing in a battle slot. */
const fighterPoint = (side: number, slot: number): [number, number] => {
  const [ax, ay] = BATTLE.anchors[side][slot];
  return [ax, ay - 30];
};

/** Once per frame: sparks fly from the food that acted to everything it affected; a won battle throws confetti. */
/** Friends the acting food reached this frame (same side, not itself). */
function linkedTargets(f: BattleFrame, src: Mark | undefined): Mark[] {
  if (!src || src.kind !== 'ability') return [];
  const seen = new Set<number>();
  return f.marks.filter((m) => {
    if (m.side !== src.side || m.slot === src.slot || !SPARK_KINDS.has(m.kind) || seen.has(m.slot)) return false;
    seen.add(m.slot);
    return true;
  });
}

/** Where an attack connects: a white flash that bursts into a ring. */
function impact(stage: HTMLElement, [x, y]: [number, number], delay: number, speed: number, big: boolean) {
  const el = document.createElement('div');
  el.className = `impact ${big ? 'big' : ''}`;
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
  stage.appendChild(el);
  el.animate(
    [
      { scale: '0.2', opacity: 1, borderWidth: '6px' },
      { scale: '1', opacity: 1, borderWidth: '3px', offset: 0.35 },
      { scale: '1.5', opacity: 0, borderWidth: '1px' },
    ],
    { duration: 260 / speed, delay, easing: 'cubic-bezier(0.1, 0.8, 0.3, 1)', fill: 'forwards' },
  ).finished.then(() => el.remove(), () => el.remove());
}

/** What a battle frame sounds like: a bonk on contact (bigger for big hits), a chomp when a food is eaten, and the
 * effects that happened, a few at most so a busy frame stays readable. */
const EFFECT_SOUNDS: [Mark['kind'], Sfx][] = [
  ['cooked', 'cooked'], ['summon', 'summon'], ['blocked', 'block'], ['heal', 'heal'], ['burn', 'burn'], ['rot', 'rot'],
  ['chill', 'chill'], ['buff', 'buff'], ['debuff', 'debuff'], ['crust', 'crust'],
];
function battleSounds(f: BattleFrame, delay: number, after: number, speed: number, attack: boolean, ability: boolean) {
  const hits = f.marks.filter((m) => m.kind === 'hit');
  const biggest = Math.max(0, ...hits.map((m) => m.amount ?? 0));
  if (attack) sfx(biggest >= BIG_HIT ? 'bigHit' : 'hit', after);
  else if (ability) sfx('ability', delay);
  else if (hits.length) sfx('hit', after); // overtime, and damage with no attacker shown
  if (f.marks.some((m) => m.kind === 'faint')) sfx('nom', after + 120 / speed);
  const present = EFFECT_SOUNDS.filter(([kind]) => f.marks.some((m) => m.kind === kind && (kind !== 'crust' || (m.amount ?? 0) > 0)));
  present.slice(0, 3).forEach(([, name], i) => sfx(name, after + (60 + i * 70) / speed));
}

/**
 * A thrown attack: the thrower recoils, and a projectile (bean, pit, peppercorn, ball) arcs to
 * every food it hits, landing as the hit shows (contactDelay).
 */
function throwEffects(f: BattleFrame, stage: HTMLElement, delay: number, speed: number) {
  const shooter = f.marks.find((m) => m.kind === 'shoot');
  if (!shooter) return;
  const defId = f.plates[shooter.side][shooter.slot]?.defId;
  // A food with a thrown ability (Cherries) lobs; projectile foods throw by their pattern.
  const def = defId ? unitDef(defId) : undefined;
  const pattern = def?.attackPattern ?? ([...def?.abilities ?? [], ...def?.cooked?.abilities ?? []].some((a) => a.thrown) ? 'lob' : 'shot');
  const from = fighterPoint(shooter.side, shooter.slot);
  const el = root.querySelector<HTMLElement>(`.fighter[data-inspect="${shooter.side}:${shooter.slot}"] .f-art`);
  const back = shooter.side === 0 ? -4 : 4;
  el?.animate([{ translate: '0 0' }, { translate: `${back}px 1px`, scale: '0.9 1.1', offset: 0.3 }, { translate: '0 0' }], { duration: 260 / speed, delay, easing: 'ease-out' });
  const arc = pattern === 'lob' ? 46 : pattern === 'volley' ? 22 : pattern === 'spray' ? 14 : 6;
  const hits = f.marks.filter((m) => m.side !== shooter.side && (m.kind === 'hit' || m.kind === 'blocked' || (m.kind === 'crust' && (m.amount ?? 0) < 0)));
  const seen = new Map<string, number>();
  hits.slice(0, 8).forEach((m, i) => {
    const key = `${m.slot}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (m.kind === 'crust' && n > 0) return;
    const [tx, ty] = fighterPoint(m.side, m.slot);
    fling(stage, from, [tx + (n % 2 ? 6 : 0), ty - n * 3], `proj proj-${defId}`, { speed, delay: delay + i * 40 / speed, ms: 280, arc });
  });
  sfx('pew', delay);
}

function battleEffects(b: PendingBattle, delay: number) {
  const stage = root.querySelector<HTMLElement>('.stage');
  if (!stage) return;
  const f = currentFrame(b);
  const src = sourceOf(f);
  const speed = app.speed;
  const pairs = attackPairs(f);
  for (const { a, t, mutual } of pairs) {
    // An attack: the attacker winds up, charges across the table at its target, hits it and bounces back.
    // Two foods hitting each other charge at once and collide halfway.
    const el = root.querySelector<HTMLElement>(`.fighter[data-inspect="${a.side}:${a.slot}"]`);
    const [x0, y0] = fighterPoint(a.side, a.slot);
    const [x1, y1] = fighterPoint(t.side, t.slot);
    const dist = Math.hypot(x1 - x0, y1 - y0) || 1;
    const reach = mutual ? Math.max(0, dist / 2 - 24) : Math.max(0, dist - 44); // stop just short of the target
    const k = reach / dist;
    const dx = (x1 - x0) * k, dy = (y1 - y0) * k;
    const ux = (x1 - x0) / dist;
    if (el) {
      const z = el.style.zIndex;
      el.style.zIndex = '60';
      // Slow wind-up, an accelerating dash, a freeze on contact (hit-stop), then a springy return. Contact lands at
      // 43% of 600ms, which is when contactDelay() has the target react.
      el.animate(
        [
          { translate: '0 0', scale: '1 1', easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
          { translate: `${-ux * 7}px 1px`, scale: '0.82 1.16', offset: 0.24, easing: 'linear' }, // pull back and crouch
          { translate: `${-ux * 8}px 1px`, scale: '0.8 1.18', offset: 0.31, easing: 'cubic-bezier(0.6, 0, 1, 0.5)' }, // hold it
          { translate: `${dx}px ${dy - 2}px`, scale: '1.32 0.78', offset: 0.43, easing: 'steps(1, jump-end)' }, // dash, stretched
          { translate: `${dx + ux * 2}px ${dy}px`, scale: '0.84 1.14', offset: 0.44, easing: 'linear' }, // squash into it
          { translate: `${dx + ux * 2}px ${dy}px`, scale: '0.84 1.14', offset: 0.55, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' }, // hit-stop
          { translate: `${-ux * 3}px 0px`, scale: '1.04 0.97', offset: 0.84, easing: 'ease-in-out' }, // spring home, past it
          { translate: '0 0', scale: '1 1' },
        ],
        { duration: 600 / speed, delay },
      ).finished.then(() => (el.style.zIndex = z), () => (el.style.zIndex = z));
    }
    // In a patterned attack, sparks carry on from the main target to every other food it hits (the one behind for pierce, the neighbouring lanes for splash and fork...).
    const attackerDef = f.plates[a.side][a.slot]?.defId;
    const pattern = attackerDef ? patternOf(attackerDef) : null;
    if (pattern) {
      const extra = f.marks.filter((m) => m.side === t.side && m.slot !== t.slot && (m.kind === 'hit' || m.kind === 'blocked'));
      for (const m of new Map(extra.map((m) => [m.slot, m])).values()) {
        fling(stage, fighterPoint(t.side, t.slot), fighterPoint(m.side, m.slot), 'spark k-hit', { speed, delay: delay + 260 / speed, ms: 200, arc: 8 });
      }
    }
    // A burst where it connects (one shared burst when they collide).
    if (mutual && a.side === 1) continue;
    const hitAt: [number, number] = mutual ? [(x0 + x1) / 2, (y0 + y1) / 2] : [x0 + dx + ux * 20, y0 + dy];
    impact(stage, hitAt, delay + 258 / speed, speed, mutual);
    burst(stage, hitAt, 'ray', { speed, delay: delay + 250 / speed, count: mutual ? 16 : 12, spread: mutual ? 32 : 24 });
    burst(stage, hitAt, 'star', { speed, delay: delay + 250 / speed, count: 5, spread: 16 });
  }
  if (src && !pairs.length) {
    // Friends get a dotted line from the food that reached them; ability effects on enemies are lobbed as a spark.
    for (const m of linkedTargets(f, src)) orb(stage, fighterPoint(src.side, src.slot), fighterPoint(m.side, m.slot), `k-${m.kind}`, { speed, delay, ms: 280 });
    const seen = new Set<string>();
    for (const m of f.marks) {
      const key = `${m.side}:${m.slot}`;
      if (!SPARK_KINDS.has(m.kind) || seen.has(key) || m.side === src.side) continue;
      seen.add(key);
      fling(stage, fighterPoint(src.side, src.slot), fighterPoint(m.side, m.slot), `spark k-${m.kind}`, { speed, delay, ms: 200, arc: 10 });
    }
  }
  const after = delay + (contactDelay(f) * 1000) / speed;
  // A cooked bonus going off names itself over the food, in flames.
  for (const key of new Set(f.marks.filter((m) => m.kind === 'cooked').map((m) => `${m.side}:${m.slot}`))) {
    const [side, slot] = key.split(':').map(Number);
    const [x, y] = fighterPoint(side, slot);
    floater(stage, x, y - 44, 'Cooked!', 'callout cooked', speed, delay);
    burst(stage, [x, y - 6], 'ember', { speed, delay, count: 10, spread: 24 });
  }
  for (const m of f.marks) {
    if (m.kind === 'faint') burst(stage, fighterPoint(m.side, m.slot), 'crumb', { speed, delay: after, count: 14, spread: 32 });
    if (m.kind === 'summon') burst(stage, fighterPoint(m.side, m.slot), 'puff', { speed, delay, count: 10, spread: 26 });
  }
  throwEffects(f, stage, delay, speed);
  battleSounds(f, delay, after, speed, pairs.length > 0, !!src);
  if (app.frame >= b.result.frames.length - 1) {
    const o = b.result.outcome;
    sfx(o === 'win' ? 'win' : o === 'loss' ? 'lose' : 'draw', after + 350 / speed);
  }
  // A big hit shakes the table.
  const biggest = Math.max(0, ...[0, 1].flatMap((side) => [0, 1, 2, 3, 4, 5].map((slot) =>
    f.marks.filter((m) => m.side === side && m.slot === slot && m.kind === 'hit').reduce((a, m) => a + (m.amount ?? 0), 0))));
  const wrap = root.querySelector('.stage-wrap');
  if (biggest > 0 && biggest < BIG_HIT && wrap && pairs.length) {
    wrap.animate(
      [{ transform: 'translate(0, 0)' }, { transform: `translate(${pairs[0].a.side === 0 ? 2 : -2}px, 1px)` }, { transform: 'translate(0, 0)' }],
      { duration: 110 / speed, delay: after, easing: 'steps(2, jump-end)' },
    );
  }
  if (biggest >= BIG_HIT && wrap) {
    const k = Math.min(3, 1 + Math.floor(biggest / 8));
    wrap.animate(
      [{ transform: 'translate(0, 0)' }, { transform: `translate(${-k * 3}px, ${k}px)` }, { transform: `translate(${k * 3}px, ${-k}px)` }, { transform: `translate(${-k}px, 0)` }, { transform: 'translate(0, 0)' }],
      { duration: 260 / speed, delay: after, easing: 'steps(4, jump-end)' },
    );
  }
  const done = app.frame >= b.result.frames.length - 1;
  if (done && b.result.outcome === 'win') {
    const [x, y, w] = BATTLE.result;
    for (let i = 0; i < 36; i++) {
      const from: [number, number] = [x + w / 2 + (Math.random() - 0.5) * 40, y + 10];
      const to: [number, number] = [x + w / 2 + (Math.random() - 0.5) * 300, y + 60 + Math.random() * 140];
      fling(stage, from, to, `confetti c${i % 4}`, { delay: delay + 260 + Math.random() * 200, ms: 900 + Math.random() * 500, arc: 40 + Math.random() * 50 });
    }
  }
}

/** Card shown while a food is held during battle: what it is and what it does, with its current stats. */
/** The rarity name in its colour, with a gem. */
/** What each rarity means, for tooltips. */
/** When each rarity starts showing up in the buffet. */
const RARITY_TEXT: Record<string, string> = {
  common: 'In the buffet from day 1.',
  uncommon: 'In the buffet from day 3.',
  rare: 'In the buffet from day 5.',
  epic: 'In the buffet from day 7.',
  legendary: 'In the buffet from day 9.',
  exotic: 'In the buffet from day 11.',
  mythic: 'Never in the buffet: only delivered through the special cubby.',
};

/** A rarity as its gem and name. */
const rarityName = (r: string) => `<span class="rarity-name rarity-${r}">${gemIcon(r)}${r}</span>`;
const rarityTag = (defId: string) => rarityName(rarityOf(unitDef(defId)));

function inspectCard(side: 0 | 1, slot: number, u: UnitView): string {
  const d = unitDef(u.defId);
  const flavors = d.allFlavors ? 'every flavor' : (u.flavors ?? [u.flavor]).map(flavorTag).join(' ');
  const cooked = u.level === 3 && d.cooked ? ` <span class="cooked-line">${pix('flame')} Cooked: ${foodText(d.cooked.text, 0)}</span>` : '';
  const text = foodText(d.text, d.values[u.level - 1], daysOf(d, u.level)) + cooked;
  // Each badge stays with its label, so a line only ever breaks between stats.
  const pair = (badge: string, label: string) => `<span class="stat-pair">${badge}${label}</span>`;
  const stats = [
    pair(statBadge('atk', u.attack), 'attack'),
    pair(statBadge('hp', u.hp, 1), 'HP'),
    u.crust ? pair(statBadge('crust', u.crust), 'Crust') : '',
    ...(['burn', 'rot', 'chill'] as const).map((k) => (u[k] > 0 ? pair(statBadge(k, u[k]), STATUS_NAME[k]) : '')),
  ].join('');
  const held = u.item ? `<p class="dim">Holding ${itemDef(u.item).name}: ${itemDef(u.item).text}</p>` : '';
  const statusWords = (['burn', 'rot', 'chill'] as const).filter((k) => u[k] > 0).map((k) => STATUS_NAME[k]).join(' ');
  const [ax, ay] = BATTLE.anchors[side][slot];
  const w = 160;
  const left = Math.max(4, Math.min(LAYOUT.size[0] - w - 4, ax - w / 2));
  // Above the food (growing upward from just over its head), or below it for foods near the top of the table.
  const place = ay > 200 ? `bottom:${LAYOUT.size[1] - (ay - 62)}px` : `top:${ay + 26}px`;
  return `
    <div class="inspect-card" style="left:${left}px;${place};width:${w}px" data-k="inspect:${side}:${slot}" data-in="pop">
      <div class="pg-title">${u.level === 3 ? d.cookedName : d.name}${u.token ? '' : ` · level ${u.level}`}</div>
      <p class="dim">${flavors}${u.token ? ' · summoned' : ` · ${rarityTag(d.id)}`}</p>
      <p class="stat-line">${stats}</p>
      ${held}
      <p>${text}</p>
      ${(u.uses ?? []).map(([left, all]) => `<p class="dim">${left}/${all} this battle</p>`).join('')}
      ${glossary(`${text} ${held} ${u.crust ? 'Crust' : ''} ${statusWords}`)}
    </div>`;
}

const STATUS_NAME = { burn: 'Burn', rot: 'Rot', chill: 'Chill' } as const;
/**
 * A side's flavor bonuses, on a little chalkboard under its name plaque: each active flavor with its count and what
 * it does (the tiers that replace each other show only the higher one). Hover a line for the full text.
 */
function flavorSide(side: 0 | 1, tally: Partial<Record<Flavor, number>> | undefined): string {
  const active = (Object.entries(tally ?? {}) as [Flavor, number][])
    .map(([f, n]) => [f, n, flavorTier(n)] as const)
    .filter(([, , t]) => t > 0)
    .sort((a, b) => b[1] - a[1] || FLAVORS.indexOf(a[0]) - FLAVORS.indexOf(b[0]));
  if (active.length === 0) return '';
  const lines = active.map(([f, n, t]) => {
    const short = FLAVOR_BONUS[f].slice(t >= 2 ? 1 : 0, t).join(' · ');
    const long = FLAVOR_BONUS_LONG[f].slice(0, t).map((x) => `<p>${x}</p>`).join('');
    return `<div class="chalk-line on" ${tip(`<p><b>${f} x${n}</b></p>${long}`)}>${pix(f)}<b>${n}</b><span>${short}</span></div>`;
  }).join('');
  const x = side === 0 ? 10 : LAYOUT.size[0] - 10 - 132;
  return `<div class="flavor-side chalkboard" style="left:${x}px;top:44px;width:132px">
    <div class="chalk-title">Flavors</div>${lines}</div>`;
}

/** Draws the current battle frame. Returns true the first time a frame is shown (its effects should play). */
function renderBattle(battle: PendingBattle): boolean {
  const frames = battle.result.frames;
  const idx = Math.min(app.frame, frames.length - 1);
  const f = frames[idx];
  const done = idx >= frames.length - 1;
  const fresh = idx !== shownFrame;
  const opening = shownFrame === -1;
  shownFrame = idx;
  const bid = battle.id ?? 0;
  const outcome = battle.result.outcome;
  const winner = done && outcome !== 'draw' ? (outcome === 'win' ? 0 : 1) : -1;
  const marksFor = (side: 0 | 1, slot: number) => f.marks.filter((m) => m.side === side && m.slot === slot);
  const src = fresh ? sourceOf(f) : undefined;
  const linked = linkedTargets(f, src);
  const pairs = fresh ? attackPairs(f) : [];
  const roleOf = (side: number, slot: number): FighterOpts['role'] =>
    (src && src.side === side && src.slot === slot) || pairs.some(({ a }) => a.side === side && a.slot === slot) ? 'source'
      : linked.some((m) => m.side === side && m.slot === slot) ? 'linked'
      : pairs.some(({ t }) => t.side === side && t.slot === slot) ? 'target'
      // every other food an attack lands on this frame (pierce, splash, fork...) is marked as a target too
      : pairs.length && f.marks.some((m) => m.side === side && m.slot === slot && (m.kind === 'hit' || m.kind === 'blocked')) && pairs.some(({ a }) => a.side !== side) ? 'target' : '';
  const fighters = ([0, 1] as const)
    .flatMap((side) => [0, 1, 2, 3, 4, 5].map((slot) =>
      fighter(side, slot, f.plates[side][slot], marksFor(side, slot), { bid, fresh, opening, cheer: side === winner, role: roleOf(side, slot) })))
    .join('');
  const [rx, ry, rw, rh] = BATTLE.round;
  const held = app.inspect && f.plates[app.inspect.side][app.inspect.slot];
  // Reactions wait for the attacker (or the spark from the food that acted) to reach them.
  const fxDelay = fresh ? contactDelay(f) : 0;

  root.innerHTML = `
    <div class="stage-wrap" style="--s:${stageScale()}">
      <main class="stage battle-stage" style="--spd:${app.speed};--fxd:${fxDelay}s">
        <img class="scene-bg" src="${battleUrl}" alt="" draggable="false">
        ${teamPlaque(0, app.server ? esc(api.savedPlayer()?.name ?? 'Your plate') : 'Your plate', battle.me ?? { wins: app.run.courses, lives: app.run.lives })}
        ${teamPlaque(1, esc(battle.opponent), battle.foe)}
        ${flavorSide(0, battle.result.flavors?.[0])}${flavorSide(1, battle.result.flavors?.[1])}
        <div class="round-text" style="${box([rx + 3, ry + 3, rw - 6, rh - 6])}" data-vk="round:${bid}" data-v="${f.round}">${f.round > 0 ? `turn ${f.round}` : 'serve!'}</div>
        ${fighters}
        <div class="caption" style="${box(BATTLE.caption)}"><div class="caption-text" data-vk="cap:${bid}" data-v="${idx}" data-va="caption">${captionHtml(f.text)}</div></div>
        ${done ? '' : `<div class="hold-hint" style="${box([6, 338, 86, 12])}" data-k="hint" data-in="fade">hold a food to read it</div>`}
        ${held ? inspectCard(app.inspect!.side, app.inspect!.slot, held) : ''}
        <div class="controls" style="${box(BATTLE.controls)}">
          ${soundButton('chip')}${done ? '' : `<button class="chip" data-action="speed" data-k="speed" data-in="fade" data-vk="speed" data-v="${app.speed}">${app.speed}x</button><button class="chip" data-action="skip" data-k="skip" data-in="fade">skip</button>`}
        </div>
        ${done
          ? `<div class="result-card ${outcome}" style="${box(BATTLE.result)}" data-k="result:${bid}" data-in="${outcome === 'loss' ? 'thud' : 'stamp'}" data-delay="250">
               <div class="ribbon"><span>${outcome === 'win' ? 'Victory!' : outcome === 'loss' ? 'Defeat' : 'Draw'}</span></div>
               ${resultDetail(outcome)}
               <button class="big-btn" data-action="continue">back to the kitchen ›</button>
             </div>`
          : ''}
      </main>
    </div>`;

  // Holding a food pauses the battle so its card stays up; letting go resumes it. The opening frame waits for the
  // scene transition and for the foods to be set down.
  if (!done && !held) {
    timer = window.setTimeout(() => {
      app.frame++;
      render();
    }, 950 / app.speed + (opening ? 2 * WIPE_MS + 300 : 0));
  }
  return fresh;
}

/** A row of the run's trophies: earned ones gold, the rest grey; `fresh` marks the one just won. */
function trophyRow(earned: number, scale: number, fresh = -1): string {
  return Array.from({ length: COURSES_TO_WIN }, (_, i) =>
    `<span class="trophy-slot ${i === fresh ? 'fresh' : ''}" style="--i:${i}">${pix(i < earned ? 'trophy' : 'trophyOff', scale)}</span>`).join('');
}

/** A row of the run's lives; `breaking` marks the one this loss costs. */
function lifeRow(lives: number, scale: number, breaking = -1): string {
  return Array.from({ length: START_LIVES }, (_, i) =>
    `<span class="star-slot ${i === breaking ? 'breaking' : ''}">${pix(i < lives || i === breaking ? 'life' : 'lifeOff', scale)}</span>`).join('');
}

/** What the battle means for the run (shown before Continue applies it). */
function resultDetail(outcome: 'win' | 'loss' | 'draw'): string {
  const { run } = app;
  if (outcome === 'win') {
    return `<div class="result-row trophies">${trophyRow(run.courses + 1, 1, run.courses)}</div>
      <p class="result-line">Course won: <b>${run.courses + 1}</b> of ${COURSES_TO_WIN}</p>`;
  }
  if (outcome === 'loss' && run.turn >= 3) {
    return `<div class="result-row">${lifeRow(run.lives - 1, 2, run.lives - 1)}</div>
      <p class="result-line">${run.lives - 1 > 0 ? `You lost a life. <b>${run.lives - 1}</b> left.` : 'That was your last life.'}</p>`;
  }
  return `<div class="result-row">${lifeRow(run.lives, 2)}</div>
    <p class="result-line">${outcome === 'loss' ? 'The first two days are on the house: no life lost.' : 'Nobody finished their plate. No life lost.'}</p>`;
}

/** Game over: a card over the dimmed kitchen with the run's trophies, its numbers and the plate that ended it. */
function renderOver() {
  const { run } = app;
  const won = run.courses >= COURSES_TO_WIN;
  const plate = run.plate.filter((u): u is NonNullable<typeof u> => !!u);
  root.innerHTML = `
    <div class="stage-wrap" style="--s:${stageScale()}">
      <main class="stage over-stage">
        <img class="scene-bg" src="${kitchenUrl}" alt="" draggable="false">
        <div class="over-dim"></div>
        <div class="over-card ${won ? 'won' : 'lost'}" style="${box([150, 50, 340, 228])}" data-k="over" data-in="drop">
          <div class="ribbon"><span>${won ? 'Michelin-worthy!' : 'Kitchen closed'}</span></div>
          <p class="over-sub">${won ? 'Ten courses served. You won the run!' : 'Out of lives. Your kitchen closes for the night.'}</p>
          <div class="result-row trophies">${trophyRow(run.courses, 2)}</div>
          <div class="over-stats">
            <div><b>${run.courses}</b><span>courses won</span></div>
            <div><b>${run.turn - 1}</b><span>days played</span></div>
            <div><b>${Math.max(0, run.lives)}</b><span>lives left</span></div>
          </div>
          <div class="over-plate-label">${won ? 'the winning plate' : 'your last plate'}</div>
          <div class="over-plate">${plate.map((u) => `<div class="over-food">${unitArt(u.defId, levelOf(u.copies) === 3)}</div>`).join('') || '<span class="dim">empty</span>'}</div>
          <button class="big-btn" data-action="new-run">start a new run ›</button>
        </div>
      </main>
    </div>`;
}

/** A won run rains confetti over the game-over card. */
function overConfetti(delay: number) {
  const stage = root.querySelector<HTMLElement>('.stage');
  if (!stage) return;
  for (let i = 0; i < 60; i++) {
    const x = 160 + Math.random() * 320;
    fling(stage, [320 + (Math.random() - 0.5) * 60, 40], [x, 200 + Math.random() * 150], `confetti c${i % 4}`, {
      delay: delay + 300 + Math.random() * 700, ms: 1100 + Math.random() * 700, arc: 50 + Math.random() * 60,
    });
  }
}

// ---------- tooltips ----------
// One pixel text box on the stage for whatever [data-tip] is under the pointer. It is redrawn after every render
// (renders replace the stage), so it stays put while battles play and the kitchen updates.

let pointer: { x: number; y: number } | null = null;
let tipTarget: string | null = null;

function updateTip() {
  const stage = root.querySelector<HTMLElement>('.stage');
  const old = root.querySelector('.tipbox');
  const el = pointer && !drag?.ghost ? document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>('[data-tip]') : null;
  const html = el?.dataset.tip ?? null;
  if (!el || !html || !stage) {
    old?.remove();
    tipTarget = null;
    return;
  }
  const fresh = html !== tipTarget;
  tipTarget = html;
  const box = old instanceof HTMLElement && !fresh ? old : document.createElement('div');
  if (box !== old) {
    old?.remove();
    box.className = 'tipbox fresh';
    box.innerHTML = html;
    stage.appendChild(box);
  }
  // Below the thing hovered, or above it when there's no room; kept inside the stage.
  const s = stage.getBoundingClientRect();
  const k = s.width / LAYOUT.size[0];
  const r = el.getBoundingClientRect();
  const x0 = (r.left - s.left) / k, y0 = (r.top - s.top) / k, w0 = r.width / k, h0 = r.height / k;
  const w = box.offsetWidth, h = box.offsetHeight;
  const left = Math.round(Math.max(4, Math.min(LAYOUT.size[0] - w - 4, x0 + w0 / 2 - w / 2)));
  const below = y0 + h0 + 3;
  const top = Math.round(below + h <= LAYOUT.size[1] - 4 ? below : Math.max(4, y0 - h - 3));
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
}

root.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return; // touch has no hover: a tap shows the tip instead (see pointerdown)
  pointer = { x: e.clientX, y: e.clientY };
  updateTip();
});
root.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'touch') return; // a lifted finger "leaves": keep the tapped tip up until the next tap
  pointer = null;
  updateTip();
});

/** Keywords in a food's text become hoverable, each explaining itself. */
function keywordify(html: string): string {
  const all = new RegExp(GLOSSARY.map((g) => g.re.source).join('|'), 'gi');
  return html.replace(all, (m) => {
    const g = GLOSSARY.find((x) => x.re.test(m));
    return g ? `<span class="kw" ${tip(`<p>${g.icon()}<b>${g.name}:</b> ${g.text}</p>`)}>${m}</span>` : m;
  });
}

/**
 * The conditions in food text: when an ability happens (Start of battle, End of day, Hit, Every 2 turns...). Longer
 * phrases come first so "First time hit" wins over "hit".
 */
const CONDITIONS = new RegExp(
  [
    'Start of battle', 'Start of day', 'start of day', 'End of day', 'end of day', 'at the end of every turn', 'First time hit', 'First attack each battle',
    'Every \\d+(?:st|nd|rd|th) time hit', 'Every \\d+ turns', 'Every turn', 'In the fridge', 'Friend summoned', 'Friend sold', 'Friend eaten', 'Crust broken', 'Level up', 'Refill', 'Start of battle, from any row',
    'When the friend ahead attacks', 'When the friend ahead is hit', 'when the friend ahead attacks', 'when the friend ahead is hit', 'when hit', 'each level up',
    'Pierce attack', 'Splash attack', 'Fork attack', 'Escalating attack', 'Hit or eaten', 'every \\d+(?:st|nd|rd|th) time hit', 'every turn', 'Hit', 'Sell', 'Bought', 'Eaten',
  ].map((c) => `\\b${c}\\b`).join('|'),
  'g', // case-sensitive: "Sell:" is a condition, "sell value" isn't
);

/**
 * A food's ability text for display: conditions coloured, a leading nickname ("Piggy bank:", "Chewy:") muted, the
 * level's value in bold, and keywords hoverable.
 */
function foodText(text: string, value: number, days?: number): string {
  const nick = /^([A-Z][^:.]{2,24}): /.exec(text);
  const isCondition = nick && new RegExp(`^(?:${CONDITIONS.source})$`, 'i').test(nick[1]);
  let body = nick && !isCondition ? text.slice(nick[0].length) : text;
  body = body.replace(CONDITIONS, (m) => `<span class="cond">${m}</span>`);
  if (nick && !isCondition) body = `<span class="nick">${nick[1]}:</span> ${body}`;
  // The Marbled-style lower-case "hit," also counts.
  body = body.replace(/(<\/span> )hit,/, '$1<span class="cond">hit</span>,');
  if (days !== undefined) body = body.replace(/\{d\}/g, `<b>${days}</b>`);
  return keywordify(body.replace(/\{v\}/g, `<b>${value}</b>`));
}

/** Battle captions: food names get their flavor icon, flavor counts get theirs. */
const CAPTION_FOODS = (() => {
  const flavorOf = new Map<string, Flavor>();
  for (const u of UNITS) {
    flavorOf.set(u.name, u.flavor);
    flavorOf.set(u.cookedName, u.flavor);
  }
  const names = [...flavorOf.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return { flavorOf, re: new RegExp(`(${names.join('|')})`, 'g') };
})();

function captionHtml(text: string): string {
  return text
    .replace(CAPTION_FOODS.re, (n) => `<span class="cap-food">${pix(CAPTION_FOODS.flavorOf.get(n)!)}${n}</span>`)
    .replace(/\b(Spicy|Sweet|Sour|Salty|Savory) x(\d)/g, (m, f: string) => `<span class="cap-food">${pix(f.toLowerCase() as Flavor)}${m}</span>`);
}

// ---------- input: click, drag and drop, keys ----------

function parseLoc(value: string): Loc {
  const [area, index] = value.split(':');
  return { area: area as Loc['area'], index: Number(index) };
}

function parseDrag(value: string): Selection {
  const [kind, area, index] = value.split(':');
  if (kind === 'special') return { kind: 'special' };
  if (kind === 'pick') return { kind: 'pick', index: Number(area) };
  if (kind === 'offer') return { kind: 'offer', src: area === 'special' ? { area: 'special', index: 0 } : { area: area as 'market' | 'fridge', index: Number(index) } };
  return { kind: 'unit', loc: { area: area as Loc['area'], index: Number(index) } };
}

function drop(target: string) {
  if (target === 'sell') {
    if (app.selected?.kind === 'unit') sellSelected();
    else {
      app.selected = null;
      render();
    }
    return;
  }
  if (target === 'tray' || target === 'refill') {
    const sel = app.selected;
    if (sel?.kind === 'special' && (target === 'tray' || app.run.special?.kind === 'premium')) return openSpecial();
    if (target === 'tray' && sel?.kind === 'unit') return report({ ok: false, error: 'The counter tray is only for pairs and boxes.' });
    app.selected = null;
    return render();
  }
  onDropSlot(parseLoc(target));
}

interface DragState {
  source: Selection;
  el: HTMLElement;
  startX: number;
  startY: number;
  /** Touch drags carry the food above the finger, where it can be seen. */
  lift: number;
  ghost?: HTMLElement;
  over?: HTMLElement;
}

let drag: DragState | null = null;
let suppressClick = false;

root.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (e.pointerType === 'touch') {
    pointer = { x: e.clientX, y: e.clientY };
    updateTip();
  }
  if (app.battle) {
    const food = (e.target as HTMLElement).closest<HTMLElement>('[data-inspect]');
    if (!food) return;
    e.preventDefault();
    const [side, slot] = food.dataset.inspect!.split(':').map(Number);
    app.inspect = { side: side as 0 | 1, slot };
    render();
    return;
  }
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-drag]');
  if (!el) return;
  drag = { source: parseDrag(el.dataset.drag!), el, startX: e.clientX, startY: e.clientY, lift: e.pointerType === 'touch' ? 34 : 0 };
});

/** Pointer position in stage pixels (the stage is scaled with a CSS transform). */
function stagePoint(e: PointerEvent): [number, number] {
  const stage = root.querySelector<HTMLElement>('.stage');
  if (!stage) return [e.clientX, e.clientY];
  const r = stage.getBoundingClientRect();
  const s = r.width / LAYOUT.size[0];
  return [Math.round((e.clientX - r.left) / s), Math.round((e.clientY - r.top) / s)];
}

window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
    const ghost = drag.el.cloneNode(true) as HTMLElement;
    for (const n of [ghost, ...ghost.querySelectorAll('*')]) ['data-k', 'data-vk', 'data-drag'].forEach((a) => n.removeAttribute(a));
    ghost.classList.add('drag-ghost');
    ghost.classList.remove('selected');
    app.selected = drag.source;
    render();
    root.querySelector('.stage')?.appendChild(ghost);
    // What's being carried leaves a faded spot behind.
    root.querySelector(`[data-drag="${drag.el.dataset.drag}"]`)?.classList.add('lifted');
    document.body.classList.add('dragging');
    drag.ghost = ghost;
    sfx('pick');
  }
  const [x, y] = stagePoint(e);
  drag.ghost.style.left = `${x - 20}px`;
  drag.ghost.style.top = `${y - 24 - drag.lift}px`;
  // Recompute (a render may have replaced the element we were over).
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-drop]') ?? undefined;
  if (over !== drag.over || (over && !over.classList.contains('drop-hover'))) {
    drag.over?.classList.remove('drop-hover');
    over?.classList.add('drop-hover');
    drag.over = over;
    const selling = over?.dataset.drop === 'sell' && drag.source?.kind === 'unit';
    drag.ghost.classList.toggle('over-bin', selling);
    root.querySelector('.stage')?.classList.toggle('over-bin', selling);
    // Placing a food: light up the plate slots it would reach from here.
    const spot = over?.dataset.drop?.startsWith('plate:') ? Number(over.dataset.drop.split(':')[1]) : -1;
    const reach = spot >= 0 ? reachFrom(spot, heldDefId()) : new Set<number>();
    root.querySelectorAll<HTMLElement>('[data-slot^="plate:"]').forEach((el) => {
      el.classList.toggle('reach', reach.has(Number(el.dataset.slot!.split(':')[1])));
    });
  }
});

/** Letting go of a held food (anywhere) hides its card and resumes the battle. */
function releaseInspect() {
  if (!app.inspect) return;
  app.inspect = undefined;
  render();
}
window.addEventListener('pointercancel', () => {
  releaseInspect();
  const d = drag;
  drag = null;
  if (!d?.ghost) return;
  // The browser took the touch away mid-drag: put the food back.
  d.ghost.remove();
  document.body.classList.remove('dragging');
  app.selected = null;
  render();
});
// A long press on a touch screen shouldn't open a menu or select text.
root.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('pointerup', (e) => {
  releaseInspect();
  const d = drag;
  drag = null;
  if (!d?.ghost) return;
  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-drop]');
  // The next render animates from here: the food lands where it was let go (or flies home).
  const r = d.ghost.getBoundingClientRect();
  const t = target?.getBoundingClientRect();
  pendingDrop = {
    key: d.el.dataset.k ?? '',
    rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    target: t && { left: t.left, top: t.top, width: t.width, height: t.height },
  };
  d.ghost.remove();
  document.body.classList.remove('dragging');
  if (e.pointerType === 'touch') pointer = null; // no tip for whatever was under the finger when the drag began
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 0);
  if (target) drop(target.dataset.drop!);
  else app.selected = null;
  if (pendingDrop) render(); // nothing happened: still redraw so the food flies back
});

root.addEventListener('click', (e) => {
  if (suppressClick) return;
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action],[data-slot],[data-offer],[data-special],[data-pick]');
  if (!el) return;
  if (el.dataset.action) {
    if (!(el as HTMLButtonElement).disabled) onAction(el.dataset.action, el);
  } else if (el.dataset.special) {
    onSpecial();
  } else if (el.dataset.pick) {
    onPick(Number(el.dataset.pick));
  } else if (el.dataset.offer) {
    onOffer({ area: 'market', index: Number(el.dataset.offer.split(':')[1]) });
  } else if (el.dataset.slot) {
    onClickSlot(parseLoc(el.dataset.slot));
  }
});

// Audio can only start from a gesture. On touch screens that means the finger lifting (touchend), not landing.
for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) document.addEventListener(type, unlockAudio, true);

// The chef-name card: its fields update as you type; Enter or the button submits.
root.addEventListener('input', (e) => onNamingInput(e.target as HTMLInputElement));
root.addEventListener('change', (e) => onNamingInput(e.target as HTMLSelectElement));
root.addEventListener('submit', (e) => {
  e.preventDefault();
  void submitName();
});

document.addEventListener('keydown', (e) => {
  if (app.naming || (e.target as HTMLElement).closest?.('input, select')) return;
  if (e.key === 'm') {
    toggleMute();
    return render();
  }
  if (app.battle || app.seasoning || isOver(app.run)) return;
  if (e.key === 'r') onAction('reroll', root);
  else if (e.key === 's') sellSelected();
  else if (e.key === 'Escape') {
    app.selected = null;
    render();
  }
});

const rescale = () => root.querySelector<HTMLElement>('.stage-wrap')?.style.setProperty('--s', String(stageScale()));
window.addEventListener('resize', rescale);
window.visualViewport?.addEventListener('resize', rescale); // phone toolbars sliding in and out

// Installed as an app (index.html links a manifest): a service worker keeps it playable offline. Single-page hosts
// (the Artifact build) have no manifest and skip this.
if ('serviceWorker' in navigator && document.querySelector('link[rel="manifest"]') && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

if (app.battle) app.frame = app.battle.result.frames.length - 1;
render();
void connect();
