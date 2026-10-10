// Motion: nothing on screen should just appear. The UI re-renders with innerHTML, so this module compares the DOM
// before and after each render and animates the difference:
//   data-k="key"            an element with an identity. If it moved it slides from where it was (FLIP); if it is
//                           new it plays data-in (default 'pop'); if it vanished, the old node plays data-out
//                           (default 'fade') where it stood. data-delay="ms" delays its entrance.
//   data-vk="key" data-v    a value. When it changes the element plays data-va (default 'bump'); with data-delta
//                           a floating +n/-n rises from it.
// Everything is stepped (steps()) so the pixel art moves in visible frames, like the sprites themselves.

export type Rect = { left: number; top: number; width: number; height: number };

export interface Snapshot {
  keys: Map<string, { el: HTMLElement; rect: Rect }>;
}

/** A drag and drop that just happened: where the dragged thing was let go, and what it was dropped on. */
export interface DropFx {
  key: string;
  rect: Rect;
  target?: Rect;
}

export interface PlayOpts {
  /** Playback speed (battle 1x/2x/4x): every duration is divided by it. */
  speed?: number;
  /** Delay every entrance and value change (e.g. until a scene transition uncovers the screen). */
  delay?: number;
  /** Entrances ripple left to right instead of all at once. */
  stagger?: boolean;
  drop?: DropFx;
  /** Hold exits back this long (battle: until the spark that caused them lands). */
  exitDelay?: number;
}

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const STAGE_W = 640;

interface Anim {
  kf: Keyframe[];
  ms: number;
  steps: number;
  origin?: string;
}

