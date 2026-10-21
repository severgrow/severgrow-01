import { describe, expect, it } from 'vitest';
import type { WorldChallengeWire } from '../../server/src/seeds/types.js';
import {
  CHALLENGE_LOW_MS,
  challengeForCell,
  isLow,
  opponentName,
  playerName,
  remainingLabel,
  ringFraction,
  sheetModeFor,
  winnerName,
} from '../src/online/challenge-view.js';

const HOUR = 60 * 60 * 1000;
const TTL = 24 * HOUR;

const challenge = (over: Partial<WorldChallengeWire> = {}): WorldChallengeWire => ({
  id: 'c1',
  cellId: '0,0',
  challengerId: 'a',
  defenderId: 'b',
  challengerName: 'BloomHeron',
  defenderName: 'RYK',
  fromMe: true,
  status: 'pending',
  stake: 100,
  createdAt: 0,
  expiresAt: TTL,
  respondedAt: null,
  matchId: null,
  matchFinished: false,
  matchWinnerId: null,
  winnerId: null,
  resolvedAt: null,
  remainingMs: TTL,
  serverNow: 0,
  ...over,
});

describe('the 24 h ring', () => {
  it('is full at send, half at noon and empty at the deadline', () => {
    expect(ringFraction(challenge(), 0)).toBe(1);
    expect(ringFraction(challenge(), 12 * HOUR)).toBe(0.5);
    expect(ringFraction(challenge(), TTL)).toBe(0);
    // A late read never goes below nothing (the ring has already collapsed).
    expect(ringFraction(challenge(), TTL + HOUR)).toBe(0);
  });

  it('only a pending challenge has a ring, and a malformed span is empty rather than wrong', () => {
    expect(ringFraction(challenge({ status: 'accepted' }), 0)).toBe(0);
    expect(ringFraction(challenge({ status: 'resolved' }), 0)).toBe(0);
    expect(ringFraction(challenge({ createdAt: TTL, expiresAt: TTL }), 0)).toBe(0);
  });

  it('starts breathing under six hours, never while expired', () => {
    expect(isLow(challenge(), TTL - CHALLENGE_LOW_MS - 1)).toBe(false);
    expect(isLow(challenge(), TTL - CHALLENGE_LOW_MS)).toBe(true);
    expect(isLow(challenge(), TTL)).toBe(false);
    expect(isLow(challenge({ status: 'accepted' }), 0)).toBe(false);
  });
});

describe('the one time label', () => {
  it('reads minutes, then hours, then days', () => {
    expect(remainingLabel(0)).toBe('0 min');
    expect(remainingLabel(-1)).toBe('0 min');
    expect(remainingLabel(5 * 60_000)).toBe('5 min');
    // A minute short of the hour rounds up to it; the label never reads "60 min" beside "1 h".
    expect(remainingLabel(59 * 60_000 + 1)).toBe('1 h');
    expect(remainingLabel(HOUR)).toBe('1 h');
    expect(remainingLabel(23 * HOUR + 59 * 60_000)).toBe('24 h');
    expect(remainingLabel(47 * HOUR)).toBe('47 h');
    expect(remainingLabel(48 * HOUR + 1)).toBe('3 d');
  });
});

describe('the one-primary sheet state', () => {
  it('is chosen by the server status and who is looking', () => {
    expect(sheetModeFor(challenge(), 'b')).toBe('defend');
    expect(sheetModeFor(challenge(), 'a')).toBe('wait');
    expect(sheetModeFor(challenge({ status: 'accepted', matchId: 'm1' }), 'a')).toBe('duel');
    expect(sheetModeFor(challenge({ status: 'accepted', matchId: 'm1', matchFinished: true }), 'a')).toBe('confirm');
    expect(sheetModeFor(challenge({ status: 'resolved' }), 'a')).toBe('resolved');
    expect(sheetModeFor(challenge({ status: 'declined' }), 'a')).toBe('closed');
    expect(sheetModeFor(challenge({ status: 'expired' }), 'a')).toBe('closed');
    expect(sheetModeFor(challenge({ status: 'stale' }), 'a')).toBe('closed');
  });
});

describe('cell and name lookups', () => {
  it('marks a cell only while its challenge is open', () => {
    const open = challenge();
    const closed = challenge({ id: 'c2', status: 'declined' });
    expect(challengeForCell([closed, open], '0,0')?.id).toBe('c1');
    expect(challengeForCell([closed], '0,0')).toBeNull();
    expect(challengeForCell([open], '1,0')).toBeNull();
  });

  it('names both participants and the winner, never an id', () => {
    const c = challenge();
    expect(opponentName(c, 'a')).toBe('RYK');
    expect(opponentName(c, 'b')).toBe('BloomHeron');
    expect(playerName(c, 'b')).toBe('RYK');
    expect(playerName(c, null)).toBeNull();
    expect(winnerName(challenge({ winnerId: 'a' }))).toBe('BloomHeron');
    expect(winnerName(challenge({ winnerId: 'b' }))).toBe('RYK');
    expect(winnerName(challenge())).toBeNull();
  });
});
