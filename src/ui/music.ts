// Background music, sequenced live from the same marimba, glockenspiel and kitchen percussion as the sound effects
// (so it is in their key and costs no extra download), with a soft synthesized bass: Snack Time in the kitchen (a
// longer piece in parts, see Track.form), Boss Plate in battles (more were auditioned on a jukebox page). Each bar is 16 sixteenth notes. Patterns: 'x' a hit,
// 'o' a soft one, '.' a rest. Bass: R root, 5 fifth, O octave. Arp digits pick the chord's notes (0 lowest).
// Melodies are [step, MIDI note] per bar and cycle.
import { audioSettings, musicOut, musicVoice, onAudioChange } from './sound';

export type Scene = 'kitchen' | 'battle';

type Chord = { name: string; root: number; notes: number[] };
type Line = { inst: 'mar' | 'glock'; v: number; bars: [number, number][][] };

/** What plays in a stretch of bars: chords, bass, stab, arpeggio, melody, sparkle and percussion. */
interface Part {
  chords: Chord[];
  bass: string;
  stab?: { pat: string; v: number };
  arp?: { pat: string; v: number };
  melody?: Line;
  sparkle?: Line;
  perc: { s: string; pat: string; v: number }[];
}

interface Track extends Part {
  id: string;
  name: string;
  scene: Scene;
  bpm: number;
  /** 0.5 is straight; more delays every second sixteenth. */
  swing: number;
  /** A longer piece: these parts in order (each `bars` long), then round again. Without it the track is one part. */
  form?: (Partial<Part> & { bars: number; name: string })[];
}

// Shared pieces of Snack Time (below): its chords and grooves.
const AM = { name: 'Am', root: 45, notes: [69, 72, 76] };
const F = { name: 'F', root: 41, notes: [65, 69, 72] };
const C = { name: 'C', root: 48, notes: [64, 67, 72] };
const G = { name: 'G', root: 43, notes: [62, 67, 71] };
const EM = { name: 'Em', root: 40, notes: [64, 67, 71] };
const DM = { name: 'Dm', root: 38, notes: [62, 65, 69] };
const E = { name: 'E', root: 40, notes: [64, 68, 71] };
const GROOVE = 'R..R.O.RR..5.O..';
const LIGHT_PERC = [
  { s: 'bongoL', pat: 'x.....x...x.....', v: 0.2 },
  { s: 'shake', pat: '..o...o...o...o.', v: 0.11 },
];
const FULL_PERC = [
  { s: 'bongoL', pat: 'x.....x...x.....', v: 0.22 },
  { s: 'bongoH', pat: '....o.......o..o', v: 0.18 },
  { s: 'clap', pat: '....x.......x...', v: 0.1 },
  { s: 'shake', pat: '..o...o...o...o.', v: 0.12 },
];
const THEME: [number, number][][] = [
  [[0, 76], [3, 77], [4, 76], [6, 72], [8, 69], [10, 72], [12, 76], [14, 79]],
  [[0, 77], [2, 76], [4, 72], [8, 69], [11, 72], [12, 77]],
  [[0, 79], [3, 76], [6, 72], [8, 76], [10, 79], [12, 84]],
  [[0, 83], [2, 81], [4, 79], [8, 74], [12, 71], [14, 74]],
  [[0, 76], [3, 77], [4, 76], [6, 72], [8, 69], [10, 72], [12, 76], [14, 81]],
  [[0, 84], [2, 81], [4, 77], [8, 81], [11, 84], [12, 86]],
  [[0, 88], [3, 86], [6, 84], [8, 79], [12, 76]],
  [[0, 79], [4, 83], [8, 86], [12, 83], [14, 79]],
];

