// Fruit from the tile card (UI polish pass 3): tap an opponent tile, then "Fruit this tile".
// The game suggests the 3 tiles to give up; "Change" picks another legal set; then a
// plain-words preview and Confirm. Pure functions of the player's View and legal moves (the
// engine's own legal Fruit actions); the flow state is a small plain object.
import { allNeighbors, coordKey, rootCoord } from '../../../src/engine/index.js';
import type { Action, Player, View } from '../../../src/engine/index.js';
import { simulate } from '../../../src/bots/evaluate.js';
import { targetHexes } from './interaction.js';
import type { Sel } from './interaction.js';

type Fruit = Extract<Action, { t: 'Fruit' }>;

/** The flow after "Fruit this tile". Step 1: the tiles to give up (suggested, or being changed); step 2: preview. */
export type FruitFlow = {
  target: string;
  step: 1 | 2;
  /** the tiles to give up (in Change: the ones picked so far) */
  picks: string[];
  /** true while the player picks another set ("Change") */
  changing: boolean;
  /** the set before Change (Undo with nothing picked goes back to it) */
  before: string[];
};

export const FRUIT_TOP_NOTE = 'No card can replace this. Fruit can.';
export const FRUIT_LATER = 'Fruit could remove this. You need 3 connected tiles next to it.';

const fruits = (legal: readonly Action[]): Fruit[] => legal.filter((a): a is Fruit => a.t === 'Fruit');
const sacKeys = (a: Fruit) => a.sacrifice.map(coordKey);
const sortKeys = (keys: readonly string[]) => [...keys].sort();
const forTarget = (legal: readonly Action[], target: string) => fruits(legal).filter((a) => coordKey(a.target) === target);
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((k) => b.includes(k));
/** Fruit is on, unused, and it is my Grow step. */
const fruitLeft = (v: View) => v.config.fruitPerPlayer > 0 && v.fruitUsed[v.player] < v.config.fruitPerPlayer && v.phase === 'ACT' && v.actor === v.player;

export type FruitOffer = { kind: 'action'; label: string; note: string | null } | { kind: 'info'; text: string } | null;

/**
 * What the tile card says about Fruit for the hex `key`: a button ("Fruit this tile"), an
 * information line (possible in principle, not yet), or nothing (Fruit used, off, not my
 * Grow step, or not an opponent tile other than their root).
 */
export const fruitOffer = (v: View, legal: readonly Action[], key: string): FruitOffer => {
  const t = v.board[key];
  if (!fruitLeft(v) || !t || t.owner === v.player || t.root) return null;
  if (forTarget(legal, key).length > 0) return { kind: 'action', label: 'Fruit this tile', note: t.strength >= v.config.maxRank ? FRUIT_TOP_NOTE : null };
  if (v.config.fruitOnlyWhenBehind && v.score >= v.opponentScore) return { kind: 'info', text: 'Fruit could remove this while you are behind.' };
  return { kind: 'info', text: FRUIT_LATER.replace('3', String(v.config.fruitSacrifice)) };
};

/** The preview: a plain-words result chip and any warnings. */
export const fruitPreview = (v: View, a: Fruit): { chip: string; warnings: string[]; ownCut: string[]; theirCut: string[] } => {
  const sim = simulate(v, a)!;
  const me = v.player;
  const opp: Player = me === 0 ? 1 : 0;
  const gone = new Set([...sacKeys(a), coordKey(a.target)]);
  const cutOf = (p: Player) => Object.keys(v.board).filter((k) => v.board[k]?.owner === p && !v.board[k]?.root && !gone.has(k) && !sim.board[k]);
  const ownCut = cutOf(me);
  const theirCut = cutOf(opp);
  const sac = a.sacrifice.length;
  const mine = `You give up ${sac}${ownCut.length ? `, plus ${ownCut.length} cut off` : ''}.`;
  const theirs = `They lose 1${theirCut.length ? `, plus ${theirCut.length} cut off` : ''}.`;
  const net = `Net: -${sac + ownCut.length} for you, -${1 + theirCut.length} for them.`;
  const warnings: string[] = [];
  if (ownCut.length) warnings.push(`Careful: this cuts off ${ownCut.length} of your tiles`);
  // my root nearly surrounded afterwards (4+ of its 6 neighbours blocked by them, rock or the edge)?
  const root = rootCoord(me, v.config.rootStyle, v.config.boardRadius);
  const blocked = allNeighbors(root).filter((n) => {
    const k = coordKey(n);
    if (!(k in v.board)) return true;
    if (v.terrain[k] === 'rock') return true;
    return sim.board[k]?.owner === opp;
  }).length;
  if (blocked >= 4 && !sim.wins) warnings.push('Careful: your root would be easy to surround');
  if (sim.wins) warnings.length = 0;
  return { chip: `${mine} ${theirs} ${net}`, warnings, ownCut, theirCut };
};

/**
 * The 3 tiles the game suggests giving up for `target`: among all legal sets, the one that
 * cuts off the fewest of my own tiles, then the lowest total strength, then a fixed order
 * (the sorted hex names). Worked out on copies; nothing changes. Null if there is none.
 */
