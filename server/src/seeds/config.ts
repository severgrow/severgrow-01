/**
 * BETA PAYOUT MULTIPLIER (owner, 2026-10-26): "temporarily until i say to revert - lets keep the
 * same seeds payout system we have already, but make it pay double - twice as much as currently -
 * so all beta testers are encouraged more to get involved properly in the territory side of the
 * game. including bonuses and all".
 *
 * ONE number, applied at the single decision point (`planSeedReward`), so every paying path moves
 * together and reverting is this line back to 1: campaign first-clears, chapter bonuses, level 10's
 * 100, and every duel and training outcome.
 *
 * The daily CAP doubles with it. Doubling awards while leaving the cap at 600 would take the
 * doubling back at the ceiling, and the players who play most are exactly the ones it is meant to
 * encourage. The COUNT limits (`dailyMatches`, `pairDailyMatches`) are deliberately NOT doubled:
 * those guard how many matches may pay at all (anti-farming), not how much each pays.
 *
 * PRICES ARE UNTOUCHED - a tile still costs 100. A challenge costs NOTHING (owner, 2026-10-29): it
 * is a tile put at stake, never a Seed payment. That is the whole point: the payout rises and the
 * price does not, so Territory is reachable sooner.
 *
 * Receipts are idempotent and store the amount actually paid, so anything settled before this keeps
 * its old figure and a replayed clear returns that old figure. Only NEW settlements are doubled.
 */
export const BETA_PAYOUT_MULTIPLIER = 2;

/** Economy v1. Only the server decides an award; previously settled entries keep their amount. */
export const SEED_ECONOMY = Object.freeze({
  version: 1,
  tileCost: 100,
  /** What selling a tile back returns (owner, 2026-10-27: "selling your tile for 100 seeds"). */
  tileSaleReturn: 100,
  utcDailyRepeatableCap: 600,
  online: {
    queue: { win: 30, loss: 8, draw: 12, dailyMatches: 20, pairDailyMatches: 5 },
    friend: { win: 15, loss: 4, draw: 6, dailyMatches: 10, pairDailyMatches: 3 },
    training: { win: 10, loss: 3, draw: 0, dailyMatches: 5, pairDailyMatches: 0 },
  },
} as const);

/**
 * Territory challenges (docs/TERRITORY-CHALLENGES.md). There is NO Seed price since 2026-10-29: a
 * challenge is free, and the challenger puts one of their OWN tiles at stake instead
 * (`server/src/seeds/stake.ts`). The timers below are not economy values: they are the defender's
 * answer window and the outer bound on a linked duel that never resolves.
 */
export const WORLD_CHALLENGE_TTL_MS = 24 * 60 * 60 * 1000;
export const WORLD_CHALLENGE_STALE_MS = 7 * 24 * 60 * 60 * 1000;
/** At most this many OPEN outgoing challenges per challenger, and incoming per defender. */
export const WORLD_CHALLENGE_OPEN_LIMIT = 3;
/** Rows older than this are no longer listed in a player's outgoing history. */
export const WORLD_CHALLENGE_LIST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The last Campaign level the economy pays for. One constant, because three places must agree: the
 * award guard here, the admin's chapter rollup, and the campaign data. It moved 50 → 70 on
 * 2026-10-18 when chapters IV-VII were added.
 */
export const CAMPAIGN_LEVEL_REWARD_MAX = 70;

/**
 * The Campaign's first-clear payment and the chapter bonus at every tenth level.
 *
 * Levels 31-70 were added 2026-10-18. The cap moved from 50 to 70 in the same change, because a
 * level past the cap would have paid NOTHING and returned null — a "no reward" answer that looks
 * like a bug to the player and like a decision to the next reader. The tiers below are the owner's:
 * 50 for the three intro levels, then 15 / 20 / 25 as the levels get longer, with chapter bonuses
 * at every tenth level (60 and 70 are new, and larger: the late campaign is the long haul).
 */
export const campaignSeedReward = (level: number): { firstWin: number; chapter: number } | null => {
  if (!Number.isInteger(level) || level < 1 || level > CAMPAIGN_LEVEL_REWARD_MAX) return null;
  const firstWin = level <= 3 ? 50 : level <= 20 ? 15 : level <= 40 ? 20 : 25;
  const chapter = ({ 10: 50, 20: 60, 30: 75, 40: 90, 50: 125, 60: 150, 70: 200 } as Record<number, number>)[level] ?? 0;
  return { firstWin, chapter };
};

export const utcDay = (epochMs: number): string => new Date(epochMs).toISOString().slice(0, 10);

/**
 * The Campaign level number inside a recorded settlement key (`campaign:c3-22` → 22), or `null`.
 *
 * The level id is treated as an OPAQUE STRING, exactly as the admin shaper does: nothing in the
 * Seeds core imports the campaign definitions (docs/ADMIN.md, and the isolation guard in
 * tests/campaign/isolation.test.ts), so the ordinal is read straight out of the stored key with a
 * local pattern rather than a table lookup. The `campaign:c<chapter>-<level>` shape is the one the
 * settle path builds (`server/src/seeds/service.ts`); a key without it has no level, which is how a
 * player who never played the campaign honestly reports none.
 */
export const campaignLevelOfSourceKey = (sourceKey: string): number | null => {
  const match = /^campaign:c\d+-(\d+)$/.exec(sourceKey);
  return match ? Number(match[1]) : null;
};

/**
 * The tutorial's one payment (owner, 2026-10-24): winning level 10, the final lesson, pays 100
 * Seeds once — exactly one Territory claim. Levels 1-9 teach and pay nothing. Its receipt is
 * `lesson:10` (one per player, like a Campaign first clear).
 *
 * OWNER DECISION (2026-10-25), asked directly and answered: "nah 10th level pays 100 so its all
 * good". So the amounts `campaignSeedReward` carries for levels 1-9 are NOT to be paid: those
 * levels are the tutorial, their authored openings are not what the server replays, and level 10's
 * 100 is the deliberate reward for finishing the teaching. Do not enable a proof for 1-9 to "close
 * the gap" — that gap is the design.
 */
export const LESSON_SEED_REWARD = Object.freeze({ level: 10, seeds: 100 });
