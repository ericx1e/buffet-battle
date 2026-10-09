// Background music, sequenced live from the same marimba, glockenspiel and kitchen percussion as the sound effects
// (so it is in their key and costs no extra download), with a soft synthesized bass. Two loops for the kitchen and
// two for battles; the player picks one of each in the settings. Each bar is 16 sixteenth notes. Patterns: 'x' a hit,
// 'o' a soft one, '.' a rest. Bass: R root, 5 fifth, O octave. Arp digits pick the chord's notes (0 lowest).
// Melodies are [step, MIDI note] per bar and cycle.
import { audioSettings, musicOut, musicVoice, onAudioChange } from './sound';

export type Scene = 'kitchen' | 'battle';

interface Track {
  id: string;
  name: string;
  scene: Scene;
  bpm: number;
  /** 0.5 is straight; more delays every second sixteenth. */
  swing: number;
  chords: { name: string; root: number; notes: number[] }[];
  bass: string;
  stab?: { pat: string; v: number };
  arp?: { pat: string; v: number };
  melody: { inst: 'mar' | 'glock'; v: number; bars: [number, number][][] };
  sparkle?: { inst: 'mar' | 'glock'; v: number; bars: [number, number][][] };
  perc: { s: string; pat: string; v: number }[];
}

export const TRACKS: Track[] = [
  {
    id: 'prep', name: 'Prep Time', scene: 'kitchen', bpm: 100, swing: 0.6,
    chords: [
      { name: 'C', root: 36, notes: [64, 67, 72] },
      { name: 'Am', root: 45, notes: [64, 69, 72] },
      { name: 'F', root: 41, notes: [65, 69, 72] },
      { name: 'G', root: 43, notes: [62, 67, 71] },
    ],
    bass: 'R..R..5.R.....5.',
    stab: { pat: '....x.......x...', v: 0.16 },
    melody: { inst: 'mar', v: 0.42, bars: [
      [[0, 76], [3, 79], [6, 84], [8, 83], [10, 79], [12, 76]],
      [[0, 72], [3, 76], [6, 81], [8, 79], [12, 76]],
      [[0, 77], [3, 81], [6, 84], [8, 86], [10, 84], [12, 81]],
      [[0, 79], [3, 83], [6, 86], [10, 83], [12, 79], [14, 74]],
      [[0, 76], [2, 77], [3, 79], [6, 84], [8, 88], [12, 84]],
      [[0, 81], [3, 79], [6, 76], [8, 72], [12, 76]],
      [[0, 77], [3, 76], [6, 77], [8, 81], [10, 79], [12, 77]],
      [[0, 74], [3, 79], [6, 83], [8, 86], [12, 84]],
    ] },
    sparkle: { inst: 'glock', v: 0.14, bars: [[[0, 96]], [], [], [], [[0, 100], [8, 103]], [], [], [[12, 108]]] },
    perc: [
      { s: 'bongoL', pat: 'x.......x.......', v: 0.22 },
      { s: 'bongoH', pat: '......o.......o.', v: 0.18 },
      { s: 'shake', pat: '..o...o...o...o.', v: 0.12 },
    ],
  },
  {
    id: 'simmer', name: 'Simmer', scene: 'kitchen', bpm: 84, swing: 0.62,
    chords: [
      { name: 'Fmaj7', root: 41, notes: [65, 69, 72, 76] },
      { name: 'Em7', root: 40, notes: [64, 67, 71, 74] },
      { name: 'Dm7', root: 38, notes: [62, 65, 69, 72] },
      { name: 'G7', root: 43, notes: [67, 71, 74, 77] },
    ],
    bass: 'R.......5.....R.',
    arp: { pat: '0.1.2.3.2.1.0.2.', v: 0.15 },
    melody: { inst: 'glock', v: 0.2, bars: [
      [[0, 100], [6, 96], [10, 93]],
      [[0, 95], [6, 91], [12, 88]],
      [[0, 93], [4, 96], [8, 100], [12, 98]],
      [[0, 95], [8, 91]],
    ] },
    perc: [
      { s: 'tri', pat: 'x...............', v: 0.08 },
      { s: 'wood', pat: 'o.......o.......', v: 0.12 },
      { s: 'shake', pat: '....o.......o...', v: 0.1 },
    ],
  },
  {
    id: 'rush', name: 'Dinner Rush', scene: 'battle', bpm: 138, swing: 0.5,
    chords: [
      { name: 'Am', root: 45, notes: [69, 72, 76] },
      { name: 'F', root: 41, notes: [65, 69, 72] },
      { name: 'C', root: 48, notes: [67, 72, 76] },
      { name: 'G', root: 43, notes: [67, 71, 74] },
    ],
    bass: 'R.R.R.R.R.R.O.R.',
    arp: { pat: '0120012001200123', v: 0.12 },
    melody: { inst: 'mar', v: 0.42, bars: [
      [[0, 81], [2, 84], [4, 88], [6, 84], [8, 86], [10, 84], [12, 81], [14, 79]],
      [[0, 81], [4, 77], [6, 81], [8, 84], [12, 81]],
      [[0, 79], [2, 84], [4, 88], [6, 91], [8, 88], [12, 84]],
      [[0, 86], [2, 83], [4, 79], [8, 83], [10, 86], [12, 91], [14, 88]],
    ] },
    perc: [
      { s: 'bongoL', pat: 'x.....x.x.......', v: 0.3 },
      { s: 'bongoH', pat: '..o.x.o...o.x.oo', v: 0.22 },
      { s: 'clap', pat: '....x.......x...', v: 0.16 },
      { s: 'shake', pat: 'oooooooooooooooo', v: 0.06 },
    ],
  },
  {
    id: 'fight', name: 'Food Fight', scene: 'battle', bpm: 120, swing: 0.55,
    chords: [
      { name: 'Dm', root: 38, notes: [62, 65, 69] },
      { name: 'G', root: 43, notes: [62, 67, 71] },
      { name: 'C', root: 36, notes: [64, 67, 72] },
      { name: 'Am', root: 45, notes: [64, 69, 72] },
    ],
    bass: 'R..R..R.5..5..R.',
    stab: { pat: 'x..x..x.....x...', v: 0.15 },
    melody: { inst: 'mar', v: 0.4, bars: [
      [[0, 74], [3, 77], [6, 81], [8, 79], [10, 77], [12, 74]],
      [[0, 79], [3, 83], [6, 86], [8, 83], [12, 79]],
      [[0, 76], [3, 79], [6, 84], [8, 83], [10, 84], [12, 88]],
      [[0, 84], [2, 81], [4, 76], [8, 81], [11, 79], [14, 77]],
    ] },
    perc: [
      { s: 'wood', pat: 'x.o.x.o.x.o.x.o.', v: 0.1 },
      { s: 'bongoL', pat: 'x.......x..x....', v: 0.28 },
      { s: 'bongoH', pat: '....x..x....x.x.', v: 0.2 },
      { s: 'clap', pat: '....x.......x...', v: 0.14 },
    ],
  },
];

