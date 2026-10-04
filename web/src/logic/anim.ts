// Turns the engine's events for one action into animation steps. The page shows the
// board through an AnimQueue: each step changes the shown board a little, and the
// final "sync" step always sets it to the engine's real board, so skipping, cutting
// short or turning off animations can never leave a wrong board on screen.
import { coordKey, eventsOf, hexDistance, parseKey, scores } from '../../../src/engine/index.js';
import type { Action, Card, GameResult, Player, State, Tile } from '../../../src/engine/index.js';
import { cardName } from '../../../src/playtest/names.js';
import { FRUIT, OPP } from '../../../src/strings.js';

export type Board = Record<string, Tile | null>;
export type GrowTile = { key: string; strength: number; replaced: boolean };

export type Step =
  | { k: 'draw'; player: Player; from: 'deck' | 'discard'; card?: Card }
  | { k: 'grow'; style: 'bloom' | 'sprout'; player: Player; tiles: GrowTile[] }
  | { k: 'sever'; player: Player; by: Player; keys: string[]; origin: string }
  | { k: 'remove'; reason: 'fruit' | 'rot'; keys: string[] }
  | { k: 'strengthen'; player: Player; key: string; from: number; to: number }
  /** v0.6: a Fruit card removes one tile (`strength` before), then the cut follows as its own steps */
  | { k: 'fruit'; player: Player; card: Card; target: string; strength: number }
  | { k: 'discard'; player: Player; card: Card }
  | { k: 'strangle'; loser: Player }
  | { k: 'turn'; player: Player; final: boolean }
  | { k: 'end'; result: GameResult }
  | { k: 'sync'; board: Board; scores: [number, number] };

const copyBoard = (b: Board): Board => Object.fromEntries(Object.entries(b).map(([k, t]) => [k, t ? { ...t } : null]));

export const buildSteps = (before: State, action: Action, after: State, viewer: Player): Step[] => {
  const steps: Step[] = [];
  const mover = before.turnPlayer;
  const opp = (p: Player): Player => (p === 0 ? 1 : 0);
  const hits: string[] = []; // where this action struck: origins for cut ripples
  const cardIn = (cards: readonly Card[], id: number) => cards.find((c) => c.id === id);

  for (const e of eventsOf(before, action, after)) {
    switch (e.t) {
      case 'Draw': {
        let card: Card | undefined;
        if (e.from === 'discard') card = before.discard.at(-1);
        else if (e.player === viewer && e.card !== undefined) card = cardIn(after.hands[viewer], e.card) ?? cardIn(before.deck, e.card);
        steps.push(card ? { k: 'draw', player: e.player, from: e.from, card: { ...card } } : { k: 'draw', player: e.player, from: e.from });
        break;
      }
      case 'Bloom':
      case 'Sprout': {
        const ids = e.t === 'Sprout' ? [e.card] : e.cards;
        const coords = e.t === 'Sprout' ? [e.coord] : e.hexes;
        const ranks = ids.map((id) => cardIn(before.hands[e.player], id)?.rank ?? 1);
        const tiles = coords.map((c, i) => {
          const key = coordKey(c);
          const now = after.board[key];
          const strength = now && now.owner === e.player ? now.strength : ranks[i]!;
          return { key, strength, replaced: before.board[key]?.owner === opp(e.player) };
        });
        hits.push(...tiles.filter((t) => t.replaced).map((t) => t.key), ...tiles.map((t) => t.key));
        steps.push({ k: 'grow', style: e.t === 'Bloom' ? 'bloom' : 'sprout', player: e.player, tiles });
        break;
      }
      case 'Strengthen':
        steps.push({ k: 'strengthen', player: e.player, key: coordKey(e.coord), from: e.oldStrength, to: e.newStrength });
        break;
      case 'FruitCard': {
        hits.push(coordKey(e.target));
        steps.push({ k: 'fruit', player: e.player, card: { id: e.card, suit: null, rank: 0 }, target: coordKey(e.target), strength: e.strength });
        break;
      }
      case 'Rot':
        hits.push(...e.coords.map(coordKey));
        steps.push({ k: 'remove', reason: 'rot', keys: e.coords.map(coordKey) });
        break;
      case 'Sever': {
        const keys = e.coords.map(coordKey);
        const dist = (from: string) => Math.min(...keys.map((k) => hexDistance(parseKey(k), parseKey(from))));
        const origin = hits.length ? hits.reduce((best, h) => (dist(h) < dist(best) ? h : best)) : keys[0]!;
        const d = (k: string) => hexDistance(parseKey(k), parseKey(origin));
        keys.sort((a, b) => d(a) - d(b) || a.localeCompare(b));
        steps.push({ k: 'sever', player: e.player, by: mover, keys, origin });
        break;
      }
      case 'Discard': {
        const card = cardIn(before.hands[e.player], e.card);
        if (card) steps.push({ k: 'discard', player: e.player, card: { ...card } });
        break;
      }
      case 'Strangle':
        steps.push({ k: 'strangle', loser: e.player });
        break;
      case 'GameEnd':
        steps.push({ k: 'end', result: e.result });
        break;
      default:
        break; // Overgrow is shown inside its grow step; parked-rule bookkeeping has no picture
    }
  }
  if (after.phase !== 'GAME_OVER' && after.turnPlayer !== before.turnPlayer) {
    steps.push({ k: 'turn', player: after.turnPlayer, final: !!after.finalTurn });
  }
  steps.push({ k: 'sync', board: copyBoard(after.board), scores: scores(after) });
  return steps;
};

