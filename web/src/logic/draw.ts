// v0.7: painting a Bloom. The player paints a connected cluster of hexes on the board: drag a
// finger (or the mouse) over legal hexes, tap them one by one, or (desktop) click once to start
// and once to finish. For a run the numbers follow the paint order (lowest first; "Reverse"
// flips it). Pure functions only: the page turns pointer positions into hex keys and asks
// these what the shape is and which of the engine's legal Blooms it matches. Nothing here
// changes the game; a shape that matches no legal Bloom can never be committed.
import { DIRECTIONS, coordKey, hexDistance, parseKey } from '../../../src/engine/index.js';
import type { Action, View } from '../../../src/engine/index.js';
import { simulate, threats } from '../../../src/bots/evaluate.js';
import { kindOf } from './interaction.js';
import type { Sel } from './interaction.js';
import { S, centerOf } from '../ui/geom.js';
import { toBoard } from './orient.js';

export type Bloom = Extract<Action, { t: 'Bloom' }>;
/** Kept for the callers that still say "meld": a Bloom is the only combo. */
export type Meld = Bloom;
export type Pt = { x: number; y: number };

// ---------- geometry (board units; the page maps the screen to these in either orientation) ----------

/** The hit area is a little smaller than the hex, so a finger at a corner never slips into a neighbour. */
export const HIT = 0.85;

const SQ3 = Math.sqrt(3);
const INRADIUS = (S * SQ3) / 2;
const NORMALS: readonly Pt[] = [0, 60, 120].map((d) => ({ x: Math.cos((d * Math.PI) / 180), y: Math.sin((d * Math.PI) / 180) }));

export const pixelOf = (key: string): Pt => centerOf(key);

/** The hex whose (slightly smaller) hit area holds the point, or null (a gap, a corner, off the board). */
export const hexAtPoint = (sx: number, sy: number, keys: ReadonlySet<string>, hit = HIT): string | null => {
  const { x, y } = toBoard(sx, sy);
  const qf = ((SQ3 / 3) * x - y / 3) / S;
  const rf = ((2 / 3) * y) / S;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(-qf - rf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s + qf + rf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  const key = coordKey({ q: q + 0, r: r + 0 });
  if (!keys.has(key)) return null;
  const cs = centerOf(key);
  const c = toBoard(cs.x, cs.y);
  const px = x - c.x;
  const py = y - c.y;
  return NORMALS.every((n) => Math.abs(px * n.x + py * n.y) <= hit * INRADIUS) ? key : null;
};

/**
 * Every hex the straight segment a→b crosses, in order (pointer events skip hexes when the
 * finger moves fast). Samples every fifth of a hex radius.
 */
export const hexesAlong = (a: Pt, b: Pt, keys: ReadonlySet<string>): string[] => {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(len / (S * 0.2)));
  const out: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const k = hexAtPoint(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, keys);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
};

// ---------- the chosen Bloom ----------

/**
 * One card group to bloom (a kind "bloom-N-ids"): its numbers in ascending order, whether it
 * is a run (different numbers: the paint order matters), and every legal Bloom of it.
 */
export type Combo = { kind: string; n: number; ranks: number[]; run: boolean; actions: Bloom[]; hexes: Set<string>; byKey: Map<string, Bloom> };

/** The lookup key of a Bloom: its hexes in card order (a set: in any order, so sorted). */
const keyOf = (hexes: readonly string[], run: boolean) => (run ? hexes.join(' ') : [...hexes].sort().join(' '));

/** The legal Blooms of the picked group (sel.kind), or null when no Bloom kind is picked. */
export const comboFor = (v: View, legal: readonly Action[], sel: Sel): Combo | null => {
  const kind = sel.kind;
  if (!kind?.startsWith('bloom-')) return null;
  const actions = legal.filter((a): a is Bloom => a.t === 'Bloom' && kindOf(a) === kind);
  if (!actions.length) return null;
  const ranks = actions[0]!.cards.map((id) => v.hand.find((c) => c.id === id)?.rank ?? 0);
  const run = new Set(ranks).size > 1;
  const byKey = new Map<string, Bloom>();
  for (const a of actions) byKey.set(keyOf(a.hexes.map(coordKey), run), a);
  return { kind, n: ranks.length, ranks, run, actions, hexes: new Set(actions.flatMap((a) => a.hexes.map(coordKey))), byKey };
};

