// Who starts is a seeded lottery, independent of difficulty level selection.
import { deriveSeed, mulberry32, randomInt } from '../../../src/engine/index.js';

/** Stream salt so the starter bit does not share the difficulty modulus. */
const STARTER_STREAM = 0x57484f53; // 'WHOS'

/** True when player 1 (the opponent seat in the browser) should move first. */
export const opponentStartsFromSeed = (seed: number): boolean =>
  randomInt(mulberry32(deriveSeed(seed, STARTER_STREAM)), 2) === 1;
