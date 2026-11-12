// THE TERRITORY PALETTE (owner, 2026-10-30): twenty tile colours, proven apart by NUMBER, plus the
// two rules that keep a map readable — a stable colour per player, and no two neighbouring tiles of
// different owners wearing the same one.
//
// The numbers in this file are the contract. If a later edit adds a look-alike, the pairwise table
// below fails, and the failure names the two colours that collided.
import { describe, expect, it } from 'vitest';
import { contrastRatio, deltaE2000, pairwise, parseCssColour, toLab } from '../src/colour-distance.js';
import {
  HELD_DARK,
  HELD_LIGHT,
  MAP_GROUND,
  MIN_DELTA_E,
  PALETTE_SIZE,
  TILE_COLOURS,
  colourById,
  colourFor,
  colourIdFor,
  defaultColourId,
  isColourId,
  neighbourCellIds,
  resolveTileColours,
  shiftLightness,
} from '../src/tile-colours.js';
import { worldNeighbours } from '../server/src/world.js';

const CSS = TILE_COLOURS.map((colour) => colour.css);
const NAME_OF = new Map(TILE_COLOURS.map((colour) => [colour.css, colour.name]));
const GROUND = parseCssColour(MAP_GROUND);

/** The measured table, kept here so a change to it is a conscious edit, not an accident. */
const MEASURED = {
  normal: { min: 8.56, worst: 'Jade vs Lagoon' },
  protanopia: { min: 8.31, worst: 'Jade vs Lagoon' },
  deuteranopia: { min: 8.19, worst: 'Ember vs Fern' },
} as const;

