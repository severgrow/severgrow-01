// THE ART LAB'S SLOTS: every picture and setting a designer can supply, with the rules the game's own
// renderers need. Sizes come from the code, never guesses:
//  - board textures and hex art: the skin tiers (SKIN_TIERS, the same numbers as the skin system's
//    `tiers`: a hex is `hexPx` across in that tier, a seamless texture `texPx`), and board units
//    (a hex is 60 board units corner to corner, ui/geom.ts S = 30);
//  - cards: today's files (a suit face is a 3x3 sheet of nine 256x356 cards, one per number:
//    player/cards.ts places rank r at column (r-1)%3, row floor((r-1)/3));
//  - planet: the lab's own textured planet (sphere/renderer.ts `textures`), 512 px seamless squares.
// Pure data and arithmetic: no DOM, so the rules are unit-tested (web/tests/art-lab-slots.test.ts).
import type { Tier } from '../ui/skin/types.js';

/** A hex is 60 board units corner to corner (ui/geom.ts S = 30). */
export const HEX_UNITS = 60;
/** The skin tiers the pack is made in (the skin system's `tiers`). */
export const SKIN_TIERS: Record<Tier, { hexPx: number; texPx: number }> = { lo: { hexPx: 256, texPx: 1024 }, hi: { hexPx: 512, texPx: 2048 } };
export const TIERS: readonly Tier[] = ['lo', 'hi'];
/** Board units one seamless ground texture spans (about four hexes across). */
export const WORLD_UNITS = 360;
/** One card, and a suit's sheet of nine. */
export const CARD = { w: 256, h: 356 } as const;
export const CARD_SHEET = { w: CARD.w * 3, h: CARD.h * 3 } as const;
export const PLANET_PX = 512;

/** What a phone downloads for the lo tier, KB: a warning, then "too heavy for phones". */
export const BUDGET = { warnKB: 2500, maxKB: 4000 } as const;

export type Group = 'board' | 'cards' | 'planet';
export type Alpha = 'required' | 'forbidden' | 'optional';
export type Shape = 'square' | 'hex' | 'card' | 'card-sheet' | 'strip' | 'svg';

export type Rule = {
  shape: Shape;
  /** pixel size per tier (square unless `aspect`); cards and planet have one size (`lo` = `hi`) */
  px: Record<Tier, number>;
  /** width / height (1 for squares) */
  aspect: number;
  alpha: Alpha;
  /** tiles with itself: checked for hard edges */
  seamless?: boolean;
  /** made per tier (board art) or once (cards, planet) */
  tiered: boolean;
  /** budget per file, lo tier, KB */
  budgetKB: number;
};

export type Setting =
  | { key: string; label: string; type: 'colour'; default: string }
  | { key: string; label: string; type: 'range'; min: number; max: number; step: number; default: number; unit?: string }
  | { key: string; label: string; type: 'select'; options: readonly string[]; default: string }
  | { key: string; label: string; type: 'toggle'; default: boolean };

export type Slot = {
  id: string;
  group: Group;
  /** the brief's number (1-17), so the owner and the designer talk about the same thing */
  n: number;
  title: string;
  /** one sentence: where it appears in the game */
  where: string;
  rule: Rule;
  /** how many files: one, or a set (min..max); files in a set may carry their own settings */
  count: { min: number; max: number };
  optional: boolean;
  /** the file's path in the pack (relative to a tier folder for tiered art) */
  path: (i: number, name?: string) => string;
  /** settings for the whole slot */
  settings: readonly Setting[];
  /** settings each file of a set carries (props, home layers) */
  fileSettings?: readonly Setting[];
};

/** Pixels for a sprite drawn `units` board units across, in a tier (even, at least 16). */
export const spritePx = (units: number, tier: Tier) => Math.max(16, 2 * Math.ceil((units * SKIN_TIERS[tier].hexPx) / HEX_UNITS / 2));

const tex = (budgetKB: number): Rule => ({ shape: 'square', px: { lo: SKIN_TIERS.lo.texPx, hi: SKIN_TIERS.hi.texPx }, aspect: 1, alpha: 'forbidden', seamless: true, tiered: true, budgetKB });
const hex = (budgetKB: number): Rule => ({ shape: 'hex', px: { lo: SKIN_TIERS.lo.hexPx, hi: SKIN_TIERS.hi.hexPx }, aspect: 1, alpha: 'required', tiered: true, budgetKB });
const sprite = (units: number, budgetKB: number): Rule => ({ shape: 'square', px: { lo: spritePx(units, 'lo'), hi: spritePx(units, 'hi') }, aspect: 1, alpha: 'required', tiered: true, budgetKB });
const once = (shape: Shape, w: number, h: number, alpha: Alpha, budgetKB: number, seamless = false): Rule => ({ shape, px: { lo: w, hi: w }, aspect: w / h, alpha, tiered: false, budgetKB, ...(seamless ? { seamless } : {}) });

