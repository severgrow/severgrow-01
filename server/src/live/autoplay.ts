// Live duels — the timed-out turn, played by the server through the engine only.
//
// The rule: Draw from the deck if not drawn yet (the throw pile only when the deck is empty), skip
// Grow, throw the drawn card. Every choice is picked FROM `legalActions(view)` of the timed-out
// player's OWN view, so the auto-play can never make an illegal move and never looks at the
// opponent's hand or the deck order (it is never given them: the chooser only receives a View).
import { applyAs, eventsOf, legalActions, viewFor } from '../../../src/engine/index.js';
import type { Action, Event, Player, State, View } from '../../../src/engine/index.js';
import { fromEngineResult } from '../protocol.js';
import { actorChanged, turnBoundaryAdvanced } from '../turn-boundary.js';
import type { Decision } from '../storage/types.js';

/** Max actions the auto-play may take in one turn (a turn is at most Draw, EndAct, Throw, plus slack). */
export const AUTOPLAY_MAX_STEPS = 8;

/**
 * Pick the next auto-play action from the player's own view. `drawnCardId` is the card this player
 * drew this turn (known to them), or null. Returns null when nothing is legal.
 */
export const nextAutoAction = (view: View, drawnCardId: number | null): Action | null => {
  const legal = legalActions(view);
  if (legal.length === 0) return null;
  switch (view.phase) {
    case 'DRAW':
      return legal.find((a) => a.t === 'Draw' && a.from === 'deck') ?? legal.find((a) => a.t === 'Draw') ?? legal[0]!;
    case 'ACT':
      return legal.find((a) => a.t === 'EndAct') ?? legal[0]!;
    case 'DISCARD': {
      const drawn = drawnCardId === null ? undefined : legal.find((a) => a.t === 'Discard' && a.card === drawnCardId);
      if (drawn) return drawn;
      // Identical copies are listed once (lowest id): throwing that copy is throwing "the drawn card".
      const card = view.hand.find((c) => c.id === drawnCardId);
      const twin = card
        ? legal.find((a) => a.t === 'Discard' && view.hand.some((h) => h.id === a.card && h.suit === card.suit && h.rank === card.rank))
        : undefined;
      if (twin) return twin;
      // The drawn card cannot be thrown (or is unknown): the lowest-id legal throw, deterministically.
      const throws = legal.filter((a): a is Extract<Action, { t: 'Discard' }> => a.t === 'Discard');
      throws.sort((a, b) => a.card - b.card);
      return throws[0] ?? legal[0]!;
    }
    case 'KNOCK':
      return legal.find((a) => a.t === 'Continue') ?? legal[0]!;
    default:
      return legal[0]!;
  }
};

/** The card `seat` drew in the turn that began at `turnStartRevision`, from that turn's raw events. */
export const drawnCardFrom = (events: readonly Event[], seat: Player): number | null => {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.t === 'Draw' && e.player === seat && typeof e.card === 'number') return e.card;
  }
  return null;
};

/**
 * The whole auto-played remainder of `seat`'s turn from `state`. Stops when the turn passes, the
 * game ends, or nothing is legal. Pure and deterministic.
 */
export const autoPlayTurn = (state: State, seat: Player, drawnCardId: number | null): Action[] => {
  const out: Action[] = [];
  let current = state;
  let drawn = drawnCardId;
  const startTurn = state.turnNumber;
  for (let i = 0; i < AUTOPLAY_MAX_STEPS; i++) {
    if (current.phase === 'GAME_OVER' || current.actor !== seat || current.turnNumber !== startTurn) break;
    const view = viewFor(current, seat);
    const action = nextAutoAction(view, drawn);
    if (!action) break;
    const after = applyAs(current, seat, action);
    if (action.t === 'Draw') drawn = drawnCardFrom(eventsOf(current, action, after), seat);
    out.push(action);
    current = after;
  }
  return out;
};

const withoutHistory = (state: State): State => {
  if (state.history === undefined) return state;
  const { history: _discarded, ...rest } = state;
  return rest;
};

/** The same commit decision the match service makes for a player's action (rules via the engine). */
export const autoDecision = (state: State, seat: Player, action: Action): Decision => {
  let after: State;
  try {
    after = applyAs(state, seat, action);
  } catch {
    return { kind: 'reject', code: 'ILLEGAL_ACTION', reason: 'Auto-play could not apply the move.' };
  }
  const next = withoutHistory(after);
  const finished = next.phase === 'GAME_OVER';
  return {
    kind: 'apply',
    nextState: next,
    events: eventsOf(state, action, after),
    action,
    status: finished ? 'finished' : 'active',
    result: finished && next.result ? fromEngineResult(next.result) : null,
    refreshDeadline: actorChanged(state, next),
    advanceTurnBoundary: turnBoundaryAdvanced(state, next),
  };
};
