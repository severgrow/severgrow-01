// CAMPAIGN MODE — the level data. ONE source of truth, consumed by the web client (the offline
// campaign), the validation layer (`validate.ts`) and the balance tool (`src/sim/campaign-balance.ts`).
//
// Levels are DATA, never code: a level only names the existing knobs the engine already supports
// (a fixed seed, the existing bot level, and engine `RulesConfig` overrides — a hand-authored board
// included). No new rule, card type, currency, ability, XP, star or life is invented here; the
// campaign is about mastering the game that already exists. Adding a level is ONE object in the
// list below (see docs/CAMPAIGN.md); the schema and the UI expand to 200+ levels with no change.
import { allCoords, coordKey, rootCoord } from '../engine/index.js';
import type { BoardSpec, RulesConfig } from '../engine/index.js';
import type { Level } from '../bots/levels.js';
// The tutorial's map size, imported rather than re-typed: levels 1-3 play on the SAME small map the
// tutorial teaches on, and there stays exactly ONE source of truth for how big that map is.
import { TUTORIAL_BOARD_RADIUS } from '../../web/src/logic/tutorial-script.js';
// Chapters IV-VII live in their own file: 40 authored boards would make every merge with the
// parallel onboarding work a fight. Type-only import there, so there is no runtime cycle.
import { CHAPTER_4_LEVELS, CHAPTER_5_LEVELS } from './levels-late.js';

export type CampaignLevel = {
  /** Stable id, never reused or renumbered once published. */
  id: string;
  /** 1-based position in the campaign; the unlock order. Level 1 is open by default. */
  number: number;
  /** The chapter this level belongs to (1-based). */
  chapter: number;
  /** Player-facing level name shown on the select screen and the finish screen. */
  name: string;
  /** One short design note: what the level is for (shown nowhere; the balance report and docs use it). */
  intent: string;
  /**
   * The fixed seed. The same level always deals the same opening hands, terrain and starting seat
   * (the engine derives all three from the seed), so a level is reproducible by construction.
   */
  seed: number;
  /** The existing bot level (1-9). There is no separate campaign AI. */
  botLevel: Level;
  /**
   * A deliberate easier level (bot 8) placed where the terrain spikes, so the chapter changes gear
   * without dropping the player into a wall. Levels 31-70 only; never two in a row, at most six in
   * the whole extension. The campaign tests read this flag instead of trusting an invisible curve.
   */
  breather?: boolean;
  /**
   * Engine `RulesConfig` overrides. `resolveConfig` validates these and THROWS on an impossible
   * board — that throw is the validation layer. A hand-authored `config.board` is the only way to
   * build the shapes the design calls for (the generator is point-symmetric random pairs only).
   */
  config: Partial<RulesConfig>;
};

/**
 * A chapter groups levels in order. It carries no words of its own: the title and subtitle a player
 * reads live in src/strings.ts keyed by this `id` (all player-facing chrome is in one place).
 */
export type CampaignChapter = {
  number: number;
  id: string;
  levels: readonly CampaignLevel[];
};

// ---------- the shared board geometry ----------

/** The classic product hexagon (radius 3 → 37 hexes), as board-order cell keys. */
export const CAMPAIGN_CELLS: readonly string[] = Object.freeze(allCoords(3).map(coordKey));

/** The classic ring2 homes for radius 3: mine then the opponent's. */
export const CAMPAIGN_HOMES: readonly [string, string] = Object.freeze([
  coordKey(rootCoord(0, 'ring2', 3)),
  coordKey(rootCoord(1, 'ring2', 3)),
]);

/**
 * The tutorial's small map (radius 2 → 19 hexes), used by levels 1-3 only. Its size comes from
 * `TUTORIAL_BOARD_RADIUS` (one ring smaller than the product board; SPEC 4.3, tutorial exception).
 * The ring2 homes stay the same keys — on radius 2 they are the two far corners.
 */