/** The number the i-th painted hex receives (lowest first; Reverse: highest first). */
export const rankAt = (c: Combo, i: number, reverse: boolean): number => (reverse ? c.ranks[c.n - 1 - i]! : c.ranks[i]!);

/** The hexes in card order for a full painted shape. */
const cardOrder = (_c: Combo, shape: readonly string[], reverse: boolean): string[] => (reverse ? [...shape].reverse() : [...shape]);

/** The legal Bloom painted exactly like this (a run: in this order), or null. */
export const paintMatch = (c: Combo, shape: readonly string[], reverse = false): Bloom | null =>
  shape.length === c.n ? (c.byKey.get(keyOf(cardOrder(c, shape, reverse), c.run)) ?? null) : null;

const touches = (shape: readonly string[], key: string) => shape.some((k) => hexDistance(parseKey(k), parseKey(key)) === 1);

/** The order in which a Bloom's hexes are painted (paint position i gets rankAt(i)). */
const paintOrder = (_c: Combo, a: Bloom, reverse: boolean): string[] => {
  const ks = a.hexes.map(coordKey);
  return reverse ? ks.reverse() : ks;
};

/**
 * The hexes that can legally come next: each one keeps the shape inside some legal Bloom (a
 * run: with the number it would receive) and touches the shape. Empty shape: the legal starts.
 */
export const drawNext = (c: Combo, shape: readonly string[], reverse = false): Set<string> => {
  const out = new Set<string>();
  const m = shape.length;
  if (m >= c.n) return out;
  for (const a of c.actions) {
    if (!c.run) {
      const ks = a.hexes.map(coordKey);
      if (!shape.every((k) => ks.includes(k))) continue;
      for (const k of ks) if (!shape.includes(k) && (m === 0 || touches(shape, k))) out.add(k);
      continue;
    }
    const order = paintOrder(c, a, reverse);
    if (!shape.every((k, i) => order[i] === k)) continue;
    const k = order[m]!;
    if (m === 0 || touches(shape, k)) out.add(k);
  }
  return out;
};

/** Where a painting may start. */
export const drawStarts = (c: Combo, reverse = false): Set<string> => drawNext(c, [], reverse);

/** A legal Bloom spanning two tapped hexes. The engine's legal actions are the source of
 * truth; the search only chooses which already-legal placement to use. Adjacent second
 * taps remain available for ordinary tile-by-tile painting. */
export const endpointBloom = (c: Combo, start: string, end: string, reverse = false): Bloom | null => {
  if (start === end || drawNext(c, [start], reverse).has(end)) return null;
  let best: { action: Bloom; distance: number; index: number } | null = null;
  for (const [index, action] of c.actions.entries()) {
    const keys = action.hexes.map(coordKey);
    if (!keys.includes(start) || !keys.includes(end)) continue;
    if (c.run) {
      const ordered = reverse ? [...keys].reverse() : keys;
      if (ordered[0] !== start || ordered.at(-1) !== end) continue;
    }
    // Shortest connected route within this legal placement. Extra tiles may branch off it.
    const seen = new Set([start]);
    let frontier = [start], distance = 0;
    while (frontier.length && !seen.has(end)) {
      distance++;
      frontier = frontier.flatMap(k => keys.filter(next => !seen.has(next) && hexDistance(parseKey(k), parseKey(next)) === 1));
      for (const k of frontier) seen.add(k);
    }
    if (!seen.has(end)) continue;
    if (!best || distance < best.distance || (distance === best.distance && index < best.index)) best = { action, distance, index };
  }
  return best?.action ?? null;
};

/**
 * Hexes next to the shape (or any start, when empty) that some Bloom of this group uses but
 * that cannot take the number they would receive now, each with a short reason.
 */
