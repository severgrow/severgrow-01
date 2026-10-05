// The Lab (test copy only): boards of any shape. A shape and its size give a set of hexes; the
// two homes and the rock and gold are chosen from it with the seeded PRNG (never Math.random),
// symmetric under a half-turn when the shape allows. Warnings never block a game.
import { allCoords, allNeighbors, coordKey, deriveSeed, hexDistance, mulberry32, parseKey, shuffle } from '../../../src/engine/index.js';
import type { BoardSpec, Coord } from '../../../src/engine/index.js';

export type ShapeKind = 'hexagon' | 'rhombus' | 'rectangle' | 'triangle' | 'ring' | 'blob';
export type HomesMode = 'auto' | 'corners' | 'centre';
export type MapParams = {
  shape: ShapeKind;
  /** hexagon radius, rhombus/rectangle width, triangle size, ring outer radius, blob cell count */
  a: number;
  /** rhombus/rectangle height, ring inner radius */
  b: number;
  rockPct: number;
  goldPct: number;
  homes: HomesMode;
  seed: number;
};

export const SHAPE_LIMITS: Record<ShapeKind, { a: [number, number]; b?: [number, number]; aLabel: string; bLabel?: string }> = {
  hexagon: { a: [2, 8], aLabel: 'Radius' },
  rhombus: { a: [3, 14], b: [3, 14], aLabel: 'Width', bLabel: 'Height' },
  rectangle: { a: [3, 14], b: [3, 16], aLabel: 'Width', bLabel: 'Height' },
  triangle: { a: [4, 14], aLabel: 'Size' },
  ring: { a: [3, 8], b: [1, 6], aLabel: 'Outer radius', bLabel: 'Hole radius' },
  blob: { a: [20, 300], aLabel: 'Cells' },
};

const n0 = (x: number) => x + 0;
const key = (q: number, r: number) => coordKey({ q: n0(q), r: n0(r) });
const mirrorKey = (k: string) => {
  const c = parseKey(k);
  return key(-c.q, -c.r);
};

/** The hexes of a shape, centred on 0,0 as well as the shape allows. */
export const shapeCells = (p: Pick<MapParams, 'shape' | 'a' | 'b' | 'seed'>): string[] => {
  const out = new Set<string>();
  const { a, b } = p;
  switch (p.shape) {
    case 'hexagon':
      for (const c of allCoords(a)) out.add(coordKey(c));
      break;
    case 'rhombus':
      for (let q = 0; q < a; q++) for (let r = 0; r < b; r++) out.add(key(q, r));
      break;
    case 'rectangle':
      // a brick-style rectangle: rows of `a` hexes, every other row shifted half a hex
      for (let r = 0; r < b; r++) for (let col = 0; col < a; col++) out.add(key(col - Math.floor(r / 2), r));
      break;
    case 'triangle':
      for (let q = 0; q < a; q++) for (let r = 0; q + r < a; r++) out.add(key(q, r));
      break;
    case 'ring':
      for (const c of allCoords(a)) if (hexDistance(c, { q: 0, r: 0 }) >= Math.min(b, a - 1)) out.add(coordKey(c));
      break;
    case 'blob': {
      // grows from the centre in mirrored pairs, so it is symmetric under a half-turn
      const rnd = mulberry32(deriveSeed(p.seed, 7));
      out.add('0,0');
      const frontier = () => {
        const f = new Set<string>();
        for (const k of out) for (const n of allNeighbors(parseKey(k))) if (!out.has(coordKey(n))) f.add(coordKey(n));
        return [...f].sort();
      };
      while (out.size < a) {
        const f = frontier();
        const pick = f[Math.floor(rnd() * f.length)]!;
        out.add(pick);
        out.add(mirrorKey(pick));
      }
      break;
    }
  }
  return centre([...out]);
};

/** Moves the cells so their middle sits on 0,0 (exactly, when the shape allows a half-turn). */
const centre = (cells: string[]): string[] => {
  const cs = cells.map(parseKey);
  // the half-turn centre of a lattice shape is (minQ+maxQ)/2 on each axis
  const qs = cs.map((c) => c.q);
  const rs = cs.map((c) => c.r);
  const ss = cs.map((c) => -c.q - c.r);
  const dq = (Math.min(...qs) + Math.max(...qs)) / 2;
  const dr = (Math.min(...rs) + Math.max(...rs)) / 2;
  const ds = (Math.min(...ss) + Math.max(...ss)) / 2;
  // round to a lattice point (s = -q - r keeps the three axes consistent)
  let q = Math.round(dq);
  let r = Math.round(dr);
  if (Math.abs(-q - r - ds) > 1) r = Math.round(-ds - q);
  return sortKeys(cs.map((c) => key(c.q - q, c.r - r)));
};

export const sortKeys = (keys: string[]): string[] =>
  [...keys].sort((x, y) => {
    const a = parseKey(x);
    const b = parseKey(y);
    return a.q - b.q || a.r - b.r;
  });

export const isSymmetric = (cells: readonly string[]) => {
  const set = new Set(cells);
  return cells.every((k) => set.has(mirrorKey(k)));
};

const neighbourCount = (k: string, set: Set<string>) => allNeighbors(parseKey(k)).filter((n) => set.has(coordKey(n))).length;

