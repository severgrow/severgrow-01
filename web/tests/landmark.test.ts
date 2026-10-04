// Step 4: the two homes as landmarks (my tree, the opponent's volcano). Pure logic: the
// landmark's box on its tile (upright, rising at most a quarter tile above it, never over a
// neighbour's number or a Bloom ghost's number, in both orientations and at any tile size),
// deterministic variation, which idle motions run, the danger state, and the Strangle finish
// timeline (capped at 2.0 s at Normal speed, skippable, calm with Reduce motion).
import { afterEach, describe, expect, it } from 'vitest';
import { DIRECTIONS, coordKey } from '../../src/engine/index.js';
import { setOrient } from '../src/logic/orient.js';
import {
  FINISH_CAP_MS,
  landmarkBox,
  landmarkMotion,
  landmarkVariant,
  numberPlate,
  strangleFinish,
} from '../src/logic/landmark.js';
import { centerOf } from '../src/ui/geom.js';

afterEach(() => setOrient('pointy'));

const circleHitsBox = (cx: number, cy: number, r: number, b: { x0: number; y0: number; x1: number; y1: number }) => {
  const nx = Math.max(b.x0, Math.min(cx, b.x1));
  const ny = Math.max(b.y0, Math.min(cy, b.y1));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
};

describe('the landmark on its tile', () => {
  for (const o of ['pointy', 'flat'] as const) {
    for (const kind of ['tree', 'volcano'] as const) {
      it(`${o}, ${kind}: upright, at most a quarter tile above the tile, never over a neighbour's number`, () => {
        setOrient(o);
        for (const S of [18, 30, 44]) {
          const b = landmarkBox(kind, o, S);
          const tileH = o === 'pointy' ? 2 * S : Math.sqrt(3) * S;
          // it rises at most 25% of the tile height above the tile's top
          expect(-b.y0).toBeLessThanOrEqual(tileH / 2 + 0.25 * tileH + 1e-9);
          expect(b.x1 - b.x0).toBeGreaterThan(0.6 * S); // still a real landmark
          const plate = numberPlate(S);
          const c = centerOf('0,0');
          for (const d of DIRECTIONS) {
            const n = centerOf(coordKey(d));
            const px = ((n.x - c.x) * S) / 30;
            const py = ((n.y - c.y) * S) / 30;
            expect(circleHitsBox(px, py + plate.dy, plate.r, b), `${o} ${kind} S=${S} neighbour ${coordKey(d)}`).toBe(false);
          }
        }
      });
    }
  }
});

describe('deterministic variation and motion', () => {
  it('the same tile always gives the same look; different tiles may differ', () => {
    expect(landmarkVariant('-2,2')).toEqual(landmarkVariant('-2,2'));
    const all = new Set(['-2,2', '2,-2', '-3,3', '3,-3', '0,0'].map((k) => JSON.stringify(landmarkVariant(k))));
    expect(all.size).toBeGreaterThan(1);
    const v = landmarkVariant('2,-2');
    expect(v.sway).toBeGreaterThanOrEqual(0);
    expect(v.sway).toBeLessThanOrEqual(1);
  });
  it('idle motion runs only with motion on; Reduce motion and Effects Low stop it; danger shows its ring', () => {
    expect(landmarkMotion({ reduceMotion: false, effects: 'normal' }, false)).toMatchObject({ idle: true, ring: false });
    expect(landmarkMotion({ reduceMotion: true, effects: 'normal' }, false)).toMatchObject({ idle: false });
    expect(landmarkMotion({ reduceMotion: false, effects: 'low' }, false)).toMatchObject({ idle: false });
    expect(landmarkMotion({ reduceMotion: false, effects: 'normal' }, true)).toMatchObject({ ring: true, worried: true });
    // danger is shown even without motion (a still ring, no trembling)
    expect(landmarkMotion({ reduceMotion: true, effects: 'normal' }, true)).toMatchObject({ ring: true, worried: false });
  });
});

describe('the Strangle finish', () => {
  it('capped at 2.0 s at Normal speed, shorter when faster, none when animations are off', () => {
    const total = (b: { ms: number }[]) => b.reduce((n, x) => n + x.ms, 0);
    expect(total(strangleFinish({ speed: 1, reduceMotion: false }, 'volcano'))).toBeLessThanOrEqual(FINISH_CAP_MS);
    expect(total(strangleFinish({ speed: 1, reduceMotion: false }, 'tree'))).toBeLessThanOrEqual(FINISH_CAP_MS);
    expect(total(strangleFinish({ speed: 0.5, reduceMotion: false }, 'tree'))).toBeLessThanOrEqual(FINISH_CAP_MS / 2);
    expect(total(strangleFinish({ speed: 1.6, reduceMotion: false }, 'tree'))).toBeLessThanOrEqual(FINISH_CAP_MS * 1.6);
    expect(strangleFinish({ speed: 0, reduceMotion: false }, 'tree')).toEqual([]);
    expect(FINISH_CAP_MS).toBe(2000);
  });
  it('the beats: inward pulse, a slow beat, then the smother (volcano) or the withering (tree)', () => {
    expect(strangleFinish({ speed: 1, reduceMotion: false }, 'volcano').map((b) => b.k)).toEqual(['pulse', 'hold', 'smother', 'bloom']);
    expect(strangleFinish({ speed: 1, reduceMotion: false }, 'tree').map((b) => b.k)).toEqual(['pulse', 'hold', 'wither', 'roar']);
  });
  it('Reduce motion: no pulse, no burst, a short calm change only', () => {
    const b = strangleFinish({ speed: 1, reduceMotion: true }, 'volcano');
    expect(b.map((x) => x.k)).toEqual(['smother']);
    expect(b[0]!.ms).toBeLessThanOrEqual(600);
  });
});
