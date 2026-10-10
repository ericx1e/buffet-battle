// The kitchen office: the dev site. It reads the API's admin routes (server/src/admin.ts) and works everything out
// here in the browser with the game's own code: who's playing, which foods get picked and win, what players buy,
// and every real battle, which opens in the game's battle screen.
import './admin.css';
import { STAGES, battleLift, score, stageOf } from '../analysis/lift';
import { type Action, applyAction } from '../sim/actions';
import type { Outcome } from '../sim/battle';
import { botOpponent } from '../sim/bot';
import { ITEMS, MARKET_UNITS, itemDef, unitDef } from '../sim/data';
import { type RunState, getOffer, getUnit } from '../sim/run';
import type { Plate, UnitInstance } from '../sim/types';
import { levelOf } from '../sim/types';
import { GAME_VERSION } from '../sim/version';
import { itemArt, unitArt } from '../ui/art';

const API = (import.meta.env.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:8787') as string;
const KEY_STORE = 'buffetbattle.adminKey';
const root = document.getElementById('admin')!;

// ---------- data ----------

interface Overview {
  players: number;
  signups: { date: string; n: number }[];
  active: { date: string; chefs: number; days: number }[];
  runs: Record<string, number>;
  reached: { days: number; status: 'won' | 'lost'; n: number }[];
  battles: { n: number; bots: number | null; wins: number | null; draws: number | null };
  versions: { version: string; plates: number; chefs: number; first: number; last: number }[];
  /** Sign in with Google: chefs linked to an account, links by day (last 30), and extra devices signed in. */
  google?: { chefs: number; linked: { date: string; n: number }[]; devices: number };
}

interface Battle {
  id: number;
  day: number;
  seed: number;
  outcome: Outcome;
  botSeed: number | null;
  at: number;
  mine: Plate;
  wins: number;
  lives: number;
  name: string;
  theirs: Plate | null;
  oWins: number | null;
  oLives: number | null;
  oName: string | null;
}

interface Day {
  id: number;
  runId: string;
  day: number;
  morning: RunState;
  actions: Action[];
  at: number;
}

type Tab = 'overview' | 'foods' | 'kitchen' | 'battles';

const state = {
  key: read(KEY_STORE),
  tab: (location.hash.slice(1) as Tab) || 'overview',
  version: '',
  overview: null as Overview | null,
  error: '',
  battles: new Map<string, Promise<Battle[]>>(),
  days: new Map<string, Promise<Day[]>>(),
  foods: { stage: -1, sort: 'pick', lift: new Map<string, Map<string, { n: number; sum: number }[]>>(), lifting: '' },
  kitchenStage: -1,
  filter: { day: 0, foe: 'all', outcome: 'all', food: '', shown: 60 },
};

function read(k: string): string {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
}

class AuthError extends Error {}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(API + path, { headers: { authorization: `Admin ${state.key}` } });
  if (res.status === 401) throw new AuthError('That key was not accepted.');
  if (!res.ok) throw new Error(`The API said ${res.status}.`);
  return res.json() as Promise<T>;
}

/** Every row of a paged admin route for the current version. */
async function getAll<T extends { id: number }>(route: 'battles' | 'days', label: string): Promise<T[]> {
  const out: T[] = [];
  for (;;) {
    const el = root.querySelector('.progress');
    if (el) el.textContent = `Loading ${label}: ${out.length}...`;
    const page = await get<T[]>(`/admin/${route}?version=${encodeURIComponent(state.version)}&after=${out.at(-1)?.id ?? 0}`);
    out.push(...page);
    if (page.length === 0 || page.length < (route === 'battles' ? 500 : 200)) break;
  }
  return out;
}

/** This version's battles and served days, each loaded once (a failed load is tried again next time). */
function battles(): Promise<Battle[]> {
  const v = state.version;
  if (!state.battles.has(v)) state.battles.set(v, getAll<Battle>('battles', 'battles').catch((e) => (state.battles.delete(v), Promise.reject(e))));
  return state.battles.get(v)!;
}

function days(): Promise<Day[]> {
  const v = state.version;
  if (!state.days.has(v)) state.days.set(v, getAll<Day>('days', 'served days').catch((e) => (state.days.delete(v), Promise.reject(e))));
  return state.days.get(v)!;
}

