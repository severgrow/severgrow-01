// Phase 5 — OnlineSession: Draw commits, mid-turn draft + Undo, Throw batches; display via perspective.
import { viewFor } from '../../../src/engine/index.js';
import type { Action, Event, Player, State, View } from '../../../src/engine/index.js';
import type { MatchViewPayload } from '../../../server/src/protocol.js';
import { buildSteps } from '../logic/anim.js';
import type { Step } from '../logic/anim.js';
import { EMPTY_SEL, pendingAction, tapCard, tapHex, tapKind } from '../logic/interaction.js';
import type { Sel } from '../logic/interaction.js';
import type { Played } from '../logic/session.js';
import type { OnlineDriver } from './driver.js';
import { shadowFromView } from './shadow.js';
import { stepsFromEvents, syncStep } from './steps-from-events.js';

export type OnlinePlayResult =
  | { ok: true; played: Played | null; catchUp: Step[]; finished: boolean }
  | { ok: false; message: string };

/**
 * Keeps a display Session-like surface (viewer always 0 / moss) in sync with OnlineDriver.
 * UI taps use display coords; server always receives engine coords.
 */
export class OnlineSession {
  readonly kind = 'online' as const;
  sel: Sel = EMPTY_SEL;
  /** Display-space state (Me = seat mapped to player 0). */
  state: State;
  readonly log: Action[] = [];
  readonly base: State | null = null;
  private drawn: Action | null = null;
  private lastCatchUp: Step[] = [];

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

  get legal(): Action[] {
    const snap = this.driver.snapshot();
    if (snap.view.actor !== snap.seat || snap.status !== 'active') return [];
    // Legal in engine space → map to display (screen) coords for the UI.
    return snap.legal.map((a) => this.driver.perspective().mapActionToScreen(a));
  }

  get pending(): Action | null {
    if (this.drawn && this.legal.some((a) => same(a, this.drawn!))) return this.drawn;
    return this.legal.length ? pendingAction(this.view, this.legal, this.sel) : null;
  }

  get canUndo(): boolean {
    return this.driver.draft().canUndo();
  }

  get myTurn(): boolean {
    const snap = this.driver.snapshot();
    return snap.status === 'active' && snap.view.actor === snap.seat && snap.view.phase !== 'GAME_OVER';
  }

  get finished(): boolean {
    const snap = this.driver.snapshot();
    return snap.status === 'finished' || snap.view.phase === 'GAME_OVER';
  }

  preset(a: Action | null) {
    this.drawn = a && this.legal.some((x) => same(x, a)) ? a : null;
  }
  get presetMove(): Action | null {
    return this.drawn;
  }

  tapCard(id: number) {
    this.drawn = null;
    this.sel = tapCard(this.view, this.legal, this.sel, id);
  }
  tapHex(key: string) {
    this.drawn = null;
    this.sel = tapHex(this.view, this.legal, this.sel, key);
  }
  tapKind(kind: string) {
    this.drawn = null;
    this.sel = tapKind(this.sel, kind);
  }
  cancel() {
    this.drawn = null;
    this.sel = EMPTY_SEL;
  }

  /** Sync display board/hand from driver (after server view or draft change). */
  refresh() {
    this.state = this.buildDisplayState();
    this.sel = EMPTY_SEL;
    this.drawn = null;
  }

  /** Take catch-up steps since last consume (opponent / own committed turn). */
  consumeCatchUp(): Step[] {
    const events = [...this.driver.pendingEvents()];
    if (!events.length) return [];
    this.driver.skipCatchUp();
    const steps = stepsFromEvents(events, this.driver.perspective());
    const v = this.view;
    steps.push(syncStep(this.state.board, [v.score, v.opponentScore]));
    this.lastCatchUp = steps;
    return steps;
  }

  peekCatchUp(): Step[] {
    return this.lastCatchUp;
  }

  /**
   * Play a UI action (display coords). Draw/Throw are async; mid-turn Grow is local draft.
   */
  async play(action: Action): Promise<OnlinePlayResult> {
    const engine = this.driver.toEngineAction(action);
    if (engine.t === 'Draw') {
      const before = this.buildEngineShadow();
      const res = await this.driver.draw(engine);
      if (!res.ok) return { ok: false, message: res.message ?? 'Draw failed.' };
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

    if (engine.t === 'EndAct') {
      const res = await this.driver.throwTurn(engine);
      if (!res.ok) {
        this.refresh();
        return { ok: false, message: res.message ?? "That turn didn't go through. Your cards are back." };
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
      return { ok: false, message: 'That move is not legal right now.' };
    }
    this.driver.draft().persist();
    const afterEng = this.driver.draft().shadow() ?? beforeEng;
    this.state = this.driver.perspective().toDisplayState(afterEng);
    this.sel = EMPTY_SEL;
    this.drawn = null;
    this.log.push(engine);
    const played: Played = {
      before: beforeDisp,
      action,
      after: this.state,
      steps: buildSteps(beforeEng, engine, afterEng, this.seat).map((s) => mapStepDisplay(s, this.driver)),
    };
    return { ok: true, played, catchUp: [], finished: false };
  }

  undo(): boolean {
    if (!this.driver.draftUndo()) return false;
    this.driver.draft().persist();
    this.refresh();
    if (this.log.length) this.log.pop();
    return true;
  }

  async resign(): Promise<OnlinePlayResult> {
    const res = await this.driver.resign();
    if (!res.ok) return { ok: false, message: res.message ?? 'Resign failed.' };
    this.refresh();
    return { ok: true, played: null, catchUp: this.consumeCatchUp(), finished: true };
  }

  confirm(): Promise<OnlinePlayResult> | null {
    const a = this.pending;
    if (!a) return null;
    return this.play(a);
  }

  /** Payload for finished screen. */
  finishInfo(): { title: string; reason: string; scores: [number, number] } | null {
    const snap = this.driver.snapshot();
    if (!this.finished) return null;
    const r = snap.result;
    const scores: [number, number] = [snap.view.score, snap.view.opponentScore];
    if (!r) return { title: 'Finished', reason: '', scores };
    const title =
      r.winner === snap.seat ? 'You won' : r.winner === null ? 'Draw' : 'You lost';
    const reason =
      r.reason === 'timeout'
        ? 'Time ran out.'
        : r.reason === 'resigned'
          ? 'Resigned.'
          : r.reason === 'strangle' || r.reason === 'double_strangle'
            ? 'Surround.'
            : r.reason === 'deck_exhaustion' || r.reason === 'turn_limit' || r.reason === 'knock'
              ? 'Final score.'
              : '';
    return { title, reason, scores };
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

const same = (a: Action, b: Action) => JSON.stringify(a) === JSON.stringify(b);

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
  return stepsFromEvents(events, driver.perspective());
};
