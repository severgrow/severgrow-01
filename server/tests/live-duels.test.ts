// FUTASAKU live duels — every server rule, on a fake clock (memory adapter).
import { describe, expect, it } from 'vitest';
import { scores } from '../../src/engine/index.js';
import type { PlayerRecord } from '../src/storage/types.js';
import { isLiveError } from '../src/live/errors.js';
import { DAY, ENTRY, GRACE, LIMIT, REPLAY, makeLiveHarness } from './live-harness.js';
import type { LiveHarness } from './live-harness.js';

const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return String((e as { code?: unknown }).code ?? e);
  }
};

const match = async (h: LiveHarness, id: string) => (await h.memory.matchById(id))!;

/**
 * Reach the turn deadline while EVERY listed player keeps heartbeating: a player who is PRESENT when
 * the clock runs out loses outright (`timeout`). A player who has dropped gets the reconnect ladder
 * instead, which `live-reconnect.test.ts` covers.
 */
const runToDeadlineConnected = async (h: LiveHarness, matchId: string, players: readonly PlayerRecord[]): Promise<void> => {
  const deadline = (await match(h, matchId)).turnDeadlineAt!;
  while (h.now() <= deadline) {
    h.advance(Math.min(20_000, deadline + 1 - h.now()));
    for (const p of players) await h.presence(p, 'in_live');
  }
};

describe('go live', () => {
  it('challenge + accept switches the SAME match to the live clock with the entry allowance', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    const before = await match(h, matchId);
    await h.online(a, b);
    const c = await h.live.challenge(a, matchId, 'live');
    expect(c.challenge.status).toBe('pending');
    expect(c.challenge.expiresAt).toBe(h.now() + 45_000);
    h.advance(3_000);
    const acc = await h.live.accept(b, c.challenge.id);
    expect(acc.liveMatchId).toBe(matchId);
    const after = await match(h, matchId);
    expect(after.turnDeadlineAt).toBe(h.now() + LIMIT + ENTRY);
    expect(after.turnTimeoutMs).toBe(LIMIT + REPLAY);
    // Switching modes changes nothing about the board, the scores or the result.
    expect(after.state).toEqual(before.state);
    expect(after.revision).toBe(before.revision);
    expect(after.result).toEqual(before.result);
    const s = await h.live.status(a, matchId);
    expect(s.live).toBe(true);
    expect(s.limitMs).toBe(LIMIT);
    expect((await h.liveStore.player(a.id)).liveMatchId).toBe(matchId);
    expect((await h.liveStore.player(b.id)).liveMatchId).toBe(matchId);
  });

  it('draw/grow/throw inside a turn never reset the clock; the next turn gets limit + replay allowance', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const actor = await h.actorOf(matchId, a, b);
    const d0 = (await match(h, matchId)).turnDeadlineAt;
    h.advance(5_000);
    await h.draw(actor, matchId);
    expect((await match(h, matchId)).turnDeadlineAt).toBe(d0);
    h.advance(5_000);
    await h.playTurn(actor, matchId);
    expect((await match(h, matchId)).turnDeadlineAt).toBe(h.now() + LIMIT + REPLAY);
  });

  it('the hidden-information audit: challenge payloads and pings carry only names and ids', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.online(a, b);
    const c = await h.live.challenge(a, matchId, 'live');
    const mine = await h.live.myChallenges(b);
    const text = JSON.stringify([c, mine]);
    for (const banned of ['seed', 'deck', 'hand', 'state', 'token', 'fruitKnown', 'history', 'inviteCode']) {
      expect(text.includes(`"${banned}`)).toBe(false);
    }
    expect(Object.keys(mine.incoming[0]!).sort()).toEqual(
      ['createdAt', 'expiresAt', 'fromMe', 'fromName', 'id', 'kind', 'limitMs', 'matchId', 'newMatchId', 'status', 'toName'].sort(),
    );
    expect(h.notifier.published).toHaveLength(1);
    expect(h.notifier.published[0]!.topic).toBe(`player:${b.id}`);
    expect(Object.keys(h.notifier.published[0]!.payload).sort()).toEqual(['challengeId', 'fromName', 'kind']);
  });

  it('a failing ping never fails the request', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.online(a, b);
    h.notifier.failNext = true;
    expect(await code(h.live.challenge(a, matchId, 'live'))).toBe('OK');
  });
});

