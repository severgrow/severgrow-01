// SEEDS ON THE CARD THE MOMENT THE GAME ENDS (owner, 2026-11-16/17: "seeds at the end of the game are
// coming kinda late ... make the planet and seeds payout as instant as possible").
//
// Measured on the live server: a Practice win is verified in 0.45-0.9 s, against the rival bots in
// 3-5 s, because the server replays the whole game (the only check a player cannot fake by sending
// "I won"). So the card no longer waits: the award is worked out here with the server's OWN rule
// (`planSeedReward`, the same function the server settles with) and this device's tally of the
// games it was paid for today (the daily limits). The proof is still sent and verified exactly as
// before; when its receipt says something else (a limit spent on another device, a level cleared
// elsewhere), the card shows the receipt. This replaces the 2026-10-25 rule "nothing on the card until
// the server has answered" — that rule was against a "pending" line that never resolved; a forecast
// is a number the receipt then confirms or corrects.
import { planSeedReward } from '../../../server/src/seeds/rewards.js';
import type { RewardMode } from '../../../server/src/seeds/types.js';

type KeyValue = { get(key: string): string | null; set(key: string, value: string): void };

/** `severgrow.*`: today's paid receipts on this device (UTC day, as the server counts). */
export const SEED_DAY_KEY = 'severgrow.seeds.day.v1';

type Tally = { day: string; paid: { key: string; mode: string; amount: number }[] };

const utcDay = (now: number): string => new Date(now).toISOString().slice(0, 10);

const read = (store: KeyValue, now: number): Tally => {
  const day = utcDay(now);
  try {
    const raw = JSON.parse(store.get(SEED_DAY_KEY) ?? 'null') as Partial<Tally> | null;
    if (raw && raw.day === day && Array.isArray(raw.paid)) {
      return { day, paid: raw.paid.filter((p) => p && typeof p.key === 'string' && typeof p.amount === 'number') };
    }
  } catch { /* a corrupt tally is no tally */ }
  return { day, paid: [] };
};

/** A receipt that paid (`amount > 0`, not a replay): counted once, for today's limits. */
export const noteSeedsPaid = (store: KeyValue, key: string, mode: RewardMode, amount: number, now: number = Date.now()): void => {
  if (!(amount > 0)) return;
  const tally = read(store, now);
  if (tally.paid.some((p) => p.key === key)) return;
  tally.paid.push({ key, mode, amount });
  try { store.set(SEED_DAY_KEY, JSON.stringify(tally)); } catch { /* private mode: no tally, the receipt still corrects */ }
};

export type SeedGame =
  | { kind: 'training'; outcome: 'win' | 'loss' | 'draw' }
  | { kind: 'campaign'; level: number };

/** What the server will pay for this game, by its own rule and today's tally. 0 = nothing to show. */
export const forecastSeeds = (store: KeyValue, game: SeedGame, now: number = Date.now()): number => {
  const tally = read(store, now);
  const repeatable = tally.paid.filter((p) => p.mode !== 'campaign');
  const input = game.kind === 'training'
    ? { mode: 'training' as const, outcome: game.outcome }
    : { mode: 'campaign' as const, outcome: 'win' as const, campaignLevel: game.level };
  return planSeedReward(
    { playerId: '', sourceKey: '', opponentId: null, now, ...input },
    {
      modePaid: tally.paid.filter((p) => p.mode === input.mode).length,
      pairPaid: 0,
      totalEarned: repeatable.reduce((n, p) => n + p.amount, 0),
    },
  ).amount;
};
