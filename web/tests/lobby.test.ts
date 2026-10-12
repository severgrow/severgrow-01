// Phase 4 — lobby helpers (sort, buckets, join hash, titles, errors).
import { describe, expect, it } from 'vitest';
import type { MatchListEntry } from '../../server/src/protocol.js';
import {
  friendlyJoinError,
  inviteLink,
  lobbyBucket,
  pageTitleForLobby,
  parseJoinHash,
  shareInviteText,
  sortLobbyEntries,
  toLobbyRow,
  trimLobbyList,
  yourTurnCount,
} from '../src/online/lobby.js';
import { ONLINE } from '../../src/strings.js';

const entry = (partial: Partial<MatchListEntry> & Pick<MatchListEntry, 'matchId'>): MatchListEntry => ({
  status: 'active',
  mySeat: 0,
  turnPlayer: 0,
  turnDeadlineAt: Date.now() + 3_600_000,
  opponentName: 'Pine',
  lastActivityAt: 1,
  unseenTurn: false,
  revision: 1,
  result: null,
  ...partial,
});

describe('parseJoinHash', () => {
  it('reads #/join/CODE and rejects junk', () => {
    expect(parseJoinHash('#/join/AB12CD34')).toBe('AB12CD34');
    expect(parseJoinHash('#/join/ab12cd34')).toBe('AB12CD34');
    expect(parseJoinHash('#/join/')).toBeNull();
    expect(parseJoinHash('#/other/AB12')).toBeNull();
  });
});

describe('lobby buckets and sort', () => {
  it('orders Your turn, then Waiting, then Finished (latest 10 finished)', () => {
    const now = 1_000_000;
    const list = [
      entry({ matchId: 'f1', status: 'finished', lastActivityAt: now - 1 }),
      entry({ matchId: 'w1', status: 'waiting', turnPlayer: null, lastActivityAt: now - 2 }),
      entry({ matchId: 'y1', status: 'active', turnPlayer: 0, mySeat: 0, lastActivityAt: now - 3 }),
      entry({ matchId: 't1', status: 'active', turnPlayer: 1, mySeat: 0, lastActivityAt: now - 4 }),
      entry({ matchId: 'y2', status: 'active', turnPlayer: 1, mySeat: 0, unseenTurn: true, lastActivityAt: now }),
    ];
    for (let i = 0; i < 12; i++) {
      list.push(entry({ matchId: `old${i}`, status: 'finished', lastActivityAt: now - 100 - i }));
    }
    expect(lobbyBucket(list[2]!)).toBe('your_turn');
    expect(lobbyBucket(list[3]!)).toBe('waiting');
    expect(lobbyBucket(list[1]!)).toBe('waiting');
    expect(lobbyBucket(list[0]!)).toBe('finished');

    const trimmed = trimLobbyList(list);
    expect(trimmed.filter((e) => lobbyBucket(e) === 'finished')).toHaveLength(10);
    expect(trimmed.slice(0, 2).map((e) => e.matchId)).toEqual(['y2', 'y1']);
    expect(yourTurnCount(trimmed)).toBe(2);
    expect(pageTitleForLobby(2)).toBe('(2) FUTASAKU — your turn');
    expect(pageTitleForLobby(0)).toBe('FUTASAKU');
  });

  it('builds a row with duration text and last-2h warning', () => {
    const now = 5_000_000;
    const row = toLobbyRow(
      entry({
        matchId: 'm',
        turnDeadlineAt: now + 90 * 60_000,
        turnPlayer: 0,
        mySeat: 0,
      }),
      now,
      0,
    );
    expect(row.statusWord).toBe(ONLINE.statusYourTurn);
    expect(row.statusIcon).toBe('play');
    expect(row.timeLeft).toBe('1h 30m');
    expect(row.warnLastTwoHours).toBe(true);
  });
});

describe('invite share and errors', () => {
  it('builds share text without clock times', () => {
    const link = inviteLink('ABCD1234', 'https://severgrow.github.io/futa0.5');
    expect(link).toBe('https://severgrow.github.io/futa0.5/#/join/ABCD1234');
    expect(shareInviteText('ABCD1234', 'https://severgrow.github.io/futa0.5')).toContain('FUTASAKU');
    expect(shareInviteText('ABCD1234', 'https://severgrow.github.io/futa0.5')).toContain(link);
  });

  it('maps join errors to the same friendly line for wrong/expired', () => {
    expect(friendlyJoinError('BAD_CODE')).toBe(ONLINE.errBadOrExpired);
    expect(friendlyJoinError('EXPIRED')).toBe(ONLINE.errBadOrExpired);
    expect(friendlyJoinError('NOT_FOUND')).toBe(ONLINE.errBadOrExpired);
    expect(friendlyJoinError('OWN_MATCH')).toBe(ONLINE.errOwnCode);
  });
});

describe('sortLobbyEntries stable buckets', () => {
  it('keeps activity order inside a bucket', () => {
    const a = entry({ matchId: 'a', lastActivityAt: 10, turnPlayer: 0 });
    const b = entry({ matchId: 'b', lastActivityAt: 20, turnPlayer: 0 });
    expect(sortLobbyEntries([a, b]).map((e) => e.matchId)).toEqual(['b', 'a']);
  });
});
