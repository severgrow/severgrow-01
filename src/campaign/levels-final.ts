// CAMPAIGN, CHAPTERS VIII-X — levels 71-100: the final arc (docs/CAMPAIGN-71-100.md).
//
// Own file for the same reason as levels-late.ts: `levels.ts` needs one import and one spread.
//
// WHAT CHANGES HERE. Levels 4-70 all share one spine: the shortest route between the homes is the
// same four steps through the gold centre (the two hexes beside it sit in the protected root zones,
// and the centre was gold by rule), so no stone ever lengthened the race. From 71 the centre may be
// stone, and the boards use it: rivers along a full hex line crossed at fords, islands, stone hearts.
// The rules stay the game's own; only the board, the seed and the bot vary, exactly as in 1-70.
//
// THE RIVALS. Each chapter brings a rival bot above level 9 (src/bots/levels.ts): VIII Ironwood
// (bot 10, defensive), IX Strangler Fig (bot 11, aggressive), X Night Bloom (bot 12, patient). The
// names are for the code only; the game never shows them. Breathers here use bot 9.
//
// VOCABULARY added to levels-late.ts's list:
//   river       a full hex line of stone (the centre column q=0 or the middle row r=0)
//   ford        an open hex in a river; two or more, so no single hex cuts the homes apart
//   islands     both rivers at once: four quadrants, two of them nobody's home
//   shelf       a one-sided wall near one home (uneven)
//   ridge       a wall across the board with passes of different widths (uneven)
//   heart       a solid block of stone where the gold centre used to be
//
// UNEVEN BOARDS (chapter IX and a few others) are deliberately unfair. Each says which seat it
// favours (`uneven`); the balance report must show that seat ahead by a bounded margin (55-70%
// bot-vs-bot, up to 80% on a `harsh` board). Every rule of validate.ts still holds: every open hex
// is reachable from both homes, no single hex decides the route, each home keeps three or more open
// neighbours. One board (89) puts stone in the player's home zone, flagged `homeZoneStone`.
//
// Each board is drawn above its level as the player sees it: rows top to bottom, A your home, B the
// bot's, # stone, $ gold.
import { allCoords, coordKey, rootCoord } from '../engine/index.js';
import type { BoardSpec, RulesConfig } from '../engine/index.js';
import type { BotLevel } from '../bots/levels.js';
import type { CampaignLevel } from './levels.js';

const CELLS: readonly string[] = Object.freeze(allCoords(3).map(coordKey));
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

type Flags = Pick<CampaignLevel, 'breather' | 'uneven' | 'harsh' | 'homeZoneStone'>;

const final = (
  chapter: number,
  number: number,
  id: string,
  name: string,
  seed: number,
  botLevel: BotLevel,
  spec: BoardSpec,
  intent: string,
  flags: Flags = {},
): CampaignLevel => ({ id, number, chapter, name, intent, seed, botLevel, ...flags, config: { ...BASE, board: spec } });

/**
 * CHAPTER VIII — THE BRIDGES (71-80). The centre is stone and a river splits the board; it is crossed
 * at fords. Two separate fords keep "no single hex decides the route" true while every crossing stays
 * tight. Ironwood (bot 10), the defender, arrives at 74: it holds a ford rather than racing for one.
 */
