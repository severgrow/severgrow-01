// Phase 5 — OnlineSession: Draw commits, mid-turn draft + Undo, Throw batches; display via perspective.
import { viewFor } from '../../../src/engine/index.js';
import type { Action, Event, Player, State, View } from '../../../src/engine/index.js';
import type { MatchViewPayload } from '../../../server/src/protocol.js';
import { buildSteps } from '../logic/anim.js';
import type { Step } from '../logic/anim.js';
import type { Played } from '../logic/session.js';
import { breakdownPart } from '../logic/endgame.js';
import { gameHighlights } from '../logic/highlights.js';
import { moveSummary, resultReason, resultTitle } from '../logic/log.js';
import type { Highlight } from '../logic/highlights.js';
import { ONLINE, RESULT } from '../../../src/strings.js';
import type { OnlineDriver } from './driver.js';
import { boardSignature, buildOpponentTurnReplay, openingBoard } from './opponent-turn-replay.js';
import type { OpponentTurnReplay, ReplayReason } from './opponent-turn-replay.js';
import { shadowFromView } from './shadow.js';
import { stepContextFor, stepsFromEvents, syncStep } from './steps-from-events.js';

export type OnlinePlayResult =
  | { ok: true; played: Played | null; catchUp: Step[]; finished: boolean }
  | { ok: false; message: string };

/** The opponent's last completed turn, plus the scores its starting board had. */
export type OnlineTurnReplay = OpponentTurnReplay & { scores: [number, number] };

/** Why the Replay control is (not) offered: `pending` = not answered yet for this board. */
export type TurnReplayReason = 'ok' | 'no-turn' | 'unverified' | 'pending';

type TurnReplayResult =
  | { ok: true; replay: OnlineTurnReplay }
  | { ok: false; reason: ReplayReason | 'pending' };

/**
 * Everything the finish screen shows. Deliberately the SAME shape and the same sentences offline
 * uses (`resultTitle` / `resultReason`), so the two screens cannot drift apart again.
 */
export type FinishInfo = {
  title: string;
  reason: string;
  /** The small context line under the title — never a repeat of the reason. */
  sub: string;
  scores: [number, number];
  breakdown: string;
  /** Already mapped to display seats (0 = me), ready for the shared highlight list. */
  highlights: Highlight[];
  moves: string | null;
};

/**
 * Keeps a display Session-like surface (viewer always 0 / moss) in sync with OnlineDriver.
 * UI taps use display coords; server always receives engine coords.
 *
 * Selection is NOT owned here. The page drives the shared offline `Session` (logic/session.ts)
 * for taps, drag and preview, so online and offline run one interaction code path. This class only
 * tracks the committed turn/draft and the replay gate.
 */
export class OnlineSession {
  readonly kind = 'online' as const;
  /** Display-space state (Me = seat mapped to player 0). */
  state: State;
  readonly log: Action[] = [];
  readonly base: State | null = null;
  /**
   * The match's whole public event history, fetched once for the finish screen's highlights.
   * Empty until `loadHistory()` resolves; the server keeps it, so one plain view fetches it all.
   */
  private historyEvents: readonly Event[] = [];
  historyLoaded = false;
  historyLoading = false;
  private lastCatchUp: Step[] = [];
  /**
   * True from the moment a catch-up replay (the opponent's finished turn) is handed to the page
   * until that replay has finished draining. While set, NOTHING may be played and no action is
   * offered: the player must see the true board before they can act.
   */
  private revealing = false;
  /**
   * True while `consumeCatchUp` is BUILDING the steps, and it exists because of a re-entrancy:
   * `driver.skipCatchUp()` emits, and that emit runs a full `onChange` + `render` inside
   * `consumeCatchUp` — before the caller has the steps in its queue. A gate that only reads the
   * queue therefore saw an empty board at the exact moment the deciding move was arriving, which
   * is how the loser's "you lost" plate could go up over a move it never showed (owner report,
   * 2026-10-25). The finish screen holds while this is true.
   */
  private preparing = false;
  /**
   * True when the replay now in flight is the LIVE enemy turn this device was waiting for, false
   * for a catch-up after being away. Only the live reveal gets the full, readable pace; an away
   * catch-up keeps its 2x (and its Skip).
   */
  private revealLive = false;
  /**
   * The last verified answer to "can this seat replay the opponent's last turn?", cached per
   * match + server revision + board. Never fetched from a render: `prepareOpponentTurnReplay()`
   * does the one read, the page only reads the getters below.
   */
  private replayCheck: { key: string; result: TurnReplayResult } | null = null;
  /** The key of a check that is in flight (so a burst of renders cannot start a second fetch). */
  private replayChecking: string | null = null;

