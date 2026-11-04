import { describe, expect, it } from 'vitest';
import { homeTile } from '../src/online/world-planet.js';

const held = (ownerId: string, claimedAt: number, ...ids: string[]) => ids.map((cellId) => ({ cellId, ownerId, colour: 'hsl(0 0% 50%)', claimedAt }));

describe('the planet opens on your biggest territory (owner, 2026-11-04)', () => {
  it('flies to the middle of the largest connected holding, not of all your tiles', () => {
    // A long connected row far right and a small cluster near the centre: the row wins.
    const claims = [...held('me', 5, '-1,0', '0,0'), ...held('me', 9, '6,0', '7,0', '8,0', '9,0', '10,0')];
    expect(homeTile(claims, 'me')).toBe('8,0');
  });
  it('ignores other players and falls back to the centre with no land', () => {
    expect(homeTile(held('rival', 1, '3,3', '3,4'), 'me')).toBe('0,0');
    expect(homeTile([], null)).toBe('0,0');
  });
  it('a tie goes to the holding with the oldest tile, so it never flips', () => {
    const claims = [...held('me', 20, '5,0', '6,0'), ...held('me', 2, '-5,0', '-6,0')];
    expect(['-5,0', '-6,0']).toContain(homeTile(claims, 'me'));
    expect(homeTile([...claims].reverse(), 'me')).toBe(homeTile(claims, 'me'));
  });
});