export const unavailable = (v: View, c: Combo, shape: readonly string[], reverse = false): Map<string, string> => {
  const out = new Map<string, string>();
  if (shape.length >= c.n) return out;
  const next = drawNext(c, shape, reverse);
  const want = rankAt(c, shape.length, reverse);
  for (const k of c.hexes) {
    if (shape.includes(k) || next.has(k) || (shape.length > 0 && !touches(shape, k))) continue;
    const t = v.board[k];
    if (t && t.owner !== v.player && !t.root && t.strength >= want) out.set(k, `Needs a ${t.strength + 1} or higher`);
  }
  return out;
};

/** Every one placement the group has, if it has exactly one place to go (a ready preview), else null. */
export const onlyPlacement = (c: Combo): Bloom | null => {
  const places = new Set(c.actions.map((a) => a.hexes.map(coordKey).sort().join(' ')));
  return places.size === 1 && c.actions.length === 1 ? c.actions[0]! : null;
};

// ---------- painting ----------

/**
 * A drag enters a hex: a legal next hex is added; moving back onto the hex before the last
 * removes the last one; anything else (illegal, not touching, already in, the shape is
 * full) is ignored.
 */
export const paintEnter = (c: Combo, shape: readonly string[], key: string, reverse = false): string[] => {
  if (shape.length >= 2 && key === shape.at(-2)) return shape.slice(0, -1);
  if (shape.includes(key) || shape.length >= c.n) return [...shape];
  return drawNext(c, shape, reverse).has(key) ? [...shape, key] : [...shape];
};

/** Tapping: tap to add (same rules), tap the last one to remove it. */
export const paintTap = (c: Combo, shape: readonly string[], key: string, reverse = false): string[] => {
  if (shape.at(-1) === key) return shape.slice(0, -1);
  if (shape.includes(key)) return [...shape];
  return paintEnter(c, shape, key, reverse);
};

/** Why the shape cannot be confirmed yet, in plain words ("2/3"), or null when it can. */
export const paintProblem = (v: View, c: Combo, shape: readonly string[], reverse = false): string | null => {
  if (shape.length < c.n) return `${shape.length}/${c.n}`;
  if (paintMatch(c, shape, reverse)) return null;
  const mine = Object.keys(v.board).filter((x) => v.board[x]?.owner === v.player);
  return shape.some((k) => touches(mine, k)) ? "That shape can't be placed" : 'Your bloom needs to touch your tiles';
};

export type GhostTile = { key: string; strength: number; ok: boolean };
export type Ghost = { tiles: GhostTile[]; action: Bloom | null; reason: string | null };

/** The painted shape's ghost: each hex with the number it receives. */
export const paintGhost = (v: View, c: Combo, shape: readonly string[], reverse = false): Ghost => {
  const action = paintMatch(c, shape, reverse);
  return {
    tiles: shape.map((key, i) => ({ key, strength: rankAt(c, i, reverse), ok: true })),
    action,
    reason: action ? null : paintProblem(v, c, shape, reverse),
  };
};

/** The painted order of a legal Bloom (to show a suggestion as if painted: lowest number first). */
export const shapeOf = (c: Combo, a: Bloom, reverse = false): string[] => paintOrder(c, a, reverse);

// ---------- the one-tap suggestion ----------

/**
 * The suggested Bloom that includes `key`: among every legal Bloom of `blooms` on that hex,
 * the most tiles gained, then the most opponent tiles replaced or cut, then the fewest of my
 * tiles left open to a cut, then the engine's fixed order. Null if none uses the hex.
 */
export const suggestBloom = (v: View, blooms: readonly Bloom[], key: string): Bloom | null => {
  const on = blooms.filter((a) => a.hexes.some((h) => coordKey(h) === key));
  if (!on.length) return null;
  const scored = on.map((a, i) => {
    const sim = simulate(v, a)!;
    return { a, i, gained: sim.placed - sim.taken - sim.myLoss, hits: sim.taken + sim.botCut, sim };
  });
  scored.sort((x, y) => y.gained - x.gained || y.hits - x.hits || x.i - y.i);
  // the exposure check is the costly one: only for the tied leaders
  const top = scored.filter((s) => s.gained === scored[0]!.gained && s.hits === scored[0]!.hits).slice(0, 24);
  const exposed = (s: (typeof scored)[number]) => threats({ config: v.config, terrain: v.terrain, board: s.sim.board }, v.player)[0]?.loss ?? 0;
  const best = top.map((s) => ({ s, e: exposed(s) })).sort((x, y) => x.e - y.e || x.s.i - y.s.i)[0]!;
  return best.s.a;
};

