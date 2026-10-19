// THE LESSON ON SCREEN — the light as CSS targets and a highlight shape, and a tap as a lesson tap.
// No drawing here: the glass window (player/glass-surface.ts) paints; this only says what and where.
import type { FocusShape } from '../player/glass-surface.js';
import type { Tap } from './answer.js';
import type { Lit } from './lessons.js';

const hexSel = (key: string) => `#board .hex-cell[data-key="${key}"]`;
const cardSel = (id: number) => `#hand .card[data-card="${id}"]`;

/** What to light and in which outline: a hex as a hex, a card as a card, piles and buttons as pills. */
export const litTarget = (lit: Lit, homes: readonly [string, string]): { selectors: string[]; shape: FocusShape } => {
  switch (lit.t) {
    case 'hex': return { selectors: [hexSel(lit.key)], shape: 'hex' };
    case 'hexes': return { selectors: lit.keys.map(hexSel), shape: 'hex' };
    case 'home': return { selectors: [hexSel(homes[lit.player])], shape: 'hex' };
    case 'rock': return { selectors: [hexSel(lit.key)], shape: 'hex' };
    case 'card': return { selectors: [cardSel(lit.id)], shape: 'card' };
    case 'cards': return { selectors: lit.ids.map(cardSel), shape: 'card' };
    case 'deck': return { selectors: ['#deck'], shape: 'pill' };
    case 'deckCount': return { selectors: ['#deck .pile-card', '#deck-count'], shape: 'pill' };
    case 'score': return { selectors: ['#smart-led'], shape: 'pill' };
    case 'discard': return { selectors: ['#discard'], shape: 'pill' };
    case 'end': return { selectors: ['#smart-context'], shape: 'pill' };
    case 'bloom': return { selectors: ['#smart-bloom-button'], shape: 'pill' };
    default: return { selectors: [], shape: 'none' };
  }
};

type Closest = { closest: (sel: string) => { getAttribute: (k: string) => string | null } | null };

/** The lesson's reading of a tap on this element. `keyAt` resolves a tap on the map between paths. */
export const tapOf = (el: Closest | null, keyAt: () => string | null = () => null): Tap => {
  if (!el || typeof el.closest !== 'function') return { t: 'other' };
  const card = el.closest('#hand [data-card]');
  if (card) return { t: 'card', id: Number(card.getAttribute('data-card')) };
  if (el.closest('#deck')) return { t: 'deck' };
  if (el.closest('#discard')) return { t: 'discard' };
  if (el.closest('#smart-context, #moves .end, #moves .futa04-skip')) return { t: 'end' };
  const hex = el.closest('#board [data-key]');
  const key = hex?.getAttribute('data-key');
  if (key) return { t: 'hex', key };
  if (el.closest('#board')) {
    const at = keyAt();
    return at ? { t: 'hex', key: at } : { t: 'other' };
  }
  return { t: 'other' };
};
