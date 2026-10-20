// The lesson's light on screen, and a tap on screen back to the lesson's words for it.
import { describe, expect, it } from 'vitest';
import { litTarget, tapOf } from '../src/lessons/lesson-view.js';

/** A stand-in element: `closest` answers from a list of selectors it "matches", with attributes. */
const fake = (matches: Record<string, Record<string, string>>) => ({
  closest: (sel: string) => {
    for (const part of sel.split(',').map((x) => x.trim())) {
      const hit = matches[part];
      if (hit) return { getAttribute: (k: string) => hit[k] ?? null, dataset: hit };
    }
    return null;
  },
});

describe('the light on screen', () => {
  const homes = ['-2,2', '2,-2'] as const;
  it('a hex lights as a hex, a card as a card, the piles and buttons as pills', () => {
    expect(litTarget({ t: 'hex', key: '0,0' }, homes)).toEqual({ selectors: ['#board .hex-cell[data-key="0,0"]'], shape: 'hex' });
    expect(litTarget({ t: 'hexes', keys: ['0,0', '1,-1'] }, homes).shape).toBe('hex');
    expect(litTarget({ t: 'hexes', keys: ['0,0', '1,-1'] }, homes).selectors).toHaveLength(2);
    expect(litTarget({ t: 'home', player: 1 }, homes)).toEqual({ selectors: ['#board .hex-cell[data-key="2,-2"]'], shape: 'hex' });
    expect(litTarget({ t: 'rock', key: '-1,0' }, homes).shape).toBe('hex');
    expect(litTarget({ t: 'card', id: 7 }, homes)).toEqual({ selectors: ['#hand .card[data-card="7"]'], shape: 'card' });
    expect(litTarget({ t: 'cards', ids: [1, 2, 3] }, homes).selectors).toHaveLength(3);
    expect(litTarget({ t: 'deck' }, homes)).toEqual({ selectors: ['#deck'], shape: 'pill' });
    expect(litTarget({ t: 'discard' }, homes)).toEqual({ selectors: ['#discard'], shape: 'pill' });
    expect(litTarget({ t: 'end' }, homes).shape).toBe('pill');
    expect(litTarget({ t: 'bloom' }, homes).shape).toBe('pill');
  });
  it('the Draw pile with its count is a pill; the score display target still resolves, but nothing points at it', () => {
    expect(litTarget({ t: 'deckCount' }, homes)).toEqual({ selectors: ['#deck .pile-card', '#deck-count'], shape: 'pill' });
    // Kept as a reachable target (a future score beat can use it), but the level-1 grow
    // explanation lights the placed tile instead — that assertion lives in lessons.test.ts.
    expect(litTarget({ t: 'score' }, homes)).toEqual({ selectors: ['#smart-led'], shape: 'pill' });
  });
  it('nothing to light: no focus at all (the window speaks alone)', () => {
    expect(litTarget({ t: 'none' }, homes)).toEqual({ selectors: [], shape: 'none' });
    expect(litTarget({ t: 'led' }, homes)).toEqual({ selectors: [], shape: 'none' });
  });
});

describe('a tap back to the lesson', () => {
  it('reads hexes, cards, piles and the done button', () => {
    expect(tapOf(fake({ '#board [data-key]': { 'data-key': '0,0' } }) as never)).toEqual({ t: 'hex', key: '0,0' });
    expect(tapOf(fake({ '#hand [data-card]': { 'data-card': '12' } }) as never)).toEqual({ t: 'card', id: 12 });
    expect(tapOf(fake({ '#deck': {} }) as never)).toEqual({ t: 'deck' });
    expect(tapOf(fake({ '#discard': {} }) as never)).toEqual({ t: 'discard' });
    expect(tapOf(fake({ '#smart-context': {} }) as never)).toEqual({ t: 'end' });
  });
  it('the board between hexes resolves through the map itself', () => {
    expect(tapOf(fake({ '#board': {} }) as never, () => '1,-1')).toEqual({ t: 'hex', key: '1,-1' });
    expect(tapOf(fake({ '#board': {} }) as never, () => null)).toEqual({ t: 'other' });
  });
  it('anything else is not the lesson’s (menus, the window, empty space)', () => {
    expect(tapOf(fake({}) as never)).toEqual({ t: 'other' });
    expect(tapOf(null)).toEqual({ t: 'other' });
  });
});
