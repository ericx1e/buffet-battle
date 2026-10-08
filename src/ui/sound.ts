// Sound effects, synthesized with Web Audio: short pitched blips with quick decays (soft square, triangle and sine
// waves) and a little filtered noise for crunch, sizzle and whoosh. No audio files. Every sound gets a small random
// pitch shift so repeats don't drone. Audio starts on the first tap or click (browsers require it) and can be muted;
// the choice is remembered.

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
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
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

interface Tone {
  /** Start, in seconds after the sound starts. */
  t?: number;
  f: number;
  /** Slide to this frequency over the note. */
  to?: number;
  d: number;
  w?: OscillatorType;
  v?: number;
}

function tone(start: number, p: number, n: Tone) {
  if (!ctx || !out) return;
  const at = start + (n.t ?? 0);
  const o = ctx.createOscillator();
  o.type = n.w ?? 'triangle';
  o.frequency.setValueAtTime(n.f * p, at);
  if (n.to) o.frequency.exponentialRampToValueAtTime(n.to * p, at + n.d);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(n.v ?? 0.1, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + n.d);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + n.d + 0.02);
}

interface Noise {
  t?: number;
  d: number;
  v?: number;
  filter: BiquadFilterType;
  f: number;
  to?: number;
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
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(n.v ?? 0.08, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + n.d);
  src.connect(filter).connect(g).connect(out);
  src.start(at, Math.random() * 0.5);
  src.stop(at + n.d + 0.02);
}

// Notes (Hz)
const C5 = 523, E5 = 659, G5 = 784, A5 = 880, B5 = 988, C6 = 1047, E6 = 1319, G6 = 1568, A6 = 1760, C7 = 2093, E7 = 2637;

