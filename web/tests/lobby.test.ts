// Phase 4 — lobby helpers (sort, buckets, join hash, titles, errors).
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

  it('maps the wrong-or-expired codes the server really sends to one line', () => {
    // These were the DEAD spellings `BAD_CODE`/`EXPIRED`/`OWN_MATCH` - replaced with the codes the
    // join path in server/src/service.ts actually raises.
    expect(friendlyJoinError('MATCH_NOT_FOUND')).toBe(ONLINE.errBadOrExpired);
    expect(friendlyJoinError('MATCH_EXPIRED')).toBe(ONLINE.errBadOrExpired);
    expect(friendlyJoinError('NOT_FOUND')).toBe(ONLINE.errBadOrExpired);
    expect(friendlyJoinError('INVALID_REQUEST')).toBe(ONLINE.errBadOrExpired);
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

// REGRESSION: the join screen mapped SIX spellings the server has never emitted (`BAD_CODE`,
// `EXPIRED`, `FULL`, `OWN_MATCH`, plus `NOT_FOUND`/`ALREADY_JOINED` which exist but are not what the
// join path sends) while missing all THREE the join path really sends. So every failed join - by far
// the likeliest thing to go wrong at a playtest - showed "Something went wrong. Try again." The unit
// test above pinned the DEAD spellings, which is why it stayed green. These two tests close that:
// one drives the REAL service, the other refuses to let a dead spelling back in.
describe('joining a duel shows the SPECIFIC message the server really sends', () => {
  const setup = async () => {
    const storage = new MemoryStorage();
    const service = new MatchService({ storage, config: DEFAULT_SERVER_CONFIG });
    const a = await service.authenticate((await service.createGuest()).token);
    const b = await service.authenticate((await service.createGuest()).token);
    const c = await service.authenticate((await service.createGuest()).token);
    return { service, a, b, c };
  };

  /** The code the REAL service raises, or null if it unexpectedly succeeded. */
  const codeOf = async (run: () => Promise<unknown>): Promise<string | null> => {
    try {
      await run();
      return null;
    } catch (error) {
      expect(error, 'a join failure must be an ApiError').toBeInstanceOf(ApiError);
      return (error as ApiError).code;
    }
  };

  it('a wrong code asks the player to check the code, not to "try again"', async () => {
    const { service, b } = await setup();
    const code = await codeOf(() => service.joinMatch(b, 'ZZZZ'));
    expect(code).toBe('MATCH_NOT_FOUND');
    expect(friendlyJoinError(code!)).toBe(ONLINE.errBadOrExpired);
    expect(friendlyJoinError(code!), 'must not be the generic line').not.toBe(ONLINE.errGeneric);
    // An empty code is rejected by the same path and deserves the same clear line.
    expect(friendlyJoinError('INVALID_REQUEST')).toBe(ONLINE.errBadOrExpired);
  });

  it('an already-full duel says it is full, which is what the second tester sees', async () => {
    const { service, a, b, c } = await setup();
    const { match } = await service.createMatch(a);
    await service.joinMatch(b, match.inviteCode);
    const code = await codeOf(() => service.joinMatch(c, match.inviteCode));
    expect(code).toBe('MATCH_FULL');
    expect(friendlyJoinError(code!)).toBe(ONLINE.errFull);
  });

  it('a finished duel says it has finished, rather than blaming the code', async () => {
    const { service, a, b, c } = await setup();
    const { match } = await service.createMatch(a);
    await service.joinMatch(b, match.inviteCode);
    // `matchId`, not `id` — MatchSummary has no `id` field, and passing undefined makes the service
    // raise a generic "Unknown match." that looks like a real failure.
    await service.resign(a, match.matchId);
    const code = await codeOf(() => service.joinMatch(c, match.inviteCode));
    expect(code).toBe('MATCH_FINISHED');
    expect(friendlyJoinError(code!)).toBe(ONLINE.errFinished);
    // A separate, truthful line - not the "your code is wrong" one, which would be a lie here.
    expect(friendlyJoinError(code!)).not.toBe(ONLINE.errBadOrExpired);
  });

  it('a briefly unreachable database says so instead of "something went wrong"', () => {
    expect(friendlyJoinError('DB_UNAVAILABLE')).toBe(ONLINE.errDbBusy);
    expect(friendlyJoinError('DB_UNAVAILABLE')).not.toBe(ONLINE.errGeneric);
  });

  it('maps only codes the server can actually emit', () => {
    // The anti-rot guard. Every `case` in the mapping must be a code string that appears somewhere
    // in server/src - so a dead spelling (the exact bug above) fails this immediately. It is
    // deliberately a whole-directory scan: codes are raised from the service, storage and routers,
    // and listing them by hand is how the client drifted from the server in the first place.
    const here = fileURLToPath(new URL('../src/online/lobby.ts', import.meta.url));
    const source = readFileSync(here, 'utf8');
    const body = source.slice(source.indexOf('friendlyJoinError'));
    const cases = [...body.matchAll(/case '([A-Z_]+)'/g)].map((m) => m[1]!);
    expect(cases.length, 'expected several mapped codes').toBeGreaterThan(5);
    const serverDir = fileURLToPath(new URL('../../server/src', import.meta.url));
    const serverText = readdirSync(serverDir, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => readFileSync(join(serverDir, f), 'utf8'))
      .join('\n');
    for (const code of cases) {
      expect(serverText, `the client maps '${code}', but no server path emits it`).toContain(`'${code}'`);
    }
  });
});

describe('sortLobbyEntries stable buckets', () => {
  it('keeps activity order inside a bucket', () => {
    const a = entry({ matchId: 'a', lastActivityAt: 10, turnPlayer: 0 });
    const b = entry({ matchId: 'b', lastActivityAt: 20, turnPlayer: 0 });
    expect(sortLobbyEntries([a, b]).map((e) => e.matchId)).toEqual(['b', 'a']);
  });
});
