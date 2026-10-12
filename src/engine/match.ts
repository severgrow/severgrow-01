// The authoritative match setup (multiplayer readiness). A Futasaku 0.4 match is reproducible
// from its rules version, seed and initial configuration — including which seat moves first.
//
// `newGame` is the neutral deal: it always puts player 0 at the top. `newMatch` is the product
// and server opening: it applies the seeded starting-player lottery from the config's
// `startingPlayerLottery` flag (on for Futasaku 0.4, off for archived rules whose recorded
// matches always started with player 0). The browser and server-core both build their opening
// from `newMatch`, so the client and the verifier can never disagree about who starts.
import { randomInt, deriveSeed, mulberry32 } from './prng.js';
import { newGame } from './newGame.js';
import { resolveConfig } from './config.js';
import { rulesConfig, CURRENT_RULES_VERSION } from './versions.js';
import type { Player, RulesConfig, State } from './types.js';

/**
 * Stream salt for the starting-player lottery. Kept byte-identical to the original client
 * stream (0x57484f53, "WHOS") so existing 0.4 games keep the same first player.
 */
export const STARTING_PLAYER_STREAM = 0x57484f53;

/** The seat that moves first, deterministically from the match seed. */
export const startingPlayerFor = (seed: number): Player =>
  randomInt(mulberry32(deriveSeed(seed, STARTING_PLAYER_STREAM)), 2) === 1 ? 1 : 0;

/**
 * A persisted/online match record: everything needed to rebuild the opening state.
 * The same record must produce the same initial state anywhere.
 */
export type MatchSetup = {
  seed: number;
  rulesVersion: string;
  config: RulesConfig;
  startingPlayer: Player;
};

/** Builds the versioned setup for a rules version plus overrides (engine owns the lottery). */
export const matchSetup = (
  seed: number,
  rulesVersion: string = CURRENT_RULES_VERSION,
  overrides: Partial<RulesConfig> = {},
): MatchSetup => {
  if (!Number.isSafeInteger(seed)) throw new Error(`seed must be an integer, got ${seed}`);
  const base = rulesConfig(rulesVersion);
  if (!base) throw new Error(`unknown rules version "${rulesVersion}"`);
  const config = resolveConfig({ ...base, ...overrides });
  const startingPlayer = config.startingPlayerLottery ? startingPlayerFor(seed) : 0;
  return { seed, rulesVersion, config, startingPlayer };
};

/** The opening state for a setup: board, deal, and the authoritative first seat. */
export const stateFromSetup = (setup: MatchSetup): State => {
  const s = newGame(setup.seed, setup.config);
  return setup.startingPlayer === 0
    ? s
    : { ...s, startingPlayer: setup.startingPlayer, turnPlayer: setup.startingPlayer, actor: setup.startingPlayer };
};

/**
 * The product/server opening: the neutral deal with the deterministic starting seat applied.
 * `newGame` (player 0 first) stays the raw engine constructor for tests, bots and sims.
 */
export const newMatch = (seed: number, overrides: Partial<RulesConfig> = {}): State =>
  stateFromSetup(matchSetup(seed, CURRENT_RULES_VERSION, overrides));
