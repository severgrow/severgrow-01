// The Territory's selection line: `NAME #TAG · LEVEL 22 · YOURS`.
//
// Owner (2026-10-16): selecting a tile should show the holder's campaign level. The level comes from
// the server (its ownerLevel field), read from recorded campaign receipts, so the client only has to
// render it — and to render NOTHING when it is absent, so a player who never played the campaign is
// never shown a made-up `LEVEL 1`.
//
// 2026-10-24 — THE OWNER'S OWN REPORT: "on my account - im at level 23 - but on territory it says
// im level 11 - should never happen". The server's `ownerLevel` is the highest Campaign level they
// have been PAID for, not the level they are on: paid clears lag behind real progress whenever a
// proof is still queued on their device. That is right for somebody else's ground (it is the only
// fact the server has) and WRONG for your own, where the device knows exactly where you are. So an
// own tile now shows the number this device can stand behind, and never an older one.
import { describe, expect, it } from 'vitest';
import { ownLevel, ownerLine } from '../src/online/world-selection.js';
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

describe('your own ground shows where you actually are, not where you were last paid (owner, 2026-10-24)', () => {
  it('shows this device’s level over a stale paid level — the reported bug', () => {
    // The live shape of the report: the account is at level 23, the last campaign clear the server
    // was ever told about is level 11, so the map said LEVEL 11.
    expect(ownerLine(claim({ ownerLevel: 11 }), true, 23)).toBe('RYK #VJJM · LEVEL 23 · YOURS');
  });

  it('never goes BACKWARDS on a device with older local progress', () => {
    // Progress is per device. A second phone, or a cleared browser, has a fresher record than the
    // server only if the player has played there; otherwise the server's paid level is the higher
    // true fact and must win. Both numbers are "at least this far", so the larger one is the only
    // honest answer.
    expect(ownerLine(claim({ ownerLevel: 22 }), true, 1)).toBe('RYK #VJJM · LEVEL 22 · YOURS');
  });

  it('keeps YOURS when neither number is known, and never invents one', () => {
    expect(ownerLine(claim({ ownerLevel: null }), true, null)).toBe('RYK #VJJM · YOURS');
    expect(ownerLine(claim({ ownerLevel: null }), true, undefined)).toBe('RYK #VJJM · YOURS');
  });

  it('a first-time player sees LEVEL 1 on their own tile, the same number PLAY offers', () => {
    expect(ownerLine(claim({ ownerLevel: null }), true, 1)).toBe('RYK #VJJM · LEVEL 1 · YOURS');
  });

  it('somebody else’s tile is untouched: only what the server recorded', () => {
    // The client can never know another player's real progress, so a local level must not leak onto
    // their line even if one is passed in.
    expect(ownerLine(claim({ ownerLevel: 11 }), false, 23)).toBe('RYK #VJJM · LEVEL 11');
    expect(ownerLine(claim({ ownerLevel: null }), false, 23)).toBe('RYK #VJJM');
  });

  it('the rule itself: the larger of two true lower bounds, and nothing from junk', () => {
    expect(ownLevel(23, 11)).toBe(23);
    expect(ownLevel(1, 22)).toBe(22);
    expect(ownLevel(7, null)).toBe(7);
    expect(ownLevel(null, 7)).toBe(7);
    expect(ownLevel(null, null)).toBeNull();
    expect(ownLevel(undefined, undefined)).toBeNull();
    // A malformed payload must never paint a broken number.
    expect(ownLevel(Number.NaN, null)).toBeNull();
    expect(ownLevel(0, -4)).toBeNull();
    expect(ownLevel(11.5, null)).toBeNull();
    expect(ownLevel(Number.POSITIVE_INFINITY, null)).toBeNull();
  });
});
