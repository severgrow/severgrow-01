/** Economy v1. Only the server decides an award; previously settled entries keep their amount. */
export const SEED_ECONOMY = Object.freeze({
  version: 1,
  tileCost: 100,
  utcDailyRepeatableCap: 600,
  online: {
    queue: { win: 30, loss: 8, draw: 12, dailyMatches: 20, pairDailyMatches: 5 },
    friend: { win: 15, loss: 4, draw: 6, dailyMatches: 10, pairDailyMatches: 3 },
    training: { win: 10, loss: 3, draw: 0, dailyMatches: 5, pairDailyMatches: 0 },
  },
} as const);

export const campaignSeedReward = (level: number): { firstWin: number; chapter: number } | null => {
  if (!Number.isInteger(level) || level < 1 || level > 50) return null;
  const firstWin = level <= 3 ? 50 : level <= 20 ? 15 : level <= 40 ? 20 : 25;
  const chapter = ({ 10: 50, 20: 60, 30: 75, 40: 90, 50: 125 } as Record<number, number>)[level] ?? 0;
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