/** A bot opponent's plate and record, rebuilt from its seed (cached: it takes a moment). */
const bots = new Map<number, ReturnType<typeof botOpponent>>();
function botOf(b: Battle) {
  if (!bots.has(b.id)) bots.set(b.id, botOpponent(b.day, b.botSeed!, b.wins, b.lives));
  return bots.get(b.id)!;
}
const theirs = (b: Battle) => b.theirs ?? botOf(b).plate;

// ---------- helpers ----------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : '<span class="dim">-</span>');
const signed = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;
const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const time = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const MIN_N = 10;
const inStage = (day: number, stage: number) => stage < 0 || stageOf(day) === stage;
const foods = (p: Plate) => p.filter((u): u is UnitInstance => !!u);

function foodCell(defId: string): string {
  const def = unitDef(defId);
  return `<span class="food"><span class="art">${unitArt(defId, false)}</span><span><i class="gem t${def.tier}"></i>${esc(def.name)}</span></span>`;
}

function itemCell(id: (typeof ITEMS)[number]['id']): string {
  const def = itemDef(id);
  return `<span class="food"><span class="art">${itemArt(id)}</span><span><i class="gem t${def.tier}"></i>${esc(def.name)}</span></span>`;
}

/** A plate as the game lays it out: three lanes, back column then front. */
function plateHtml(p: Plate): string {
  const cells = [0, 1, 2].flatMap((lane) => [lane + 3, lane]).map((slot) => {
    const u = p[slot];
    if (!u) return '<div class="cell"></div>';
    const lvl = levelOf(u.copies);
    return `<div class="cell" title="${esc(unitDef(u.defId).name)}">${unitArt(u.defId, lvl === 3)}${lvl > 1 ? `<span class="lv">L${lvl}</span>` : ''}<span class="st">${u.attack}/${u.hp}</span></div>`;
  });
  return `<div class="plate">${cells.join('')}</div>`;
}

const stagePicker = (current: number, action: string) => `
  <label class="field">Stage
    <select data-${action}>
      <option value="-1"${current < 0 ? ' selected' : ''}>Whole run</option>
      ${STAGES.map((s, i) => `<option value="${i}"${current === i ? ' selected' : ''}>${s.name}</option>`).join('')}
    </select>
  </label>`;

// ---------- views ----------

