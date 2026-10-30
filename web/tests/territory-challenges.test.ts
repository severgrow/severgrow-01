import { describe, expect, it } from 'vitest';
import type { WorldChallengeWire } from '../../server/src/seeds/types.js';
import {
  CHALLENGE_LOW_MS,
  SWORDS_HIT_RADIUS,
  challengeForCell,
  challengeMarkerFor,
  isLow,
  opponentName,
  playerName,
  remainingLabel,
  resolvedSheetCopy,
  ringFraction,
  settlementSheetCopy,
  sheetModeFor,
  stakeMarkersFor,
  swordsHitPx,
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
  stake: 0,
  stakeCellId: '3,-10',
  createdAt: 0,
  expiresAt: TTL,
  respondedAt: null,
  matchId: null,
  matchFinished: false,
  matchWinnerId: null,
  matchWaitingForMe: false,
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
  it('reads minutes, then hours, then days — and never claims more time than is left', () => {
    expect(remainingLabel(0)).toBe('0 min');
    expect(remainingLabel(-1)).toBe('0 min');
    expect(remainingLabel(5 * 60_000)).toBe('5 min');
    // FLOOR, not round up (owner review, 2026-10-24). This is a countdown: a label that read
    // "24 h" with 23 h 01 m left, or "1 h" with 59 minutes left, would be telling the player they
    // have time they do not have. The old expectations here pinned the rounded-up values.
    expect(remainingLabel(59 * 60_000 + 1)).toBe('59 min');
    expect(remainingLabel(HOUR)).toBe('1 h');
    expect(remainingLabel(23 * HOUR + 59 * 60_000)).toBe('23 h');
    expect(remainingLabel(47 * HOUR)).toBe('47 h');
    expect(remainingLabel(48 * HOUR + 1)).toBe('2 d');
  });
});