export const CHAPTER_8_LEVELS: readonly CampaignLevel[] = Object.freeze([
  // The river runs along the middle row with four fords; gold waits on both banks.
  //      . . . .
  //     . $ . B .
  //    . . . . . $
  //   . # . # . # .
  //    $ . . . . .
  //     . A . $ .
  //      . . . .
  final(8, 71, 'c8-71', 'First Crossing', 97071, 9, board(
    ['-2,0', '0,0', '2,0'],
    ['0,-2', '3,-1', '-3,1', '0,2'],
  ), 'A river across the middle row, four fords: the first board whose centre is stone.'),

  // Column river. Each ford is two steps from one home, so every crossing is an attack.
  //      # . . .
  //     . . . B .
  //    . $ # . . $
  //   . . . # . . .
  //    $ . . # $ .
  //     . A . . .
  //      . . . #
  final(8, 72, 'c8-72', 'Two Fords', 97072, 9, board(
    ['0,-3', '0,-1', '0,0', '0,1', '0,3'],
    ['-1,-1', '3,-1', '-3,1', '1,1'],
  ), 'A river down the centre column; each ford sits by a home: hold yours, take theirs.'),

  // The same river, but the two fords are gold.
  //      # . . .
  //     . $ . B .
  //    . . # . . .
  //   . $ . # . $ .
  //    . . . # . .
  //     . A . $ .
  //      . . . #
  final(8, 73, 'c8-73', 'Toll Bridge', 97073, 9, board(
    ['0,-3', '0,-1', '0,0', '0,1', '0,3'],
    ['0,-2', '-2,0', '2,0', '0,2'],
  ), 'The fords are gold: crossing pays, holding pays more.'),

  // Ironwood (bot 10) arrives. The fords sit right beside the stone centre, so the fight is mid-river.
  //      # . . .
  //     . # . B .
  //    . . $ . . .
  //   . $ . # . $ .
  //    . . . $ . .
  //     . A . # .
  //      . . . #
  final(8, 74, 'c8-74', 'Midstream', 97074, 10, board(
    ['0,-3', '0,-2', '0,0', '0,2', '0,3'],
    ['0,-1', '-2,0', '2,0', '0,1'],
  ), 'Fords beside the stone centre: the fight is in mid-river (bot 10 debut).'),

  // Row river with a gold islet: a crossing is two steps, and the islet is worth holding.
  //      . . . .
  //     . . . B .
  //    . # $ . . $
  //   # . # # # . #
  //    $ . . $ # .
  //     . A . . .
  //      . . . .
  final(8, 75, 'c8-75', 'Stepping Stones', 97075, 10, board(
    ['-1,-1', '-3,0', '-1,0', '0,0', '1,0', '3,0', '1,1'],
    ['0,-1', '3,-1', '-3,1', '0,1'],
  ), 'A gold islet in the river: every crossing takes two steps.'),

  // The breather (bot 9, below the rivals): four wide fords, gold on both home banks.
  //      . $ . .
  //     . . . B .
  //    . . . . . $
  //   . # . # . # .
  //    $ . . . . .
  //     . A . . .
  //      . . $ .
  final(8, 76, 'c8-76', 'Low Water', 97076, 9, board(
    ['-2,0', '0,0', '2,0'],
    ['1,-3', '3,-1', '-3,1', '-1,3'],
  ), 'Breather: wide fords and rich home banks.', { breather: true }),

  // Both centre lines are river. Four fords; the two islets between them carry the gold.
  //      # . . .
  //     . . . B .
  //    $ $ # . . .
  //   # . # # # . #
  //    . . . # $ $
  //     . A . . .
  //      . . . #
  final(8, 77, 'c8-77', 'Islands', 97077, 10, board(
    ['0,-3', '0,-1', '-3,0', '-1,0', '0,0', '1,0', '3,0', '0,1', '0,3'],
    ['-2,-1', '-1,-1', '1,1', '2,1'],
  ), 'Two rivers cross: four fords and two gold islets nobody owns.'),

  // Column river whose fords are at the board's edges: the shortest route is eight steps.
  //      $ . . .
  //     . # . B .
  //    . . # . . .
  //   . . $ # $ . .
  //    . . . # . .
  //     . A . # .
  //      . . . $
  final(8, 78, 'c8-78', 'Drawbridge', 97078, 10, board(
    ['0,-2', '0,-1', '0,0', '0,1', '0,2'],
    ['0,-3', '-1,0', '1,0', '0,3'],
  ), 'Fords only at the far edges: the long way, both ways.'),

  // Three fords, two on the bot's half: it crosses easily, you cross into its ground.
  //      # . . .
  //     . . . B .
  //    . $ . . . .
  //   . . . # . . .
  //    . . . # $ .
  //     . A . # .
  //      . . . $
  final(8, 79, 'c8-79', 'Broken Bridge', 97079, 10, board(
    ['0,-3', '0,0', '0,1', '0,2'],
    ['-1,-1', '1,1', '0,3'],
  ), 'Two of three fords sit on the bot\'s half: the first unfair crossing.', { uneven: 'bot' }),

  // The finale: both rivers, four gold fords, gold on each islet.
  //      # . . .
  //     . $ . B .
  //    . $ # . . .
  //   # $ # # # $ #
  //    . . . # $ .
  //     . A . $ .
  //      . . . #
  final(8, 80, 'c8-80', 'The Last Bridge', 97080, 10, board(
    ['0,-3', '0,-1', '-3,0', '-1,0', '0,0', '1,0', '3,0', '0,1', '0,3'],
    ['0,-2', '-1,-1', '-2,0', '2,0', '1,1', '0,2'],
  ), 'Chapter finale: islands, and every ford is gold.'),
]);