  constructor(readonly driver: OnlineDriver) {
    this.state = this.buildDisplayState();
  }

  get viewer(): Player {
    return 0;
  }

  get seat(): Player {
    return this.driver.snapshot().seat;
  }

  get view(): View {
    return viewFor(this.state, 0);
  }

  /**
   * True while nothing may be played: an enemy turn has been detected and is waiting to be
   * animated, or its replay is still draining. `pendingEvents` is included so the gate is shut the
   * instant the completed turn lands — not one render later.
   */
  private get boardBlocked(): boolean {
    // A finished match is never gated: once the server says the duel is over, the reveal gate
    // stops mattering (nothing can be played, and the end screen must not wait on an animation).
    if (this.finished) return false;
    return this.revealing || this.driver.pendingEvents().length > 0;
  }

  get legal(): Action[] {
    if (this.boardBlocked) return []; // never act on a board that is still replaying
    const snap = this.driver.snapshot();
    if (snap.view.actor !== snap.seat || snap.status !== 'active') return [];
    // Legal in engine space → map to display (screen) coords for the UI.
    return snap.legal.map((a) => this.driver.perspective().mapActionToScreen(a));
  }

  get canUndo(): boolean {
    return !this.boardBlocked && this.driver.draft().canUndo();
  }

  /** True while the opponent's finished turn is still replaying; input is closed. */
  get isRevealing(): boolean {
    return this.boardBlocked;
  }

  /** True while a catch-up's steps are being built (see the field's note: a render runs inside). */
  get isPreparingCatchUp(): boolean {
    return this.preparing;
  }

  /** True when the reveal now in flight is the live enemy turn (not a catch-up after being away). */
  get revealIsLive(): boolean {
    return this.revealLive;
  }

  /** Called by the page the moment a catch-up replay drains (or is skipped). */
  endReveal(): void {
    this.revealing = false;
    this.revealLive = false;
  }

  get myTurn(): boolean {
    if (this.boardBlocked) return false;
    const snap = this.driver.snapshot();
    return snap.status === 'active' && snap.view.actor === snap.seat && snap.view.phase !== 'GAME_OVER';
  }

  get finished(): boolean {
    const snap = this.driver.snapshot();
    // The SERVER's phase, not `snap.view` (which is the local draft's shadow mid-turn): a Grow that
    // ends the game is only a draft until the Throw commits it, and treating that as a finished
    // match is what left the opponent waiting for the deadline.
    return snap.status === 'finished' || snap.serverPhase === 'GAME_OVER';
  }

  /** Sync the display board/hand from the driver (after a server view or a draft change). */
  refresh() {
    this.state = this.buildDisplayState();
  }

  /** Take catch-up steps since last consume (opponent / own committed turn). */
  consumeCatchUp(): Step[] {
    const events = [...this.driver.pendingEvents()];
    // The re-entrant call made by `skipCatchUp`'s own emit lands here with an empty buffer. It must
    // NOT touch `preparing`: it is the outer call that is still building the steps.
    if (!events.length) return [];
    // Close the gates BEFORE anything else. `skipCatchUp()` fires `emit()`, which runs a full
    // render inside this very call: if the flags were set after it, that render would see an open
    // input gate (the enemy board already swapped in) AND an empty step queue (the finish plate
    // over the deciding move). Both are the exact window the owner reported.
    this.revealing = true;
    this.revealLive = this.driver.pendingOrigin() === 'live';
    this.preparing = true;
    this.driver.skipCatchUp();
    let steps: Step[];
    try {
      steps = stepsFromEvents(events, this.driver.perspective(), this.view);
      const v = this.view;
      steps.push(syncStep(this.state.board, [v.score, v.opponentScore]));
    } catch (error) {
      // The gate is already shut, so a replay that cannot be built would freeze the player on
      // "Opponent's turn" forever (the sync engine swallows this throw as a fetch error). Reopen
      // it here — the caller still reports the failure — so a broken step is a glitch, not a lock.
      this.revealing = false;
      this.revealLive = false;
      this.preparing = false;
      this.lastCatchUp = [];
      throw error;
    }
    this.preparing = false;
    this.lastCatchUp = steps;
    // The page replays these through the shared AnimQueue; until it drains, input stays shut.
    return steps;
  }