const PLAYER = ['Player 1', 'Player 2'] as const;
const P = ['p1', 'p2'] as const;
const ANIMS = ['none', 'sway', 'pulse'] as const;
const HOME_ANIMS = ['none', 'sway', 'pulse', 'drift', 'glow', 'firefly', 'breathe'] as const;
const DEFAULT_COLOURS = [
  { ink: '#f3ead2', plate: '#2f5a32', outline: '#16261a', body: '#7fcf8d', glow: '#b8f0a8', proxy: '#2f5a32', overlay: '#4f8a3c' },
  { ink: '#f6e2d6', plate: '#4a2420', outline: '#200d0b', body: '#ee7d73', glow: '#ffb08a', proxy: '#2c2523', overlay: '#8f2212' },
] as const;

const playerSlots = (p: 0 | 1): Slot[] => {
  const id = P[p], who = PLAYER[p], c = DEFAULT_COLOURS[p];
  const base = p === 0 ? 4 : 5;
  return [
    { id: `${id}-tiles`, group: 'board', n: base, title: `${who} land: painted tiles`, where: `${who}'s hexes: each picture stands for a strength (1 weakest, 9 strongest), the nearest painted strength is used for the rest, and several at one strength are mixed by position (today's look: nine at strength 1).`,
      rule: hex(40), count: { min: 0, max: 18 }, optional: true, path: (i, name) => `tiles/${id}/${name ?? `s${Math.min(9, i + 1)}_${String(i + 1).padStart(2, '0')}`}.webp`, settings: [],
      fileSettings: [{ key: 'strength', label: 'Strength it stands for', type: 'range', min: 1, max: 9, step: 1, default: 1 }] },
    { id: `${id}-base`, group: 'board', n: base, title: `${who} land: ground texture`, where: `Under ${who}'s whole territory as one continuous painting (a second texture is blended in patches).`,
      rule: tex(260), count: { min: 0, max: 2 }, optional: true, path: (i) => `textures/${id}_ground_${'ab'[i]}.webp`,
      settings: [{ key: 'proxy', label: 'Fallback colour', type: 'colour', default: c.proxy }, { key: 'worldUnits', label: 'Texture spans (board units)', type: 'range', min: 120, max: 720, step: 20, default: WORLD_UNITS }] },
    { id: `${id}-overlay`, group: 'board', n: base, title: `${who} land: strength overlay`, where: `Shows through more as a tile grows stronger (lush growth, hot rock).`,
      rule: tex(260), count: { min: 0, max: 1 }, optional: true, path: () => `textures/${id}_overlay.webp`,
      settings: [{ key: 'overlayProxy', label: 'Overlay fallback colour', type: 'colour', default: c.overlay }, { key: 'clarity', label: 'Calm under the number', type: 'range', min: 0, max: 1, step: 0.05, default: 0.7 }] },
    { id: `${id}-props`, group: 'board', n: 6, title: `${who} strength props`, where: `Small sprites scattered on ${who}'s hexes (plants, rocks); each appears from its lowest strength.`,
      rule: sprite(22, 12), count: { min: 0, max: 16 }, optional: true, path: (i, name) => `props/${id}/${name ?? `prop_${String(i + 1).padStart(2, '0')}`}.webp`, settings: [],
      fileSettings: [{ key: 'size', label: 'Size (board units)', type: 'range', min: 6, max: 60, step: 1, default: 18 }, { key: 'minStrength', label: 'Appears from strength', type: 'range', min: 1, max: 9, step: 1, default: 1 }, { key: 'anim', label: 'Motion', type: 'select', options: ANIMS, default: 'none' }] },
    { id: `${id}-cutoff`, group: 'board', n: 7, title: `${who} cut-off look`, where: `${who}'s tiles cut off from their home: a tint, plus optional wilted / ash props.`,
      rule: sprite(12, 8), count: { min: 0, max: 8 }, optional: true, path: (i) => `states/${id}_cutoff_props/cut_${String(i + 1).padStart(2, '0')}.webp`,
      settings: [{ key: 'desaturate', label: 'Desaturate', type: 'range', min: 0, max: 1, step: 0.05, default: 0.55 }, { key: 'darken', label: 'Darken', type: 'range', min: 0, max: 1, step: 0.05, default: 0.3 },
        { key: 'warm', label: 'Warm / cool shift', type: 'range', min: -1, max: 1, step: 0.05, default: 0 }, { key: 'cutoffSize', label: 'Prop size (board units)', type: 'range', min: 6, max: 40, step: 1, default: 12 }] },
    { id: `${id}-scar`, group: 'board', n: 8, title: `${who} scar`, where: `Left on the ground where ${who} lost a tile to a Bomb or Blast (fades over three turns).`,
      rule: hex(30), count: { min: 0, max: 1 }, optional: true, path: () => `fx/${id}_scar.webp`, settings: [] },
    { id: `${id}-home`, group: 'board', n: 9, title: `${who} home`, where: `${who}'s home hex: layered pictures (a base, then glows, smoke or fireflies).`,
      rule: sprite(64, 40), count: { min: 0, max: 6 }, optional: false, path: (i) => `homes/${id}_home_${String(i + 1).padStart(2, '0')}.webp`, settings: [],
      fileSettings: [{ key: 'size', label: 'Size (board units)', type: 'range', min: 20, max: 90, step: 1, default: 64 }, { key: 'dx', label: 'Nudge across', type: 'range', min: -20, max: 20, step: 1, default: 0 },
        { key: 'dy', label: 'Nudge down', type: 'range', min: -20, max: 20, step: 1, default: 0 }, { key: 'opacity', label: 'Opacity', type: 'range', min: 0.1, max: 1, step: 0.05, default: 1 },
        { key: 'anim', label: 'Motion', type: 'select', options: HOME_ANIMS, default: 'none' }, { key: 'turn', label: 'Hex picture (turns with the board)', type: 'toggle', default: true }] },
    { id: `${id}-links`, group: 'board', n: 10, title: `${who} links`, where: `The paths joining ${who}'s tiles back to their home.`,
      rule: { shape: 'strip', px: { lo: 256, hi: 512 }, aspect: 4, alpha: 'required', tiered: true, budgetKB: 20 }, count: { min: 0, max: 1 }, optional: true, path: () => `network/${id}/strip.webp`,
      settings: [{ key: 'outline', label: 'Outline', type: 'colour', default: c.outline }, { key: 'body', label: 'Body', type: 'colour', default: c.body }, { key: 'glow', label: 'Glow', type: 'colour', default: c.glow },
        { key: 'thin', label: 'Thin width', type: 'range', min: 0.5, max: 8, step: 0.5, default: 2 }, { key: 'normal', label: 'Normal width', type: 'range', min: 1, max: 10, step: 0.5, default: 3.5 }, { key: 'heavy', label: 'Heavy width', type: 'range', min: 1.5, max: 14, step: 0.5, default: 5.5 }] },
    { id: `${id}-numbers`, group: 'board', n: 11, title: `${who} number plates`, where: `The strength number on every ${who} tile and the soft plate behind it.`,
      rule: once('svg', 1, 1, 'optional', 0), count: { min: 0, max: 0 }, optional: false, path: () => '', settings: [
        { key: 'ink', label: 'Number ink', type: 'colour', default: c.ink }, { key: 'plate', label: 'Plate', type: 'colour', default: c.plate }, { key: 'plateAlpha', label: 'Plate opacity', type: 'range', min: 0, max: 1, step: 0.05, default: 0.85 }] },
  ];
};

