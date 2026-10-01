// World rules, all in one place. Times are in milliseconds; `now` is always passed in
// (pure code never reads a clock).
export const RULES_VERSION = 'v0.4-defaults-1';

export type WorldConfig = {
  rulesVersion: string;
  ticketTtl: number;
  maxBankedTokens: number;
  maxPlacementsPerDay: number;
  nicknameChangeEvery: number;
  maxLogLength: number;
};

export const DEFAULT_WORLD_CONFIG: WorldConfig = Object.freeze({
  rulesVersion: RULES_VERSION,
  ticketTtl: 2 * 3600_000,
  maxBankedTokens: 3,
  maxPlacementsPerDay: 10,
  nicknameChangeEvery: 30 * 86_400_000,
  maxLogLength: 10_000,
});

export const DAY = 86_400_000;
