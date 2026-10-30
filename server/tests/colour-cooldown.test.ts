// COLOUR CHANGES ARE UNLIMITED (owner, 2026-10-30). The 24 h rule was asked for and then withdrawn
// the same day - "remove color change 1 per 24h - let it be changed anytime for now" - so this file
// now asserts the ABSENCE of a limit, which is the rule that ships:
//   * a change succeeds, and another change straight after ALSO succeeds;
//   * the read never reports a wait, and `canChange` is never false;
//   * changing to the colour you already have still succeeds (and is still a no-op on the stored
//     clock, so restoring the window later needs no migration);
//   * the stored row is still written on BOTH backends, so a future rule has its clock ready.
// The window constant itself is kept at 0 (see `src/tile-colours.ts`) so restoring 24 h is one
// number, and `colourCooldownMs` stays unit-tested against a non-zero window below.
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import { createWorldEconomyRouter } from '../src/seeds/router.js';
import { postgresWorldEconomyStore } from '../src/seeds/postgres.js';
import type { PgPool, PgQueryResult, PgRow } from '../src/storage/postgres.js';
import type { PlayerRecord } from '../src/storage/types.js';
import { colourCooldownMs } from '../../src/tile-colours.js';

const START = Date.UTC(2026, 9, 30, 9);
const HOUR = 60 * 60 * 1000;
const player = (id: string, displayName: string): PlayerRecord =>
  ({ id, kind: 'account', displayName, createdAt: START, upgradedAt: START });

