// A small nature icon for each bot level, drawn as SVG line art (no images). They grow
// as the level rises: a seedling, a sprig, clover, moss, a fern, ivy, an oak, an elder
// tree with roots, and an ancient tree with a wide crown and deep roots.
import type { Level } from '../../../src/bots/levels.js';

const svg = (body: string) =>
  `<svg viewBox="0 0 32 32" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const soft = 'fill="currentColor" fill-opacity=".18"';

export const LEVEL_ICONS: Record<Level, string> = {
  // 1 Seedling: two small leaves on a short stem
  1: svg(`<path d="M16 27v-9"/><path d="M16 18c-1-4-4.5-5.5-8-5 .5 3.8 3.6 5.6 8 5z" ${soft}/><path d="M16 18c1-3.4 3.8-4.8 7-4.4-.4 3.4-3 4.9-7 4.4z" ${soft}/><path d="M11 27h10"/>`),
  // 2 Sprig: a thin stem with three leaves
  2: svg(`<path d="M16 28c0-7 .5-14 3-21"/><path d="M16.6 20c-3.5-.5-5.6-2.7-6-6 3.3.3 5.5 2.4 6 6z" ${soft}/><path d="M17.3 14.5c2.8-1.4 5.4-1.1 7 .8-2.6 1.6-5 1.3-7-.8z" ${soft}/><path d="M18.6 8.6c-2.3-1.2-3.2-3.2-2.6-5.6 2.4.9 3.3 3 2.6 5.6z" ${soft}/>`),
  // 3 Clover: three round leaflets
  3: svg(`<path d="M16 17c0 4-1 8-3 11"/><circle cx="16" cy="10" r="4.5" ${soft}/><circle cx="11" cy="16.5" r="4.5" ${soft}/><circle cx="21" cy="16.5" r="4.5" ${soft}/>`),
  // 4 Moss: a soft mound with little tufts
  4: svg(`<path d="M4 25c2-6 6-9 12-9s10 3 12 9z" ${soft}/><path d="M9 19v-3M9 16l-1.5-1.5M9 16l1.5-1.5M16 16v-4M16 12l-1.6-1.6M16 12l1.6-1.6M23 19v-3M23 16l-1.5-1.5M23 16l1.5-1.5"/>`),
  // 5 Fern: a curving frond with leaflets
  5: svg(`<path d="M9 28c3-6 6-12 13-21"/><path d="M12.2 22.6l-5-1.4M12.2 22.6l2.2-4.6M14.8 18.5l-5-1.6M14.8 18.5l2.6-4.2M17.4 14.8l-4.6-1.8M17.4 14.8l2.8-3.6M19.8 11.4l-3.8-1.6M19.8 11.4l2.6-2.8"/>`),
  // 6 Ivy: a winding vine with heart-shaped leaves
  6: svg(`<path d="M6 28c4-3 2-8 7-10s4-8 9-10 4-3 4-3"/><path d="M8 21c-3 0-4-2.5-3-4.5 1.5.2 3 1 3 4.5z" ${soft}/><path d="M15 15c0-3 2-4.5 4.5-4 0 2.4-1.5 4-4.5 4z" ${soft}/><path d="M21 22c2.6-1.2 4.8-.3 5.4 1.8-2.2 1-4.4.4-5.4-1.8z" ${soft}/><path d="M18 19.5c2-1 3.5 0 3 2"/>`),
  // 7 Oak: a round crown on a sturdy trunk
  7: svg(`<path d="M16 28v-9M16 22l-3-3M16 21l3-2.5"/><path d="M9 17a5 5 0 0 1 1-9 6 6 0 0 1 11.5-.5A5 5 0 0 1 23 17z" ${soft}/><path d="M11 28h10"/>`),
  // 8 Elder: a broad, layered crown and spreading roots
  8: svg(`<path d="M16 26v-8M16 21l-4-3.5M16 20l4-3"/><path d="M6.5 17a4.5 4.5 0 0 1 2-8.2A7 7 0 0 1 22 6.6a4.8 4.8 0 0 1 3.4 10.4z" ${soft}/><path d="M16 26c-2 0-4 1-6 2.5M16 26c2 0 4 1 6 2.5M16 26v2.5"/>`),
  // 9 Ancient: a wide, gnarled crown, a thick trunk with a ring, and deep roots
  9: svg(`<path d="M14 25v-7c0-2-2-3-3-4M18 25v-7c0-2 2-3 3-4M16 18v-3"/><path d="M4 14a5 5 0 0 1 4.5-6.5A7.5 7.5 0 0 1 22 4.5a6 6 0 0 1 6 9.5c-3 1.2-21 1.2-24 0z" ${soft}/><circle cx="16" cy="22" r="1.2"/><path d="M14 25c-2.5.3-5 1.6-7.5 3.5M18 25c2.5.3 5 1.6 7.5 3.5M15 25.5l-1.5 3M17 25.5l1.5 3"/>`),
};
