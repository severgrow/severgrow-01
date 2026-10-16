// The Territory's selection line: `NAME #TAG · LEVEL 22 · YOURS`.
//
// Owner (2026-10-16): selecting a tile should show the holder's campaign level. The level comes from
// the server (its ownerLevel field), read from recorded campaign receipts, so the client only has to
// render it — and to render NOTHING when it is absent, so a player who never played the campaign is
// never shown a made-up `LEVEL 1`.
import { describe, expect, it } from 'vitest';
import { ownerLine } from '../src/online/world-selection.js';
import type { WorldClaimView } from '../src/online/world-selection.js';

const claim = (overrides: Partial<WorldClaimView> = {}): WorldClaimView => ({
  cellId: '0,0',
  ownerId: 'player-1',
  ownerName: 'RYK',
  ownerLevel: 22,
  ownerTag: 'VJJM',
  colour: 'hsl(163 34% 49%)',
  claimedAt: 1,
  ...overrides,
});

describe('the world selection line', () => {
  it('shows the owner’s campaign level when the server recorded one', () => {
    expect(ownerLine(claim(), false)).toBe('RYK #VJJM · LEVEL 22');
  });

  it('omits the level entirely when there is none (never invents LEVEL 1)', () => {
    expect(ownerLine(claim({ ownerLevel: null }), false)).toBe('RYK #VJJM');
  });

  it('keeps YOURS, with the level in front of it', () => {
    expect(ownerLine(claim(), true)).toBe('RYK #VJJM · LEVEL 22 · YOURS');
    expect(ownerLine(claim({ ownerLevel: null }), true)).toBe('RYK #VJJM · YOURS');
  });

  it('falls back to a neutral name when the server has no display name', () => {
    expect(ownerLine(claim({ ownerName: null, ownerLevel: null }), false)).toBe('Player #VJJM');
  });
});