export const CAMPAIGN_SMALL_CELLS: readonly string[] = Object.freeze(allCoords(TUTORIAL_BOARD_RADIUS).map(coordKey));
export const CAMPAIGN_SMALL_HOMES: readonly [string, string] = Object.freeze([
  coordKey(rootCoord(0, 'ring2', TUTORIAL_BOARD_RADIUS)),
  coordKey(rootCoord(1, 'ring2', TUTORIAL_BOARD_RADIUS)),
]);

/** `cells`/`homes` for a campaign board radius (3 = the product hexagon, 2 = the tutorial map). */
const geometry = (radius: number): { cells: readonly string[]; homes: readonly [string, string] } =>
  radius === 3
    ? { cells: CAMPAIGN_CELLS, homes: CAMPAIGN_HOMES }
    : { cells: CAMPAIGN_SMALL_CELLS, homes: CAMPAIGN_SMALL_HOMES };

/**
 * Every campaign board: the full hexagon of `radius` with an authored rock/gold set. `rockCount` and
 * `richCount` in the config are ignored once `board` is set (the board carries its own terrain) —
 * they stay at their defaults and are never used to place a campaign rock.
 *
 * Terrain is only ever drawn from the hexes outside both root zones — the same hexes the generator
 * may use — so the roots and their neighbours stay protected. `validate.ts` names any terrain that
 * lands in a root zone, and the campaign tests assert none does.
 */
const board = (rock: readonly string[], gold: readonly string[], radius = 3): BoardSpec => {
  const { cells, homes } = geometry(radius);
  return { cells: [...cells], rock: [...rock], gold: [...gold], homes: [homes[0], homes[1]] };
};

/** An open board's only landmark: the gold centre, exactly where Classic's centre gold sits. */
const OPEN_GOLD = Object.freeze(['0,0'] as const);
/** A mirrored rich pair plus the centre — the shape Classic's generated terrain takes. */
const RICH_PAIR_Q = Object.freeze(['0,0', '-2,0', '2,0'] as const);
/** The same idea on the other axis (used where a rock owns a cell of RICH_PAIR_Q). */
const RICH_PAIR_R = Object.freeze(['0,0', '0,2', '0,-2'] as const);
/** The inner mirrored pair either side of the centre — the closest contested gold. */
const RICH_PAIR_INNER = Object.freeze(['0,0', '-1,-1', '1,1'] as const);
/** The two flank pairs: how far the gold sits from the centre, edge to edge. */
const RICH_PAIR_FLANK = Object.freeze(['0,0', '-3,1', '3,-1'] as const);

/** Every campaign level plays on a full hexagon: radius 3, or the tutorial's small map. */
const BASE: Partial<RulesConfig> = Object.freeze({ boardRadius: 3, rootStyle: 'ring2' });

const level = (
  chapter: number,
  number: number,
  id: string,
  name: string,
  seed: number,
  botLevel: Level,
  spec: BoardSpec,
  intent: string,
  boardRadius = 3,
): CampaignLevel => ({
  id, number, chapter, name, intent, seed, botLevel,
  config: { ...BASE, boardRadius, board: spec },
});

/**
 * CHAPTER I — levels 1-10. AI = the existing bot level; the board is authored so the design's
 * rock counts are exact (the generator can only place mirrored PAIRS, so it can never make the
 * one-rock and three-rock boards the design asks for). Stones are placed off the home-to-home
 * diagonal (the central routes) and outside both root zones; every board is validated on load
 * (`validate.ts`) — legal, connected, and reachable from both homes.
 *
 * The 2026-10-16 refinement (owner direction): the levels that carried ONLY the centre gold (2, 4,
 * 8) now carry one mirrored gold pair as well, so every board from level 2 on rewards growth on gold
 * — a lever the first pass barely used — while staying open and gentle. Rock counts and bots are
 * untouched (design-exact); only gold counts and positions changed. Level 1 stays a single gold centre.
 *
 * Levels 1-3 also play on the TUTORIAL's small map (radius 2 → 19 hexes) by owner direction: the same
 * ground the tutorial teaches on, so the first three campaign levels stay small, quick and welcoming.
 * Levels 4-30 keep the full product hexagon (radius 3 → 37 hexes).
 */
