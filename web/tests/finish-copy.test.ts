// The end-of-game screen in one source (`src/strings.ts` RESULT) shared by `web/src/logic/log.ts`,
// so OFFLINE and ONLINE can never drift apart again. This guards the wording itself; the wiring of
// the online finish screen to these sentences is asserted by `web/e2e/online-finish-parity.ts`.
import { describe, expect, it } from 'vitest';
import type { FinishResult, FinishReason } from '../src/logic/log.js';
import { resultReason, resultTitle } from '../src/logic/log.js';
import { ONLINE, RESULT } from '../../src/strings.js';

const res = (
  winner: 0 | 1 | null,
  reason: FinishReason,
  extra: Partial<FinishResult> = {},
): FinishResult => ({
  winner,
  reason,
  scores: (winner === 0 ? [9, 7] : winner === 1 ? [7, 9] : [8, 8]) as [number, number],
  ...extra,
});

describe('finish copy: outcomes', () => {
  it('names the three outcomes the same way everywhere (never renamed)', () => {
    expect(resultTitle(res(0, 'deck_exhaustion'), 0)).toBe('You won');
    expect(resultTitle(res(1, 'deck_exhaustion'), 0)).toBe('You lost');
    expect(resultTitle(res(null, 'double_strangle'), 0)).toBe('A draw');
    expect(RESULT.won).toBe('You won');
    expect(RESULT.lost).toBe('You lost');
    expect(RESULT.draw).toBe('A draw');
  });
});

describe('finish copy: reasons are full sentences, from the reader seat', () => {
  it('Strangle, both ways round', () => {
    expect(resultReason(res(0, 'strangle'), 0)).toBe("You surrounded your opponent's home.");
    expect(resultReason(res(1, 'strangle'), 0)).toBe('Your opponent surrounded your home.');
  });

  it('keeps the whole deck-end / turn-limit sentence (never a bare "Final score.")', () => {
    expect(resultReason(res(0, 'deck_exhaustion'), 0)).toBe('The cards ran out. The higher score wins.');
    expect(resultReason(res(0, 'turn_limit'), 0)).toBe("Time's up: 30 turns each. The higher score wins.");
  });

  it('explains a score decided by tile strength', () => {
    const r = res(0, 'deck_exhaustion', { scores: [9, 9], strengths: [30, 24] });
    expect(resultReason(r, 0)).toBe(
      'The cards ran out. The higher score wins. Scores were level; higher total tile strength decided it.',
    );
  });

  it('calls a level-score, level-strength finish a true draw', () => {
    const r = res(null, 'deck_exhaustion', { scores: [8, 8], strengths: [24, 24] });
    expect(resultReason(r, 0)).toBe(
      'The cards ran out. The higher score wins. Scores and tile strengths matched \u2014 a true draw.',
    );
    expect(resultReason(res(null, 'double_strangle'), 0)).toBe('Both homes were surrounded at once.');
  });

  it('knows the online-only endings (timeout, resigned) with perspective', () => {
    expect(resultReason(res(0, 'timeout'), 0)).toBe('Your opponent ran out of time.');
    expect(resultReason(res(1, 'timeout'), 0)).toBe('You ran out of time.');
    expect(resultReason(res(0, 'resigned'), 0)).toBe('Your opponent resigned.');
    expect(resultReason(res(1, 'resigned'), 0)).toBe('You resigned.');
  });

  it('names a knocked-under opponent the same way for both readers', () => {
    expect(resultReason(res(0, 'knock'), 0)).toBe('You knocked and stayed ahead.');
    expect(resultReason(res(1, 'knock'), 0)).toBe('Your opponent knocked and stayed ahead.');
  });
});

describe('finish copy: one home for the words', () => {
  it('the score bar reads the same two words as offline (You : Opponent)', () => {
    expect(ONLINE.scoreYou).toBe('You');
    expect(ONLINE.scoreOpponent).toBe('Opponent');
  });

  it('the mid-match urgency is text (amber and red differ, never colour alone)', () => {
    expect(ONLINE.urgencyAmber.length).toBeGreaterThan(0);
    expect(ONLINE.urgencyRed.length).toBeGreaterThan(0);
    expect(ONLINE.urgencyAmber).not.toBe(ONLINE.urgencyRed);
    expect(ONLINE.urgencyAmberSr.length).toBeGreaterThan(0);
    expect(ONLINE.urgencyRedSr.length).toBeGreaterThan(0);
  });
});
