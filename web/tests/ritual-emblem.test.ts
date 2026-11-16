// The ritual's emblem cover (owner, 2026-11-16): while the kanji rises, the emblem's own kanji goes and
// its hex turns to sit on the middle tile. See player/ritual-emblem.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMBLEM_BOX, EMBLEM_VIEWBOX, RING_TURN_DEG, emblemParts, ringFitScale } from '../src/player/ritual-emblem.js';

const source = readFileSync(new URL('../src/assets/brand/hex-emblem.svg', import.meta.url), 'utf8');
const subpaths = (svg: string) => (svg.match(/M /g) ?? []).length;
const paths = (svg: string) => (svg.match(/<path /g) ?? []).length;

describe('the emblem splits into ring, tree and kanji', () => {
  const parts = emblemParts(source)!;

  it('finds all three', () => { expect(parts).not.toBeNull(); });

  it('the ring is only the two hex outlines', () => {
    expect(subpaths(parts.ring)).toBe(2);
    expect(parts.ring).toContain('M 625 124');
  });

  it('nothing is lost or drawn twice: every path of the file is in exactly one part', () => {
    expect(subpaths(parts.ring) + subpaths(parts.tree) + subpaths(parts.kanji)).toBe(subpaths(source));
    // the main path is split in two (ring, tree); every other path is copied once
    expect(paths(parts.ring) + paths(parts.tree) + paths(parts.kanji)).toBe(paths(source) + 1);
  });

  it('the kanji keeps its placement in the emblem', () => {
    expect(parts.kanji).toContain('translate(255.244 539.224) scale(0.372) translate(-27 -59)');
  });

  it('every part is drawn in the card\'s paint, never the brand cream', () => {
    for (const part of Object.values(parts)) expect(part).not.toContain('#FCEED2');
  });

  it('all three share one frame: the ring\'s own bounds', () => {
    const vb = `viewBox="${EMBLEM_VIEWBOX.x} ${EMBLEM_VIEWBOX.y} ${EMBLEM_VIEWBOX.w} ${EMBLEM_VIEWBOX.h}"`;
    for (const part of Object.values(parts)) expect(part).toContain(vb);
  });
});

describe('the turned ring lands on the tile', () => {
  it('turns a pointy-top hex flat-top', () => { expect(RING_TURN_DEG).toBe(30); });

  // Measured in web/e2e/ritual-centering.ts: the card and the middle tile on a phone and on a desktop.
  for (const [screen, card, tile] of [['390×844', 84.93, 66.57], ['1440×900', 114.83, 123.65]] as const) {
    it(`on ${screen} the ring's point-to-point width is the tile's, within a pixel`, () => {
      const turnedWidth = card * EMBLEM_BOX.width * (EMBLEM_VIEWBOX.h / EMBLEM_VIEWBOX.w);
      expect(Math.abs(turnedWidth * ringFitScale(card, tile) - tile)).toBeLessThan(1);
    });
  }

  it('a missing or absurd measurement never throws the ring across the board', () => {
    expect(ringFitScale(0, 60)).toBe(1);
    expect(ringFitScale(80, Number.NaN)).toBe(1);
    expect(ringFitScale(80, 4000)).toBe(2.4);
    expect(ringFitScale(80, 2)).toBe(0.6);
  });
});
