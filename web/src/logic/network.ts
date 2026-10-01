// The veins: links between touching tiles of one player that are joined to that
// player's root. A link is fragile when it is the only way some tiles reach the root
// (cutting it would cut them off): those are drawn thin and flickering.
import { allNeighbors, connectedKeys, coordKey, parseKey } from '../../../src/engine/index.js';
import type { Player, RulesConfig, Tile } from '../../../src/engine/index.js';

/**
 * A link between two touching tiles. `load`: how many tiles reach the root through it
 * (0 for a spare link in a loop). `fragile`: it is the only way some tiles reach the
 * root; `cut`: how many tiles cutting it would remove (0 when not fragile).
 */
export type Edge = { a: string; b: string; owner: Player; fragile: boolean; load: number; cut: number };
type Board = Record<string, Tile | null>;

export const networkEdges = (board: Board, config: RulesConfig, player: Player): Edge[] => {
  let joined: Set<string>;
  try {
    joined = connectedKeys(board, config, player);
  } catch {
    return []; // no root on this board (never in a real game)
  }
  const pairs: [string, string][] = [];
  for (const k of joined) {
    for (const n of allNeighbors(parseKey(k))) {
      const nk = coordKey(n);
      if (k < nk && joined.has(nk)) pairs.push([k, nk]);
    }
  }
  const adj = new Map<string, string[]>();
  for (const [a, b] of pairs) {
    adj.set(a, [...(adj.get(a) ?? []), b]);
    adj.set(b, [...(adj.get(b) ?? []), a]);
  }
  // Bridges (Tarjan): an edge is a bridge when nothing below it reaches above it.
  const order = new Map<string, number>();
  const low = new Map<string, number>();
  const bridges = new Set<string>();
  let t = 0;
  const visit = (u: string, parent: string | null) => {
    order.set(u, t);
    low.set(u, t++);
    for (const w of adj.get(u) ?? []) {
      if (w === parent) continue;
      if (!order.has(w)) {
        visit(w, u);
        low.set(u, Math.min(low.get(u)!, low.get(w)!));
        if (low.get(w)! > order.get(u)!) bridges.add([u, w].sort().join('|'));
      } else low.set(u, Math.min(low.get(u)!, order.get(w)!));
    }
  };
  for (const k of joined) if (!order.has(k)) visit(k, null);
  // Loads: a breadth-first tree from the root (neighbour order is fixed, so this is
  // deterministic); a link carries every tile below it in the tree.
  let root: string | null = null;
  for (const k of joined) if (board[k]?.root) root = k;
  const parent = new Map<string, string>();
  const order2: string[] = [];
  if (root) {
    const seen = new Set([root]);
    const queue = [root];
    while (queue.length) {
      const u = queue.shift()!;
      order2.push(u);
      for (const n of allNeighbors(parseKey(u))) {
        const w = coordKey(n);
        if (joined.has(w) && !seen.has(w)) {
          seen.add(w);
          parent.set(w, u);
          queue.push(w);
        }
      }
    }
  }
  const below = new Map<string, number>();
  for (const u of [...order2].reverse()) {
    const size = (below.get(u) ?? 0) + 1;
    below.set(u, size);
    const p = parent.get(u);
    if (p) below.set(p, (below.get(p) ?? 0) + size);
  }
  const loadOf = (a: string, b: string) => (parent.get(b) === a ? below.get(b)! : parent.get(a) === b ? below.get(a)! : 0);
  return pairs.map(([a, b]) => {
    const fragile = bridges.has([a, b].join('|'));
    const load = loadOf(a, b);
    return { a, b, owner: player, fragile, load, cut: fragile ? load : 0 };
  });
};

/** Links between touching tiles of `player` that are NOT joined to the root (a cut-off arm). */
export const looseEdges = (board: Board, config: RulesConfig, player: Player): Edge[] => {
  let joined: Set<string>;
  try {
    joined = connectedKeys(board, config, player);
  } catch {
    joined = new Set();
  }
  const out: Edge[] = [];
  for (const [k, t] of Object.entries(board)) {
    if (!t || t.owner !== player || joined.has(k)) continue;
    for (const n of allNeighbors(parseKey(k))) {
      const nk = coordKey(n);
      if (k < nk && board[nk]?.owner === player && !joined.has(nk)) out.push({ a: k, b: nk, owner: player, fragile: true, load: 0, cut: 0 });
    }
  }
  return out;
};

/**
 * How a vein looks: width (times the theme's vein width) and opacity grow with the
 * number of tiles depending on it, gently (square root) and capped. A fragile link is
 * thin whatever it carries, so it reads as easy to snap.
 */
export const veinLook = (load: number, fragile: boolean): { width: number; opacity: number } => {
  if (fragile) return { width: 0.6, opacity: Math.min(1, 0.6 + 0.06 * load) };
  return { width: Math.min(2.6, 0.9 + 0.45 * Math.sqrt(load)), opacity: Math.min(1, 0.62 + 0.09 * load) };
};

/** The fragile link that would cut off the most tiles, or null. Ties: the first in board order. */
export const weakestLink = (edges: readonly Edge[]): Edge | null => {
  let best: Edge | null = null;
  for (const e of edges) if (e.fragile && (!best || e.cut > best.cut)) best = e;
  return best;
};
