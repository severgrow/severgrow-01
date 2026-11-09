// Phase 7.5 — the Find-opponent client surface and its punchy copy (one-line-change standard:
// every word lives in src/strings.ts, no hard-coded copy in components).
import { describe, expect, it } from 'vitest';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike, KeyValue } from '../../server/src/client.js';
import { ONLINE } from '../../src/strings.js';
import {
  PARKED_OFFER_MS,
  definiteMatchPollLost,
  findTap,
  isSearchParked,
  matchPollVerdict,
} from '../src/online/lobby.js';

const mem = (): KeyValue => {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v), remove: (k) => void map.delete(k) };
};

const recordingFetch = (body: unknown, calls: string[]): FetchLike => async (url, init) => {
  calls.push(`${init.method} ${new URL(url).pathname}`);
  return { status: 200, ok: true, json: async () => body };
};

describe('parked-search polls: definite loss vs retry', () => {
  it('treats only definitive not-found codes as cleared', () => {
    for (const code of ['NOT_FOUND', 'MATCH_NOT_FOUND', 'NOT_A_PARTICIPANT', 'MATCH_EXPIRED']) {
      expect(definiteMatchPollLost(code)).toBe(true);
      expect(matchPollVerdict(null, code)).toBe('cleared');
    }
    for (const code of ['RATE_LIMITED', 'DB_UNAVAILABLE', 'UNAUTHORIZED', null, '']) {
      expect(definiteMatchPollLost(code)).toBe(false);
      expect(matchPollVerdict(null, code)).toBe('retry');
    }
  });

  it('reads active, waiting, and finished statuses without a second guess', () => {
    expect(matchPollVerdict('active', null)).toBe('active');
    expect(matchPollVerdict('waiting', null)).toBe('waiting');
    expect(matchPollVerdict('finished', null)).toBe('cleared');
    expect(matchPollVerdict('waiting', 'MATCH_NOT_FOUND')).toBe('waiting');
  });
});

describe('Find-opponent client endpoints', () => {
  it('parks via /v1/matchmaking/find and cancels via /v1/matchmaking/cancel', async () => {
    const calls: string[] = [];
    const client = new DuelClient({
      baseUrl: 'https://api.invalid',
      fetch: recordingFetch({ ok: true, cancelled: true, paired: false, serverNow: 1 }, calls),
      storage: mem(),
    });
    await client.findOpponent('token-1234567890');
    await client.cancelSearch('token-1234567890');
    expect(calls).toEqual(['POST /v1/matchmaking/find', 'POST /v1/matchmaking/cancel']);
  });
});

describe('parked-search copy (punchy standard)', () => {
  it('keeps the offer labels short and the states named', () => {
    // Every state has its own line: searching, parked-and-waiting, matched, invitation, cancel.
    for (const line of [
      ONLINE.searchTitle,
      ONLINE.searchBody,
      ONLINE.searchParkedTitle,
      ONLINE.searchParkedBody(4),
      ONLINE.searchPlayComputer,
      ONLINE.searchPlayLevel(4),
      ONLINE.searchInviteFriend,
      ONLINE.searchKeepWaiting,
      ONLINE.searchStop,
      ONLINE.searchCancelled,
      ONLINE.searchLooking,
      ONLINE.matchedTitle,
      ONLINE.matchedBody,
      ONLINE.matchedPlayNow,
      ONLINE.matchedLater,
      ONLINE.matchedNotice,
      ONLINE.graceYourWarning,
      ONLINE.graceYouUsed,
      ONLINE.graceOpponentUsed,
    ]) {
      expect(typeof line).toBe('string');
      expect(line.length).toBeGreaterThan(0);
    }
    // Buttons stay two or three words.
    expect(ONLINE.searchPlayComputer.length).toBeLessThanOrEqual(20);
    expect(ONLINE.searchPlayLevel(12).length).toBeLessThanOrEqual(20);
    expect(ONLINE.searchInviteFriend.length).toBeLessThanOrEqual(20);
    expect(ONLINE.searchKeepWaiting.length).toBeLessThanOrEqual(20);
    expect(ONLINE.matchedPlayNow.length).toBeLessThanOrEqual(12);
    expect(ONLINE.matchedLater.length).toBeLessThanOrEqual(8);
  });

  // OWNER CHANGED THE OFFER (2026-11-08): a practice match or the current level, not "Play the computer".
  it('offers a practice match or the current level, never calling that match an opponent', () => {
    expect(ONLINE.searchParkedTitle).toBe('Finding an opponent');
    expect(ONLINE.searchPlayComputer).toBe('Practice match');
    expect(ONLINE.searchPlayComputer.toLowerCase()).not.toContain('opponent');
    expect(ONLINE.searchPlayLevel(4)).toBe('Level 4');
    expect(ONLINE.searchParkedBody(4)).toBe(
      "Play while we search. We'll let you know when someone joins.",
    );
    expect(ONLINE.searchInviteFriend).toBe('Invite a friend');
    expect(ONLINE.searchKeepWaiting).toBe('Keep searching');
    expect(ONLINE.searchLooking).toBe('Looking for opponent');
    // Detail (review, 0.84): with no level key on the offer, the line does not name a level either.
    expect(ONLINE.searchParkedBody(null)).toBe(
      "Play while we search. We'll let you know when someone joins.",
    );
    // The matched copy talks about an opponent, never the computer.
    expect(ONLINE.matchedTitle.toLowerCase()).not.toContain('computer');
  });

  it('a repeat find, a cancel still in flight, and a resume do not park a second entry', () => {
    let hasSearch = false;
    let cancelPending = false;
    const tap = () => findTap(hasSearch, cancelPending);
    expect(tap()).toBe('park');
    hasSearch = true;
    expect(tap()).toBe('resume');
    cancelPending = true;
    expect(tap()).toBe('wait');
    cancelPending = false;
    expect(tap()).toBe('resume');
    hasSearch = false;
    expect(tap()).toBe('park');
  });

  // OWNER CHANGED THE RULE (2026-11-08): offer a computer game after 5 seconds, was 3 minutes.
  it('offers a computer game after 5 seconds, and not before', () => {
    expect(PARKED_OFFER_MS).toBe(5_000);
    expect(isSearchParked(4_999)).toBe(false);
    expect(isSearchParked(5_000)).toBe(true);
  });

  it('does not churn already-punchy labels', () => {
    expect(ONLINE.findOpponent).toBe('Find opponent');
    expect(ONLINE.waitingTitle).toBe('Waiting for a friend');
    expect(ONLINE.joinSubmit).toBe('Join');
  });

  it('keeps guest storage and the Seeds invitation honest once accounts exist', () => {
    expect(ONLINE.storageNote.toLowerCase()).not.toContain('until accounts exist');
    expect(ONLINE.storageNote.toLowerCase()).toMatch(/guest/);
    expect(ONLINE.storageNote.toLowerCase()).toMatch(/sign in/);
    expect(ONLINE.worldInviteOpen).toBe('OPEN TERRITORY');
    expect(ONLINE.worldInviteLater).toBe('LATER');
    expect(ONLINE.worldInviteBody.length).toBeGreaterThan(8);
  });
});
