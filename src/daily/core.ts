// THE DAILY PUZZLE — the rules side (owner, 2026-10-27; design: the "Futasaku Daily Puzzle" doc).
//
// A puzzle is ONE of my turns, frozen at the start of its Grow step: I have already drawn, the
// opponent never moves. It carries one goal the engine can check exactly. This module is pure and
// deterministic (no clock, no I/O), and it is shared by three callers that must never disagree:
//
//   - the game, to tell a player their try solved it;
//   - the server, which replays a claimed solve through the real rules before granting its tile;
//   - the generator and the build guard, which PROVE every shipped puzzle has exactly one answer.
//
// It adds no rule. Every move is `apply` on the engine's own `legalActions`.
import { apply, eventsOf, legalActions, scores, viewFor } from '../engine/index.js';
import type { Action, Player, State } from '../engine/index.js';

/** What the player must achieve this turn. */
export type DailyGoal =
  /** Surround their home (Strangle) this turn: the engine ends the game with me as winner. */
  | { kind: 'win' }
  /** Cut off at least `n` of their tiles this turn (the Sever events of my actions). */
  | { kind: 'cut'; n: number }
  /** Grow my lead (my points minus theirs) by at least `n` this turn. */
  | { kind: 'points'; n: number };

export type DailyPuzzle = {
  /** The puzzle's number, shown as #042. Day 1 is puzzle 1; never reused or renumbered. */
  no: number;
  /** A short title for the share line: "The Long Root". */
  title: string;
  /** One line shown after a solve: what made it clever. */
  note: string;
  goal: DailyGoal;
  /** The position: my Grow step, `turnPlayer === actor`, phase ACT. */
  start: State;
};

/** What one played turn did, measured against the puzzle's start. */
export type TurnOutcome = {
  /** The state when the turn's Grow step ended (before the throw). */
  end: State;
  /** Their tiles my actions cut off this turn. */
  cut: number;
  /** How much my lead (my points minus theirs) grew this turn. */
  gain: number;
  /** The game ended this turn with me as the winner. */
  won: boolean;
};

const other = (p: Player): Player => (p === 0 ? 1 : 0);

/** My points minus theirs. */
export const leadOf = (s: State, me: Player): number => {
  const sc = scores(s);
  return sc[me] - sc[other(me)];
};

/** A board as an order-independent key (equal boards, equal keys). */
export const boardKey = (s: State): string =>
  Object.entries(s.board)
    .filter(([, t]) => t)
    .map(([k, t]) => `${k}:${t!.owner}:${t!.strength}${t!.root ? 'r' : ''}`)
    .sort()
    .join('|');

/** Thrown when a claimed turn is not a legal, finished turn from the puzzle's start. */
export class DailyTurnError extends Error {
  constructor(readonly code: 'NOT_A_GROW_STEP' | 'NOT_MY_TURN' | 'DRAW_IN_PUZZLE' | 'ILLEGAL' | 'UNFINISHED' | 'AFTER_THE_END' | 'TOO_LONG') {
    super(code);
    this.name = 'DailyTurnError';
  }
}

/** A real turn is short; anything longer than this is not a turn (it bounds the server's work). */
export const MAX_TURN_ACTIONS = 40;

/**
 * Plays `actions` from the puzzle's start and measures the turn. The actions are my Grow step
 * (Sprout / Bloom / Blast / Bomb / Fruit / Strengthen, in any order) ending with `EndAct`, and
 * optionally the throw (`Discard`) that ends the turn — nothing after it. A Strangle may end the
 * game mid-step; that also ends the turn. Throws `DailyTurnError` for anything else, so a server
 * can refuse a forged claim without knowing why it was forged.
 */
export const playTurn = (start: State, actions: readonly Action[]): TurnOutcome => {
  if (start.phase !== 'ACT') throw new DailyTurnError('NOT_A_GROW_STEP');
  const me = start.turnPlayer;
  if (start.actor !== me) throw new DailyTurnError('NOT_MY_TURN');
  if (actions.length > MAX_TURN_ACTIONS) throw new DailyTurnError('TOO_LONG');
  let s = start;
  let cut = 0;
  let end: State | null = null;
  for (const a of actions) {
    if (end) {
      // only the throw may follow the end of the Grow step
      if (a.t !== 'Discard' || end.phase !== 'DISCARD' || s !== end) throw new DailyTurnError('AFTER_THE_END');
      try {
        s = apply(s, a);
      } catch {
        throw new DailyTurnError('ILLEGAL');
      }
      continue;
    }
    if (a.t === 'Draw') throw new DailyTurnError('DRAW_IN_PUZZLE');
    const before = s;
    try {
      s = apply(s, a);
    } catch {
      throw new DailyTurnError('ILLEGAL');
    }
    for (const e of eventsOf(before, a, s)) if (e.t === 'Sever' && e.player !== me) cut += e.coords.length;
    if (s.phase !== 'ACT') end = s;
  }
  if (!end) throw new DailyTurnError('UNFINISHED');
  const won = !!end.result && end.result.winner === me;
  return { end, cut, gain: leadOf(end, me) - leadOf(start, me), won };
};