function viewOverview(): string {
  const o = state.overview;
  if (!o) return '<p class="muted">Loading...</p>';
  const today = date(Date.now());
  const activeToday = o.active.find((a) => a.date === today);
  const served = o.active.reduce((n, a) => n + a.days, 0);
  const b = o.battles;
  const real = b.n - (b.bots ?? 0);
  const runs = ['active', 'won', 'lost', 'abandoned'].map((s) => o.runs[s] ?? 0);

  // Last 30 days: days served (bar) and new chefs (second colour).
  const dates = [...Array(30).keys()].map((i) => date(Date.now() - (29 - i) * 86_400_000));
  const daysBy = new Map(o.active.map((a) => [a.date, a]));
  const signBy = new Map(o.signups.map((s) => [s.date, s.n]));
  const peak = Math.max(1, ...dates.map((d) => (daysBy.get(d)?.days ?? 0) + (signBy.get(d) ?? 0)));
  const activity = dates
    .map((d, i) => {
      const a = daysBy.get(d)?.days ?? 0;
      const s = signBy.get(d) ?? 0;
      return `<div class="col" title="${d}: ${a} days served by ${daysBy.get(d)?.chefs ?? 0} chefs, ${s} new chefs">
        <span class="val">${a + s || ''}</span>
        <div class="stack" style="height:${(100 * (a + s)) / peak}%"><div class="seg" style="flex:${a}"></div><div class="seg b" style="flex:${s}"></div></div>
        <span class="lab">${i % 5 === 4 || i === 29 ? d.slice(5) : '&nbsp;'}</span></div>`;
    })
    .join('');

  // Finished runs by days played.
  const maxDay = Math.max(1, ...o.reached.map((r) => r.days));
  const reachedBy = (d: number, s: string) => o.reached.find((r) => r.days === d && r.status === s)?.n ?? 0;
  const peakRun = Math.max(1, ...[...Array(maxDay).keys()].map((i) => reachedBy(i + 1, 'won') + reachedBy(i + 1, 'lost')));
  const reached = [...Array(maxDay).keys()]
    .map((i) => {
      const [w, l] = [reachedBy(i + 1, 'won'), reachedBy(i + 1, 'lost')];
      return `<div class="col" title="${w + l} runs ended after ${i + 1} days (${w} won)">
        <span class="val">${w + l || ''}</span>
        <div class="stack" style="height:${(100 * (w + l)) / peakRun}%"><div class="seg" style="flex:${l}"></div><div class="seg b" style="flex:${w}"></div></div>
        <span class="lab">${i + 1}</span></div>`;
    })
    .join('');

  return `
    <div class="tiles">
      <div class="tile"><b>${o.players}</b><span>chefs signed up</span></div>
      <div class="tile"><b>${activeToday?.chefs ?? 0}</b><span>chefs played today (UTC)</span></div>
      <div class="tile"><b>${served}</b><span>days served, last 30 days</span></div>
      <div class="tile"><b>${runs[0]}</b><span>runs in progress</span></div>
      <div class="tile"><b>${b.n}</b><span>battles, ${pct(b.bots ?? 0, b.n)} against bots</span></div>
      <div class="tile"><b>${pct(b.wins ?? 0, b.n)}</b><span>of battles won by the chef serving</span></div>
      <div class="tile"><b>${o.google?.chefs ?? 0}</b><span>chefs signed in with Google (${pct(o.google?.chefs ?? 0, o.players)}), ${o.google?.linked.find((l) => l.date === today)?.n ?? 0} today</span></div>
      <div class="tile"><b>${o.google?.devices ?? 0}</b><span>extra devices signed into a chef</span></div>
    </div>
    <div class="two">
      <div><h2>Activity</h2><div class="panel">
        <div class="bars">${activity}</div>
        <div class="legend"><span><i></i>days served</span><span><i class="b"></i>new chefs</span></div>
      </div></div>
      <div><h2>How far runs get</h2><div class="panel">
        ${o.reached.length ? `<div class="bars">${reached}</div><div class="legend"><span><i></i>lost after N days</span><span><i class="b"></i>won</span></div>` : '<p class="muted">No finished runs yet.</p>'}
        <p class="muted" style="margin-top:8px">Runs: ${runs[0]} active, ${runs[1]} won, ${runs[2]} lost, ${runs[3]} abandoned. ${real} battles were against other chefs.</p>
      </div></div>
    </div>
    <h2>Versions</h2>
    <p class="note">Each change to the rules is a new version, and plates only meet plates from the same one. The Foods, Kitchen and Battles tabs show the version picked at the top.</p>
    <div class="table-wrap"><table>
      <tr><th class="l">Version</th><th>Plates served</th><th>Chefs</th><th>First</th><th>Last</th></tr>
      ${o.versions.map((v) => `<tr><td class="l"><code>${v.version}</code>${v.version === GAME_VERSION ? ' <span class="bot-tag">this site</span>' : ''}</td><td>${v.plates}</td><td>${v.chefs}</td><td>${time(v.first)}</td><td>${time(v.last)}</td></tr>`).join('') || '<tr><td class="l muted" colspan="5">No plates served yet.</td></tr>'}
    </table></div>`;
}

