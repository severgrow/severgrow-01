// Section 15 property checks, used by the test suite and by `npm run properties`.
import {
  IllegalActionError,
  allCoords,
  apply,
  connectedKeys,
  coordKey,
  createCards,
  legalActionsForState,
  newGame,
  rootCoord,
  viewFor,
} from '../engine/index.js';
import type { Action, RulesConfig, State } from '../engine/index.js';
import { createRandomBot } from '../bots/RandomBot.js';
import { GreedyBot } from '../bots/GreedyBot.js';

/** Development safety caps from section 15, invariant 9 (v0.3.1: per bot). */
export const MAX_TURNS = { greedy: 60, random: 150 } as const;
export type PropertyBot = keyof typeof MAX_TURNS;

export type FailureReport = {
  seed: number;
  config?: Partial<RulesConfig>;
  actions: Action[];
  failingAction?: Action;
  before?: State;
  after?: State;
};

/** A broken invariant, with everything needed to replay it (spec 15: a replayable bug). */
export class PropertyFailure extends Error {
  readonly invariant: number;
  readonly report: FailureReport;
  constructor(invariant: number, detail: string, report: FailureReport) {
    super(`invariant ${invariant} failed: ${detail} (seed ${report.seed}, after ${report.actions.length} actions)`);
    this.name = 'PropertyFailure';
    this.invariant = invariant;
    this.report = report;
  }
}

const NO_REPORT: FailureReport = { seed: -1, actions: [] };

/**
 * Invariants on one state: 1 board/terrain, 2 connectivity (not mid-Rot), 3 roots,
 * 4 strengths, 5 card conservation, 9 turn cap. `melded` holds every card id played
 * in a meld so far.
 */
export const checkState = (
  s: State,
  melded: ReadonlySet<number>,
  report: FailureReport = NO_REPORT,
  maxTurns: number = MAX_TURNS.greedy,
): void => {
  const fail = (n: number, msg: string): never => {
    throw new PropertyFailure(n, msg, report);
  };
  const R = s.config.boardRadius;
  const onBoard = new Set(allCoords(R).map(coordKey));

  // 1. No tile on rock or off-board.
  for (const [key, tile] of Object.entries(s.board)) {
    if (!onBoard.has(key)) fail(1, `board key ${key} is off-board`);
    if (tile && s.terrain[key] === 'rock') fail(1, `tile on rock at ${key}`);
  }

  // 3. Roots in place and never overgrown or removed.
  for (const p of [0, 1] as const) {
    const key = coordKey(rootCoord(p, s.config.rootStyle, R));
    const t = s.board[key];
    if (!t || !t.root || t.owner !== p || t.strength !== 0) fail(3, `root of player ${p} missing or changed at ${key}`);
  }
  const roots = Object.values(s.board).filter((t) => t?.root).length;
  if (roots !== 2) fail(3, `${roots} root tiles on the board`);

  // 4. Strengths 1-9.
  for (const [key, t] of Object.entries(s.board)) {
    if (t && !t.root && (!Number.isInteger(t.strength) || t.strength < 1 || t.strength > 9)) fail(4, `strength ${t.strength} at ${key}`);
  }

  // 2. Every non-root tile connected to its root (Sever waits until all Rot picks are done).
  if (s.phase !== 'ROT_PICK') {
    for (const p of [0, 1] as const) {
      const linked = connectedKeys(s.board, s.config, p);
      for (const [key, t] of Object.entries(s.board)) if (t?.owner === p && !linked.has(key)) fail(2, `player ${p} tile at ${key} is cut off`);
    }
  }

  // 5. Every card exactly once: in a hand, the deck, the discard pile, or melded.
  const seen = new Set<number>();
  for (const c of [...s.hands[0], ...s.hands[1], ...s.deck, ...s.discard]) {
    if (seen.has(c.id)) fail(5, `card ${c.id} is in two places`);
    if (melded.has(c.id)) fail(5, `melded card ${c.id} came back`);
    seen.add(c.id);
  }
  for (const c of createCards(s.config)) if (!seen.has(c.id) && !melded.has(c.id)) fail(5, `card ${c.id} vanished`);

  // 9. Development safety cap.
  if (s.turnNumber > maxTurns) fail(9, `turn ${s.turnNumber} > ${maxTurns}`);
};

const withoutHistory = (s: State): string => JSON.stringify({ ...s, history: s.history?.length ?? null });

/**
 * One bot-vs-bot game (RandomBot by default, or GreedyBot) with every section 15 invariant checked after every
 * action: 1-5 and 9 on each state, 6 apply never mutates its input, 7 a finished game
 * accepts nothing, 8 every listed legal action is accepted by apply.
 */
export const runPropertyGame = (
  seed: number,
  config: Partial<RulesConfig> = {},
  opts: { checks?: boolean; maxActions?: number; bot?: PropertyBot } = {},
): { state: State; actions: Action[] } => {
  const checks = opts.checks ?? true;
  const kind = opts.bot ?? 'random';
  const maxTurns = MAX_TURNS[kind];
  const bots = kind === 'random' ? [createRandomBot(seed * 2 + 1), createRandomBot(seed * 2 + 2)] : [GreedyBot, GreedyBot];
  const actions: Action[] = [];
  const melded = new Set<number>();
  let s = newGame(seed, config);
  const report = (extra: Partial<FailureReport> = {}): FailureReport => ({ seed, config, actions: [...actions], ...extra });
  if (checks) checkState(s, melded, report(), maxTurns);

  for (let i = 0; i < (opts.maxActions ?? 20_000) && s.phase !== 'GAME_OVER'; i++) {
    const legal = legalActionsForState(s);
    if (checks) {
      // 8. Everything legalActions lists, apply accepts.
      for (const a of legal) {
        try {
          apply(s, a);
        } catch (e) {
          throw new PropertyFailure(8, `listed action rejected: ${(e as Error).message}`, report({ failingAction: a, before: s }));
        }
      }
    }
    const a = bots[s.actor]!.chooseAction(viewFor(s, s.actor));
    const snapshot = checks ? withoutHistory(s) : '';
    const before = s;
    s = apply(s, a);
    actions.push(a);
    if (a.t === 'MeldRun' || a.t === 'MeldSet') for (const id of a.cards) melded.add(id);
    if (checks) {
      // 6. apply never mutates its input.
      if (withoutHistory(before) !== snapshot) throw new PropertyFailure(6, 'apply mutated its input', report({ failingAction: a, before }));
      checkState(s, melded, report({ failingAction: a, before, after: s }), maxTurns);
    }
  }
  if (s.phase !== 'GAME_OVER') throw new PropertyFailure(9, 'game did not finish', report({ after: s }));
  if (checks) {
    // 7. A finished game accepts no actions.
    for (const a of [{ t: 'Draw', from: 'deck' }, { t: 'EndAct' }, { t: 'Continue' }] as Action[]) {
      try {
        apply(s, a);
        throw new PropertyFailure(7, `finished game accepted ${a.t}`, report({ failingAction: a, after: s }));
      } catch (e) {
        if (e instanceof PropertyFailure) throw e;
        if (!(e instanceof IllegalActionError) || e.code !== 'GAME_OVER') throw new PropertyFailure(7, `wrong error ${String(e)}`, report());
      }
    }
  }
  return { state: s, actions };
};