/** Each sound: tones and noise bursts, given its start time and a pitch multiplier. */
const SOUNDS = {
  // kitchen
  select: (s: number, p: number) => tone(s, p, { f: 1400, d: 0.03, w: 'sine', v: 0.05 }),
  pick: (s: number, p: number) => tone(s, p, { f: 500, to: 900, d: 0.07, w: 'sine', v: 0.12 }),
  place: (s: number, p: number) => {
    tone(s, p, { f: 340, to: 200, d: 0.09, v: 0.16 });
    noise(s, { d: 0.03, v: 0.05, filter: 'lowpass', f: 1200 });
  },
  buy: (s: number, p: number) => {
    tone(s, p, { f: B5, d: 0.06, w: 'square', v: 0.05 });
    tone(s, p, { t: 0.06, f: E6, d: 0.18, w: 'square', v: 0.05 });
    tone(s, p, { t: 0.06, f: E6 * 2, d: 0.12, w: 'sine', v: 0.03 });
  },
  coin: (s: number, p: number) => {
    tone(s, p, { f: 1976, d: 0.05, w: 'square', v: 0.03 });
    tone(s, p, { t: 0.04, f: E7, d: 0.09, w: 'square', v: 0.03 });
  },
  sell: (s: number, p: number) => {
    noise(s, { d: 0.05, v: 0.06, filter: 'bandpass', f: 2500 });
    for (const [i, f] of [G6, E6, A6].entries()) tone(s, p, { t: 0.04 + i * 0.05, f, d: 0.08, w: 'square', v: 0.04 });
  },
  merge: (s: number, p: number) => {
    tone(s, p, { f: 300, to: 900, d: 0.08, w: 'sine', v: 0.16 });
    tone(s, p, { t: 0.08, f: C6, d: 0.22, v: 0.08 });
    tone(s, p, { t: 0.12, f: G6, d: 0.2, v: 0.06 });
  },
  levelUp: (s: number, p: number) => {
    for (const [i, f] of [C5, E5, G5, C6].entries()) tone(s, p, { t: i * 0.07, f, d: 0.12, w: 'square', v: 0.05 });
    tone(s, p, { t: 0.28, f: C6, d: 0.4, v: 0.08 });
    tone(s, p, { t: 0.28, f: E6, d: 0.4, w: 'sine', v: 0.04 });
  },
  cook: (s: number, p: number) => {
    for (const [i, f] of [C5, E5, G5, C6, E6, G6].entries()) tone(s, p, { t: i * 0.06, f, d: 0.12, w: 'square', v: 0.045 });
    tone(s, p, { t: 0.36, f: C6, d: 0.6, v: 0.08 });
    tone(s, p, { t: 0.36, f: G6, d: 0.6, w: 'sine', v: 0.04 });
    for (let i = 0; i < 6; i++) tone(s, p, { t: 0.42 + i * 0.06, f: i % 2 ? E7 : C7, d: 0.08, w: 'sine', v: 0.025 });
  },
  freeze: (s: number, p: number) => {
    tone(s, p, { f: A6, d: 0.12, w: 'sine', v: 0.06 });
    tone(s, p, { t: 0.05, f: 2349, d: 0.22, w: 'sine', v: 0.05 });
    noise(s, { d: 0.15, v: 0.02, filter: 'highpass', f: 6000 });
  },
  item: (s: number, p: number) => {
    for (const [i, f] of [C6, E6, G6, C7].entries()) tone(s, p, { t: i * 0.05, f, d: 0.1, w: 'sine', v: 0.06 });
  },
  reroll: (s: number, p: number) => {
    noise(s, { d: 0.2, v: 0.07, filter: 'bandpass', f: 700, to: 3200 });
    for (const t of [0.05, 0.1, 0.15]) tone(s, p, { t, f: 1200, d: 0.02, w: 'square', v: 0.03 });
  },
  bell: (s: number, p: number) => {
    tone(s, p, { f: A6, d: 1.1, w: 'sine', v: 0.14 });
    tone(s, p, { f: A6 * 2.01, d: 0.6, w: 'sine', v: 0.04 });
    tone(s, p, { f: A6 * 1.5, d: 0.8, w: 'sine', v: 0.03 });
  },
  deny: (s: number, p: number) => {
    tone(s, p, { f: 230, to: 190, d: 0.09, w: 'square', v: 0.045 });
    tone(s, p, { t: 0.11, f: 190, to: 150, d: 0.11, w: 'square', v: 0.045 });
  },
  grow: (s: number, p: number) => {
    tone(s, p, { f: E6, to: A6, d: 0.1, w: 'sine', v: 0.05 });
    tone(s, p, { t: 0.06, f: C7, d: 0.12, w: 'sine', v: 0.035 });
  },
  // battle
  hit: (s: number, p: number) => {
    tone(s, p, { f: 190, to: 70, d: 0.12, v: 0.24 });
    noise(s, { d: 0.06, v: 0.12, filter: 'lowpass', f: 900 });
  },
  bigHit: (s: number, p: number) => {
    tone(s, p, { f: 150, to: 45, d: 0.2, w: 'square', v: 0.12 });
    tone(s, p, { f: 230, to: 60, d: 0.22, v: 0.22 });
    noise(s, { d: 0.14, v: 0.2, filter: 'lowpass', f: 1600, to: 300 });
  },
  nom: (s: number, p: number) => {
    for (const t of [0, 0.1]) {
      tone(s, p, { t, f: t ? 440 : 520, to: t ? 300 : 380, d: 0.08, w: 'sine', v: 0.13 });
      noise(s, { t, d: 0.05, v: 0.06, filter: 'bandpass', f: 1500 });
    }
  },
  heal: (s: number, p: number) => {
    tone(s, p, { f: A5, to: E6, d: 0.15, w: 'sine', v: 0.06 });
    tone(s, p, { t: 0.08, f: A6, d: 0.14, w: 'sine', v: 0.04 });
  },
  buff: (s: number, p: number) => tone(s, p, { f: 660, to: 990, d: 0.09, w: 'square', v: 0.035 }),
  debuff: (s: number, p: number) => tone(s, p, { f: 700, to: 440, d: 0.1, w: 'square', v: 0.035 }),
  crust: (s: number, p: number) => {
    tone(s, p, { f: C7, d: 0.05, v: 0.06 });
    tone(s, p, { t: 0.03, f: G6, d: 0.07, v: 0.04 });
  },
  burn: (s: number) => noise(s, { d: 0.28, v: 0.05, filter: 'highpass', f: 3000 }),
  rot: (s: number, p: number) => {
    tone(s, p, { f: 210, to: 140, d: 0.14, w: 'sine', v: 0.12 });
    tone(s, p, { t: 0.08, f: 170, to: 110, d: 0.14, w: 'sine', v: 0.1 });
  },
  chill: (s: number, p: number) => {
    for (const [i, f] of [E7, 3136, 2349].entries()) tone(s, p, { t: i * 0.04, f, d: 0.18, w: 'sine', v: 0.03 });
  },
  block: (s: number, p: number) => {
    tone(s, p, { f: 1200, d: 0.04, w: 'square', v: 0.05 });
    tone(s, p, { f: 600, d: 0.12, v: 0.09 });
  },
  summon: (s: number, p: number) => tone(s, p, { f: 400, to: 1200, d: 0.12, w: 'sine', v: 0.1 }),
  ability: (s: number, p: number) => tone(s, p, { f: 1000, to: 1400, d: 0.06, w: 'sine', v: 0.04 }),
  pew: (s: number, p: number) => {
    tone(s, p, { f: 1400, to: 500, d: 0.09, w: 'square', v: 0.04 });
    noise(s, { d: 0.04, v: 0.03, filter: 'highpass', f: 4000 });
  },
  cooked: (s: number, p: number) => {
    for (const [i, f] of [C6, E6, G6, C7].entries()) tone(s, p, { t: i * 0.04, f, d: 0.09, w: 'square', v: 0.035 });
  },
  win: (s: number, p: number) => {
    for (const [i, f] of [G5, C6, E6, G6].entries()) tone(s, p, { t: i * 0.1, f, d: 0.13, w: 'square', v: 0.055 });
    for (const f of [C6, E6, G6]) tone(s, p, { t: 0.42, f, d: 0.7, v: 0.06 });
  },
  lose: (s: number, p: number) => {
    tone(s, p, { f: 392, to: 370, d: 0.26, v: 0.1 });
    tone(s, p, { t: 0.28, f: 349, to: 330, d: 0.26, v: 0.1 });
    tone(s, p, { t: 0.56, f: 330, to: 247, d: 0.55, v: 0.1 });
  },
  draw: (s: number, p: number) => {
    tone(s, p, { f: C6, d: 0.14, v: 0.07 });
    tone(s, p, { t: 0.18, f: C6, d: 0.2, v: 0.07 });
  },
  lifeLost: (s: number, p: number) => {
    tone(s, p, { f: 320, to: 150, d: 0.35, w: 'sine', v: 0.12 });
    noise(s, { d: 0.1, v: 0.05, filter: 'lowpass', f: 600 });
  },
  trophy: (s: number, p: number) => {
    for (const [i, f] of [E6, G6, C7].entries()) tone(s, p, { t: i * 0.08, f, d: 0.16, w: 'square', v: 0.04 });
    for (let i = 0; i < 4; i++) tone(s, p, { t: 0.26 + i * 0.05, f: i % 2 ? E7 : C7, d: 0.07, w: 'sine', v: 0.025 });
  },
};

export type Sfx = keyof typeof SOUNDS;

/** Plays a sound now, or `delay` ms from now. Pitch varies a little each time unless `steady`. */
export function sfx(name: Sfx, delay = 0, steady = false) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const p = steady ? 1 : 1 + (Math.random() - 0.5) * 0.06;
  SOUNDS[name](ctx.currentTime + Math.max(0, delay) / 1000, p);
}