async function viewFoods(): Promise<string> {
  const all = await battles();
  const f = state.foods;
  const list = all.filter((b) => inStage(b.day, f.stage));
  if (all.length === 0) return '<div class="empty">No battles on this version yet.</div>';
  const stats = new Map<string, { n: number; score: number }>();
  for (const b of list) {
    for (const id of new Set(foods(b.mine).map((u) => u.defId))) {
      const s = stats.get(id) ?? { n: 0, score: 0 };
      s.n++;
      s.score += score(b.outcome);
      stats.set(id, s);
    }
  }
  const lift = f.lift.get(state.version);
  const liftOf = (id: string) => {
    const per = lift?.get(id);
    if (!per) return null;
    const picked = f.stage < 0 ? per : [per[f.stage]];
    const n = picked.reduce((a, s) => a + s.n, 0);
    return { n, avg: n ? (100 * picked.reduce((a, s) => a + s.sum, 0)) / n : 0 };
  };
  const rows = MARKET_UNITS.map((u) => {
    const s = stats.get(u.id) ?? { n: 0, score: 0 };
    const l = liftOf(u.id);
    return { u, n: s.n, pick: s.n / Math.max(1, list.length), win: s.n ? s.score / s.n : -1, lift: l && l.n >= MIN_N ? l.avg : -999, liftN: l?.n ?? 0 };
  });
  const key = f.sort as 'pick' | 'win' | 'lift' | 'tier';
  rows.sort((a, b) => (key === 'tier' ? a.u.tier - b.u.tier || b.pick - a.pick : (b[key] as number) - (a[key] as number)));
  const th = (k: string, label: string) => `<th class="sort ${f.sort === k ? 'sorted' : ''}" data-sort="${k}">${label}</th>`;
  const topPick = Math.max(0.01, ...rows.map((r) => r.pick));
  return `
    <div class="controls">
      ${stagePicker(f.stage, 'food-stage')}
      <button class="btn" data-action="lift" ${f.lifting ? 'disabled' : ''}>${lift ? 'Run the lift test again' : 'Run the lift test'}</button>
      <span class="progress">${f.lifting}</span>
    </div>
    <p class="note">${list.length} plates served${f.stage >= 0 ? ` in ${STAGES[f.stage].name}` : ''}. <b>Picked</b>: share of those plates with the food. <b>Win</b>: how those plates did (a draw counts half); it credits the food with the plate around it. <b>Lift</b>: points of win chance the food itself adds, from replaying each battle with the food swapped for a plain body of its rarity; kitchen growers read low on it. Numbers from under ${MIN_N} plates are greyed.</p>
    <div class="table-wrap"><table>
      <tr><th class="l">Food</th>${th('tier', 'Rarity')}<th>Plates</th>${th('pick', 'Picked')}${th('win', 'Win')}${th('lift', 'Lift')}<th>Lift plates</th></tr>
      ${rows
        .map((r) => {
          const few = r.n < MIN_N ? ' dim' : '';
          return `<tr><td class="l">${foodCell(r.u.id)}</td><td>${r.u.tier}</td><td>${r.n}</td>
          <td class="${few}">${(100 * r.pick).toFixed(0)}%<span class="meter"><i style="width:${(100 * r.pick) / topPick}%"></i></span></td>
          <td class="${few}">${r.win < 0 ? '<span class="dim">-</span>' : `${Math.round(100 * r.win)}%`}</td>
          <td class="${r.lift === -999 ? 'dim' : r.lift > 0.5 ? 'pos' : r.lift < -0.5 ? 'neg' : ''}">${r.lift === -999 ? '-' : signed(r.lift)}</td>
          <td class="muted">${r.liftN || ''}</td></tr>`;
        })
        .join('')}
    </table></div>`;
}

/** Replays the served days to see what was bought, sold and used, and how much was refilled and kept. */
function kitchenStats(list: Day[]) {
  const bought = new Map<string, number>();
  const sold = new Map<string, number>();
  const items = new Map<string, number>();
  const byDay = new Map<number, { n: number; actions: number; refills: number; gold: number; plate: number; buys: number }>();
  for (const d of list) {
    const run = structuredClone(d.morning);
    const row = byDay.get(d.day) ?? { n: 0, actions: 0, refills: 0, gold: 0, plate: 0, buys: 0 };
    row.n++;
    row.actions += d.actions.length;
    for (const a of d.actions) {
      if (a.t === 'buy') {
        const o = getOffer(run, a.src);
        if (o?.kind === 'unit') bought.set(o.defId, (bought.get(o.defId) ?? 0) + 1), row.buys++;
      } else if (a.t === 'item') {
        const o = getOffer(run, a.src);
        if (o?.kind === 'item') items.set(o.itemId, (items.get(o.itemId) ?? 0) + 1);
      } else if (a.t === 'sell') {
        const u = getUnit(run, a.at);
        if (u) sold.set(u.defId, (sold.get(u.defId) ?? 0) + 1);
      } else if (a.t === 'refill') row.refills++;
      applyAction(run, a);
    }
    row.gold += run.gold;
    row.plate += foods(run.plate).length;
    byDay.set(d.day, row);
  }
  return { bought, sold, items, byDay };
}