describe('real-time timeouts LOSE the match (no strikes, no escape back to 24-hour play)', () => {
  it('finishes the match: the seat that ran out loses, reason timeout, and the winner is pinged at once', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const before = await match(h, matchId);
    const seat = before.state.actor;
    await runToDeadlineConnected(h, matchId, [a, b]);
    h.broadcaster.published.length = 0;
    const s = await h.live.status(a, matchId); // a poll is the lazy decision point
    const after = await match(h, matchId);
    expect(after.status).toBe('finished');
    expect(after.result).toEqual({ winner: seat === 0 ? 1 : 0, reason: 'timeout', scores: scores(before.state) });
    // The board and the revision are untouched: a timeout is a clock decision, not a move.
    expect(after.state).toEqual(before.state);
    expect(after.revision).toBe(before.revision);
    // The winner's client is woken by the SAME status-change ping every other ending publishes.
    expect(h.broadcaster.published).toHaveLength(1);
    expect(h.broadcaster.published[0]).toEqual({ matchId, ping: { revision: after.turnStartRevision, status: 'finished' } });
    // Live is over, both players are free, and the wire says the match is over (not "back to 24 h").
    expect(s.live).toBe(false);
    expect(s.status).toBe('finished');
    expect(s.endedReason).toBe('finished');
    expect(s.turnDeadlineAt).toBeNull();
    expect((await h.liveStore.player(a.id)).liveMatchId).toBeNull();
    expect((await h.liveStore.player(b.id)).liveMatchId).toBeNull();
  });

  it('never auto-plays the turn and never hands the match back to the 24-hour clock', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const movesBefore = await h.memory.movesOf(matchId, 0);
    await runToDeadlineConnected(h, matchId, [a, b]);
    const s = await h.live.status(a, matchId);
    const after = await match(h, matchId);
    expect(after.status).toBe('finished'); // NOT 'active'
    expect(after.liveManaged).toBe(false);
    expect(s.endedReason).not.toBe('strikes');
    expect(after.turnTimeoutMs).not.toBe(DAY); // the live clock is never swapped for the 24-hour one
    // Nothing was played on the runner-out's behalf.
    expect(await h.memory.movesOf(matchId, 0)).toHaveLength(movesBefore.length);
    void b;
  });

  it('a player who goes quiet is not forfeited instantly: the reconnect ladder gives them grace', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const actor = await h.actorOf(matchId, a, b);
    const other = actor.id === a.id ? b : a;
    // The tab is closed / the app is backgrounded: presence goes stale well before the turn clock.
    h.advance(46_001);
    await h.presence(other, 'in_live'); // the OPPONENT is still here
    const s = await h.live.status(other, matchId);
    expect(s.opponent.presence).toBe('offline');
    // The strip says so as soon as they are genuinely gone — before their clock even expires.
    expect(s.opponent.reconnecting).toBe(true);
    expect((await match(h, matchId)).status).toBe('active'); // going quiet is NOT a forfeit event
    // ...and when their clock DOES run out, the ladder (not an instant loss) applies.
    const deadline = (await match(h, matchId)).turnDeadlineAt!;
    h.advance(deadline - h.now() + 1);
    await h.presence(other, 'in_live');
    const ended = await h.live.status(other, matchId);
    expect(ended.status).toBe('active');
    expect(ended.opponent.reconnecting).toBe(true);
    expect((await match(h, matchId)).turnDeadlineAt).toBe(h.now() + GRACE);
  });

  it('a real-time timeout and an explicit leave racing produce exactly ONE finish', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const before = await match(h, matchId);
    const leaver = await h.actorOf(matchId, a, b); // the actor will time out; it also presses Leave
    const other = leaver.id === a.id ? b : a;
    await runToDeadlineConnected(h, matchId, [a, b]);
    const results = await Promise.allSettled([h.live.leave(leaver, matchId), h.live.status(other, matchId)]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const after = await match(h, matchId);
    expect(after.status).toBe('finished');
    expect(after.result).not.toBeNull();
    // Whichever of the two won the row lock, the leaver is the loser either way.
    expect(['timeout', 'resigned']).toContain(after.result!.reason);
    expect(after.result!.winner).toBe(before.state.actor === 0 ? 1 : 0);
    // A repeated leave (a retry / a second tap) can never finish it a second time.
    await h.live.leave(leaver, matchId);
    const again = await match(h, matchId);
    expect(again.result).toEqual(after.result);
    expect(again.revision).toBe(after.revision);
  });

  it('a late move after the deadline is refused (the timeout already finished the match)', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const actor = await h.actorOf(matchId, a, b);
    const v = await h.service.viewPayload(actor, matchId);
    await runToDeadlineConnected(h, matchId, [a, b]);
    const res = await code(
      h.service.submitAction(actor, matchId, { expectedRevision: v.revision, requestId: 'late-1', action: v.legalActions[0]! }),
    );
    expect(res).toBe('TIMED_OUT');
    const m = await match(h, matchId);
    expect(m.status).toBe('finished');
    expect(m.result?.reason).toBe('timeout');
    void b;
  });

  it('the sweeper also runs due real-time decisions and finishes the match', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const before = await match(h, matchId);
    await runToDeadlineConnected(h, matchId, [a, b]);
    await h.service.sweep('127.0.0.1');
    const after = await match(h, matchId);
    expect(after.status).toBe('finished');
    expect(after.result).toEqual({ winner: before.state.actor === 0 ? 1 : 0, reason: 'timeout', scores: scores(before.state) });
    void a;
    void b;
  });

  it('a long absence of both players ends as a real-time LOSS, never a quiet return to 24-hour play', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    h.advance(10 * 60_000);
    const s = await h.live.status(a, matchId);
    expect(s.live).toBe(false);
    expect(s.endedReason).toBe('finished');
    const m = await match(h, matchId);
    expect(m.status).toBe('finished');
    expect(m.result?.reason).toBe('timeout');
    void b;
  });
});

