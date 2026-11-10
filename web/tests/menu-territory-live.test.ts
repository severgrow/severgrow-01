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
import { answerLabel, answerUrgency, answerWaiting, territoryReadout } from '../src/online/menu-territory.js';
import { ANSWER_TICK_MS, mountAnswerClock } from '../src/online/menu-territory-clock.js';
import { yourMoveCount } from '../src/online/match-attention.js';

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
    expect(answer).toEqual({ challengeId: 'ch-1', expiresAt: NOW + 2 * 3_600_000 + 5 * 60_000, count: 1 });
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

  // OWNER, 2026-11-10 ("challenge timer is unmistakable"): with more than one tile waiting for an
  // answer the entry says how many, beside the SOONEST time; and the time wears the tile's colour.
  it('with two or more waiting, reads "2 · 3h 10m" (the count, then the soonest window)', () => {
    const a = challenge({ id: 'a', expiresAt: NOW + 3 * 3_600_000 + 10 * 60_000 });
    const b = challenge({ id: 'b', expiresAt: NOW + 20 * 3_600_000 });
    const closed = challenge({ id: 'c', expiresAt: NOW });
    const answer = answerWaiting({ incoming: [b, a, closed] }, NOW);
    expect(answer).toEqual({ challengeId: 'a', expiresAt: a.expiresAt, count: 2 });
    expect(territoryReadout(5, answer, NOW)).toBe('2 · 3h 10m');
    expect(answerLabel(a.expiresAt, NOW, 1)).toBe('3h 10m');
  });

  it('colours the countdown like the tile: calm, warm under 12 h, hot under 3 h', () => {
    expect(answerUrgency(NOW + 20 * 3_600_000, NOW)).toBe('calm');
    expect(answerUrgency(NOW + 5 * 3_600_000, NOW)).toBe('warm');
    expect(answerUrgency(NOW + 2 * 3_600_000, NOW)).toBe('hot');
    expect(answerUrgency(null, NOW)).toBeNull();
    expect(answerUrgency(NOW, NOW)).toBeNull();
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

// OWNER CHANGED THE RULE (2026-11-10): "don't change PLAY ONLINE to YOUR MOVE - always keep PLAY
// ONLINE as button but make an icon signalising we have YOUR MOVE to do on the side of the button".
// The key's words never change; a quiet marker with the count sits on its side.
describe('the Play online key keeps its name; a marker counts the matches waiting for my move', () => {
  it('uses the owner’s words, from the one strings module', () => {
    expect(ONLINE.playOnline).toBe('Play online');
    expect(ONLINE.menuYourMoveName(2)).toBe('Play online. 2 matches waiting for your move');
    expect(ONLINE.menuYourMoveName(1)).toBe('Play online. 1 match waiting for your move');
  });

  it('counts only matches that wait for ME (my turn in an unfinished duel, or a rematch asked of me)', () => {
    expect(yourMoveCount([match()])).toBe(1);
    expect(yourMoveCount([match({ turnPlayer: 1 })])).toBe(0);
    expect(yourMoveCount([match({ status: 'finished' })])).toBe(0);
    expect(yourMoveCount([match({ status: 'waiting' })])).toBe(0);
    expect(yourMoveCount([])).toBe(0);
    expect(yourMoveCount([match({ status: 'finished' }), match({ matchId: 'm-2' }), match({ matchId: 'm-3' })])).toBe(2);
  });
});
