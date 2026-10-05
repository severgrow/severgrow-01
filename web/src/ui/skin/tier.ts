// Runtime art tiers (lo/hi): which one a board needs. Pure.
//   effective px per hex = tile CSS size (60 board units) x devicePixelRatio x zoom
// Phones (coarse pointer) start on lo unless the board is unusually large; after that the tier
// changes only past the upgrade / downgrade thresholds (hysteresis, so zooming doesn't flap).
import type { Tier } from './types.js';

export const pickTier = (current: Tier | null, effectivePx: number, coarse: boolean, policy: { upgradeAt: number; downgradeBelow: number }): Tier => {
  if (current === null) return effectivePx >= policy.upgradeAt * (coarse ? 1.25 : 1) ? 'hi' : 'lo';
  if (current === 'lo' && effectivePx >= policy.upgradeAt) return 'hi';
  if (current === 'hi' && effectivePx < policy.downgradeBelow) return 'lo';
  return current;
};
