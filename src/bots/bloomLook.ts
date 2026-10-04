// v0.7 Bloom look: a cheap first judgement of every legal Bloom (no cut check), so the bots
// only fully simulate a short list. Pure: reads only the View.
import { allNeighbors, bloomAction, bloomChoices, coordKey, homeCoord } from '../engine/index.js';
import type { Action, Player, View } from '../engine/index.js';

const other = (p: Player): Player => (p === 0 ? 1 : 0);
/** Per number spent on an empty hex (as GreedyBot's wastedStrength). */
const WASTED_STRENGTH = 0.02;

/** Blooms fully scored per Grow step (after the quick look); the levels may pass fewer. */
export const BLOOM_SHORTLIST = 10;

/** The quick look at one legal Bloom: cheap facts from the board, no cut check. */
export type BloomLook = {
  action: Extract<Action, { t: 'Bloom' }>;
  kind: 'set' | 'run';
  quick: number;
  replaced: number;
  replacedStrength: number;
  onRich: number;
  /** tiles touching an opponent tile, weighted by their number (strong tiles on the front line) */
  front: number;
  /** the Bloom's own links to my network (more = more compact, fewer single links) */
  links: number;
  /** it fills the last open sides around the opponent's root (a likely Strangle) */
  strangles: boolean;
};

/**
 * v0.7: every legal Bloom with a quick score, best first (ties keep the engine's order). It
 * prefers tiles gained, gold hexes, replacing the strongest opponent tiles, compact clusters
 * joined to the network by several links, and (for runs) the highest numbers on the front line.
 */
export const lookBlooms = (v: View): BloomLook[] => {
  const me = v.player;
  const opp = other(me);
  const ring = allNeighbors(homeCoord(opp, v.config)).map(coordKey).filter((k) => k in v.board);
  const open = ring.filter((k) => v.terrain[k] !== 'rock' && v.board[k]?.owner !== me);
  const enemyNear = (k: string) => {
    const [q, r] = k.split(',').map(Number) as [number, number];
    return allNeighbors({ q, r }).filter((n) => v.board[coordKey(n)]?.owner === opp).length;
  };
  const mineNear = (k: string) => {
    const [q, r] = k.split(',').map(Number) as [number, number];
    return allNeighbors({ q, r }).filter((n) => v.board[coordKey(n)]?.owner === me).length;
  };
  const out: BloomLook[] = [];
  for (const choice of bloomChoices(v)) {
    const keys = choice.hexes.map(coordKey);
    const near = keys.map(enemyNear);
    const links = keys.reduce((n, k) => n + mineNear(k), 0);
    const strangles = open.length > 0 && open.every((k) => keys.includes(k));
    for (const order of choice.orders) {
      const action = bloomAction(choice, order) as Extract<Action, { t: 'Bloom' }>;
      let replaced = 0;
      let replacedStrength = 0;
      let onRich = 0;
      let front = 0;
      let wasted = 0;
      order.forEach((hi, ci) => {
        const k = keys[hi]!;
        const rank = choice.cards[ci]!.rank;
        const t = v.board[k];
        if (t) {
          replaced++;
          replacedStrength += t.strength;
        } else wasted += rank;
        if (v.terrain[k] === 'rich') onRich++;
        front += near[hi]! * rank;
      });
      const quick =
        (strangles ? 1000 : 0) + choice.cards.length + 2 * replaced + 0.25 * replacedStrength + onRich + 0.4 * Math.min(links, 4) + 0.03 * front - WASTED_STRENGTH * wasted;
      out.push({ action, kind: choice.kind, quick, replaced, replacedStrength, onRich, front, links, strangles });
    }
  }
  return out
    .map((l, i) => ({ l, i }))
    .sort((x, y) => y.l.quick - x.l.quick || x.i - y.i)
    .map((x) => x.l);
};

/**
 * The short list for full scoring: mostly the best quick looks, plus the clusters most joined
 * to my network (they can protect a thin link) and the strongest takeovers, so a different
 * purpose is never crowded out. At most two looks per hex set (a different shape each time);
 * a likely Strangle always gets in.
 */
export const shortlistBlooms = (looks: readonly BloomLook[], n: number): BloomLook[] => {
  const per = new Map<string, number>();
  const out: BloomLook[] = [];
  const add = (l: BloomLook) => {
    if (out.length >= n || out.includes(l)) return;
    const k = l.action.hexes.map(coordKey).sort().join('|');
    if ((per.get(k) ?? 0) >= 2 && !l.strangles) return;
    per.set(k, (per.get(k) ?? 0) + 1);
    out.push(l);
  };
  const order = (f: (l: BloomLook) => number) => looks.map((l, i) => ({ l, i })).sort((x, y) => f(y.l) - f(x.l) || x.i - y.i).map((x) => x.l);
  for (const l of looks) if (l.strangles) add(l);
  const main = Math.max(1, Math.ceil(n * 0.6));
  for (const l of looks) if (out.length < main) add(l);
  const safe = Math.min(n, out.length + Math.ceil(n * 0.2));
  for (const l of order((x) => x.links)) if (out.length < safe) add(l);
  for (const l of order((x) => x.replacedStrength)) if (out.length < n && l.replaced > 0) add(l);
  for (const l of looks) add(l);
  return out;
};