/**
 * CHAPTER IX — UNEVEN GROUND (81-90). The boards stop being fair on purpose. Each one declares whom it
 * favours; most favour the bot, one (86) the player, one (81) is fair under a mirror that keeps each
 * flank on its own side. Strangler Fig (bot 11), the attacker, arrives at 83.
 */
export const CHAPTER_9_LEVELS: readonly CampaignLevel[] = Object.freeze([
  // Fair under the side-keeping mirror (q,r) -> (r,q), which swaps the homes but keeps each flank on its side: stone fills one flank, gold the other, so both players race up the same side.
  //      # . . .
  //     # # . B .
  //    # # . . . .
  //   # # . . . $ .
  //    . . . . $ $
  //     . A . $ $
  //      . . . .
  final(9, 81, 'c9-81', 'Lopsided', 97081, 9, board(
    ['0,-3', '-1,-2', '0,-2', '-2,-1', '-1,-1', '-3,0', '-2,0'],
    ['2,0', '1,1', '2,1', '0,2', '1,2'],
  ), 'One flank stone, the other gold; fair, but both of you race the same side.'),

  // Gold two steps from the bot's home; the player's half is open with one more lane.
  //      . $ . .
  //     . . . B .
  //    . . . . . $
  //   $ # . . . . .
  //    . . . # . .
  //     . A . # .
  //      . . . .
  final(9, 82, 'c9-82', 'Downhill', 97082, 9, board(
    ['-2,0', '0,1', '0,2'],
    ['1,-3', '3,-1', '-3,0'],
  ), 'The bot has gold near its door; you have the extra lane.', { uneven: 'bot' }),

  // Strangler Fig (bot 11) arrives. Stone two steps from your home narrows your way out.
  //      . . . .
  //     . . . B .
  //    . . $ . . .
  //   . # # $ . $ .
  //    . . . # . .
  //     . A . # .
  //      . . . .
  final(9, 83, 'c9-83', 'Pinched', 97083, 11, board(
    ['-2,0', '-1,0', '0,1', '0,2'],
    ['0,-1', '0,0', '2,0'],
  ), 'Your way out is pinched at two steps; its home is wide open (bot 11 debut).', { uneven: 'bot' }),

  // The breather: no stone, five gold, perfectly even.
  //      . . . .
  //     . . . B .
  //    . . $ . . $
  //   . . . $ . . .
  //    $ . . $ . .
  //     . A . . .
  //      . . . .
  final(9, 84, 'c9-84', 'Fair Wind', 97084, 9, board(
    [],
    ['0,-1', '3,-1', '0,0', '-3,1', '0,1'],
  ), 'Breather: open, symmetric, gold-led.', { breather: true }),

  // A stone shelf over the player's home, and the gold on the bot's side. Harsh by design.
  //      $ . . .
  //     . . . B .
  //    . . . . . $
  //   $ # # . . . .
  //    . . . # # .
  //     . A . . .
  //      . . . .
  final(9, 85, 'c9-85', 'High Ground', 97085, 11, board(
    ['-2,0', '-1,0', '0,1', '1,1'],
    ['0,-3', '3,-1', '-3,0'],
  ), 'A shelf over your home; the gold lies behind the bot.', { uneven: 'bot', harsh: true }),

  // Unfair the other way: gold near the player, a short wall in front of the bot. It will come for you.
  //      . . . .
  //     . . . B .
  //    . . . . . .
  //   $ . . $ . # .
  //    . . . $ # .
  //     . A . . .
  //      . . $ .
  final(9, 86, 'c9-86', 'Head Start', 97086, 11, board(
    ['2,0', '1,1'],
    ['-3,0', '0,0', '0,1', '-1,3'],
  ), 'The gold is yours; the bot comes for your home.', { uneven: 'player' }),

  // A three-stone shelf across the player's flank; the gold sits beyond it.
  //      . . . .
  //     . . . B .
  //    . . . . . .
  //   . # # # $ . .
  //    . . . . $ .
  //     . A . . $
  //      . . . .
  final(9, 87, 'c9-87', 'Long Shelf', 97087, 11, board(
    ['-2,0', '-1,0', '0,0'],
    ['1,0', '1,1', '1,2'],
  ), 'One long shelf on your flank, gold on its far side.', { uneven: 'bot' }),

  // A four-stone ridge leaves a narrow pass on your side and a wide one on the bot's.
  //      . . . .
  //     . . . B .
  //    . $ . . . .
  //   . # # # # . .
  //    . . . . $ $
  //     . A . . .
  //      . . . .
  final(9, 88, 'c9-88', 'Ridgeline', 97088, 11, board(
    ['-2,0', '-1,0', '0,0', '1,0'],
    ['-1,-1', '1,1', '2,1'],
  ), 'A ridge across the board; the wide pass is on the bot\'s side.', { uneven: 'bot' }),

  // The one board with stone in the player's home zone (three stones, three open neighbours kept).
  //      . . . .
  //     . . . B .
  //    . . $ . . .
  //   . . . $ . $ .
  //    # # . . . .
  //     # A # . .
  //      . . . .
  final(9, 89, 'c9-89', 'One Door', 97089, 11, board(
    ['-3,1', '-2,1', '-3,2', '-1,2'],
    ['0,-1', '0,0', '2,0'],
  ), 'Stone beside your home: one real door out. Survive the opening.', { uneven: 'bot', harsh: true, homeZoneStone: true }),

  // The finale: the gold and the short route are the bot's.
  //      # $ . .
  //     . . . B .
  //    . . $ . . $
  //   . # . # . . .
  //    . . . . # .
  //     . A . . .
  //      . . # .
  final(9, 90, 'c9-90', 'Underdog', 97090, 11, board(
    ['0,-3', '-2,0', '0,0', '1,1', '-1,3'],
    ['1,-3', '0,-1', '3,-1'],
  ), 'Chapter finale: everything favours the bot; win anyway.', { uneven: 'bot', harsh: true }),
]);

