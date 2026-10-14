// FUTASAKU real-time RECONNECT rules — the grace ladder and the both-offline hold, on a fake clock.
//
// Owner's ruling (2026-10-14): a real-time timeout loses the match, so a brief connectivity blip
// must not be instantly fatal. The ladder (per seat, per absence):
//   stage 0 → +10 s grace (the turn clock is EXTENDED, not burned)   "Opponent reconnecting"
//   stage 1 → that ONE turn is auto-played by the existing autoplayer; the match continues
//   stage 2 → +5 s grace
//   stage 3 → the disconnected player LOSES, reason `timeout`
// A successful reconnect resets the ladder (per absence, never cumulative).
import { describe, expect, it } from 'vitest';
import { scores } from '../../src/engine/index.js';
import type { PlayerRecord } from '../src/storage/types.js';
import { BOTH_WINDOW, DAY, GRACE, GRACE_SHORT, HOLD, STALE, makeLiveHarness } from './live-harness.js';
import type { LiveHarness } from './live-harness.js';

const match = async (h: LiveHarness, id: string) => (await h.memory.matchById(id))!;

const seatOf = async (h: LiveHarness, matchId: string, p: PlayerRecord) => (await h.memory.participantOf(matchId, p.id))!.seat;

/**
 * Bring the clock to just past the turn deadline while keeping `keep` heartbeating. `gone` simply
 * stops heartbeating: after `presenceStaleMs` it counts as dropped, exactly as the server decides it.
 */
const runToDeadline = async (h: LiveHarness, matchId: string, keep: readonly PlayerRecord[]): Promise<number> => {
  const deadline = (await match(h, matchId)).turnDeadlineAt!;
  h.advance(STALE + 1);
  for (const p of keep) await h.presence(p, 'in_live');
  if (h.now() <= deadline) h.advance(deadline - h.now() + 1);
  return deadline;
};