/** The shown board after one step (never changes the board passed in). */
export const applyStep = (board: Board, s: Step): Board => {
  switch (s.k) {
    case 'grow': {
      const next = { ...board };
      for (const t of s.tiles) next[t.key] = { owner: s.player, strength: t.strength };
      return next;
    }
    case 'sever':
    case 'remove': {
      const next = { ...board };
      for (const k of s.keys) next[k] = null;
      return next;
    }
    case 'strengthen': {
      const t = board[s.key];
      return t ? { ...board, [s.key]: { owner: t.owner, strength: s.to, ...(t.root ? { root: true } : {}) } } : board;
    }
    case 'fruit': {
      const next = { ...board };
      next[s.target] = null;
      return next;
    }
    case 'sync':
      return copyBoard(s.board);
    default:
      return board;
  }
};

/** Steps waiting to be shown, and the board as currently shown. Has no clock: the page drives it. */
export class AnimQueue {
  private queue: Step[] = [];
  constructor(public board: Board) {}
  get pending(): number {
    return this.queue.length;
  }
  push(steps: readonly Step[]): void {
    this.queue.push(...steps);
  }
  /** The next step, without showing it yet. */
  peek(): Step | undefined {
    return this.queue[0];
  }
  /** Shows the next step; returns it (undefined when nothing is waiting). */
  next(): Step | undefined {
    const s = this.queue.shift();
    if (s) this.board = applyStep(this.board, s);
    return s;
  }
  /** Shows everything at once (animations off or skipped). */
  skipAll(): Step[] {
    const rest = this.queue.splice(0);
    this.board = rest.reduce(applyStep, this.board);
    return rest;
  }
  reset(board: Board): void {
    this.queue = [];
    this.board = board;
  }
}

const tiles = (n: number) => `${n} tile${n === 1 ? '' : 's'}`;

/** A short caption shown near the action, or null. */
export const captionFor = (s: Step, viewer: Player): string | null => {
  switch (s.k) {
    case 'sever':
      return s.player !== viewer ? `You cut off ${s.keys.length} ${OPP.noun} tile${s.keys.length === 1 ? '' : 's'}!` : `${OPP.The} cut off ${s.keys.length} of your tiles`;
    case 'grow': {
      const taken = s.tiles.filter((t) => t.replaced).length;
      if (s.player === viewer) return taken > 0 ? `You took over ${taken} ${OPP.noun} tile${taken === 1 ? '' : 's'}` : null;
      return taken > 0 ? `${OPP.The} grew ${tiles(s.tiles.length)}, taking ${taken} of yours` : `${OPP.The} grew ${tiles(s.tiles.length)}`;
    }
    case 'strangle':
      return s.loser === viewer ? 'Your root is surrounded!' : `${OPP.Theirs} root is surrounded!`;
    case 'strengthen':
      return s.player === viewer ? `Strengthened ${s.from} → ${s.to}` : `${OPP.The} strengthened a ${s.from} to a ${s.to}`;
    case 'fruit':
      return s.player === viewer ? `${FRUIT.banner} Their ${s.strength} is gone` : FRUIT.oppDid(s.strength);
    case 'discard':
      return s.player === viewer ? null : `${OPP.The} threw away ${cardName(s.card)}`;
    case 'draw':
      if (s.player === viewer || s.from === 'deck') return null;
      return s.card?.suit === null ? FRUIT.oppTook : `${OPP.The} took ${cardName(s.card!)}`;
    default:
      return null;
  }
};
