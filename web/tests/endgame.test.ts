import { describe, expect, it } from 'vitest';
import { newGame, viewFor } from '../../src/engine/index.js';
import type { View } from '../../src/engine/index.js';
import { endgameNote, finalTurns, scoreBreakdown } from '../src/logic/endgame.js';
import { score } from '../../src/engine/index.js';
import { playGame } from './ui-helpers.js';

const at = (turnNumber: number, deckCount: number): View => ({ ...viewFor(newGame(1), 0), turnNumber, deckCount });

describe('the end of the game is never a surprise', () => {
  it('warns about the last turns (30 each by default)', () => {
    expect(endgameNote(at(1, 40))).toBeNull();
    expect(endgameNote(at(55, 40))).toBe('3 turns left');
    expect(endgameNote(at(57, 40))).toBe('2 turns left');
    expect(endgameNote(at(59, 40))).toBe('Last turn!');
  });
  it('warns when the deck is nearly empty', () => {
    expect(endgameNote(at(9, 6))).toBe('Only 6 cards left');
    expect(endgameNote(at(9, 1))).toBe('Only 1 card left');
    expect(endgameNote(at(9, 0))).toBe('Deck empty: last turn!');
  });
});

describe('final score breakdown', () => {
  it('tiles + gold tiles add up to the engine score', () => {
    for (const seed of [1, 2, 3]) {
      const s = playGame(seed);
      for (const p of [0, 1] as const) {
        const b = scoreBreakdown(s, p);
        expect(b.tiles + b.gold).toBe(score(s, p)); // a gold tile counts twice
        expect(b.gold).toBeLessThanOrEqual(b.tiles);
      }
    }
  });
});

describe('UI overhaul item 15: the calm final turns', () => {
  it('starts when 3 of my turns are left by the turn limit (counting this one), or the deck is nearly out', () => {
    expect(finalTurns(at(53, 40)).final).toBe(false); // 4 left
    expect(finalTurns(at(55, 40))).toMatchObject({ final: true, turnsLeft: 3, reason: 'limit' });
    expect(finalTurns(at(59, 40))).toMatchObject({ final: true, turnsLeft: 1, reason: 'limit' });
    expect(finalTurns(at(9, 7)).final).toBe(false);
    expect(finalTurns(at(9, 6))).toMatchObject({ final: true, turnsLeft: null, reason: 'deck' });
  });
  it('the banner is short and calm: no countdown pressure words, no exclamation marks', () => {
    for (const v of [at(55, 40), at(57, 40), at(59, 40), at(9, 6), at(9, 0)]) {
      const b = finalTurns(v).banner!;
      expect(b.length).toBeLessThanOrEqual(24);
      expect(b).not.toMatch(/!|hurry|quick|now|only/i);
    }
    expect(finalTurns(at(55, 40)).banner).toBe('Last 3 turns');
  });
  it('the turn-limit count is exact: in real games with a short limit, I get exactly that many more turns', () => {
    let checked = 0;
    for (const seed of [4, 6, 11]) {
      const seen: { turn: number; left: number }[] = [];
      const end = playGame(seed, ({ before }) => {
        if (before.actor === 0 && before.phase === 'DRAW' && before.turnPlayer === 0) {
          const f = finalTurns(viewFor(before, 0));
          if (f.reason === 'limit') seen.push({ turn: before.turnNumber, left: f.turnsLeft! });
        }
      }, 5000, { maxTurnsPerPlayer: 8 });
      if (end.result?.reason !== 'turn_limit') continue;
      const mine = [...new Set(seen.map((s) => s.turn))];
      for (const s of seen) expect(mine.filter((t) => t >= s.turn).length).toBe(s.left);
      checked += seen.length;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
