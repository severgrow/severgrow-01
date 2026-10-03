// UI polish pass 3, Part 4: draw your placement. A line (a run, "Hypha") or a clump (a set,
// "Bloom") is drawn on the board: drag a finger (or the mouse) over the hexes, or click once
// to start and once to finish. Pure functions only: the page turns pointer positions into
// board coordinates and asks these what the shape is and which of the engine's legal
// actions it matches. Nothing here changes the game; a shape that matches no legal action
// can never be committed.
import { DIRECTIONS, coordKey, hexDistance, parseKey } from '../../../src/engine/index.js';
import type { Action, Coord, View } from '../../../src/engine/index.js';
import { moveCards } from '../../../src/playtest/names.js';
import { bestFirst, kindOf } from './interaction.js';
import type { Sel } from './interaction.js';
import { S, centerOf } from '../ui/geom.js';

type Run = Extract<Action, { t: 'MeldRun' }>;
type Set_ = Extract<Action, { t: 'MeldSet' }>;
export type Meld = Run | Set_;
export type Pt = { x: number; y: number };

// ---------- geometry ----------

/** The hit area is a little smaller than the hex, so a finger at a corner never slips into a neighbour. */
export const HIT = 0.85;
/** How far a drag must go (board units) before it picks a direction. */
export const DEAD_ZONE = S * 0.3;
/** Extra degrees the current direction keeps before a drag flips to the next one. */
export const HYSTERESIS = 8;

const SQ3 = Math.sqrt(3);
const INRADIUS = (S * SQ3) / 2;
const NORMALS: readonly Pt[] = [0, 60, 120].map((d) => ({ x: Math.cos((d * Math.PI) / 180), y: Math.sin((d * Math.PI) / 180) }));
/** Screen angle of each engine direction (screen y grows downwards). */
const DIR_ANGLE = DIRECTIONS.map((d) => {
  const c = centerOf(coordKey(d));
  return (Math.atan2(c.y, c.x) * 180) / Math.PI;
});

export const pixelOf = (key: string): Pt => centerOf(key);

