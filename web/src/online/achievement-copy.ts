/**
 * Territory achievement copy (server/src/seeds/achievements.ts decides and pays; this only names).
 *
 * Kept in the online layer beside `challenge-copy.ts` for the same reason: the currency word lives on
 * this side of the `src/strings.ts` seed-words boundary. One short title and one plain sentence each:
 * what to do, never how it is counted.
 */
import type { AchievementId } from '../../../server/src/seeds/achievements.js';

export const ACHIEVEMENT_COPY: Readonly<Record<AchievementId, { title: string; detail: string }>> = Object.freeze({
  roots: { title: 'Put down roots', detail: 'Grow your first tile' },
  neighbours: { title: 'Good neighbours', detail: 'Hold a tile next to another player' },
  'throw-down': { title: 'Throw down', detail: 'Send your first challenge' },
  'stand-ground': { title: 'Stand your ground', detail: 'Accept a challenge' },
  holding: { title: 'Small holding', detail: 'Hold 3 tiles' },
  conqueror: { title: 'Conqueror', detail: 'Win a challenge' },
  podium: { title: 'On the podium', detail: 'Reach the top 3' },
  estate: { title: 'Estate', detail: 'Hold 10 tiles' },
});

export const ACHIEVEMENTS_UI = Object.freeze({
  title: 'Achievements',
  claim: (seeds: number) => `CLAIM +${seeds}`,
  reward: (seeds: number) => `+${seeds}`,
  claimed: 'Claimed',
  claiming: '…',
  paid: (seeds: number) => `+${seeds} Seeds`,
  failed: 'That did not go through. Try again.',
  intro: 'Seeds for your first steps in Territory. Tap CLAIM when one lights up.',
});
