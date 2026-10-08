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
  /** States (and log lengths) before each take-back-able move of the player's current turn (see undo). */
  private undoStack: { state: State; n: number }[] = [];
  /** overhaul item 20: every play that cut tiles off (for "Replay the biggest cut") */
  private cuts: { n: number; played: Played }[] = [];
  private cache: { state: State; view: View; legal: Action[] } | null = null;
  /** Polish pass 3: a drawn line or clump waiting for Confirm (replaces the picked move while legal). */
  private drawn: Action | null = null;

  /** Every action played in this game, from the start (the autosave keeps only this and the seed). */
  readonly log: Action[];

  constructor(
    public state: State,
    public readonly viewer: Player = 0,
    log: readonly Action[] = [],
    /** The set position the log starts from (null: the seed's own start). */
    public readonly base: State | null = null,
  ) {
    this.log = [...log];
  }

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
    if (this.drawn && this.legal.some((a) => same(a, this.drawn!))) return this.drawn;
    return this.legal.length ? pendingAction(this.view, this.legal, this.sel) : null;
  }

  /** A drawn placement to preview and confirm (null clears it). Only a legal move is kept. */
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
    // Growing tiles, Strengthen, a Fruit card (and pressing "Throw a card") reveal nothing new, so the player
    // may take them back. A draw, a throw or any bot move makes everything before final.
    if (who === this.viewer && (action.t === 'Bloom' || action.t === 'MegaBomb' || action.t === 'Sprout' || action.t === 'PlayFruit' || action.t === 'EndAct')) this.undoStack.push({ state: s, n: this.log.length });
    else this.undoStack = [];
    const played: Played = { before: s, action, after, steps: buildSteps(s, action, after, this.viewer) };
    this.state = after;
    this.log.push(action);
    this.sel = EMPTY_SEL;
    this.drawn = null;
    const last = this.turns.at(-1);
    if (last && last.player === s.turnPlayer && (last.plays.length === 0 || last.plays.at(-1)!.after === s)) last.plays.push(played);
    else this.turns.push({ player: s.turnPlayer, plays: [played] });
    if (this.turns.length > 6) this.turns.shift();
    const n = played.steps.reduce((k, st) => k + (st.k === 'sever' ? st.keys.length : 0), 0);
    if (n > 0) this.cuts.push({ n, played });
    return played;
  }

  /** True when the player can take back their last move. */
  get canUndo(): boolean {
    return this.undoStack.length > 0 && this.state.actor === this.viewer && this.state.phase !== 'GAME_OVER';
  }

  /** Takes back the player's last move of this turn. Returns false if there is none. */
  undo(): boolean {
    if (!this.canUndo) return false;
    const back = this.undoStack.pop()!;
    this.state = back.state;
    this.log.length = back.n;
    this.sel = EMPTY_SEL;
    this.drawn = null;
    const last = this.turns.at(-1);
    const gone = last && last.player === this.viewer ? last.plays.pop() : undefined;
    if (gone) this.cuts = this.cuts.filter((c) => c.played !== gone);
    // a turn with nothing left in it (resumed mid-turn, its only move taken back) is forgotten
    if (last && last.plays.length === 0) this.turns.pop();
    return true;
  }

  /** The play that cut off the most tiles this game (the first, on a tie), or null. */
  get biggestCut(): Played | null {
    let best: { n: number; played: Played } | null = null;
    for (const c of this.cuts) if (!best || c.n > best.n) best = c;
    return best?.played ?? null;
  }

  /** Every action of `player`'s latest turn (for "Replay last turn"). */
  lastTurnOf(player: Player): Played[] {
    for (let i = this.turns.length - 1; i >= 0; i--) if (this.turns[i]!.player === player) return this.turns[i]!.plays;
    return [];
  }
}