/**
 * CHAPTER X — THE LAST GARDEN (91-100). Each board asks an earlier chapter's question again with the
 * late tools (stone centre, rivers, uneven ground). Night Bloom (bot 12), the patient one, arrives at
 * 91; 98 and 99 give the other two rivals their best ground, and 100 closes the campaign.
 */
export const CHAPTER_10_LEVELS: readonly CampaignLevel[] = Object.freeze([
  // Night Bloom (bot 12) arrives on a board with no stone: only the cards decide.
  //      . . . .
  //     $ . . B .
  //    . $ . . . .
  //   . . . $ . . .
  //    . . . . $ .
  //     . A . . $
  //      . . . .
  final(10, 91, 'c10-91', 'The Clearing, Again', 97091, 12, board(
    [],
    ['-1,-2', '-1,-1', '0,0', '1,1', '1,2'],
  ), 'No stone at all: pure card play against the patient bot (bot 12 debut).'),

  // A callback to Broken Ground: scattered single stones, and now the centre is one of them.
  //      . # . .
  //     . # . B .
  //    . . . . . $
  //   . $ . # . $ .
  //    $ . . . . .
  //     . A . # .
  //      . . # .
  final(10, 92, 'c10-92', 'Broken Ground, Again', 97092, 12, board(
    ['1,-3', '0,-2', '0,0', '0,2', '-1,3'],
    ['3,-1', '-2,0', '2,0', '-3,1'],
  ), 'Chapter II\'s scattered stones, with the centre stoned.'),

  // The breather: a row river with four fords.
  //      . . . .
  //     . $ . B .
  //    . . . . . $
  //   # . # # # . #
  //    $ . . . . .
  //     . A . $ .
  //      . . . .
  final(10, 93, 'c10-93', 'Still Water', 97093, 9, board(
    ['-3,0', '-1,0', '0,0', '1,0', '3,0'],
    ['0,-2', '3,-1', '-3,1', '0,2'],
  ), 'Breather: a gentle river with four fords.', { breather: true }),

  // A callback to Gold Country: most of the gold lies on the bot's half.
  //      $ $ . .
  //     . . . B .
  //    . . $ . . $
  //   . . . # $ . .
  //    . . . $ . .
  //     . A . . .
  //      . . . .
  final(10, 94, 'c10-94', 'Gold Country, Again', 97094, 12, board(
    ['0,0'],
    ['0,-3', '1,-3', '0,-1', '3,-1', '1,0', '0,1'],
  ), 'Gold-led and uneven: the richer side is the bot\'s.', { uneven: 'bot' }),

  // A callback to Narrow Paths: a river broken into short walls, two-step crossings.
  //      # . . .
  //     . . . B .
  //    . $ # . . $
  //   . # . # . # .
  //    $ . . # $ .
  //     . A . . .
  //      . . . #
  final(10, 95, 'c10-95', 'Narrow Paths, Again', 97095, 12, board(
    ['0,-3', '0,-1', '-2,0', '0,0', '2,0', '0,1', '0,3'],
    ['-1,-1', '3,-1', '-3,1', '1,1'],
  ), 'A broken river with narrow crossings.'),

  // Everything inverted: a seven-stone heart, the gold on the outer ring.
  //      $ . . .
  //     . . . B .
  //    $ # # . . .
  //   . . # # # . .
  //    . . . # # $
  //     . A . . .
  //      . . . $
  final(10, 96, 'c10-96', 'Crown of Stone', 97096, 12, board(
    ['-1,-1', '0,-1', '-1,0', '0,0', '1,0', '0,1', '1,1'],
    ['0,-3', '-2,-1', '2,1', '0,3'],
  ), 'A stone heart where the gold used to be; the gold is outside it.'),

  // Two stone hollows, each holding a gold hex; three lanes run between them.
  //      $ . . .
  //     . # . B .
  //    # $ . . . .
  //   . # . # . # .
  //    . . . . $ #
  //     . A . # .
  //      . . . $
  final(10, 97, 'c10-97', 'Twin Hollows', 97097, 12, board(
    ['0,-2', '-2,-1', '-2,0', '0,0', '2,0', '2,1', '0,2'],
    ['0,-3', '-1,-1', '1,1', '0,3'],
  ), 'Two hollows with gold inside, three lanes between.'),

  // Ironwood on its best ground: a row river crossed only at the two ends.
  //      . $ . .
  //     . . . B .
  //    . . . . . $
  //   . # # # # # .
  //    $ . . . . .
  //     . A . . .
  //      . . $ .
  final(10, 98, 'c10-98', 'The Held Bridge', 97098, 10, board(
    ['-2,0', '-1,0', '0,0', '1,0', '2,0'],
    ['1,-3', '3,-1', '-3,1', '-1,3'],
  ), 'A river crossed only at its two far ends, against the defender.'),

  // Strangler Fig on its best ground: stone walls the bot's home, leaving it short lanes toward yours.
  //      # # . .
  //     # . . B .
  //    . # . . . .
  //   $ . . $ $ . #
  //    . . . . # #
  //     . A . # #
  //      . . . .
  final(10, 99, 'c10-99', 'Overgrown', 97099, 11, board(
    ['0,-3', '1,-3', '-1,-2', '-1,-1', '3,0', '1,1', '2,1', '0,2', '1,2'],
    ['-3,0', '0,0', '1,0'],
  ), 'Short lanes run from the bot to your home.', { uneven: 'bot' }),

  // The campaign finale: both rivers, crossed only beside the stone centre; all four fords are gold.
  //      # . . .
  //     . # . B .
  //    . $ $ . . .
  //   # # $ # $ # #
  //    . . . $ $ .
  //     . A . # .
  //      . . . #
  final(10, 100, 'c10-100', 'The Last Garden', 97100, 12, board(
    ['0,-3', '0,-2', '-3,0', '-2,0', '0,0', '2,0', '3,0', '0,2', '0,3'],
    ['-1,-1', '0,-1', '-1,0', '1,0', '0,1', '1,1'],
  ), 'The campaign finale: both rivers, four gold fords around the stone centre, the patient bot.'),
]);
