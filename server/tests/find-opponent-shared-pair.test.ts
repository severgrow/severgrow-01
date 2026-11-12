// FIND OPPONENT — the owner's two reports (2026-11-11 / 2026-11-12):
//   * "FIND OPPONENT on two devices doesn't start a game" — two players who already share an open
//     game used to park forever (one game per pair; nobody noticed the other search).
//   * "i tried on a fresh guest acc and my RYK acc and didnt connect" — the FRESH case must pair a
//     stranger even when the other searcher already has an open game against a THIRD party. That
//     would fail if the one-game-per-pair rule had ever been global instead of pair-scoped.
//
// The rule the owner chose (2026-11-11): when two searchers already share an open game, OPEN THAT
// SHARED GAME FOR BOTH immediately instead of parking. Continuing a shared game creates no new
// match, so the per-player open-match cap must never block it — only a fresh join or a park.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import type { ServerConfig } from '../src/config.js';
import { ApiError } from '../src/errors.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';

const testConfig = (overrides: Partial<ServerConfig> = {}): ServerConfig => ({
  ...DEFAULT_SERVER_CONFIG,
  turnTimeoutMs: 10_000,
  waitingExpireMs: 60_000,
  rateLimits: {
    ...DEFAULT_SERVER_CONFIG.rateLimits,
    guestPerIpPerHour: 1000,
    joinPerPlayerPerHour: 1000,
    joinPerIpPerHour: 1000,
    createPerPlayerPerHour: 1000,
    createPerIpPerHour: 1000,
  },
  ...overrides,
});

const harness = (config: ServerConfig = testConfig()) => {
  const storage = new MemoryStorage();
  let now = 1_000_000;
  const service = new MatchService({ storage, config, now: () => now });
  return {
    storage,
    service,
    setNow: (t: number) => { now = t; },
  };
};
type Harness = ReturnType<typeof harness>;

const guest = async (h: Harness, name: string) => {
  const created = await h.service.createGuest(name);
  return { token: created.token, player: await h.service.authenticate(created.token) };
};

/** Two players who already share one open (active) game. */
const sharedPair = async (h: Harness) => {
  const a = await guest(h, 'Alder');
  const b = await guest(h, 'Birch');
  const shared = await h.service.createMatch(a.player);
  await h.service.joinMatch(b.player, shared.match.inviteCode!);
  return { a, b, sharedId: shared.match.matchId };
};

const openIds = async (h: Harness, p: { id: string }) =>
  (await h.storage.matchesOfPlayer(p.id)).filter((m) => m.status !== 'finished').map((m) => m.id);

const expectCode = async (promise: Promise<unknown>, code: string): Promise<void> => {
  let caught: unknown;
  try { await promise; } catch (error) { caught = error; }
  expect(caught, `expected ${code}`).toBeInstanceOf(ApiError);
  expect((caught as ApiError).code).toBe(code);
};