// ---------- desktop: one click to start, one to finish (the keyboard uses the same machine) ----------

export type Desk = { phase: 'idle' } | { phase: 'live'; start: string; hover: string };
export const DESK_IDLE: Desk = Object.freeze({ phase: 'idle' }) as Desk;
export const deskCancel = (): Desk => DESK_IDLE;
export const deskHover = (d: Desk, key: string): Desk => (d.phase === 'live' ? { ...d, hover: key } : d);

/**
 * The desktop shape, grown from the start towards the hovered hex, deterministically: each
 * next hex is the legal next hex nearest the hover (then nearest the start, then key order).
 */
export const growToward = (c: Combo, start: string, hover: string, reverse = false): string[] => {
  if (!drawStarts(c, reverse).has(start)) return [];
  const dist = (a: string, b: string) => hexDistance(parseKey(a), parseKey(b));
  const shape = [start];
  while (shape.length < c.n) {
    const next = [...drawNext(c, shape, reverse)].sort((a, b) => dist(a, hover) - dist(b, hover) || dist(a, start) - dist(b, start) || (a < b ? -1 : a > b ? 1 : 0))[0];
    if (!next) break;
    shape.push(next);
  }
  return shape;
};

/** The live shape while the desktop painting follows the mouse. */
export const deskShape = (v: View, c: Combo, d: Desk, reverse = false): Ghost => {
  if (d.phase !== 'live') return { tiles: [], action: null, reason: null };
  return paintGhost(v, c, growToward(c, d.start, d.hover, reverse), reverse);
};

/** A click: the first one starts on a legal hex; the second one finishes a legal shape (else keeps painting). */
export const deskClick = (d: Desk, key: string, v: View, c: Combo, reverse = false): { desk: Desk; finish: Bloom | null } => {
  if (d.phase === 'idle') return { desk: drawStarts(c, reverse).has(key) ? { phase: 'live', start: key, hover: key } : d, finish: null };
  const shape = deskShape(v, c, deskHover(d, key), reverse);
  return shape.action ? { desk: DESK_IDLE, finish: shape.action } : { desk: deskHover(d, key), finish: null };
};

// ---------- settings and keyboard ----------

/** "Confirm moves": the player's choice, else on for touch and off with a mouse (pointer: fine). */
export const confirmMovesFor = (setting: boolean | null, pointerFine: boolean): boolean => setting ?? !pointerFine;

const ARROWS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/**
 * The cursor hex after an arrow key (it stays on the board). Up and Down alternate between
 * the two hexes above (or below), so the cursor stays in a column (as the board always did).
 */
export const keyStep = (cursor: string, key: string, keys: ReadonlySet<string>): string => {
  const d = ARROWS[key];
  if (!d) return cursor;
  const cur = parseKey(cursor);
  const [dq, dr] = d;
  const shift = dr === 0 ? 0 : dr < 0 ? (cur.r % 2 === 0 ? 1 : 0) : cur.r % 2 === 0 ? 0 : -1;
  const next = coordKey({ q: cur.q + dq + shift, r: cur.r + dr });
  return keys.has(next) ? next : cursor;
};

/** How bright a legal hex is from the pointer's distance (board units): 1 under it, 0 beyond `radius`, smooth between. */
export const proximity = (distance: number, radius = S * 3.2): number => {
  if (!(distance >= 0)) return 0;
  const t = Math.max(0, 1 - distance / radius);
  return t * t * (3 - 2 * t);
};

/** The six neighbour directions (kept for the keyboard and tests). */
export const NEIGHBOUR_DIRS = DIRECTIONS;