describe('the real-time reconnect ladder (one player drops)', () => {
  it('stage 0: the first drop EXTENDS the turn clock by 10 s, tells the opponent, and changes nothing else', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const actor = await h.actorOf(matchId, a, b);
    const other = actor.id === a.id ? b : a;
    const seat = await seatOf(h, matchId, actor);
    const before = await match(h, matchId);
    await runToDeadline(h, matchId, [other]);

    h.broadcaster.published.length = 0;
    const s = await h.live.status(other, matchId);
    const after = await match(h, matchId);
    // The grace is ADDED to the turn clock — it does not burn the player's turn.
    expect(after.turnDeadlineAt).toBe(h.now() + GRACE);
    expect(after.status).toBe('active');
    expect(after.result).toBeNull();
    expect(after.state).toEqual(before.state); // nothing was played
    expect(after.revision).toBe(before.revision);
    // The OPPONENT is told, so the strip can say "Opponent reconnecting".
    expect(s.opponent.reconnecting).toBe(true);
    // Nobody is auto-played yet, and nothing is FINISHED: only the moved clock is announced.
    expect(h.broadcaster.published.some((p) => p.ping.status === 'finished')).toBe(false);
    expect(h.broadcaster.published.every((p) => p.matchId === matchId && p.ping.status === 'active')).toBe(true);
    const live = await h.liveStore.liveOf(matchId);
    expect(live.reconnectStage[seat]).toBe(1);
  });

  it('stage 1: still gone after the grace, exactly ONE turn is auto-played and the match continues', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const actor = await h.actorOf(matchId, a, b);
    const other = actor.id === a.id ? b : a;
    const seat = await seatOf(h, matchId, actor);
    const movesBefore = (await h.memory.movesOf(matchId, 0)).length;
    await runToDeadline(h, matchId, [other]);
    await h.live.status(other, matchId); // stage 0 → +10 s
    await h.live.status(other, matchId); // (idempotent: nothing new is due)

    h.advance(GRACE + 1);
    await h.presence(other, 'in_live'); // the opponent is still here
    await h.live.status(other, matchId); // stage 1 → auto-play that ONE turn
    const after = await match(h, matchId);
    expect(after.status).toBe('active'); // the match CONTINUES
    expect(after.result).toBeNull();
    // The existing autoplayer ran: exactly ONE auto-played turn (one committed batch), drawn from
    // the deck, never a Grow. A turn is a batch of actions (Draw, EndAct, Discard), not one move.
    const moves = await h.memory.movesOf(matchId, 0);
    const batches = new Set(moves.slice(movesBefore).map((m) => m.requestId.replace(/#\d+$/, '')));
    expect([...batches]).toHaveLength(1);
    expect([...batches][0]).toMatch(/^live-auto-\d+$/);
    expect(moves.every((m) => m.seat === seat)).toBe(true);
    expect(moves.flatMap((m) => m.events).some((e) => e.t === 'Draw')).toBe(true);
    expect(moves.flatMap((m) => m.events).some((e) => e.t === 'Bloom' || e.t === 'Sprout')).toBe(false);
    // The turn passed to the opponent, on a normal live clock measured from the missed deadline.
    expect(after.state.actor).not.toBe(seat);
    const live = await h.liveStore.liveOf(matchId);
    expect(live.reconnectStage[seat]).toBe(2);
    expect(live.autoplayRev).toBeNull();
  });

  it('stages 2 and 3: the next turn gets only 5 s, and then the disconnected player LOSES (`timeout`)', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const actor = await h.actorOf(matchId, a, b);
    const other = actor.id === a.id ? b : a;
    const seat = await seatOf(h, matchId, actor);
    await runToDeadline(h, matchId, [other]);
    await h.live.status(other, matchId); // +10 s
    h.advance(GRACE + 1);
    await h.presence(other, 'in_live');
    await h.live.status(other, matchId); // auto-play (stage 2)
    // The opponent plays its own live turn; then it is the absent player's turn again.
    await h.playTurn(other, matchId);

    await runToDeadline(h, matchId, [other]);
    const stateBefore = await match(h, matchId);
    h.broadcaster.published.length = 0;
    await h.live.status(other, matchId); // stage 2 → +5 s
    const staged = await match(h, matchId);
    expect(staged.turnDeadlineAt).toBe(h.now() + GRACE_SHORT);
    expect(staged.status).toBe('active');

    const deadline = staged.turnDeadlineAt!;
    h.advance(deadline - h.now() + 1);
    await h.presence(other, 'in_live');
    const s = await h.live.status(other, matchId); // stage 3 → LOSE
    const after = await match(h, matchId);
    expect(after.status).toBe('finished');
    expect(after.result).toEqual({ winner: seat === 0 ? 1 : 0, reason: 'timeout', scores: scores(stateBefore.state) });
    expect(s.status).toBe('finished');
    expect(s.endedReason).toBe('finished');
    // The winner is told at once, by the same terminal-status ping every other ending publishes.
    const finished = h.broadcaster.published.filter((p) => p.ping.status === 'finished');
    expect(finished).toEqual([{ matchId, ping: { revision: after.turnStartRevision, status: 'finished' } }]);
    expect(h.broadcaster.published.at(-1)).toEqual(finished[0]);
    expect((await h.liveStore.player(a.id)).liveMatchId).toBeNull();
    expect((await h.liveStore.player(b.id)).liveMatchId).toBeNull();
    // Never a hand-back to the forgiving 24-hour clock.
    expect(after.turnTimeoutMs).not.toBe(DAY);
  });

  it('a reconnect INSIDE the grace resumes with no auto-play and no penalty, and the ladder resets', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const actor = await h.actorOf(matchId, a, b);
    const other = actor.id === a.id ? b : a;
    const seat = await seatOf(h, matchId, actor);
    const movesBefore = (await h.memory.movesOf(matchId, 0)).length;
    await runToDeadline(h, matchId, [other]);
    await h.live.status(other, matchId); // stage 0 → +10 s
    expect((await h.liveStore.liveOf(matchId)).reconnectStage[seat]).toBe(1);

    // The player comes back inside the grace and plays its turn.
    h.advance(3_000);
    await h.presence(actor, 'in_live');
    const resuming = await h.live.status(other, matchId);
    expect(resuming.opponent.reconnecting).toBe(false);
    expect((await match(h, matchId)).status).toBe('active');
    expect((await h.memory.movesOf(matchId, 0)).length).toBe(movesBefore); // nothing was auto-played

    // A LATER fresh drop starts from the forgiving 10 s again (per absence, never cumulative).
    // Get back to the dropped player's own turn first: both play a turn each.
    await h.playTurn(actor, matchId);
    await h.playTurn(other, matchId);
    expect((await match(h, matchId)).state.actor).toBe(seat);
    await runToDeadline(h, matchId, [other]);
    await h.live.status(other, matchId);
    const again = (await match(h, matchId)).turnDeadlineAt!;
    expect(again).toBe(h.now() + GRACE);
    const live = await h.liveStore.liveOf(matchId);
    expect(live.reconnectStage[seat]).toBe(1);
    expect(live.reconnectSince[seat]).toBe((await h.liveStore.player(actor.id)).presenceAt);
  });

  it('a CONNECTED player who simply lets the clock run out still loses outright (the strict rule stands)', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const actor = await h.actorOf(matchId, a, b);
    const other = actor.id === a.id ? b : a;
    const seat = await seatOf(h, matchId, actor);
    const stateBefore = await match(h, matchId);
    const deadline = stateBefore.turnDeadlineAt!;
    // Both keep heartbeating: nobody dropped, so the ladder never applies.
    h.advance(deadline - h.now() + 1);
    await h.presence(actor, 'in_live');
    await h.presence(other, 'in_live');
    const s = await h.live.status(other, matchId);
    const after = await match(h, matchId);
    expect(after.status).toBe('finished');
    expect(after.result).toEqual({ winner: seat === 0 ? 1 : 0, reason: 'timeout', scores: scores(stateBefore.state) });
    expect(s.opponent.reconnecting).toBe(false);
    // Never a grace for someone who is present.
    expect(await h.memory.movesOf(matchId, 0)).toHaveLength(0);
  });
});

