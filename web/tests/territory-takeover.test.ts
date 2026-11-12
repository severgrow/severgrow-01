// THE TAKEOVER (owner, 2026-10-29: "create a special animation for that tile take over - simple but
// impressive"). The map is rebuilt on every paint, so the animation cannot be attached to the old
// node: it is driven by a DIFF of the claims before and after a refresh, exactly like `fogShift`.
//
// These tests pin the diff, not the pixels: exactly the cells that changed hands, nothing on an
// unchanged refresh, and nothing at all under Reduce motion.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { takeovers } from '../src/online/world-growth.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

type Claim = {
  cellId: string; ownerId: string; ownerName: string | null; ownerTag: string; colour: string; claimedAt: number;
};
const claim = (cellId: string, ownerId: string, colour = 'hsl(80 34% 49%)', ownerName = 'BloomHeron'): Claim => ({
  cellId, ownerId, ownerName, ownerTag: '1001', colour, claimedAt: 1,
});

describe('the takeover diff', () => {
  it('detects exactly the cells that changed hands, with both colours and the winner’s name', () => {
    const before = [
      claim('0,0', 'a'),
      claim('1,0', 'b', 'hsl(220 34% 49%)', 'RYK'),
      claim('2,0', 'b', 'hsl(220 34% 49%)', 'RYK'),
    ];
    const after = [
      claim('0,0', 'a'),
      claim('1,0', 'a'), // the one tile that changed hands
      claim('2,0', 'b', 'hsl(220 34% 49%)', 'RYK'),
    ];
    expect(takeovers(before, after)).toEqual([{
      cellId: '1,0', fromOwnerId: 'b', toOwnerId: 'a',
      fromColour: 'hsl(220 34% 49%)', toColour: 'hsl(80 34% 49%)', winnerName: 'BloomHeron',
    }]);
  });

  it('returns nothing on an unchanged refresh or on the first look', () => {
    const claims = [claim('0,0', 'a'), claim('1,0', 'b')];
    expect(takeovers(claims, claims)).toEqual([]);
    expect(takeovers(null, claims)).toEqual([]);
  });

  it('returns nothing under Reduce motion, where the map settles instantly', () => {
    expect(takeovers([claim('0,0', 'b')], [claim('0,0', 'a')], false)).toEqual([]);
  });

  it('ignores new land, an unowned tile and a same-owner repaint', () => {
    const before = [claim('0,0', 'a')];
    const after = [claim('0,0', 'a'), claim('1,0', 'a'), claim('2,0', 'b')];
    // 1,0 is new ground and 2,0 was not owned before: neither is a takeover.
    expect(takeovers(before, after)).toEqual([]);
  });

  it('is ordered by cell id, so the same diff draws the same frames everywhere', () => {
    const before = [claim('3,0', 'b'), claim('0,0', 'b')];
    const after = [claim('3,0', 'a'), claim('0,0', 'a')];
    expect(takeovers(before, after).map((tile) => tile.cellId)).toEqual(['0,0', '3,0']);
    expect(takeovers([...before].reverse(), [...after].reverse()).map((tile) => tile.cellId)).toEqual(['0,0', '3,0']);
  });
});

describe('the takeover is wired to the map, not to a one-off DOM node', () => {
  it('is computed from the previous claims BEFORE the new world replaces them', () => {
    const source = read('../src/online/world-view.ts');
    expect(source).toContain('takeovers(this.world?.claims ?? null, map.world.claims, interfaceMotionAllowed())');
    // It is kept as DATA so a repaint inside the beat can redraw it (like fogAtLastLook/mistShift).
    expect(source).toMatch(/private takeoverShift: Takeover\[\]/);
    expect(source).toMatch(/private takeoverNodes\(\)/);
    expect(source).toContain('svg.append(takeover)');
  });

  it('pauses with the map and stops under both reduced-motion selector lists', () => {
    const css = read('../src/online/online-css.ts');
    expect(css).toMatch(/\.world-grid\.moving[^{]*\.world-takeover-was/);
    const reduceLists = css.match(/html\.reduce-motion :is\([^)]*world-takeover-was[^)]*\)/g) ?? [];
    expect(reduceLists.length).toBe(1);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*world-takeover-was/);
  });
});
