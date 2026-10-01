import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/engine/index.js';
import { pileStates } from '../src/logic/piles.js';

const both: Action[] = [{ t: 'Draw', from: 'deck' }, { t: 'Draw', from: 'discard' }];

describe('deck and throw pile: glow, dim and tappable per step', () => {
  it('Draw step, my turn: both piles glow, can be tapped, and say "tap to draw"', () => {
    const p = pileStates('DRAW', true, false, both);
    expect(p.deck).toEqual({ enabled: true, glow: true, dim: false, hint: 'Tap to draw' });
    expect(p.discard).toEqual({ enabled: true, glow: true, dim: false, hint: 'Tap to take' });
  });

  it('Draw step when the throw pile cannot be taken: only the deck glows', () => {
    const p = pileStates('DRAW', true, false, [{ t: 'Draw', from: 'deck' }]);
    expect(p.deck.glow).toBe(true);
    expect(p.discard).toEqual({ enabled: false, glow: false, dim: true, hint: null });
  });

  it('Grow and Throw steps: both dimmed and not tappable', () => {
    for (const phase of ['ACT', 'DISCARD', 'ROT_PICK'] as const) {
      const p = pileStates(phase, true, false, [{ t: 'EndAct' }]);
      for (const x of [p.deck, p.discard]) expect(x).toEqual({ enabled: false, glow: false, dim: true, hint: null });
    }
  });

  it("the bot's turn, or while animations play: nothing glows or can be tapped", () => {
    for (const [mine, busy] of [[false, false], [true, true]] as const) {
      const p = pileStates('DRAW', mine, busy, both);
      expect(p.deck.enabled || p.discard.enabled || p.deck.glow || p.discard.glow).toBe(false);
    }
  });

  it('game over: nothing glows', () => {
    const p = pileStates('GAME_OVER', true, false, []);
    expect(p.deck.glow || p.discard.glow).toBe(false);
  });
});