/** Whether a measured turn meets the goal. */
export const goalMet = (goal: DailyGoal, o: TurnOutcome): boolean => {
  switch (goal.kind) {
    case 'win':
      return o.won;
    case 'cut':
      return o.cut >= goal.n;
    case 'points':
      return o.won || o.gain >= goal.n;
  }
};

/** Every distinct way the Grow step can end, with one action path that reaches it. */
export type TurnSpace = {
  /** Board key → one action path reaching it (ending with EndAct, or the move that won). */
  endings: Map<string, { actions: Action[]; outcome: TurnOutcome }>;
  /** States visited. */
  visited: number;
  /** True when the search stopped at `cap` — then nothing can be PROVEN about the turn. */
  capped: boolean;
};

/**
 * Exhaustive search of my Grow step: every legal sequence of Grow-step actions until it ends.
 * Deterministic (actions in the engine's own order), bounded by `cap` visited states.
 */
export const exploreTurn = (start: State, cap = 50_000): TurnSpace => {
  const me = start.turnPlayer;
  const endings = new Map<string, { actions: Action[]; outcome: TurnOutcome }>();
  const seen = new Set<string>();
  const startLead = leadOf(start, me);
  type Node = { s: State; path: Action[]; cut: number };
  const stack: Node[] = [{ s: start, path: [], cut: 0 }];
  let visited = 0;
  while (stack.length) {
    if (visited >= cap) return { endings, visited, capped: true };
    const { s, path, cut } = stack.pop()!;
    const key = `${boardKey(s)}#${s.hands[me].map((c) => c.id).sort((a, b) => a - b).join(',')}#${s.phase}#${cut}`;
    if (seen.has(key)) continue;
    seen.add(key);
    visited++;
    if (s.phase !== 'ACT') {
      const k = boardKey(s);
      if (!endings.has(k)) {
        const won = !!s.result && s.result.winner === me;
        endings.set(k, { actions: path, outcome: { end: s, cut, gain: leadOf(s, me) - startLead, won } });
      }
      continue;
    }
    const legal = legalActions(viewFor(s, s.actor));
    // reverse so the engine's first action is explored first (a stack pops the last)
    for (let i = legal.length - 1; i >= 0; i--) {
      const a = legal[i]!;
      if (a.t === 'Draw' || a.t === 'Discard') continue;
      let next: State;
      try {
        next = apply(s, a);
      } catch {
        continue;
      }
      let c = cut;
      for (const e of eventsOf(s, a, next)) if (e.t === 'Sever' && e.player !== me) c += e.coords.length;
      stack.push({ s: next, path: [...path, a], cut: c });
    }
  }
  return { endings, visited, capped: false };
};

/** The endings of the turn that meet the goal. */
export const solvingEndings = (space: TurnSpace, goal: DailyGoal) =>
  [...space.endings.values()].filter((e) => goalMet(goal, e.outcome));

export type Proof =
  | { ok: true; solution: Action[]; endings: number; visited: number }
  | { ok: false; reason: 'NO_SOLUTION' | 'SEVERAL_SOLUTIONS' | 'TOO_LARGE' | 'BAD_START'; solutions?: number };

/**
 * THE PROMISE every shipped puzzle keeps: exactly ONE ending of the turn meets the goal (different
 * orders that reach the same board are the same answer). Checked by exhaustive search; a turn too
 * large to search fully proves nothing and is rejected.
 */
export const prove = (p: Pick<DailyPuzzle, 'goal' | 'start'>, cap = 50_000): Proof => {
  if (p.start.phase !== 'ACT' || p.start.actor !== p.start.turnPlayer) return { ok: false, reason: 'BAD_START' };
  const space = exploreTurn(p.start, cap);
  if (space.capped) return { ok: false, reason: 'TOO_LARGE' };
  const solving = solvingEndings(space, p.goal);
  if (solving.length === 0) return { ok: false, reason: 'NO_SOLUTION' };
  if (solving.length > 1) return { ok: false, reason: 'SEVERAL_SOLUTIONS', solutions: solving.length };
  return { ok: true, solution: solving[0]!.actions, endings: space.endings.size, visited: space.visited };
};
