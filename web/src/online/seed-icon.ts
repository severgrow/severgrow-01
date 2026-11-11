/** The ONE way a Seeds balance is written for the player ("128 SEEDS"), shared by the Territory
 *  wallet and the menu's read-out so the two can never drift apart. */
export const seedBalanceLabel = (balance: number): string => `${balance} SEEDS`;

/**
 * The economy's own noun, for surfaces that need the word on its own (the profile's Seeds line,
 * owner brief 2026-10-21). It lives HERE, beside the balance wording, because this module is the one
 * place the game names the currency to the player: `web/index.html` and `src/strings.ts` must stay
 * free of the word (web/tests/seed-words.test.ts), which is about the removed seed MODE, not the
 * currency the Territory wallet has always written as "128 SEEDS".
 */
export const SEEDS_WORD = 'Seeds';

/**
 * THE PLANET IN SITU (owner brief, 2026-11-11): the level-10 lesson window is retired, because the
 * finish card now shows the planet itself and a window over it would hide the thing it describes.
 * The teaching stays — two short lines under the map, on the won level 10 card only, which is the
 * one moment the player has just been handed Seeds and needs to know what they are for.
 */
export const PLANET_TEACH = Object.freeze({
  title: 'THE PLANET',
  lines: Object.freeze([
    'One world, shared by every player, played in seasons.',
    `Spend ${SEEDS_WORD} to grow tiles. Most land when the season ends wins prizes.`,
  ]),
});

/** The finish card's planet pane: its two honest outcomes from one grown tile. */
export const PLANET_PANE = Object.freeze({
  grown: 'A little place in the world is yours.',
  growFailed: `That tile may have changed. The map has refreshed; no ${SEEDS_WORD} were taken.`,
});

/**
 * A finished game whose replay the server refused (HTTP 400). Those Seeds are gone — the proof is
 * dropped from the queue — so the finish card says so, calmly and once, instead of leaving the
 * player with a line that never arrives or a line that never existed. The refusal's own message is
 * logged with it (`seed-settle.ts`); this is the sentence the player reads.
 */
export const SEEDS_NOT_VERIFIED = `${SEEDS_WORD} for this game could not be verified.`;

/**
 * The device has no usable identity (a blocked store, a failed guest creation, or a token the server
 * rejected and could not replace). The proof is STILL QUEUED — the player is told the truth instead
 * of the card staying silent forever, which is what the settle used to do (owner report, 2026-10-25).
 */
export const SEEDS_IDENTITY_UNVERIFIED = `${SEEDS_WORD} could not be verified - sign in or try again.`;

/** One authored icon at every Seeds size; currentColor keeps the ivory material intact. */
export const seedIcon = (size = 20): SVGSVGElement => {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('seed-icon');
  const add = (tag: string, attributes: Record<string, string>) => {
    const child = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) child.setAttribute(key, value);
    svg.append(child);
  };
  add('path', { d: 'M16 27C8 22 7 16 11 11c3-4 10-5 14-7 0 8-1 15-6 20-1 1-2 2-3 3Z',
    fill: 'currentColor', stroke: '#c9ad70', 'stroke-width': '0.7', 'stroke-linejoin': 'round' });
  add('path', { d: 'M13 21c3-3 6-7 9-12', fill: 'none', stroke: '#536a47', 'stroke-width': '1.6', 'stroke-linecap': 'round' });
  add('path', { d: 'M16 16c-3-2-5-2-7-2', fill: 'none', stroke: '#536a47', 'stroke-width': '1.2', 'stroke-linecap': 'round' });
  return svg;
};
