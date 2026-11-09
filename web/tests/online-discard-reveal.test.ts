import { describe, expect, it } from 'vitest';
import { createCards, newGame, viewFor } from '../../src/engine/index.js';
import { stepsFromEvents } from '../src/online/steps-from-events.js';
import { onlinePerspective } from '../src/online/perspective.js';

describe('public opponent discard animation', () => {
  for (const seat of [0, 1] as const) it(`reconstructs only the publicly discarded card for seat ${seat}`, () => {
    const view = viewFor(newGame(42), seat);
    const cards = createCards(view.config);
    for (const card of [cards.find(c => c.suit !== null)!, cards.find(c => c.suit === null)!]) {
      const steps = stepsFromEvents([{ t: 'Discard', player: seat === 0 ? 1 : 0, card: card.id }], onlinePerspective(seat), view);
      expect(steps).toEqual([{ k: 'discard', player: 1, card }]);
    }
    expect(stepsFromEvents([{ t: 'Discard', player: seat, card: -999 }], onlinePerspective(seat), view)).toEqual([]);
    expect(stepsFromEvents([{ t: 'Draw', player: seat === 0 ? 1 : 0, from: 'deck', card: cards[0]!.id }], onlinePerspective(seat), view))
      .toEqual([{ k: 'draw', player: 1, from: 'deck' }]);
  });
});
