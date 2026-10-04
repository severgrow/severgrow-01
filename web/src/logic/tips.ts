// First-time tips for Fruit cards and Strengthen: each shows once, until dismissed, and is
// remembered in the browser. They can be opened again from the "How to play" sheet.
// `fruitAny` only remembers that the "any strength" hint was shown once.
import { FRUIT, OPP } from '../../../src/strings.js';
export const TIPS_KEY = 'severgrow.tips.v1';
export type TipId = 'fruit' | 'strengthen' | 'draw';
export type TipsSeen = Record<TipId | 'fruitAny', boolean>;

export const TIPS: Record<TipId, { title: string; text: string }> = {
  strengthen: {
    title: 'Strengthen',
    text: `A higher card can replace your own tile to make it stronger. It doesn’t score points, but it’s harder for ${OPP.the} to replace. It uses your sprout for the turn, and it doesn’t stop a cut or a Fruit card.`,
  },
  draw: {
    // shown the first time painting a Bloom starts, with a small animated finger painting a cluster
    title: 'Paint your bloom',
    text: 'Paint your bloom: drag over touching hexes, or tap them one by one. On a computer, click to start and click to finish.',
  },
  fruit: {
    title: FRUIT.cards,
    // shown the first time I hold a Fruit card in my Grow step (v0.6)
    text: FRUIT.tip,
  },
};


/** What the browser remembers; anything unreadable counts as "nothing seen yet". */
export const parseTips = (raw: string | null): TipsSeen => {
  try {
    const o = raw ? (JSON.parse(raw) as Partial<TipsSeen>) : {};
    return { fruit: o.fruit === true, strengthen: o.strengthen === true, draw: o.draw === true, fruitAny: o.fruitAny === true };
  } catch {
    return { fruit: false, strengthen: false, draw: false, fruitAny: false };
  }
};

export const markTip = (seen: TipsSeen, id: TipId | 'fruitAny'): TipsSeen => ({ ...seen, [id]: true });
