// The moves reference: every move a player can make, in the game's own rule words.
// One source of truth for the Match Intel "How to" tab (FUTASAKU) and the legacy How-to-play
// sheet (older channels). The rule sentences come from src/strings.ts (SPROUT / BLOOM / FRUIT /
// BLAST / HOME) — this file only arranges them, so the words never drift from the real rules.
import type { RulesConfig } from '../../../src/engine/index.js';
import { BLAST, BLOOM, FRUIT, HOME, OPP, SPROUT } from '../../../src/strings.js';
import { t } from '../../../src/i18n/index.js';
import { TIPS } from './tips.js';

/** The reference body as HTML. Pure: it reads only the rules config, never game state. */
export const howToReferenceHtml = (config?: RulesConfig): string => {
  const sprout = (config?.sproutsPerTurn ?? 1) > 0;
  const words = SPROUT;
  const limit = config && config.maxTurnsPerPlayer > 0
    ? t('ui.howto.limit', ' or after {n} turns each', { n: config.maxTurnsPerPlayer })
    : '';
  const tipButton = `<button type="button" class="link" data-tip="draw">${t('ui.howto.showTip', 'Show tip')}</button>`;
  const strengthTip = `<button type="button" class="link" data-tip="strengthen">${t('ui.howto.showTip', 'Show tip')}</button>`;
  const fruitTip = `<button type="button" class="link" data-tip="fruit">${t('ui.howto.showTip', 'Show tip')}</button>`;
  return [
    t('ui.howto.goal', '<p><b>Goal:</b> surround {opp} home, or have more points when the Draw pile runs out. Each tile scores 1 point, or 2 on a gold hex.</p>', { opp: OPP.theirs }),
    t('ui.howto.turn', '<p><b>Your turn:</b> draw a card, play cards to grow tiles, then throw one card.</p>'),
    `<p><b>${t('ui.howto.growHeading', 'Grow')}:</b>${BLOOM.howto}${sprout ? words.howto : ''}</p>`,
    t('ui.howto.painting', '<p><b>Painting a bloom:</b> {tip} For numbers in a row, the lowest goes on the first hex you paint; “Reverse” flips it. {button}</p>', { tip: TIPS.draw.text, button: tipButton }),
    t('ui.howto.strength', '<p><b>Strength:</b> a tile is as strong as its card. A stronger tile can overgrow a weaker {opp} tile.</p>', { opp: OPP.noun }),
    ...(config?.allowStrengthen ?? true
      ? [t('ui.howto.strengthen', '<p><b>Strengthen:</b> a higher card can strengthen your own tile. It doesn’t score points, but it’s harder for {opp} to overgrow. It uses your {grow} for the turn, and it doesn’t stop a cut or Bomb. {example} {button}</p>', { opp: OPP.the, grow: words.name, example: words.strengthenExample, button: strengthTip })]
      : []),
    ...((config?.fruitCardCount ?? 4) > 0
      ? [t('ui.howto.fruit', '<p>{howto} <i>Example: an {opp} 9 blocks your way; play a Bomb on it and the 9 is gone, with everything that hung on it.</i> {button}</p>', { howto: FRUIT.howto.trim(), opp: OPP.noun, button: fruitTip })]
      : []),
    `<p>${BLAST.howto.trim()}</p>`,
    t('ui.howto.stayJoined', '<p><b>Stay joined:</b> every tile must link back to your home (your tree). Lose a link and everything past it is cut off: tiles cut off from your home wither.</p>'),
    t('ui.howto.winEarly', '<p><b>Win early:</b> {surround}: every open side of their home becomes yours. (A home in a corner has fewer sides to take.)</p>', { surround: HOME.surround.charAt(0).toLowerCase() + HOME.surround.slice(1) }),
    t('ui.howto.end', '<p><b>The end:</b> when the Draw pile runs out, both players finish with equal turns{limit}. Higher score wins; equal scores go to the stronger tiles, then a real draw.</p>', { limit }),
    t('ui.howto.legend', '<p class="legend"><span class="lg lg-gold">2</span> gold hex (×2) · <span class="lg lg-coach"></span> coach tip · <span class="lg lg-ghost"></span> preview · <span class="lg lg-weak">−4</span> weak link</p>'),
    t('ui.howto.legend2', '<p class="legend">A bushier tile or hotter lava means a stronger tile.</p>'),
    t('ui.howto.muted1', '<p class="muted">Tap a card to see where it can go. Tap or hold a tile to see what it is worth.</p>'),
    t('ui.howto.muted2', '<p class="muted"><b>Keyboard:</b> D draws from the Draw pile, T takes the Throw pile, 1-9 pick cards, Tab to the board then arrows and Enter to paint, Backspace removes the last hex, U undoes, Esc cancels.</p>'),
  ].join('');
};
