// Phase 7.5 — the Find-opponent client surface and its punchy copy (one-line-change standard:
// every word lives in src/strings.ts, no hard-coded copy in components).
import { describe, expect, it } from 'vitest';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike, KeyValue } from '../../server/src/client.js';
import { ONLINE } from '../../src/strings.js';
import { PARKED_OFFER_MS, isSearchParked } from '../src/online/lobby.js';

const mem = (): KeyValue => {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v), remove: (k) => void map.delete(k) };
};

const recordingFetch = (body: unknown, calls: string[]): FetchLike => async (url, init) => {
  calls.push(`${init.method} ${new URL(url).pathname}`);
  return { status: 200, ok: true, json: async () => body };
};

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
      ONLINE.searchParkedBody,
      ONLINE.searchPlayComputer,
      ONLINE.searchInviteFriend,
      ONLINE.searchKeepWaiting,
      ONLINE.searchStop,
      ONLINE.searchCancelled,
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
    expect(ONLINE.searchInviteFriend.length).toBeLessThanOrEqual(20);
    expect(ONLINE.searchKeepWaiting.length).toBeLessThanOrEqual(20);
    expect(ONLINE.matchedPlayNow.length).toBeLessThanOrEqual(12);
    expect(ONLINE.matchedLater.length).toBeLessThanOrEqual(8);
  });

  it('never suggests the computer is a person', () => {
    expect(ONLINE.searchPlayComputer.toLowerCase()).toContain('computer');
    // The matched copy talks about an opponent, never the computer.
    expect(ONLINE.matchedTitle.toLowerCase()).not.toContain('computer');
  });

  it('keeps the parked offer at the three-minute window', () => {
    expect(PARKED_OFFER_MS).toBe(180_000);
    expect(isSearchParked(179_999)).toBe(false);
    expect(isSearchParked(180_000)).toBe(true);
  });

  it('does not churn already-punchy labels', () => {
    expect(ONLINE.findOpponent).toBe('Find opponent');
    expect(ONLINE.waitingTitle).toBe('Waiting for a friend');
    expect(ONLINE.joinSubmit).toBe('Join');
  });
});
