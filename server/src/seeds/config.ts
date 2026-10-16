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