/** The two homes: [mine, the opponent's]. */
export const chooseHomes = (cells: readonly string[], mode: HomesMode): [string, string] => {
  const set = new Set(cells);
  const sym = isSymmetric(cells);
  const dist = (x: string, y: string) => hexDistance(parseKey(x), parseKey(y));
  const best = (pairs: [string, string][], score: (p: [string, string]) => number) => {
    let top = pairs[0]!;
    let s = -Infinity;
    for (const p of pairs) {
      const v = score(p);
      if (v > s + 1e-9) {
        s = v;
        top = p;
      }
    }
    return top;
  };
  // mine is the one lower in the board order's mirror sense: keep it stable (the "lower" key)
  const order = (p: [string, string]): [string, string] => (sortKeys([p[0], p[1]])[0] === p[0] ? p : [p[1], p[0]]);
  if (sym) {
    const pairs: [string, string][] = cells.filter((k) => k !== mirrorKey(k) && sortKeys([k, mirrorKey(k)])[0] === k).map((k) => [k, mirrorKey(k)]);
    if (pairs.length) {
      if (mode === 'corners') return order(best(pairs, ([x, y]) => dist(x, y)));
      if (mode === 'centre') return order(best(pairs, ([x, y]) => -Math.abs(dist(x, y) - 4) * 10 + neighbourCount(x, set)));
      // auto: the farthest pair whose homes have all six neighbours on the board (else the most)
      const full = Math.max(...pairs.map(([x]) => neighbourCount(x, set)));
      return order(best(pairs.filter(([x]) => neighbourCount(x, set) === full), ([x, y]) => dist(x, y)));
    }
  }
  // no half-turn: the farthest pair among the cells with the most neighbours (corners: any cells)
  const pool = mode === 'corners' ? [...cells] : (() => {
    const counts = cells.map((k) => neighbourCount(k, set));
    const top = Math.max(...counts);
    const strong = cells.filter((_, i) => counts[i]! >= top);
    return strong.length >= 2 ? strong : [...cells];
  })();
  const pairs: [string, string][] = [];
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) pairs.push([pool[i]!, pool[j]!]);
  if (mode === 'centre') return order(best(pairs, ([x, y]) => -Math.abs(dist(x, y) - 4) * 10 + neighbourCount(x, set) + neighbourCount(y, set)));
  return order(best(pairs, ([x, y]) => dist(x, y)));
};

export type MapResult = { spec: BoardSpec; warnings: string[] };

/** Every cell that is not rock reachable from both homes (walking over non-rock cells)? */
const allReachable = (cells: readonly string[], rock: Set<string>, homes: [string, string]) => {
  const open = new Set(cells.filter((k) => !rock.has(k)));
  const reach = (from: string) => {
    const seen = new Set([from]);
    const stack = [from];
    while (stack.length) {
      const k = stack.pop()!;
      for (const n of allNeighbors(parseKey(k))) {
        const nk = coordKey(n);
        if (open.has(nk) && !seen.has(nk)) {
          seen.add(nk);
          stack.push(nk);
        }
      }
    }
    return seen;
  };
  const a = reach(homes[0]);
  return a.size === open.size && a.has(homes[1]);
};

/** The whole map: cells, homes, rock and gold, and plain-English warnings (never blocking). */
export const buildMap = (p: MapParams): MapResult => {
  const cells = shapeCells(p);
  const warnings: string[] = [];
  const set = new Set(cells);
  const homes = chooseHomes(cells, p.homes);
  const near = new Set<string>(homes);
  for (const h of homes) for (const n of allNeighbors(parseKey(h))) near.add(coordKey(n));
  const sym = isSymmetric(cells);
  // terrain units: mirrored pairs (or single cells when the shape has no half-turn)
  const units: string[][] = [];
  const seen = new Set<string>();
  for (const k of cells) {
    if (seen.has(k) || near.has(k)) continue;
    const m = mirrorKey(k);
    if (sym && m !== k) {
      if (near.has(m)) continue;
      seen.add(k).add(m);
      units.push([k, m]);
    } else {
      seen.add(k);
      units.push([k]);
    }
  }
  const wantRock = Math.round((cells.length * p.rockPct) / 100);
  const wantGold = Math.round((cells.length * p.goldPct) / 100);
  let rock = new Set<string>();
  let gold = new Set<string>();
  let ok = false;
  for (let attempt = 0; attempt < 24 && !ok; attempt++) {
    const order = shuffle(units, mulberry32(deriveSeed(p.seed + attempt * 7919, 1)));
    rock = new Set();
    gold = new Set();
    // the centre cell (a unit of one on a symmetric map) is gold first, like Classic
    const centreUnit = order.findIndex((u) => u.length === 1 && u[0] === '0,0');
    if (sym && centreUnit >= 0 && wantGold > 0) gold.add('0,0');
    for (const u of order) {
      if (u.length === 1 && u[0] === '0,0' && gold.has('0,0')) continue;
      if (rock.size + u.length <= wantRock) u.forEach((k) => rock.add(k));
      else if (gold.size + u.length <= wantGold) u.forEach((k) => gold.add(k));
    }
    ok = allReachable(cells, rock, homes);
  }
  if (!ok) warnings.push('Some open hexes are walled off by rock (tried 24 layouts). Try less rock or another seed.');
  const openAround = (h: string) => allNeighbors(parseKey(h)).filter((n) => set.has(coordKey(n)) && !rock.has(coordKey(n))).length;
  for (const [i, h] of homes.entries()) {
    const n = openAround(h);
    if (n < 4) warnings.push(`${i === 0 ? 'Your' : "Your opponent's"} home has only ${n} open neighbours: it is easy to surround (Strangle).`);
  }
  if (cells.length < 20) warnings.push(`Only ${cells.length} hexes: a very cramped game.`);
  if (cells.length > 400) warnings.push(`${cells.length} hexes: the opponent may think slowly.`);
  const d = hexDistance(parseKey(homes[0]), parseKey(homes[1]));
  if (d < 4) warnings.push(`The homes are only ${d} steps apart.`);
  return { spec: { cells, rock: sortKeys([...rock]), gold: sortKeys([...gold]), homes }, warnings };
};

export type { Coord };
