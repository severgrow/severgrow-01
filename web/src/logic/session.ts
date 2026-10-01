// One game as the page plays it: the engine state, what the player has picked, and
// a record of each turn. All moves go through here; it only plays legal moves, and
// a move can only be confirmed once.
import { apply, legalActions, viewFor } from '../../../src/engine/index.js';
import type { Action, Player, State, View } from '../../../src/engine/index.js';
import { buildSteps } from './anim.js';
import type { Step } from './anim.js';
import { EMPTY_SEL, pendingAction, tapCard, tapHex, tapKind } from './interaction.js';
import type { Sel } from './interaction.js';

export type Played = { before: State; action: Action; after: State; steps: Step[] };

const same = (a: Action, b: Action) => JSON.stringify(a) === JSON.stringify(b);

export class Session {
  sel: Sel = EMPTY_SEL;
  private turns: { player: Player; plays: Played[] }[] = [];
  /** States before each take-back-able move of the player's current turn (see undo). */
  private undoStack: State[] = [];
  private cache: { state: State; view: View; legal: Action[] } | null = null;

  constructor(
    public state: State,
    public readonly viewer: Player = 0,
  ) {}

  private get memo() {
    if (this.cache?.state !== this.state) {
      const view = viewFor(this.state, this.viewer);
      const legal = this.state.phase !== 'GAME_OVER' && this.state.actor === this.viewer ? legalActions(view) : [];
      this.cache = { state: this.state, view, legal };
    }
    return this.cache;
  }
  /** What the player can see. */
  get view(): View {
    return this.memo.view;
  }
  /** The player's legal moves (empty when it is not their turn to act). */
  get legal(): Action[] {
    return this.memo.legal;
  }
  get pending(): Action | null {
    return this.legal.length ? pendingAction(this.view, this.legal, this.sel) : null;
  }

  tapCard(id: number) {
    this.sel = tapCard(this.view, this.legal, this.sel, id);
  }
  tapHex(key: string) {
    this.sel = tapHex(this.view, this.legal, this.sel, key);
  }
  tapKind(kind: string) {
    this.sel = tapKind(this.sel, kind);
  }
  nextOption() {
    this.sel = { ...this.sel, option: this.sel.option + 1 };
  }
  cancel() {
    this.sel = EMPTY_SEL;
  }

  /** Plays the picked move. Returns null if nothing is picked (so a second tap does nothing). */
  confirm(): Played | null {
    const a = this.pending;
    return a ? this.play(a) : null;
  }

  /** Plays `action` for `who` (default: the player) if it is legal right now. */
  play(action: Action, who: Player = this.viewer): Played | null {
    const s = this.state;
    if (s.phase === 'GAME_OVER' || s.actor !== who) return null;
    const legal = who === this.viewer ? this.legal : legalActions(viewFor(s, who));
    if (!legal.some((a) => same(a, action))) return null;
    const after = apply(s, action);
    // Growing tiles (and pressing "Throw a card away") reveal nothing new, so the player
    // may take them back. A draw, a discard or any bot move makes everything before final.
    if (who === this.viewer && (action.t === 'MeldRun' || action.t === 'MeldSet' || action.t === 'Sprout' || action.t === 'EndAct')) this.undoStack.push(s);
    else this.undoStack = [];
    const played: Played = { before: s, action, after, steps: buildSteps(s, action, after, this.viewer) };
    this.state = after;
    this.sel = EMPTY_SEL;
    const last = this.turns.at(-1);
    if (last && last.player === s.turnPlayer && last.plays.at(-1)!.after === s) last.plays.push(played);
    else this.turns.push({ player: s.turnPlayer, plays: [played] });
    if (this.turns.length > 6) this.turns.shift();
    return played;
  }

  /** True when the player can take back their last move. */
  get canUndo(): boolean {
    return this.undoStack.length > 0 && this.state.actor === this.viewer && this.state.phase !== 'GAME_OVER';
  }

  /** Takes back the player's last move of this turn. Returns false if there is none. */
  undo(): boolean {
    if (!this.canUndo) return false;
    this.state = this.undoStack.pop()!;
    this.sel = EMPTY_SEL;
    const last = this.turns.at(-1);
    if (last && last.player === this.viewer) last.plays.pop();
    return true;
  }

  /** Every action of `player`'s latest turn (for "Replay last turn"). */
  lastTurnOf(player: Player): Played[] {
    for (let i = this.turns.length - 1; i >= 0; i--) if (this.turns[i]!.player === player) return this.turns[i]!.plays;
    return [];
  }
}
