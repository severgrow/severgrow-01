// First-time tips for Fruit and Strengthen (v0.5): each shows once, until dismissed, and is
// remembered in the browser. They can be opened again from the "How to play" sheet.
import { OPP } from '../../../src/strings.js';
export const TIPS_KEY = 'severgrow.tips.v1';
export type TipId = 'fruit' | 'strengthen';
export type TipsSeen = Record<TipId, boolean>;

export const TIPS: Record<TipId, { title: string; text: string }> = {
  strengthen: {
    title: 'Strengthen',
    text: `A higher card can replace your own tile to make it stronger. It doesn’t score points, but it’s harder for ${OPP.the} to replace. It uses your sprout for the turn, and it doesn’t stop a cut or Fruit.`,
  },
  fruit: {
    title: 'Fruit (once per game)',
    text: `Give up 3 of your tiles that touch each other to remove one ${OPP.noun} tile next to them, whatever its strength: even a 9. Anything cut off from a root goes too, on both sides.`,
  },
};

/** What the browser remembers; anything unreadable counts as "nothing seen yet". */
export const parseTips = (raw: string | null): TipsSeen => {
  try {
    const o = raw ? (JSON.parse(raw) as Partial<TipsSeen>) : {};
    return { fruit: o.fruit === true, strengthen: o.strengthen === true };
  } catch {
    return { fruit: false, strengthen: false };
  }
};

export const markTip = (seen: TipsSeen, id: TipId): TipsSeen => ({ ...seen, [id]: true });
