// The default board's ground (owner, 2026-11-14): slate, at 85% opacity, with its colour strength
// held at 40%. These are owner decisions, not tuning: the numbers below are the whole effect.
import { describe, expect, it } from 'vitest';
import { FA_BACKGROUND_INTENSITY, FA_BACKGROUND_OPACITY } from '../src/ui/defaultArtBoard.js';
import { faBackground } from '../src/ui/forestAsh.js';
import { DEFAULT_SKIN } from '../src/ui/skinChoice.js';

describe('the default board ground', () => {
  it('is the slate painting', () => {
    expect(DEFAULT_SKIN.background).toBe('slate');
    expect(faBackground()).toBe('slate');
  });

  it('shows at 85% opacity with 40% colour strength', () => {
    expect(FA_BACKGROUND_OPACITY).toBe(0.85);
    expect(FA_BACKGROUND_INTENSITY).toBe(0.4);
  });
});