export const CAMPAIGN_LEVELS: readonly CampaignLevel[] = Object.freeze([
  // A completely open board: a clean first win, no obstacle at all — the tutorial's own map and its
  // single gold centre, nothing else.
  level(1, 1, 'c1-01', 'First Seed', 95001, 1, board([], OPEN_GOLD, TUTORIAL_BOARD_RADIUS), 'Completely open, welcoming; the tutorial map.', TUTORIAL_BOARD_RADIUS),
  // A second open board on the small map: the centre gold plus one inner pair, so gold is worth
  // reaching for early without any obstacle to read.
  level(1, 2, 'c1-02', 'New Growth', 95002, 1, board([], RICH_PAIR_INNER, TUTORIAL_BOARD_RADIUS), 'Another open board; a first taste of contested gold.', TUTORIAL_BOARD_RADIUS),
  // The first stone, on the small map: one harmless edge hex, far from both homes and the centre.
  level(1, 3, 'c1-03', 'Two Directions', 95003, 1, board(['-2,0'], RICH_PAIR_R, TUTORIAL_BOARD_RADIUS), 'One harmless edge rock.', TUTORIAL_BOARD_RADIUS),
  // Open again, one step better: a stronger opponent on forgiving ground, now with gold off-centre.
  level(1, 4, 'c1-04', 'The Clearing', 95004, 2, board([], RICH_PAIR_Q), 'Open board, slightly better bot; gold on the q axis.'),
  // Two stones on opposite flanks, mirror images: neither home is favoured, the middle stays open.
  level(1, 5, 'c1-05', 'Stone in the Grass', 95005, 2, board(['-3,1', '3,-1'], RICH_PAIR_Q), 'Scattered rocks away from central routes.'),
  // One stone just off the diagonal: nudge around it, in either direction.
  level(1, 6, 'c1-06', 'Branching Out', 95006, 3, board(['0,1'], RICH_PAIR_Q), 'Encourage multiple directions.'),
  // A two-hex cluster on the left flank: the first real shape to route around.
  level(1, 7, 'c1-07', 'First Obstacle', 95007, 3, board(['-3,0', '-3,1'], RICH_PAIR_Q), 'Small rock cluster near a flank.'),
  // The strongest Chapter I opponent on a wide-open field: pure play, gold waiting on both wings.
  level(1, 8, 'c1-08', 'The Open Field', 95008, 3, board([], RICH_PAIR_FLANK), 'Stronger opponent, forgiving terrain; flank gold.'),
  // A short three-hex wall to walk around; the rich pair moved to the other axis so nothing overlaps.
  level(1, 9, 'c1-09', 'Around the Stone', 95009, 4, board(['-2,-1', '-2,0', '-1,-1'], RICH_PAIR_R), 'A short detour around blocked hexes.'),
  // The finale: a compact grove off-centre, the strongest Chapter I bot, everything so far at once.
  level(1, 10, 'c1-10', 'The First Grove', 95010, 4, board(['-1,0', '-1,-1', '0,-1'], RICH_PAIR_Q), 'Chapter finale testing the fundamentals.'),

  // ---------- CHAPTER II — BROKEN GROUND (11-20): learn to navigate ----------
  // The theme: rocks make decisions, not walls. Every board keeps a wide open middle and both
  // flanks usable, so Bloom and networks still have room; the step up is real but readable.
  // A few pebbles beside the trail, a mirrored pair: the gentlest way into broken ground.
  level(2, 11, 'c2-11', 'Pebble Trail', 95011, 4, board(['-1,-1', '1,1'], RICH_PAIR_Q), 'Two pebbles beside the trail; still wide open.'),
  // A short wall flanks the centre: two ways round it — over the top or under the bottom.
  level(2, 12, 'c2-12', 'Split Meadow', 95012, 5, board(['-1,0', '1,0', '-1,-1'], RICH_PAIR_R), 'A split down the middle; pick a lane.'),
  // The first real detour: a four-hex arc off the centre-left to walk around.
  level(2, 13, 'c2-13', 'The Detour', 95013, 5, board(['-2,0', '-1,0', '-1,-1', '-1,-2'], RICH_PAIR_R), 'A four-hex arc to route around.'),
  // Breathing space: one lone stone, a stronger opponent, and a second gold pair to race for.
  level(2, 14, 'c2-14', 'Open Horizon', 95014, 5, board(['0,1'], RICH_PAIR_Q), 'Open ground and a clearly better bot.'),
  // Twin crystals on opposite wings plus a central pair: two threats to answer at once.
  level(2, 15, 'c2-15', 'Twin Stones', 95015, 6, board(['-3,1', '3,-1', '-1,0', '1,0'], RICH_PAIR_R), 'Twin flanks and a central pair.'),
  // A broken line across the middle with two gaps: cross at the centre or slip through the notch.
  level(2, 16, 'c2-16', 'Broken Crossing', 95016, 6, board(['-2,0', '-1,0', '2,0', '3,0'], RICH_PAIR_INNER), 'A broken wall with two crossings.'),
  // A long wall on both inner flanks: the straight line is shut, so take the long way round.
  level(2, 17, 'c2-17', 'The Long Way', 95017, 6, board(['-1,0', '-1,-1', '-1,-2', '1,1', '1,2'], RICH_PAIR_R), 'Both inner lanes close early; go the long way.'),
  // Breathing space again: a thin central pair only, so the better bot has room to out-play you.
  level(2, 18, 'c2-18', 'Quiet Clearing', 95018, 7, board(['-1,0', '1,0'], RICH_PAIR_Q), 'Open again: fewer stones, a sharper bot.'),
  // A garden of five scattered stones, each one a small decision, none of them a wall.
  level(2, 19, 'c2-19', 'Stone Garden', 95019, 7, board(['-3,0', '-1,-1', '0,1', '1,1', '2,0'], RICH_PAIR_R), 'Five scattered stones, five small choices.'),
  // The chapter climax: a broken grove round the centre, the strongest Chapter II bot, five gold.
  level(2, 20, 'c2-20', 'The Broken Grove', 95020, 7, board(['-2,0', '-1,0', '0,-1', '1,0', '2,0'], ['0,0', '-2,-1', '2,1', '0,-3', '0,3']), 'Chapter finale: a broken grove, bot 7, five gold.'),

  // ---------- CHAPTER III — NARROW PATHS (21-30): fight for space ----------
  // The theme: contested hexes and corridors. No level leaves a single hex that decides the game:
  // every wall has at least two openings, and a defensive route always exists alongside the attack.
  // Two offset walls make one diagonal passage — the first real squeeze.
  level(3, 21, 'c3-21', 'The Passage', 95021, 8, board(['-2,0', '-1,0', '1,1', '2,1'], RICH_PAIR_R), 'Two offset walls leave a diagonal passage.'),
  // A fork: a central stone with lanes either side, then the flanks widen again behind it.
  level(3, 22, 'c3-22', 'Forked Path', 95022, 8, board(['-1,0', '1,0', '-1,-1', '1,1', '0,-1'], RICH_PAIR_Q), 'Choose a fork; the flanks reopen behind it.'),
  // A ring around the centre gold: the prize is real, but its approaches are only two.
  level(3, 23, 'c3-23', 'Central Ground', 95023, 8, board(['-1,0', '1,0', '0,1', '0,-1'], RICH_PAIR_FLANK), 'The centre is a fortress with two doors.'),
  // A ridge down one axis: the short way is walled, the side route stays open and safe.
  level(3, 24, 'c3-24', 'The Side Route', 95024, 8, board(['-1,-2', '-1,-1', '-1,0', '-1,3', '-2,0'], RICH_PAIR_R), 'A long ridge; take the side route.'),
  // Two blobs with a narrow neck between them: the obvious attack is a bottleneck.
  level(3, 25, 'c3-25', 'The Bottleneck', 95025, 9, board(['-3,1', '-3,0', '-2,0', '-2,-1', '2,0', '3,0'], RICH_PAIR_R), 'Two blobs and a narrow neck.'),
  // Stones in all four outer corners: the wide wings you had are gone.
  level(3, 26, 'c3-26', 'Four Corners', 95026, 9, board(['-3,0', '3,0', '-3,1', '3,-1'], RICH_PAIR_Q), 'The four corners are spoken for.'),
  // A mirrored split with a gap on each side: read it quickly and commit.
  level(3, 27, 'c3-27', 'Split Decision', 95027, 9, board(['-2,0', '-1,0', '-1,-1', '2,0', '1,0', '1,1'], ['0,0', '0,-3', '0,3']), 'One split, two choices, no time to dither.'),
  // Breathing space with the sharpest bot yet: almost no stones, so play decides it.
  // (Seed 95059, not the 95028 of the sequence: with 95028 the shipped deal is a four-turn Strangle
  // — verified identical on the classic generated board, so it is the deal and not this board —
  // which is not the open fight this level is meant to be. 95059 ships a close 24-turn game.)
  level(3, 28, 'c3-28', 'Open Conflict', 95059, 9, board(['0,1', '-1,0'], RICH_PAIR_Q), 'Almost open; the best bot in the campaign.'),
  // A crossing: a wall across the middle with a gap top and bottom, and gold on both.
  level(3, 29, 'c3-29', 'The Crossing', 95029, 9, board(['-2,0', '-1,0', '1,0', '2,0', '0,1', '0,-1'], ['0,0', '-2,-1', '2,1', '0,-2', '0,2']), 'Cross at the centre or around the ends.'),
  // The finale: a stone heart around the gold centre, bot 9, and gold at the far poles.
  level(3, 30, 'c3-30', 'Heart of Stone', 95030, 9, board(['-1,0', '1,0', '0,1', '0,-1', '-1,-1', '1,1'], ['0,0', '0,-3', '0,3']), 'The campaign finale: a stone heart round the gold centre.'),
  // Levels 31-70 live in their own file (levels-late.ts) so this list stays small and the parallel
  // onboarding work never has to merge 40 boards. Difficulty there comes from terrain, not a bot.
  ...CHAPTER_4_LEVELS,
  ...CHAPTER_5_LEVELS,
]);

