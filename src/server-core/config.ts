// World rules, all in one place. Times are in milliseconds; `now` is always passed in
// (pure code never reads a clock).
import { CURRENT_RULES_VERSION } from '../engine/index.js';
import { CURRENT_BOT_VERSION } from '../bots/versions.js';

/** The rules and bot versions new tickets are issued for (older versions still verify). */
export const RULES_VERSION = CURRENT_RULES_VERSION;
export const BOT_VERSION = CURRENT_BOT_VERSION;

export type WorldConfig = {
  rulesVersion: string;
  botVersion: string;
  ticketTtl: number;
  maxBankedTokens: number;
  maxPlacementsPerDay: number;
  nicknameChangeEvery: number;
  maxLogLength: number;
};

export const DEFAULT_WORLD_CONFIG: WorldConfig = Object.freeze({
  rulesVersion: RULES_VERSION,
  botVersion: BOT_VERSION,
  ticketTtl: 2 * 3600_000,
  maxBankedTokens: 3,
  maxPlacementsPerDay: 10,
  nicknameChangeEvery: 30 * 86_400_000,
  maxLogLength: 10_000,
});

export const DAY = 86_400_000;
