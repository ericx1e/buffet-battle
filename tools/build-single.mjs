// Builds the whole game into one self-contained page (dist/single/buffet-battle.html): script, styles, art and font
// all inlined, for hosts that serve a single file. Its markup is the body of index.html, without the
// <html>/<head>/<body> wrapper, which the host adds. Run: npm run build:single
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const out = 'dist/single';
fs.rmSync(out, { recursive: true, force: true });
await build({
  logLevel: 'warn',
  base: './',
  build: {
    outDir: out,
    assetsInlineLimit: () => true, // every image and font becomes a data: URI
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { codeSplitting: false } },
  },
});

const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const assets = path.join(out, 'assets');
const files = fs.readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8'));
const css = files.filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(assets, f), 'utf8'));
const left = files.filter((f) => !f.endsWith('.js') && !f.endsWith('.css'));
if (js.length !== 1 || left.length) throw new Error(`expected one script and nothing else, got ${files.join(', ')}`);

const title = html.match(/<title>.*?<\/title>/)[0];
const icon = html.match(/<link rel="icon" href="[^"]*"\s*\/?>/)?.[0] ?? ''; // the href is an SVG full of '>'
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/\s*<script[\s\S]*?<\/script>/g, '').trim();
// "</script" inside the bundle would end the inline script early.
const script = js[0].replace(/<\/script/gi, '<\\/script');
const page = `${title}
${icon}
<style>${css.join('\n')}</style>
${body}
<script type="module">${script}</script>
`;
const file = path.join(out, 'buffet-battle.html');
fs.writeFileSync(file, page);
for (const f of fs.readdirSync(out)) if (f !== 'buffet-battle.html') fs.rmSync(path.join(out, f), { recursive: true });
console.log(`${file}: ${(page.length / 1024).toFixed(0)} KB`);
