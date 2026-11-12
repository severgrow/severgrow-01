// The Territory map is drawn from the device's memory of the last good map the moment the screen
// opens, then replaced by the server's answer (owner, 2026-10-22: "make sure everything ... is
// visible instantly"). Before this the screen stayed empty until /v1/world answered, which on a
// cold Edge function can take a second or more.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lastWorld, rememberWorld, WORLD_MEMORY_KEY } from '../src/online/world-memory.js';

const store = () => {
  const m = new Map<string, string>();
  return { m, kv: { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) } };
};
const world = {
  version: 2, revision: 12, cost: 100, challengeStake: 50,
  cells: [{ id: '0,0', q: 0, r: 0 }, { id: '1,0', q: 1, r: 0 }],
  claims: [{ cellId: '0,0', ownerId: 'p1', ownerName: 'RYK', ownerLevel: 3, ownerTag: '7QK2', colour: '#aa8844', claimedAt: 1 }],
};

describe('the remembered Territory map', () => {
  it('round-trips the last good map', () => {
    const { kv } = store();
    expect(lastWorld(kv)).toBeNull();
    rememberWorld(kv, world);
    expect(lastWorld(kv)).toEqual(world);
  });

  it('ignores anything malformed rather than drawing a broken map', () => {
    const { m, kv } = store();
    for (const bad of ['{not json', 'null', '{"version":2}', JSON.stringify({ ...world, cells: 'x' }), JSON.stringify({ ...world, cells: [] }), JSON.stringify({ ...world, claims: [{ cellId: 3 }] })]) {
      m.set(WORLD_MEMORY_KEY, bad);
      expect(lastWorld(kv), bad).toBeNull();
    }
    expect(lastWorld(null)).toBeNull();
  });

  it('is drawn on open and always replaced by the first server answer', () => {
    const view = readFileSync(fileURLToPath(new URL('../src/online/world-view.ts', import.meta.url)), 'utf8');
    expect(view).toContain('lastWorld(');
    expect(view).toContain('rememberWorld(');
    // A remembered map may be NEWER-looking than the server (a database reset lowers the revision),
    // so the first fresh answer after drawing from memory is taken whatever its revision.
    expect(view).toMatch(/this\.fromMemory \|\|/);
  });
});
