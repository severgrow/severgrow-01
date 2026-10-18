// CAMPAIGN, CHAPTERS IV-VII — levels 31-70.
//
// Kept in its OWN file, and built through its own small factory, for one practical reason: the
// onboarding line and the from-scratch rework both edit `levels.ts`, and 40 authored boards would
// make every merge a fight. Here, `levels.ts` needs one import and one spread; nothing else in the
// product changes.
//
// WHAT THESE LEVELS ARE. Levels 1-30 teach the game and then climb a bot ladder that tops out at 9.
// There is no stronger AI to climb to, so 31-70 put the difficulty in the BOARD instead: the rules
// are the product's own (maxRank 9, one sprout, strengthen and expanded Bloom on, four Fruit cards),
// and only terrain, gold and the seed vary. A player who finishes level 70 has played the game they
// will meet online.
//
// DESIGN VOCABULARY, so a shape is a decision and not a scatter:
//   shoulders   two mirrored 2-cell groups flanking the centre column
//   pips        two short diagonal pairs, leaving the polar lanes open
//   outliers    stones hugging the corners, the middle wide open
//   cross       edge stones plus a central pair: an X of open lanes
//   gate        a broken wall whose only crossings are wide
//   scatter     many single stones, no wall: every hex is a choice
//   anvils      two solid 4-cell blocks, the short way round closed
//   pasture     almost no stone, gold everywhere
//   ring        stones around the centre with gaps on opposite sides
//   crown       a dense ring that is also the chapter's finale
//
// HARD RULES (enforced by `validate.ts`, restated because they shape every board here):
//   * no rock or gold within one hex of either home (the root zone);
//   * every open hex reachable from BOTH homes;
//   * no single hex whose removal cuts the homes apart — so a "gate" is never one hex wide;
//   * at least 20 open hexes on a radius-3 board (37 cells → at most 17 rock).
//
// Every board below is point-symmetric about the centre (mirror q,r → -q,-r), so both seats get the
// same ground. Levels 1-30 already ship that way; asymmetry is a later, deliberate decision.
import { allCoords, coordKey, rootCoord } from '../engine/index.js';
import type { BoardSpec, RulesConfig } from '../engine/index.js';
import type { Level } from '../bots/levels.js';
import type { CampaignLevel } from './levels.js';

/** The product hexagon (radius 3 → 37 cells), computed the same way `levels.ts` computes it. */
const CELLS: readonly string[] = Object.freeze(allCoords(3).map(coordKey));
/** The classic ring2 homes: mine, then the opponent's — the same two corners 1-30 use. */
const HOMES: readonly [string, string] = Object.freeze([
  coordKey(rootCoord(0, 'ring2', 3)),
  coordKey(rootCoord(1, 'ring2', 3)),
]);

const BASE: Partial<RulesConfig> = Object.freeze({ boardRadius: 3, rootStyle: 'ring2' });

const board = (rock: readonly string[], gold: readonly string[]): BoardSpec => ({
  cells: [...CELLS],
  rock: [...rock],
  gold: [...gold],
  homes: [HOMES[0], HOMES[1]],
});

const late = (
  number: number,
  id: string,
  name: string,
  seed: number,
  botLevel: Level,
  spec: BoardSpec,
  intent: string,
  breather = false,
): CampaignLevel => ({
  id, number, chapter: 4, name, intent, seed, botLevel,
  ...(breather ? { breather: true } : {}),
  config: { ...BASE, board: spec },
});



/**
 * CHAPTER IV — HOLLOW GROUND (31-40). Terrain budget rises 7 → 15.
 * The chapter's question: can you read a large shape and find the route that still exists?
 * Bot 9 throughout except two deliberate breathers (31, 38) where the chapter changes gear.
 */