export const CAMPAIGN_CHAPTERS: readonly CampaignChapter[] = Object.freeze([
  Object.freeze({
    number: 1,
    id: 'first-growth',
    levels: Object.freeze(CAMPAIGN_LEVELS.filter((l) => l.chapter === 1)),
  }),
  Object.freeze({
    number: 2,
    id: 'broken-ground',
    levels: Object.freeze(CAMPAIGN_LEVELS.filter((l) => l.chapter === 2)),
  }),
  Object.freeze({
    number: 3,
    id: 'narrow-paths',
    levels: Object.freeze(CAMPAIGN_LEVELS.filter((l) => l.chapter === 3)),
  }),
  Object.freeze({
    number: 4,
    id: 'hollow-ground',
    levels: Object.freeze(CAMPAIGN_LEVELS.filter((l) => l.chapter === 4)),
  }),
  Object.freeze({
    number: 5,
    id: 'gold-country',
    levels: Object.freeze(CAMPAIGN_LEVELS.filter((l) => l.chapter === 5)),
  }),
]);

/** The first level (always unlocked). */
export const FIRST_CAMPAIGN_LEVEL = CAMPAIGN_LEVELS[0]!;

export const campaignLevelById = (id: string): CampaignLevel | null =>
  CAMPAIGN_LEVELS.find((l) => l.id === id) ?? null;

/** The level at a 1-based campaign position, or null past the end. */
export const campaignLevelByNumber = (number: number): CampaignLevel | null =>
  CAMPAIGN_LEVELS.find((l) => l.number === number) ?? null;

/** The next level in campaign order, or null when the campaign as built is finished. */
export const nextCampaignLevel = (number: number): CampaignLevel | null =>
  campaignLevelByNumber(number + 1);
