// Sound, synthesized with Web Audio (no audio files), in two voices that suit a pixel kitchen:
// - food sounds made from filtered noise and low thumps: plops on a plate, crunches, chomps, sizzles, squelches,
//   bubbles, the clink of a plate or a coin;
// - 8-bit tones for music and rewards: NES-style pulse waves (12.5% and 25% duty) and a triangle bass, moving in
//   steps between notes rather than sliding.
// Every sound varies its pitch a little so repeats don't drone. Under it all runs a quiet ambient bed: the kitchen's
// room tone with a simmering pot and the odd clink, or a dining room's murmur and cutlery in battle.
// Audio starts on the first tap or click (browsers require it) and can be muted; the choice is remembered.

const MUTE_KEY = 'buffetbattle.muted';

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let primed = false;
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
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  out = ctx.createGain();
  out.gain.value = 0.55;
  out.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  if (wantedAmbience) startAmbience(wantedAmbience);
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
  if (muted) stopAmbience();
  else {
    sfx('select');
    if (wantedAmbience) startAmbience(wantedAmbience);
  }
  return muted;
}

// ---------- building blocks ----------

/** NES-style pulse waves (the duty is the share of each cycle that is "on"), built once. */
const pulses = new Map<number, PeriodicWave>();
function pulse(duty: number): PeriodicWave {
  let w = pulses.get(duty);
  if (!w && ctx) {
    const n = 32;
    const real = new Float32Array(n), imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    w = ctx.createPeriodicWave(real, imag);
    pulses.set(duty, w);
  }
  return w!;
}

type Wave = 'p12' | 'p25' | 'tri' | 'sine';

interface Tone {
  /** Start, in seconds after the sound starts. */
  t?: number;
  f: number;
  d: number;
  w?: Wave;
  v?: number;
  /** A quick drop in pitch over the note (for thumps and bloops), as a multiple of f. */
  drop?: number;
}

function tone(start: number, p: number, n: Tone) {
  if (!ctx || !out) return;
  const at = start + (n.t ?? 0);
  const o = ctx.createOscillator();
  const w = n.w ?? 'p25';
  if (w === 'p12') o.setPeriodicWave(pulse(0.125));
  else if (w === 'p25') o.setPeriodicWave(pulse(0.25));
  else o.type = w === 'tri' ? 'triangle' : 'sine';
  o.frequency.setValueAtTime(n.f * p, at);
  if (n.drop) o.frequency.exponentialRampToValueAtTime(n.f * p * n.drop, at + Math.min(n.d, 0.08));
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(n.v ?? 0.08, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + n.d);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + n.d + 0.02);
}

/** Notes one after another, each held for `step` seconds: an 8-bit phrase. */
function phrase(start: number, p: number, notes: number[], step: number, w: Wave = 'p25', v = 0.05) {
  notes.forEach((f, i) => f && tone(start, p, { t: i * step, f, d: step * 0.95, w, v }));
}

interface Noise {
  t?: number;
  d: number;
  v?: number;
  filter: BiquadFilterType;
  f: number;
  /** Filter sweep target. */
  to?: number;
  q?: number;
}

