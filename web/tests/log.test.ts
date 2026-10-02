import { describe as group, expect, it } from 'vitest';
import { describe, moveSummary, resultReason, resultTitle } from '../src/logic/log.js';
import type { Event } from '../../src/engine/index.js';
import { cardName } from '../src/names.js';
import { playGame } from './ui-helpers.js';

group('history lines', () => {
  it("never names a card the bot is still holding", () => {
    playGame(9, ({ before, action, after }) => {
      const line = describe(before, action, after, 0);
      expect(line.length).toBeGreaterThan(0);
      if (before.actor !== 1) return;
      const used = new Set<number>(
        action.t === 'MeldRun' || action.t === 'MeldSet' ? action.cards : action.t === 'Sprout' || action.t === 'Discard' ? [action.card] : [],
      );
      for (const c of after.hands[1]) if (!used.has(c.id) && !before.discard.some((d) => d.id === c.id)) {
        // a held card may share a name with a played copy; only flag names never shown
        const shown = [...used].map((id) => cardName(before.hands[1].find((h) => h.id === id)!));
        if (!shown.includes(cardName(c))) expect(line).not.toContain(cardName(c));
      }
    });
  });

  it('result titles and reasons are plain', () => {
    const r = { winner: 0 as const, reason: 'deck_exhaustion' as const, scores: [9, 7] as [number, number] };
    expect(resultTitle(r, 0)).toBe('You won');
    expect(resultTitle({ ...r, winner: 1 }, 0)).toBe('You lost');
    expect(resultReason(r, 0)).toBe('The deck ran out. The higher score wins.');
  });
});

group('UX pass: what you did with the one-card move (result screen)', () => {
  const ev = (t: 'Sprout' | 'Strengthen', player: 0 | 1) => (t === 'Sprout' ? { t, player, card: 1, coord: { q: 0, r: 0 } } : { t, player, card: 1, coord: { q: 0, r: 0 }, oldStrength: 1, newStrength: 5 }) as Event;
  it('counts only my moves and names them for the version', () => {
    const h = [ev('Sprout', 0), ev('Sprout', 0), ev('Strengthen', 0), ev('Sprout', 1), ev('Strengthen', 1)];
    expect(moveSummary(h, 0, { ruleset: 'seed' })).toBe('You planted 2 seeds and strengthened 1 tile.');
    expect(moveSummary(h, 0, {})).toBe('You sprouted 2 tiles and strengthened 1 tile.');
    expect(moveSummary([ev('Sprout', 0)], 0, { ruleset: 'seed' })).toBe('You planted 1 seed.');
    expect(moveSummary([ev('Strengthen', 0), ev('Strengthen', 0)], 0, {})).toBe('You strengthened 2 tiles.');
    expect(moveSummary([ev('Sprout', 1)], 0, {})).toBeNull();
  });
});
