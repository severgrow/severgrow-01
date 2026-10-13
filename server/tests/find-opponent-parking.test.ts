// Phase 7.5 — Find opponent must never leave a player stuck.
//
// These tests pin the owner-approved product rules for the open queue:
//   * a parked search is intentional and long-lived (the old "no heartbeat for 20s = ignored"
//     idea is gone; parking expiry is the existing waiting-match window, 48h in production);
//   * the longest-waiting parked player is matched first (FIFO);
//   * a player is never paired with themselves and one search never becomes two matches,
//     including a concurrent double-tap;
//   * a second parked entry is never created while an open one exists;
//   * a player at the per-player cap of unfinished matches is refused with a friendly error;
//   * two simultaneous searchers produce exactly one match — no duplicate, no orphan;
//   * a player matched while away can find out later (list state, unseen flag, deadline, ping);
//   * cancel retires a parked search; the queue calls stay rate limited.
import { describe, expect, it } from 'vitest';
import { RecordingBroadcaster } from '../src/broadcast.js';
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
  const broadcaster = new RecordingBroadcaster();
  const service = new MatchService({ storage, config, now: () => now, broadcaster });
  return {
    storage,
    service,
    broadcaster,
    now: () => now,
    setNow: (t: number) => {
      now = t;
    },
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

describe('parked search persists (gap 1)', () => {
  it('keeps a parked search alive well past 20 seconds', async () => {
    const h = harness();
    const a = await guest(h, 'A');
    const parked = await h.service.findOpponent(a.player);
    expect(parked.paired).toBe(false);
    expect(parked.match.status).toBe('waiting');

    // The old ghost rule would have ignored this after ~20s. Parking is intentional now.
    h.advance(25_000);
    const b = await guest(h, 'B');
    const matched = await h.service.findOpponent(b.player);
    expect(matched.paired).toBe(true);
    expect(matched.match.matchId).toBe(parked.match.matchId);
    expect(matched.match.status).toBe('active');
  });

  it('expires a parked search only after the configured waiting window, not sooner', async () => {
    const h = harness(testConfig({ waitingExpireMs: 60_000 }));
    const a = await guest(h, 'A');
    const parked = await h.service.findOpponent(a.player);
    // The parked expiry is the existing waiting-match window (48h in production).
    expect(parked.match.expiresAt).toBe(h.now() + 60_000);

    h.advance(30_000);
    expect((await h.storage.openQueueMatchOfPlayer(a.player.id))?.id).toBe(parked.match.matchId);

    h.advance(30_001); // now past the parked expiry
    const b = await guest(h, 'B');
    const fresh = await h.service.findOpponent(b.player);
    expect(fresh.paired).toBe(false);
    expect(fresh.match.matchId).not.toBe(parked.match.matchId);

    const list = await h.service.listMyMatches(a.player);
    expect(list.find((e) => e.matchId === parked.match.matchId)?.status).toBe('finished');
  });
});

describe('FIFO fairness (gap 2)', () => {
  it('matches the longest-waiting parked player first, with three parked', async () => {
    const h = harness();
    const parked: string[] = [];
    // Three players park (built directly so all three are waiting at once and FIFO is testable).
    for (let i = 0; i < 3; i++) {
      const p = await guest(h, `P${i}`);
      const created = await h.service.createMatch(p.player, { openQueue: true });
      parked.push(created.match.matchId);
      h.advance(1);
    }
    const d = await guest(h, 'D');
    const first = await h.service.findOpponent(d.player);
    expect(first.paired).toBe(true);
    expect(first.match.matchId).toBe(parked[0]);

    const e = await guest(h, 'E');
    const second = await h.service.findOpponent(e.player);
    expect(second.paired).toBe(true);
    expect(second.match.matchId).toBe(parked[1]);
  });
});

describe('no self-pair, no double (gap 3)', () => {
  it('never pairs a player with themselves; a re-tap returns the same parked search', async () => {
    const h = harness();
    const a = await guest(h, 'A');
    const first = await h.service.findOpponent(a.player);
    const again = await h.service.findOpponent(a.player);
    expect(again.paired).toBe(false);
    expect(again.match.matchId).toBe(first.match.matchId);
    expect(await h.storage.matchesOfPlayer(a.player.id)).toHaveLength(1);
  });

  it('a concurrent double-tap parks exactly one search', async () => {
    const h = harness();
    const a = await guest(h, 'A');
    const [r1, r2] = await Promise.all([h.service.findOpponent(a.player), h.service.findOpponent(a.player)]);
    expect(r1.match.matchId).toBe(r2.match.matchId);
    expect(await h.storage.matchesOfPlayer(a.player.id)).toHaveLength(1);
  });
});

describe('never a second parked entry (gap 4)', () => {
  it('a new searcher joins the open parked search instead of parking beside it', async () => {
    const h = harness();
    const a = await guest(h, 'A');
    const b = await guest(h, 'B');
    const first = await h.service.findOpponent(a.player);
    expect(first.paired).toBe(false);

    const second = await h.service.findOpponent(b.player);
    expect(second.paired).toBe(true);
    expect(second.match.matchId).toBe(first.match.matchId);

    expect(await h.storage.openQueueMatchOfPlayer(a.player.id)).toBeNull();
    expect(await h.storage.matchesOfPlayer(a.player.id)).toHaveLength(1);
    expect(await h.storage.matchesOfPlayer(b.player.id)).toHaveLength(1);
  });
});

describe('per-player cap (gap 5)', () => {
  it('refuses to park or match a capped player with a friendly error, and leaves the queue intact', async () => {
    const h = harness();
    const a = await guest(h, 'Cap');
    for (let i = 0; i < DEFAULT_SERVER_CONFIG.maxOpenMatchesPerPlayer; i++) await h.service.createMatch(a.player);

    await expectCode(h.service.findOpponent(a.player), 'TOO_MANY_MATCHES');

    // Somebody else is parked: the capped player must not be matched into it either.
    const b = await guest(h, 'B');
    const parked = await h.service.findOpponent(b.player);
    expect(parked.paired).toBe(false);
    await expectCode(h.service.findOpponent(a.player), 'TOO_MANY_MATCHES');
    expect((await h.storage.openQueueMatchOfPlayer(b.player.id))?.id).toBe(parked.match.matchId);
  });

  it('a parked player who is already at the cap can still see their own parked search', async () => {
    const h = harness();
    const a = await guest(h, 'Cap');
    const parked = await h.service.findOpponent(a.player);
    // Fill the remaining cap slots without touching the parked search.
    for (let i = 0; i < DEFAULT_SERVER_CONFIG.maxOpenMatchesPerPlayer - 1; i++) await h.service.createMatch(a.player);
    const again = await h.service.findOpponent(a.player);
    expect(again.match.matchId).toBe(parked.match.matchId);
  });
});

describe('atomic pairing (gap 6)', () => {
  it('two simultaneous searchers produce exactly one match, no duplicate and no orphan', async () => {
    const h = harness();
    const b = await guest(h, 'B');
    const c = await guest(h, 'C');
    const [rb, rc] = await Promise.all([h.service.findOpponent(b.player), h.service.findOpponent(c.player)]);

    expect(rb.match.matchId).toBe(rc.match.matchId);
    expect([rb.paired, rc.paired].filter(Boolean)).toHaveLength(1);

    const bMatches = await h.storage.matchesOfPlayer(b.player.id);
    const cMatches = await h.storage.matchesOfPlayer(c.player.id);
    expect(bMatches).toHaveLength(1);
    expect(cMatches).toHaveLength(1);
    expect(bMatches[0]!.id).toBe(cMatches[0]!.id);
    expect(bMatches[0]!.status).toBe('active');
    // No orphan: nothing is left waiting in the pool.
    expect(await h.storage.openQueueMatchOfPlayer(b.player.id)).toBeNull();
    expect(await h.storage.openQueueMatchOfPlayer(c.player.id)).toBeNull();
  });
});

describe('matched while away (gap 7)', () => {
  it('surfaces the match in the away player list with the right turn state, deadline and ping', async () => {
    // 48h parked window so an hour away is still comfortably inside it.
    const h = harness(testConfig({ waitingExpireMs: 48 * 3_600_000 }));
    const a = await guest(h, 'Away');
    const parked = await h.service.findOpponent(a.player);
    const matchId = parked.match.matchId;

    h.advance(3_600_000); // an hour later — the parked player is not on the page
    const b = await guest(h, 'B');
    const matched = await h.service.findOpponent(b.player);
    expect(matched.match.matchId).toBe(matchId);
    expect(matched.match.status).toBe('active');

    const stored = (await h.storage.matchById(matchId))!;
    expect(stored.turnDeadlineAt).toBe(h.now() + testConfig().turnTimeoutMs);

    // The unseen-turn flag and the page-title count both come from this list row.
    const list = await h.service.listMyMatches(a.player);
    const row = list.find((e) => e.matchId === matchId)!;
    expect(row.status).toBe('active');
    expect(row.turnPlayer).not.toBeNull();
    expect(row.turnDeadlineAt).toBe(stored.turnDeadlineAt);
    expect(row.unseenTurn).toBe(row.turnPlayer === row.mySeat);

    // The realtime ping fired on the status change (waiting -> active).
    expect(
      h.broadcaster.published.some((p) => p.matchId === matchId && p.ping.status === 'active'),
    ).toBe(true);

    // Reopening later gives the correct "your turn / waiting" state.
    const view = await h.service.viewPayload(a.player, matchId);
    expect(view.status).toBe('active');
    expect(view.legalActions.length > 0).toBe(view.turnPlayer === view.seat);
  });
});

describe('cancel a parked search', () => {
  it('retires the parked search so no later searcher is matched into it', async () => {
    const h = harness();
    const a = await guest(h, 'A');
    const parked = await h.service.findOpponent(a.player);
    expect((await h.service.cancelSearch(a.player)).cancelled).toBe(true);
    expect(await h.storage.matchById(parked.match.matchId)).toBeNull();

    const b = await guest(h, 'B');
    const fresh = await h.service.findOpponent(b.player);
    expect(fresh.paired).toBe(false);
    expect(fresh.match.matchId).not.toBe(parked.match.matchId);
  });

  it('is a calm no-op with nothing parked and never deletes an active match', async () => {
    const h = harness();
    const a = await guest(h, 'A');
    expect((await h.service.cancelSearch(a.player)).cancelled).toBe(false);

    const parked = await h.service.findOpponent(a.player);
    const b = await guest(h, 'B');
    await h.service.findOpponent(b.player); // b joins a's parked search -> active
    expect((await h.storage.matchById(parked.match.matchId))?.status).toBe('active');
    expect((await h.service.cancelSearch(a.player)).cancelled).toBe(false);
    expect(await h.storage.matchById(parked.match.matchId)).not.toBeNull();
  });
});

describe('rate limits (gap 11)', () => {
  it('rate-limits repeated Find-opponent calls', async () => {
    const h = harness(testConfig({ rateLimits: { ...testConfig().rateLimits, joinPerPlayerPerHour: 3 } }));
    const a = await guest(h, 'A');
    await h.service.findOpponent(a.player);
    await h.service.findOpponent(a.player);
    await h.service.findOpponent(a.player);
    await expectCode(h.service.findOpponent(a.player), 'RATE_LIMITED');
  });
});