function noise(start: number, n: Noise) {
  if (!ctx || !out || !noiseBuf) return;
  const at = start + (n.t ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = n.filter;
  filter.frequency.setValueAtTime(n.f, at);
  if (n.to) filter.frequency.exponentialRampToValueAtTime(n.to, at + n.d);
  if (n.q) filter.Q.value = n.q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(n.v ?? 0.08, at + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, at + n.d);
  src.connect(filter).connect(g).connect(out);
  src.start(at, Math.random() * 1.5);
  src.stop(at + n.d + 0.02);
}

// Food sounds, from the blocks above.
/** Something soft landing on a plate: a low thump and a tiny ceramic tick. */
const plop = (s: number, p: number, v = 1) => {
  tone(s, p, { f: 150, drop: 0.55, d: 0.11, w: 'sine', v: 0.2 * v });
  noise(s, { d: 0.04, v: 0.05 * v, filter: 'lowpass', f: 900 });
};
/** A crisp bite: two quick bursts of filtered noise. */
const crunch = (s: number, v = 1, f = 1800) => {
  for (const [t, k] of [[0, 1], [0.035, 0.7], [0.06, 0.5]]) noise(s, { t, d: 0.03, v: 0.09 * v * k, filter: 'bandpass', f: f * (0.8 + Math.random() * 0.4), q: 1.2 });
};
/** A bubble rising and popping. */
const bloop = (s: number, p: number, f = 260, v = 0.08) => tone(s, p, { f, drop: 2.2, d: 0.07, w: 'sine', v });
/** A metal or ceramic clink: a bright triangle ping with a hint of noise. */
const clink = (s: number, p: number, f = 2400, v = 0.05) => {
  tone(s, p, { f, d: 0.12, w: 'tri', v });
  tone(s, p, { f: f * 2.71, d: 0.06, w: 'sine', v: v * 0.4 });
  noise(s, { d: 0.015, v: v * 0.6, filter: 'highpass', f: 5000 });
};
/** Fat in a hot pan: crackles over a hiss. */
const sizzle = (s: number, d = 0.3, v = 1) => {
  noise(s, { d, v: 0.03 * v, filter: 'highpass', f: 4000 });
  for (let i = 0; i < 6; i++) noise(s, { t: Math.random() * d, d: 0.012, v: 0.06 * v, filter: 'highpass', f: 2500 });
};
/** A wet squish. */
const squelch = (s: number, p: number, v = 1) => {
  noise(s, { d: 0.12, v: 0.1 * v, filter: 'lowpass', f: 1400, to: 300 });
  tone(s, p, { f: 120, drop: 0.7, d: 0.1, w: 'sine', v: 0.08 * v });
};

// Notes (Hz)
const C4 = 262, E4 = 330, G4 = 392, A4 = 440, C5 = 523, D5 = 587, E5 = 659, F5 = 698, G5 = 784, A5 = 880, C6 = 1047, E6 = 1319, G6 = 1568;

/** Each sound: given its start time and a pitch multiplier. */
const SOUNDS = {
  // kitchen
  select: (s: number, p: number) => tone(s, p, { f: 1800, d: 0.025, w: 'tri', v: 0.035 }),
  pick: (s: number, p: number) => {
    noise(s, { d: 0.05, v: 0.05, filter: 'bandpass', f: 1200, q: 2 }); // lifted off the shelf
    bloop(s, p, 300, 0.06);
  },
  place: (s: number, p: number) => {
    plop(s, p);
    clink(s + 0.03, p, 2600, 0.025);
  },
  buy: (s: number, p: number) => {
    clink(s, p, 2200, 0.045); // coins on the counter
    clink(s + 0.06, p, 2900, 0.04);
    plop(s + 0.1, p, 0.8);
  },
  coin: (s: number, p: number) => clink(s, p, 2600 + Math.random() * 600, 0.035),
  sell: (s: number, p: number) => {
    tone(s, p, { f: 90, drop: 0.6, d: 0.14, w: 'sine', v: 0.18 }); // into the bin
    noise(s, { d: 0.12, v: 0.06, filter: 'bandpass', f: 600, q: 0.8 });
    clink(s + 0.08, p, 2500, 0.04);
  },
  merge: (s: number, p: number) => {
    squelch(s, p, 0.8); // squashed together
    phrase(s + 0.08, p, [C5, G5], 0.06, 'p25', 0.05);
  },
  levelUp: (s: number, p: number) => {
    sizzle(s, 0.25, 0.7);
    phrase(s + 0.05, p, [C5, E5, G5, C6], 0.065, 'p25', 0.05);
    tone(s + 0.05, p, { f: C4, d: 0.3, w: 'tri', v: 0.08 });
  },
  cook: (s: number, p: number) => {
    sizzle(s, 0.45, 1.2);
    phrase(s + 0.1, p, [C5, E5, G5, C6, E6, G6], 0.06, 'p25', 0.045);
    tone(s + 0.1, p, { f: C4, d: 0.45, w: 'tri', v: 0.09 });
    clink(s + 0.5, p, 3300, 0.06); // the oven timer: ding!
    clink(s + 0.5, p, 4950, 0.03);
  },
  freeze: (s: number, p: number) => {
    tone(s, p, { f: 110, drop: 0.7, d: 0.1, w: 'sine', v: 0.14 }); // fridge door
    phrase(s + 0.06, p, [E6, G6], 0.05, 'tri', 0.035); // frost
  },
  item: (s: number, p: number) => {
    for (const t of [0, 0.07, 0.14]) noise(s, { t, d: 0.05, v: 0.06, filter: 'highpass', f: 3500 }); // shake shake shake
    phrase(s + 0.18, p, [G5, C6], 0.06, 'p12', 0.04);
  },
  reroll: (s: number, p: number) => {
    for (let i = 0; i < 4; i++) clink(s + i * 0.045, p, 1800 + Math.random() * 1400, 0.025); // plates shuffled
    noise(s, { d: 0.2, v: 0.03, filter: 'bandpass', f: 900, to: 2400 });
  },
  bell: (s: number, p: number) => {
    tone(s, p, { f: 1760, d: 1.1, w: 'sine', v: 0.14 });
    tone(s, p, { f: 1760 * 2.01, d: 0.6, w: 'sine', v: 0.04 });
    tone(s, p, { f: 1760 * 1.5, d: 0.8, w: 'sine', v: 0.03 });
  },
  deny: (s: number, p: number) => {
    tone(s, p, { f: 160, d: 0.07, w: 'tri', v: 0.12 }); // knock knock on wood
    tone(s, p, { t: 0.1, f: 130, d: 0.08, w: 'tri', v: 0.12 });
  },
  grow: (s: number, p: number) => {
    bloop(s, p, 340, 0.05);
    tone(s + 0.05, p, { f: C6, d: 0.08, w: 'p12', v: 0.025 });
  },
  // battle
  hit: (s: number, p: number) => {
    noise(s, { d: 0.07, v: 0.14, filter: 'lowpass', f: 1600, to: 400 }); // thwack
    tone(s, p, { f: 140, drop: 0.5, d: 0.09, w: 'sine', v: 0.2 });
  },
  bigHit: (s: number, p: number) => {
    noise(s, { d: 0.14, v: 0.2, filter: 'lowpass', f: 2200, to: 300 }); // splat
    tone(s, p, { f: 110, drop: 0.45, d: 0.16, w: 'sine', v: 0.26 });
    crunch(s + 0.02, 1.2, 1400);
  },
  nom: (s: number, p: number) => {
    crunch(s, 1.1); // chomp
    tone(s, p, { f: 180, drop: 0.6, d: 0.06, w: 'sine', v: 0.1 });
    crunch(s + 0.13, 0.9, 1500); // chomp
    tone(s + 0.13, p, { f: 160, drop: 0.6, d: 0.06, w: 'sine', v: 0.08 });
  },
  heal: (s: number, p: number) => {
    bloop(s, p, 300, 0.05); // a sip
    phrase(s + 0.04, p, [E5, A5], 0.06, 'tri', 0.05);
  },
  buff: (s: number, p: number) => phrase(s, p, [C5, G5], 0.05, 'p12', 0.04),
  debuff: (s: number, p: number) => phrase(s, p, [G4, C4], 0.06, 'p12', 0.045),
  crust: (s: number) => crunch(s, 0.6, 3000),
  burn: (s: number) => sizzle(s, 0.3),
  rot: (s: number, p: number) => squelch(s, p),
  chill: (s: number, p: number) => phrase(s, p, [G6, E6, G6], 0.04, 'tri', 0.03),
  block: (s: number, p: number) => clink(s, p, 900, 0.08), // a pot lid
  summon: (s: number, p: number) => {
    noise(s, { d: 0.03, v: 0.08, filter: 'bandpass', f: 2000, q: 1.5 }); // pop!
    bloop(s, p, 220, 0.08);
  },
  ability: (s: number, p: number) => tone(s, p, { f: 1200, d: 0.04, w: 'p12', v: 0.03 }),
  pew: (s: number) => noise(s, { d: 0.06, v: 0.06, filter: 'bandpass', f: 2500, to: 1200, q: 1 }), // flick
  cooked: (s: number, p: number) => {
    sizzle(s, 0.15, 0.6);
    phrase(s, p, [C6, E6, G6], 0.04, 'p25', 0.035);
  },
  win: (s: number, p: number) => {
    phrase(s, p, [G4, C5, E5, G5, 0, E5, G5], 0.09, 'p25', 0.05);
    phrase(s, p, [C4, 0, G4, 0, C4, 0, C4], 0.09, 'tri', 0.08);
    clink(s + 0.66, p, 3300, 0.05);
  },
  lose: (s: number, p: number) => {
    phrase(s, p, [E5, D5, C5, 0, A4], 0.14, 'p25', 0.05);
    phrase(s, p, [C4, 0, A4 / 2, 0, F5 / 4], 0.14, 'tri', 0.07);
  },
  draw: (s: number, p: number) => phrase(s, p, [C5, 0, C5], 0.08, 'p25', 0.045),
  lifeLost: (s: number, p: number) => {
    noise(s, { d: 0.09, v: 0.1, filter: 'bandpass', f: 3000, q: 0.7 }); // a plate cracks
    clink(s, p, 1300, 0.05);
    phrase(s + 0.1, p, [E4, C4], 0.12, 'tri', 0.08);
  },
  trophy: (s: number, p: number) => {
    phrase(s, p, [C5, E5, G5, C6], 0.07, 'p25', 0.045);
    clink(s + 0.3, p, 3300, 0.05);
  },
};

export type Sfx = keyof typeof SOUNDS;

/** Plays a sound now, or `delay` ms from now. Pitch varies a little each time unless `steady`. */
export function sfx(name: Sfx, delay = 0, steady = false) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const p = steady ? 1 : 1 + (Math.random() - 0.5) * 0.06;
  SOUNDS[name](ctx.currentTime + Math.max(0, delay) / 1000, p);
}