export const CHAPTER_4_LEVELS: readonly CampaignLevel[] = Object.freeze([
  // Two small shoulders above and below the centre, and a gold slot between them. Minimal on
  // purpose: the first level after 30 should feel like a held breath, not a wall.
  late(31, 'c4-31', 'First Light', 96031, 8, board(
    ['0,2', '1,2', '0,-2', '-1,-2'],
    ['0,0', '0,1', '0,-1'],
  ), 'Shoulders: gold slot through the middle; a soft re-entry after 30.', true),

  // Four stones on the two diagonals: the polar lanes stay open, the short diagonals do not.
  late(32, 'c4-32', 'The Knot', 96032, 9, board(
    ['1,1', '2,1', '-1,-1', '-2,-1'],
    ['0,0', '0,2', '0,-2'],
  ), 'Pips: two diagonal pairs; read which lanes survive.'),

  // Stones hug three corners; the middle stays wide. The first board where the edges lie to you.
  late(33, 'c4-33', 'Outliers', 96033, 9, board(
    ['-1,3', '1,-3', '-3,1', '3,-1', '-3,0', '3,0'],
    ['0,0', '1,1', '-1,-1'],
  ), 'Outliers: corners taken, centre open.'),

  // Edge stones plus two near the centre: four open lanes cross in an X.
  late(34, 'c4-34', 'Crosswinds', 96034, 9, board(
    ['0,3', '0,-3', '2,1', '-2,-1', '-1,0', '1,0'],
    ['0,0', '-3,1', '3,-1', '0,1', '0,-1'],
  ), 'Cross: an X of lanes, gold down the arms.'),

  // A broken wall with two wide gates; nothing is decided by one hex.
  late(35, 'c4-35', 'The Gate', 96035, 9, board(
    ['0,1', '0,-1', '0,2', '0,-2', '1,1', '-1,-1'],
    ['0,0', '-3,1', '3,-1'],
  ), 'Gate: two wide crossings, one diagonal.'),

  // Many single stones, no wall. The board asks for a plan rather than a route.
  late(36, 'c4-36', 'Sparrow Stones', 96036, 9, board(
    ['-1,3', '1,-3', '0,3', '0,-3', '1,2', '-1,-2', '2,1', '-2,-1'],
    ['0,0', '1,1', '-1,-1', '-3,1', '3,-1'],
  ), 'Scatter: eight single stones, every hex a choice.'),

  // Two solid four-cell blocks; the short way round is closed, the long way is not.
  late(37, 'c4-37', 'Twin Anvils', 96037, 9, board(
    ['0,2', '1,2', '1,1', '2,1', '0,-2', '-1,-2', '-1,-1', '-2,-1'],
    ['0,0', '-3,1', '3,-1'],
  ), 'Anvils: two blocks; route around, not through.'),

  // Almost no stone, seven gold. A breather that teaches value over space.
  late(38, 'c4-38', 'Gold Under Grass', 96038, 8, board(
    ['0,2', '0,-2', '-2,0', '2,0'],
    ['0,0', '-3,1', '3,-1', '0,1', '0,-1', '1,1', '-1,-1'],
  ), 'Pasture: gold almost everywhere; the fight is for value.', true),

  // A ring of stones around the centre with gaps on opposite sides, plus the polar corners.
  late(39, 'c4-39', 'Gated Ring', 96039, 9, board(
    ['-1,0', '1,0', '0,1', '0,-1', '2,1', '-2,-1', '-1,3', '1,-3'],
    ['0,0', '1,1', '-1,-1', '0,2', '0,-2'],
  ), 'Ring: the centre is gated, not sealed.'),

  // The finale: ten stones, five gold, the tightest board of the chapter.
  late(40, 'c4-40', 'Hollow Crown', 96040, 9, board(
    ['0,3', '0,-3', '1,2', '-1,-2', '-3,1', '3,-1', '1,1', '-1,-1', '2,1', '-2,-1'],
    ['0,0', '0,1', '0,-1', '0,2', '0,-2'],
  ), 'Crown: dense ring, gold spine; chapter finale.'),
]);
