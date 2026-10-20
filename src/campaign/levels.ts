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
// Levels 1-10 use the same small-map radius as the optional Tutorial.
import { TUTORIAL_BOARD_RADIUS } from '../../web/src/logic/tutorial-script.js';

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
 * The small map (radius 2 → 19 hexes), used by levels 1-10. Its size comes from
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
 * Levels 1–20 double as the gradual learning journey. The first ten use the familiar 19-cell
 * tutorial-sized hexagon; level 11 introduces the normal 37-cell field without an AI spike.
 * Only authored terrain and existing bot tiers change. Stable ids preserve progress and rewards;
 * `legacy-levels-v1.ts` preserves the previous openings for saves and queued proof verification.
 */
export const CAMPAIGN_LEVELS: readonly CampaignLevel[] = Object.freeze([
  // DISCOVER: no terrain vocabulary yet. Every legal placement can teach the real turn.
  level(1, 1, 'c1-01', 'First Seed', 95001, 1, board([], [], 2), 'Draw, Grow and Throw on quiet ground.', 2),
  level(1, 2, 'c1-02', 'New Growth', 96003, 1, board([], [], 2), 'Repeat the turn with a genuine placement choice.', 2),
  level(1, 3, 'c1-03', 'Two Directions', 96326, 1, board([], [], 2), 'Choose between legal routes.', 2),
  // CONNECT: strength, protection and a possible sever appear before special cards are taught.
  level(1, 4, 'c1-04', 'The Clearing', 95004, 1, board([], [], 2), 'The tree anchors a connected network.', 2),
  level(1, 5, 'c1-05', 'Higher Ground', 96501, 1, board([], [], 2), 'Numbers and strengthening, without terrain distraction.', 2),
  level(1, 6, 'c1-06', 'Strong Branch', 96603, 2, board([], [], 2), 'Protect an expanding connection.', 2),
  level(1, 7, 'c1-07', 'The Weak Link', 97005, 2, board([], [], 2), 'Look for a vulnerable opposing link.', 2),
  // COMBINE: each special has an opening that actually carries the relevant cards.
  level(1, 8, 'c1-08', 'The Open Field', 96001, 2, board([], [], 2), 'A Bomb begins in hand; use it once an enemy touches the network.', 2),
  level(1, 9, 'c1-09', 'First Bloom', 96012, 2, board([], [], 2), 'A legal Bloom combination begins in hand.', 2),
  level(1, 10, 'c1-10', 'The First Grove', 95010, 2, board(['-2,0'], RICH_PAIR_INNER, 2), 'Gold scores twice; a first small-board finale.', 2),

  // EXPLORE: the full board opens first, then stones and contested gold arrive gradually.
  level(2, 11, 'c2-11', 'The Wider Field', 95011, 2, board([], OPEN_GOLD), 'Discover the full 37-cell board on open ground.'),
  level(2, 12, 'c2-12', 'Split Meadow', 95012, 3, board(['-2,0'], RICH_PAIR_R), 'A rock blocks a route without closing the centre.'),
  level(2, 13, 'c2-13', 'The Detour', 95013, 3, board(['-2,0', '-1,0'], RICH_PAIR_R), 'Go round a short rock pair.'),
  level(2, 14, 'c2-14', 'Open Horizon', 95014, 4, board(['0,1'], RICH_PAIR_Q), 'Contest valuable territory with room to manoeuvre.'),
  level(2, 15, 'c2-15', 'Twin Stones', 95015, 4, board(['-3,1', '3,-1', '-1,0'], RICH_PAIR_R), 'Combine expansion, strength and cuts.'),
  // INDEPENDENT: normal interface, optional help, and a smooth climb toward Chapter III.
  level(2, 16, 'c2-16', 'Broken Crossing', 95016, 5, board(['-2,0', '-1,0', '2,0', '3,0'], RICH_PAIR_INNER), 'Choose a crossing independently.'),
  level(2, 17, 'c2-17', 'The Long Way', 95017, 5, board(['-1,0', '-1,-1', '-1,-2', '1,1', '1,2'], RICH_PAIR_R), 'React when an opponent takes the easier route.'),
  level(2, 18, 'c2-18', 'Quiet Clearing', 95018, 6, board(['-1,0', '1,0'], RICH_PAIR_Q), 'Adapt to open space and a sharper opponent.'),
  level(2, 19, 'c2-19', 'Stone Garden', 95019, 6, board(['-3,0', '-1,-1', '0,1', '1,1', '2,0'], RICH_PAIR_R), 'Use all the familiar mechanics on varied terrain.'),
  level(2, 20, 'c2-20', 'The Broken Grove', 95020, 7, board(['-2,0', '-1,0', '0,-1', '1,0', '2,0'], ['0,0', '-2,-1', '2,1', '0,-3', '0,3']), 'Earn the first major milestone.'),

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
