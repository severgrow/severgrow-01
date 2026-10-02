// The Fruit button and its guided three-step flow (v0.5): pick 3 of my tiles to give up,
// pick the enemy tile to remove, then a plain-words preview and Confirm. Pure functions of
// the player's View and legal moves; the flow state is a small plain object.
import { allNeighbors, coordKey, parseKey, rootCoord } from '../../../src/engine/index.js';
import type { Action, Player, View } from '../../../src/engine/index.js';
import { simulate } from '../../../src/bots/evaluate.js';

type Fruit = Extract<Action, { t: 'Fruit' }>;
export type FruitFlow = { step: 1 | 2 | 3; picks: string[]; target: string | null; counter: string; note: string | null };
export const FRUIT_START: FruitFlow = Object.freeze({ step: 1, picks: [], target: null, counter: '0/3', note: null }) as FruitFlow;

const fruits = (legal: readonly Action[]): Fruit[] => legal.filter((a): a is Fruit => a.t === 'Fruit');
const sacKeys = (a: Fruit) => a.sacrifice.map(coordKey);
const counterOf = (v: View, n: number) => `${n}/${v.config.fruitSacrifice}`;

/** The Fruit button: shown only when Fruit is on; disabled with a one-line reason when it cannot be used. */
export const fruitButton = (v: View, legal: readonly Action[]) => {
  const per = v.config.fruitPerPlayer;
  const usedN = v.fruitUsed[v.player];
  const left = Math.max(0, per - usedN);
  if (per <= 0) return { show: false, enabled: false, left: 0, reason: null as string | null, used: false };
  if (left === 0) return { show: true, enabled: false, left, reason: 'Already used', used: true };
  if (fruits(legal).length > 0) return { show: true, enabled: true, left, reason: null, used: false };
  const reason = (() => {
    if (v.config.fruitOnlyWhenBehind && v.score >= v.opponentScore) return 'Only while you are behind';
    // a connected group of fruitSacrifice of my non-root tiles?
    const mine = Object.keys(v.board).filter((k) => v.board[k]?.owner === v.player && !v.board[k]?.root);
    const seen = new Set<string>();
    let biggest = 0;
    for (const k of mine) {
      if (seen.has(k)) continue;
      let size = 0;
      const stack = [k];
      seen.add(k);
      while (stack.length) {
        const c = stack.pop()!;
        size++;
        for (const n of allNeighbors(parseKey(c))) {
          const nk = coordKey(n);
          if (!seen.has(nk) && v.board[nk]?.owner === v.player && !v.board[nk]?.root) {
            seen.add(nk);
            stack.push(nk);
          }
        }
      }
      biggest = Math.max(biggest, size);
    }
    if (biggest < v.config.fruitSacrifice) return `Needs ${v.config.fruitSacrifice} connected tiles`;
    return 'No enemy tile next to them';
  })();
  return { show: true, enabled: false, left, reason, used: false };
};

/** The hexes that glow now: step 1 my tiles that still lead to a Fruit, step 2 the possible targets. */
export const fruitPickable = (_v: View, legal: readonly Action[], f: FruitFlow): Set<string> => {
  const all = fruits(legal);
  if (f.step === 1) {
    const ok = all.filter((a) => f.picks.every((k) => sacKeys(a).includes(k)));
    return new Set(ok.flatMap(sacKeys).filter((k) => !f.picks.includes(k)));
  }
  const same = all.filter((a) => sacKeys(a).length === f.picks.length && f.picks.every((k) => sacKeys(a).includes(k)));
  return new Set(same.map((a) => coordKey(a.target)));
};

/** A tap during the flow: the next flow state, or a short reason the tap was refused. */
export const tapFruit = (v: View, legal: readonly Action[], f: FruitFlow, key: string): { flow: FruitFlow; refused: string | null } => {
  const tile = v.board[key];
  const need = v.config.fruitSacrifice;
  if (f.step === 1) {
    if (f.picks.includes(key)) {
      const picks = f.picks.filter((k) => k !== key);
      return { flow: { ...f, picks, counter: counterOf(v, picks.length) }, refused: null };
    }
    if (tile?.root && tile.owner === v.player) return { flow: f, refused: "Your root can't be given up" };
    if (!tile || tile.owner !== v.player) return { flow: f, refused: `Pick ${need} of your own tiles` };
    if (!fruitPickable(v, legal, f).has(key)) {
      const touching = fruits(legal).some((a) => sacKeys(a).includes(key));
      return { flow: f, refused: touching ? 'Pick tiles that touch each other' : 'No enemy tile next to that one' };
    }
    const picks = [...f.picks, key];
    const done = picks.length === need;
    return {
      flow: { step: done ? 2 : 1, picks, target: null, counter: counterOf(v, picks.length), note: done ? 'Fruit ignores strength: even a 9 can go.' : null },
      refused: null,
    };
  }
  if (!fruitPickable(v, legal, f).has(key)) return { flow: f, refused: 'Pick an enemy tile next to the ones you give up' };
  return { flow: { ...f, step: 3, target: key, note: null }, refused: null };
};

/** Undo inside the flow: one step back. */
export const fruitUndo = (f: FruitFlow): FruitFlow => {
  if (f.step === 3) return { ...f, step: 2, target: null };
  if (f.step === 2 || f.picks.length > 0) {
    const picks = f.picks.slice(0, -1);
    return { step: 1, picks, target: null, counter: `${picks.length}/${f.counter.split('/')[1]}`, note: null };
  }
  return f;
};

/** The legal Fruit the flow describes (in the engine's own form), or null. */
export const fruitAction = (legal: readonly Action[], f: FruitFlow): Fruit | null =>
  f.step === 3 && f.target
    ? (fruits(legal).find((a) => coordKey(a.target) === f.target && sacKeys(a).length === f.picks.length && f.picks.every((k) => sacKeys(a).includes(k))) ?? null)
    : null;

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
  const mine = `You lose ${sac}${ownCut.length ? `, plus ${ownCut.length} cut off` : ''}.`;
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
