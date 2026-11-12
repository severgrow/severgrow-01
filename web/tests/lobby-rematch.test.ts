// Your matches: a finished row can challenge the same player again (owner, 2026-11-09).
import { describe, expect, it } from 'vitest';
import { HUB_POLL_FAST_MS, HUB_POLL_MS, hubPollMs, sortLobbyEntries, toLobbyRow, trimLobbyList } from '../src/online/lobby.js';
import { needsMyResponse } from '../src/online/match-attention.js';
import { ONLINE } from '../../src/strings.js';

const finished = { matchId: 'm', status: 'finished', mySeat: 0, turnPlayer: null, turnDeadlineAt: null, opponentName: 'MapleFox', lastActivityAt: 0, unseenTurn: false, revision: 9, graceUsed: [0, 0], gracePeriods: 1, result: null } as const;

describe('the Rematch key on a finished row', () => {
  it('every finished game with an opponent offers it', () => {
    expect(toLobbyRow(finished as never, 0).rematch).toBe('offer');
    expect(toLobbyRow({ ...finished, opponentName: null } as never, 0).rematch).toBeNull();
    expect(toLobbyRow({ ...finished, status: 'active', turnPlayer: 1 } as never, 0).rematch).toBeNull();
  });
  // OWNER CHANGED THE RULE (2026-11-10): a finished row is the opponent's name, the result, and two
  // keys (replay, challenge again). The opponent's waiting rematch is the gold challenge key and the
  // row's "!", not words in place of the result.
  it("the opponent's waiting rematch counts as needing my response; the row still shows the result", () => {
    const row = toLobbyRow({ ...finished, rematch: 'theirs' } as never, 0);
    expect(row.rematch).toBe('theirs');
    expect(row.statusWord).toBe(ONLINE.statusFinished); // no result on this fixture
    expect(needsMyResponse({ ...finished, rematch: 'theirs' } as never)).toBe(true);
    expect(needsMyResponse({ ...finished, rematch: 'mine' } as never)).toBe(false);
  });
  it('challenging again asks first, in the owner\'s words', () => {
    expect(ONLINE.rematchConfirm('RYK')).toBe('You want to challenge RYK again?');
    expect(ONLINE.rowRematchKey('RYK')).toBe('Challenge RYK again');
    expect(ONLINE.rowReplayKey('RYK')).toBe('Watch the replay against RYK');
  });
});

describe('Your matches keeps up with the opponent', () => {
  const row = (id: string, over: object) => ({ ...finished, matchId: id, ...over });
  it('a waiting rematch sorts right after the games where it is my turn, and is never trimmed off', () => {
    const entries = [
      row('waiting', { status: 'active', turnPlayer: 1, lastActivityAt: 50 }),
      ...Array.from({ length: 12 }, (_, i) => row(`old${i}`, { lastActivityAt: 100 + i })),
      row('rematch', { rematch: 'theirs', lastActivityAt: 1 }),
      row('mine', { status: 'active', turnPlayer: 0, lastActivityAt: 10 }),
    ];
    const ids = trimLobbyList(entries as never).map((e) => e.matchId);
    expect(ids.slice(0, 3)).toEqual(['mine', 'rematch', 'waiting']);
    expect(sortLobbyEntries(entries as never).map((e) => e.matchId).slice(0, 2)).toEqual(['mine', 'rematch']);
  });
  it('refreshes faster while the list is open and a game waits on the opponent', () => {
    const theirTurn = [row('a', { status: 'active', turnPlayer: 1 })];
    expect(hubPollMs({ expanded: true, entries: theirTurn as never })).toBe(HUB_POLL_FAST_MS);
    expect(hubPollMs({ expanded: false, entries: theirTurn as never })).toBe(HUB_POLL_MS);
    expect(hubPollMs({ expanded: true, entries: [finished] as never })).toBe(HUB_POLL_MS);
    expect(HUB_POLL_FAST_MS).toBeLessThanOrEqual(4_000);
  });
});
