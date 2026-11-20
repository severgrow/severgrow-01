// THE SIX IN-GAME SKINS (owner's design, docs/SKINS-PROPOSAL.md). Behaviour, not internals:
//  - the six ids exist, are valid, and each family paints its stated number of grounds + a home;
//  - an unknown or legacy id is never trusted and never crashes: it resolves to NO skin, so the
//    board draws what it always drew (Forest against Ash);
//  - with no choice stored, the default resolves to Forest / Ash and no skin at all;
//  - Voxel's ground is weighted (the picker's own stream, not the hash sort — see voxel-weighting);
//  - Nero's three road ribbons are all exactly 0.07 H wide, which is what makes the seams join.
//
// The picker belongs to the admin account, so these run signed in as it (see skin-picker-gate).
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('location', { pathname: '/test/', hostname: 'futasaku.com', search: '', href: 'https://futasaku.com/test/' });
vi.stubGlobal('window', { addEventListener: () => undefined });
const data = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => { data.set(k, v); },
  removeItem: (k: string) => { data.delete(k); },
});
const signIn = (displayName: string) => data.set('severgrow.duel.identity.v1', JSON.stringify({
  token: 'tok', playerId: '11111111-1111-4111-8111-111111111111', displayName, kind: 'account',
}));
signIn('RYK');

const { chooseSkin, skinChoice, DEFAULT_SKIN } = await import('../src/ui/skinChoice.js');
const { TILE_SKIN_IDS, TILE_SKIN_NAMES, TILE_SKIN_GROUNDS, TILE_SKIN_BASE, setTileSkins, tileSkinFor, tileSkinOf, tileSkinVariants } =
  await import('../src/ui/tileSkins.js');
const { ART_H, ART_W, tileSkinArt, tileSkinVariant } = await import('../src/ui/tileSkinArt.js');
const { allCoords, coordKey } = await import('../../src/engine/index.js');

beforeEach(() => {
  signIn('RYK');
  chooseSkin({ mine: 'forest', theirs: 'ash', background: 'slate', tileMine: null, tileTheirs: null });
});

describe('the six approved skins', () => {
  it('exist, in the approved order, with the names the picker shows', () => {
    expect([...TILE_SKIN_IDS]).toEqual(['console', 'voxel', 'brushed', 'carrara', 'nero', 'hypnosis']);
    expect(TILE_SKIN_IDS.map((id) => TILE_SKIN_NAMES[id])).toEqual(['Console', 'Voxel', 'Brushed', 'Carrara', 'Nero', 'Hypnosis']);
  });

  it('paint the stated number of grounds (9 / 14 / 7 / 6 / 7 / 7), each with a home', () => {
    expect(TILE_SKIN_GROUNDS).toEqual({ console: 9, voxel: 14, brushed: 7, carrara: 6, nero: 7, hypnosis: 7 });
    for (const id of TILE_SKIN_IDS) {
      const n = TILE_SKIN_GROUNDS[id];
      expect(tileSkinVariant(id, n + 4), `${id} clamps a variant past its range`).toBe(n - 1);
      expect(tileSkinVariant(id, -3)).toBe(0);
      for (let v = 0; v < n; v++) {
        const art = tileSkinArt(id, v);
        expect(art.hex.length + art.face.length + art.above.length, `${id} v${v} paints something`).toBeGreaterThan(0);
        expect(art.rim).toBeGreaterThan(0);
        // every stop is inside the gradient and in order — a mis-ordered stop silently paints
        // the wrong colour region rather than failing
        for (const shape of [...art.hex, ...art.face, ...art.above, ...art.whole]) {
          if (shape.t === 'dots') continue;
          if (shape.p.t === 'flat') continue;
          const stops = shape.p.stops;
          expect(stops.length, `${id} v${v}: a gradient with stops`).toBeGreaterThan(1);
          let last = -1;
          for (const [o] of stops) {
            expect(Number.isFinite(o), `${id} v${v}: stop offset is a number`).toBe(true);
            expect(o).toBeGreaterThanOrEqual(0);
            expect(o).toBeLessThanOrEqual(1);
            expect(o, `${id} v${v}: stops are non-decreasing`).toBeGreaterThanOrEqual(last);
            last = o;
          }
          if (shape.p.t === 'rad') {
            expect(shape.p.r[0]).toBeGreaterThan(0);
            expect(shape.p.r[1]).toBeGreaterThan(0);
          }
        }
      }
      expect(tileSkinArt(id, 0, true).face.length + tileSkinArt(id, 0, true).hex.length, `${id} has a home`).toBeGreaterThan(0);
    }
  });

  it('are pure: the same (family, variant) always builds the same art', () => {
    for (const id of TILE_SKIN_IDS) {
      expect(tileSkinArt(id, 1)).toEqual(tileSkinArt(id, 1));
      expect(tileSkinArt(id, 0, true)).toEqual(tileSkinArt(id, 0, true));
    }
  });

  it('give each side its own fixed base colour, so an unloaded picture never shows Forest green', () => {
    for (const id of TILE_SKIN_IDS) expect(TILE_SKIN_BASE[id]).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(TILE_SKIN_IDS.map((id) => TILE_SKIN_BASE[id])).size, 'six different bases').toBe(6);
  });
});

