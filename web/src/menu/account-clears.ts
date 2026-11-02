// THE ACCOUNT HALF OF THIS DEVICE'S CAMPAIGN PLACE (owner brief, 2026-11-01).
//
// A signed-in player's campaign place is the UNION of this device's progress and the ACCOUNT's
// cleared levels. One answer serves two readers: `reconcileProgress` raises the local record to the
// account's place (level 35 on the phone, level 1 on the desktop), and the menu's campaign suggestion
// (web/src/menu/suggestion.ts) unions the same levels. The ten first-run lamps it was written for
// were removed on 2026-11-02; the read and its cache are NOT dead — the account-place rule still
// needs them on every signed-in boot.
//
// The account truth is `campaignHighestLevel`: the furthest Campaign level with a verified first-clear
// receipt, which the server reads as ONE indexed `max(...)` over `seed_reward_receipts (player_id,
// source_key)` where `mode = 'campaign'` (server/src/seeds/postgres.ts). It is deliberately NOT
// `campaign_clears` (migration 0021): that table is only written when a campaign REWARD PROOF is
// submitted, so ordinary wins never land in it.
//
// Levels unlock in order (docs/SPEC.md), so an account whose highest clear is N has cleared levels
// 1..N. `levelsFromHighest` is the whole derivation, and chapter-1 levels 1-10 are the lessons the
// menu's suggestion unions. A `lesson:10` receipt has no ordinal, so it cannot inflate the number.
//
// THE EFFICIENCY RULES (the hard part):
//   * signed-in only — a guest never asks;
//   * at most ONE request per player per page session, and a cache hit costs no request at all;
//   * one bounded GET, no polling, no repeating timer, no render loop, no parallel requests;
//   * the answer is cached under the existing `severgrow.*` namespace, keyed by PLAYER ID;
//   * a campaign clear forgets the cache, so the next open asks once more;
//   * every failure is `unavailable` — the caller keeps the device record exactly as it is.
import type { KeyValue } from '../../../server/src/client.js';
import { DuelClient } from '../../../server/src/client.js';
import { readAccountIdentity } from '../logic/account-progress.js';
import { duelApiUrl, duelRegion } from '../online/config.js';

/**
 * The account answer, keyed by the player it belongs to. One small object under one existing-family
 * key; a cache entry for another player is never borrowed. v2: the answer is derived from the
 * account's FURTHEST level (levels 1..N), not a set of reward-proof rows.
 */
export const ACCOUNT_CLEARS_KEY = 'severgrow.campaign.account-clears.v1';
/** A short internal deadline: the menu's first paint never waits for this, and a dead line ends. */
export const ACCOUNT_CLEARS_DEADLINE_MS = 3_000;
/** No campaign is near this; it only stops a corrupt answer allocating a huge array. */
const MAX_DERIVED_LEVEL = 200;

export type AccountClearsResult =
  | { readonly status: 'signed-out' }
  | { readonly status: 'ok'; readonly highest: number | null; readonly levels: readonly number[] }
  | { readonly status: 'unavailable' };

type CachedAccountClears = {
  version: 2;
  playerId: string;
  /** Campaign level numbers the account has cleared, derived as 1..highest. */
  levels: number[];
};

const isLevelNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_DERIVED_LEVEL;

/** Sorted, de-duplicated, positive integers only. A malformed entry is dropped, never guessed. */
export const normaliseLevels = (levels: readonly unknown[]): number[] =>
  [...new Set(levels.filter(isLevelNumber))].sort((a, b) => a - b);

/**
 * THE DERIVATION. An account's furthest verified Campaign level N means levels 1..N were cleared,
 * because the campaign unlocks in order. 0/absent/malformed is "nothing cleared". The array is
 * capped only so a corrupt payload cannot allocate unbounded memory.
 */
export const levelsFromHighest = (highest: number | null | undefined): number[] => {
  if (typeof highest !== 'number' || !Number.isFinite(highest) || highest < 1) return [];
  const top = Math.min(Math.floor(highest), MAX_DERIVED_LEVEL);
  const levels: number[] = [];
  for (let n = 1; n <= top; n++) levels.push(n);
  return levels;
};

/** The furthest level inside a sorted level list, or null when the account has cleared none. */
const highestOf = (levels: readonly number[]): number | null =>
  levels.length > 0 ? levels[levels.length - 1]! : null;

/**
 * The cached answer for exactly `playerId`, or null when there is no usable cache. A cache written
 * by another build/player, or any malformed value, reads as "no cache" — the safe direction: it
 * costs one read, it never hides the suggestion.
 */
