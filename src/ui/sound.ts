// Sound, in the spirit of Super Auto Pets: soft real instruments and bubbly pops, everything in one key (C major) so
// it all agrees. A marimba plays the meaningful moments as little tunes (two notes up to buy, down to sell, a run on a
// level up, a fanfare to win, a sinking line to lose), a glockenspiel sparkles on heals, coins, freezing and cooking,
// a woodblock ticks for taps, bongos bonk for hits, a log drum says "nuh-uh", and pops and plops for picking up,
// placing and things appearing. A run of buffs, heals or coins climbs a pentatonic scale. A few kitchen sounds stay
// (coins, the knife, the fridge, the pot lid, the service bell); Burn's sizzle and the poof of an eaten food are
// synthesized. Samples are CC0 (Versilian Community Sample Library, OpenGameArt, Kenney; credits in ./sfx), converted to
// WAVs at full quality, normalized to the same peak, and the instrument notes tuned exactly.
// Effects with several takes (wood_0, wood_1...) pick one at random, and untuned sounds vary their pitch a little, so
// repeats don't drone. Audio starts on the first tap or click (browsers require it). Sound effects and music (see
// music.ts) each have a volume and an on/off switch, remembered in the browser.

/** Before the settings popup there was only one switch: its value still mutes both for returning players. */
const MUTE_KEY = 'buffetbattle.muted';
const SETTINGS_KEY = 'buffetbattle.audio';

export interface AudioSettings {
  /** Volumes from 0 to 1. */
  sfx: number;
  music: number;
  sfxOn: boolean;
  musicOn: boolean;
  /** The chosen loop for each screen (a track id from music.ts). */
  kitchen: string;
  battle: string;
}

const DEFAULTS: AudioSettings = { sfx: 0.8, music: 0.5, sfxOn: true, musicOn: true, kitchen: 'prep', battle: 'rush' };

let settings: AudioSettings = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (saved) return { ...DEFAULTS, ...saved };
    if (localStorage.getItem(MUTE_KEY) === '1') return { ...DEFAULTS, sfxOn: false, musicOn: false };
  } catch {
    // unreadable: defaults
  }
  return { ...DEFAULTS };
})();

export const audioSettings = (): Readonly<AudioSettings> => settings;

/** Changes and remembers audio settings, and applies the volumes at once. */
export function setAudio(patch: Partial<AudioSettings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // not remembered: fine
  }
  applyVolumes();
  changed();
}

/** Volume sliders feel even when the gain follows their square. Effects keep the mix they were tuned at (0.8 is 1). */
function applyVolumes() {
  if (!ctx || !sfxBus || !musicBus) return;
  sfxBus.gain.setTargetAtTime(settings.sfxOn ? (settings.sfx / 0.8) ** 2 : 0, ctx.currentTime, 0.03);
  musicBus.gain.setTargetAtTime(settings.musicOn ? settings.music ** 2 * 0.9 : 0, ctx.currentTime, 0.03);
}

/** Called when audio starts running or the settings change (music.ts starts or switches its loop). */
const hooks: (() => void)[] = [];
export function onAudioChange(cb: () => void) {
  hooks.push(cb);
}
const changed = () => hooks.forEach((cb) => cb());