  peekCatchUp(): Step[] {
    return this.lastCatchUp;
  }

  // ---------- replaying the opponent's last turn -------------------------------------------
  //
  // The offline game replays the bot's turn from `Session.turns`. Online that record does not
  // exist (this class keeps only its OWN actions), so the turn is rebuilt from the match's public
  // event history — and offered ONLY when the rebuild is proven against the live board. See
  // `opponent-turn-replay.ts` for the grouping rule and the self-check.

  /** The opponent's last completed turn, if a verified reconstruction of it is cached. */
  get opponentTurnReplay(): OnlineTurnReplay | null {
    const hit = this.replayCheck;
    if (!hit || hit.key !== this.replayKey()) return null; // the board or the revision moved on
    return hit.result.ok ? hit.result.replay : null;
  }

  /**
   * Why the control is (not) offered — an honest tooltip needs to tell "they have not moved yet"
   * apart from "the board could not be verified".
   */
  get turnReplayReason(): TurnReplayReason {
    const hit = this.replayCheck;
    if (!hit || hit.key !== this.replayKey()) return 'pending';
    return hit.result.ok ? 'ok' : hit.result.reason;
  }

  /**
   * True when the opponent's last turn can be replayed right now: a verified reconstruction exists,
   * nothing is moving, and it is MY turn — the same two conditions the offline control has
   * (`Session.canReplayOpponent`: `actor === viewer`, and no replay in flight). Offering it while
   * they are moving would put a replay next to their live turn.
   */
  get canReplayOpponentTurn(): boolean {
    if (this.boardBlocked || this.finished) return false;
    const snap = this.driver.snapshot();
    if (snap.view.actor !== snap.seat) return false;
    return this.opponentTurnReplay !== null;
  }

  /**
   * Answer the replay question for the current match state, at most once per match + revision +
   * board. Deliberately NOT called from a render path: the page calls it where a snapshot lands,
   * so a render burst can never turn into a fetch burst.
   */
  async prepareOpponentTurnReplay(): Promise<void> {
    const key = this.replayKey();
    if (this.replayCheck?.key === key || this.replayChecking === key) return;
    this.replayChecking = key;
    let result: TurnReplayResult;
    try {
      const events = await this.historySnapshot();
      result = this.replayKey() === key ? this.buildOpponentTurn(events) : { ok: false, reason: 'pending' };
    } catch {
      // A refused or failed read is not an error the player must see: the control simply stays off.
      result = { ok: false, reason: 'unverified' };
    } finally {
      this.replayChecking = null;
    }
    if (result.ok || result.reason !== 'pending') this.replayCheck = { key, result };
  }

  /** One fetch keyed on everything the answer depends on (match, revision, the board on screen). */
  private replayKey(): string {
    const snap = this.driver.snapshot();
    return `${snap.matchId}|${snap.revision}|${boardSignature(this.state.board)}`;
  }

  private buildOpponentTurn(events: readonly Event[]): TurnReplayResult {
    const snap = this.driver.snapshot();
    if (this.finished) return { ok: false, reason: 'no-turn' };
    const p = this.driver.perspective();
    const built = buildOpponentTurnReplay({
      events,
      opponent: (1 - snap.seat) as Player,
      live: { actor: snap.view.actor, finished: this.finished },
      perspective: p,
      // The match's true opening board (homes and all), already in display space: `this.state` is
      // the display state, so its config carries the display homes. The seed is not available
      // online and is not needed — see `openingBoard`.
      startBoard: openingBoard(this.state.config),
      liveBoard: this.state.board,
      context: stepContextFor(this.view),
    });
    if (!built.ok) return built;
    // The scores the turn started on, read off that board (never invented).
    const at = viewFor({ ...this.state, board: built.replay.startBoard }, 0);
    return { ok: true, replay: { ...built.replay, scores: [at.score, at.opponentScore] } };
  }

