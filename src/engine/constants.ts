import type { Coord, Suit } from './types.js';

/** Axial hex directions, indexed 0-5 (spec 4.2). `dir` in actions indexes this list. */
export const DIRECTIONS: readonly Readonly<Coord>[] = Object.freeze([
  Object.freeze({ q: 1, r: 0 }),
  Object.freeze({ q: 1, r: -1 }),
  Object.freeze({ q: 0, r: -1 }),
  Object.freeze({ q: -1, r: 0 }),
  Object.freeze({ q: -1, r: 1 }),
  Object.freeze({ q: 0, r: 1 }),
]);

export const CENTRE: Readonly<Coord> = Object.freeze({ q: 0, r: 0 });

export const SUITS: readonly Suit[] = Object.freeze([0, 1, 2, 3] as const);
export const SUIT_NAMES = Object.freeze(['Moss', 'Ash', 'Dew', 'Ember'] as const);

export const MIN_RANK = 1;
export const MAX_RANK = 9;

/** Independent PRNG streams derived from the game seed. */
export const TERRAIN_STREAM = 1;
export const DECK_STREAM = 2;
