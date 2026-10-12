// Server configuration. Times are epoch milliseconds and are always passed in by the caller
// (the service owns the clock), so the core logic stays testable and deterministic.
import { CURRENT_RULES_VERSION } from '../../src/engine/index.js';

export type ServerConfig = {
  /** The rules version every new match is created under. Immutable once a match exists. */
  rulesVersion: string;
  /** Hard cap on committed moves per match (guards storage and replay cost). */
  maxMovesPerMatch: number;
  /** Private invite-code length (Crockford base32, unambiguous alphabet). */
  inviteCodeLength: number;
  /** Maximum decoded JSON request body size in bytes. */
  maxBodyBytes: number;
  /** Open (waiting/active) matches a single player may own at once. */
  maxOpenMatchesPerPlayer: number;
  /**
   * Allowed browser origin for CORS, or '*' for local development only.
   * Production (Edge / deployed API) must be locked to https://severgrow.github.io
   * — the origin has no path (P-17).
   */
  corsOrigin: string;
};

/** The only production browser origin that may call the duel API. */
export const PRODUCTION_CORS_ORIGIN = 'https://severgrow.github.io';

export const DEFAULT_SERVER_CONFIG: ServerConfig = Object.freeze({
  rulesVersion: CURRENT_RULES_VERSION,
  maxMovesPerMatch: 10_000,
  inviteCodeLength: 8,
  maxBodyBytes: 64 * 1024,
  corsOrigin: '*',
  maxOpenMatchesPerPlayer: 10,
});
