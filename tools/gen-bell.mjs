// Synthesizes the service bell's "ding" (src/ui/sfx/bell.wav): a struck metal dome, made of a handful of
// inharmonic partials that ring out at their own rates over a short bright strike, damped quickly so it is a short,
// sweet ding rather than a long ring. Tuned to G6, in the key of the game's marimba and glockenspiel. Our own work, CC0.
// Usage: node tools/gen-bell.mjs
import { writeFileSync } from 'node:fs';

const RATE = 44100;
const SECONDS = 0.6;
const F0 = 1567.98; // G6

// [frequency ratio, amplitude, decay time constant in seconds]. A desk bell's dome rings at roughly these ratios;
// the higher a partial, the quieter and the sooner it dies, which leaves the clean "ding" ringing.
const PARTIALS = [
  [1, 1, 0.2],
  [2.74, 0.36, 0.09],
  [5.08, 0.16, 0.045],
  [8.18, 0.07, 0.025],
];

const n = Math.round(RATE * SECONDS);
const out = new Float32Array(n);
for (let i = 0; i < n; i++) {
  const t = i / RATE;
  let v = 0;
  for (const [ratio, amp, tau] of PARTIALS) v += amp * Math.exp(-t / tau) * Math.sin(2 * Math.PI * F0 * ratio * t + ratio);
  out[i] = v;
}

// The strike: a few milliseconds of bright noise (a deterministic generator, so the file is the same every run).
let seed = 12345;
const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
let prev = 0;
for (let i = 0; i < RATE * 0.02; i++) {
  const x = noise();
  const bright = x - prev; // differencing keeps the highs: a metallic tick, not a thud
  prev = x;
  out[i] += 0.25 * bright * Math.exp(-i / (RATE * 0.004));
}

// A 1.5 ms attack (no click), a quick fade at the end, and a -1 dB peak like every other sound.
for (let i = 0; i < n; i++) {
  const t = i / RATE;
  out[i] *= Math.min(1, t / 0.0015) * Math.min(1, (SECONDS - t) / 0.15);
}
const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const gain = 10 ** (-1 / 20) / peak;

const data = Buffer.alloc(44 + n * 2);
data.write('RIFF', 0);
data.writeUInt32LE(36 + n * 2, 4);
data.write('WAVE', 8);
data.write('fmt ', 12);
data.writeUInt32LE(16, 16);
data.writeUInt16LE(1, 20); // PCM
data.writeUInt16LE(1, 22); // mono
data.writeUInt32LE(RATE, 24);
data.writeUInt32LE(RATE * 2, 28);
data.writeUInt16LE(2, 32);
data.writeUInt16LE(16, 34);
data.write('data', 36);
data.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] * gain)) * 32767), 44 + i * 2);
writeFileSync(new URL('../src/ui/sfx/bell.wav', import.meta.url), data);
console.log(`src/ui/sfx/bell.wav: ${SECONDS}s, ${Math.round(data.length / 1024)} KB`);
