// The opponent's last completed turn, rebuilt from the match's PUBLIC event history.
//
// Why a rebuild is needed at all: an online duel's `OnlineSession.log` records only THIS seat's own
// actions, and `Session.turns` is only filled by the local player's own `Session.play`, so
// `Session.lastTurnOf(OPPONENT)` has nothing to hand back online — which is why the Replay control
// used to be hard-disabled there (owner report, 2026-10-26: "the replay last round button was
// disabled all the time, so i wasnt able to rewatch opponents last turn"). The server, however,
// keeps EVERY public event (`OnlineSession.loadHistory()`), and the display pipeline already knows
// how to turn those events into `Step`s (`steps-from-events.ts`) and how to fold a `Step` onto a
// board (`applyStep` in `logic/anim.ts`, a pure fold).
//
// The one thing that must never happen is offering a turn we cannot PROVE. So the fold is always
// continued through the REST of the history and the final board must equal the live board exactly
// (keys, owner, strength, root). A wrong reconstruction therefore cannot ship: it simply refuses and
// the control stays disabled.
import type { Event, Player } from '../../../src/engine/index.js';
import { applyStep } from '../logic/anim.js';
import type { Board, Step } from '../logic/anim.js';
import { stepsFromEvent } from './steps-from-events.js';
import type { StepContext } from './steps-from-events.js';
import type { Perspective } from './perspective.js';

/** One seat's turn: a CONSECUTIVE run of the events its mover caused. */
export type TurnGroup = { player: Player; events: Event[] };

/** What the live match says about the turn in progress (engine coords, from the server view). */
export type LiveTurn = { actor: Player; finished: boolean };

/**
 * The TRUE opening board, built from the rules config alone.
 *
 * A live online payload never carries the seed (protocol.ts), so a client cannot re-deal the match
 * — and does not need to: the opening board is nothing but the two roots on an empty board, and the
 * engine's own `openingBoard` is the one definition of it. Pass the DISPLAY config (the `State` the
 * page paints from) to get a display-space board.
 */
export { openingBoard } from '../../../src/engine/index.js';

/** Why the control is (not) offered. `unverified` is never a guess: the fold disagreed. */
export type ReplayReason = 'no-turn' | 'unverified';

/**
 * The player an event belongs to as its MOVER, or null when it is aftermath that must never split
 * a turn.
 *
 * This is not simply `event.player`:
 * - `Sever` names the player whose tiles were CUT (`sever()` lists the mover's opponent first), so
 *   a mover's own turn regularly carries a Sever attributed to the opponent. Splitting on it would
 *   invent an "opponent turn" in the middle of the mover's turn.
 * - `Strangle` names the player who was surrounded (the loser), not the mover.
 * - `FinalTurnStart` names the seat whose final turn is starting — the NEXT seat.
 * - `GameEnd` carries no player at all.
 * `RotPick` is committed by the actor, so it does belong to the mover.
 */
const moverOf = (e: Event): Player | null => {
  switch (e.t) {
    case 'Sever':
    case 'Strangle':
    case 'GameEnd':
    case 'FinalTurnStart':
      return null;
    case 'RotPick':
      return e.picker;
    default:
      return e.player;
  }
};

/** Group the public history into turns: consecutive runs of one mover. */
export const groupTurns = (events: readonly Event[]): TurnGroup[] => {
  const groups: TurnGroup[] = [];
  for (const e of events) {
    const mover = moverOf(e);
    if (mover === null) {
      // Aftermath attaches to the turn that caused it (and never starts a turn of its own).
      const last = groups[groups.length - 1];
      if (last) last.events.push(e);
      continue;
    }
    const last = groups[groups.length - 1];
    if (last && last.player === mover) last.events.push(e);
    else groups.push({ player: mover, events: [e] });
  }
  return groups;
};

/**
 * The index of the opponent's last COMPLETED turn, or null.
 *
 * A group is complete when a later group exists (the mover changed) or — the case that matters
 * right after they finish — when the live actor is no longer them. While it is still their turn
 * their group is OPEN (their mid-turn moves are drafts on their own device and are not in the
 * public history yet), so it is never offered.
 */
export const pickOpponentTurn = (
  groups: readonly TurnGroup[],
  opponent: Player,
  live: LiveTurn,
): number | null => {
  if (live.finished) return null; // the finish screen owns the full-match replay
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i]!;
    if (group.player !== opponent) continue;
    const open = i === groups.length - 1 && live.actor === opponent;
    if (open) return null;
    return i;
  }
  return null;
};

/** Order-independent board equality: same keys, same owner / strength / root. */
export const sameBoard = (a: Board, b: Board): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const x = a[key] ?? null;
    const y = b[key] ?? null;
    if (x === null || y === null) {
      if (x !== y) return false;
      continue;
    }
    if (x.owner !== y.owner || x.strength !== y.strength || !!x.root !== !!y.root) return false;
  }
  return true;
};

/** A cheap identity for a board, so a cached offer dies the moment the board moves. */
export const boardSignature = (board: Board): string =>
  Object.entries(board)
    .filter(([, t]) => !!t)
    .map(([k, t]) => `${k}:${t!.owner}:${t!.strength}:${t!.root ? 1 : 0}`)
    .sort()
    .join(',');

/** The opponent's last completed turn, ready to play: the board it started on plus its steps. */
export type OpponentTurnReplay = {
  opponent: Player;
  /** Index of the chosen group in `groupTurns(events)`, for diagnostics. */
  groupIndex: number;
  /** Display-space board the turn started on (homes included). */
  startBoard: Board;
  /** Display-space steps of that turn only (no closing sync — the page appends the live one). */
  steps: Step[];
};

export type ReplayBuild =
  | { ok: true; replay: OpponentTurnReplay }
  | { ok: false; reason: ReplayReason };

/**
 * Rebuild the opponent's last completed turn, or refuse.
 *
 * `startBoard` must be the TRUE opening board (homes and all) in DISPLAY space and `liveBoard` the
 * board currently on the screen, also display space. Everything is folded with the display
 * perspective, so the steps can go straight into the shared `AnimQueue`.
 */
export const buildOpponentTurnReplay = (input: {
  events: readonly Event[];
  opponent: Player;
  live: LiveTurn;
  perspective: Perspective;
  startBoard: Board;
  liveBoard: Board;
  context: StepContext;
}): ReplayBuild => {
  const groups = groupTurns(input.events);
  const index = pickOpponentTurn(groups, input.opponent, input.live);
  if (index === null) return { ok: false, reason: 'no-turn' };

  const fold = (from: number, to: number, board: Board): Board => {
    let next = board;
    for (let i = from; i < to; i++) {
      for (const e of groups[i]!.events) {
        for (const s of stepsFromEvent(e, input.perspective, input.context)) next = applyStep(next, s);
      }
    }
    return next;
  };

  const startBoard = fold(0, index, input.startBoard);
  // MANDATORY self-check: the rest of the history must land on the board that is actually live.
  // If it does not, the reconstruction is wrong (a card id we cannot resolve, a gap in the history,
  // an un-committed draft of ours) and the turn must not be offered.
  if (!sameBoard(fold(index, groups.length, startBoard), input.liveBoard)) {
    return { ok: false, reason: 'unverified' };
  }
  const steps = groups[index]!.events.flatMap((e) => stepsFromEvent(e, input.perspective, input.context));
  if (!steps.length) return { ok: false, reason: 'no-turn' };
  return { ok: true, replay: { opponent: input.opponent, groupIndex: index, startBoard, steps } };
};
