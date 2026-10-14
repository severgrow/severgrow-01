// FUTASAKU live duels — every server rule, on a fake clock (memory adapter).
import { describe, expect, it } from 'vitest';
import { isLiveError } from '../src/live/errors.js';
import { DAY, ENTRY, LIMIT, REPLAY, makeLiveHarness } from './live-harness.js';
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

describe('timeouts and strikes', () => {
  it('a timeout auto-plays the turn (engine-legal), hands over, and gives ONE strike; nobody loses', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const actor = await h.actorOf(matchId, a, b);
    const before = await match(h, matchId);
    const deadline = before.turnDeadlineAt!;
    h.advance(LIMIT + ENTRY + 1);
    const s = await h.live.status(a, matchId); // a poll is the lazy decision point
    const after = await match(h, matchId);
    expect(after.status).toBe('active');
    expect(after.state.actor).not.toBe(before.state.actor);
    expect(after.state.turnNumber).toBe(before.state.turnNumber + 1);
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(after.turnDeadlineAt).toBe(deadline + LIMIT + REPLAY);
    const actorSeat = before.state.actor;
    expect(s.strikes[actorSeat]).toBe(1);
    expect(s.live).toBe(true);
    // The opponent's view of the auto-played turn hides the drawn card, as for any turn.
    const other = actor.id === a.id ? b : a;
    const v = await h.service.viewPayload(other, matchId, before.revision);
    const draw = v.events.find((e) => e.t === 'Draw');
    expect(draw).toBeTruthy();
    if (draw && draw.t === 'Draw' && draw.from === 'deck') expect(draw.card).toBeUndefined();
  });

  it('two CONSECUTIVE strikes end live mode: back to 24-hour turns, deadline set normally', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const sleeper = await h.actorOf(matchId, a, b);
    const other = sleeper.id === a.id ? b : a;
    h.advance(LIMIT + ENTRY + 1);
    await h.live.status(a, matchId); // strike 1
    await h.playTurn(other, matchId);
    const d = (await match(h, matchId)).turnDeadlineAt!;
    h.advance(LIMIT + REPLAY + 1);
    const s = await h.live.status(a, matchId); // strike 2 → live ends
    expect(s.live).toBe(false);
    expect(s.endedReason).toBe('strikes');
    const m = await match(h, matchId);
    expect(m.status).toBe('active');
    expect(m.result).toBeNull();
    expect(m.turnTimeoutMs).toBe(DAY);
    expect(m.turnDeadlineAt).toBe(d + DAY);
    expect(m.liveManaged).toBe(false);
    expect((await h.liveStore.player(a.id)).liveMatchId).toBeNull();
    expect((await h.liveStore.player(b.id)).liveMatchId).toBeNull();
    // From now on the normal 24-hour rule owns the match (grace first, never a live loss).
    h.advance(DAY + 1);
    const later = await h.service.viewPayload(a, matchId);
    expect(later.status).toBe('active');
  });

  it('strikes that are not consecutive do not end live mode', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const sleeper = await h.actorOf(matchId, a, b);
    const other = sleeper.id === a.id ? b : a;
    h.advance(LIMIT + ENTRY + 1);
    await h.live.status(a, matchId); // sleeper strike 1
    await h.playTurn(other, matchId);
    await h.playTurn(sleeper, matchId); // sleeper plays a turn: the streak resets
    await h.playTurn(other, matchId);
    h.advance(LIMIT + REPLAY + 1);
    const s = await h.live.status(a, matchId);
    expect(s.live).toBe(true);
    const seat = (await h.memory.participantOf(matchId, sleeper.id))!.seat;
    expect(s.strikes[seat]).toBe(1);
  });

  it('a late move after a live deadline is refused as stale (the auto-play went first)', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const actor = await h.actorOf(matchId, a, b);
    const v = await h.service.viewPayload(actor, matchId);
    h.advance(LIMIT + ENTRY + 1);
    const res = await code(
      h.service.submitAction(actor, matchId, { expectedRevision: v.revision, requestId: 'late-1', action: v.legalActions[0]! }),
    );
    expect(['STALE_REVISION', 'NOT_YOUR_TURN']).toContain(res);
    expect((await match(h, matchId)).state.actor).not.toBe(v.seat);
  });

  it('the sweeper also runs due live decisions', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const before = await match(h, matchId);
    h.advance(LIMIT + ENTRY + 1);
    await h.service.sweep('127.0.0.1');
    const after = await match(h, matchId);
    expect(after.state.actor).not.toBe(before.state.actor);
    expect(after.status).toBe('active');
  });

  it('a long absence of both players resolves to 24-hour play, never a loss', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    h.advance(10 * 60_000);
    const s = await h.live.status(a, matchId);
    expect(s.live).toBe(false);
    expect(s.endedReason).toBe('strikes');
    const m = await match(h, matchId);
    expect(m.status).toBe('active');
    expect(m.turnTimeoutMs).toBe(DAY);
  });
});