export const SLOTS: readonly Slot[] = [
  { id: 'ground', group: 'board', n: 1, title: 'Empty ground', where: 'Every empty hex, painted as one continuous ground across the board (a second texture is blended in patches).',
    rule: tex(260), count: { min: 1, max: 2 }, optional: false, path: (i) => `textures/empty_ground_0${i + 1}.webp`, settings: [{ key: 'proxy', label: 'Fallback colour', type: 'colour', default: '#262a28' }] },
  { id: 'rock', group: 'board', n: 2, title: 'Rock tile', where: 'Blocked hexes nobody can grow on: one picture per rock hex, picked by position.',
    rule: hex(30), count: { min: 1, max: 5 }, optional: false, path: (i) => `props/rock/rock_${String(i + 1).padStart(2, '0')}.webp`, settings: [] },
  { id: 'gold', group: 'board', n: 3, title: 'Rich / gold tile', where: 'Bonus hexes (score twice): a pile drawn on the empty ground until a tile takes the hex.',
    rule: hex(30), count: { min: 1, max: 5 }, optional: false, path: (i) => `props/gold/gold_${String(i + 1).padStart(2, '0')}.webp`, settings: [] },
  ...playerSlots(0),
  ...playerSlots(1),
  { id: 'motes', group: 'board', n: 12, title: 'Ambient motes', where: 'Tiny sprites rising or falling off strong, connected tiles (only with motion on).',
    rule: sprite(8, 4), count: { min: 0, max: 4 }, optional: true, path: (i) => `fx/mote_${String(i + 1).padStart(2, '0')}.webp`, settings: [{ key: 'max', label: 'Most at once (per kind)', type: 'range', min: 0, max: 12, step: 1, default: 4 }],
    fileSettings: [{ key: 'player', label: 'Over whose land', type: 'select', options: ['Player 1', 'Player 2'], default: 'Player 1' }, { key: 'kind', label: 'Direction', type: 'select', options: ['rise', 'fall'], default: 'rise' },
      { key: 'minStrength', label: 'From strength', type: 'range', min: 1, max: 9, step: 1, default: 6 }, { key: 'size', label: 'Size (board units)', type: 'range', min: 2, max: 16, step: 1, default: 6 }] },
  ...(['moss', 'ash', 'dew', 'ember'] as const).map((s): Slot => ({
    id: `card-${s}`, group: 'cards', n: 13, title: `${s[0]!.toUpperCase()}${s.slice(1)} face`,
    where: `The ${s[0]!.toUpperCase()}${s.slice(1)} suit's cards: a sheet of nine (1-9, left to right, top to bottom); one card is repeated for all nine.`,
    rule: once('card-sheet', CARD_SHEET.w, CARD_SHEET.h, 'forbidden', 140), count: { min: 1, max: 1 }, optional: false, path: () => `cards/${s}.webp`, settings: [],
  })),
  { id: 'card-back', group: 'cards', n: 14, title: 'Card back', where: 'The draw pile and the opponent\'s cards.', rule: once('card', CARD.w, CARD.h, 'forbidden', 40), count: { min: 1, max: 1 }, optional: false, path: () => 'cards/back.webp', settings: [] },
  { id: 'card-back-frame', group: 'cards', n: 14, title: 'Card back frame', where: 'The frame drawn around the card back.', rule: once('card', CARD.w, CARD.h, 'optional', 40), count: { min: 1, max: 1 }, optional: false, path: () => 'cards/back-frame.webp', settings: [] },
  { id: 'card-bomb', group: 'cards', n: 15, title: 'Bomb card', where: 'The Bomb card in the hand; a Blast is three Bombs, so it uses this card too.', rule: once('card', CARD.w, CARD.h, 'forbidden', 40), count: { min: 1, max: 1 }, optional: false, path: () => 'cards/bomb.webp', settings: [] },
  ...(['moss', 'ash', 'dew', 'ember'] as const).map((s): Slot => ({
    id: `icon-${s}`, group: 'cards', n: 16, title: `${s[0]!.toUpperCase()}${s.slice(1)} icon`, where: 'The suit symbol in the card corner and in the Bloom recipes (drawn in the suit\'s colour).',
    rule: once('svg', 24, 24, 'optional', 4), count: { min: 0, max: 1 }, optional: true, path: () => `cards/icons/${s}.svg`, settings: [],
  })),
  ...([['planet-void', 'Unexplored ground', 'The planet nobody has reached yet.'], ['planet-fog', 'Fog ring', 'The two rings of undiscovered tiles around the known land.'],
    ['planet-land', 'Free land', 'Known ground anyone can grow on.'], ['planet-owned', "Other players' land", 'Tiles held by other players (tinted in each player\'s colour).'],
    ['planet-mine', 'Your land', 'The viewer\'s own tiles (tinted in their colour).'], ['planet-pentagon', 'The 12 black pentagons', 'Twelve uninhabitable black tiles that hold the planet together.']] as const).map(([id, title, where]): Slot => ({
    id, group: 'planet', n: 17, title, where: `${where} Projected on the planet, so it must tile seamlessly.`,
    rule: once('square', PLANET_PX, PLANET_PX, 'forbidden', 80, true), count: { min: 0, max: 1 }, optional: true, path: () => `planet/${id.slice(7)}.webp`, settings: [{ key: 'strength', label: 'Texture strength', type: 'range', min: 0, max: 1, step: 0.05, default: 0.85 }],
  })),
];

export const slotById = (id: string): Slot | undefined => SLOTS.find((s) => s.id === id);

/** Default settings of a slot (and of one file in a set). */
export const defaults = (list: readonly Setting[] | undefined): Record<string, string | number | boolean> =>
  Object.fromEntries((list ?? []).map((s) => [s.key, s.default]));

/** The pixel size a file of this slot is made at, per tier: [width, height]. */
export const targetSize = (slot: Slot, tier: Tier, fileSettings?: Record<string, unknown>): [number, number] => {
  const r = slot.rule;
  if (r.shape === 'svg') return [r.px[tier], r.px[tier]];
  // props and home layers are drawn at their own size: the file follows it
  const units = typeof fileSettings?.size === 'number' ? fileSettings.size : null;
  const w = units !== null && r.tiered && r.shape === 'square' && r.alpha === 'required' ? spritePx(units, tier) : r.px[tier];
  return [w, Math.round(w / r.aspect)];
};

/** The smallest upload that still makes the hi tier (or the one size) without blowing it up. */
export const minUpload = (slot: Slot, fileSettings?: Record<string, unknown>): [number, number] => targetSize(slot, slot.rule.tiered ? 'hi' : 'lo', fileSettings);