export const TRACKS: Track[] = [
  {
    // A longer kitchen loop (about 90 seconds before it repeats), light and swung, led by a walking bass: a groove to
    // settle in, the theme on marimba, the theme again with sparkle, a bridge that lifts, a breakdown, and round.
    id: 'snack', name: 'Snack Time', scene: 'kitchen', bpm: 108, swing: 0.58,
    chords: [AM, F, C, G],
    bass: GROOVE,
    perc: LIGHT_PERC,
    form: [
      { name: 'groove', bars: 8, stab: { pat: '....x.......x...', v: 0.13 } },
      { name: 'theme', bars: 8, stab: { pat: '....x.......x...', v: 0.12 }, perc: FULL_PERC, melody: { inst: 'mar', v: 0.4, bars: THEME } },
      {
        name: 'theme again', bars: 8, perc: FULL_PERC,
        arp: { pat: '0.1.2.1.0.1.2.1.', v: 0.08 },
        melody: { inst: 'mar', v: 0.4, bars: THEME },
        sparkle: { inst: 'glock', v: 0.12, bars: [[[0, 100]], [], [[8, 103]], [], [[0, 100]], [], [[4, 108], [8, 103]], [[12, 107]]] },
      },
      {
        name: 'bridge', bars: 8, chords: [F, G, EM, AM, DM, G, C, E], bass: 'R...R.5.R...O.5.', perc: FULL_PERC,
        stab: { pat: 'x.......x.......', v: 0.11 },
        melody: { inst: 'glock', v: 0.2, bars: [
          [[0, 81], [4, 84], [8, 81], [12, 77]],
          [[0, 79], [4, 83], [8, 86], [12, 83]],
          [[0, 79], [4, 76], [8, 71], [12, 76]],
          [[0, 81], [6, 79], [8, 76], [12, 72]],
          [[0, 77], [4, 81], [8, 86], [12, 84]],
          [[0, 83], [4, 79], [8, 74], [12, 79]],
          [[0, 84], [4, 88], [8, 91], [12, 88]],
          [[0, 92], [4, 88], [8, 83], [12, 80]],
        ] },
      },
      {
        name: 'breakdown', bars: 8, chords: [DM, G, C, AM], bass: 'R.......R...5...', perc: LIGHT_PERC,
        arp: { pat: '0.2.1.2.0.2.1.2.', v: 0.09 },
        sparkle: { inst: 'glock', v: 0.12, bars: [[[0, 98]], [], [[8, 100]], [], [[0, 98]], [], [[8, 103]], [[4, 100], [12, 96]]] },
      },
    ],
  },
  {
    id: 'boss', name: 'Boss Plate', scene: 'battle', bpm: 146, swing: 0.5,
    chords: [
      { name: 'Am', root: 45, notes: [69, 72, 76] },
      { name: 'F', root: 41, notes: [65, 69, 72] },
      { name: 'Dm', root: 38, notes: [62, 65, 69] },
      { name: 'E', root: 40, notes: [64, 68, 71] },
    ],
    bass: 'R.R.R.RRR.R.R.OR',
    arp: { pat: '0120012001200120', v: 0.11 },
    melody: { inst: 'mar', v: 0.42, bars: [
      [[0, 81], [3, 80], [6, 81], [8, 84], [12, 83]],
      [[0, 81], [4, 77], [8, 81], [12, 84]],
      [[0, 86], [3, 84], [6, 81], [8, 77], [12, 74]],
      [[0, 76], [4, 80], [8, 83], [12, 86], [14, 88]],
    ] },
    perc: [
      { s: 'bongoL', pat: 'x..x..x.x..x..x.', v: 0.32 },
      { s: 'bongoH', pat: '....x.......x.o.', v: 0.24 },
      { s: 'clap', pat: '....x.......x...', v: 0.18 },
      { s: 'shake', pat: 'oooooooooooooooo', v: 0.07 },
    ],
  },
];


/** How far ahead notes are scheduled, and how often the scheduler looks. */
const LOOKAHEAD = 0.15;
const TICK_MS = 25;

let scene: Scene | null = null;
let playing: { track: Track; bus: GainNode; step: number; next: number; timer: number } | null = null;

const stepLen = (t: Track) => 60 / t.bpm / 4;

/** The part playing at this bar, and the bar within it. */
function partAt(t: Track, bar: number): [Part, number] {
  if (!t.form) return [t, bar];
  const total = t.form.reduce((n, p) => n + p.bars, 0);
  let b = bar % total;
  for (const p of t.form) {
    // Each part takes the track's settings for whatever it doesn't set itself (and no melody unless it has one).
    if (b < p.bars) return [{ chords: p.chords ?? t.chords, bass: p.bass ?? t.bass, stab: p.stab, arp: p.arp, melody: p.melody, sparkle: p.sparkle, perc: p.perc ?? t.perc }, b];
    b -= p.bars;
  }
  return [t, bar];
}

function playStep(track: Track, step: number, at: number, bus: GainNode) {
  const voice = musicVoice();
  if (!voice) return;
  const [t, bar] = partAt(track, Math.floor(step / 16));
  const s = step % 16;
  const chord = t.chords[bar % t.chords.length];
  const b = t.bass[s];
  if (b !== '.') voice.bass(chord.root + (b === '5' ? 7 : b === 'O' ? 12 : 0), at, 0.32, stepLen(track) * 3.2, bus);
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
    ? (TRACKS.find((t) => t.scene === scene) ?? null)
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
