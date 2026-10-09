// Fills a local API (wrangler dev) with bot-played runs through the real endpoints, so the dev site has data to
// show. Usage: npx tsx tools/seed-local.ts [chefs] [api]. Never point it at the live API.
import { type Action, plateHash } from '../src/sim/actions';
import { botPrep } from '../src/sim/bot';
import { type RunState, serve } from '../src/sim/run';
import { GAME_VERSION } from '../src/sim/version';
import { randomName } from '../src/names';

const chefs = Number(process.argv[2] ?? 30);
const API = process.argv[3] ?? 'http://localhost:8787';
if (!/localhost|127\.0\.0\.1/.test(API)) throw new Error('seed-local only fills a local API.');

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

let served = 0;
// Chefs play in rounds, a day at a time each, so later chefs find earlier chefs' plates in the pool.
const players = [];
for (let i = 0; i < chefs; i++) {
  const p = await call('POST', '/players', undefined, { name: randomName() });
  const { run } = await call('POST', '/runs', p.token);
  players.push({ token: p.token, run });
}
for (let round = 0; players.some((p) => p.run.status === 'active'); round++) {
  for (const p of players) {
    if (p.run.status !== 'active') continue;
    const run = structuredClone(p.run.state as RunState);
    const actions: Action[] = [];
    botPrep(run, actions);
    const plate = serve(run);
    const res = await call('POST', `/runs/${p.run.id}/serve`, p.token, { day: p.run.day, version: GAME_VERSION, actions, plateHash: plateHash(plate) });
    p.run = res.run;
    served++;
  }
  console.log(`round ${round + 1}: ${served} days served`);
}