const ANIMS: Record<string, Anim> = {
  // entrances
  pop: { kf: [{ transform: 'scale(0.3)', opacity: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], ms: 260, steps: 6 },
  drop: { kf: [{ transform: 'translateY(-28px)', opacity: 0 }, { transform: 'translateY(2px)', opacity: 1, offset: 0.7 }, { transform: 'translateY(0)', opacity: 1 }], ms: 320, steps: 8 },
  rise: { kf: [{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], ms: 200, steps: 5 },
  fade: { kf: [{ opacity: 0 }, { opacity: 1 }], ms: 200, steps: 4 },
  stamp: { kf: [{ transform: 'scale(2.4)', opacity: 0 }, { transform: 'scale(0.9)', opacity: 1, offset: 0.65 }, { transform: 'scale(1)', opacity: 1 }], ms: 320, steps: 7 },
  thud: { kf: [{ transform: 'translateY(-40px)', opacity: 0 }, { transform: 'translateY(3px)', opacity: 1, offset: 0.5 }, { transform: 'translate(-3px, 0)', offset: 0.65 }, { transform: 'translate(3px, 0)', offset: 0.8 }, { transform: 'translate(0, 0)', opacity: 1 }], ms: 480, steps: 10 },
  // exits
  'fade-out': { kf: [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.6)', opacity: 0 }], ms: 200, steps: 5 },
  'drop-out': { kf: [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(16px)', opacity: 0 }], ms: 220, steps: 5 },
  eaten: { kf: [{ transform: 'scale(1, 1)', opacity: 1 }, { transform: 'scale(1.3, 0.6)', opacity: 1, offset: 0.35 }, { transform: 'scale(0.2, 0.1)', opacity: 0 }], ms: 380, steps: 6, origin: '50% 100%' },
  // value changes
  bump: { kf: [{ transform: 'scale(1)' }, { transform: 'scale(1.5)', offset: 0.4 }, { transform: 'scale(1)' }], ms: 260, steps: 4 },
  flash: { kf: [{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], ms: 300, steps: 3 },
  shake: { kf: [{ transform: 'translateX(0)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(-1px)' }, { transform: 'translateX(0)' }], ms: 280, steps: 4 },
  hop: { kf: [{ transform: 'translateY(0)' }, { transform: 'translateY(-3px)', offset: 0.3 }, { transform: 'translateY(0)', offset: 0.6 }, { transform: 'translateY(-1px)', offset: 0.8 }, { transform: 'translateY(0)' }], ms: 360, steps: 6 },
  levelup: { kf: [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.35)', filter: 'brightness(2.2)', offset: 0.35 }, { transform: 'scale(0.95)', filter: 'brightness(1.3)', offset: 0.7 }, { transform: 'scale(1)', filter: 'brightness(1)' }], ms: 520, steps: 8 },
  // The cookbook turning a page: a leaf lifts off the right page, swings over the spine (darkening as it stands up)
  // and lands on the left, where the new left page shows once it has; the new right page was under it all along.
  pageTurn: { kf: [{ transform: 'scaleX(1)', filter: 'brightness(1)', opacity: 1 }, { transform: 'scaleX(0.06)', filter: 'brightness(0.82)', opacity: 1, offset: 0.5 }, { transform: 'scaleX(-1)', filter: 'brightness(1)', opacity: 1, offset: 0.96 }, { transform: 'scaleX(-1)', opacity: 0 }], ms: 360, steps: 10, origin: '0% 50%' },
  pageLand: { kf: [{ opacity: 0 }, { opacity: 0, offset: 0.85 }, { opacity: 1 }], ms: 360, steps: 6 },
  caption: { kf: [{ transform: 'translateY(5px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], ms: 160, steps: 4 },
  lose: { kf: [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.6)', filter: 'brightness(2.5)', offset: 0.3 }, { transform: 'translateX(-2px) scale(1)', offset: 0.5 }, { transform: 'translateX(2px)', offset: 0.7 }, { transform: 'translateX(0)', filter: 'brightness(1)' }], ms: 500, steps: 8 },
};

export function animate(el: Element, name: string, speed = 1, delay = 0): Animation | undefined {
  const a = ANIMS[name];
  if (!a || reduced) return undefined;
  if (a.origin) (el as HTMLElement).style.transformOrigin = a.origin;
  return el.animate(a.kf, { duration: a.ms / speed, delay, easing: `steps(${a.steps}, jump-end)`, fill: 'backwards' });
}

const values = new Map<string, string>();

// Phones held upright show the stage turned a quarter turn (see the rotated class in main.ts). Positions are then
// measured along the stage's own axes: localRect and localPoint map the screen into the stage's frame (relative to
// its top-left corner, in screen pixels), which is just the screen, shifted, when it isn't turned.
let turned = false;
export function setTurned(on: boolean) {
  turned = on;
}
export const isTurned = () => turned;

function frame(): DOMRect | null {
  return document.querySelector('.stage')?.getBoundingClientRect() ?? null;
}

/** A screen rect in the stage's frame. */
export function localRect(r: Rect): Rect {
  const f = frame();
  if (!f) return { left: r.left, top: r.top, width: r.width, height: r.height };
  if (!turned) return { left: r.left - f.left, top: r.top - f.top, width: r.width, height: r.height };
  // Turned clockwise: the stage's x runs down the screen and its y runs from right to left.
  return { left: r.top - f.top, top: f.right - (r.left + r.width), width: r.height, height: r.width };
}

/** A screen point in the stage's frame. */
export function localPoint(x: number, y: number): [number, number] {
  const f = frame();
  if (!f) return [x, y];
  return turned ? [y - f.top, f.right - x] : [x - f.left, y - f.top];
}

/** Screen pixels per stage pixel. */
export function screenScale(): number {
  const f = frame();
  return f ? (turned ? f.height : f.width) / STAGE_W : 1;
}

function rectOf(el: Element): Rect {
  return localRect(el.getBoundingClientRect());
}

export function capture(root: HTMLElement): Snapshot {
  const keys = new Map<string, { el: HTMLElement; rect: Rect }>();
  root.querySelectorAll<HTMLElement>('[data-k]').forEach((el) => keys.set(el.dataset.k!, { el, rect: rectOf(el) }));
  return { keys };
}

export const EMPTY: Snapshot = { keys: new Map() };

/** The stage the element is drawn on and its scale (stage pixels to screen pixels). */
function stageOf(root: HTMLElement): { stage: HTMLElement | null; origin: Rect; s: number } {
  const stage = root.querySelector<HTMLElement>('.stage');
  if (!stage) return { stage: null, origin: rectOf(root), s: 1 };
  const origin = rectOf(stage);
  return { stage, origin, s: origin.width / STAGE_W };
}

const center = (r: Rect) => [r.left + r.width / 2, r.top + r.height / 2];
const inside = (r: Rect, [x, y]: number[]) => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;

/** Slide an element from an old screen rect to where it is now. */
function slide(el: HTMLElement, from: Rect, s: number, speed: number, ms = 220) {
  const to = rectOf(el);
  const dx = (from.left - to.left) / s;
  const dy = (from.top - to.top) / s;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
  if (reduced) return;
  const dist = Math.hypot(dx, dy);
  el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
    duration: Math.min(360, ms + dist * 0.4) / speed,
    easing: `steps(${Math.max(4, Math.min(10, Math.round(dist / 6)))}, jump-end)`,
  });
}

/** Put a detached node back on the stage at a screen rect, inert, so it can play an exit. */
function ghostAt(stage: HTMLElement, el: HTMLElement, r: Rect, origin: Rect, s: number): HTMLElement {
  el.getAnimations().forEach((a) => a.cancel());
  for (const n of [el, ...el.querySelectorAll<HTMLElement>('*')]) {
    for (const attr of ['data-k', 'data-vk', 'data-drag', 'data-drop', 'data-action', 'data-inspect', 'data-slot', 'data-offer']) n.removeAttribute(attr);
  }
  el.style.position = 'absolute';
  el.style.left = `${(r.left - origin.left) / s}px`;
  el.style.top = `${(r.top - origin.top) / s}px`;
  el.style.margin = '0';
  el.style.pointerEvents = 'none';
  el.style.translate = 'none';
  stage.appendChild(el);
  return el;
}

/** A number that floats up from an element and fades: "+2", "-3". */
export function floater(stage: HTMLElement, x: number, y: number, text: string, cls: string, speed = 1, delay = 0) {
  if (reduced) return;
  // Created when its delay is up, so it isn't sitting visible at its start until then.
  if (delay > 0) return void setTimeout(() => floater(stage, x, y, text, cls, speed), delay);
  const f = document.createElement('div');
  f.className = `floater ${cls}`;
  f.textContent = text;
  f.style.left = `${x}px`;
  f.style.top = `${y}px`;
  stage.appendChild(f);
  f.animate(
    [{ transform: 'translate(-50%, 0)', opacity: 1 }, { transform: 'translate(-50%, -6px)', opacity: 1, offset: 0.5 }, { transform: 'translate(-50%, -14px)', opacity: 0 }],
    { duration: 900 / speed, delay, easing: 'steps(8, jump-end)', fill: 'backwards' },
  ).finished.then(() => f.remove(), () => f.remove());
}

/** Stage coordinates of an element's centre. */
export function stagePos(root: HTMLElement, el: Element): [number, number] {
  const { origin, s } = stageOf(root);
  const [x, y] = center(rectOf(el));
  return [(x - origin.left) / s, (y - origin.top) / s];
}

/** Small pixel bits flying from one stage point to another along an arc (sparks, coins). */
export function fling(stage: HTMLElement, from: [number, number], to: [number, number], cls: string, opts: { speed?: number; delay?: number; ms?: number; arc?: number } = {}) {
  if (reduced) return;
  const { speed = 1, delay = 0, ms = 260, arc = 12 } = opts;
  if (delay > 0) return void setTimeout(() => fling(stage, from, to, cls, { ...opts, delay: 0 }), delay);
  const b = document.createElement('div');
  b.className = `bit ${cls}`;
  stage.appendChild(b);
  const [x0, y0] = from;
  const [x1, y1] = to;
  const mx = (x0 + x1) / 2;
  const my = Math.min(y0, y1) - arc;
  b.animate(
    [
      { transform: `translate(${x0}px, ${y0}px)`, opacity: 1 },
      { transform: `translate(${(x0 + mx) / 2}px, ${(y0 + my) / 2 - arc / 3}px)`, offset: 0.3 },
      { transform: `translate(${mx}px, ${my}px)`, offset: 0.55 },
      { transform: `translate(${x1}px, ${y1}px)`, opacity: 1, offset: 0.9 },
      { transform: `translate(${x1}px, ${y1}px) scale(2)`, opacity: 0 },
    ],
    { duration: ms / speed, delay, easing: 'steps(8, jump-end)', fill: 'both' },
  ).finished.then(() => b.remove(), () => b.remove());
}

/** A dotted line drawn from one stage point to another, dot by dot, that then fades: a food reaching a friend. */
export function beam(stage: HTMLElement, from: [number, number], to: [number, number], cls: string, opts: { speed?: number; delay?: number } = {}) {
  if (reduced) return;
  const { speed = 1, delay = 0 } = opts;
  if (delay > 0) return void setTimeout(() => beam(stage, from, to, cls, { speed }), delay);
  const [x0, y0] = from;
  const [x1, y1] = to;
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 5));
  for (let i = 0; i <= n; i++) {
    const d = document.createElement('div');
    d.className = `beam-dot ${cls}`;
    d.style.left = `${Math.round(x0 + ((x1 - x0) * i) / n)}px`;
    d.style.top = `${Math.round(y0 + ((y1 - y0) * i) / n)}px`;
    stage.appendChild(d);
    // Hidden until its turn (each dot lands a moment after the one before), then fades.
    d.animate([{ opacity: 0 }, { opacity: 1, offset: 0.01 }, { opacity: 1, offset: 0.6 }, { opacity: 0.5, offset: 0.8 }, { opacity: 0 }], {
      duration: 420 / speed,
      delay: (i * 14) / speed,
      easing: 'linear',
      fill: 'backwards',
    }).finished.then(() => d.remove(), () => d.remove());
  }
}

/**
 * A sparkle that flies from one food to another trailing two smaller ones, bursting where it lands. Used for good
 * things passing between friends (buffs, heals, Crust, growth). `cls` picks the colour (k-buff, k-heal...).
 */
export function orb(stage: HTMLElement, from: [number, number], to: [number, number], cls: string, opts: { speed?: number; delay?: number; ms?: number } = {}) {
  if (reduced) return;
  const { speed = 1, delay = 0, ms = 280 } = opts;
  for (let i = 0; i < 3; i++) fling(stage, from, to, `orb orb${i} ${cls}`, { speed, delay: delay + (i * 40) / speed, ms, arc: 18 });
  burst(stage, to, `spark ${cls}`, { speed, delay: delay + (ms * 0.9) / speed, count: 8, spread: 14 });
}

/** Bits bursting out from a point (crumbs when a food is eaten, a puff when one is summoned). */
export function burst(stage: HTMLElement, at: [number, number], cls: string, opts: { speed?: number; delay?: number; count?: number; spread?: number } = {}) {
  const { speed = 1, delay = 0, count = 8, spread = 16 } = opts;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
    const r = spread * (0.6 + Math.random() * 0.5);
    const to: [number, number] = [at[0] + Math.cos(a) * r, at[1] + Math.sin(a) * r * 0.7 + 4];
    fling(stage, at, to, `${cls} ${cls}${i % 3}`, { speed, delay, ms: 380, arc: 6 + Math.random() * 8 });
  }
}

/** Animate everything that changed between a snapshot (taken before a render) and the DOM now. */
export function play(root: HTMLElement, before: Snapshot, opts: PlayOpts = {}) {
  const speed = opts.speed ?? 1;
  const base = opts.delay ?? 0;
  const { stage, origin, s } = stageOf(root);
  const now = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>('[data-k]').forEach((el) => now.set(el.dataset.k!, el));
  const handled = new Set<string>();

  // A drop: the dragged thing lands where it was let go.
  const drop = opts.drop;
  if (drop) {
    handled.add(drop.key);
    const same = now.get(drop.key);
    if (same) slide(same, drop.rect, s, speed, 160);
    else {
      // It became something new where it was dropped (bought, frozen): that slides from the drop point.
      const born = drop.target
        ? [...now].filter(([k, el]) => !before.keys.has(k) && el.closest('.slot') && inside(drop.target!, center(rectOf(el))))
        : [];
      if (born.length) {
        for (const [k, el] of born) {
          handled.add(k);
          slide(el, drop.rect, s, speed, 160);
          animate(el, 'hop', speed, 140);
        }
      } else {
        // It went into something (merged, used on a food, sold): it shrinks into the target, which gulps.
        const old = before.keys.get(drop.key);
        if (old && stage && drop.target && !reduced) {
          const g = ghostAt(stage, old.el, drop.rect, origin, s);
          const [tx, ty] = center(drop.target);
          const [gx, gy] = center(drop.rect);
          g.animate(
            [{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: `translate(${(tx - gx) / s}px, ${(ty - gy) / s}px) scale(0.2)`, opacity: 0.6 }],
            { duration: 200 / speed, easing: 'steps(5, jump-end)', fill: 'forwards' },
          ).finished.then(() => g.remove(), () => g.remove());
          const eater = [...now.values()].find((el) => inside(drop.target!, center(rectOf(el))));
          if (eater) animate(eater, eater.dataset.gulp ?? 'levelup', speed, 180);
        }
      }
    }
  }

  // Moves and entrances.
  const entering: HTMLElement[] = [];
  for (const [k, el] of now) {
    if (handled.has(k)) continue;
    const old = before.keys.get(k);
    if (old) {
      slide(el, old.rect, s, speed);
      continue;
    }
    const parent = el.parentElement?.closest<HTMLElement>('[data-k]');
    if (parent && !before.keys.has(parent.dataset.k!)) continue; // its parent's entrance carries it
    if ((el.dataset.in ?? 'pop') !== 'none') entering.push(el);
  }
  if (opts.stagger) entering.sort((a, b) => rectOf(a).left - rectOf(b).left || rectOf(a).top - rectOf(b).top);
  entering.forEach((el, i) => {
    const wait = base + (Number(el.dataset.delay ?? 0) + (opts.stagger ? Math.min(i * 28, 420) : 0)) / speed;
    animate(el, el.dataset.in ?? 'pop', speed, wait);
  });

  // Exits: old nodes that are gone play their way out where they stood.
  if (stage) {
    for (const [k, old] of before.keys) {
      if (now.has(k) || handled.has(k)) continue;
      const parent = old.el.parentElement?.closest<HTMLElement>('[data-k]');
      if (parent && before.keys.has(parent.dataset.k!) && !now.has(parent.dataset.k!)) continue; // leaves with its parent
      const name = old.el.dataset.out ?? 'fade-out';
      if (name === 'none' || reduced) continue;
      const g = ghostAt(stage, old.el, old.rect, origin, s);
      const a = animate(g, name, speed, opts.exitDelay ?? 0);
      if (a) {
        a.effect?.updateTiming({ fill: 'forwards' });
        a.finished.then(() => g.remove(), () => g.remove());
      } else g.remove();
    }
  }

  // Values that changed.
  root.querySelectorAll<HTMLElement>('[data-vk]').forEach((el) => {
    const k = el.dataset.vk!;
    const v = el.dataset.v ?? el.textContent ?? '';
    const prev = values.get(k);
    values.set(k, v);
    if (prev === undefined || prev === v) return;
    animate(el, el.dataset.va ?? 'bump', speed, base);
    if (el.dataset.delta !== undefined && stage) {
      const d = Number(v) - Number(prev);
      if (d) {
        const [x, y] = stagePos(root, el);
        floater(stage, x, y - rectOf(el).height / s / 2 - 9,d > 0 ? `+${d}` : `${d}`, d > 0 ? 'up' : 'down', speed, base);
      }
    }
  });
}

/** Scene change: a gingham tablecloth sweeps across, the old screen goes, the new one is uncovered. */
export const WIPE_MS = 260;
export function wipe(oldNodes: Node[], screen: string, scale: number) {
  if (reduced) return;
  const out = document.createElement('div');
  out.className = 'scene-out';
  out.dataset.screen = screen;
  for (const n of oldNodes) out.appendChild(n);
  const cloth = document.createElement('div');
  cloth.className = 'cloth';
  cloth.style.setProperty('--s', String(scale));
  document.body.append(out, cloth);
  const easing = 'steps(9, jump-end)';
  cloth
    .animate([{ transform: 'translateX(-105%)' }, { transform: 'translateX(0)' }], { duration: WIPE_MS, easing, fill: 'forwards' })
    .finished.then(() => {
      out.remove();
      return cloth.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(105%)' }], { duration: WIPE_MS, easing, fill: 'forwards' }).finished;
    })
    .finally(() => {
      out.remove();
      cloth.remove();
    });
}
