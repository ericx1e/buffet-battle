// Turns sound effects (.ogg, .wav or .mp3) into the WAVs in src/ui/sfx/: decoded in Chrome, mixed to mono
// 16-bit at the source's own sample rate (full quality), normalized so every sound peaks at the same level, silence
// trimmed, with a short fade at the end. WAV plays everywhere, iPhone included.
// Needs Chrome and playwright-core (npm i --no-save playwright-core). Usage:
//   node tools/import-sfx.mjs <folder of sound files> src/ui/sfx plate_0=impactPlate_light_000.ogg bell=impactBell_heavy_000.ogg ...
// A file can be named by its path inside the folder (cute/pop1.ogg) when two share a name, and given a gain (file:0.8),
// a longest length in seconds (file@0.9: cut there with a fade, for ringing instruments) and a tuning fix in cents
// (file~-16: a note 16 cents sharp is brought back in tune, so instruments agree).
//   node tools/import-sfx.mjs <folder> --info <name=file.ogg ...>   (lengths and peaks only)
// A name ending in _0, _1... is one take of an effect; the game picks a take at random.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const [root, outDir, ...pairs] = process.argv.slice(2);
const all = new Map();
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ogg|wav|mp3)$/i.test(e.name) && all.set(path.relative(root, path.join(d, e.name)).split(path.sep).join('/'), path.join(d, e.name))));
walk(root);
const jobs = pairs.map((p) => {
  const [name, rest] = p.split('=');
  const [, file, gain, max, cents] = rest.match(/^(.*?)(?::([\d.]+))?(?:@([\d.]+))?(?:~(-?[\d.]+))?$/);
  return { name, file, gain: Number(gain ?? 1), max: Number(max ?? 0), cents: Number(cents ?? 0) };
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.setContent('<html></html>');
for (const j of jobs) {
  const src = all.get(j.file) ?? [...all].find(([k]) => k === j.file || k.endsWith('/' + j.file))?.[1];
  if (!src) throw new Error('missing ' + j.file);
  const b64 = fs.readFileSync(src).toString('base64');
  const res = await page.evaluate(async ({ b64, gain, max, cents }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ac = new AudioContext();
    const buf = await ac.decodeAudioData(bytes.buffer);
    const rate = buf.sampleRate; // keep every frequency: resampling down made the sounds dull and distant
    const off = new OfflineAudioContext(1, Math.ceil(buf.duration * rate), rate);
    const s = off.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = 2 ** (cents / 1200);
    const g = off.createGain();
    g.gain.value = gain;
    s.connect(g).connect(off.destination);
    s.start();
    const out = (await off.startRendering()).getChannelData(0);
    // Normalize: every sound peaks at -1 dB, so volumes are set in one place (sound.ts), not by the source files.
    let top = 0;
    for (let i = 0; i < out.length; i++) top = Math.max(top, Math.abs(out[i]));
    if (top > 0) for (let i = 0; i < out.length; i++) out[i] *= 0.89 / top;
    // Trim silence at both ends, with a short fade at the end.
    let a = 0, z = out.length - 1;
    while (a < z && Math.abs(out[a]) < 0.004) a++;
    while (z > a && Math.abs(out[z]) < 0.004) z--;
    let pcm = out.slice(Math.max(0, a - 20), Math.min(out.length, z + 200));
    let fade = Math.min(200, pcm.length);
    if (max && pcm.length > max * rate) {
      pcm = pcm.slice(0, Math.round(max * rate));
      fade = Math.round(Math.min(0.25, max / 3) * rate); // a ringing note dies away instead of stopping
    }
    for (let i = 0; i < fade; i++) pcm[pcm.length - 1 - i] *= (i / fade) ** 2;
    const n = pcm.length, data = new DataView(new ArrayBuffer(44 + n * 2));
    const str = (o, t) => [...t].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); data.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true); data.setUint32(24, rate, true);
    data.setUint32(28, rate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); str(36, 'data'); data.setUint32(40, n * 2, true);
    let peak = 0;
    for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, pcm[i])); peak = Math.max(peak, Math.abs(v)); data.setInt16(44 + i * 2, v * 32767, true); }
    let bin = '';
    const u8 = new Uint8Array(data.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return { wav: btoa(bin), dur: n / rate, peak };
  }, { b64, gain: j.gain, max: j.max, cents: j.cents });
  if (outDir !== '--info') fs.writeFileSync(path.join(outDir, j.name + '.wav'), Buffer.from(res.wav, 'base64'));
  console.log(`${j.name.padEnd(14)} ${j.file.padEnd(26)} ${res.dur.toFixed(2)}s peak ${res.peak.toFixed(2)}${outDir !== '--info' ? ` ${Math.round(res.wav.length * 0.75 / 1024)}KB` : ''}`);
}
await browser.close();