export const readCachedAccountClears = (storage: KeyValue | null, playerId: string): number[] | null => {
  if (!storage) return null;
  try {
    const raw = storage.get(ACCOUNT_CLEARS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedAccountClears>;
    if (parsed.version !== 2 || parsed.playerId !== playerId || !Array.isArray(parsed.levels)) return null;
    return normaliseLevels(parsed.levels);
  } catch {
    return null;
  }
};

/** Remember a SUCCESSFUL answer only. A failed read never writes, so it cannot become the truth. */
export const writeCachedAccountClears = (storage: KeyValue | null, playerId: string, levels: readonly number[]): void => {
  if (!storage) return;
  try {
    const cached: CachedAccountClears = { version: 2, playerId, levels: normaliseLevels(levels) };
    storage.set(ACCOUNT_CLEARS_KEY, JSON.stringify(cached));
  } catch {
    // A blocked/full store is not an error the player should see: the next open asks again.
  }
};

/** Drop the remembered answer (used when this device's clear could have changed the account). */
export const forgetAccountClears = (storage: KeyValue | null): void => {
  if (!storage) return;
  try {
    storage.remove(ACCOUNT_CLEARS_KEY);
  } catch {
    /* Nothing to do: the cache is an optimisation. */
  }
};

/**
 * The cached answer for the identity on THIS device, or null for a guest/no identity. Used at
 * module start so a returning signed-in player's first paint already includes the account union
 * without a network request.
 */
export const cachedAccountClearsForThisDevice = (storage: KeyValue | null): number[] | null => {
  const identity = readAccountIdentity(storage);
  if (!identity || identity.kind !== 'account') return null;
  return readCachedAccountClears(storage, identity.playerId);
};

/**
 * The real read: one authenticated GET for the account's furthest verified Campaign level, with one
 * short deadline. A build with no online endpoint, a 404 from an older server, a network failure or
 * a timeout all reject, which `loadAccountClears` turns into `unavailable` — never an error surface.
 */
export const fetchAccountHighestLevel = async (token: string): Promise<number | null> => {
  const baseUrl = duelApiUrl();
  if (!baseUrl) throw new Error('This build has no online endpoint.');
  const region = duelRegion();
  const client = new DuelClient({ baseUrl, ...(region ? { region } : {}) });
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const deadline = setTimeout(() => controller?.abort(), ACCOUNT_CLEARS_DEADLINE_MS);
  try {
    return await client.accountCampaignHighest(token, controller ? { signal: controller.signal } : {});
  } finally {
    clearTimeout(deadline);
  }
};

export type AccountClearsDeps = {
  storage: KeyValue | null;
  /** The authenticated read of the account's furthest level. Production: `fetchAccountHighestLevel`. */
  fetchHighest: (token: string) => Promise<number | null>;
  /** Per-session attempt memory. Tests pass their own set so cases cannot leak into each other. */
  attempted?: Set<string>;
};

/** One attempt per player per page session, even when the read fails (no retry loop). */
const sessionAttempts = new Set<string>();
/** A second concurrent caller for the same player shares the first request. */
const inflight = new Map<string, Promise<AccountClearsResult>>();

/**
 * THE ONE READ. A guest or no identity answers `signed-out` and asks nothing. An account gets the
 * cached answer when one exists (no request), otherwise one bounded fetch. A failed fetch answers
 * `unavailable`, writes nothing, and is not retried in this session.
 */
export const loadAccountClears = async (deps: AccountClearsDeps): Promise<AccountClearsResult> => {
  const identity = readAccountIdentity(deps.storage);
  if (!identity || identity.kind !== 'account') return { status: 'signed-out' };

  const cached = readCachedAccountClears(deps.storage, identity.playerId);
  if (cached) return { status: 'ok', highest: highestOf(cached), levels: cached };

  const attempted = deps.attempted ?? sessionAttempts;
  const already = inflight.get(identity.playerId);
  if (already) return already;
  if (attempted.has(identity.playerId)) return { status: 'unavailable' };

  attempted.add(identity.playerId);
  const request = (async (): Promise<AccountClearsResult> => {
    let highest: number | null;
    try {
      highest = await deps.fetchHighest(identity.token);
    } catch {
      // Offline, a 401, a 500, an aborted request: the device's truth is untouched and nothing is
      // cached, so this failure cannot outlive the session as a false answer.
      return { status: 'unavailable' };
    }
    const levels = levelsFromHighest(highest);
    writeCachedAccountClears(deps.storage, identity.playerId, levels);
    return { status: 'ok', highest: highestOf(levels), levels };
  })().finally(() => inflight.delete(identity.playerId));
  inflight.set(identity.playerId, request);
  return request;
};