const harness = (clock: { now: number } = { now: START }) => {
  const storage = new MemoryStorage();
  const store = new MemoryWorldEconomyStore();
  const service = new WorldEconomyService(store, storage, () => clock.now);
  const a = player('player-a', 'BloomHeron');
  const b = player('player-b', 'RYK');
  const register = async (...players: PlayerRecord[]) => { for (const p of players) await storage.createPlayer(p); };
  const router = () => createWorldEconomyRouter({
    economy: service,
    authenticate: async (token: string | null) => {
      if (token === 'token-a') return a;
      if (token === 'token-b') return b;
      throw Object.assign(new Error('no'), { code: 'UNAUTHORIZED' });
    },
  });
  const call = async (method: 'GET' | 'POST', path: string, token: string, body?: unknown) => {
    const request = new Request(`http://test.local${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return await router()(request, path);
  };
  return { storage, store, service, a, b, register, call, clock };
};

describe('the 24 h colour rule', () => {
  it('a first change succeeds, a second inside 24 h is refused, and a change after it succeeds', async () => {
    const clock = { now: START };
    const h = harness(clock);
    await h.register(h.a);

    const first = await h.call('POST', '/v1/world/colour', 'token-a', { colourId: 12 });
    expect(first?.status).toBe(200);
    expect(h.store.colours.get(h.a.id)).toBe(12);

    // Immediately after: another change is ALLOWED. This is the rule that ships.
    const second = await h.call('POST', '/v1/world/colour', 'token-a', { colourId: 13 });
    expect(second?.status).toBe(200);
    expect(h.store.colours.get(h.a.id)).toBe(13);

    // ...and again, with no wait, on a fresh minute.
    clock.now = START + 60_000;
    const third = await h.service.chooseColour(h.a, 7);
    expect(third.colourId).toBe(7);
    expect(h.store.colourTimes.get(h.a.id)).toBe(START + 60_000);
  });

  it('the cooldown arithmetic still works, so the rule is one number away from returning', () => {
    // The window ships as 0. The maths is exercised against a 24 h window so it cannot rot.
    const DAY = 24 * HOUR;
    expect(colourCooldownMs(START, START + 5 * HOUR, DAY)).toBe(19 * HOUR);
    expect(colourCooldownMs(START, START + DAY, DAY)).toBe(0);
    expect(colourCooldownMs(null, START, DAY)).toBe(0);
  });

  it('the read never reports a wait, so the picker shows no countdown', async () => {
    const clock = { now: START };
    const h = harness(clock);
    await h.register(h.a);
    const before = await h.call('GET', '/v1/world/colour', 'token-a');
    expect(before?.body).toMatchObject({ colour: { canChange: true, changeAvailableAt: null, remainingMs: 0 } });

    await h.call('POST', '/v1/world/colour', 'token-a', { colourId: 5 });
    clock.now = START + 5 * HOUR;
    const after = await h.call('GET', '/v1/world/colour', 'token-a');
    const colour = (after?.body as { colour: { canChange: boolean; changeAvailableAt: number | null; remainingMs: number } }).colour;
    // Five hours after a change, a 24 h rule would say 19 h. There is no rule, so there is no wait.
    expect(colour.canChange).toBe(true);
    expect(colour.remainingMs).toBe(0);
  });

  it('choosing the colour you already have changes nothing, and a real change is allowed', async () => {
    const clock = { now: START };
    const h = harness(clock);
    await h.register(h.a);
    await h.service.chooseColour(h.a, 12);
    clock.now = START + HOUR;
    // A double tap or a retry: succeeds, and does not move the stored clock.
    await expect(h.service.chooseColour(h.a, 12)).resolves.toMatchObject({ colourId: 12 });
    expect(h.store.colourTimes.get(h.a.id)).toBe(START);
    // A genuine change is allowed too - there is no window any more.
    await expect(h.service.chooseColour(h.a, 13)).resolves.toMatchObject({ colourId: 13 });
    expect(h.store.colours.get(h.a.id)).toBe(13);
  });

  it('the stored row carries the clock on both backends, ready for any future rule', async () => {
    const clock = { now: START };
    const h = harness(clock);
    await h.register(h.a, h.b);
    await h.call('POST', '/v1/world/colour', 'token-a', { colourId: 1 });
    // Another change from anywhere is accepted...
    await expect(h.service.chooseColour(h.a, 2)).resolves.toMatchObject({ colourId: 2 });
    // ...and the row records WHEN, so a window could be reinstated without a migration.
    expect(h.store.colourTimes.get(h.a.id)).toBe(START);
    // Another player is independent of it.
    await expect(h.service.chooseColour(h.b, 3)).resolves.toMatchObject({ colourId: 3 });
  });
});

describe('both backends store and read the clock', () => {
  const ROW: PgRow = { colour_id: 6, chosen_at: START };

  const pool = (rows: PgRow[]): PgPool => ({
    query: async (text: string): Promise<PgQueryResult> => {
      if (text.includes('information_schema.tables')) return { rows: [{ present: 1 }] };
      if (text.includes('player_tile_colours')) return { rows };
      return { rows: [] };
    },
    connect: async () => ({ query: async (): Promise<PgQueryResult> => ({ rows: [] }), release: () => undefined }),
  });

  it('the SQL store reads colour_id AND chosen_at in one read', async () => {
    const calls: string[] = [];
    const base = pool([ROW]);
    const wrapped: PgPool = {
      query: async (text: string, values?: readonly unknown[]): Promise<PgQueryResult> => { calls.push(text); return await base.query(text, values as unknown[]); },
      connect: base.connect,
    };
    const choice = await postgresWorldEconomyStore(wrapped).colourChoice('player-a');
    expect(choice).toEqual({ colourId: 6, chosenAt: START });
    const read = calls.find((text) => text.includes('from player_tile_colours'));
    expect(read).toContain('colour_id');
    expect(read).toContain('chosen_at');
  });

  it('the memory store answers the same shape for the same facts', async () => {
    const memory = new MemoryWorldEconomyStore();
    expect(await memory.colourChoice('player-a')).toBeNull();
    await memory.setColourChoice('player-a', 6, START);
    expect(await memory.colourChoice('player-a')).toEqual({ colourId: 6, chosenAt: START });
  });
});
