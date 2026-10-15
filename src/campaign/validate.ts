// CAMPAIGN MODE — the validation layer. Every level's board must be PROVABLY legal and playable
// before the game can use it. This reuses the engine's own rules rather than re-implementing them:
// `resolveConfig` is the authority on the config (it throws `TERRAIN_INFEASIBLE`, `INVALID_BOARD`,
// `ROOT_OFF_BOARD`, unknown keys, bad numbers), and the checks below add only what the engine does
// not promise — a board a player can actually walk across.
//
// It fails LOUDLY and SPECIFICALLY: the error always names the level and what is wrong, and a
// broken level is never silently skipped or quietly replaced by a default board.
import { allNeighbors, boardNeighbors, coordKey, parseKey } from '../engine/index.js';
import { ConfigError, resolveConfig } from '../engine/index.js';
import type { BoardSpec } from '../engine/index.js';
import { LEVELS } from '../bots/levels.js';
import { CAMPAIGN_LEVELS, CAMPAIGN_CHAPTERS } from './levels.js';
import type { CampaignLevel } from './levels.js';

/** A campaign definition problem, always tagged with the level (or the campaign) it belongs to. */
export class CampaignError extends Error {
  readonly levelId: string;
  constructor(levelId: string, message: string) {
    super(levelId ? `campaign level ${levelId}: ${message}` : `campaign: ${message}`);
    this.name = 'CampaignError';
    this.levelId = levelId;
  }
}

export type LevelChecks = {
  /** Non-rock hexes a tile can be placed on. */
  openCells: number;
  rock: number;
  gold: number;
  /** Fewest open neighbours either home has (a home with few is easy to strangle). */
  minHomeOpenNeighbours: number;
};

/** Every non-rock hex reachable from `from` by walking open hexes. */
const reachable = (spec: BoardSpec, from: string): Set<string> => {
  const rock = new Set(spec.rock);
  const open = new Set(spec.cells.filter((k) => !rock.has(k)));
  const seen = new Set<string>();
  if (!open.has(from)) return seen;
  const stack = [from];
  seen.add(from);
  while (stack.length) {
    const k = stack.pop()!;
    for (const n of allNeighbors(parseKey(k))) {
      const nk = coordKey(n);
      if (open.has(nk) && !seen.has(nk)) {
        seen.add(nk);
        stack.push(nk);
      }
    }
  }
  return seen;
};

/** The extra, campaign-specific checks on an authored board. Throws `CampaignError`. */
const validateBoard = (level: CampaignLevel, spec: BoardSpec): LevelChecks => {
  const fail = (why: string): never => {
    throw new CampaignError(level.id, why);
  };
  const cells = spec.cells;
  if (new Set(cells).size !== cells.length) fail('board.cells has a duplicate hex');
  const cellSet = new Set(cells);
  for (const k of [...spec.rock, ...spec.gold]) {
    if (!cellSet.has(k)) fail(`board cell ${k} is not in board.cells`);
  }
  for (const k of [...spec.rock, ...spec.gold]) {
    try {
      parseKey(k);
    } catch {
      fail(`board key ${k} is malformed`);
    }
  }
  const rock = new Set(spec.rock);
  const gold = new Set(spec.gold);
  for (const k of gold) if (rock.has(k)) fail(`hex ${k} is both rock and gold`);
  const [h0, h1] = spec.homes;
  if (h0 === h1) fail('both homes are the same hex');
  if (!cellSet.has(h0) || !cellSet.has(h1)) fail('a home is not in board.cells');
  for (const h of spec.homes) if (rock.has(h) || gold.has(h)) fail(`home ${h} is terrain`);

  const open = cells.filter((k) => !rock.has(k));
  if (open.length < 20) fail(`only ${open.length} playable hexes — too cramped to play`);

  // Every open hex must be reachable from BOTH homes (a walled-off pocket is unplayable).
  for (const [i, home] of spec.homes.entries()) {
    const seen = reachable(spec, home);
    const missing = open.find((k) => !seen.has(k));
    if (missing) fail(`hex ${missing} is walled off from ${i === 0 ? 'your' : "the opponent's"} home`);
  }

  // A home needs somewhere to grow: with too few open neighbours it can be strangled at once.
  const openAround = (h: string) =>
    boardNeighbors(parseKey(h), { boardRadius: level.config.boardRadius ?? 3, rootStyle: 'ring2', board: spec }).filter(
      (n) => !rock.has(coordKey(n)),
    ).length;
  const minHomeOpenNeighbours = Math.min(openAround(h0), openAround(h1));
  if (minHomeOpenNeighbours < 3) {
    fail(`a home has only ${minHomeOpenNeighbours} open neighbours (easy to surround — Strangle)`);
  }

  return { openCells: open.length, rock: rock.size, gold: gold.size, minHomeOpenNeighbours };
};

