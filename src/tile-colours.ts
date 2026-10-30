/**
 * THE TERRITORY PALETTE — twenty tile colours, one source of truth (owner, 2026-10-30).
 *
 * "create 20 different colours that would all look good on the map ... make all 20 different from
 * eachother - so they have clear identity and its easy to distinguish."
 *
 * This module is shared: `server/src/seeds/*` assigns and validates a player's colour from it, and
 * `web/src/online/world-view.ts` draws every tile, every swatch and the picker from it. A colour can
 * therefore never disagree between the map and the sheet.
 *
 * WHY THESE TWENTY, AND NOT TWENTY EVENLY SPACED HUES
 * ----------------------------------------------------
 * Evenly spaced HSL hues are the thing that produces look-alikes: HSL's hue angle is not perceptual,
 * so 20 equal steps spend a third of the palette on blue-greens a viewer reads as one colour, and
 * they say nothing about the two deficiency simulations the palette has to survive. These twenty
 * were placed in CIELAB instead — hue family AND lightness AND chroma chosen together — and then
 * checked pairwise with CIEDE2000 under normal vision and under full protanopia and deuteranopia
 * (`src/colour-distance.ts`, and the numbers are pinned in `tests/tile-colours.test.ts`).
 *
 * The rule of thumb that shaped them: red-green deficiency collapses hue onto a blue–yellow axis, so
 * neighbouring hue families are deliberately given DIFFERENT LIGHTNESS (Rose 53% / Ember 63% /
 * Clay 48% / Copper 43%), and the greens — where perception has the most room — are a light ladder
 * (Fern 48% / Moss 62% / Sage 64% / Jade 52% / Lagoon 62% / Glacier 78%).
 *
 * THE IDS ARE APPEND-ONLY. `id` is what the database stores and what a stored player choice means,
 * so an entry may never be reordered or removed; add new colours at the end. A stored id that this
 * build does not know (an older or newer server) is ignored and the derived default is used.
 *
 * ONE MORE CONSTRAINT, FROM THE MAP: a tile is 46 CSS px. Distances below `MIN_DELTA_E` on an area
 * that small stop reading as two colours at a glance, which is the whole point of the palette.
 */

/** A tile colour. `css` is the face; `light`/`dark` are the gradient stops the map already uses. */
export type TileColour = {
  readonly id: number;
  readonly name: string;
  /** The colour as it crosses the wire: `hsl(<h> <s>% <l>%)`, the one shape the map parses. */
  readonly css: string;
  /** `css` one step lighter — the top of a held tile's gradient and of its swatch. */
  readonly light: string;
  /** `css` one step darker — the bottom of a held tile's gradient. */
  readonly dark: string;
};

/**
 * THE FACE LADDER, in lightness points, around the base colour. These are the map's own numbers
 * (a held tile ran 60 → 49 → 34, i.e. +11 / 0 / −15, and your own tiles ran +22 / +8 / −9), kept as
 * offsets so they work for every palette entry rather than only for a base at 49 %.
 */
export const HELD_LIGHT = 11;
export const HELD_DARK = 15;
export const MINE_LIGHT = 22;
export const MINE_MID = 8;
export const MINE_DARK = 9;

/** The empty ground a tile must stand out from (`EMPTY_FACE`'s middle stop in world-view.ts). */
export const MAP_GROUND = 'hsl(150 6% 15%)';

/**
 * `hsl(<h> <s>% <l>%)` with its lightness moved by `delta` points, clamped to a printable 8–96 %.
 * Anything that is not in that shape is returned untouched: an older server may still send its own
 * colour, and a tile must still paint.
 */
