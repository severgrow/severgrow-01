// Phase 4 — lobby helpers (sort, buckets, join hash, titles, errors).
import { describe, expect, it } from 'vitest';
import type { MatchListEntry } from '../../server/src/protocol.js';
import {
  friendlyJoinError,
  formatWaitingAge,
  inviteLink,
  isSearchParked,
  isWellFormedInviteCode,
  lobbyBucket,
  normalizeInviteCodeInput,
  PARKED_OFFER_MS,
  pageTitleForLobby,
  parseJoinHash,
  shareInviteText,
  sortLobbyEntries,
  toLobbyRow,
  trimLobbyList,
  yourTurnCount,
} from '../src/online/lobby.js';
import { ONLINE } from '../../src/strings.js';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { ApiError } from '../../server/src/errors.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';

const entry = (partial: Partial<MatchListEntry> & Pick<MatchListEntry, 'matchId'>): MatchListEntry => ({
  status: 'active',
  mySeat: 0,
  turnPlayer: 0,
  turnDeadlineAt: Date.now() + 3_600_000,
  opponentName: 'Pine',
  lastActivityAt: 1,
  unseenTurn: false,
  revision: 1,
  graceUsed: [0, 0],
  gracePeriods: 1,
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

describe('typed-code hardening', () => {
  it('trims, uppercases and strips spaces/dashes from pasted input', () => {
    expect(normalizeInviteCodeInput('  ab12 cd34 ')).toBe('AB12CD34');
    expect(normalizeInviteCodeInput('AB12-CD34')).toBe('AB12CD34');
  });

  it('keeps just the code when a whole invite link is pasted', () => {
    expect(normalizeInviteCodeInput('https://severgrow.github.io/severgrow-01/futa0.5/#/join/AB12CD34')).toBe(
      'AB12CD34',
    );
  });

  it('rejects malformed codes instead of silently accepting them', () => {
    expect(isWellFormedInviteCode('AB12CD34')).toBe(true);
    expect(isWellFormedInviteCode('')).toBe(false);
    expect(isWellFormedInviteCode('AB')).toBe(false);
    expect(isWellFormedInviteCode('!!!!')).toBe(false);
    expect(isWellFormedInviteCode('ABCDEFGHIJKLMNOPQ')).toBe(false);
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

  it('shows a waiting match\'s AGE, not a countdown, so an open duel explains itself', () => {
    const now = 5_000_000;
    // Waiting 5 days: the row reads "5d" and is never flagged by the last-2-hours warning.
    const waiting = toLobbyRow(
      entry({ matchId: 'w', status: 'waiting', turnPlayer: null, turnDeadlineAt: null, lastActivityAt: now - 5 * 24 * 3_600_000 }),
      now,
    );
    expect(waiting.statusWord).toBe(ONLINE.statusWaitingFriend);
    expect(waiting.statusIcon).toBe('hourglass');
    expect(waiting.timeLeft).toBe('5d');
    expect(waiting.warnLastTwoHours).toBe(false);
    expect(waiting.inviteHint).toBe(ONLINE.waitingInviteHint);

    expect(formatWaitingAge(3_600_000)).toBe('1h');
    expect(formatWaitingAge(12 * 60_000)).toBe('12m');
    expect(formatWaitingAge(0)).toBe('1m');
  });

  it('surfaces a spent grace as a word and flags your own as at-risk', () => {
    const now = 5_000_000;
    const mine = toLobbyRow(entry({ matchId: 'g1', mySeat: 0, turnPlayer: 0, graceUsed: [1, 0] }), now);
    expect(mine.graceWord).toBe(ONLINE.graceYouUsed);
    expect(mine.atRisk).toBe(true);

    const theirs = toLobbyRow(entry({ matchId: 'g2', mySeat: 0, turnPlayer: 1, graceUsed: [0, 1] }), now);
    expect(theirs.graceWord).toBe(ONLINE.graceOpponentUsed);
    expect(theirs.atRisk).toBe(false);

    const none = toLobbyRow(entry({ matchId: 'g3', graceUsed: [0, 0] }), now);
    expect(none.graceWord).toBeNull();
    expect(none.atRisk).toBe(false);

    // A finished match never carries a live grace warning.
    const done = toLobbyRow(entry({ matchId: 'g4', status: 'finished', graceUsed: [1, 1] }), now);
    expect(done.graceWord).toBeNull();
  });
});

describe('parked search offer timing', () => {
  it('offers the computer fallback only after the parked window', () => {
    expect(isSearchParked(0)).toBe(false);
    expect(isSearchParked(PARKED_OFFER_MS - 1)).toBe(false);
    expect(isSearchParked(PARKED_OFFER_MS)).toBe(true);
    expect(isSearchParked(PARKED_OFFER_MS + 1)).toBe(true);
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

// REGRESSION: the player-facing "too many open duels" line must fire for the code the server
// ACTUALLY emits. The client used to key on `TOO_MANY_OPEN`, a code no server path produces, so it
// silently fell through to the generic "Something went wrong" — the specific line was dead code.
// This drives the REAL service to the cap, takes the real error code, and asserts the client maps
// THAT code to the specific line. It fails if the two sides ever diverge again.
describe('the open-duel cap shows the SPECIFIC message the server really sends', () => {
  const configWithCap = () => ({
    ...DEFAULT_SERVER_CONFIG,
    turnTimeoutMs: 10_000,
    waitingExpireMs: 3_600_000,
    rateLimits: {
      ...DEFAULT_SERVER_CONFIG.rateLimits,
      guestPerIpPerHour: 100_000,
      joinPerPlayerPerHour: 100_000,
      joinPerIpPerHour: 100_000,
      createPerPlayerPerHour: 100_000,
      createPerIpPerHour: 100_000,
    },
  });

  it('the server emits TOO_MANY_MATCHES, and that code maps to ONLINE.errTooMany', async () => {
    const storage = new MemoryStorage();
    const service = new MatchService({ storage, config: configWithCap() });
    const created = await service.createGuest();
    const player = await service.authenticate(created.token);
    for (let i = 0; i < DEFAULT_SERVER_CONFIG.maxOpenMatchesPerPlayer; i++) await service.createMatch(player);

    let caught: unknown;
    try {
      await service.findOpponent(player);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    const serverCode = (caught as ApiError).code;
    // The code the server really emits at the cap.
    expect(serverCode).toBe('TOO_MANY_MATCHES');
    // ...and the client maps exactly that code to the specific line, NOT the generic fallback.
    expect(friendlyJoinError(serverCode)).toBe(ONLINE.errTooMany);
    expect(friendlyJoinError(serverCode)).not.toBe(ONLINE.errGeneric);
  });

  it('every api error code the service can raise is either mapped or intentionally generic', () => {
    // A blunt guard against drift: the one code that regressed is pinned, and the dead spelling
    // must never come back as the mapping key.
    expect(friendlyJoinError('TOO_MANY_MATCHES')).toBe(ONLINE.errTooMany);
    expect(friendlyJoinError('RATE_LIMITED')).toBe(ONLINE.errRateLimited);
  });
});

describe('sortLobbyEntries stable buckets', () => {
  it('keeps activity order inside a bucket', () => {
    const a = entry({ matchId: 'a', lastActivityAt: 10, turnPlayer: 0 });
    const b = entry({ matchId: 'b', lastActivityAt: 20, turnPlayer: 0 });
    expect(sortLobbyEntries([a, b]).map((e) => e.matchId)).toEqual(['b', 'a']);
  });
});