/**
 * Validates one level: the bot level exists, the seed is a safe integer, and the config (with its
 * authored board) is legal and playable. Throws `CampaignError` naming the level, or returns the
 * board's counts. The engine's `ConfigError` is wrapped, never swallowed.
 */
export const validateLevel = (level: CampaignLevel): LevelChecks => {
  if (!Number.isSafeInteger(level.seed) || level.seed < 0) {
    throw new CampaignError(level.id, `seed must be a non-negative integer, got ${String(level.seed)}`);
  }
  if (!(LEVELS as readonly number[]).includes(level.botLevel)) {
    throw new CampaignError(level.id, `botLevel ${String(level.botLevel)} is not an existing bot level`);
  }
  try {
    resolveConfig(level.config);
  } catch (e) {
    if (e instanceof ConfigError) throw new CampaignError(level.id, `${e.code}: ${e.message}`);
    throw e;
  }
  const spec = level.config.board;
  if (spec) return validateBoard(level, spec);
  // No authored board: the config must still be terrain-feasible, which `resolveConfig` already
  // proved for the generated board. Report the generator's configured counts as the live terrain.
  return {
    openCells: 0,
    rock: level.config.rockCount ?? 0,
    gold: level.config.richCount ?? 0,
    minHomeOpenNeighbours: 6,
  };
};

/** The whole campaign: unique, contiguous ids/numbers/chapters, every level valid. Throws. */
export const validateCampaign = (levels: readonly CampaignLevel[] = CAMPAIGN_LEVELS): void => {
  const ids = new Set<string>();
  levels.forEach((level, i) => {
    if (ids.has(level.id)) throw new CampaignError(level.id, 'duplicate level id');
    ids.add(level.id);
    if (level.number !== i + 1) {
      throw new CampaignError(level.id, `level number ${level.number} does not match its position ${i + 1}`);
    }
    if (!level.name.trim()) throw new CampaignError(level.id, 'level name is empty');
    if (!Number.isInteger(level.chapter) || level.chapter < 1) {
      throw new CampaignError(level.id, `chapter ${String(level.chapter)} is not a positive integer`);
    }
    validateLevel(level);
  });
  const chapterNumbers = [...new Set(levels.map((l) => l.chapter))].sort((a, b) => a - b);
  chapterNumbers.forEach((n, i) => {
    if (n !== i + 1) throw new CampaignError('', `chapter ${n} is not contiguous (expected ${i + 1})`);
  });
  if (CAMPAIGN_CHAPTERS.some((c) => c.levels.length === 0)) {
    throw new CampaignError('', 'a chapter has no levels');
  }
};

/** The per-level counts for the balance report and docs (validates first). */
export const campaignChecks = (levels: readonly CampaignLevel[] = CAMPAIGN_LEVELS): Map<string, LevelChecks> => {
  const out = new Map<string, LevelChecks>();
  for (const level of levels) out.set(level.id, validateLevel(level));
  return out;
};
