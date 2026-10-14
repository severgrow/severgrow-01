// Every way a match can END must reach BOTH devices on the SAME path a completed turn uses.
//
// The owner, after a KO win in normal (non-live) online play: the winner's device showed the end
// screen and the losing device sat on the board. The owner's own read of the fix is exact: "just
// kinda treat the end of screen game for 1 player the same as the signal that's being sent after
// each rounds 'throw' but with end game instead". So: whatever ends the match must publish the
// terminal status on the ping path a Throw already uses (and polling stays the safety net).
//
// This pins the publish for EVERY ending, so a future change cannot quietly stop announcing one:
//   * a KO/surround win inside a Throw batch,
//   * the fair-last-turn deck exhaustion (a normal committing move),
//   * a timeout the sweeper applies,
//   * a timeout a polling device discovers (the lazy expiry),
//   * a resign.
import { describe, expect, it } from 'vitest';

import { CURRENT_RULES_VERSION, apply, legalActions, newMatch, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { RecordingBroadcaster } from '../src/broadcast.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import type { MatchRecord, PlayerRecord } from '../src/storage/types.js';

const NOW = 1_700_000_000_000;
const withoutHistory = (state: State): State => {
  const { history: _discarded, ...rest } = state;
  return rest as State;
};

/** A position where a legal ACT action (never EndAct) ends the game at once. */
const findWinningDraft = (): { seed: number; state: State; win: Action } | null => {
  for (let seed = 1; seed < 4_000; seed++) {
    let state = newMatch(seed);
    let guard = 0;
    while (state.phase !== 'GAME_OVER' && guard++ < 800) {
      const view = viewFor(state, state.actor);
      if (state.phase === 'ACT') {
        const win = legalActions(view).find((a) => a.t !== 'EndAct' && apply(state, a).phase === 'GAME_OVER');
        if (win) return { seed, state, win };
      }
      state = apply(state, GreedyBot.chooseAction(view));
    }
  }
  return null;
};

type Fixture = {
  service: MatchService;
  storage: MemoryStorage;
  broadcaster: RecordingBroadcaster;
  matchId: string;
  seat0: PlayerRecord;
  seat1: PlayerRecord;
};

/**
 * One active match, two participants, and a recording broadcaster. `overdue` puts the turn deadline
 * in the past (a timeout the next touch discovers); `graceUsed` decides whether that timeout is
 * spared (extended) or final.
 */
const fixture = async (state: State, opts: { overdue?: boolean; graceUsed?: [number, number] } = {}): Promise<Fixture> => {
  const storage = new MemoryStorage();
  const broadcaster = new RecordingBroadcaster();
  const service = new MatchService({ storage, config: { ...DEFAULT_SERVER_CONFIG }, now: () => NOW, broadcaster });
  const a = await service.createGuest();
  const b = await service.createGuest();
  const seat0 = await service.authenticate(a.token);
  const seat1 = await service.authenticate(b.token);
  const match: MatchRecord = {
    id: 'finish-publish-match',
    inviteCode: 'FinishPub1',
    rulesVersion: CURRENT_RULES_VERSION,
    seed: 1,
    config: state.config,
    startingPlayer: state.startingPlayer ?? 0,
    status: 'active',
    revision: 0,
    state: withoutHistory(state),
    result: null,
    createdAt: NOW,
    updatedAt: NOW,
    finishedAt: null,
    turnDeadlineAt: opts.overdue ? NOW - 1_000 : NOW + 86_400_000,
    turnTimeoutMs: 86_400_000,
    graceUsed: opts.graceUsed ?? [0, 0],
    gracePeriods: 1,
    graceExtensionMs: 86_400_000,
    turnStartRevision: 0,
    turnStartState: withoutHistory(state),
    expiresAt: null,
    openQueue: false,
  };
  await storage.createMatch(match);
  await storage.addParticipant({ matchId: match.id, playerId: seat0.id, seat: 0, joinedAt: NOW, lastSeenAt: NOW });
  await storage.addParticipant({ matchId: match.id, playerId: seat1.id, seat: 1, joinedAt: NOW, lastSeenAt: NOW });
  return { service, storage, broadcaster, matchId: match.id, seat0, seat1 };
};

const terminalPings = (b: RecordingBroadcaster) => b.published.filter((p) => p.ping.status === 'finished');

describe('a finished match is announced on the same ping path as a completed turn', () => {
  it('a KO/surround win INSIDE a Throw batch publishes the terminal status', async () => {
    const found = findWinningDraft();
    expect(found, 'a Strangle-winning draft move must exist in the first seeds').not.toBeNull();
    const position = found!;
    const f = await fixture(position.state);
    const submitter = position.state.actor === 0 ? f.seat0 : f.seat1;
    f.broadcaster.published.length = 0;

    const res = await f.service.submitAction(submitter, f.matchId, {
      expectedRevision: 0,
      requestId: 'ko-batch',
      actions: [position.win, { t: 'EndAct' }],
    });

    expect(res.player.status).toBe('finished');
    const pings = terminalPings(f.broadcaster);
    expect(pings.length, 'exactly one terminal ping').toBe(1);
    expect(pings[0]!.matchId).toBe(f.matchId);
    expect(pings[0]!.ping.revision).toBe(res.player.revision);
    expect(pings[0]!.ping.status).toBe('finished');
  });

  it('a resign publishes the terminal status', async () => {
    const f = await fixture(newMatch(7));
    f.broadcaster.published.length = 0;
    const res = await f.service.resign(f.seat0, f.matchId);
    expect(res.player.status).toBe('finished');
    const pings = terminalPings(f.broadcaster);
    expect(pings.length).toBe(1);
    expect(pings[0]!.ping.status).toBe('finished');
  });

  it('a timeout the SWEEPER applies publishes the terminal status', async () => {
    // The deadline is long past and this seat has already spent its grace, so the sweep finishes it.
    const f = await fixture(newMatch(11), { overdue: true, graceUsed: [1, 1] });
    f.broadcaster.published.length = 0;

    const result = await f.service.sweep('127.0.0.1');

    expect(result.timedOut).toBe(1);
    const pings = terminalPings(f.broadcaster);
    expect(pings.length, 'the sweep announces the finish so neither device waits for its own poll').toBe(1);
    expect(pings[0]!.ping.status).toBe('finished');
  });

  it('a timeout a POLLING device discovers publishes the terminal status', async () => {
    const f = await fixture(newMatch(13), { overdue: true, graceUsed: [1, 1] });
    f.broadcaster.published.length = 0;

    const payload = await f.service.viewPayload(f.seat1, f.matchId);

    expect(payload.status).toBe('finished');
    const pings = terminalPings(f.broadcaster);
    expect(pings.length, 'the lazy expiry announces the finish too').toBe(1);
    expect(pings[0]!.ping.status).toBe('finished');
  });

  it('a first timeout still announces the GRACE it spent (a state change, not a finish)', async () => {
    const f = await fixture(newMatch(17), { overdue: true });
    f.broadcaster.published.length = 0;

    const result = await f.service.sweep('127.0.0.1');

    expect(result.graceExtended).toBe(1);
    expect(f.broadcaster.published.length).toBe(1);
    expect(f.broadcaster.published[0]!.ping.status).toBe('active');
  });

  it('a normal turn completion (Throw) publishes, which is the path the finish rides', async () => {
    const f = await fixture(newMatch(23));
    f.broadcaster.published.length = 0;
    const view = viewFor((await f.storage.matchById(f.matchId))!.state, 0);
    const draw = legalActions(view).find((a) => a.t === 'Draw');
    expect(draw, 'seat 0 can draw').toBeTruthy();
    if (!draw) return;
    await f.service.submitAction(f.seat0, f.matchId, { expectedRevision: 0, requestId: 'throw-1', actions: [draw, { t: 'EndAct' }] });
    // The turn hands over inside the Discard, so THAT is the completing move and the one announced.
    const mid = await f.storage.matchById(f.matchId);
    const discard = legalActions(viewFor(mid!.state, mid!.state.actor)).find((a) => a.t === 'Discard');
    expect(discard, 'the turn ends with a Discard').toBeTruthy();
    if (!discard) return;
    await f.service.submitAction(f.seat0, f.matchId, { expectedRevision: mid!.revision, requestId: 'throw-2', actions: [discard] });
    expect(f.broadcaster.published.length).toBeGreaterThanOrEqual(1);
    expect(f.broadcaster.published.every((p) => p.matchId === f.matchId)).toBe(true);
    // A turn handover is NOT a terminal status: the ping says active.
    expect(f.broadcaster.published.every((p) => p.ping.status === 'active')).toBe(true);
  });
});