export const tracksFor = (scene: Scene) => TRACKS.filter((t) => t.scene === scene);

/** How far ahead notes are scheduled, and how often the scheduler looks. */
const LOOKAHEAD = 0.15;
const TICK_MS = 25;

let scene: Scene | null = null;
let playing: { track: Track; bus: GainNode; step: number; next: number; timer: number } | null = null;

const stepLen = (t: Track) => 60 / t.bpm / 4;

function playStep(t: Track, step: number, at: number, bus: GainNode) {
  const voice = musicVoice();
  if (!voice) return;
  const bar = Math.floor(step / 16);
  const s = step % 16;
  const chord = t.chords[bar % t.chords.length];
  const b = t.bass[s];
  if (b !== '.') voice.bass(chord.root + (b === '5' ? 7 : b === 'O' ? 12 : 0), at, 0.32, stepLen(t) * 3.2, bus);
  if (t.stab && t.stab.pat[s] !== '.') for (const n of chord.notes) voice.note('mar', n, at, t.stab.v, bus);
  if (t.arp && t.arp.pat[s] !== '.') {
    const i = Number(t.arp.pat[s]);
    voice.note('mar', i < chord.notes.length ? chord.notes[i] : chord.notes[0] + 12, at, t.arp.v, bus);
  }
  for (const part of [t.melody, t.sparkle]) {
    if (!part) continue;
    for (const [ms, m] of part.bars[bar % part.bars.length]) if (ms === s) voice.note(part.inst, m, at, part.v, bus);
  }
  for (const p of t.perc) {
    const c = p.pat[s];
    if (c !== '.') voice.sample(p.s, at, c === 'o' ? p.v * 0.6 : p.v, 0.97 + Math.random() * 0.06, bus);
  }
}

function tick() {
  const voice = musicVoice();
  if (!playing || !voice) return;
  const { track } = playing;
  while (playing.next < voice.now() + LOOKAHEAD) {
    const swing = playing.step % 2 === 1 ? (track.swing - 0.5) * 2 * stepLen(track) : 0;
    playStep(track, playing.step, playing.next + swing, playing.bus);
    playing.next += stepLen(track);
    playing.step++;
  }
}

function stop() {
  if (!playing) return;
  clearInterval(playing.timer);
  const voice = musicVoice();
  // Fade out what is already scheduled, then let it go.
  const bus = playing.bus;
  if (voice) bus.gain.setTargetAtTime(0, voice.now(), 0.12);
  setTimeout(() => bus.disconnect(), 800);
  playing = null;
}

/**
 * Plays the chosen loop for the screen (null: silence), once audio is unlocked and music is on. Call it whenever the
 * screen, the settings or the page's visibility change; it does nothing if the right loop is already playing.
 */
export function syncMusic(next: Scene | null = scene) {
  scene = next;
  const settings = audioSettings();
  const voice = musicVoice();
  const out = musicOut();
  const wanted = voice && out && scene && settings.musicOn && !document.hidden
    ? (TRACKS.find((t) => t.id === settings[scene!]) ?? tracksFor(scene)[0])
    : null;
  if (playing?.track === wanted) return;
  stop();
  if (!wanted || !voice || !out) return;
  const bus = voice.bus(out);
  bus.gain.setValueAtTime(0.0001, voice.now());
  bus.gain.exponentialRampToValueAtTime(1, voice.now() + 0.6);
  playing = { track: wanted, bus, step: 0, next: voice.now() + 0.1, timer: window.setInterval(tick, TICK_MS) };
  tick();
}

// A background tab throttles timers (and phones pause audio), so the music stops there and picks up on return.
document.addEventListener('visibilitychange', () => syncMusic());

onAudioChange(() => syncMusic());
