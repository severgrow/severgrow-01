// THE MENU'S TWO READ-OUTS MUST STICK (owner report, 2026-11-20):
//
//   "on live version, sometimes after exiting the planet - the planet button looses the tiles and
//    seeds count inside the button. - should not happen"
//
// A menu pass reads the wallet and the public map ONCE per menu show. Any of those reads can fail
// for a moment — a slow phone, a dropped request, the exit beat of the Planet racing the pass — and
// the old code then remembered `null` and painted `null`, so a pair the player had ALREADY seen went
// blank. The rule now is sticky PER IDENTITY: once a pair is known for the signed-in player, only a
// genuine sign-out (or another account taking over) may clear it. A player whose numbers were never
// known still sees the honest blank — no invented zeros. Another account's pair is never borrowed.
import { describe, expect, it } from 'vitest';
import { cachedTerritory, rememberTerritory, settledTerritory } from '../src/online/territory-cache.js';

const pair = (seeds: number, tiles: number) => ({ seeds, tiles, cells: 12, waiting: 0 });

describe('the last good Territory pair is remembered, per identity', () => {
  it('a failed read never erases a pair that is already known', () => {
    rememberTerritory('sticky-a', pair(128, 3));
    expect(cachedTerritory('sticky-a')).toMatchObject(pair(128, 3));
    // The wallet or the map failed on this pass: `territoryCounts` answered null.
    rememberTerritory('sticky-a', null);
    expect(cachedTerritory('sticky-a')).toMatchObject(pair(128, 3));
  });

  it('a fresh pair replaces the remembered one', () => {
    rememberTerritory('sticky-b', pair(10, 1));
    rememberTerritory('sticky-b', pair(210, 4));
    expect(cachedTerritory('sticky-b')).toMatchObject(pair(210, 4));
  });

  it('never lends one identity’s pair to another', () => {
    rememberTerritory('sticky-c', pair(300, 5));
    expect(cachedTerritory('sticky-other')).toBeNull();
    expect(cachedTerritory(null)).toBeNull();
    // A failure on the OTHER identity must not wipe the first one either.
    rememberTerritory('sticky-other', null);
    expect(cachedTerritory('sticky-c')).toMatchObject(pair(300, 5));
    expect(cachedTerritory('sticky-other')).toBeNull();
  });
});

describe('what a menu pass may paint after a read', () => {
  it('keeps the cached pair when the read failed (the owner’s disappearing numbers)', () => {
    rememberTerritory('paint-a', pair(128, 2));
    expect(settledTerritory('paint-a', null)).toMatchObject(pair(128, 2));
  });

  it('paints the fresh pair when the read succeeded', () => {
    rememberTerritory('paint-b', pair(128, 2));
    expect(settledTerritory('paint-b', pair(0, 0))).toMatchObject(pair(0, 0));
  });

  it('keeps the cached pair when identity was momentarily unavailable', () => {
    rememberTerritory('paint-c', pair(64, 7));
    expect(settledTerritory('paint-c', null)).toMatchObject(pair(64, 7));
  });

  it('stays honestly blank for an identity whose numbers were NEVER known', () => {
    expect(settledTerritory('paint-never', null)).toBeNull();
    expect(settledTerritory(null, null)).toBeNull();
    // A different account taking over sees its own (unknown) nothing, never the former pair.
    rememberTerritory('paint-d', pair(999, 9));
    expect(settledTerritory('paint-other', null)).toBeNull();
  });
});