/** The hex whose (slightly smaller) hit area holds the point, or null (a gap, a corner, off the board). */
export const hexAtPoint = (x: number, y: number, keys: ReadonlySet<string>, hit = HIT): string | null => {
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
  const c = centerOf(key);
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

const angleDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** The direction (0-5) a drag points along, with a dead zone and a little hysteresis; `prev` is kept while unsure. */
export const snapDir = (dx: number, dy: number, prev: number | null, deadZone = DEAD_ZONE): number | null => {
  if (Math.hypot(dx, dy) < deadZone) return prev;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (prev !== null && angleDiff(ang, DIR_ANGLE[prev]!) <= 30 + HYSTERESIS) return prev;
  let best = 0;
  for (let d = 1; d < 6; d++) if (angleDiff(ang, DIR_ANGLE[d]!) < angleDiff(ang, DIR_ANGLE[best]!)) best = d;
  return best;
};

/** The direction from one hex towards another (desktop hover, keyboard), or null for the same hex. */
export const dirToward = (from: string, to: string): number | null => {
  if (from === to) return null;
  const a = centerOf(from);
  const b = centerOf(to);
  return snapDir(b.x - a.x, b.y - a.y, null, 0);
};

// ---------- the chosen combo ----------

export type Combo = { kind: 'line' | 'clump'; n: number; actions: Meld[] };

const sameCard = (v: View, a: number, b: number) => {
  const x = v.hand.find((c) => c.id === a);
  const y = v.hand.find((c) => c.id === b);
  return !!x && !!y && x.suit === y.suit && x.rank === y.rank;
};

/** The legal placements for the chosen line or clump (and the picked card, if any), best first. */
export const comboFor = (v: View, legal: readonly Action[], sel: Sel): Combo | null => {
  const kind = sel.kind;
  if (!kind || !(kind.startsWith('line-') || kind.startsWith('clump-'))) return null;
  const actions = legal.filter(
    (a): a is Meld => (a.t === 'MeldRun' || a.t === 'MeldSet') && kindOf(a) === kind && (sel.card === null || moveCards(a).some((id) => sameCard(v, sel.card!, id))),
  );
  if (!actions.length) return null;
  return { kind: kind.startsWith('line') ? 'line' : 'clump', n: Number(kind.split('-')[1]), actions: bestFirst(v, actions) as Meld[] };
};

const runKeys = (start: Coord, dir: number, n: number): string[] =>
  Array.from({ length: n }, (_, i) => coordKey({ q: start.q + DIRECTIONS[dir]!.q * i, r: start.r + DIRECTIONS[dir]!.r * i }));
const hexesOf = (a: Meld): string[] => (a.t === 'MeldRun' ? runKeys(a.start, a.dir, a.cards.length) : a.hexes.map(coordKey));
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((k) => b.includes(k));
const ranksOf = (v: View, a: Meld) => a.cards.map((id) => v.hand.find((c) => c.id === id)?.rank ?? 0).sort((x, y) => x - y);

/** Where a drawing may start: for a line, the start hexes (next to my network); for a clump, every legal hex. */
export const drawStarts = (combo: Combo): Set<string> =>
  combo.kind === 'line' ? new Set(combo.actions.map((a) => coordKey((a as Run).start))) : clumpHexes(combo);

/** For a line, a drag may also start at the far end of a legal line (and come back to the network). */
export const lineEnds = (combo: Combo): Set<string> => {
  const out = new Set<string>();
  for (const a of combo.actions as Run[]) {
    const ks = hexesOf(a);
    out.add(ks[0]!);
    out.add(ks.at(-1)!);
  }
  return out;
};

/** Every one placement the combo has, if it has exactly one place to go (a ready preview), else null. */
export const onlyPlacement = (combo: Combo): Meld | null => {
  const places = new Set(combo.actions.map((a) => [...hexesOf(a)].sort().join(' ')));
  return places.size === 1 ? combo.actions[0]! : null;
};

// ---------- lines ----------

export type GhostTile = { key: string; strength: number; ok: boolean };
export type Ghost = { tiles: GhostTile[]; action: Meld | null; reason: string | null };

/**
 * The line drawn from `start` in direction `dir`: all N tiles at once with their numbers, the
 * matching legal action (the same hexes; when both ends could start, the finger's end), or
 * what blocks it.
 */
export const lineGhost = (v: View, combo: Combo, start: string, dir: number): Ghost => {
  const n = combo.n;
  const ks = runKeys(parseKey(start), dir, n);
  const match = (combo.actions as Run[]).filter((a) => sameSet(hexesOf(a), ks));
  const action = match.find((a) => coordKey(a.start) === start) ?? match[0] ?? null;
  if (action) {
    const order = hexesOf(action);
    const ranks = ranksOf(v, action);
    return { tiles: ks.map((key) => ({ key, strength: ranks[order.indexOf(key)]!, ok: true })), action, reason: null };
  }
  const ranks = ranksOf(v, combo.actions[0]!);
  const on = ks.filter((k) => k in v.board);
  if (on.length < n) return { tiles: on.map((key) => ({ key, strength: ranks[ks.indexOf(key)]!, ok: false })), action: null, reason: 'The line runs off the board' };
  let reason: string | null = null;
  const tiles = ks.map((key, i) => {
    const t = v.board[key];
    const why = v.terrain[key] === 'rock' ? 'Rock is in the way' : t?.root ? 'A root is in the way' : t && t.owner === v.player ? 'Your own tile is in the way' : t && t.strength >= ranks[i]! ? 'A stronger tile is in the way' : null;
    reason ??= why;
    return { key, strength: ranks[i]!, ok: why === null };
  });
  return { tiles, action: null, reason: reason ?? 'A line must start next to your tiles' };
};

/** The legal directions from a hex (it may be the start or the far end of a line). */
export const lineArrows = (combo: Combo, from: string): number[] => {
  const out = new Set<number>();
  for (const a of combo.actions as Run[]) {
    const ks = hexesOf(a);
    if (ks[0] === from) out.add(a.dir);
    if (ks.at(-1) === from) out.add((a.dir + 3) % 6);
  }
  return [...out].sort((x, y) => x - y);
};

// ---------- clumps ----------

/** Every hex some legal clump uses. */
export const clumpHexes = (combo: Combo): Set<string> => new Set(combo.actions.flatMap(hexesOf));

const touches = (shape: readonly string[], key: string) => shape.some((k) => hexDistance(parseKey(k), parseKey(key)) === 1);

/**
 * A drag enters a hex: a new legal hex touching any hex of the shape is added (so a Y or a
 * triangle is possible); moving back onto the hex before the last removes the last one;
 * anything else (illegal, not touching, already in, or the shape is full) is ignored.
 */
export const clumpEnter = (shape: readonly string[], key: string, combo: Combo): string[] => {
  if (shape.length >= 2 && key === shape.at(-2)) return shape.slice(0, -1);
  if (shape.includes(key) || shape.length >= combo.n || !clumpHexes(combo).has(key)) return [...shape];
  if (shape.length > 0 && !touches(shape, key)) return [...shape];
  return [...shape, key];
};

/** Tapping: tap to add (same rules), tap the last one to remove it. */
export const clumpTap = (shape: readonly string[], key: string, combo: Combo): string[] => {
  if (shape.at(-1) === key) return shape.slice(0, -1);
  if (shape.includes(key)) return [...shape];
  return clumpEnter(shape, key, combo);
};

/** The legal action with exactly these hexes (any drawing order), or null. */
export const clumpMatch = (combo: Combo, shape: readonly string[]): Meld | null =>
  shape.length === combo.n ? (combo.actions.find((a) => sameSet(hexesOf(a), shape)) ?? null) : null;

/** Why a clump cannot be confirmed yet, in plain words, or null when it can. */
export const clumpProblem = (v: View, combo: Combo, shape: readonly string[]): string | null => {
  if (shape.length < combo.n) return `${shape.length}/${combo.n}: keep going, from any hex of the shape`;
  if (clumpMatch(combo, shape)) return null;
  const touchesMine = shape.some((k) => touches(Object.keys(v.board).filter((x) => v.board[x]?.owner === v.player), k));
  return touchesMine ? "That shape can't be placed" : 'Your clump needs to touch your tiles';
};

/** The clump's ghost: each hex with the set's strength. */
export const clumpGhost = (v: View, combo: Combo, shape: readonly string[]): Ghost => {
  const rank = ranksOf(v, combo.actions[0]!)[0]!;
  const legal = clumpHexes(combo);
  const action = clumpMatch(combo, shape);
  return { tiles: shape.map((key) => ({ key, strength: rank, ok: legal.has(key) })), action, reason: action ? null : clumpProblem(v, combo, shape) };
};

/**
 * The desktop clump, grown from the start towards the hovered hex, deterministically: the
 * shortest legal path towards it (to the legal hex nearest it), cut to N; if shorter, filled
 * with the legal hexes nearest the hover, then nearest the start, then in key order.
 */
export const growClump = (combo: Combo, start: string, hover: string): string[] => {
  const legal = clumpHexes(combo);
  if (!legal.has(start)) return [];
  const dist = (a: string, b: string) => hexDistance(parseKey(a), parseKey(b));
  const byNear = (a: string, b: string) => dist(a, hover) - dist(b, hover) || dist(a, start) - dist(b, start) || (a < b ? -1 : a > b ? 1 : 0);
  const goal = legal.has(hover) ? hover : [...legal].sort(byNear)[0]!;
  // breadth-first over legal hexes, neighbours in the engine's direction order
  const prev = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length && !prev.has(goal)) {
    const cur = queue.shift()!;
    for (const d of DIRECTIONS) {
      const c = parseKey(cur);
      const nk = coordKey({ q: c.q + d.q, r: c.r + d.r });
      if (legal.has(nk) && !prev.has(nk)) {
        prev.set(nk, cur);
        queue.push(nk);
      }
    }
  }
  const path: string[] = [];
  for (let k: string | null | undefined = prev.has(goal) ? goal : start; k; k = prev.get(k)) path.unshift(k);
  const shape = path.slice(0, combo.n);
  while (shape.length < combo.n) {
    const next = [...legal].filter((k) => !shape.includes(k) && touches(shape, k)).sort(byNear)[0];
    if (!next) break;
    shape.push(next);
  }
  return shape;
};