export const shiftLightness = (css: string, delta: number): string => {
  const m = /^hsl\(\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/.exec(css.trim());
  if (!m) return css;
  const l = Math.min(96, Math.max(8, Number(m[3]) + delta));
  return `hsl(${m[1]} ${m[2]}% ${Math.round(l)}%)`;
};

const entry = (id: number, name: string, css: string): TileColour => Object.freeze({
  id, name, css, light: shiftLightness(css, HELD_LIGHT), dark: shiftLightness(css, -HELD_DARK),
});

/**
 * TWENTY COLOURS, hue-ordered so neighbours in this list are neighbours on the colour wheel. The
 * order is also what a collision probe walks (`nextFreeColourId`), so a nudged tile lands on an
 * adjacent hue rather than on a random one.
 */
export const TILE_COLOURS: readonly TileColour[] = Object.freeze([
  entry(0, 'Rose', 'hsl(341 42% 53%)'),
  entry(1, 'Ember', 'hsl(4 42% 63%)'),
  entry(2, 'Clay', 'hsl(14 28% 48%)'),
  entry(3, 'Copper', 'hsl(24 58% 43%)'),
  entry(4, 'Sand', 'hsl(36 28% 82%)'),
  entry(5, 'Butter', 'hsl(52 56% 78%)'),
  entry(6, 'Olive', 'hsl(54 56% 48%)'),
  entry(7, 'Fern', 'hsl(78 32% 48%)'),
  entry(8, 'Moss', 'hsl(100 40% 62%)'),
  entry(9, 'Sage', 'hsl(144 36% 64%)'),
  entry(10, 'Jade', 'hsl(162 32% 52%)'),
  entry(11, 'Lagoon', 'hsl(172 30% 62%)'),
  entry(12, 'Glacier', 'hsl(188 38% 78%)'),
  entry(13, 'Slate', 'hsl(195 14% 56%)'),
  entry(14, 'Cobalt', 'hsl(216 74% 53%)'),
  entry(15, 'Navy', 'hsl(232 46% 42%)'),
  entry(16, 'Periwinkle', 'hsl(238 62% 73%)'),
  entry(17, 'Lilac', 'hsl(260 32% 73%)'),
  entry(18, 'Fuchsia', 'hsl(300 40% 50%)'),
  entry(19, 'Plum', 'hsl(320 28% 40%)'),
]);

export const PALETTE_SIZE = TILE_COLOURS.length;
/** The worst pair this palette may contain, in CIEDE2000 units, under EACH of the three visions. */
export const MIN_DELTA_E = 8;

/**
 * ONE COLOUR CHANGE PER 24 HOURS (owner, 2026-10-30: "make sure players can change the color of
 * their tiles - but only once per 24h"). It is a RULE, so it lives beside the palette and the server
 * is its only authority; the client reads the same constant to say how long is left.
 */
export const COLOUR_CHANGE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** When the next change is allowed, from the last stored `chosen_at` (null = never chosen → now). */
export const colourChangeAvailableAt = (chosenAt: number | null): number | null =>
  typeof chosenAt === 'number' && Number.isFinite(chosenAt) ? chosenAt + COLOUR_CHANGE_WINDOW_MS : null;

/** How long is left before another change; 0 when there is no stored choice or the window passed. */
export const colourCooldownMs = (chosenAt: number | null, now: number): number => {
  const at = colourChangeAvailableAt(chosenAt);
  if (at === null) return 0;
  return Math.max(0, at - now);
};

export const isColourId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < PALETTE_SIZE;

/** The colour behind an id. Unknown ids fall back to the first entry rather than throwing on a map. */
export const colourById = (id: number): TileColour =>
  TILE_COLOURS[isColourId(id) ? id : 0]!;

/**
 * A player's DEFAULT colour, derived from their server-held player id: FNV-1a, the same 32-bit hash
 * the map has always used for `territoryColour`, folded into the 20 slots. Pure, so the server and
 * every device agree without storing anything, and the answer is the same on every read — the
 * "random" re-colour of the existing map is this function replacing the old continuous hue space.
 */
export const defaultColourId = (playerId: string): number => {
  let hash = 2166136261;
  for (const character of playerId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) % PALETTE_SIZE;
};

/**
 * A player's colour: the CHOSEN one when they have one, otherwise the derived default. A stored id
 * this build does not know is treated as no choice, so a stale row can never blank a tile. Reading
 * never writes.
 */
export const colourIdFor = (playerId: string, chosen?: number | null): number =>
  isColourId(chosen) ? chosen : defaultColourId(playerId);

/** The wire value for a player: one `hsl()` string, exactly what the palette swatch shows. */
export const colourFor = (playerId: string, chosen?: number | null): string =>
  colourById(colourIdFor(playerId, chosen)).css;

const DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const;

/**
 * The six cells sharing a hex side with `q,r`, as ids. `server/src/world.ts` owns the same six
 * directions for the map itself; `tests/tile-colours.test.ts` holds the two lists together, because
 * `src/` may not import from `server/`.
 */
export const neighbourCellIds = (cellId: string): string[] => {
  const m = /^(-?\d{1,3}),(-?\d{1,3})$/.exec(cellId);
  if (!m) return [];
  const q = Number(m[1]), r = Number(m[2]);
  return DIRECTIONS.map(([dq, dr]) => `${q + dq},${r + dr}`);
};

/** A claim as far as colour is concerned. `chosen` is the owner's stored choice, if any. */
export type ColourClaim = {
  cellId: string;
  ownerId: string;
  /** When the tile was taken. The OLDER claim keeps its colour when two collide. */
  claimedAt: number;
  chosen?: number | null;
};

/**
 * NO TWO ADJACENT TILES OF DIFFERENT OWNERS MAY SHARE A COLOUR — resolved here, purely, for the
 * whole map at once, so the server can settle it once and every device draws the same answer.
 *
 * Two players can derive the same slot (20 slots, many players), and a tile can change hands into
 * a neighbour of the same colour. Rather than re-colour a player's whole territory (which would
 * flicker whenever a stranger appears), the rules are:
 *
 *  1. walk the claims oldest-first, `cellId` breaking ties, so the result is one fixed order;
 *  2. a claim takes its owner's colour unless a neighbour ALREADY PLACED by a different owner has
 *     that colour;
 *  3. if it does, step forward through the palette (hue-adjacent, see the list order) to the first
 *     slot no placed neighbour uses.
 *
 * The oldest claim therefore never loses its colour to a newer one, and an unchanged map always
 * resolves to an unchanged answer (that is the no-flicker guarantee: the function is pure in the
 * claims).
 */
export const resolveTileColours = (claims: readonly ColourClaim[]): Map<string, number> => {
  const order = [...claims].sort((a, b) =>
    a.claimedAt - b.claimedAt || (a.cellId < b.cellId ? -1 : a.cellId > b.cellId ? 1 : 0));
  const placed = new Map<string, { ownerId: string; colourId: number }>();
  const resolved = new Map<string, number>();
  for (const claim of order) {
    const wanted = colourIdFor(claim.ownerId, claim.chosen);
    const used = new Set<number>();
    for (const id of neighbourCellIds(claim.cellId)) {
      const other = placed.get(id);
      if (other && other.ownerId !== claim.ownerId) used.add(other.colourId);
    }
    let pick = wanted;
    for (let step = 0; step < PALETTE_SIZE && used.has(pick); step++) pick = (wanted + step + 1) % PALETTE_SIZE;
    placed.set(claim.cellId, { ownerId: claim.ownerId, colourId: pick });
    resolved.set(claim.cellId, pick);
  }
  return resolved;
};
