// Local mid-turn draft on a shadow State (Phase 0 g). Draw is always server-committed.
// Draft actions are kept in memory and sessionStorage so a refresh does not lose them.
import { IllegalActionError, applyAs, legalActions, viewFor } from '../../../src/engine/index.js';
import type { Action, State, View } from '../../../src/engine/index.js';
import type { KeyValue } from '../../../server/src/client.js';
import { sameMove } from '../logic/interaction.js';
import { shadowFromView } from './shadow.js';

export const draftStorageKey = (matchId: string): string => `severgrow.duel.draft.v1.${matchId}`;

export type DraftSnapshot = {
  matchId: string;
  /** Server revision the draft is based on (post-Draw). */
  baseRevision: number;
  actions: Action[];
};

export type DraftEngine = {
  /** Replace the authoritative post-Draw view from the server; clear draft if revision moved. */
  syncFromServer(view: View, revision: number): void;
  /** Apply a mid-turn Grow/Bloom/Strengthen/Bomb/Blast on the shadow. Returns false if illegal. */
  play(action: Action): boolean;
  /** Take back the last draft action. */
  undo(): boolean;
  canUndo(): boolean;
  /** Queued mid-turn actions (not including Draw; Throw/EndAct added by submit). */
  actions(): readonly Action[];
  /** Current shadow view for the UI, or the server view when there is no draft. */
  view(): View;
  legal(): Action[];
  /** Persist draft to session storage. */
  persist(): void;
  /** Drop draft (after successful Throw or on conflict). */
  clear(): void;
  hasDraft(): boolean;
  baseRevision(): number;
  /** Shadow state for tests / anim; null when no shadow needed. */
  shadow(): State | null;
};

const sessionStore = (): KeyValue | null => {
  const ss = (globalThis as {
    sessionStorage?: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
  }).sessionStorage;
  if (!ss) return null;
  try {
    const probe = '__severgrow_draft_probe__';
    ss.setItem(probe, '1');
    ss.removeItem(probe);
  } catch {
    return null;
  }
  return { get: (k) => ss.getItem(k), set: (k, v) => ss.setItem(k, v), remove: (k) => ss.removeItem(k) };
};

