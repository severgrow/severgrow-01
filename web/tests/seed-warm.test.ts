// The finish card's Seeds land at once (owner, 2026-11-12): near a paying game's end the page wakes the
// server with one cheap read and readies its identity, so the settle that follows the last move hits a
// warm Edge function. Best effort: it never throws, and it is once per game.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { WARM_SEED_SERVER_AT_DECK, warmSeedServer } from '../src/online/seed-settle.js';
import type { SeedConnection } from '../src/online/seed-settle.js';

const conn = (o: { features?: () => Promise<string[]>; peek?: unknown; ensure?: () => Promise<unknown> }) => {
  const serverFeatures = vi.fn(o.features ?? (async () => ['bots-v0.13']));
  const ensure = vi.fn(o.ensure ?? (async () => ({})));
  return { c: { client: { serverFeatures }, identity: { peek: () => o.peek ?? null, ensure } } as unknown as SeedConnection, serverFeatures, ensure };
};

describe('wake the Seeds server before the game ends', () => {
  it('reads the server once and readies a missing identity', async () => {
    const { c, serverFeatures, ensure } = conn({});
    await warmSeedServer(() => c);
    expect(serverFeatures).toHaveBeenCalledTimes(1);
    expect(ensure).toHaveBeenCalledTimes(1);
  });

  it('leaves an identity that is already there alone', async () => {
    const { c, ensure } = conn({ peek: { token: 't' } });
    await warmSeedServer(() => c);
    expect(ensure).not.toHaveBeenCalled();
  });

  it('never throws: an offline server or a failed identity is simply no warm-up', async () => {
    const { c } = conn({ features: async () => { throw new Error('offline'); }, ensure: async () => { throw new Error('nope'); } });
    await expect(warmSeedServer(() => c)).resolves.toBeUndefined();
    await expect(warmSeedServer(() => null)).resolves.toBeUndefined();
  });

  it('fires in the last turns of a game that can pay, once per game', () => {
    expect(WARM_SEED_SERVER_AT_DECK).toBeGreaterThan(0);
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    const play = main.slice(main.indexOf('function afterPlay('), main.indexOf('function afterPlay(') + 4000);
    expect(play).toMatch(/!seedServerWarmed && onlineBuildEnabled\(\)/);
    expect(play).toMatch(/p\.after\.deck\.length <= WARM_SEED_SERVER_AT_DECK/);
    expect(play).toMatch(/void warmSeedServer\(\)/);
    expect(main).toMatch(/let generation = \+\+startGameGeneration;\s*seedServerWarmed = false;/);
  });
});