  /** Play a UI action (display coords). Draw/Throw are async; mid-turn Grow is local draft. */
  async play(action: Action): Promise<OnlinePlayResult> {
    if (this.revealing) {
      return { ok: false, message: ONLINE.statusRevealWait };
    }
    const engine = this.driver.toEngineAction(action);
    if (engine.t === 'Draw') {
      const before = this.buildEngineShadow();
      const res = await this.driver.draw(engine);
      if (!res.ok) return { ok: false, message: res.message ?? ONLINE.errDrawFailed };
      this.refresh();
      const after = this.buildEngineShadow();
      const played: Played = {
        before: this.driver.perspective().toDisplayState(before),
        action,
        after: this.state,
        steps: buildSteps(before, engine, after, this.seat).map((s) => mapStepDisplay(s, this.driver)),
      };
      this.log.push(engine);
      return { ok: true, played, catchUp: this.consumeCatchUp(), finished: this.finished };
    }

    if (engine.t === 'EndAct' || engine.t === 'Discard') {
      // EndAct leaves the ACT step; the Discard (when a card is left) finishes the turn.
      // Both commit a batch to the server, so the turn boundary is real.
      const res = await this.driver.throwTurn(engine);
      if (!res.ok) {
        this.refresh();
        return { ok: false, message: res.message ?? ONLINE.errTurnFailed };
      }
      this.refresh();
      this.log.push(engine);
      const catchUp = this.consumeCatchUp();
      return { ok: true, played: null, catchUp, finished: this.finished };
    }

    // Mid-turn draft (Grow / Bloom / Bomb / Blast / …)
    const beforeDisp = this.cloneState(this.state);
    const beforeEng = this.buildEngineShadow();
    if (!this.driver.draftPlay(engine)) {
      return { ok: false, message: ONLINE.errMoveIllegal };
    }
    this.driver.draft().persist();
    const afterEng = this.driver.draft().shadow() ?? beforeEng;
    this.state = this.driver.perspective().toDisplayState(afterEng);
    this.log.push(engine);
    const played: Played = {
      before: beforeDisp,
      action,
      after: this.state,
      steps: buildSteps(beforeEng, engine, afterEng, this.seat).map((s) => mapStepDisplay(s, this.driver)),
    };
    // A Grow can END the game: a Bloom, Blast or Sprout that strangles the opponent's root (or
    // strangles both). The move is only a LOCAL DRAFT at this point, so the match on the server
    // stays active — the opponent waits for the deadline and the page cannot even offer the Throw
    // any more, because its own display state is already GAME_OVER. Send the batch now.
    //
    // The server already expects exactly this: `runCommit` applies the move that ended the game and
    // drops the rest of the turn, so `[winningMove, EndAct]` commits the win and finishes the match
    // for BOTH devices. (That server rule was added for this case; the client half was missing.)
    if (afterEng.phase === 'GAME_OVER') {
      const res = await this.driver.throwTurn({ t: 'EndAct' });
      if (!res.ok) {
        // Nothing was committed. The driver has already dropped a draft it could not send and
        // re-applied the server's view, so the board is back on the truth and the player can retry.
        this.refresh();
        return { ok: false, message: res.message ?? ONLINE.errTurnFailed };
      }
      this.refresh();
      return { ok: true, played, catchUp: this.consumeCatchUp(), finished: this.finished };
    }
    return { ok: true, played, catchUp: [], finished: false };
  }

  undo(): boolean {
    // Undo is an input like any other: it stays shut until the enemy turn has been shown.
    if (this.boardBlocked) return false;
    if (!this.driver.draftUndo()) return false;
    this.driver.draft().persist();
    this.refresh();
    if (this.log.length) this.log.pop();
    return true;
  }

  async resign(): Promise<OnlinePlayResult> {
    const res = await this.driver.resign();
    if (!res.ok) return { ok: false, message: res.message ?? ONLINE.errResignFailed };
    this.refresh();
    return { ok: true, played: null, catchUp: this.consumeCatchUp(), finished: true };
  }

  /**
   * One fetch of the match's whole public event history (the server keeps every move). Used by the
   * finish screen (highlights) and by the opponent-turn replay. Never replays or mutates the live
   * view.
   */
  async loadHistory(): Promise<void> {
    if (this.historyLoaded) return;
    try {
      await this.historySnapshot();
    } catch {
      // Offline / refused: leave the history empty; the screen hides the highlights rather than
      // showing blank rows.
      this.historyLoaded = true;
    }
  }

