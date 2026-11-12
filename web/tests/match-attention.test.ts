// The lobby's "needs my response" decision, pinned as a PURE function.
//
// Owner instruction (2026-10-25): the "Your matches" button and the specific match row carry a red
// "!" while a match is waiting for HIS move. The decision must never badge a match that is waiting
// for the opponent, or he learns to ignore the badge. The server's payload is the only input:
//   - `status`    'waiting' | 'active' | 'finished'
//   - `mySeat`    the seat this player holds
//   - `turnPlayer` the seat whose turn it is (null while waiting)
// So "needs my response" is EXACTLY `status === 'active' && turnPlayer === mySeat`.
import { describe, expect, it } from 'vitest';
import type { MatchListEntry } from '../../server/src/protocol.js';
import {
  attentionBadgeWords,
  countNeedingResponse,
  needsMyResponse,
  yourMatchesButtonName,
  yourMatchesLabel,
} from '../src/online/match-attention.js';
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
  graceUsed: [0, 0],
  gracePeriods: 1,
  result: null,
  ...partial,
});

describe('needsMyResponse', () => {
  it('is true for an active match whose turn is mine', () => {
    expect(needsMyResponse(entry({ matchId: 'mine', mySeat: 0, turnPlayer: 0 }))).toBe(true);
    expect(needsMyResponse(entry({ matchId: 'mine1', mySeat: 1, turnPlayer: 1 }))).toBe(true);
  });

  it('is false when it is the opponent who must move', () => {
    // The badge must never point at a match where the other player has to act.
    expect(needsMyResponse(entry({ matchId: 'theirs', mySeat: 0, turnPlayer: 1 }))).toBe(false);
    expect(needsMyResponse(entry({ matchId: 'theirs1', mySeat: 1, turnPlayer: 0 }))).toBe(false);
  });

  it('is false for a waiting match I own: it waits for an opponent, not for me', () => {
    expect(needsMyResponse(entry({ matchId: 'waiting', status: 'waiting', turnPlayer: null }))).toBe(false);
  });

  it('is false for a finished match, even when its result is unseen', () => {
    expect(needsMyResponse(entry({ matchId: 'done', status: 'finished', turnPlayer: null }))).toBe(false);
    // `unseenTurn` is NOT an input to the decision. The server only sets it when the turn is
    // already mine (service.ts listMyMatches), and a finished match is never "waiting for a move".
    expect(needsMyResponse(entry({ matchId: 'done-unseen', status: 'finished', turnPlayer: null, unseenTurn: true }))).toBe(false);
    expect(needsMyResponse(entry({ matchId: 'theirs-unseen', mySeat: 0, turnPlayer: 1, unseenTurn: true }))).toBe(false);
  });

  it('is false for a match with no turn player at all', () => {
    expect(needsMyResponse(entry({ matchId: 'null-turn', turnPlayer: null }))).toBe(false);
  });
});

describe('countNeedingResponse', () => {
  it('counts only the matches whose turn is mine, in a mixed list', () => {
    const list = [
      entry({ matchId: 'mine-a', mySeat: 0, turnPlayer: 0 }),
      entry({ matchId: 'theirs', mySeat: 0, turnPlayer: 1 }),
      entry({ matchId: 'waiting', status: 'waiting', turnPlayer: null }),
      entry({ matchId: 'mine-b', mySeat: 1, turnPlayer: 1 }),
      entry({ matchId: 'done', status: 'finished', turnPlayer: null }),
    ];
    expect(countNeedingResponse(list)).toBe(2);
    expect(countNeedingResponse([])).toBe(0);
    expect(countNeedingResponse(list.filter((e) => e.status === 'waiting'))).toBe(0);
  });
});

describe('disclosure labels and the badge words', () => {
  it('shows the count beside the button label', () => {
    expect(yourMatchesLabel(0)).toBe('Your matches (0)');
    expect(yourMatchesLabel(3)).toBe('Your matches (3)');
    expect(ONLINE.yourMatchesCount(3)).toBe('Your matches (3)');
  });

  it('speaks the badge in words, with honest singular/plural', () => {
    expect(attentionBadgeWords(1)).toBe('1 match waiting for your move');
    expect(attentionBadgeWords(2)).toBe('2 matches waiting for your move');
    expect(attentionBadgeWords(0)).toBe('');
  });

  it('gives the button an accessible name that includes the waiting count', () => {
    expect(yourMatchesButtonName(3, 2)).toBe('Your matches (3). 2 matches waiting for your move');
    expect(yourMatchesButtonName(1, 1)).toBe('Your matches (1). 1 match waiting for your move');
    // Nothing waiting: the name is just the label (no stale badge words).
    expect(yourMatchesButtonName(3, 0)).toBe('Your matches (3)');
    expect(yourMatchesButtonName(0, 0)).toBe('Your matches (0)');
  });
});