async function viewKitchen(): Promise<string> {
  const all = await days();
  if (all.length === 0) return '<div class="empty">No days served on this version yet.</div>';
  const list = all.filter((d) => inStage(d.day, state.kitchenStage));
  const k = kitchenStats(list);
  const foodsBought = MARKET_UNITS.filter((u) => k.bought.get(u.id) || k.sold.get(u.id)).sort((a, b) => (k.bought.get(b.id) ?? 0) - (k.bought.get(a.id) ?? 0));
  const avg = (x: number, n: number) => (n ? (x / n).toFixed(1) : '-');
  return `
    <div class="controls">${stagePicker(state.kitchenStage, 'kitchen-stage')}</div>
    <p class="note">From ${list.length} served days, replayed from each morning: what chefs did in the kitchen before serving. Gold kept is what was left in the tip jar at the bell (it earns interest).</p>
    <h2>By day of the run</h2>
    <div class="table-wrap"><table>
      <tr><th>Day</th><th>Days served</th><th>Moves</th><th>Foods bought</th><th>Refills</th><th>Gold kept</th><th>Foods on plate</th></tr>
      ${[...k.byDay].sort((a, b) => a[0] - b[0]).map(([day, r]) => `<tr><td>${day}</td><td>${r.n}</td><td>${avg(r.actions, r.n)}</td><td>${avg(r.buys, r.n)}</td><td>${avg(r.refills, r.n)}</td><td>${avg(r.gold, r.n)}</td><td>${avg(r.plate, r.n)}</td></tr>`).join('')}
    </table></div>
    <div class="two">
      <div><h2>Foods bought</h2><div class="table-wrap"><table>
        <tr><th class="l">Food</th><th>Bought</th><th>Sold</th></tr>
        ${foodsBought.map((u) => `<tr><td class="l">${foodCell(u.id)}</td><td>${k.bought.get(u.id) ?? 0}</td><td>${k.sold.get(u.id) ?? 0}</td></tr>`).join('')}
      </table></div></div>
      <div><h2>Items used</h2><div class="table-wrap"><table>
        <tr><th class="l">Item</th><th>Used</th></tr>
        ${ITEMS.filter((i) => k.items.get(i.id)).sort((a, b) => (k.items.get(b.id) ?? 0) - (k.items.get(a.id) ?? 0)).map((i) => `<tr><td class="l">${itemCell(i.id)}</td><td>${k.items.get(i.id)}</td></tr>`).join('') || '<tr><td class="l muted" colspan="2">None yet.</td></tr>'}
      </table></div></div>
    </div>`;
}

