// ONE COLOUR CHANGE PER 24 HOURS (owner, 2026-10-30): "make sure players can change the color of
// their tiles - but only once per 24h".
//
// The rule is the SERVER's, and this file is its gate:
//   * a first change succeeds;
//   * a second change inside 24 h is refused with a code the client can render, and nothing moves;
//   * a change after 24 h succeeds;
//   * choosing the colour you already have is not a change (a retry cannot cost the player a day);
//   * the stored row carries the clock (`chosen_at`) on BOTH backends, so the rule cannot be
//     bypassed by asking twice, or by using another device.
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/storage/memory.js';
import { MemoryWorldEconomyStore } from '../src/seeds/memory.js';
import { WorldEconomyService } from '../src/seeds/service.js';
import { createWorldEconomyRouter } from '../src/seeds/router.js';
import { postgresWorldEconomyStore } from '../src/seeds/postgres.js';
import type { PgPool, PgQueryResult, PgRow } from '../src/storage/postgres.js';
import type { PlayerRecord } from '../src/storage/types.js';
import { COLOUR_CHANGE_WINDOW_MS, colourCooldownMs } from '../../src/tile-colours.js';

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
    expect(h.store.colourTimes.get(h.a.id)).toBe(START);

    // Immediately after: refused, with a code the client can render, and nothing moved. (The router
    // throws the ApiError; the fetch app maps it to a 409 with `code: 'COLOUR_COOLDOWN'`.)
    await expect(h.call('POST', '/v1/world/colour', 'token-a', { colourId: 13 }))
      .rejects.toMatchObject({ code: 'COLOUR_COOLDOWN', status: 409 });
    expect(h.store.colours.get(h.a.id)).toBe(12);
    expect(h.store.colourTimes.get(h.a.id)).toBe(START);

    // 23 h later it is still the same day.
    clock.now = START + 23 * HOUR;
    await expect(h.service.chooseColour(h.a, 13)).rejects.toMatchObject({ code: 'COLOUR_COOLDOWN' });
    expect(h.store.colours.get(h.a.id)).toBe(12);

    // Exactly 24 h after the save, a new change is allowed.
    clock.now = START + COLOUR_CHANGE_WINDOW_MS;
    const later = await h.call('POST', '/v1/world/colour', 'token-a', { colourId: 13 });
    expect(later?.status).toBe(200);
    expect(h.store.colours.get(h.a.id)).toBe(13);
    expect(h.store.colourTimes.get(h.a.id)).toBe(START + COLOUR_CHANGE_WINDOW_MS);
  });

  it('the read reports the wait BEFORE a press, so the picker can say how long is left', async () => {
    const clock = { now: START };
    const h = harness(clock);
    await h.register(h.a);
    const before = await h.call('GET', '/v1/world/colour', 'token-a');
    expect(before?.body).toMatchObject({ colour: { canChange: true, changeAvailableAt: null, remainingMs: 0 } });

    await h.call('POST', '/v1/world/colour', 'token-a', { colourId: 5 });
    clock.now = START + 5 * HOUR;
    const after = await h.call('GET', '/v1/world/colour', 'token-a');
    const colour = (after?.body as { colour: { canChange: boolean; changeAvailableAt: number | null; remainingMs: number } }).colour;
    expect(colour.canChange).toBe(false);
    expect(colour.changeAvailableAt).toBe(START + COLOUR_CHANGE_WINDOW_MS);
    expect(colour.remainingMs).toBe(19 * HOUR);
    expect(colourCooldownMs(START, START + 5 * HOUR)).toBe(19 * HOUR);
  });

  it('choosing the colour you already have is NOT a change, and does not move the clock', async () => {
    const clock = { now: START };
    const h = harness(clock);
    await h.register(h.a);
    await h.service.chooseColour(h.a, 12);
    clock.now = START + HOUR;
    // A double tap or a retry: succeeds, but the day is not extended.
    await expect(h.service.chooseColour(h.a, 12)).resolves.toMatchObject({ colourId: 12 });
    expect(h.store.colourTimes.get(h.a.id)).toBe(START);
    // A genuine change is still refused until the window closes.
    await expect(h.service.chooseColour(h.a, 13)).rejects.toMatchObject({ code: 'COLOUR_COOLDOWN' });
  });

  it('cannot be bypassed by another device: the clock is the stored row, not the caller', async () => {
    const clock = { now: START };
    const h = harness(clock);
    await h.register(h.a, h.b);
    await h.call('POST', '/v1/world/colour', 'token-a', { colourId: 1 });
    // Same account, a fresh request from anywhere: still refused.
    await expect(h.service.chooseColour(h.a, 2)).rejects.toMatchObject({ code: 'COLOUR_COOLDOWN' });
    // Another player is unaffected (their own row has no clock yet).
    await expect(h.service.chooseColour(h.b, 3)).resolves.toMatchObject({ colourId: 3 });
    expect(h.store.colours.get(h.a.id)).toBe(1);
    expect(h.store.colours.get(h.b.id)).toBe(3);
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