  /** The one full public-history read. Both callers share it, so a match is never fetched twice. */
  private async historySnapshot(): Promise<readonly Event[]> {
    this.historyEvents = await this.driver.history();
    this.historyLoaded = true;
    return this.historyEvents;
  }

  /** Payload for the finished screen — the same sentences and information as offline. */
  finishInfo(): FinishInfo | null {
    const snap = this.driver.snapshot();
    if (!this.finished) return null;
    const scores: [number, number] = [snap.view.score, snap.view.opponentScore];
    const sub = snap.opponentName ? ONLINE.finishSubOpponent(snap.opponentName) : ONLINE.finishSubFallback;
    const breakdown = RESULT.breakdown(breakdownPart(this.state, 0), breakdownPart(this.state, 1));
    const r = snap.result;
    if (!r) return { title: ONLINE.finishedFallback, reason: '', sub, scores, breakdown, highlights: [], moves: null };
    const history = this.historyEvents;
    const highlights = gameHighlights(history, snap.seat).map((h) => ({
      ...h,
      by: h.by === null ? null : ((h.by === snap.seat ? 0 : 1) as Player),
    }));
    return {
      title: resultTitle(r, snap.seat),
      reason: resultReason(r, snap.seat),
      sub,
      scores,
      breakdown,
      highlights,
      moves: moveSummary(history, snap.seat),
    };
  }

  private buildEngineShadow(): State {
    const snap = this.driver.snapshot();
    return this.driver.draft().shadow() ?? shadowFromView(snap.view);
  }

  private buildDisplayState(): State {
    return this.driver.perspective().toDisplayState(this.buildEngineShadow());
  }

  private cloneState(s: State): State {
    return JSON.parse(JSON.stringify(s)) as State;
  }
}

const mapStepDisplay = (step: Step, driver: OnlineDriver): Step => {
  const p = driver.perspective();
  if (!p.rotated) {
    // Still remap player ids to display (me→0) when seat is 0 this is identity.
    return step;
  }
  // buildSteps used engine viewer=seat; keys are engine. Map keys + players to display.
  const mk = (key: string) => p.mapKey(key);
  const mp = (player: Player) => p.displayOwner(player);
  switch (step.k) {
    case 'draw':
      return { ...step, player: mp(step.player) };
    case 'grow':
      return {
        ...step,
        player: mp(step.player),
        tiles: step.tiles.map((t) => ({ ...t, key: mk(t.key) })),
      };
    case 'strengthen':
      return { ...step, player: mp(step.player), key: mk(step.key) };
    case 'fruit':
      return { ...step, player: mp(step.player), target: mk(step.target) };
    case 'megaBomb':
      return {
        ...step,
        player: mp(step.player),
        target: mk(step.target),
        destroyed: step.destroyed.map(mk),
      };
    case 'sever':
      return {
        ...step,
        player: mp(step.player),
        by: mp(step.by),
        keys: step.keys.map(mk),
        origin: mk(step.origin),
      };
    case 'remove':
      return { ...step, keys: step.keys.map(mk) };
    case 'discard':
      return { ...step, player: mp(step.player) };
    case 'strangle':
      return { ...step, loser: mp(step.loser) };
    case 'turn':
      return { ...step, player: mp(step.player) };
    case 'sync':
      return {
        ...step,
        board: Object.fromEntries(
          Object.entries(step.board).map(([k, t]) => [
            mk(k),
            t ? { ...t, owner: mp(t.owner) } : null,
          ]),
        ),
        scores: [step.scores[p.me], step.scores[p.opp]] as [number, number],
      };
    case 'end':
      return step;
    default:
      return step;
  }
};

/** Re-bind OnlineSession after a fresh MatchViewPayload (create/join). */
export const onlineSessionFromPayload = (
  driver: OnlineDriver,
  _payload: MatchViewPayload,
): OnlineSession => new OnlineSession(driver);

/** Events still waiting → Steps for AnimQueue (2× catch-up). */
export const catchUpStepsFromDriver = (driver: OnlineDriver): Step[] => {
  const events: readonly Event[] = driver.pendingEvents();
  return stepsFromEvents(events, driver.perspective(), driver.snapshot().screenView);
};
