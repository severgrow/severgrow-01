// "NO ROOM" FOR A BLOOM (tester report, 2026-10-27).
//
// A Bloom needs two things: cards that go together (a set or a run) AND room on the board — that
// many connected hexes, touching my network, each one I can claim with the card it gets. When the
// cards fit but the board does not, the engine simply offers no Bloom, and the hand treats the cards
// as ordinary single cards. A player who tapped three 2s and saw nothing happen read that silence as
// a bug. This names the situation so the display can say why.
import { bloomGroups } from '../../../src/engine/index.js';
import type { Action, Card, View } from '../../../src/engine/index.js';

const sameFace = (a: Card, b: Card): boolean => a.suit === b.suit && a.rank === b.rank;

/**
 * When `cardId` belongs to a Bloom-shaped group in my hand but no legal Bloom uses a card of its
 * face, the size of the smallest such group ("no room to bloom 3"). Otherwise null — no group, or
 * there is room and the Bloom is offered as usual. Reads only; never changes the move.
 */
export const bloomNoRoom = (view: View, legal: readonly Action[], cardId: number): number | null => {
  const card = view.hand.find((c) => c.id === cardId);
  if (!card || card.suit === null) return null;
  const groups = bloomGroups(view.hand, view.config.expandedBloom !== false).filter((g) =>
    g.cards.some((c) => sameFace(c, card)),
  );
  if (!groups.length) return null;
  const roomForIt = legal.some(
    (a) => a.t === 'Bloom' && a.cards.some((id) => {
      const other = view.hand.find((c) => c.id === id);
      return !!other && sameFace(other, card);
    }),
  );
  if (roomForIt) return null;
  return Math.min(...groups.map((g) => g.cards.length));
};
