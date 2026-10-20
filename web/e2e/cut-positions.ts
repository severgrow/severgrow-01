// Built positions for the cut filmstrip (Part 2/4): the opponent's network hangs from one weak
// link next to its root; my 9 replaces that link and cuts off everything beyond it.
import { allCoords, allNeighbors, apply, coordKey, legalActions, newGame, parseKey, resolveConfig, rootCoord, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, State, Tile } from '../../src/engine/index.js';
import { buildSteps } from '../src/logic/anim.js';

// A roomier board than the product default (radius 3). The fixture needs a victim network large
// enough that a 3-4 tile cut is Severe and a 5-7 tile cut is Big (never "half their tiles" Huge),
// plus a clear corridor from my root to the cut link.
const LAYOUT_RADIUS = 5;
const cfg = resolveConfig({ boardRadius: LAYOUT_RADIUS });
const keys = allCoords(cfg.boardRadius).map(coordKey);
const nb = (k: string) => allNeighbors(parseKey(k)).map(coordKey).filter((x) => keys.includes(x));
const root = (p: Player) => coordKey(rootCoord(p, cfg.rootStyle, cfg.boardRadius));

/** A position where my next move cuts `n` opponent tiles (or the opponent's cuts `n` of mine when `mine`). */
export const cutPosition = (n: number, mine = false): { state: State; action: Action; cut: number } => {
  const me: Player = mine ? 1 : 0; // the cutter
  const them: Player = mine ? 0 : 1;
  const R = root(them);
  const Rm = root(me);
  for (const L of nb(R)) {
    // a chain of n tiles going away from the link, never touching the root
    const chain: string[] = [];
    const used = new Set([R, L, Rm, ...nb(Rm)]);
    let cur = L;
    while (chain.length < n) {
      const next = nb(cur).filter((x) => !used.has(x) && !nb(R).includes(x) && !chain.includes(x)).sort()[0];
      if (!next) break;
      chain.push(next);
      used.add(next);
      cur = next;
    }
    if (chain.length < n) continue;
    // A victim network of exactly the cut chain would always trip the "at least half their
    // tiles" Huge rule, so add a separate group hung off another root neighbour. It survives,
    // which keeps the fixture honest: 3-4 tiles = Severe, 5-7 = Big, 8+ = Huge by count.
    // (The running app counts the victim's tiles at the cut, after the link is already mine.)
    const wantSurvivors = n >= 2 && n <= 7 ? n + 1 : 0;
    const survivors: string[] = [];
    const L2 = nb(R).find((x) => x !== L && !used.has(x));
    if (L2 && wantSurvivors > 0) {
      survivors.push(L2);
      used.add(L2);
      let sc = L2;
      // Never place a survivor beside a doomed tile: it would reconnect the chain to the root
      // through L2, and the cut would not happen at all.
      const nearChain = (x: string) => chain.some((c) => nb(c).includes(x));
      while (survivors.length < wantSurvivors) {
        const next = nb(sc).filter((x) => !used.has(x) && !chain.includes(x) && x !== R && x !== L && !nearChain(x)).sort()[0];
        if (!next) break;
        survivors.push(next);
        used.add(next);
        sc = next;
      }
    }
    if (survivors.length < wantSurvivors) continue;
    // my path from my root to a hex next to the link (avoiding their tiles)
    const block = new Set([R, L, ...chain, ...survivors]);
    const prev = new Map<string, string>([[Rm, '']]);
    const q = [Rm];
    let goal: string | null = null;
    while (q.length && !goal) {
      const k = q.shift()!;
      for (const x of nb(k)) {
        if (prev.has(x) || block.has(x)) continue;
        prev.set(x, k);
        if (nb(L).includes(x)) {
          goal = x;
          break;
        }
        q.push(x);
      }
    }
    if (!goal) continue;
    const path: string[] = [];
    for (let k = goal; k && k !== Rm; k = prev.get(k)!) path.push(k);
    const g = newGame(5, { boardRadius: LAYOUT_RADIUS });
    const board: Record<string, Tile | null> = Object.fromEntries(keys.map((k) => [k, null]));
    board[R] = { owner: them, strength: 0, root: true };
    board[Rm] = { owner: me, strength: 0, root: true };
    board[L] = { owner: them, strength: 1 };
    for (const k of chain) board[k] = { owner: them, strength: 3 };
    for (const k of survivors) board[k] = { owner: them, strength: 3 };
    for (const k of path) board[k] = { owner: me, strength: 6 };
    const terrain = Object.fromEntries(keys.map((k) => [k, 'normal' as const]));
    const pool: Card[] = [...g.hands[0], ...g.hands[1], ...g.deck];
    const nine = pool.splice(pool.findIndex((c) => c.rank === 9), 1)[0]!;
    const hands: [Card[], Card[]] = [[], []];
    hands[me] = [nine, ...pool.splice(0, 6)];
    hands[them] = pool.splice(0, 7);
    const state: State = { ...g, board, terrain, hands, deck: pool, phase: 'ACT', actor: me, turnPlayer: me, history: [] };
    const action = legalActions(viewFor(state, me)).find((a) => a.t === 'Sprout' && a.card === nine.id && coordKey(a.coord) === L);
    if (!action) continue;
    const after = apply(state, action);
    const cut = buildSteps(state, action, after, 0).filter((s) => s.k === 'sever').reduce((t, s) => t + (s.k === 'sever' ? s.keys.length : 0), 0);
    if (cut >= n) return { state, action, cut };
  }
  throw new Error(`no position for a cut of ${n}`);
};