/** Every effect file, by name ("plate_1"). */
const FILES = Object.fromEntries(
  Object.entries(import.meta.glob('./sfx/*.wav', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
    .map(([path, url]) => [path.slice('./sfx/'.length, -'.wav'.length), url]),
);

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let primed = false;
const buffers = new Map<string, AudioBuffer>();

/**
 * Starts audio from a user gesture. Call it from tap-release, click and key handlers: iPhone Safari only lets audio
 * start when a finger lifts (not when it lands), and pauses it again whenever the app goes to the background.
 */
export function unlockAudio() {
  if (ctx) {
    if (ctx.state !== 'running') ctx.resume().then(changed).catch(() => {});
    prime();
    return;
  }
  try {
    ctx = new AudioContext();
  } catch {
    return; // no Web Audio: the game stays silent
  }
  if (ctx.state !== 'running') ctx.resume().then(changed).catch(() => {});
  prime();
  // A gentle compressor keeps a busy battle frame from clipping.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -8; // only catches a pile-up of sounds; single sounds pass untouched
  comp.ratio.value = 3;
  out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.connect(out);
  musicBus = ctx.createGain();
  musicBus.connect(out);
  applyVolumes();
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
  if (ctx.state === 'running') changed();
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

/** Everything off: sound effects and music. */
export const isMuted = () => !settings.sfxOn && !settings.musicOn;

/** Key m: everything off, or (when it all is) everything back on. */
export function toggleMute(): boolean {
  const on = isMuted();
  setAudio({ sfxOn: on, musicOn: on });
  if (on) sfx('select');
  return !on;
}

/** Plays a recorded effect (a random take when there are several: "plate" picks plate_0, plate_1...). `exact` keeps the pitch in tune (for the scale). */
function play(name: string, at: number, opts: { v?: number; rate?: number; exact?: boolean } = {}, bus: AudioNode | null = sfxBus) {
  if (!ctx || !bus) return;
  const takes = buffers.has(name) ? [name] : [0, 1, 2, 3].map((i) => `${name}_${i}`).filter((n) => buffers.has(n));
  if (!takes.length) return;
  const src = ctx.createBufferSource();
  src.buffer = buffers.get(takes[Math.floor(Math.random() * takes.length)])!;
  src.playbackRate.value = (opts.rate ?? 1) * (opts.exact ? 1 : 0.96 + Math.random() * 0.08);
  const g = ctx.createGain();
  g.gain.value = opts.v ?? 0.6;
  src.connect(g).connect(bus);
  src.start(at);
}

/** Instrument notes on disk, by MIDI number (mar_72 is the marimba's C5). */
const NOTES = { mar: [65, 72, 79, 83, 89, 96], glock: [96, 103, 108] } as const;

/** Plays one note (MIDI number) on an instrument, from its nearest recorded note. */
function note(inst: keyof typeof NOTES, midi: number, at: number, v = 0.5, bus: AudioNode | null = sfxBus) {
  const from = NOTES[inst].reduce<number>((a, b) => (Math.abs(b - midi) < Math.abs(a - midi) ? b : a), NOTES[inst][0]);
  play(`${inst}_${from}`, at, { v, rate: 2 ** ((midi - from) / 12), exact: true }, bus);
}

/** A soft plucked bass for the music: a triangle with a sine an octave down, through a gentle low-pass, dying away. */
function bass(midi: number, at: number, v: number, len: number, bus: AudioNode) {
  if (!ctx) return;
  const f = 440 * 2 ** ((midi - 69) / 12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(v, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  lp.Q.value = 0.7;
  for (const [type, mult, amp] of [['triangle', 1, 1], ['sine', 0.5, 0.7]] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f * mult;
    const og = ctx.createGain();
    og.gain.value = amp;
    o.connect(og).connect(lp);
    o.start(at);
    o.stop(at + len + 0.05);
  }
  lp.connect(g).connect(bus);
}

/** The music bus, once audio has started. */
export const musicOut = () => musicBus;

/** What music.ts plays its loops with: the instruments, routed to a bus of its own. Null until audio is running. */
export function musicVoice() {
  if (!ctx || ctx.state !== 'running') return null;
  const c = ctx;
  return {
    now: () => c.currentTime,
    bus: (parent: AudioNode) => {
      const g = c.createGain();
      g.connect(parent);
      return g;
    },
    note: (inst: keyof typeof NOTES, midi: number, at: number, v: number, bus: AudioNode) => note(inst, midi, at, v, bus),
    sample: (name: string, at: number, v: number, rate: number, bus: AudioNode) => play(name, at, { v, rate }, bus),
    bass,
  };
}

/** A little tune: [MIDI note, beat] pairs, a beat being `beat` seconds. */
function tune(inst: keyof typeof NOTES, notes: [number, number][], at: number, v = 0.5, beat = 0.09) {
  for (const [m, b] of notes) note(inst, m, at + b * beat, v);
}

/** A run of buffs, heals or coins climbs a scale: each one within 0.35 s of the last plays a step higher (C major pentatonic). */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
let lastStep = -1;
let step = 0;
function ladder(at: number) {
  step = Math.abs(at - lastStep) < 0.35 ? Math.min(step + 1, SCALE.length - 1) : 0;
  lastStep = at;
  return SCALE[step];
}

/** A soft puff of air, falling: the poof of a food that's been eaten. */
function poof(at: number, v = 1) {
  if (!ctx || !sfxBus || !noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 2;
  f.frequency.setValueAtTime(2400, at);
  f.frequency.exponentialRampToValueAtTime(260, at + 0.28);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.35 * v, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(at, Math.random() * 0.5);
  src.stop(at + 0.35);
}

/** Fat in a hot pan, synthesized: crackles over a soft hiss. */
function sizzle(at: number, d = 0.35, v = 1) {
  if (!ctx || !sfxBus || !noiseBuf) return;
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
    src.connect(filter).connect(g).connect(sfxBus!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.02);
  };
  burst(at, d, 0.025 * v, 4000);
  for (let i = 0; i < 7; i++) burst(at + Math.random() * d, 0.012, 0.05 * v, 2500);
}

/** Each sound, given its start time. Every file peaks at the same level, so these volumes set the mix: taps and UI soft, impacts up front, jingles between. */
const SOUNDS = {
  // kitchen
  select: (s: number) => play('wood', s, { v: 0.3, rate: 1.1 }),
  page: (s: number) => play('page', s, { v: 0.3, rate: 1.1 }),
  pick: (s: number) => play('bloop', s, { v: 0.45, rate: 1.1 }),
  place: (s: number) => {
    play('plop', s, { v: 0.5 });
    play('bongoL', s, { v: 0.3, rate: 1.2 });
  },
  buy: (s: number) => {
    play('coins', s, { v: 0.3 });
    tune('mar', [[72, 0], [79, 0.8]], s, 0.45);
  },
  coin: (s: number) => note('glock', 96 + ladder(s), s, 0.25),
  sell: (s: number) => {
    tune('mar', [[79, 0], [72, 0.8]], s, 0.4);
    play('coins2', s + 0.08, { v: 0.3 });
  },
  merge: (s: number) => {
    play('bloop', s, { v: 0.4 });
    tune('mar', [[72, 0], [76, 0.7], [79, 1.4]], s, 0.45);
  },
  levelUp: (s: number) => {
    tune('mar', [[72, 0], [76, 1], [79, 2], [84, 3]], s, 0.5);
    note('glock', 96, s + 0.27, 0.3);
  },
  cook: (s: number) => {
    sizzle(s, 0.4, 0.8);
    tune('mar', [[72, 0], [79, 1], [84, 2]], s, 0.45);
    tune('glock', [[96, 3], [100, 4], [103, 5], [108, 6]], s, 0.25, 0.07);
  },
  freeze: (s: number) => {
    play('tri', s, { v: 0.3 });
    tune('glock', [[108, 0], [103, 1]], s, 0.22, 0.06);
    play('fridge', s, { v: 0.25 });
  },
  item: (s: number) => {
    play('plop', s, { v: 0.4 });
    note('mar', 84, s + 0.04, 0.35);
  },
  reroll: (s: number) => {
    play('shake', s, { v: 0.35 });
    [0, 1, 2, 3, 4].forEach((i) => play('bloop_0', s + 0.06 + i * 0.045, { v: 0.22, rate: 0.9 + i * 0.07 })); // the new stock popping in
  },
  bell: (s: number) => play('bell', s, { v: 0.45, exact: true }), // the service bell, tuned to G6 (tools/gen-bell.mjs)
  deny: (s: number) => {
    play('logHi', s, { v: 0.5 }); // nuh-uh
    play('logLo', s + 0.12, { v: 0.5 });
  },
  grow: (s: number) => note('mar', 84 + ladder(s), s, 0.3),
  // battle
  hit: (s: number) => {
    play('bongoH', s, { v: 0.55 });
    play('thump', s, { v: 0.3, rate: 1.1 });
  },
  bigHit: (s: number) => {
    play('slap', s, { v: 0.35 });
    play('bongoL', s, { v: 0.6 });
    play('thump', s, { v: 0.4, rate: 0.9 });
  },
  nom: (s: number) => {
    // eaten: a soft bubbly pop going down, and a little puff
    play('bloop_0', s, { v: 0.4, rate: 0.75 });
    play('plop', s + 0.05, { v: 0.3, rate: 0.85 });
    poof(s + 0.04, 0.5);
  },
  heal: (s: number) => note('glock', 96 + ladder(s), s, 0.22),
  buff: (s: number) => note('mar', 72 + ladder(s), s, 0.45),
  debuff: (s: number) => tune('mar', [[68, 0], [65, 1]], s, 0.3, 0.08),
  crust: (s: number) => play('wood', s, { v: 0.45, rate: 0.75 }),
  burn: (s: number) => sizzle(s),
  rot: (s: number) => play('squish', s, { v: 0.45, rate: 0.75 }),
  chill: (s: number) => {
    note('glock', 108, s, 0.2);
    play('tri', s, { v: 0.15 });
  },
  block: (s: number) => {
    play('pot', s, { v: 0.3, rate: 1.2 });
    play('wood', s, { v: 0.3 });
  },
  summon: (s: number) => {
    play('bloop', s, { v: 0.45 });
    note('mar', 84, s + 0.05, 0.3);
  },
  ability: (s: number) => play('wood', s, { v: 0.2, rate: 1.3 }),
  pew: (s: number) => {
    play('bloop', s, { v: 0.35, rate: 1.5 });
    play('shake', s, { v: 0.15, rate: 1.3 });
  },
  cooked: (s: number) => {
    sizzle(s, 0.2, 0.6);
    tune('glock', [[96, 0], [103, 1]], s, 0.25, 0.07);
  },
  win: (s: number) => {
    tune('mar', [[72, 0], [76, 1], [79, 2], [84, 3.5], [79, 5], [84, 6], [88, 6]], s, 0.5);
    tune('glock', [[96, 3.5], [100, 6], [103, 6]], s, 0.2);
    play('clap', s + 0.54, { v: 0.25 });
  },
  lose: (s: number) => tune('mar', [[79, 0], [76, 1.5], [72, 3], [67, 5]], s, 0.42, 0.12),
  draw: (s: number) => tune('mar', [[76, 0], [72, 1], [76, 2]], s, 0.4, 0.11),
  lifeLost: (s: number) => {
    play('logLo', s, { v: 0.45 });
    tune('mar', [[67, 1], [60, 3]], s, 0.38, 0.11);
  },
  trophy: (s: number) => {
    tune('mar', [[72, 0], [79, 0], [84, 0]], s, 0.35);
    tune('glock', [[96, 0], [100, 1], [103, 2], [108, 3]], s, 0.25, 0.07);
  },
};

export type Sfx = keyof typeof SOUNDS;

/** Plays a sound now, or `delay` ms from now. */
export function sfx(name: Sfx, delay = 0) {
  if (!settings.sfxOn || !ctx || ctx.state !== 'running') return;
  SOUNDS[name](ctx.currentTime + Math.max(0, delay) / 1000);
}