describe('the one-primary sheet state', () => {
  it('is chosen by the server status and who is looking', () => {
    expect(sheetModeFor(challenge(), 'b')).toBe('defend');
    expect(sheetModeFor(challenge(), 'a')).toBe('wait');
    expect(sheetModeFor(challenge({ status: 'accepted', matchId: 'm1' }), 'a')).toBe('duel');
    expect(sheetModeFor(challenge({ status: 'accepted', matchId: 'm1', matchFinished: true }), 'a')).toBe('settling');
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

/**
 * THE CROSSED SWORDS (owner, 2026-10-24: "place 2 swords graphic on top of the tile that is being
 * challenged... if someone clicks at it they can see who challenged it too"). The glyph is drawn in
 * the map's SVG, so its presence and its spoken name are pure decisions, not pixels.
 */
describe('the crossed swords marker', () => {
  it('marks the contested tile for the defender AND for the challenger', () => {
    const incoming = challenge({ id: 'in', fromMe: false });
    const outgoing = challenge({ id: 'out', fromMe: true });
    expect(challengeMarkerFor([incoming], '0,0')).toEqual({
      key: 'in',
      challengeId: 'in',
      cellId: '0,0',
      mine: true,
      side: 'incoming',
      name: 'BloomHeron',
      label: 'Challenge on this tile. BloomHeron challenged you.',
    });
    expect(challengeMarkerFor([outgoing], '0,0')).toEqual({
      key: 'out',
      challengeId: 'out',
      cellId: '0,0',
      mine: true,
      side: 'outgoing',
      name: 'RYK',
      label: 'Challenge on this tile. You challenged RYK.',
    });
  });

  it('keeps the swords for the WHOLE open life of a challenge — pending AND accepted', () => {
    // THE OWNER'S BUG (2026-10-29): "as RYK I have a duel over a tile in territory - but theres no
    // swords icon on the tile that is being challenged right now". An accepted challenge is a live
    // duel over that tile; the ground has not changed hands yet, so the mark must stay.
    for (const status of ['pending', 'accepted'] as const) {
      expect(challengeMarkerFor([challenge({ status })], '0,0')).not.toBeNull();
    }
    // And it leaves when the row CLOSES — by data, not by a timer of the marker's own.
    for (const status of ['declined', 'expired', 'stale', 'resolved'] as const) {
      expect(challengeMarkerFor([challenge({ status })], '0,0')).toBeNull();
    }
    // A pending challenge on ANOTHER tile never marks this one.
    expect(challengeMarkerFor([challenge({ cellId: '4,-2' })], '0,0')).toBeNull();
    expect(challengeMarkerFor([], '0,0')).toBeNull();
  });

  it('says who, in words, with a neutral fallback instead of an id', () => {
    expect(challengeMarkerFor([challenge({ fromMe: false, challengerName: null })], '0,0')!.label)
      .toBe('Challenge on this tile. Player challenged you.');
    expect(challengeMarkerFor([challenge({ fromMe: true, defenderName: null })], '0,0')!.label)
      .toBe('Challenge on this tile. You challenged Player.');
  });

  it('is deterministic when a cell carries more than one entry: the defender’s answer wins, then the timer', () => {
    const later = challenge({ id: 'z', fromMe: false, expiresAt: TTL });
    const sooner = challenge({ id: 'a', fromMe: false, expiresAt: TTL - HOUR });
    expect(challengeMarkerFor([later, sooner], '0,0')!.challengeId).toBe('a');
    expect(challengeMarkerFor([sooner, later], '0,0')!.challengeId).toBe('a');
    // A pending incoming challenge outranks an outgoing one on the same tile, however the list is sorted.
    const outgoing = challenge({ id: 'm', fromMe: true, expiresAt: TTL - 2 * HOUR });
    expect(challengeMarkerFor([outgoing, later], '0,0')!.challengeId).toBe('z');
    // An answer still owed outranks a duel already running on the same tile (only one such row can
    // truly exist — the schema's one-open-per-cell index — but a stale cache must still be stable).
    const running = challenge({ id: 'b', fromMe: false, status: 'accepted', expiresAt: TTL - 5 * HOUR });
    expect(challengeMarkerFor([running, later], '0,0')!.challengeId).toBe('z');
    expect(challengeMarkerFor([later, running], '0,0')!.challengeId).toBe('z');
    // Same challenge, same answer: the label cannot shimmer between polls.
    expect(challengeMarkerFor([later], '0,0')).toEqual(challengeMarkerFor([later], '0,0'));
  });

  it('keeps a >=44px touch target at the map’s 46px cell floor, inside the hex', () => {
    // world-view draws one cell at MIN_CELL_PX = 46; the marker's circle must cover the owner's 44px
    // minimum there, and must stay inside the hex's inradius (R * sqrt(3)/2 = 8.66) so it never
    // becomes an invisible halo over a neighbour.
    expect(swordsHitPx(46)).toBeGreaterThanOrEqual(44);
    expect(swordsHitPx(46)).toBeLessThan(46);
    expect(SWORDS_HIT_RADIUS).toBeLessThan(10 * Math.sqrt(3) / 2);
    // It only grows with the map, never shrinks below the floor.
    expect(swordsHitPx(92)).toBeCloseTo(swordsHitPx(46) * 2, 6);
  });
});

/**
 * THE TILE AT STAKE (owner, 2026-10-29: "challenging is like putting your tile at stake"). The
 * challenger's own tile is named in the sheet and ringed on the map; the defender's risk is the
 * contested tile they were already shown.
 */
describe('the challenger’s stake marker', () => {
  it('marks only the challenger’s own open stake, at the cell the server recorded', () => {
    const markers = stakeMarkersFor([
      challenge({ id: 'out', stakeCellId: '3,-10', status: 'pending' }),
      challenge({ id: 'in', fromMe: false, challengerId: 'b', defenderId: 'a', stakeCellId: '4,-10', status: 'pending' }),
      challenge({ id: 'won', stakeCellId: '5,-10', status: 'resolved' }),
      challenge({ id: 'legacy', stakeCellId: null, status: 'pending' }),
    ], 'a');
    expect(markers).toEqual([{ challengeId: 'out', cellId: '3,-10', label: 'your tile 3,-10 is at stake in a challenge.' }]);
  });

  it('keeps an accepted challenge marked until it settles', () => {
    expect(stakeMarkersFor([challenge({ status: 'accepted', stakeCellId: '3,-10' })], 'a')).toHaveLength(1);
    expect(stakeMarkersFor([challenge({ status: 'expired', stakeCellId: '3,-10' })], 'a')).toHaveLength(0);
  });
});

describe('the settlement sheet asks for no key', () => {
  it('names the winner and says the server is settling, with a harmless fallback', () => {
    const settling = settlementSheetCopy(challenge({
      status: 'accepted', matchFinished: true, matchWinnerId: 'a', stakeCellId: '3,-10',
    }), 'a');
    expect(settling.line).toContain('BloomHeron');
    expect(settling.line).toMatch(/settling/i);
    expect(settling.meta).toBe('YOUR TILE 3,-10 AT STAKE');
    // The fallback exists, but it is never a primary key the player must press.
    expect(settling.fallback).toBe(true);
    expect(JSON.stringify(settling)).not.toMatch(/TAKE THE GROUND|CONFIRM/);
  });

  it('a draw changes nothing and says so', () => {
    const drawn = settlementSheetCopy(challenge({ status: 'accepted', matchFinished: true, matchWinnerId: null }), 'a');
    expect(drawn.line).toBe('A draw. Nothing changes hands.');
    expect(drawn.drawn).toBe(true);
  });

  it('renders the resolved state without a confirm tap', () => {
    const challengerWon = resolvedSheetCopy(challenge({ status: 'resolved', winnerId: 'a', challengerId: 'a' }));
    expect(challengerWon.line).toBe('BloomHeron took this ground.');
    const defenderWon = resolvedSheetCopy(challenge({ status: 'resolved', winnerId: 'b' }));
    expect(defenderWon.line).toBe('RYK kept this ground and took a tile.');
    const draw = resolvedSheetCopy(challenge({ status: 'resolved', winnerId: null }));
    expect(draw.line).toBe('Nothing changed hands.');
  });
});
