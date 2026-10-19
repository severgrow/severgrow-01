// ALTERNATE LEVEL OPENINGS — the other board a level has shipped with, kept so a proof from either
// one still verifies.
//
// A Campaign Seed reward is proven by replaying the player's actions on the level's opening
// (`server/src/seeds/verify.ts`). Since 2026-10-17 the site publishes the SAME game twice:
//   * the root (https://www.futasaku.com/) — the released campaign, levels 4-10 on the 37-hex map;
//   * /2/ — the onboarding line, the same levels on the tutorial's 19-hex map.
// One Edge function serves both, so it must accept a win played on EITHER board. The verifier tries
// the level's current opening first, then the alternate recorded here.
//
// This is also the safety net the brief asks for: changing a level's terrain must never invalidate a
// proof that was already earned (queued on a device, or produced by a bundle built before the change).
//
// A level whose board has never changed has no entry. Never use an alternate to open a new match.
import type { BoardSpec } from '../engine/index.js';
import { CAMPAIGN_SMALL_CELLS, CAMPAIGN_SMALL_HOMES } from './levels.js';
import { SMALL_BOARD_RADIUS as TUTORIAL_BOARD_RADIUS } from './small-board.js';

export type AlternateOpening = { boardRadius: number; board: BoardSpec };

/** The tutorial's map (19 hexes) with an authored rock/gold set — the /2/ line's boards. */
const small = (rock: readonly string[], gold: readonly string[]): AlternateOpening => ({
  boardRadius: TUTORIAL_BOARD_RADIUS,
  board: {
    cells: [...CAMPAIGN_SMALL_CELLS],
    rock: [...rock],
    gold: [...gold],
    homes: [CAMPAIGN_SMALL_HOMES[0], CAMPAIGN_SMALL_HOMES[1]],
  },
});

const Q = ['0,0', '-2,0', '2,0'] as const;
const R = ['0,0', '0,2', '0,-2'] as const;

/**
 * Level id → the other opening it is played on in the /2/ onboarding build. The root plays these
 * same levels on the product hexagon (see `levels.ts`), so that is each level's current opening.
 */
export const ALTERNATE_OPENINGS: Readonly<Record<string, AlternateOpening>> = Object.freeze({
  'c1-04': small([], Q),
  'c1-05': small(['-1,0', '1,0'], Q),
  'c1-06': small(['-1,0'], Q),
  'c1-07': small(['-2,0', '-1,-1'], R),
  'c1-08': small([], R),
  'c1-09': small(['-2,0', '-1,-1', '-1,0'], R),
  'c1-10': small(['-1,-1', '0,1', '1,1'], Q),
});
