// FROZEN LEVEL OPENINGS — the boards a level shipped with before its terrain changed, kept so a
// reward that was already earned still verifies.
//
// The Campaign's Seed rewards are proven by replaying the player's actions on the level's own
// opening (`server/src/seeds/verify.ts`). When 2026-10-17 moved levels 4-10 onto the tutorial's small
// map, any proof queued on the device BEFORE that change, and any proof produced by a server bundle
// built before it, replays the OLD board. Without the old board those wins verify as null and the
// Seeds are silently lost.
//
// So: the current opening is `campaignOpening(level)`; these are the previous ones, tried only when
// the current one fails. They are strictly historical — never use one for a new match.
//
// Remove an entry only when no pending proof can still reference it (a proof is queued on the device
// and retried on the next menu visit; once an app update has shipped and drained, the archive's job
// is done). They cost nothing while they sit here: a replay only happens when a proof fails its
// current opening.
import type { BoardSpec } from '../engine/index.js';
import { CAMPAIGN_CELLS, CAMPAIGN_HOMES } from './levels.js';

/** A historical opening: the board AND the radius it was played at (levels 4-10 used the 37-hex map). */
export type FrozenOpening = { boardRadius: number; board: BoardSpec };

/** The product hexagon with an authored rock/gold set, exactly as `board(rock, gold)` built it. */
const product = (rock: readonly string[], gold: readonly string[]): FrozenOpening => ({
  boardRadius: 3,
  board: {
    cells: [...CAMPAIGN_CELLS],
    rock: [...rock],
    gold: [...gold],
    homes: [CAMPAIGN_HOMES[0], CAMPAIGN_HOMES[1]],
  },
});

const Q = ['0,0', '-2,0', '2,0'] as const;
const R = ['0,0', '0,2', '0,-2'] as const;
const FLANK = ['0,0', '-3,1', '3,-1'] as const;

/**
 * Level id → the opening it used before 2026-10-17 (radius 3, 37 hexes). Levels 1-3 and 11-30 did
 * not change, so they have no entry.
 */
export const FROZEN_OPENINGS: Readonly<Record<string, FrozenOpening>> = Object.freeze({
  'c1-04': product([], Q),
  'c1-05': product(['-3,1', '3,-1'], Q),
  'c1-06': product(['0,1'], Q),
  'c1-07': product(['-3,0', '-3,1'], Q),
  'c1-08': product([], FLANK),
  'c1-09': product(['-2,-1', '-2,0', '-1,-1'], R),
  'c1-10': product(['-1,0', '-1,-1', '0,-1'], Q),
});