describe('Voxel weights its ground through the family picker', () => {
  it('hands plain ground out about three times as often as a feature', () => {
    const keys = allCoords(3).map(coordKey);
    const counts = new Array<number>(14).fill(0);
    for (let b = 0; b < 120; b++) for (const v of tileSkinVariants('voxel', keys).values()) counts[v]!++;
    const total = counts.reduce((a, b) => a + b, 0);
    const features = counts.slice(4).reduce((a, b) => a + b, 0) / 10;
    expect(counts[0]! / features).toBeGreaterThan(2.5);
    expect(counts[0]! / total).toBeGreaterThan(0.12);
  });

  it('resolves a family the same way twice, and differently for two families', () => {
    const keys = allCoords(2).map(coordKey);
    expect([...tileSkinVariants('console', keys).entries()].sort()).toEqual([...tileSkinVariants('console', keys).entries()].sort());
    expect([...tileSkinVariants('console', keys).entries()].sort()).not.toEqual([...tileSkinVariants('brushed', keys).entries()].sort());
    for (const v of tileSkinVariants('console', keys).values()) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(9);
    }
  });
});

describe('Nero: the seam arithmetic', () => {
  it('gives all three road ribbons the same 0.07 H width in board units', () => {
    const length = (angle: number) => Math.abs(ART_W * Math.sin((angle * Math.PI) / 180)) + Math.abs(ART_H * Math.cos((angle * Math.PI) / 180));
    const art = tileSkinArt('nero', 0);
    const roads = art.face.filter((s) => s.t === 'rect' && s.p.t === 'lin' && (s.p.a === 180 || s.p.a === 120 || s.p.a === 60));
    expect(roads.length, 'three ribbons').toBe(3);
    for (const shape of roads) {
      const p = (shape as { p: { a: number; stops: readonly (readonly [number, string])[] } }).p;
      const solid = p.stops.filter(([, c]) => c !== 'transparent');
      const width = (solid[solid.length - 1]![0] - solid[0]![0]) * length(p.a);
      expect(width, `ribbon at ${p.a}° is ${width.toFixed(3)} units wide`).toBeCloseTo(0.07 * ART_H, 2);
      // centred on the tile's middle: midpoint plus perpendicular is what survives a 60° turn
      const mid = (solid[solid.length - 1]![0] + solid[0]![0]) / 2;
      expect(mid).toBeCloseTo(0.5, 6);
    }
  });

  it('keeps every variant\'s roads identical: only the middle of the tile varies', () => {
    const roadsOf = (v: number) => tileSkinArt('nero', v).face
      .filter((s) => s.t === 'rect' && s.p.t === 'lin' && (s.p.a === 180 || s.p.a === 120 || s.p.a === 60));
    const first = JSON.stringify(roadsOf(0));
    for (let v = 1; v < TILE_SKIN_GROUNDS.nero; v++) expect(JSON.stringify(roadsOf(v)), `v${v}`).toBe(first);
  });
});

describe('Console: one pastel per tile, three clusters', () => {
  it('mixes its faces from a single mid colour, and the nine mids are nine different colours', () => {
    const mids = Array.from({ length: 9 }, (_, v) => {
      const art = tileSkinArt('console', v);
      // the cube's third face is the raw `--mid`; the other two are mixes of it
      const faces = art.face.filter((s) => s.t === 'poly' || s.t === 'rect');
      return JSON.stringify(faces);
    });
    expect(new Set(mids).size, 'no two Console grounds are the same tile').toBe(9);
  });
});

describe('the default look is untouched', () => {
  it('is Forest against Ash, with no tile skin at all', () => {
    expect(DEFAULT_SKIN).toEqual({ mine: 'forest', theirs: 'ash', background: 'slate', tileMine: null, tileTheirs: null });
    setTileSkins(DEFAULT_SKIN.tileMine, DEFAULT_SKIN.tileTheirs);
    expect(tileSkinFor(0)).toBeNull();
    expect(tileSkinFor(1)).toBeNull();
    expect(skinChoice().tileMine).toBeNull();
    expect(skinChoice().tileTheirs).toBeNull();
  });

  it('a chosen family paints only the side that chose it', () => {
    chooseSkin({ tileMine: 'voxel' });
    expect(tileSkinFor(0)).toBe('voxel');
    expect(tileSkinFor(1), 'the other side keeps Forest/Ash').toBeNull();
    chooseSkin({ tileTheirs: 'nero' });
    expect(tileSkinFor(0)).toBe('voxel');
    expect(tileSkinFor(1)).toBe('nero');
  });

  it('survives storage that names a skin this build does not know', () => {
    chooseSkin({ tileMine: 'slab' as never });
    expect(tileSkinFor(0), 'an unknown id is no choice, not a crash').toBeNull();
    chooseSkin({ tileTheirs: '' as never });
    expect(tileSkinFor(1)).toBeNull();
    expect(tileSkinOf('voxel')).toBe('voxel');
    expect(tileSkinOf(42)).toBeNull();
    expect(tileSkinOf(null)).toBeNull();
  });

  it('never lets a player who is not the admin wear a skin, even from storage', () => {
    signIn('Cedar');
    chooseSkin({ tileMine: 'hypnosis', tileTheirs: 'carrara' });
    expect(tileSkinFor(0), 'the picker is hidden, so its choices are too').toBeNull();
    expect(tileSkinFor(1)).toBeNull();
    setTileSkins('voxel', 'nero');
    expect(tileSkinFor(1)).not.toBeNull(); // the setter itself is mechanical: the gate is in valid()
  });
});
