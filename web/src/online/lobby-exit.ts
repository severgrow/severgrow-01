// THE ONE WAY OUT OF THE LOBBY FOR A MATCH (owner report, 2026-10-28).
//
// Owner, verbatim: "accepting challenge in territory opens the duel screen under it - see screenshot,
// everything on top of eachother - can never happen ... opening a duel from territory is taking you
// to that duel in a cool way, small animation or effect - but this never happens that its on top".
//
// The lobby is not one screen: the hub, the waiting room, the join code and the Territory map are
// four sibling `.screen` sections. `#game` sits earlier in the document, so any lobby screen left
// visible paints OVER the live board. `showScreen()` knew about three of the four, and `openDuel()`
// never asked the lobby to leave at all, so the map stayed on top of the duel.
//
// Two guarantees live here, and both are cheap:
//   1. `hideLobbySurfaces()` — the safety net. EVERY screen change calls it, so no entry point can
//      leave a lobby screen painted, even one written later.
//   2. `leaveLobbyForMatch()` — the deliberate transition. It tears the Territory view down (sheet,
//      keys, selection, its own timers) and gives the screen the interface's own exit beat
//      (interface-motion.ts: 100ms fade and a 2.4px sink). The game screen itself is never animated:
//      the board is the live object, and it only BECOMES visible under the departing map.
import { exitSurface, resetSurface } from '../ui/interface-motion.js';

/**
 * Every full-screen lobby surface, in document order. ONE list: index.html has one `<section
 * class="screen">` per entry and `web/tests/lobby-exit.test.ts` fails if a new one is added here and
 * not there (or the reverse).
 */
export const LOBBY_SCREEN_IDS = ['online-hub', 'online-waiting', 'online-join', 'online-world-screen'] as const;
export type LobbyScreenId = (typeof LOBBY_SCREEN_IDS)[number];

/** The two things this module reads from a screen. Structural, so a test can stand in for the DOM.
 *  (`hidden` is `string | boolean` in lib.dom — `until-found` is a string state — but every state
 *  this module reads or writes is `true` / `false`.) */
export type LobbySurface = { hidden: string | boolean; dataset: { ixState?: string } };
export type LobbyDoc = { getElementById(id: string): LobbySurface | null };

/**
 * The lobby screens a screen change must hide: every visible one that is not already leaving. A
 * closing screen owns its own hide (its `exitSurface` onDone), so interrupting it here would cut the
 * one deliberate beat short.
 */
export const lobbyScreensToHide = (doc: LobbyDoc): LobbyScreenId[] =>
  LOBBY_SCREEN_IDS.filter((id) => {
    const el = doc.getElementById(id);
    return !!el && !el.hidden && el.dataset.ixState !== 'closing';
  });

/**
 * The safety net: hide every lobby screen, now. Called from `showScreen()` for every screen change,
 * so the map can never outlive its screen. Returns the ids it hid, for tests.
 *
 * `resetSurface` is safe on a stand-in element (interface-motion checks `nodeType === 1`), so this
 * helper carries no browser-only behaviour.
 */
export function hideLobbySurfaces(doc: LobbyDoc = document): LobbyScreenId[] {
  const ids = lobbyScreensToHide(doc);
  for (const id of ids) {
    const el = doc.getElementById(id);
    if (!el) continue;
    el.hidden = true;
    resetSurface(el as HTMLElement);
  }
  return ids;
}

export type LobbyExitOptions = {
  /** Tear the Territory view down before it leaves: sheet, keys, selection, timers, gestures. */
  teardown?: () => void;
  doc?: LobbyDoc;
};

/**
 * Leave the lobby for a match: the one transition every lobby entry point uses (a match row, a friend
 * joining, a join code, a Territory challenge). The visible screen leaves on the interface's own
 * close beat; the rest are hidden in the same frame. With Reduce motion on, `exitSurface` settles
 * synchronously and the map is simply gone — one breath, never a bounced or half-open screen.
 *
 * Returns the ids that are leaving, so a caller (and a test) can see what was on screen.
 */
export function leaveLobbyForMatch(options: LobbyExitOptions = {}): LobbyScreenId[] {
  const doc = options.doc ?? document;
  options.teardown?.();
  const visible = LOBBY_SCREEN_IDS.filter((id) => {
    const el = doc.getElementById(id);
    return !!el && !el.hidden;
  });
  for (const id of visible) {
    const el = doc.getElementById(id) as HTMLElement | null;
    if (!el) continue;
    // `fill: both` keeps the surface painted until onDone hides it, so the board is revealed by the
    // fade rather than by a flash of two screens. A reopened screen cancels this and keeps its own.
    exitSurface(el, { onDone: () => { el.hidden = true; resetSurface(el); } });
  }
  // Anything that was visible but did not start a beat (no motion, no element) is hidden here.
  hideLobbySurfaces(doc);
  return visible;
}