export const bestSacrifice = (v: View, legal: readonly Action[], target: string): string[] | null => {
  let best: { keys: string[]; cut: number; sum: number; id: string } | null = null;
  for (const a of forTarget(legal, target)) {
    const keys = sortKeys(sacKeys(a));
    const cut = fruitPreview(v, a).ownCut.length;
    const sum = keys.reduce((n, k) => n + (v.board[k]?.strength ?? 0), 0);
    const id = keys.join(' ');
    if (!best || cut < best.cut || (cut === best.cut && (sum < best.sum || (sum === best.sum && id < best.id)))) best = { keys, cut, sum, id };
  }
  return best?.keys ?? null;
};

/** "Fruit this tile": step 1 with the suggested tiles. */
export const startFruit = (v: View, legal: readonly Action[], target: string): FruitFlow => {
  const picks = bestSacrifice(v, legal, target) ?? [];
  return { target, step: 1, picks, changing: false, before: picks };
};

/** "Change": pick another set (the valid tiles glow). */
export const fruitChange = (f: FruitFlow): FruitFlow => ({ ...f, step: 1, changing: true, before: f.changing ? f.before : f.picks, picks: [] });

/** The tiles that glow while changing: my tiles that still lead to a legal set for the target. */
export const fruitPickable = (_v: View, legal: readonly Action[], f: FruitFlow): Set<string> => {
  if (!f.changing) return new Set();
  const ok = forTarget(legal, f.target).filter((a) => f.picks.every((k) => sacKeys(a).includes(k)));
  return new Set(ok.flatMap(sacKeys).filter((k) => !f.picks.includes(k)));
};

/** A tap on the board while changing: the next flow state, or a short reason the tap was refused. */
export const tapFruit = (v: View, legal: readonly Action[], f: FruitFlow, key: string): { flow: FruitFlow; refused: string | null } => {
  if (!f.changing) return { flow: f, refused: null };
  if (f.picks.includes(key)) return { flow: { ...f, picks: f.picks.filter((k) => k !== key) }, refused: null };
  const tile = v.board[key];
  if (tile?.root && tile.owner === v.player) return { flow: f, refused: "Your root can't be given up" };
  if (!tile || tile.owner !== v.player) return { flow: f, refused: `Pick ${v.config.fruitSacrifice} of your own tiles` };
  if (!fruitPickable(v, legal, f).has(key)) {
    const inSome = forTarget(legal, f.target).some((a) => sacKeys(a).includes(key));
    return { flow: f, refused: inSome ? 'Pick tiles that touch each other' : 'At least one must touch the tile you remove' };
  }
  const picks = [...f.picks, key];
  const done = picks.length === v.config.fruitSacrifice && forTarget(legal, f.target).some((a) => sameSet(sacKeys(a), picks));
  return { flow: done ? { ...f, picks, changing: false, before: picks } : { ...f, picks }, refused: null };
};

/** Step 1 to step 2 (only with a complete legal set). */
export const fruitNext = (legal: readonly Action[], f: FruitFlow): FruitFlow =>
  !f.changing && forTarget(legal, f.target).some((a) => sameSet(sacKeys(a), f.picks)) ? { ...f, step: 2 } : f;

/** Undo inside the flow: one step back. */
export const fruitUndo = (f: FruitFlow): FruitFlow => {
  if (f.step === 2) return { ...f, step: 1 };
  if (f.changing && f.picks.length > 0) return { ...f, picks: f.picks.slice(0, -1) };
  if (f.changing) return { ...f, changing: false, picks: f.before };
  return f;
};

/** The legal Fruit the flow describes (in the engine's own form), or null. */
export const fruitAction = (legal: readonly Action[], f: FruitFlow): Fruit | null =>
  f.step === 2 ? (forTarget(legal, f.target).find((a) => sameSet(sacKeys(a), f.picks)) ?? null) : null;

/**
 * A tap on the board in my Grow step: "sprout" when it is a legal spot for the picked card
 * (the Sprout preview, as before); "tilecard" on an opponent tile the picked card cannot
 * take (the tile card opens, offering Fruit); "default" otherwise (unchanged behaviour).
 */
export const hexTapIntent = (v: View, legal: readonly Action[], sel: Sel, key: string): 'sprout' | 'tilecard' | 'default' => {
  const picking = sel.card !== null || sel.kind !== null;
  if (picking && targetHexes(v, legal, sel).has(key)) return 'sprout';
  const t = v.board[key];
  if (t && t.owner !== v.player && !t.root) return 'tilecard';
  return 'default';
};

/** The one-time tip: the opponent has a top-rank tile and my Fruit is still unused. */
export const showTopTip = (v: View, seen: boolean): boolean =>
  !seen &&
  v.config.fruitPerPlayer > 0 &&
  v.fruitUsed[v.player] < v.config.fruitPerPlayer &&
  Object.values(v.board).some((t) => !!t && t.owner !== v.player && !t.root && t.strength >= v.config.maxRank);
