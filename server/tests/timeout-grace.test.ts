// Timeout grace (owner rule): each player gets ONE grace per match. The first missed deadline
// warns and extends by one full turn window; a later miss from that same player finishes the
// match with reason 'timeout' (unchanged). Grace is per seat, tracked independently.
import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/engine/index.js';
import { RecordingBroadcaster } from '../src/broadcast.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import type { ServerConfig } from '../src/config.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import type { PlayerRecord } from '../src/storage/types.js';

const TIMEOUT = 10_000;
const GRACE = 10_000;

const graceConfig = (overrides: Partial<ServerConfig> = {}): ServerConfig => ({
  ...DEFAULT_SERVER_CONFIG,
  turnTimeoutMs: TIMEOUT,
  gracePeriodsPerPlayer: 1,
  graceExtensionMs: GRACE,
  waitingExpireMs: 60_000,
  rateLimits: {
    ...DEFAULT_SERVER_CONFIG.rateLimits,
    guestPerIpPerHour: 1000,
    joinPerPlayerPerHour: 1000,
    joinPerIpPerHour: 1000,
    actionsPerPlayerPerMinute: 1000,
    sweepPerIpPerHour: 1000,
  },
  ...overrides,
});

const makeHarness = (config = graceConfig()) => {
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
  };
};

type Harness = ReturnType<typeof makeHarness>;

const twoPlayers = async (h: Harness) => {
  const a = await h.service.createGuest('A');
  const b = await h.service.createGuest('B');
  const pa = await h.service.authenticate(a.token);
  const pb = await h.service.authenticate(b.token);
  const created = await h.service.createMatch(pa);
  await h.service.joinMatch(pb, created.match.inviteCode);
  return { pa, pb, matchId: created.match.matchId };
};

type Actor = { player: PlayerRecord; seat: 0 | 1; revision: number; legal: Action[] };

const actorOf = async (h: Harness, pa: PlayerRecord, pb: PlayerRecord, matchId: string): Promise<Actor | null> => {
  const va = await h.service.viewPayload(pa, matchId);
  if (va.legalActions.length > 0) return { player: pa, seat: va.seat, revision: va.revision, legal: va.legalActions };
  const vb = await h.service.viewPayload(pb, matchId);
  if (vb.legalActions.length > 0) return { player: pb, seat: vb.seat, revision: vb.revision, legal: vb.legalActions };
  return null;
};

const dullAction = (legal: readonly Action[]): Action =>
  legal.find((a) => a.t === 'Draw' && (a as { from?: string }).from === 'deck') ??
  legal.find((a) => a.t === 'EndAct') ??
  legal.find((a) => a.t === 'Discard') ??
  legal[0]!;

/** Plays on until `targetSeat` is the actor (or the game ends), returning that actor. */
const playUntilActor = async (h: Harness, pa: PlayerRecord, pb: PlayerRecord, matchId: string, targetSeat: 0 | 1): Promise<Actor | null> => {
  for (let i = 0; i < 60; i++) {
    const next = await actorOf(h, pa, pb, matchId);
    if (!next) return null;
    if (next.seat === targetSeat) return next;
    await h.service.submitAction(next.player, matchId, {
      expectedRevision: next.revision,
      requestId: `handover-${i}`,
      action: dullAction(next.legal),
    });
  }
  return actorOf(h, pa, pb, matchId);
};

describe('timeout grace: first miss warns and extends', () => {
  it('extends the deadline by one turn window, keeps the match active, consumes only that seat and pings', async () => {
    const h = makeHarness();
    const { pa, pb, matchId } = await twoPlayers(h);
    const before = (await h.storage.matchById(matchId))!;
    const deadline = before.turnDeadlineAt!;
    const actor = (await actorOf(h, pa, pb, matchId))!;
    const seat = actor.seat;
    const other = seat === 0 ? 1 : 0;

    h.setNow(deadline + 1);
    await h.service.listMyMatches(pa); // lazy expiry through the single decision point

    const after = (await h.storage.matchById(matchId))!;
    expect(after.status).toBe('active');
    expect(after.finishedAt).toBeNull();
    expect(after.graceUsed[seat]).toBe(1);
    expect(after.graceUsed[other], "the opponent's grace is untouched").toBe(0);
    expect(after.turnDeadlineAt).toBe(deadline + GRACE);

    expect(h.broadcaster.published.some((p) => p.matchId === matchId)).toBe(true);
    // Public state: the opponent can see the grace in the list.
    const row = (await h.service.listMyMatches(pb)).find((e) => e.matchId === matchId)!;
    expect(row.graceUsed[seat]).toBe(1);
    expect(row.gracePeriods).toBe(1);
  });

  it('finishes on the second miss with reason timeout and the correct winner', async () => {
    const h = makeHarness();
    const { pa, pb, matchId } = await twoPlayers(h);
    const deadline = (await h.storage.matchById(matchId))!.turnDeadlineAt!;
    const actor = (await actorOf(h, pa, pb, matchId))!;
    const seat = actor.seat;
    const other = seat === 0 ? 1 : 0;

    h.setNow(deadline + 1);
    await h.service.listMyMatches(pa); // spends the grace

    const extended = (await h.storage.matchById(matchId))!;
    h.setNow(extended.turnDeadlineAt! + 1);
    const view = await h.service.viewPayload(actor.player, matchId);

    expect(view.status).toBe('finished');
    expect(view.result?.reason).toBe('timeout');
    expect(view.result?.winner).toBe(other);
    const finished = (await h.storage.matchById(matchId))!;
    expect(finished.turnDeadlineAt).toBeNull();
  });

  it('a player who never misses then misses twice still gets one extension before losing', async () => {
    const h = makeHarness();
    const { pa, pb, matchId } = await twoPlayers(h);
    const actor = (await actorOf(h, pa, pb, matchId))!;

    const first = (await h.storage.matchById(matchId))!.turnDeadlineAt!;
    h.setNow(first + 1);
    await h.service.listMyMatches(pa);
    const afterFirst = (await h.storage.matchById(matchId))!;
    expect(afterFirst.status).toBe('active');
    expect(afterFirst.graceUsed[actor.seat]).toBe(1);

    h.setNow(afterFirst.turnDeadlineAt! + 1);
    const swept = await h.service.sweep();
    expect(swept.timedOut).toBe(1);
    const done = (await h.storage.matchById(matchId))!;
    expect(done.status).toBe('finished');
    expect(done.result?.reason).toBe('timeout');
  });
});

