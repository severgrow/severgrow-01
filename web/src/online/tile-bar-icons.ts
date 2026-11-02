/**
 * THE TILE BAR'S ICONS (owner, 2026-11-01: "grow a tile/challenge/sell a tile/see profile etc in
 * territory should be all icons in buttons rather than text buttons").
 *
 * Drawn in the SAME stroke vocabulary as the MENU row's keys — a 24-unit grid, `.line` at 1.5 and
 * `currentColor` — so the bar's keys and the row's keys are one hardware family. Each action has a
 * DIFFERENT OUTER SILHOUETTE, because these are read at 20 px on a phone and must not collapse into
 * similar blobs:
 *
 *   grow    a sprout on a ground line — a thin vertical stem with two opposed leaves (organic,
 *           tall, nothing round);
 *   sell    a coin with a plus — one bold circle, the currency the player receives (round, centred,
 *           symmetric);
 *   challenge  the map's own crossed swords (diagonal, filled) — the mark already drawn on a
 *           contested tile, so one glyph means challenge everywhere;
 *   profile a head over shoulders — the only open, human silhouette;
 *   confirm a single tick — shown ONLY while a grow/sell key is armed, so the second press reads as
 *           an answer rather than the same action again.
 *
 * `web/tests/tile-bar-icons.test.ts` pins the set and the distinctness; the browser suite measures
 * the keys at their real 44 px size and checks the spoken labels.
 */
import { SWORD_PATH } from './swords-glyph.js';

const KEY_ICON = (body: string, viewBox = '0 0 24 24'): string =>
  `<svg class="world-key-icon" viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

export const TILE_BAR_ICONS = {
  grow: KEY_ICON('<path class="line" d="M12 20.6V10.8"/>' +
    '<path class="line" d="M12 13.4c0-3.5 2.7-5.7 6.5-5.7 0 3.7-2.8 5.7-6.5 5.7Z"/>' +
    '<path class="line" d="M12 15.8c0-2.8-2.2-4.5-5.3-4.5 0 3 2.2 4.5 5.3 4.5Z"/>' +
    '<path class="line" d="M7 20.6h10"/>'),
  sell: KEY_ICON('<circle class="line" cx="12" cy="12" r="8.2"/>' +
    '<path class="line" d="M12 7.9v8.2M7.9 12h8.2"/>'),
  challenge: KEY_ICON(`<path class="fill" d="${SWORD_PATH}"/>`, '-7.6 -7.6 15.2 15.2'),
  profile: KEY_ICON('<circle class="line" cx="12" cy="8.2" r="3.5"/>' +
    '<path class="line" d="M4.9 20.1c.5-3.9 3.3-6.1 7.1-6.1s6.6 2.2 7.1 6.1"/>'),
  confirm: KEY_ICON('<path class="line" d="M5.2 12.7l4.4 4.3L18.8 7.2"/>'),
} as const;

export type TileBarIconName = keyof typeof TILE_BAR_ICONS;
