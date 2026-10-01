// The veins: links between touching tiles of one player that are joined to that
// player's root. A link is fragile when it is the only way some tiles reach the root
// (cutting it would cut them off): those are drawn thin and flickering.
import { allNeighbors, connectedKeys, coordKey, parseKey } from '../../../src/engine/index.js';
import type { Player, RulesConfig, Tile } from '../../../src/engine/index.js';

export type Edge = { a: string; b: string; owner: Player; fragile: boolean };
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
  return pairs.map(([a, b]) => ({ a, b, owner: player, fragile: bridges.has([a, b].join('|')) }));
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
      if (k < nk && board[nk]?.owner === player && !joined.has(nk)) out.push({ a: k, b: nk, owner: player, fragile: true });
    }
  }
  return out;
};
