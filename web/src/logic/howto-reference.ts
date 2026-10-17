// The moves reference: every move a player can make, in the game's own rule words.
// One source of truth for the Match Intel "How to" tab (FUTASAKU) and the legacy How-to-play
// sheet (older channels). The rule sentences come from src/strings.ts (SPROUT / BLOOM / FRUIT /
// BLAST / HOME) — this file only arranges them, so the words never drift from the real rules.
import type { RulesConfig } from '../../../src/engine/index.js';
import { BLAST, BLOOM, FRUIT, HOME, OPP, SPROUT } from '../../../src/strings.js';
import { TIPS } from './tips.js';

/** The reference body as HTML. Pure: it reads only the rules config, never game state. */
export const howToReferenceHtml = (config?: RulesConfig): string => {
  const sprout = (config?.sproutsPerTurn ?? 1) > 0;
  const words = SPROUT;
  const limit = config && config.maxTurnsPerPlayer > 0 ? ` or after ${config.maxTurnsPerPlayer} turns each` : '';
  return [
    `<p><b>Goal:</b> surround ${OPP.theirs} home, or have more points when the Draw pile runs out. Each tile scores 1 point, or 2 on a gold hex.</p>`,
    '<p><b>Your turn:</b> draw a card, play cards to grow tiles, then throw one card.</p>',
    `<p><b>Grow:</b>${BLOOM.howto}${sprout ? words.howto : ''}</p>`,
    `<p><b>Painting a bloom:</b> ${TIPS.draw.text} For numbers in a row, the lowest goes on the first hex you paint; “Reverse” flips it. <button type="button" class="link" data-tip="draw">Show tip</button></p>`,
    `<p><b>Strength:</b> a tile is as strong as its card. A stronger tile can overgrow a weaker ${OPP.noun} tile.</p>`,
    ...(config?.allowStrengthen ?? true
      ? [`<p><b>Strengthen:</b> a higher card can strengthen your own tile. It doesn’t score points, but it’s harder for ${OPP.the} to overgrow. It uses your ${words.name} for the turn, and it doesn’t stop a cut or Bomb. ${words.strengthenExample} <button type="button" class="link" data-tip="strengthen">Show tip</button></p>`]
      : []),
    ...((config?.fruitCardCount ?? 4) > 0
      ? [`<p>${FRUIT.howto.trim()} <i>Example: an ${OPP.noun} 9 blocks your way; play a Bomb on it and the 9 is gone, with everything that hung on it.</i> <button type="button" class="link" data-tip="fruit">Show tip</button></p>`]
      : []),
    `<p>${BLAST.howto.trim()}</p>`,
    '<p><b>Stay joined:</b> every tile must link back to your home (your tree). Lose a link and everything past it is cut off: tiles cut off from your home wither.</p>',
    `<p><b>Win early:</b> ${HOME.surround.charAt(0).toLowerCase()}${HOME.surround.slice(1)}: every open side of their home becomes yours. (A home in a corner has fewer sides to take.)</p>`,
    `<p><b>The end:</b> when the Draw pile runs out, both players finish with equal turns${limit}. Higher score wins; equal scores go to the stronger tiles, then a real draw.</p>`,
    '<p class="legend"><span class="lg lg-gold">2</span> gold hex (×2) · <span class="lg lg-coach"></span> coach tip · <span class="lg lg-ghost"></span> preview · <span class="lg lg-weak">−4</span> weak link</p>',
    '<p class="legend">A bushier tile or hotter lava means a stronger tile.</p>',
    '<p class="muted">Tap a card to see where it can go. Tap or hold a tile to see what it is worth.</p>',
    '<p class="muted"><b>Keyboard:</b> D draws from the Draw pile, T takes the Throw pile, 1-9 pick cards, Tab to the board then arrows and Enter to paint, Backspace removes the last hex, U undoes, Esc cancels.</p>',
  ].join('');
};
