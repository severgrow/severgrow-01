// RANDOM CAMPAIGN DEALS AND THE RESTART REST (owner, 2026-11-01).
//
// "I want deals to always be completely random. As if you'd be playing card game in real life."
// From level 11 up every attempt is a fresh shuffle; the level's authored board and bot level stay,
// so difficulty is terrain and bot only. Levels 1-10 are lessons and keep their one opening.
//
// THE SAFETY SWITCH. A random-deal win is paid only by a server that can rebuild the deal from its
// seed. An older server would refuse it, and a refused proof is dropped — the Seeds would be lost.
// So a page deals randomly only after the server has listed `RANDOM_DEALS_FEATURE` in its health
// answer; the answer is remembered, so offline play keeps the last known behaviour.
//
// THE REST. "If pressed 5 times without playing the game you're banned for 1 hour from campaign."
// Starting a new random deal while the previous one was left without a single move of the player's
// own is an abandon. The fifth abandon in a row rests the campaign for an hour (no deal starts);
// one real move, or a finished match, clears the count. Resuming a saved match is not a new deal.
//
// Pure functions over a small stored record, so the whole rule is unit-tested
// (web/tests/campaign-deals.test.ts); the page only wires it in.
import type { KeyValue } from '../../../server/src/client.js';
import type { CampaignLevel } from '../../../src/campaign/index.js';
import { RANDOM_DEALS_FEATURE, dealsRandomly } from '../../../src/campaign/index.js';

export const RANDOM_DEALS_KEY = 'severgrow.campaign.randomDeals.v1';
export const CAMPAIGN_REST_KEY = 'severgrow.campaign.rest.v1';
export const RESTART_LIMIT = 5;
export const REST_MS = 60 * 60 * 1000;

// ---- the safety switch ----

export const randomDealsEnabled = (kv: KeyValue | null): boolean => {
  try {
    return kv?.get(RANDOM_DEALS_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Ask the server once (boot) and remember its answer. Unreachable: keep the last answer.
 * Resolves to whether random deals are on now. Never throws.
 */
export const refreshRandomDeals = async (
  kv: KeyValue | null,
  fetchFeatures: () => Promise<readonly string[]>,
): Promise<boolean> => {
  let features: readonly string[];
  try {
    features = await fetchFeatures();
  } catch {
    return randomDealsEnabled(kv);
  }
  const on = features.includes(RANDOM_DEALS_FEATURE);
  try {
    kv?.set(RANDOM_DEALS_KEY, on ? '1' : '0');
  } catch {
    // Storage blocked: this session still follows the server's answer.
  }
  return on;
};

/** The deal one attempt is played on: a fresh shuffle, or the level's fixed opening. */
export const dealFor = (
  level: Pick<CampaignLevel, 'number' | 'seed'>,
  randomOn: boolean,
  rng: () => number,
): { seed: number; random: boolean } =>
  randomOn && dealsRandomly(level) ? { seed: rng(), random: true } : { seed: level.seed, random: false };

// ---- the restart rest ----

export type RestState = {
  v: 1;
  /** New deals in a row that replaced a deal with no move of the player's own. */
  abandons: number;
  /** A deal is open and the player has not moved in it yet. */
  open: boolean;
  /** Epoch ms the rest ends (0 = not resting). */
  restUntil: number;
};

export const emptyRest = (): RestState => ({ v: 1, abandons: 0, open: false, restUntil: 0 });

export const parseRest = (raw: string | null): RestState => {
  try {
    const s = JSON.parse(raw ?? '') as Partial<RestState> | null;
    if (!s || typeof s !== 'object' || Array.isArray(s) || s.v !== 1) return emptyRest();
    const { abandons, open, restUntil } = s;
    if (typeof abandons !== 'number' || !Number.isInteger(abandons) || abandons < 0) return emptyRest();
    if (typeof open !== 'boolean' || typeof restUntil !== 'number' || !Number.isFinite(restUntil)) return emptyRest();
    return { v: 1, abandons, open, restUntil };
  } catch {
    return emptyRest();
  }
};

/** How long the campaign still rests (0 = playable). Never more than one hour, whatever the clock did. */
export const restLeftMs = (state: RestState, now: number): number =>
  state.restUntil > now ? Math.min(state.restUntil - now, REST_MS) : 0;

/**
 * A new deal is about to start. Not allowed while resting; the fifth abandon in a row starts the
 * rest instead of the deal.
 */
export const startDeal = (state: RestState, now: number): { state: RestState; allowed: boolean } => {
  if (restLeftMs(state, now) > 0) return { state, allowed: false };
  const abandons = state.open ? state.abandons + 1 : 0;
  if (abandons >= RESTART_LIMIT) {
    return { state: { v: 1, abandons: 0, open: false, restUntil: now + REST_MS }, allowed: false };
  }
  return { state: { v: 1, abandons, open: true, restUntil: 0 }, allowed: true };
};

/** The player made a move of their own in the open deal: it is a real game now. */
export const markMoved = (state: RestState): RestState =>
  state.open || state.abandons ? { ...state, abandons: 0, open: false } : state;

/** The match finished (won, lost or drawn). */
export const finishDeal = (state: RestState): RestState => ({ ...state, abandons: 0, open: false });

export const readRest = (kv: KeyValue | null): RestState => {
  try {
    return parseRest(kv?.get(CAMPAIGN_REST_KEY) ?? null);
  } catch {
    return emptyRest();
  }
};

export const writeRest = (kv: KeyValue | null, state: RestState): void => {
  try {
    kv?.set(CAMPAIGN_REST_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked: the rest simply cannot be kept, and the game is never stopped by that.
  }
};