describe('timeout grace: per-seat independence', () => {
  it('one player using their grace does not consume the other player’s', async () => {
    const h = makeHarness();
    const { pa, pb, matchId } = await twoPlayers(h);
    const first = (await actorOf(h, pa, pb, matchId))!;
    const firstSeat = first.seat;
    const secondSeat = firstSeat === 0 ? 1 : 0;

    // First seat misses once: spends their grace.
    h.setNow((await h.storage.matchById(matchId))!.turnDeadlineAt! + 1);
    await h.service.listMyMatches(pa);

    // Hand the turn to the other seat, then let THEM miss once.
    const second = await playUntilActor(h, pa, pb, matchId, secondSeat);
    expect(second, 'the other seat should be on turn').not.toBeNull();
    const secondDeadline = (await h.storage.matchById(matchId))!.turnDeadlineAt!;
    h.setNow(secondDeadline + 1);
    await h.service.listMyMatches(pb);

    const after = (await h.storage.matchById(matchId))!;
    expect(after.status).toBe('active');
    expect(after.graceUsed[firstSeat]).toBe(1);
    expect(after.graceUsed[secondSeat], 'the second seat now has its own grace').toBe(1);
  });
});

describe('timeout grace: idempotency and clock semantics', () => {
  it('a lazy read racing the sweeper produces exactly one extension, never a spurious finish', async () => {
    const h = makeHarness();
    const { pa, pb, matchId } = await twoPlayers(h);
    const actor = (await actorOf(h, pa, pb, matchId))!;
    h.setNow((await h.storage.matchById(matchId))!.turnDeadlineAt! + 1);

    await Promise.all([h.service.viewPayload(actor.player, matchId), h.service.listMyMatches(pb), h.service.listMyMatches(pa)]);

    const after = (await h.storage.matchById(matchId))!;
    expect(after.status).toBe('active');
    expect(after.graceUsed).toEqual(actor.seat === 0 ? [1, 0] : [0, 1]);

    // The sweeper is idempotent: nothing more to change.
    const sweep = await h.service.sweep();
    expect(sweep.timedOut).toBe(0);
    expect(sweep.graceExtended).toBe(0);
    const again = (await h.storage.matchById(matchId))!;
    expect(again.graceUsed).toEqual(after.graceUsed);
  });

  it('the extension does not change clock semantics: an action inside the turn never moves the deadline', async () => {
    const h = makeHarness();
    const { pa, pb, matchId } = await twoPlayers(h);
    const actor = (await actorOf(h, pa, pb, matchId))!;
    h.setNow((await h.storage.matchById(matchId))!.turnDeadlineAt! + 1);
    await h.service.listMyMatches(pa);

    const extended = (await h.storage.matchById(matchId))!;
    const deadline = extended.turnDeadlineAt!;
    const pingsAfterGrace = h.broadcaster.published.filter((p) => p.matchId === matchId).length;
    expect(pingsAfterGrace).toBeGreaterThan(0); // the extension was announced

    const view = await h.service.viewPayload(actor.player, matchId);
    const draw = view.legalActions.find((a) => a.t === 'Draw' && (a as { from?: string }).from === 'deck');
    expect(draw, 'a Draw should be legal at the start of the turn').toBeTruthy();
    await h.service.submitAction(actor.player, matchId, { expectedRevision: view.revision, requestId: 'inside-grace', action: draw! });

    const after = (await h.storage.matchById(matchId))!;
    expect(after.turnDeadlineAt).toBe(deadline);
    expect(after.graceUsed).toEqual(extended.graceUsed);
    // A mid-turn action never fires the grace ping (it did not touch grace).
    expect(h.broadcaster.published.filter((p) => p.matchId === matchId).length).toBe(pingsAfterGrace);
  });

  it('an action arriving after the extension is accepted normally', async () => {
    const h = makeHarness();
    const { pa, pb, matchId } = await twoPlayers(h);
    const actor = (await actorOf(h, pa, pb, matchId))!;
    h.setNow((await h.storage.matchById(matchId))!.turnDeadlineAt! + 1);
    await h.service.listMyMatches(pa);

    const view = await h.service.viewPayload(actor.player, matchId);
    expect(view.status).toBe('active');
    const ok = await h.service.submitAction(actor.player, matchId, {
      expectedRevision: view.revision,
      requestId: 'after-grace',
      action: view.legalActions[0]!,
    });
    expect(ok.replayed).toBe(false);
  });
});

describe('timeout grace: disabled config', () => {
  it('gracePeriodsPerPlayer = 0 restores the immediate timeout loss', async () => {
    const h = makeHarness(graceConfig({ gracePeriodsPerPlayer: 0 }));
    const { pa, matchId } = await twoPlayers(h);
    h.setNow((await h.storage.matchById(matchId))!.turnDeadlineAt! + 1);
    const view = await h.service.viewPayload(pa, matchId);
    expect(view.status).toBe('finished');
    expect(view.result?.reason).toBe('timeout');
  });
});