describe('both players drop at once (the hold)', () => {
  const bothDrop = async (h: LiveHarness, matchId: string, a: PlayerRecord, b: PlayerRecord): Promise<void> => {
    // Both heartbeat together (a shared blip), then neither does again.
    await h.presence(a, 'in_live');
    await h.presence(b, 'in_live');
    const deadline = (await match(h, matchId)).turnDeadlineAt!;
    h.advance(STALE + 1);
    if (h.now() <= deadline) h.advance(deadline - h.now() + 1);
  };

  it('holds the match instead of starting a ladder, and one returning gives the other the normal 10 s', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const seat = (await match(h, matchId)).state.actor;
    const other = seat === 0 ? b : a;
    await bothDrop(h, matchId, a, b);

    // Only ~15 s since they both went quiet (and about a minute of headroom): HOLD, no ladder.
    const held = await match(h, matchId);
    await h.live.status(a, matchId);
    const afterHold = await match(h, matchId);
    expect(afterHold.status).toBe('active');
    expect(afterHold.result).toBeNull();
    expect(afterHold.turnDeadlineAt!).toBeGreaterThan(held.turnDeadlineAt! - 1); // pushed forward
    expect((await h.liveStore.liveOf(matchId)).reconnectStage).toEqual([0, 0]); // no ladder started
    // Deterministic: the hold bound is a pure function of the two presence stamps.
    const detectedAt = Math.max(...(await Promise.all([a, b].map(async (p) => (await h.liveStore.player(p.id)).presenceAt!))));
    expect(detectedAt).toBeGreaterThan(0);

    // ONE player returns: the other now gets the ordinary single-player ladder (+10 s).
    h.advance(HOLD - 20_000);
    await h.presence(other, 'in_live');
    await h.live.status(other, matchId);
    const ladder = await match(h, matchId);
    expect(ladder.status).toBe('active');
    expect(ladder.turnDeadlineAt).toBe(h.now() + GRACE);
    expect((await h.liveStore.liveOf(matchId)).reconnectStage[seat]).toBe(1);
    expect((await h.liveStore.liveOf(matchId)).reconnectStage[seat === 0 ? 1 : 0]).toBe(0);
  });

  it('if NEITHER returns, the normal dropout outcome applies: the seat on the clock times out and loses', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const before = await match(h, matchId);
    const seat = before.state.actor;
    await bothDrop(h, matchId, a, b);
    h.broadcaster.published.length = 0;

    // Walk past the hold (each tick re-arms it in short steps), then past its end.
    h.advance(STALE + HOLD + 1_000);
    const s = await h.live.status(a, matchId);
    const after = await match(h, matchId);
    expect(after.status).toBe('finished');
    expect(after.result).toEqual({ winner: seat === 0 ? 1 : 0, reason: 'timeout', scores: scores(before.state) });
    expect(s.endedReason).toBe('finished');
    expect(h.broadcaster.published.at(-1)).toEqual({ matchId, ping: { revision: after.turnStartRevision, status: 'finished' } });
  });

  it('is a HOLD, not a ladder: the owner\'s window and sizes are pinned', () => {
    // The window/size are the owner's numbers, pinned so a future change cannot silently widen them.
    expect(BOTH_WINDOW).toBe(3_000);
    expect(HOLD).toBe(60_000);
    expect(GRACE).toBe(10_000);
    expect(GRACE_SHORT).toBe(5_000);
  });
});