describe('leaving real-time forfeits', () => {
  it('finishes the match with the LEAVER as the loser (reason resigned) and pings the winner at once', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const leaver = await h.actorOf(matchId, a, b);
    const other = leaver.id === a.id ? b : a;
    const seat = (await h.memory.participantOf(matchId, leaver.id))!.seat;
    const before = await match(h, matchId);
    h.broadcaster.published.length = 0;
    const s = await h.live.leave(leaver, matchId);
    const m = await match(h, matchId);
    expect(m.status).toBe('finished');
    expect(m.result).toEqual({ winner: seat === 0 ? 1 : 0, reason: 'resigned', scores: scores(before.state) });
    // The board is untouched and the revision did not move: a forfeit is not a move.
    expect(m.state).toEqual(before.state);
    expect(m.revision).toBe(before.revision);
    expect(s.live).toBe(false);
    expect(s.status).toBe('finished');
    expect(s.leftBy).toBe(seat);
    expect(s.endedReason).toBe('finished');
    // The winner is told immediately, by the same terminal-status ping every other ending publishes.
    expect(h.broadcaster.published.at(-1)).toEqual({ matchId, ping: { revision: m.turnStartRevision, status: 'finished' } });
    expect((await h.liveStore.player(a.id)).liveMatchId).toBeNull();
    expect((await h.liveStore.player(b.id)).liveMatchId).toBeNull();
    void other;
  });

  it('a double leave finishes once and changes nothing the second time', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const leaver = await h.actorOf(matchId, a, b);
    await h.live.leave(leaver, matchId);
    const first = await match(h, matchId);
    await h.live.leave(leaver, matchId); // a retry / second tap
    const second = await match(h, matchId);
    expect(second.result).toEqual(first.result);
    expect(second.revision).toBe(first.revision);
    expect(second.status).toBe('finished');
    void b;
  });

  it('leaving a match that is not live is refused and the ASYNC match is left untouched (leaving async is free)', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    const before = await match(h, matchId);
    expect(await code(h.live.leave(a, matchId))).toBe('NOT_LIVE');
    const after = await match(h, matchId);
    // The scope boundary, pinned: a normal 24-hour duel is NOT finished by "leaving" it. Leaving
    // async play is a pure client action (there is no endpoint for it), so nothing here may end the
    // match. A future change must not widen the forfeit to async duels.
    expect(after).toEqual(before);
    expect(after.status).toBe('active');
    expect(after.result).toBeNull();
    void b;
  });
});