const loadStored = (storage: KeyValue | null, matchId: string): DraftSnapshot | null => {
  if (!storage) return null;
  try {
    const raw = storage.get(draftStorageKey(matchId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraftSnapshot>;
    if (parsed.matchId !== matchId || typeof parsed.baseRevision !== 'number' || !Array.isArray(parsed.actions)) {
      return null;
    }
    return { matchId, baseRevision: parsed.baseRevision, actions: parsed.actions as Action[] };
  } catch {
    return null;
  }
};

export const createDraftEngine = (options: {
  matchId: string;
  storage?: KeyValue | null;
}): DraftEngine => {
  const storage = options.storage === undefined ? sessionStore() : options.storage;
  let matchId = options.matchId;
  let serverView: View | null = null;
  let baseRevision = 0;
  let draftActions: Action[] = [];
  let shadow: State | null = null;
  let undoStack: State[] = [];

  const rebuildShadow = (): void => {
    if (!serverView) {
      shadow = null;
      return;
    }
    let s = shadowFromView(serverView);
    undoStack = [];
    try {
      for (const action of draftActions) {
        undoStack.push(s);
        s = applyAs(s, serverView.player, action);
      }
      shadow = s;
    } catch {
      // A draft that no longer replays against the server's view is STALE (the server moved on,
      // or the board changed under it). Dropping it is the honest outcome: better a clean turn
      // than a half-built shadow that throws on the next tap - which is what a player would read
      // as "undo is broken" (owner, 2026-10-21).
      draftActions = [];
      undoStack = [];
      shadow = shadowFromView(serverView);
      if (storage) {
        try { storage.remove(draftStorageKey(matchId)); } catch { /* storage blocked */ }
      }
    }
  };

  const restore = (stored: DraftSnapshot | null): void => {
    if (!stored || stored.matchId !== matchId) return;
    if (stored.baseRevision !== baseRevision) return;
    draftActions = [...stored.actions];
    rebuildShadow();
  };

  // hydrate once
  restore(loadStored(storage, matchId));

  return {
    syncFromServer(view, revision) {
      serverView = view;
      if (revision !== baseRevision) {
        // Server advanced (or first sync): keep an in-memory draft only if it already
        // matches this revision; otherwise try sessionStorage for a refresh mid-draft.
        if (draftActions.length > 0 && baseRevision === revision) {
          /* keep */
        } else {
          draftActions = [];
          undoStack = [];
          shadow = null;
          const stored = loadStored(storage, matchId);
          if (stored && stored.baseRevision === revision) {
            draftActions = [...stored.actions];
          }
        }
        baseRevision = revision;
      } else if (draftActions.length === 0) {
        const stored = loadStored(storage, matchId);
        if (stored && stored.baseRevision === revision) {
          draftActions = [...stored.actions];
        }
      }
      if (draftActions.length > 0) rebuildShadow();
      else shadow = null;
    },

    play(action) {
      if (!serverView) return false;
      if (serverView.actor !== serverView.player) return false;
      if (!shadow) shadow = shadowFromView(serverView);
      const view = viewFor(shadow, serverView.player);
      const legal = legalActions(view);
      // `sameMove`, not exact JSON: a set Bloom's hex order is not part of the move, and the
      // mirrored seat-1 viewer enumerates it in the reverse order of the engine's own list.
      const enumerated = legal.some((a) => sameMove(view, a, action));
      if (!enumerated && !(action.t === 'Bloom' && action.cards.length >= 5)) return false;
      try {
        const next = applyAs(shadow, serverView.player, action);
        undoStack.push(shadow);
        shadow = next;
        draftActions.push(action);
        return true;
      } catch (error) {
        if (error instanceof IllegalActionError) return false;
        throw error;
      }
    },

    undo() {
      if (undoStack.length === 0 || draftActions.length === 0) return false;
      shadow = undoStack.pop()!;
      draftActions.pop();
      if (draftActions.length === 0) shadow = serverView ? shadowFromView(serverView) : null;
      return true;
    },

    // ONE SOURCE OF TRUTH (owner, 2026-10-21: "one player wasn't able to undo after growing").
    // This used to answer from `draftActions` alone while `undo()` also needs an `undoStack`
    // entry, so the two could disagree and offer a button that then refused. They now agree by
    // construction: undo is available exactly when there is both an action and a state to go
    // back to.
    canUndo: () => draftActions.length > 0 && undoStack.length > 0,

    actions: () => draftActions,

    view() {
      if (!serverView) throw new Error('Draft has no server view yet.');
      if (shadow) return viewFor(shadow, serverView.player);
      return serverView;
    },

    legal() {
      if (!serverView) return [];
      if (serverView.actor !== serverView.player) return [];
      const state = shadow ?? shadowFromView(serverView);
      return legalActions(viewFor(state, serverView.player));
    },

    persist() {
      if (!storage) return;
      try {
        if (draftActions.length === 0) {
          storage.remove(draftStorageKey(matchId));
          return;
        }
        const snap: DraftSnapshot = { matchId, baseRevision, actions: draftActions };
        storage.set(draftStorageKey(matchId), JSON.stringify(snap));
      } catch {
        // sessionStorage full / blocked — keep in-memory only
      }
    },

    clear() {
      draftActions = [];
      undoStack = [];
      shadow = null;
      try {
        storage?.remove(draftStorageKey(matchId));
      } catch {
        /* keep clearing in memory */
      }
    },

    hasDraft: () => draftActions.length > 0,

    baseRevision: () => baseRevision,

    shadow: () => shadow,
  };
};