describe('Find Opponent when the two searchers already share an open game', () => {
  it('both taps land both players in the SAME shared game, never a second one', async () => {
    const h = harness();
    const { a, b, sharedId } = await sharedPair(h);

    const aFind = await h.service.findOpponent(a.player);
    expect(aFind.paired).toBe(false); // A waits first

    const bFind = await h.service.findOpponent(b.player);
    expect(bFind.paired).toBe(true);
    expect(bFind.match.matchId).toBe(sharedId); // their one game, not a new one
    expect(bFind.match.status).toBe('active');

    // A's search is retired; A's only open game is the shared one.
    await expect(h.service.getMatch(a.player, aFind.match.matchId)).rejects.toThrow();
    expect(await openIds(h, a.player)).toEqual([sharedId]);
    expect(await openIds(h, b.player)).toEqual([sharedId]);
  });

  it('the cap never blocks continuing a game the searchers already share (it creates nothing)', async () => {
    const h = harness();
    const { a, b, sharedId } = await sharedPair(h);

    // B is at the per-player limit: one shared game + nine other open invites.
    for (let i = 0; i < DEFAULT_SERVER_CONFIG.maxOpenMatchesPerPlayer - 1; i++) await h.service.createMatch(b.player);
    expect(await openIds(h, b.player)).toHaveLength(DEFAULT_SERVER_CONFIG.maxOpenMatchesPerPlayer);

    const aFind = await h.service.findOpponent(a.player);
    expect(aFind.paired).toBe(false);

    // Opening the shared game adds no match, so it is allowed even at the cap.
    const bFind = await h.service.findOpponent(b.player);
    expect(bFind.paired).toBe(true);
    expect(bFind.match.matchId).toBe(sharedId);
  });

  it('the cap still refuses a FRESH pairing (it would create one more open game)', async () => {
    const h = harness();
    const a = await guest(h, 'Alder');
    const capped = await guest(h, 'Capped');
    for (let i = 0; i < DEFAULT_SERVER_CONFIG.maxOpenMatchesPerPlayer; i++) await h.service.createMatch(capped.player);
    const aFind = await h.service.findOpponent(a.player);
    await expectCode(h.service.findOpponent(capped.player), 'TOO_MANY_MATCHES');
    // The waiting search is untouched.
    expect((await h.storage.openQueueMatchOfPlayer(a.player.id))?.id).toBe(aFind.match.matchId);
  });
});

describe('Find Opponent when one searcher already has a game against a THIRD party', () => {
  it('pairs with a fresh stranger when the stranger taps first', async () => {
    const h = harness();
    const a = await guest(h, 'Alder'); // will have an open game against Third
    const third = await guest(h, 'Cedar');
    const other = await h.service.createMatch(a.player);
    await h.service.joinMatch(third.player, other.match.inviteCode!);

    const fresh = await guest(h, 'Birch'); // no games at all
    const freshFind = await h.service.findOpponent(fresh.player);
    expect(freshFind.paired).toBe(false);

    const aFind = await h.service.findOpponent(a.player);
    expect(aFind.paired).toBe(true); // NOT a park: the third-party game must not block
    expect(aFind.match.matchId).toBe(freshFind.match.matchId);
    expect(aFind.match.matchId).not.toBe(other.match.matchId);
    expect(aFind.match.status).toBe('active');

    // Both players are in the NEW game; A's third-party game is untouched.
    expect(await openIds(h, a.player)).toEqual(expect.arrayContaining([other.match.matchId, aFind.match.matchId]));
    expect(await openIds(h, fresh.player)).toEqual([aFind.match.matchId]);
    expect((await h.service.getMatch(a.player, other.match.matchId)).status).toBe('active');
  });

  it('pairs with a fresh stranger when the player with the third-party game taps first', async () => {
    const h = harness();
    const a = await guest(h, 'Alder');
    const third = await guest(h, 'Cedar');
    const other = await h.service.createMatch(a.player);
    await h.service.joinMatch(third.player, other.match.inviteCode!);

    const aFind = await h.service.findOpponent(a.player);
    expect(aFind.paired).toBe(false); // nobody waiting yet: park

    const fresh = await guest(h, 'Birch');
    const freshFind = await h.service.findOpponent(fresh.player);
    expect(freshFind.paired).toBe(true);
    expect(freshFind.match.matchId).toBe(aFind.match.matchId);
    expect(freshFind.match.matchId).not.toBe(other.match.matchId);
  });
});

describe('Find Opponent happy path (no games anywhere)', () => {
  it('two strangers pair into a new active game', async () => {
    const h = harness();
    const a = await guest(h, 'Alder');
    const b = await guest(h, 'Birch');
    const aFind = await h.service.findOpponent(a.player);
    expect(aFind.paired).toBe(false);
    const bFind = await h.service.findOpponent(b.player);
    expect(bFind.paired).toBe(true);
    expect(bFind.match.matchId).toBe(aFind.match.matchId);
    expect(bFind.match.status).toBe('active');
    expect(await openIds(h, a.player)).toEqual([aFind.match.matchId]);
    expect(await openIds(h, b.player)).toEqual([aFind.match.matchId]);
  });
});
