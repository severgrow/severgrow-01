// Shaping the Campaign screen from what the SERVER RECORDED.
//
// WHY THIS FILE DOES NOT IMPORT THE CAMPAIGN LEVEL TABLE (docs/ADMIN.md, and the guard in
// tests/campaign/isolation.test.ts): the campaign's authored boards must never be reachable from
// the online server, so a campaign authoring mistake cannot change how online matches deal. The
// only server modules allowed to read those boards are the Seeds proof verifier
// (`server/src/seeds/verify.ts`, which reconstructs an offline board to validate a win) and the
// Seeds service that settles it. A read-only dashboard has no business there either.
//
// It does not need to. Everything on this screen comes from rows the server already wrote:
//   * `seed_reward_receipts` (mode 'campaign'): one row per verified campaign result, with the
//     opaque level id in `source_key` as `campaign:<levelId>`, whether Seeds were awarded, and the
//     denial reason for a repeat clear;
//   * `seed_ledger` (category 'campaign'): the ledger a paid first clear wrote, whose `metadata`
//     records the numeric level the server resolved at award time.
//
// So `levelId` is treated as an OPAQUE STRING here. The one thing that cannot be derived from
// recorded rows — the level number for a level nobody has ever cleared — is simply absent, and the
// screen says so rather than inventing it (`completeLevelListKnown: false`).
import { CAMPAIGN_LEVEL_REWARD_MAX, campaignSeedReward } from '../seeds/config.js';
import type { AdminCampaign, AdminValueCount } from './types.js';

/**
 * The levels the Seed economy already pays a CHAPTER bonus at (10, 20, … 70 today).
 *
 * Read from `campaignSeedReward` — the same constant the award path uses — rather than hardcoded,
 * so this rollup cannot drift from what the economy actually pays. It is a reward constant, not a
 * campaign board: nothing here describes terrain, bots or seeds. The range comes from the economy's
 * own cap: it used to be a literal 50, which silently filed levels 51-70 under the sixth chapter.
 */
export const chapterBoundaries = (): number[] =>
  Array.from({ length: CAMPAIGN_LEVEL_REWARD_MAX }, (_, index) => index + 1).filter((level) => (campaignSeedReward(level)?.chapter ?? 0) > 0);

/** 1-based chapter for a recorded level number, from the economy's own chapter boundaries. */
export const chapterOf = (level: number, boundaries: readonly number[]): number => {
  const index = boundaries.findIndex((boundary) => level <= boundary);
  return index === -1 ? boundaries.length + 1 : index + 1;
};

/** The opaque level id inside a settlement key (`campaign:c1-01` → `c1-01`). */
export const levelIdOfSourceKey = (sourceKey: string): string =>
  sourceKey.startsWith('campaign:') ? sourceKey.slice('campaign:'.length) : sourceKey;

/** One `seed_reward_receipts` row as this screen reads it. */
export type CampaignReceipt = { sourceKey: string; awarded: number; denial: string | null; utcDay: string };

/**
 * The numeric level the server recorded when it PAID a first clear, keyed by the same settlement
 * key. This is the authoritative number for a cleared level; an id that only ever produced denials
 * has no entry here, which the shaper reports honestly instead of guessing.
 */
export type CampaignPaidLevel = { sourceKey: string; level: number | null };

const dayOf = (utcDay: string): string => utcDay;

/**
 * Aggregate the recorded rows into the Campaign screen's payload.
 *
 * Counts are exact for what the database holds. What it cannot hold is the shape of the campaign
 * itself, so this returns `completeLevelListKnown: false` and the UI prints that a level nobody has
 * ever reached leaves no row to count.
 */
export const shapeCampaign = (receipts: readonly CampaignReceipt[], paidLevels: readonly CampaignPaidLevel[]): AdminCampaign => {
  const boundaries = chapterBoundaries();
  const paidById = new Map<string, number | null>();
  for (const row of paidLevels) {
    const id = levelIdOfSourceKey(row.sourceKey);
    if (!paidById.has(id)) paidById.set(id, row.level);
  }

  type LevelTally = { levelId: string; level: number | null; firstClears: number; awarded: number; attempts: number; denials: number };
  const levels = new Map<string, LevelTally>();
  const denials = new Map<string, number>();
  const sessions = new Map<string, number>();
  let firstClears = 0;
  let awarded = 0;
  let deniedCount = 0;

  for (const receipt of receipts) {
    // Territory achievements share the reward table (mode 'campaign', key `achievement:<id>`) but are
    // not levels: leave them out of the Campaign screen.
    if (receipt.sourceKey.startsWith('achievement:')) continue;
    const levelId = levelIdOfSourceKey(receipt.sourceKey);
    const tally = levels.get(levelId) ?? {
      levelId,
      level: paidById.get(levelId) ?? null,
      firstClears: 0,
      awarded: 0,
      attempts: 0,
      denials: 0,
    };
    tally.attempts += 1;
    if (receipt.awarded > 0) {
      tally.firstClears += 1;
      tally.awarded += receipt.awarded;
      firstClears += 1;
      awarded += receipt.awarded;
      const day = dayOf(receipt.utcDay);
      sessions.set(day, (sessions.get(day) ?? 0) + 1);
    } else {
      tally.denials += 1;
      deniedCount += 1;
      const reason = receipt.denial ?? 'denied';
      denials.set(reason, (denials.get(reason) ?? 0) + 1);
    }
    levels.set(levelId, tally);
  }

  const byLevel = [...levels.values()].sort((a, b) => {
    // Cleared levels first, then by recorded level number, then by opaque id so the order is total.
    const rank = (row: LevelTally) => (row.level === null ? Number.MAX_SAFE_INTEGER : row.level);
    return b.firstClears - a.firstClears || rank(a) - rank(b) || a.levelId.localeCompare(b.levelId);
  });

  // Chapter rollup: only levels whose number the server RECORDED can be placed in a chapter. A
  // level that was only ever refused (no paid clear) contributes to `byLevel`, never to a chapter.
  const chapterMap = new Map<number, { firstClears: number; awarded: number }>();
  for (const row of byLevel) {
    if (row.level === null || row.firstClears === 0) continue;
    const chapter = chapterOf(row.level, boundaries);
    const entry = chapterMap.get(chapter) ?? { firstClears: 0, awarded: 0 };
    entry.firstClears += row.firstClears;
    entry.awarded += row.awarded;
    chapterMap.set(chapter, entry);
  }
  const byChapter = [...chapterMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([chapter, entry]) => ({ chapter, ...entry }));

  const byReason: AdminValueCount[] = [...denials.entries()].sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n }));

  return {
    attempts: receipts.length,
    firstClears,
    awarded,
    denials: { count: deniedCount, byReason },
    byLevel,
    byChapter,
    sessions: [...sessions.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, clears]) => ({ day, clears })),
    chapterBoundaries: boundaries,
    completeLevelListKnown: false,
  };
};