describe('the ASYNC 24-hour clock stays forgiving (real time is the strict one)', () => {
  it('a first miss warns and extends; a second miss by the same seat loses — unchanged by the real-time rule', async () => {
    const h = makeLiveHarness();
    const { a, matchId } = await h.pair();
    const before = await match(h, matchId);
    const seat = before.state.actor;
    h.advance(DAY + 1);
    await h.service.sweep('127.0.0.1');
    const first = await match(h, matchId);
    expect(first.status).toBe('active'); // the async clock is forgiving: one grace
    expect(first.graceUsed[seat]).toBe(1);
    expect(first.turnDeadlineAt).toBe(before.turnDeadlineAt! + DAY);
    h.advance(DAY + 1);
    await h.service.sweep('127.0.0.1');
    const second = await match(h, matchId);
    expect(second.status).toBe('finished');
    expect(second.result?.reason).toBe('timeout');
    void a;
  });
});

describe('who may challenge', () => {
  it('BUSY_LIVE: a player already in a live game cannot be challenged elsewhere (and cannot challenge)', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const c = await h.guest();
    const m2 = await h.service.createMatch(c.player);
    await h.service.joinMatch(b, m2.match.inviteCode);
    await h.online(b, c.player);
    expect(await code(h.live.challenge(c.player, m2.match.matchId, 'live'))).toBe('BUSY_LIVE');
    expect(await code(h.live.challenge(b, m2.match.matchId, 'live'))).toBe('BUSY_LIVE');
    expect((await h.live.status(c.player, m2.match.matchId)).opponent.inLive).toBe(true);
  });

  it('Do not disturb: challenges switched off → NOT_AVAILABLE', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.online(a, b);
    await h.live.setChallengesEnabled(b, false);
    expect(await code(h.live.challenge(a, matchId, 'live'))).toBe('NOT_AVAILABLE');
    expect((await h.live.status(a, matchId)).block).toBe('NOT_AVAILABLE');
    await h.live.setChallengesEnabled(b, true);
    expect(await code(h.live.challenge(a, matchId, 'live'))).toBe('OK');
  });

  it('stale presence (older than 45 s, or never) → OFFLINE', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.online(a);
    expect(await code(h.live.challenge(a, matchId, 'live'))).toBe('OFFLINE');
    await h.online(b);
    h.advance(45_001);
    expect(await code(h.live.challenge(a, matchId, 'live'))).toBe('OFFLINE');
    expect((await h.live.status(a, matchId)).opponent.presence).toBe('offline');
    await h.online(b);
    expect((await h.live.status(a, matchId)).opponent.presence).toBe('online');
  });

  it('a player in the tutorial is busy', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.online(a);
    await h.presence(b, 'tutorial');
    expect(await code(h.live.challenge(a, matchId, 'live'))).toBe('BUSY');
    expect((await h.live.status(a, matchId)).opponent.presence).toBe('busy');
  });

  it('one pending challenge per match', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.online(a, b);
    await h.live.challenge(a, matchId, 'live');
    expect(await code(h.live.challenge(a, matchId, 'live'))).toBe('TOO_MANY_PENDING');
  });

  it('after a Not now the same sender waits 2 minutes; after 3 declines, 30 minutes', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    for (let i = 0; i < 3; i++) {
      await h.online(a, b);
      const c = await h.live.challenge(a, matchId, 'live');
      await h.live.decline(b, c.challenge.id);
      await h.online(a, b);
      expect(await code(h.live.challenge(a, matchId, 'live'))).toBe('RATE_LIMITED');
      h.advance(120_001);
    }
    await h.online(a, b);
    expect(await code(h.live.challenge(a, matchId, 'live'))).toBe('RATE_LIMITED');
    h.advance(30 * 60_000);
    await h.online(a, b);
    expect(await code(h.live.challenge(a, matchId, 'live'))).toBe('OK');
  });

  it('the per-player hourly cap answers RATE_LIMITED', async () => {
    const h = makeLiveHarness({ live: { challengesPerPlayerPerHour: 2 } });
    const { a, b, matchId } = await h.pair();
    await h.online(a, b);
    const c1 = await h.live.challenge(a, matchId, 'live');
    await h.live.cancel(a, c1.challenge.id);
    const c2 = await h.live.challenge(a, matchId, 'live');
    await h.live.cancel(a, c2.challenge.id);
    expect(await code(h.live.challenge(a, matchId, 'live'))).toBe('RATE_LIMITED');
  });
});

