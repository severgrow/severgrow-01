import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/engine/index.js';
import { pileCountState, pileStates, stackLayers } from '../src/logic/piles.js';

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

describe('overhaul item 6: the stack thickness shows how many cards are left', () => {
  it('more cards, a thicker stack (0 to 4 layers); one card is one layer; empty is none', () => {
    expect(stackLayers(0, 40)).toBe(0);
    expect(stackLayers(1, 40)).toBe(1);
    expect(stackLayers(40, 40)).toBe(4);
    let prev = 0;
    for (let n = 0; n <= 60; n++) {
      const l = stackLayers(n, 60);
      expect(l).toBeGreaterThanOrEqual(prev);
      expect(l).toBeLessThanOrEqual(4);
      prev = l;
    }
    // a pile bigger than the start (the throw pile can grow) stays at 4
    expect(stackLayers(99, 40)).toBe(4);
  });
  it('the last card is its own state', () => {
    expect(pileCountState(1)).toBe('last');
    expect(pileCountState(0)).toBe('empty');
    expect(pileCountState(4)).toBe('low');
    expect(pileCountState(5)).toBe('low');
    expect(pileCountState(6)).toBe('normal');
  });
});
