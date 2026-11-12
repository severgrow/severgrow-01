// Matchmaking hardening — reliability edges beyond the parked-offer waiting screen.
//
// These pins cover tiny-population gaps that left a search stuck or ambiguous:
//   * Stop searching must still work after the join budget was spent on Find resumes;
//   * cancel → find → cancel never leaves two live open-queue rows for one player;
//   * a paired result is always two distinct human seats (never a computer stand-in);
//   * an expired parked search is never claimed into.
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
    actionsPerPlayerPerMinute: 1000,
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
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

type Harness = ReturnType<typeof harness>;

const guest = async (h: Harness, name = 'Player') => {
  const created = await h.service.createGuest(name);
  return { token: created.token, player: await h.service.authenticate(created.token) };
};

const expectCode = async (promise: Promise<unknown>, code: string): Promise<void> => {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected ${code}`).toBeInstanceOf(ApiError);
  expect((caught as ApiError).code).toBe(code);
};

const liveOpenQueueCount = async (h: Harness, playerId: string): Promise<number> => {
  const matches = await h.storage.matchesOfPlayer(playerId);
  return matches.filter((m) => m.status === 'waiting' && m.openQueue).length;
};

describe('cancel stays reliable after Find resumes spend the join budget', () => {
  it('still retires the parked search when further finds are RATE_LIMITED', async () => {
    const h = harness(
      testConfig({
        rateLimits: {
          ...testConfig().rateLimits,
          joinPerPlayerPerHour: 3,
          joinPerIpPerHour: 1000,
          // A repeat Find while searching is the heartbeat (tiers, 2026-11-12), on its own budget.
          searchHeartbeatPerPlayerPerHour: 2,
        },
      }),
    );
    const a = await guest(h, 'A');
    const parked = await h.service.findOpponent(a.player);
    expect(parked.paired).toBe(false);
    // Two resumes burn the rest of the join budget (park + 2 = 3).
    await h.service.findOpponent(a.player);
    await h.service.findOpponent(a.player);
    await expectCode(h.service.findOpponent(a.player), 'RATE_LIMITED');

    // Stop searching must not share that exhausted join bucket — otherwise the player is stuck
    // in the queue until the waiting window (48h in production) finally expires.
    const cancelled = await h.service.cancelSearch(a.player);
    expect(cancelled.cancelled).toBe(true);
    expect(await h.storage.matchById(parked.match.matchId)).toBeNull();
    expect(await liveOpenQueueCount(h, a.player.id)).toBe(0);

    // A calm second stop is still a no-op, and still must not be join-rate-limited.
    expect((await h.service.cancelSearch(a.player)).cancelled).toBe(false);
  });
});

describe('cancel → find → cancel never doubles the queue', () => {
  it('leaves at most one live open-queue row for the player at every step', async () => {
    const h = harness();
    const a = await guest(h, 'A');

    const first = await h.service.findOpponent(a.player);
    expect(await liveOpenQueueCount(h, a.player.id)).toBe(1);

    expect((await h.service.cancelSearch(a.player)).cancelled).toBe(true);
    expect(await liveOpenQueueCount(h, a.player.id)).toBe(0);

    const second = await h.service.findOpponent(a.player);
    expect(second.match.matchId).not.toBe(first.match.matchId);
    expect(await liveOpenQueueCount(h, a.player.id)).toBe(1);

    // Resume (second find while still parked) must keep the same single row.
    const resumed = await h.service.findOpponent(a.player);
    expect(resumed.match.matchId).toBe(second.match.matchId);
    expect(await liveOpenQueueCount(h, a.player.id)).toBe(1);

    expect((await h.service.cancelSearch(a.player)).cancelled).toBe(true);
    expect(await liveOpenQueueCount(h, a.player.id)).toBe(0);
  });
});

describe('a human pair is never a computer stand-in', () => {
  it('paired find returns two distinct real player seats, no synthetic opponent', async () => {
    const h = harness();
    const a = await guest(h, 'HumanA');
    const b = await guest(h, 'HumanB');
    const parked = await h.service.findOpponent(a.player);
    const matched = await h.service.findOpponent(b.player);

    expect(matched.paired).toBe(true);
    expect(matched.match.matchId).toBe(parked.match.matchId);
    expect(matched.match.status).toBe('active');

    const seats = matched.match.seats;
    expect(seats).toHaveLength(2);
    const ids = seats.map((s) => s.playerId).sort();
    expect(new Set(ids).size).toBe(2);
    expect(ids).toEqual([a.player.id, b.player.id].sort());

    // The data the client already reads never invents a computer / bot seat.
    for (const seat of seats) {
      expect(seat.playerId.length).toBeGreaterThan(0);
      expect(seat.displayName?.toLowerCase() ?? '').not.toContain('computer');
      expect(seat.displayName?.toLowerCase() ?? '').not.toContain('bot');
      const record = await h.storage.playerById(seat.playerId);
      expect(record).not.toBeNull();
      expect(record!.kind === 'guest' || record!.kind === 'account').toBe(true);
    }
  });
});

describe('expired searches stay unclaimable', () => {
  it('never pairs a joiner into a parked search past its waiting window', async () => {
    const h = harness(testConfig({ waitingExpireMs: 60_000 }));
    const a = await guest(h, 'A');
    const parked = await h.service.findOpponent(a.player);
    h.advance(60_001);

    const b = await guest(h, 'B');
    const fresh = await h.service.findOpponent(b.player);
    expect(fresh.paired).toBe(false);
    expect(fresh.match.matchId).not.toBe(parked.match.matchId);
    expect((await h.storage.matchById(parked.match.matchId))?.status).toBe('finished');
  });
});

describe('Stop searching has a budget of its own (review, 0.84)', () => {
  it('a cancel storm is limited, on a bucket that never takes from Find', async () => {
    const h = harness(testConfig({ rateLimits: { ...testConfig().rateLimits, joinPerPlayerPerHour: 1000 } }));
    const a = await guest(h, 'Storm');
    let refused = 0;
    for (let i = 0; i < 400; i += 1) {
      try {
        await h.service.cancelSearch(a.player);
      } catch (error) {
        expect((error as ApiError).code).toBe('RATE_LIMITED');
        refused += 1;
      }
    }
    expect(refused).toBeGreaterThan(0);
    // Find still has its whole budget: the cancels were counted elsewhere.
    await h.service.findOpponent(a.player);
  });
});
