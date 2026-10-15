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
 * A Chapter I board: the classic 37-hex hexagon with an authored rock/gold set. `rockCount` and
 * `richCount` in the config are ignored once `board` is set (the board carries its own terrain) —
 * they stay at their defaults and are never used to place a campaign rock.
 */
const board = (rock: readonly string[], gold: readonly string[]): BoardSpec => ({
  cells: [...CAMPAIGN_CELLS],
  rock: [...rock],
  gold: [...gold],
  homes: [CAMPAIGN_HOMES[0], CAMPAIGN_HOMES[1]],
});

/** An open board's only landmark: the gold centre, exactly where Classic's centre gold sits. */
const OPEN_GOLD = Object.freeze(['0,0'] as const);
/** A mirrored rich pair plus the centre — the shape Classic's generated terrain takes. */
const RICH_PAIR_Q = Object.freeze(['0,0', '-2,0', '2,0'] as const);
/** The same idea on the other axis (used where a rock owns a cell of RICH_PAIR_Q). */
const RICH_PAIR_R = Object.freeze(['0,0', '0,2', '0,-2'] as const);

/** Every Chapter I level plays on the classic hexagon at radius 3. */
const BASE: Partial<RulesConfig> = Object.freeze({ boardRadius: 3, rootStyle: 'ring2' });

const level = (
  number: number,
  id: string,
  name: string,
  seed: number,
  botLevel: Level,
  spec: BoardSpec,
  intent: string,
): CampaignLevel => ({
  id, number, chapter: 1, name, intent, seed, botLevel,
  config: { ...BASE, board: spec },
});

/**
 * CHAPTER I — levels 1-10. AI = the existing bot level; the board is authored so the design's
 * rock counts are exact (the generator can only place mirrored PAIRS, so it can never make the
 * one-rock and three-rock boards the design asks for). Stones are placed off the home-to-home
 * diagonal (the central routes) and outside both root zones; every board is validated on load
 * (`validate.ts`) — legal, connected, and reachable from both homes.
 */
export const CAMPAIGN_LEVELS: readonly CampaignLevel[] = Object.freeze([
  // A completely open board: a clean first win, no obstacle at all.
  level(1, 'c1-01', 'First Seed', 95001, 1, board([], OPEN_GOLD), 'Completely open, welcoming.'),
  // A second open board: the same lesson twice, so the rhythm lands before any obstacle.
  level(2, 'c1-02', 'New Growth', 95002, 1, board([], OPEN_GOLD), 'Another open board; reinforce the basics.'),
  // The first stone: one harmless edge hex, far from both homes and the central routes.
  level(3, 'c1-03', 'Two Directions', 95003, 1, board(['-3,0'], RICH_PAIR_Q), 'One harmless edge rock.'),
  // Open again, one step better: a stronger opponent on forgiving ground.
  level(4, 'c1-04', 'The Clearing', 95004, 2, board([], OPEN_GOLD), 'Open board, slightly better bot.'),
  // Two stones on opposite flanks, mirror images: neither home is favoured, the middle stays open.
  level(5, 'c1-05', 'Stone in the Grass', 95005, 2, board(['-3,1', '3,-1'], RICH_PAIR_Q), 'Scattered rocks away from central routes.'),
  // One stone just off the diagonal: nudge around it, in either direction.
  level(6, 'c1-06', 'Branching Out', 95006, 2, board(['0,1'], RICH_PAIR_Q), 'Encourage multiple directions.'),
  // A two-hex cluster on the left flank: the first real shape to route around.
  level(7, 'c1-07', 'First Obstacle', 95007, 2, board(['-3,0', '-3,1'], RICH_PAIR_Q), 'Small rock cluster near a flank.'),
  // The strongest Chapter I opponent on a wide-open field: pure play, no excuses.
  level(8, 'c1-08', 'The Open Field', 95008, 3, board([], OPEN_GOLD), 'Stronger opponent, forgiving terrain.'),
  // A short three-hex wall to walk around; the rich pair moved to the other axis so nothing overlaps.
  level(9, 'c1-09', 'Around the Stone', 95009, 3, board(['-2,-1', '-2,0', '-1,-1'], RICH_PAIR_R), 'A short detour around blocked hexes.'),
  // The finale: a compact grove off-centre, the strongest Chapter I bot, everything so far at once.
  level(10, 'c1-10', 'The First Grove', 95010, 3, board(['-1,0', '-1,-1', '0,-1'], RICH_PAIR_Q), 'Chapter finale testing the fundamentals.'),
]);

export const CAMPAIGN_CHAPTERS: readonly CampaignChapter[] = Object.freeze([
  Object.freeze({
    number: 1,
    id: 'first-growth',
    levels: Object.freeze(CAMPAIGN_LEVELS.filter((l) => l.chapter === 1)),
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
