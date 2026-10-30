// BLOOM GROWTH ORDER (owner, 2026-10-30: "make the bloom tiles appear always in order coming from the
// tile that it's growing from").
//
// The engine lists a Bloom's hexes in CARD order, which on the board can jump around the shape. The
// eye reads growth, not cards, so the reveal is one walk outward through the Bloom: it starts at the
// hex that touches the player's existing network (when several do, the one nearest home) and then
// visits the shape breadth-first, each next hex touching one already shown. Pure, so the live game
// (`buildSteps`) and the replay both reveal the same wave in the same order.
import { hexDistance, parseKey } from '../../../src/engine/index.js';

type Keyed = { key: string };

/**
 * The order to reveal a Bloom's tiles in. `network` is every key the player held BEFORE the Bloom
 * (their home included); `home` is their home's key. Every tile is kept exactly once, untouched.
 */
export const growthOrder = <T extends Keyed>(tiles: readonly T[], network: ReadonlySet<string>, home: string): T[] => {
  if (tiles.length < 2) return [...tiles];
  const homeAt = parseKey(home);
  const at = tiles.map((t) => parseKey(t.key));
  const fromHome = at.map((c) => hexDistance(c, homeAt));
  const near = (a: number, b: number) => hexDistance(at[a]!, at[b]!) === 1;
  const touchesNetwork = (i: number) => [...network].some((key) => hexDistance(parseKey(key), at[i]!) === 1);
  // Nearest home first, then the engine's own order: deterministic on every device.
  const rank = (a: number, b: number) => fromHome[a]! - fromHome[b]! || a - b;

  const all = tiles.map((_, i) => i);
  const seeds = all.filter(touchesNetwork).sort(rank);
  const shown: number[] = [];
  const seen = new Set<number>();
  const walkFrom = (start: number) => {
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const cur = queue.shift()!;
      shown.push(cur);
      for (const next of all.filter((j) => !seen.has(j) && near(cur, j)).sort(rank)) {
        seen.add(next);
        queue.push(next);
      }
    }
  };
  walkFrom(seeds[0] ?? [...all].sort(rank)[0]!);
  // A legal Bloom is one connected shape, so the walk above covers it. An old or odd record that is
  // not still gets every tile: each leftover piece grows from its own nearest-home hex.
  for (const i of [...all].sort(rank)) if (!seen.has(i)) walkFrom(i);
  return shown.map((i) => tiles[i]!);
};
