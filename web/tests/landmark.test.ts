// Step 4: the two homes as landmarks (my tree, the opponent's volcano). Pure logic: the
// landmark's box on its tile (v0.8: top-down, inside its own hex; never over a neighbour's
// number or a Bloom ghost's number, in both orientations and at any tile size),
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
import { FULL_LOOK, centerOf } from '../src/ui/geom.js';
import { drawLandmark, setLandmarkState } from '../src/ui/landmarks.js';
import { MATERIAL_TOKENS } from '../src/logic/materials.js';
import type { MaterialToken } from '../src/logic/materials.js';

afterEach(() => setOrient('pointy'));

const circleHitsBox = (cx: number, cy: number, r: number, b: { x0: number; y0: number; x1: number; y1: number }) => {
  const nx = Math.max(b.x0, Math.min(cx, b.x1));
  const ny = Math.max(b.y0, Math.min(cy, b.y1));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
};

/** Inside a hex of size S centred at 0,0 (flat: points left-right; pointy: points up-down). */
const insideHex = (x: number, y: number, S: number, o: 'pointy' | 'flat') => {
  const [u, v] = o === 'flat' ? [x, y] : [y, x];
  const ax = Math.abs(u);
  const ay = Math.abs(v);
  return ay <= (Math.sqrt(3) / 2) * S + 1e-9 && Math.sqrt(3) * ax + ay <= Math.sqrt(3) * S + 1e-9;
};

describe('the landmark on its tile', () => {
  for (const o of ['pointy', 'flat'] as const) {
    for (const kind of ['tree', 'volcano'] as const) {
      it(`${o}, ${kind}: drawn top-down inside its own tile (v0.8), never over a neighbour's number`, () => {
        setOrient(o);
        for (const S of [18, 30, 44]) {
          const b = landmarkBox(kind, o, S);
          // v0.8 UI pass: the whole box lies inside its own hex (all four corners), so it never
          // rises above the tile or reaches into a neighbour
          for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]] as const) {
            expect(insideHex(x, y, S, o), `${o} ${kind} S=${S} corner ${x},${y}`).toBe(true);
          }
          expect(b.x1 - b.x0).toBeGreaterThan(1.1 * S); // still a real landmark: most of the tile
          expect(b.y1 - b.y0).toBeGreaterThan(1.0 * S);
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
  it('idle motion runs only with motion on; Reduce motion and Effects Low stop it; danger still trembles', () => {
    expect(landmarkMotion({ reduceMotion: false, effects: 'normal' }, false)).toEqual({ idle: true, worried: false });
    expect(landmarkMotion({ reduceMotion: true, effects: 'normal' }, false)).toEqual({ idle: false, worried: false });
    expect(landmarkMotion({ reduceMotion: false, effects: 'low' }, false)).toEqual({ idle: false, worried: false });
    expect(landmarkMotion({ reduceMotion: false, effects: 'normal' }, true)).toEqual({ idle: true, worried: true });
    // danger never trembles at Reduce motion; and it no longer asks for a ring at all
    expect(landmarkMotion({ reduceMotion: true, effects: 'normal' }, true)).toEqual({ idle: false, worried: false });
    expect('ring' in landmarkMotion({ reduceMotion: false, effects: 'normal' }, true)).toBe(false);
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

// The frame around a HOME that is being surrounded was removed completely (owner, 2026-11-14:
// "remove completely the frame that's showing up when the home tile is getting surrounded ...
// for now don't show it"). The ring group and its per-side segments must not be CREATED at all,
// not merely hidden, and no ring state class or `data-blocked` may be written. There is no jsdom
// in this repo, so a tiny DOM stub stands in (the pattern web/tests/seed-reveal.test.ts uses).
class StubNode {
  readonly attrs = new Map<string, string>();
  children: StubNode[] = [];
  readonly classes = new Set<string>();
  readonly style = { setProperty: (_key: string, _value: string) => undefined };
  constructor(readonly tag: string) {}
  setAttribute(key: string, value: string) {
    this.attrs.set(key, value);
  }
  appendChild(node: StubNode) {
    this.children.push(node);
    return node;
  }
  readonly classList = {
    toggle: (name: string, on?: boolean) => { if (on) this.classes.add(name); else this.classes.delete(name); },
    add: (name: string) => { this.classes.add(name); },
    remove: (name: string) => { this.classes.delete(name); },
  };
  /** Class selectors only (`.a, .b`), which is all the removed ring ever used. */
  querySelectorAll(selector: string): StubNode[] {
    const wanted = selector.split(',').map((part) => part.trim().replace(/^\./, ''));
    const out: StubNode[] = [];
    for (const child of this.children) {
      const names = (child.attrs.get('class') ?? '').split(/\s+/);
      if (wanted.some((w) => names.includes(w))) out.push(child);
      out.push(...child.querySelectorAll(selector));
    }
    return out;
  }
}

const COLORS = Object.fromEntries(MATERIAL_TOKENS.map((t) => [t, '#000000'])) as Record<MaterialToken, string>;

const installDocument = () => {
  const doc = globalThis as unknown as { document?: unknown };
  const previous = doc.document;
  doc.document = { createElementNS: (_ns: string, tag: string) => new StubNode(tag) as unknown as SVGElement };
  return () => {
    doc.document = previous;
  };
};

describe('no frame around a home that is being surrounded', () => {
  it('draws the landmark alone: no ring group and no side segments are created', () => {
    const restore = installDocument();
    try {
      for (const kind of ['tree', 'volcano'] as const) {
        for (const o of ['pointy', 'flat'] as const) {
          setOrient(o);
          const parent = new StubNode('g');
          const g = drawLandmark(parent as unknown as SVGGElement, kind, '0,0', { x: 0, y: 0 }, o, COLORS, FULL_LOOK);
          expect(g.querySelectorAll('.lm-ring').length, `${kind} ${o} ring`).toBe(0);
          expect(g.querySelectorAll('.lm-ring, .lm-seg').length, `${kind} ${o} segments`).toBe(0);
        }
      }
    } finally {
      restore();
    }
  });

  it('sets only idle/danger/worried/strangled/won: no ring classes and no data-blocked', () => {
    const g = new StubNode('g');
    setLandmarkState(g as unknown as SVGGElement, { danger: true, tapped: false, strangled: false, won: false, idle: true, worried: true });
    expect([...g.classes].sort()).toEqual(['danger', 'idle', 'worried']);
    expect(g.attrs.has('data-blocked')).toBe(false);
    // strangled replaces the living states entirely, and is alone
    setLandmarkState(g as unknown as SVGGElement, { danger: true, tapped: false, strangled: true, won: false, idle: true, worried: true });
    expect([...g.classes].sort()).toEqual(['strangled']);
    setLandmarkState(g as unknown as SVGGElement, { danger: false, tapped: false, strangled: false, won: true, idle: false, worried: false });
    expect([...g.classes].sort()).toEqual(['won']);
    expect(g.attrs.has('data-blocked')).toBe(false);
  });
});