describe('the palette', () => {
  it('is exactly twenty colours, each with a unique id, name and value', () => {
    expect(TILE_COLOURS).toHaveLength(20);
    expect(PALETTE_SIZE).toBe(20);
    expect(new Set(TILE_COLOURS.map((c) => c.id)).size).toBe(20);
    expect(new Set(TILE_COLOURS.map((c) => c.name)).size).toBe(20);
    expect(new Set(CSS).size).toBe(20);
    // Append-only ids: 0..19 in order, because the id is what the database stores.
    expect(TILE_COLOURS.map((c) => c.id)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    for (const colour of TILE_COLOURS) {
      expect(colour.name.trim()).toBe(colour.name);
      expect(colour.name.length).toBeGreaterThan(2);
    }
  });

  it('every value parses, and the shades are the map\'s own light/dark steps', () => {
    for (const colour of TILE_COLOURS) {
      expect(() => parseCssColour(colour.css)).not.toThrow();
      expect(colour.css).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
      expect(colour.light).toBe(shiftLightness(colour.css, HELD_LIGHT));
      expect(colour.dark).toBe(shiftLightness(colour.css, -HELD_DARK));
    }
    // The relationship the map has always used, unchanged for the hue it used to hand out:
    // hsl(h 34% 49%) painted 60 / 49 / 34.
    expect(shiftLightness('hsl(200 34% 49%)', HELD_LIGHT)).toBe('hsl(200 34% 60%)');
    expect(shiftLightness('hsl(200 34% 49%)', -HELD_DARK)).toBe('hsl(200 34% 34%)');
    // Anything that is not hsl() is handed back untouched, so an older server still paints.
    expect(shiftLightness('#8fd', 11)).toBe('#8fd');
  });

  it('every colour stands off the empty ground', () => {
    const groundLab = toLab(GROUND);
    for (const colour of TILE_COLOURS) {
      const rgb = parseCssColour(colour.css);
      // The face must be clearly lighter than empty land...
      expect(contrastRatio(rgb, GROUND), `${colour.name} face vs ground`).toBeGreaterThanOrEqual(1.75);
      // ...its darkest gradient stop must still be a surface, not a hole...
      expect(contrastRatio(parseCssColour(colour.dark), GROUND), `${colour.name} dark stop vs ground`).toBeGreaterThanOrEqual(1.1);
      // ...and in CIEDE2000 terms it must not read as "empty ground".
      expect(deltaE2000(toLab(rgb), groundLab), `${colour.name} vs ground`).toBeGreaterThanOrEqual(25);
    }
  });

  // THE TABLE. 190 pairs, three visions. The floor is 8 CIEDE2000 units at 46 px — roughly 3.5× the
  // just-noticeable difference — and the measured minimum is pinned beside it.
  for (const vision of ['normal', 'protanopia', 'deuteranopia'] as const) {
    it(`keeps every pair at least ${MIN_DELTA_E} apart under ${vision}`, () => {
      const pairs = pairwise(CSS, vision);
      expect(pairs).toHaveLength(190);
      const worst = pairs[0]!;
      const label = `${NAME_OF.get(worst.a)} vs ${NAME_OF.get(worst.b)}`;
      expect(worst.distance, `worst pair under ${vision}: ${label}`).toBeGreaterThanOrEqual(MIN_DELTA_E);
      // Pinned: the palette may not silently get worse than what was measured and reviewed.
      expect(Number(worst.distance.toFixed(2)), `worst pair under ${vision}: ${label}`).toBeCloseTo(MEASURED[vision].min, 2);
      expect(label).toBe(MEASURED[vision].worst);
    });
  }

  it('only clamps to a known id; an unknown one is never a colour', () => {
    expect(colourById(0).name).toBe('Rose');
    expect(colourById(19).name).toBe('Plum');
    // A row written by a newer server must not blank a map: unknown falls back to the first slot.
    expect(colourById(20).id).toBe(0);
    expect(colourById(-1).id).toBe(0);
    expect(isColourId(19)).toBe(true);
    expect(isColourId(20)).toBe(false);
    expect(isColourId(1.5)).toBe(false);
    expect(isColourId('3')).toBe(false);
  });
});

const findCollidingIds = (): [string, string] => {
  const seen = new Map<number, string>();
  for (let i = 0; i < 400; i++) {
    const id = `player-${i}`;
    const slot = defaultColourId(id);
    const other = seen.get(slot);
    if (other) return [other, id];
    seen.set(slot, id);
  }
  throw new Error('no two player ids collided in 400 tries — the derivation is not a 20-slot fold');
};

describe('a player\'s colour', () => {
  it('is derived from the player id, the same on every call and every device', () => {
    const id = '4d1f0a52-2b6e-4f5d-9a01-77e2c9b0a111';
    const first = defaultColourId(id);
    expect(defaultColourId(id)).toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(PALETTE_SIZE);
    // Not a constant: different players land on different slots.
    expect(new Set(Array.from({ length: 40 }, (_, i) => defaultColourId(`p${i}`))).size).toBeGreaterThan(1);
    // And not the old continuous hue space: the wire value is one of the twenty.
    expect(CSS).toContain(colourFor(id));
  });

  it('prefers a stored choice, and falls back to the derived one without inventing a colour', () => {
    const id = 'player-stored';
    const derived = defaultColourId(id);
    const chosen = (derived + 7) % PALETTE_SIZE;
    expect(colourIdFor(id, chosen)).toBe(chosen);
    expect(colourFor(id, chosen)).toBe(TILE_COLOURS[chosen]!.css);
    // No row, a null row, or a row this build cannot name: the derived default, unchanged.
    expect(colourIdFor(id, null)).toBe(derived);
    expect(colourIdFor(id)).toBe(derived);
    expect(colourIdFor(id, undefined)).toBe(derived);
    expect(colourIdFor(id, 20)).toBe(derived);
    expect(colourIdFor(id, Number.NaN)).toBe(derived);
  });
});

describe('two players in the same region', () => {
  it('finds a real collision to test with', () => {
    const [a, b] = findCollidingIds();
    expect(defaultColourId(a)).toBe(defaultColourId(b));
    expect(a).not.toBe(b);
  });

  it('never leaves two adjacent tiles of different owners the same colour', () => {
    const [a, b] = findCollidingIds();
    // A 3×3 block of the map where the two colliding players meet along a shared edge.
    const claims = [
      { cellId: '0,0', ownerId: a, claimedAt: 1_000 },
      { cellId: '1,0', ownerId: b, claimedAt: 1_001 },
    ];
    const resolved = resolveTileColours(claims);
    expect(resolved.get('0,0')).not.toBe(resolved.get('1,0'));
    // The OLDER claim keeps its colour; the newer one steps aside into an adjacent hue.
    expect(resolved.get('0,0')).toBe(defaultColourId(a));
    expect(resolved.get('1,0')).not.toBe(defaultColourId(b));
  });

  it('leaves a collision that is not adjacent alone', () => {
    const [a, b] = findCollidingIds();
    const claims = [
      { cellId: '0,0', ownerId: a, claimedAt: 1 },
      { cellId: '5,5', ownerId: b, claimedAt: 2 },
    ];
    const resolved = resolveTileColours(claims);
    expect(resolved.get('0,0')).toBe(defaultColourId(a));
    expect(resolved.get('5,5')).toBe(defaultColourId(b));
  });

  it('lets one player\'s own tiles share a colour, however they meet', () => {
    const claims = ['0,0', '1,0', '1,-1', '0,-1'].map((cellId, i) => ({ cellId, ownerId: 'solo', claimedAt: i }));
    const resolved = resolveTileColours(claims);
    expect(new Set(resolved.values()).size).toBe(1);
    expect(resolved.get('0,0')).toBe(defaultColourId('solo'));
  });

  it('resolves the whole map the same way whatever order the claims arrive in', () => {
    const [a, b] = findCollidingIds();
    const claims = [
      { cellId: '0,0', ownerId: a, claimedAt: 10 },
      { cellId: '1,0', ownerId: b, claimedAt: 11 },
      { cellId: '2,0', ownerId: a, claimedAt: 12 },
      { cellId: '0,-1', ownerId: b, claimedAt: 9 },
    ];
    const forward = resolveTileColours(claims);
    const backward = resolveTileColours([...claims].reverse());
    expect([...backward.entries()].sort()).toEqual([...forward.entries()].sort());
    // The invariant, checked over every pair of adjacent tiles in the fixture.
    for (const claim of claims) {
      const mine = forward.get(claim.cellId)!;
      for (const id of neighbourCellIds(claim.cellId)) {
        const other = claims.find((c) => c.cellId === id);
        if (!other || other.ownerId === claim.ownerId) continue;
        expect(forward.get(id), `${claim.cellId} vs ${id}`).not.toBe(mine);
      }
    }
  });

  it('a stored choice is honoured when it does not clash, and stepped aside when it would', () => {
    const [a, b] = findCollidingIds();
    const chosen = (defaultColourId(a) + 3) % PALETTE_SIZE;
    const alone = resolveTileColours([{ cellId: '0,0', ownerId: a, claimedAt: 1, chosen }]);
    expect(alone.get('0,0')).toBe(chosen);
    // b also chose `chosen` and is adjacent, later: b steps aside, a keeps it.
    const together = resolveTileColours([
      { cellId: '0,0', ownerId: a, claimedAt: 1, chosen },
      { cellId: '1,0', ownerId: b, claimedAt: 2, chosen },
    ]);
    expect(together.get('0,0')).toBe(chosen);
    expect(together.get('1,0')).not.toBe(chosen);
  });
});

describe('the cell map', () => {
  it('agrees with the server\'s own six neighbours (the two lists must not drift)', () => {
    for (const cellId of ['0,0', '3,-6', '-9,4', '7,10', '-2,-3']) {
      expect([...neighbourCellIds(cellId)].sort()).toEqual([...worldNeighbours(cellId)].sort());
    }
    expect(neighbourCellIds('not-a-cell')).toEqual([]);
  });
});
