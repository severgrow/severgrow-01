// THE MENU'S TWO LIVE SIGNALS (owner brief, 2026-11-01):
//
//   1. "when a challenge needs THEIR response, replace the TILE COUNT with the remaining time —
//      compact, ticking, no extra words"; accepted / resolved goes back to tiles;
//   2. "if the player has an unfinished online duel and it is THEIR turn, the relevant menu line
//      shows the words 'your move' instead of the generic label", reverting when the turn passes
//      or the match ends.
//
// The decisions are pure here, with no DOM and no timers: the entry's paint path is measured in
// `web/e2e/menu-territory.ts` against a real page at 390x844. The clock is driven by an injected
// `now`, so the interval's start / stop and its change-only writes are asserted without waiting.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchListEntry } from '../../server/src/protocol.js';
import type { WorldChallengeWire } from '../../server/src/seeds/types.js';
import { ONLINE } from '../../src/strings.js';
import { answerLabel, answerWaiting, territoryReadout } from '../src/online/menu-territory.js';
import { ANSWER_TICK_MS, mountAnswerClock } from '../src/online/menu-territory-clock.js';
import { playOnlineLabel } from '../src/online/match-attention.js';

const NOW = 1_000_000_000_000;

const challenge = (over: Partial<WorldChallengeWire> = {}): WorldChallengeWire => ({
  id: 'ch-1',
  cellId: '2,-4',
  challengerId: 'them',
  defenderId: 'me',
  challengerName: 'MapleFox',
  defenderName: 'StubGuest',
  fromMe: false,
  status: 'pending',
  stake: 0,
  stakeCellId: '1,-4',
  createdAt: NOW - 60_000,
  expiresAt: NOW + 2 * 3_600_000 + 5 * 60_000,
  respondedAt: null,
  matchId: null,
  matchFinished: false,
  matchWaitingForMe: false,
  matchWinnerId: null,
  winnerId: null,
  resolvedAt: null,
  remainingMs: 2 * 3_600_000 + 5 * 60_000,
  serverNow: NOW,
  ...over,
});

const match = (over: Partial<MatchListEntry> = {}): MatchListEntry => ({
  matchId: 'm-1',
  status: 'active',
  mySeat: 0,
  turnPlayer: 0,
  turnDeadlineAt: NOW + 60_000,
  lastActivityAt: NOW,
  revision: 3,
  opponentName: 'MapleFox',
  opponentTag: '7QK2',
  unseenTurn: true,
  graceUsed: [0, 0],
  gracePeriods: 1,
  result: null,
  ...over,
});

describe('a pending challenge replaces the TILE COUNT with the time left to answer', () => {
  it('answers null for an empty, missing or unrelated list', () => {
    expect(answerWaiting(null, NOW)).toBeNull();
    expect(answerWaiting(undefined, NOW)).toBeNull();
    expect(answerWaiting({ incoming: [] }, NOW)).toBeNull();
    // My own challenge out there waits for THEM: it never counts down on my entry.
    expect(answerWaiting({ incoming: [challenge({ fromMe: true })] }, NOW)).toBeNull();
  });

  it('returns the incoming pending challenge and its deadline', () => {
    const answer = answerWaiting({ incoming: [challenge()] }, NOW);
    expect(answer).toEqual({ challengeId: 'ch-1', expiresAt: NOW + 2 * 3_600_000 + 5 * 60_000 });
  });

  it('never counts down an ACCEPTED or RESOLVED challenge — those are back to tiles', () => {
    expect(answerWaiting({ incoming: [challenge({ status: 'accepted', matchWaitingForMe: true })] }, NOW)).toBeNull();
    expect(answerWaiting({ incoming: [challenge({ status: 'resolved', resolvedAt: NOW })] }, NOW)).toBeNull();
    expect(answerWaiting({ incoming: [challenge({ status: 'declined' })] }, NOW)).toBeNull();
  });

  it('never shows a closed window, and picks the soonest of two', () => {
    expect(answerWaiting({ incoming: [challenge({ expiresAt: NOW })] }, NOW)).toBeNull();
    const later = challenge({ id: 'later', expiresAt: NOW + 9 * 60_000 });
    const sooner = challenge({ id: 'sooner', expiresAt: NOW + 4 * 60_000 });
    expect(answerWaiting({ incoming: [later, sooner] }, NOW)?.challengeId).toBe('sooner');
  });

  it('reads ONLY the compact time — no tile count and no extra word', () => {
    const answer = answerWaiting({ incoming: [challenge()] }, NOW);
    // 2 h 5 m left, in the lobby's own formatter (`formatRemaining`).
    expect(territoryReadout(2, answer, NOW)).toBe('2h 5m');
    expect(territoryReadout(2, answer, NOW)).not.toContain('2 ');
    for (const text of [territoryReadout(2, answer, NOW), answerLabel(NOW + 23 * 60_000 + 59_000, NOW)]) {
      expect(text).not.toMatch(/left|answer|tile/i);
    }
    expect(answerLabel(NOW + 23 * 60_000 + 59_000, NOW)).toBe('23m');
  });

  it('goes back to the tile count when nothing waits or the window has closed', () => {
    expect(territoryReadout(7, null, NOW)).toBe('7');
    const answer = answerWaiting({ incoming: [challenge()] }, NOW);
    expect(territoryReadout(7, answer, NOW + 3 * 3_600_000)).toBe('7');
    expect(territoryReadout(0, null, NOW)).toBe('0');
  });
});