async function viewBattles(): Promise<string> {
  const all = await battles();
  if (all.length === 0) return '<div class="empty">No battles on this version yet.</div>';
  const f = state.filter;
  const daysSeen = [...new Set(all.map((b) => b.day))].sort((a, b) => a - b);
  const foodsSeen = MARKET_UNITS.filter((u) => all.some((b) => b.mine.some((x) => x?.defId === u.id)));
  const list = all
    .filter((b) => (!f.day || b.day === f.day) && (f.foe === 'all' || (f.foe === 'bots') === (b.botSeed !== null)) && (f.outcome === 'all' || b.outcome === f.outcome))
    .filter((b) => !f.food || b.mine.some((u) => u?.defId === f.food) || (b.theirs ?? []).some((u) => u?.defId === f.food))
    .reverse();
  const opt = (v: string | number, label: string, cur: string | number) => `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`;
  return `
    <div class="controls">
      <label class="field">Day<select data-filter="day">${opt(0, 'Any', f.day)}${daysSeen.map((d) => opt(d, `Day ${d}`, f.day)).join('')}</select></label>
      <label class="field">Opponent<select data-filter="foe">${opt('all', 'Anyone', f.foe)}${opt('chefs', 'Other chefs', f.foe)}${opt('bots', 'Bots', f.foe)}</select></label>
      <label class="field">Result<select data-filter="outcome">${opt('all', 'Any', f.outcome)}${opt('win', 'Won', f.outcome)}${opt('loss', 'Lost', f.outcome)}${opt('draw', 'Draw', f.outcome)}</select></label>
      <label class="field">With food<select data-filter="food">${opt('', 'Any', f.food)}${foodsSeen.map((u) => opt(u.id, u.name, f.food)).join('')}</select></label>
      <span class="muted">${list.length} of ${all.length} battles, newest first. Results are the left chef's.</span>
    </div>
    ${list
      .slice(0, f.shown)
      .map((b) => {
        const bot = b.botSeed !== null;
        const oName = b.oName ?? `Bot Chef #${b.botSeed! % 1000}`;
        const oRec = bot ? '' : `${b.oWins} wins, ${b.oLives} lives`;
        return `<div class="battle">
          <div class="meta"><b>Day ${b.day}</b>${time(b.at)}</div>
          <div class="side"><div class="who"><b>${esc(b.name)}</b><span>${b.wins} wins, ${b.lives} lives</span></div>${plateHtml(b.mine)}</div>
          <span class="chip ${b.outcome}">${b.outcome === 'win' ? 'won' : b.outcome === 'loss' ? 'lost' : 'draw'}</span>
          <div class="side right"><div class="who"><b>${esc(oName)}${bot ? '<span class="bot-tag">bot</span>' : ''}</b><span>${oRec}</span></div>${b.theirs ? plateHtml(b.theirs) : '<div class="plate muted" style="place-items:center;font-size:11px;grid-template-columns:80px">bot plate</div>'}</div>
          <button class="btn quiet" data-watch="${b.id}">Watch</button>
        </div>`;
      })
      .join('')}
    ${list.length > f.shown ? '<button class="btn quiet" data-action="more">Show more</button>' : ''}`;
}

// ---------- page ----------

const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ['foods', 'Foods'],
  ['kitchen', 'Kitchen'],
  ['battles', 'Battles'],
];

function gate() {
  root.innerHTML = `
    <div class="gate">
      <h1>Kitchen office</h1>
      <p class="muted">The Buffet Battle dev site. Enter the admin key to read the game's numbers.</p>
      <form><input type="password" name="key" placeholder="admin key" autocomplete="current-password"><button class="btn">Open</button></form>
      ${state.error ? `<p class="error">${esc(state.error)}</p>` : ''}
      <p class="muted" style="font-size:12px">Reading from ${esc(API)}</p>
    </div>`;
}

let renderId = 0;
async function render() {
  if (!state.key) return gate();
  const id = ++renderId;
  const versions = state.overview?.versions ?? [];
  const head = `
    <div class="top">
      <div class="title"><small>Buffet Battle</small><h1>Kitchen office</h1></div>
      <div class="spacer"></div>
      <label class="field">Version
        <select data-version>${versions.map((v) => `<option value="${v.version}"${v.version === state.version ? ' selected' : ''}>${v.version}${v.version === GAME_VERSION ? ' (this site)' : ''} · ${v.plates} plates</option>`).join('') || `<option>${GAME_VERSION}</option>`}</select>
      </label>
      <button class="btn quiet" data-action="refresh">Refresh</button>
      <button class="btn quiet" data-action="signout">Sign out</button>
    </div>
    <nav class="tabs">${TABS.map(([t, label]) => `<button class="tab ${state.tab === t ? 'on' : ''}" data-tab="${t}">${label}</button>`).join('')}</nav>`;
  let body = '';
  try {
    if (state.tab === 'overview') body = viewOverview();
    else {
      root.innerHTML = head + '<p class="progress" style="margin-top:16px">Loading...</p>';
      body = state.tab === 'foods' ? await viewFoods() : state.tab === 'kitchen' ? await viewKitchen() : await viewBattles();
    }
  } catch (e) {
    if (e instanceof AuthError) return signOut(e.message);
    body = `<p class="error" style="margin-top:16px">${esc((e as Error).message)}</p>`;
  }
  if (id !== renderId) return;
  root.innerHTML = head + body;
}

function signOut(error = '') {
  state.key = '';
  state.error = error;
  try {
    localStorage.removeItem(KEY_STORE);
  } catch {
    // Nothing kept.
  }
  render();
}

async function load() {
  try {
    state.overview = await get<Overview>('/admin/overview');
    const names = state.overview.versions.map((v) => v.version);
    if (!names.includes(state.version)) state.version = names.includes(GAME_VERSION) ? GAME_VERSION : (names[0] ?? GAME_VERSION);
    state.error = '';
  } catch (e) {
    if (e instanceof AuthError) return signOut(e.message);
    state.error = (e as Error).message;
  }
  render();
}

/** The lift test over this version's real battles, in small batches so the page stays responsive. */
async function runLift() {
  const list = await battles();
  const result = new Map<string, { n: number; sum: number }[]>();
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const stage = stageOf(b.day);
    for (const { defId, lift } of battleLift(b.mine, theirs(b), b.seed, b.outcome)) {
      const per = result.get(defId) ?? STAGES.map(() => ({ n: 0, sum: 0 }));
      per[stage].n++;
      per[stage].sum += lift;
      result.set(defId, per);
    }
    if (i % 25 === 24) {
      state.foods.lifting = `Replaying battles: ${i + 1} of ${list.length}...`;
      const el = root.querySelector('.progress');
      if (el) el.textContent = state.foods.lifting;
      await new Promise((r) => setTimeout(r));
    }
  }
  state.foods.lift.set(state.version, result);
  state.foods.lifting = '';
  render();
}

async function watch(id: number) {
  const b = (await battles()).find((x) => x.id === id);
  if (!b) return;
  const bot = b.botSeed !== null ? botOf(b) : null;
  const replay = {
    day: b.day,
    seed: b.seed,
    mine: b.mine,
    theirs: theirs(b),
    me: { name: b.name, wins: b.wins, lives: b.lives },
    foe: bot ? { name: bot.label, wins: bot.wins, lives: bot.lives } : { name: b.oName, wins: b.oWins, lives: b.oLives },
  };
  try {
    localStorage.setItem('buffetbattle.replay', JSON.stringify(replay));
  } catch {
    return;
  }
  window.open('index.html?replay', '_blank');
}

root.addEventListener('submit', (e) => {
  e.preventDefault();
  const key = new FormData(e.target as HTMLFormElement).get('key');
  if (typeof key !== 'string' || !key.trim()) return;
  state.key = key.trim();
  try {
    localStorage.setItem(KEY_STORE, state.key);
  } catch {
    // Kept for this visit only.
  }
  void load();
});

root.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tab], [data-action], [data-sort], [data-watch]');
  if (!el) return;
  if (el.dataset.tab) {
    state.tab = el.dataset.tab as Tab;
    history.replaceState(null, '', `#${state.tab}`);
    void render();
  } else if (el.dataset.sort) {
    state.foods.sort = el.dataset.sort;
    void render();
  } else if (el.dataset.watch) void watch(Number(el.dataset.watch));
  else if (el.dataset.action === 'lift') void runLift();
  else if (el.dataset.action === 'more') {
    state.filter.shown += 60;
    void render();
  } else if (el.dataset.action === 'refresh') {
    state.battles.delete(state.version);
    state.days.delete(state.version);
    state.foods.lift.delete(state.version);
    bots.clear();
    void load();
  } else if (el.dataset.action === 'signout') signOut();
});

root.addEventListener('change', (e) => {
  const el = e.target as HTMLSelectElement;
  if (el.matches('[data-version]')) state.version = el.value;
  else if (el.matches('[data-food-stage]')) state.foods.stage = Number(el.value);
  else if (el.matches('[data-kitchen-stage]')) state.kitchenStage = Number(el.value);
  else if (el.dataset.filter) {
    const k = el.dataset.filter as 'day' | 'foe' | 'outcome' | 'food';
    (state.filter as Record<string, unknown>)[k] = k === 'day' ? Number(el.value) : el.value;
    state.filter.shown = 60;
  } else return;
  void render();
});

if (state.key) void load();
else render();