describe('races and expiry', () => {
  it('simultaneous mutual challenges resolve to ONE live session', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.online(a, b);
    const results = await Promise.allSettled([h.live.challenge(a, matchId, 'live'), h.live.challenge(b, matchId, 'live')]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const ok = results.map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof h.live.challenge>>>).value);
    expect(ok.filter((r) => r.liveMatchId === matchId)).toHaveLength(1);
    expect((await h.live.status(a, matchId)).live).toBe(true);
    expect((await h.liveStore.player(a.id)).liveMatchId).toBe(matchId);
  });

  it('accept race: a double-tap accepts once', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.online(a, b);
    const c = await h.live.challenge(a, matchId, 'live');
    const out = await Promise.all([code(h.live.accept(b, c.challenge.id)), code(h.live.accept(b, c.challenge.id))]);
    expect(out.sort()).toEqual(['CHALLENGE_CLOSED', 'OK']);
  });

  it('accept vs cancel race: exactly one wins', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.online(a, b);
    const c = await h.live.challenge(a, matchId, 'live');
    const out = await Promise.all([code(h.live.accept(b, c.challenge.id)), code(h.live.cancel(a, c.challenge.id))]);
    expect(out.filter((x) => x === 'OK')).toHaveLength(1);
  });

  it('two different challengers accepted at once: the target ends in ONE live match', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    const c = await h.guest();
    const m2 = await h.service.createMatch(c.player);
    await h.service.joinMatch(b, m2.match.inviteCode);
    await h.online(a, b, c.player);
    const ch1 = await h.live.challenge(a, matchId, 'live');
    const ch2 = await h.live.challenge(c.player, m2.match.matchId, 'live');
    const out = await Promise.all([code(h.live.accept(b, ch1.challenge.id)), code(h.live.accept(b, ch2.challenge.id))]);
    expect(out.filter((x) => x === 'OK')).toHaveLength(1);
    expect(out).toContain('BUSY_LIVE');
  });

  it('a challenge expires after 45 s', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.online(a, b);
    const c = await h.live.challenge(a, matchId, 'live');
    h.advance(45_001);
    expect(await code(h.live.accept(b, c.challenge.id))).toBe('CHALLENGE_CLOSED');
    expect((await h.live.myChallenges(b)).incoming).toHaveLength(0);
    expect((await h.live.myChallenges(a)).outgoing[0]!.status).toBe('expired');
    await h.online(a, b);
    expect(await code(h.live.challenge(a, matchId, 'live'))).toBe('OK');
  });

  it('only the target can accept or decline; only the sender can cancel', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.online(a, b);
    const c = await h.live.challenge(a, matchId, 'live');
    expect(await code(h.live.accept(a, c.challenge.id))).toBe('CHALLENGE_NOT_FOUND');
    expect(await code(h.live.decline(a, c.challenge.id))).toBe('CHALLENGE_NOT_FOUND');
    expect(await code(h.live.cancel(b, c.challenge.id))).toBe('CHALLENGE_NOT_FOUND');
    const stranger = await h.guest();
    expect(await code(h.live.accept(stranger.player, c.challenge.id))).toBe('CHALLENGE_NOT_FOUND');
    expect(await code(h.live.status(stranger.player, matchId))).toBe('CHALLENGE_NOT_FOUND');
  });
});