describe('the entry’s answer clock ticks only while a window is open', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('writes once per real change and stops at the deadline, then hands back the tile count', () => {
    let clockNow = NOW;
    const seen: (string | null)[] = [];
    const clock = mountAnswerClock((text) => seen.push(text), () => clockNow);
    clock.set(NOW + 125_000);
    expect(seen).toEqual(['2m']);
    // A tick one second later cannot move a label that reads in whole minutes.
    clockNow += 1_000;
    vi.advanceTimersByTime(ANSWER_TICK_MS);
    expect(seen).toEqual(['2m']);
    // Crossing the next minute DOES move it.
    clockNow = NOW + 61_000;
    vi.advanceTimersByTime(ANSWER_TICK_MS);
    expect(seen).toEqual(['2m', '1m']);
    // At the deadline the tick stops and the half goes back to the tile count — exactly once.
    clockNow = NOW + 125_000;
    vi.advanceTimersByTime(ANSWER_TICK_MS);
    expect(seen).toEqual(['2m', '1m', null]);
    vi.advanceTimersByTime(ANSWER_TICK_MS * 10);
    expect(seen).toEqual(['2m', '1m', null]);
  });

  it('stops at once when a read finds nothing, and can start again for a new window', () => {
    let clockNow = NOW;
    const seen: (string | null)[] = [];
    const clock = mountAnswerClock((text) => seen.push(text), () => clockNow);
    clock.set(NOW + 3_600_000);
    expect(seen).toEqual(['1h 0m']);
    clock.set(null);
    expect(seen).toEqual(['1h 0m', null]);
    vi.advanceTimersByTime(ANSWER_TICK_MS * 5);
    expect(seen).toEqual(['1h 0m', null]);
    clockNow = NOW + 10_000;
    clock.set(NOW + 90_000);
    expect(seen).toEqual(['1h 0m', null, '1m']);
  });
});

describe('an unfinished duel on my turn says "your move" on the Play online key', () => {
  it('uses the owner’s words, from the one strings module', () => {
    expect(ONLINE.yourMove).toBe('your move');
    expect(ONLINE.playOnline).toBe('Play online');
  });

  it('says "your move" only while it is MY turn in an unfinished duel', () => {
    const label = (entries: MatchListEntry[]) => playOnlineLabel(entries, ONLINE.playOnline, ONLINE.yourMove);
    expect(label([match()])).toBe('your move');
    expect(label([match({ turnPlayer: 1 })])).toBe('Play online');
    expect(label([match({ status: 'finished' })])).toBe('Play online');
    expect(label([match({ status: 'waiting' })])).toBe('Play online');
    expect(label([])).toBe('Play online');
    // One live turn is enough, whatever else is in the list.
    expect(label([match({ status: 'finished' }), match({ matchId: 'm-2' })])).toBe('your move');
  });
});