// ---------- desktop: one click to start, one to finish (the keyboard uses the same machine) ----------

export type Desk = { phase: 'idle' } | { phase: 'live'; start: string; hover: string };
export const DESK_IDLE: Desk = Object.freeze({ phase: 'idle' }) as Desk;
export const deskCancel = (): Desk => DESK_IDLE;
export const deskHover = (d: Desk, key: string): Desk => (d.phase === 'live' ? { ...d, hover: key } : d);

/** The live shape while the desktop drawing follows the mouse. */
export const deskShape = (v: View, combo: Combo, d: Desk): Ghost => {
  if (d.phase !== 'live') return { tiles: [], action: null, reason: null };
  if (combo.kind === 'clump') return clumpGhost(v, combo, growClump(combo, d.start, d.hover));
  const dir = dirToward(d.start, d.hover);
  return dir === null ? { tiles: [{ key: d.start, strength: ranksOf(v, combo.actions[0]!)[0]!, ok: true }], action: null, reason: null } : lineGhost(v, combo, d.start, dir);
};

/** A click: the first one starts on a legal hex; the second one finishes a legal shape (else keeps drawing). */
export const deskClick = (d: Desk, key: string, v: View, combo: Combo): { desk: Desk; finish: Meld | null } => {
  if (d.phase === 'idle') {
    const ok = combo.kind === 'line' ? lineEnds(combo).has(key) : clumpHexes(combo).has(key);
    return { desk: ok ? { phase: 'live', start: key, hover: key } : d, finish: null };
  }
  const shape = deskShape(v, combo, deskHover(d, key));
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

// ---------- UI overhaul item 7: calm highlights ----------

/**
 * While drawing, the hexes that can legally come next. A line (shape = [start, ...]): every
 * hex of a legal line from that start not drawn yet. A clump: every hex that, added to the
 * shape, still fits inside some legal clump and touches the shape.
 */
export const drawNext = (combo: Combo, shape: readonly string[]): Set<string> => {
  const out = new Set<string>();
  if (shape.length === 0) return drawStarts(combo);
  if (combo.kind === 'line') {
    for (const a of combo.actions as Run[]) {
      const ks = hexesOf(a);
      if (ks[0] !== shape[0] && ks.at(-1) !== shape[0]) continue;
      for (const k of ks) if (!shape.includes(k)) out.add(k);
    }
    return out;
  }
  if (shape.length >= combo.n) return out;
  for (const a of combo.actions) {
    const ks = hexesOf(a);
    if (!shape.every((k) => ks.includes(k))) continue;
    for (const k of ks) if (!shape.includes(k) && touches(shape, k)) out.add(k);
  }
  return out;
};

/** How bright a legal hex is from the pointer's distance (board units): 1 under it, 0 beyond `radius`, smooth between. */
export const proximity = (distance: number, radius = S * 3.2): number => {
  if (!(distance >= 0)) return 0;
  const t = Math.max(0, 1 - distance / radius);
  return t * t * (3 - 2 * t);
};
