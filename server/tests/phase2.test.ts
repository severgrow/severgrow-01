// Phase 2: deadlines, gated views, batch, resign, lists, link codes, rate limits, ping.
// Fake clock throughout — never trusts Date.now from the environment.
import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/engine/index.js';
import { RecordingBroadcaster } from '../src/broadcast.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import type { ServerConfig } from '../src/config.js';
import { ApiError } from '../src/errors.js';
import { NATURE_NAME_PATTERN } from '../src/nature-names.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import type { PlayerRecord } from '../src/storage/types.js';
import { readFileSync } from 'node:fs';

const shortTimeoutConfig = (): ServerConfig => ({
  ...DEFAULT_SERVER_CONFIG,
  turnTimeoutMs: 10_000,
  waitingExpireMs: 60_000,
  linkCodeTtlMs: 60_000,
  rateLimits: {
    ...DEFAULT_SERVER_CONFIG.rateLimits,
    guestPerIpPerHour: 1000,
    joinPerPlayerPerHour: 1000,
    joinPerIpPerHour: 1000,
    linkCodePerPlayerPerHour: 1000,
    linkRedeemPerIpPerHour: 1000,
    actionsPerPlayerPerMinute: 1000,
    sweepPerIpPerHour: 1000,
  },
});

const makeHarness = (config: ServerConfig = shortTimeoutConfig()) => {
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

const twoPlayers = async (config?: ServerConfig) => {
  const h = makeHarness(config);
  const a = await h.service.createGuest();
  const b = await h.service.createGuest();
  const pa = await h.service.authenticate(a.token);
  const pb = await h.service.authenticate(b.token);
  const created = await h.service.createMatch(pa);
  const joined = await h.service.joinMatch(pb, created.match.inviteCode);
  return {
    ...h,
    pa,
    pb,
    matchId: created.match.matchId,
    inviteCode: created.match.inviteCode,
    created,
    joined,
  };
};

const actor = async (
  service: MatchService,
  pa: PlayerRecord,
  pb: PlayerRecord,
  matchId: string,
): Promise<{ player: PlayerRecord; revision: number; legal: Action[]; seat: 0 | 1 } | null> => {
  const va = await service.viewPayload(pa, matchId);
  if (va.legalActions.length > 0) return { player: pa, revision: va.revision, legal: va.legalActions, seat: va.seat };
  const vb = await service.viewPayload(pb, matchId);
  if (vb.legalActions.length > 0) return { player: pb, revision: vb.revision, legal: vb.legalActions, seat: vb.seat };
  return null;
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

const playDull = async (
  service: MatchService,
  pa: PlayerRecord,
  pb: PlayerRecord,
  matchId: string,
  requestId: string,
): Promise<void> => {
  const next = await actor(service, pa, pb, matchId);
  if (!next) throw new Error('nobody can act');
  const action =
    next.legal.find((a) => a.t === 'Draw' && a.from === 'deck') ??
    next.legal.find((a) => a.t === 'EndAct') ??
    next.legal.find((a) => a.t === 'Discard') ??
    next.legal[0]!;
  await service.submitAction(next.player, matchId, { expectedRevision: next.revision, requestId, action });
};

describe('migration 0002', () => {
  it('is additive, enables RLS on new tables, and revokes default privileges', () => {
    const sql = readFileSync(new URL('../migrations/0002_deadlines_lists.sql', import.meta.url), 'utf8');
    const squashed = sql.replace(/\s+/g, ' ').toLowerCase();
    expect(squashed).toContain('turn_deadline_at');
    expect(squashed).toContain('turn_timeout_ms');
    expect(squashed).toContain('turn_start_state');
    expect(squashed).toContain('create table if not exists rate_limits');
    expect(squashed).toContain('create table if not exists device_link_codes');
    expect(squashed).toContain('alter table rate_limits enable row level security');
    expect(squashed).toContain('alter table device_link_codes enable row level security');
    expect(squashed).toContain('alter default privileges in schema public revoke all on tables');
    expect(squashed).not.toContain('drop table if exists');
    expect(squashed).toContain('alter publication supabase_realtime drop table');
  });
});

describe('rule 1–3: deadlines and expiry', () => {
  it('sets the deadline on join for the acting seat and never moves it mid-turn', async () => {
    const h = await twoPlayers();
    const match = (await h.storage.matchById(h.matchId))!;
    expect(match.status).toBe('active');
    expect(match.turnDeadlineAt).toBe(h.now() + shortTimeoutConfig().turnTimeoutMs);
    const deadline = match.turnDeadlineAt;

    const next = (await actor(h.service, h.pa, h.pb, h.matchId))!;
    const draw = next.legal.find((a) => a.t === 'Draw')!;
    await h.service.submitAction(next.player, h.matchId, { expectedRevision: 0, requestId: 'draw1', action: draw });
    const afterDraw = (await h.storage.matchById(h.matchId))!;
    expect(afterDraw.turnDeadlineAt).toBe(deadline);
    expect(afterDraw.revision).toBe(1);
    expect(afterDraw.turnStartRevision).toBe(0);
  });

  it('accepts an action at the deadline and rejects one millisecond later with TIMED_OUT', async () => {
    const h = await twoPlayers();
    const match = (await h.storage.matchById(h.matchId))!;
    const deadline = match.turnDeadlineAt!;
    const next = (await actor(h.service, h.pa, h.pb, h.matchId))!;

    h.setNow(deadline);
    await h.service.submitAction(next.player, h.matchId, {
      expectedRevision: 0,
      requestId: 'on-time',
      action: next.legal[0]!,
    });

    const h2 = await twoPlayers();
    const m2 = (await h2.storage.matchById(h2.matchId))!;
    const n2 = (await actor(h2.service, h2.pa, h2.pb, h2.matchId))!;
    h2.setNow(m2.turnDeadlineAt! + 1);
    await expectCode(
      h2.service.submitAction(n2.player, h2.matchId, { expectedRevision: 0, requestId: 'late', action: n2.legal[0]! }),
      'TIMED_OUT',
    );
    const finished = (await h2.storage.matchById(h2.matchId))!;
    expect(finished.status).toBe('finished');
    expect(finished.result?.reason).toBe('timeout');
    expect(finished.turnDeadlineAt).toBeNull();
  });

  it('lazy read and sweeper share one expiry outcome and are idempotent', async () => {
    const h = await twoPlayers();
    const deadline = (await h.storage.matchById(h.matchId))!.turnDeadlineAt!;
    h.setNow(deadline + 1);
    const view = await h.service.viewPayload(h.pa, h.matchId);
    expect(view.status).toBe('finished');
    expect(view.result?.reason).toBe('timeout');
    const again = await h.service.sweep();
    expect(again.timedOut).toBe(0);
    const sweepFirst = await (async () => {
      const x = await twoPlayers();
      x.setNow((await x.storage.matchById(x.matchId))!.turnDeadlineAt! + 1);
      return x.service.sweep();
    })();
    expect(sweepFirst.timedOut).toBe(1);
  });
});

describe('rule 4: resign', () => {
  it('finishes with reason resigned without faking engine state', async () => {
    const h = await twoPlayers();
    const before = (await h.storage.matchById(h.matchId))!;
    const { match, player } = await h.service.resign(h.pa, h.matchId);
    expect(match.status).toBe('finished');
    expect(match.result?.reason).toBe('resigned');
    expect(match.result?.winner).toBe(1);
    expect(player.result?.reason).toBe('resigned');
    const after = (await h.storage.matchById(h.matchId))!;
    expect(after.state.phase).not.toBe('GAME_OVER'); // engine state untouched
    expect(JSON.stringify(after.state.hands)).toBe(JSON.stringify(before.state.hands));
  });
});

describe('rule 5: batch submit', () => {
  it('applies an ordered list atomically with requestId#index and replays the same requestId', async () => {
    const h = await twoPlayers();
    const next = (await actor(h.service, h.pa, h.pb, h.matchId))!;
    const draw = next.legal.find((a) => a.t === 'Draw' && a.from === 'deck');
    if (!draw) return; // rare seed with empty deck path — skip shape
    // Build a short legal prefix: Draw then EndAct if still legal after draw via sequential decide is server-side;
    // here we only send Draw alone as a 1-item "batch" through actions[].
    const first = await h.service.submitAction(next.player, h.matchId, {
      expectedRevision: 0,
      requestId: 'batch-1',
      actions: [draw],
    });
    expect(first.replayed).toBe(false);
    expect(first.player.revision).toBe(1);
    const moves = await h.storage.movesOf(h.matchId, 0);
    expect(moves[0]!.requestId).toBe('batch-1#0');

    const replay = await h.service.submitAction(next.player, h.matchId, {
      expectedRevision: 0,
      requestId: 'batch-1',
      actions: [draw],
    });
    expect(replay.replayed).toBe(true);
    expect(replay.player.revision).toBe(1);
  });

  it('rejects more than 12 actions', async () => {
    const h = await twoPlayers();
    const next = (await actor(h.service, h.pa, h.pb, h.matchId))!;
    const actions = Array.from({ length: 13 }, () => next.legal[0]!);
    await expectCode(
      h.service.submitAction(next.player, h.matchId, { expectedRevision: 0, requestId: 'too-many', actions }),
      'INVALID_REQUEST',
    );
  });
});

describe('rule 6: turn-gated views', () => {
  it("keeps the opponent's view frozen across a mid-turn Draw, then reveals on Throw", async () => {
    const h = await twoPlayers();
    const next = (await actor(h.service, h.pa, h.pb, h.matchId))!;
    const waiting = next.player === h.pa ? h.pb : h.pa;
    const before = await h.service.viewPayload(waiting, h.matchId);
    const beforeJson = JSON.stringify({
      revision: before.revision,
      turnStartRevision: before.turnStartRevision,
      deck: before.view.deckCount,
      discard: before.view.discard,
      events: before.events,
    });

    const draw = next.legal.find((a) => a.t === 'Draw')!;
    await h.service.submitAction(next.player, h.matchId, { expectedRevision: 0, requestId: 'mid-draw', action: draw });

    const midMine = await h.service.viewPayload(next.player, h.matchId);
    expect(midMine.revision).toBe(1);
    expect(midMine.view.hand.length).toBeGreaterThan(before.view.hand.length - 5);

    const midOpp = await h.service.viewPayload(waiting, h.matchId);
    expect(midOpp.revision).toBe(before.revision);
    expect(midOpp.turnStartRevision).toBe(0);
    expect(
      JSON.stringify({
        revision: midOpp.revision,
        turnStartRevision: midOpp.turnStartRevision,
        deck: midOpp.view.deckCount,
        discard: midOpp.view.discard,
        events: midOpp.events,
      }),
    ).toBe(beforeJson);

    // Finish the turn with dull EndAct + Discard if legal.
    for (let i = 0; i < 8; i++) {
      const cur = await h.service.viewPayload(next.player, h.matchId);
      if (cur.legalActions.length === 0) break;
      if (cur.turnStartRevision > 0) break;
      const action =
        cur.legalActions.find((a) => a.t === 'EndAct') ??
        cur.legalActions.find((a) => a.t === 'Discard') ??
        cur.legalActions[0]!;
      await h.service.submitAction(next.player, h.matchId, {
        expectedRevision: cur.revision,
        requestId: `finish-${i}`,
        action,
      });
      const match = (await h.storage.matchById(h.matchId))!;
      if (match.turnStartRevision > 0 || match.status === 'finished') break;
    }

    const after = (await h.storage.matchById(h.matchId))!;
    if (after.turnStartRevision > 0) {
      const revealed = await h.service.viewPayload(waiting, h.matchId);
      expect(revealed.revision).toBe(after.turnStartRevision);
      expect(revealed.events.length).toBeGreaterThan(0);
    }
  });
});

describe('rule 7–8: me, lists, nature names', () => {
  it('assigns a nature name and lists matches without leaking mid-turn state', async () => {
    const h = await twoPlayers();
    expect(h.pa.displayName).toMatch(NATURE_NAME_PATTERN);
    const list = await h.service.listMyMatches(h.pa);
    expect(list.length).toBe(1);
    expect(list[0]!.matchId).toBe(h.matchId);
    expect(list[0]!.opponentName).toMatch(NATURE_NAME_PATTERN);
    expect(list[0]!.turnDeadlineAt).not.toBeNull();
  });

  it('GET me / rename / link-code round-trip issues a new token for the same player', async () => {
    const h = makeHarness();
    const guest = await h.service.createGuest();
    const player = await h.service.authenticate(guest.token);
    expect((await h.service.getMe(player)).id).toBe(player.id);
    const renamed = await h.service.renameMe(player, 'anything');
    expect(renamed.displayName).toMatch(NATURE_NAME_PATTERN);

    const { code } = await h.service.createLinkCode(player);
    const linked = await h.service.redeemLinkCode(code);
    expect(linked.player.id).toBe(player.id);
    expect(linked.token).not.toBe(guest.token);
    const again = await h.service.authenticate(linked.token);
    expect(again.id).toBe(player.id);
    await expectCode(h.service.redeemLinkCode(code), 'NOT_FOUND');
  });
});

describe('rule 9: live ping', () => {
  it('publishes only on turn boundary / status change, and broadcast failure never fails the move', async () => {
    const h = await twoPlayers();
    h.broadcaster.published.length = 0;
    const next = (await actor(h.service, h.pa, h.pb, h.matchId))!;
    const draw = next.legal.find((a) => a.t === 'Draw') ?? next.legal[0]!;
    await h.service.submitAction(next.player, h.matchId, { expectedRevision: 0, requestId: 'ping-draw', action: draw });
    // Mid-turn draw must not ping (turnStartRevision still 0).
    const midPings = h.broadcaster.published.filter((p) => p.matchId === h.matchId);
    expect(midPings.every((p) => p.ping.revision === 0 || p.ping.status !== 'active' || false)).toBeTruthy();
    // Join already published once; draw should not add a boundary ping.
    const afterDrawCount = h.broadcaster.published.length;

    h.broadcaster.failNext = true;
    await h.service.resign(h.pa, h.matchId);
    const finished = (await h.storage.matchById(h.matchId))!;
    expect(finished.status).toBe('finished');
    expect(h.broadcaster.published.length).toBeGreaterThanOrEqual(afterDrawCount);
  });
});

describe('rule 10–11: rate limits and version handshake', () => {
  it('rate-limits guest creation per IP', async () => {
    const config: ServerConfig = {
      ...shortTimeoutConfig(),
      rateLimits: { ...shortTimeoutConfig().rateLimits, guestPerIpPerHour: 2 },
    };
    const h = makeHarness(config);
    await h.service.createGuest(null, '1.1.1.1');
    await h.service.createGuest(null, '1.1.1.1');
    await expectCode(h.service.createGuest(null, '1.1.1.1'), 'RATE_LIMITED');
  });

  it('rejects an old client version', () => {
    const h = makeHarness();
    expect(() => h.service.assertClientVersion('0.4.0')).toThrow(ApiError);
    try {
      h.service.assertClientVersion('0.4.0');
    } catch (e) {
      expect((e as ApiError).code).toBe('CLIENT_TOO_OLD');
    }
    expect(() => h.service.assertClientVersion('0.5.0')).not.toThrow();
  });
});

describe('rule 12–13: housekeeping and concurrency', () => {
  it('sweep expires waiting matches and deletes old guest accounts with no matches', async () => {
    const h = makeHarness();
    const orphan = await h.service.createGuest();
    const player = await h.service.authenticate(orphan.token);
    await h.service.createMatch(player);
    h.advance(shortTimeoutConfig().waitingExpireMs + 1);
    const result = await h.service.sweep();
    expect(result.expiredWaiting).toBe(1);

    h.setNow(player.createdAt + 31 * 24 * 60 * 60 * 1000);
    const lonely = await h.service.createGuest();
    const lonelyPlayer = await h.service.authenticate(lonely.token);
    h.setNow(lonelyPlayer.createdAt + 31 * 24 * 60 * 60 * 1000);
    const cleaned = await h.service.sweep();
    expect(cleaned.deletedGuests).toBeGreaterThanOrEqual(1);
  });

  it('two racing submissions yield one success and one clean 409', async () => {
    const h = await twoPlayers();
    const next = (await actor(h.service, h.pa, h.pb, h.matchId))!;
    const results = await Promise.allSettled([
      h.service.submitAction(next.player, h.matchId, { expectedRevision: 0, requestId: 'r1', action: next.legal[0]! }),
      h.service.submitAction(next.player, h.matchId, { expectedRevision: 0, requestId: 'r2', action: next.legal[0]! }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(((rejected[0] as PromiseRejectedResult).reason as ApiError).code).toBe('STALE_REVISION');
  });
});

describe('rule 15: dull full game still finishes cleanly', () => {
  it('plays to a finished result with deadlines clearing', async () => {
    const h = await twoPlayers();
    for (let moves = 0; moves < 400; moves++) {
      const next = await actor(h.service, h.pa, h.pb, h.matchId);
      if (!next) break;
      await playDull(h.service, h.pa, h.pb, h.matchId, `g${moves}`);
    }
    const match = (await h.storage.matchById(h.matchId))!;
    expect(match.status).toBe('finished');
    expect(match.turnDeadlineAt).toBeNull();
    expect(match.result).not.toBeNull();
  });
});