describe('leave live', () => {
  it('leaving on my own turn: the live clock continues plus 60 s, then the turn is auto-played; later turns are 24 h', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const leaver = await h.actorOf(matchId, a, b);
    const other = leaver.id === a.id ? b : a;
    const d = (await match(h, matchId)).turnDeadlineAt!;
    h.advance(1_000);
    const s = await h.live.leave(leaver, matchId);
    expect(s.live).toBe(false);
    expect(s.endedReason).toBe('left');
    let m = await match(h, matchId);
    expect(m.turnDeadlineAt).toBe(d + 60_000);
    expect(m.turnTimeoutMs).toBe(DAY);
    const before = m.state;
    h.advance(d + 60_000 - h.now() + 1);
    await h.service.viewPayload(other, matchId);
    m = await match(h, matchId);
    expect(m.state.actor).not.toBe(before.actor);
    expect(m.turnDeadlineAt).toBe(d + 60_000 + DAY);
    expect(m.liveManaged).toBe(false);
    const seat = (await h.memory.participantOf(matchId, leaver.id))!.seat;
    expect((await h.live.status(leaver, matchId)).strikes[seat]).toBe(0);
  });

  it('leaving on the opponent turn turns their turn into a normal 24-hour turn', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const actor = await h.actorOf(matchId, a, b);
    const leaver = actor.id === a.id ? b : a;
    await h.live.leave(leaver, matchId);
    expect((await match(h, matchId)).turnDeadlineAt).toBe(h.now() + DAY);
  });

  it('the leaver cannot challenge again for 10 minutes or 3 of their turns, whichever comes first', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const leaver = await h.actorOf(matchId, a, b);
    const other = leaver.id === a.id ? b : a;
    await h.live.leave(other, matchId);
    await h.online(a, b);
    expect(await code(h.live.challenge(other, matchId, 'live'))).toBe('COOLDOWN');
    // The OTHER player is not in cooldown.
    const c = await h.live.challenge(leaver, matchId, 'live');
    await h.live.cancel(leaver, c.challenge.id);
    h.advance(10 * 60_000);
    await h.online(a, b);
    expect(await code(h.live.challenge(other, matchId, 'live'))).toBe('OK');
  });

  it('the cooldown also ends after 3 of the leaver own turns', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    await h.goLive(a, b, matchId);
    const actor = await h.actorOf(matchId, a, b);
    const leaver = actor.id === a.id ? b : a;
    await h.live.leave(leaver, matchId);
    for (let i = 0; i < 6; i++) {
      await h.playTurn(actor, matchId);
      await h.playTurn(leaver, matchId);
    }
    await h.online(a, b);
    expect(await code(h.live.challenge(leaver, matchId, 'live'))).toBe('OK');
  });

  it('leaving a match that is not live is refused', async () => {
    const h = makeLiveHarness();
    const { a, matchId } = await h.pair();
    expect(await code(h.live.leave(a, matchId))).toBe('NOT_LIVE');
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

  it('switching modes on and off changes nothing about the board, scores or result', async () => {
    const h = makeLiveHarness();
    const { a, b, matchId } = await h.pair();
    const actor = await h.actorOf(matchId, a, b);
    await h.playTurn(actor, matchId);
    const v0 = await h.service.viewPayload(a, matchId);
    await h.goLive(a, b, matchId);
    const v1 = await h.service.viewPayload(a, matchId);
    const leaver = await h.actorOf(matchId, a, b);
    await h.live.leave(leaver === a ? b : a, matchId);
    const v2 = await h.service.viewPayload(a, matchId);
    for (const v of [v1, v2]) {
      expect(v.view).toEqual(v0.view);
      expect(v.revision).toBe(v0.revision);
      expect(v.result).toEqual(v0.result);
    }
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

  it('full flow over the router: challenge, poll, accept, leave', async () => {
    const h = makeLiveHarness();
    const { matchId, ta, tb } = await h.pair();
    await call(h, 'POST', '/v1/players/me/presence', ta, { status: 'idle' });
    await call(h, 'POST', '/v1/players/me/presence', tb, { status: 'offline_game' });
    const ch = (await call(h, 'POST', `/v1/matches/${matchId}/live/challenge`, ta, {}))!.body as { challenge: { id: string } };
    const inbox = (await call(h, 'GET', '/v1/players/me/challenges', tb))!.body as { incoming: { id: string }[] };
    expect(inbox.incoming.map((c) => c.id)).toEqual([ch.challenge.id]);
    const acc = (await call(h, 'POST', `/v1/challenges/${ch.challenge.id}/accept`, tb, {}))!.body as { liveMatchId: string };
    expect(acc.liveMatchId).toBe(matchId);
    const out = (await call(h, 'POST', `/v1/matches/${matchId}/live/leave`, ta, {}))!.body as { live: { live: boolean } };
    expect(out.live.live).toBe(false);
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
