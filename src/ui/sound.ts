// Sound: short recorded effects (CC0: Kenney's packs and cartoon packs from OpenGameArt; credits in ./sfx), converted
// to WAVs at full quality, all normalized to the same peak. Cartoon first, kitchen second: bubbly bloops and plops for
// picking up, placing and buffing, a falling boop to sell, a cartoon "blah" when you can't, a toy xylophone run on a
// level up, a little voice when a food appears or merges, bonks for hits, plus plates, coins, the knife, the fridge and
// warm steel-drum jingles. Good things rise in pitch, bad things fall, and a run of buffs or heals climbs a scale.
// Only Burn's sizzle is synthesized.
// Effects with several takes (plate_0, plate_1...) pick one at random, and every sound varies its pitch a little, so
// repeats don't drone. Audio starts on the first tap or click (browsers require it) and can be muted; the choice is
// remembered.

const MUTE_KEY = 'buffetbattle.muted';

/** Every effect file, by name ("plate_1"). */
const FILES = Object.fromEntries(
  Object.entries(import.meta.glob('./sfx/*.wav', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
    .map(([path, url]) => [path.slice('./sfx/'.length, -'.wav'.length), url]),
);

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let primed = false;
const buffers = new Map<string, AudioBuffer>();
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

/**
 * Starts audio from a user gesture. Call it from tap-release, click and key handlers: iPhone Safari only lets audio
 * start when a finger lifts (not when it lands), and pauses it again whenever the app goes to the background.
 */
export function unlockAudio() {
  if (ctx) {
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    prime();
    return;
  }
  try {
    ctx = new AudioContext();
  } catch {
    return; // no Web Audio: the game stays silent
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  prime();
  // A gentle compressor keeps a busy battle frame from clipping.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -8; // only catches a pile-up of sounds; single sounds pass untouched
  comp.ratio.value = 3;
  out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  // Decode every effect once (they are small).
  const ac = ctx;
  for (const [name, url] of Object.entries(FILES)) {
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => ac.decodeAudioData(b))
      .then((buf) => buffers.set(name, buf))
      .catch(() => {});
  }
}

/** iPhone: playing one silent sample inside the gesture finishes unlocking audio. */
function prime() {
  if (primed || !ctx) return;
  primed = true;
  const src = ctx.createBufferSource();
  src.buffer = ctx.createBuffer(1, 1, 22050);
  src.connect(ctx.destination);
  src.start(0);
}

export const isMuted = () => muted;

export function toggleMute(): boolean {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // not remembered: fine
  }
  if (!muted) sfx('select');
  return muted;
}

/** Plays a recorded effect (a random take when there are several: "plate" picks plate_0, plate_1...). `exact` keeps the pitch in tune (for the scale). */
function play(name: string, at: number, opts: { v?: number; rate?: number; exact?: boolean } = {}) {
  if (!ctx || !out) return;
  const takes = buffers.has(name) ? [name] : [0, 1, 2, 3].map((i) => `${name}_${i}`).filter((n) => buffers.has(n));
  if (!takes.length) return;
  const src = ctx.createBufferSource();
  src.buffer = buffers.get(takes[Math.floor(Math.random() * takes.length)])!;
  src.playbackRate.value = (opts.rate ?? 1) * (opts.exact ? 1 : 0.96 + Math.random() * 0.08);
  const g = ctx.createGain();
  g.gain.value = opts.v ?? 0.6;
  src.connect(g).connect(out);
  src.start(at);
}

/** A run of buffs, heals or coins climbs a scale, like a xylophone run: each one within half a second of the last plays a step higher. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
let lastStep = -1;
let step = 0;
function ladder(at: number) {
  step = Math.abs(at - lastStep) < 0.5 ? Math.min(step + 1, SCALE.length - 1) : 0;
  lastStep = at;
  return 2 ** (SCALE[step] / 12);
}

/** Fat in a hot pan, synthesized: crackles over a soft hiss. */
function sizzle(at: number, d = 0.35, v = 1) {
  if (!ctx || !out || !noiseBuf) return;
  const burst = (t: number, len: number, vol: number, f: number) => {
    const src = ctx!.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx!.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = f;
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(filter).connect(g).connect(out!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.02);
  };
  burst(at, d, 0.025 * v, 4000);
  for (let i = 0; i < 7; i++) burst(at + Math.random() * d, 0.012, 0.05 * v, 2500);
}

/** Each sound, given its start time. Every file peaks at the same level, so these volumes set the mix: taps and UI soft, impacts up front, jingles between. */
const SOUNDS = {
  // kitchen
  select: (s: number) => play('bloop_3', s, { v: 0.25, rate: 1.4 }),
  page: (s: number) => play('page', s, { v: 0.35, rate: 1.1 }),
  pick: (s: number) => play('bloop', s, { v: 0.4, rate: 1.15 }),
  place: (s: number) => {
    play('plop', s, { v: 0.6 });
    play('plate', s, { v: 0.3 });
  },
  buy: (s: number) => {
    play('coins', s, { v: 0.45 });
    play('bloop', s + 0.06, { v: 0.5, rate: 1.1 });
  },
  coin: (s: number) => play('glass_0', s, { v: 0.35, rate: 1.3 * ladder(s), exact: true }),
  sell: (s: number) => {
    play('boop', s, { v: 0.55 });
    play('coins2', s + 0.08, { v: 0.4 });
  },
  merge: (s: number) => {
    play('bloop_0', s, { v: 0.5, exact: true });
    play('bloop_0', s + 0.07, { v: 0.5, rate: 1.335, exact: true });
    play('yay', s + 0.1, { v: 0.35 });
  },
  levelUp: (s: number) => play('xylo', s, { v: 0.5 }),
  cook: (s: number) => {
    sizzle(s, 0.4, 0.8);
    play('jCook', s + 0.05, { v: 0.55 });
  },
  freeze: (s: number) => play('fridge', s, { v: 0.6 }),
  item: (s: number) => play('drop', s, { v: 0.55 }),
  reroll: (s: number) => {
    play('clatter', s, { v: 0.35 });
    play('bloop', s + 0.05, { v: 0.3, rate: 0.9 });
  },
  bell: (s: number) => play('bell', s, { v: 0.45, rate: 1.5 }),
  deny: (s: number) => play('blah', s, { v: 0.5 }),
  grow: (s: number) => play('bloop_0', s, { v: 0.35, rate: 1.3 * ladder(s), exact: true }),
  // battle
  hit: (s: number) => {
    play('thump', s, { v: 0.7, rate: 1.1 });
    play('plop', s, { v: 0.3, rate: 0.8 }); // the bonk
  },
  bigHit: (s: number) => {
    play('punchBig', s, { v: 0.5 });
    play('thump', s, { v: 0.5, rate: 0.9 });
    play('plop', s, { v: 0.35, rate: 0.6 });
  },
  nom: (s: number) => {
    play('chop', s, { v: 0.5 });
    play('boop', s + 0.06, { v: 0.5 });
  },
  heal: (s: number) => play('ding', s, { v: 0.3, rate: 1.1 * ladder(s), exact: true }),
  buff: (s: number) => play('bloop_0', s, { v: 0.5, rate: ladder(s), exact: true }),
  debuff: (s: number) => play('knock', s, { v: 0.4, rate: 0.8 }),
  crust: (s: number) => play('knock', s, { v: 0.4, rate: 1.2 }),
  burn: (s: number) => sizzle(s),
  rot: (s: number) => play('squish', s, { v: 0.5, rate: 0.75 }),
  chill: (s: number) => play('glass', s, { v: 0.35, rate: 1.5 }),
  block: (s: number) => play('pot', s, { v: 0.35, rate: 1.2 }),
  summon: (s: number) => {
    play('hi', s, { v: 0.45 });
    play('plop', s, { v: 0.3 });
  },
  ability: (s: number) => play('tick', s, { v: 0.3 }),
  pew: (s: number) => {
    play('bloop', s, { v: 0.35, rate: 1.6 });
    play('swish', s, { v: 0.25, rate: 1.3 });
  },
  cooked: (s: number) => {
    sizzle(s, 0.2, 0.6);
    play('ding', s, { v: 0.35, rate: 1.3 });
  },
  win: (s: number) => play('jWin', s, { v: 0.55 }),
  lose: (s: number) => play('jLose', s, { v: 0.5 }),
  draw: (s: number) => play('jDraw', s, { v: 0.45 }),
  lifeLost: (s: number) => play('jLife', s, { v: 0.5 }),
  trophy: (s: number) => play('jTrophy', s, { v: 0.5 }),
};

export type Sfx = keyof typeof SOUNDS;

/** Plays a sound now, or `delay` ms from now. */
export function sfx(name: Sfx, delay = 0) {
  if (muted || !ctx || ctx.state !== 'running') return;
  SOUNDS[name](ctx.currentTime + Math.max(0, delay) / 1000);
}