// ---------- ambience ----------
// A quiet bed under everything: filtered noise for the room, breathing slowly, with little events scattered over it.

export type Ambience = 'kitchen' | 'battle';
let wantedAmbience: Ambience | null = null;
let bed: { src: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode } | null = null;
let eventTimer = 0;

/** Asks for an ambient bed (it starts once audio is unlocked and sound is on). Same kind again: nothing changes. */
export function setAmbience(kind: Ambience) {
  if (kind === wantedAmbience && bed) return;
  wantedAmbience = kind;
  startAmbience(kind);
}

function startAmbience(kind: Ambience) {
  stopAmbience();
  if (muted || !ctx || !out || !noiseBuf || document.hidden) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  // The kitchen hums low; the dining room murmurs in the voice range.
  filter.type = kind === 'kitchen' ? 'lowpass' : 'bandpass';
  filter.frequency.value = kind === 'kitchen' ? 380 : 520;
  filter.Q.value = kind === 'kitchen' ? 0.7 : 0.6;
  const gain = ctx.createGain();
  const level = kind === 'kitchen' ? 0.035 : 0.05;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(level, ctx.currentTime + 1.2);
  // Slow breathing in the level, so it doesn't sound like a fan.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = kind === 'kitchen' ? 0.13 : 0.31;
  const depth = ctx.createGain();
  depth.gain.value = level * 0.35;
  lfo.connect(depth).connect(gain.gain);
  src.connect(filter).connect(gain).connect(out);
  src.start();
  lfo.start();
  bed = { src, gain, lfo };
  scheduleEvent(kind);
}

