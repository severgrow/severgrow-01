// First-time tips for Fruit and Strengthen (v0.5): each shows once, until dismissed, and is
// remembered in the browser. They can be opened again from the "How to play" sheet.
import { OPP, moveWords } from '../../../src/strings.js';
export const TIPS_KEY = 'severgrow.tips.v1';
export type TipId = 'fruit' | 'strengthen' | 'draw';
export type TipsSeen = Record<TipId, boolean>;

export const TIPS: Record<TipId, { title: string; text: string }> = {
  strengthen: {
    title: 'Strengthen',
    text: `A higher card can replace your own tile to make it stronger. It doesn’t score points, but it’s harder for ${OPP.the} to replace. It uses your sprout for the turn, and it doesn’t stop a cut or Fruit.`,
  },
  draw: {
    // shown the first time drawing a line or clump starts (polish pass 3), with a small animated finger
    title: 'Draw it on the board',
    text: 'Drag over hexes to draw your clump or line. On a computer, click to start and click to finish.',
  },
  fruit: {
    title: 'Fruit (once per game)',
    // shown the first time an opponent top-rank tile appears while my Fruit is unused (polish pass 3)
    text: 'Tip: tap it. Fruit can remove tiles no card can beat.',
  },
};

/** A tip's text for this game's version (the Strengthen tip names the Sprout or the Seed). */
export const tipText = (id: TipId, config: { ruleset?: string }): string =>
  id === 'strengthen' ? TIPS.strengthen.text.replace('your sprout for the turn', `your ${moveWords(config).name} for the turn`) : TIPS[id].text;

/** What the browser remembers; anything unreadable counts as "nothing seen yet". */
export const parseTips = (raw: string | null): TipsSeen => {
  try {
    const o = raw ? (JSON.parse(raw) as Partial<TipsSeen>) : {};
    return { fruit: o.fruit === true, strengthen: o.strengthen === true, draw: o.draw === true };
  } catch {
    return { fruit: false, strengthen: false, draw: false };
  }
};

export const markTip = (seen: TipsSeen, id: TipId): TipsSeen => ({ ...seen, [id]: true });