describe('other matches and the end of live', () => {
  it('a challenge that targets a player mid-turn in ANOTHER match never touches that match', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    const c = await h.guest();
    const m2 = await h.service.createMatch(b);
    await h.service.joinMatch(c.player, m2.match.inviteCode);
    const bInM2 = await h.actorOf(m2.match.matchId, b, c.player);
    if (bInM2.id === b.id) await h.draw(b, m2.match.matchId); // b has a committed Draw (the draft lives on the device)
    const before = await match(h, m2.match.matchId);
    await h.goLive(a, b, matchId);
    const after = await match(h, m2.match.matchId);
    expect(after).toEqual(before);
  });

  it('finishing the match ends live mode and frees both players', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    await h.service.resign(a, matchId);
    const s = await h.live.status(b, matchId);
    expect(s.live).toBe(false);
    expect(s.endedReason).toBe('finished');
    expect((await h.liveStore.player(a.id)).liveMatchId).toBeNull();
    expect((await match(h, matchId)).result?.reason).toBe('resigned');
  });

  it('Rematch: both press it → a NEW match, already live, both free of the old one', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    await h.service.resign(a, matchId);
    await h.online(a, b);
    const old = await match(h, matchId);
    const r1 = await h.live.challenge(a, matchId, 'rematch');
    expect(r1.challenge.kind).toBe('rematch');
    const r2 = await h.live.challenge(b, matchId, 'rematch');
    expect(r2.liveMatchId).toBeTruthy();
    const fresh = r2.liveMatchId!;
    expect(fresh).not.toBe(matchId);
    const s = await h.live.status(a, fresh);
    expect(s.live).toBe(true);
    expect((await match(h, fresh)).status).toBe('active');
    expect((await match(h, matchId))).toEqual(old);
    const out = await h.live.myChallenges(a);
    expect(out.outgoing.find((c) => c.id === r1.challenge.id)?.newMatchId).toBe(fresh);
  });

  it('a rematch is only for a finished live match', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.online(a, b);
    expect(await code(h.live.challenge(a, matchId, 'rematch'))).toBe('MATCH_NOT_ACTIVE');
  });

  it('going live and leaving never touch the board; leaving only settles the RESULT (it forfeits)', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    const actor = await h.actorOf(matchId, a, b);
    await h.playTurn(actor, matchId);
    const before = await match(h, matchId);
    await h.goLive(a, b, matchId);
    expect((await match(h, matchId)).state).toEqual(before.state);
    const leaver = await h.actorOf(matchId, a, b);
    const leaverSeat = (await h.memory.participantOf(matchId, leaver.id))!.seat;
    await h.live.leave(leaver, matchId);
    const after = await match(h, matchId);
    expect(after.state).toEqual(before.state); // the board never moves
    expect(after.revision).toBe(before.revision); // and no move was invented
    expect(after.status).toBe('finished');
    expect(after.result).toEqual({ winner: leaverSeat === 0 ? 1 : 0, reason: 'resigned', scores: scores(before.state) });
    void b;
  });
});

describe('HTTP routes', () => {
  const call = async (h: LiveHarness, method: string, path: string, token: string | null, body?: unknown) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const req = new Request(`http://x${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const out = await h.router(req, path);
    return out;
  };

  it('owns only its paths; needs a token; PATCH only claims the live switch', async () => {
    const h = makeLiveHarness();
    const { matchId, ta } = await h.pair();
    expect(await call(h, 'GET', '/v1/matches/abc/view', ta)).toBeNull();
    await expect(call(h, 'GET', '/v1/players/me/challenges', null)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(await call(h, 'PATCH', '/v1/players/me', ta, { displayName: 'x' })).toBeNull();
    const sw = await call(h, 'PATCH', '/v1/players/me', ta, { liveChallengesEnabled: false });
    expect(sw?.body).toMatchObject({ ok: true, liveChallengesEnabled: false });
    const pres = await call(h, 'POST', '/v1/players/me/presence', ta, { status: 'in_match', matchId });
    expect(pres?.status).toBe(200);
    await expect(call(h, 'POST', '/v1/players/me/presence', ta, { status: 'dancing' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    const st = await call(h, 'GET', `/v1/matches/${matchId}/live`, ta);
    expect(st?.body).toMatchObject({ ok: true, live: { matchId, live: false } });
  });

  it('full flow over the router: challenge, poll, accept, leave (which forfeits)', async () => {
    const h = makeLiveHarness();
    const { matchId, ta, tb } = await h.pair();
    await call(h, 'POST', '/v1/players/me/presence', ta, { status: 'idle' });
    await call(h, 'POST', '/v1/players/me/presence', tb, { status: 'offline_game' });
    const ch = (await call(h, 'POST', `/v1/matches/${matchId}/live/challenge`, ta, {}))!.body as { challenge: { id: string } };
    const inbox = (await call(h, 'GET', '/v1/players/me/challenges', tb))!.body as { incoming: { id: string }[] };
    expect(inbox.incoming.map((c) => c.id)).toEqual([ch.challenge.id]);
    const acc = (await call(h, 'POST', `/v1/challenges/${ch.challenge.id}/accept`, tb, {}))!.body as { liveMatchId: string };
    expect(acc.liveMatchId).toBe(matchId);
    const out = (await call(h, 'POST', `/v1/matches/${matchId}/live/leave`, ta, {}))!.body as { live: { live: boolean; status: string } };
    expect(out.live.live).toBe(false);
    expect(out.live.status).toBe('finished');
  });

  it('errors are stable codes', async () => {
    const h = makeLiveHarness();
    const { a, matchId } = await h.pair();
    await h.online(a);
    try {
      await h.live.challenge(a, matchId, 'live');
      expect.unreachable();
    } catch (e) {
      expect(isLiveError(e, 'OFFLINE')).toBe(true);
      expect((e as { status: number }).status).toBe(409);
    }
  });
});
