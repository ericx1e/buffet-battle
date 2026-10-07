// Seeded PRNG (mulberry32). The whole sim draws randomness from here so that
// (plates, seed) always reproduces the same battle.
export class Rng {
  constructor(private state: number) {
    this.state = state >>> 0;
  }

  get seed(): number {
    return this.state;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  /** Picks up to `count` distinct items. */
  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const out: T[] = [];
    while (out.length < count && pool.length > 0) {
      out.push(pool.splice(this.int(pool.length), 1)[0]);
    }
    return out;
  }
}