function stopAmbience() {
  clearTimeout(eventTimer);
  if (!bed || !ctx) return;
  const { src, gain, lfo } = bed;
  bed = null;
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
  src.stop(ctx.currentTime + 0.55);
  lfo.stop(ctx.currentTime + 0.55);
}

/** Little sounds every few seconds: the pot simmering, a distant clink, a pan; in battle, cutlery and plates. */
function scheduleEvent(kind: Ambience) {
  eventTimer = window.setTimeout(() => {
    if (!bed || !ctx || muted) return;
    const s = ctx.currentTime;
    const p = 0.9 + Math.random() * 0.25;
    const r = Math.random();
    if (kind === 'kitchen') {
      if (r < 0.55) for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) bloop(s + i * (0.08 + Math.random() * 0.12), p, 160 + Math.random() * 140, 0.018); // simmer
      else if (r < 0.8) clink(s, p, 2000 + Math.random() * 1500, 0.012); // somewhere, a spoon
      else sizzle(s, 0.6, 0.25); // a pan
    } else if (r < 0.6) {
      for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) clink(s + i * (0.1 + Math.random() * 0.2), p, 2400 + Math.random() * 1600, 0.012); // cutlery
    } else noise(s, { d: 1.2, v: 0.02, filter: 'bandpass', f: 600 + Math.random() * 300, q: 0.8 }); // a laugh across the room
    scheduleEvent(kind);
  }, 1500 + Math.random() * 3500);
}

// The bed pauses with the page (a phone app sent to the background) and comes back with it.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopAmbience();
  else if (wantedAmbience) startAmbience(wantedAmbience);
});
