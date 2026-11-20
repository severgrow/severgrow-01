/**
 * THE ROOM-LIGHT WINDOW (owner, 2026-11-20: the opponent's Grow reaction showed a vertical seam at
 * the board edge on desktop and an unlit strip at the bottom of an iPhone 15 Pro).
 *
 * The full-screen light layers (the outcome light and the ambient pulse) are already one even wash
 * over the viewport. What broke "one room" was the board's own local light patches sitting ABOVE
 * that wash: the dark board vignette on `.play::before`, the cream reflection on
 * `.board-wrap::before`, the contact shadows on `.dock::before`, and the slow warm pass on
 * `#game::before`. Their rectangles stop at the board/cockpit/hand boxes, so the wash was visibly
 * cut at the board edge and dimmed under the hand.
 *
 * This module is the one signal that a room beat is running. While it is held, those local patches
 * are hidden (one class on <html>), so the same colour reaches beneath the board, the cockpit and
 * the hand through the phone's visible bottom edge. Nothing changes at rest: the class exists only
 * for the pulse's own duration, and the resting board keeps every layer it had.
 *
 * Reference-counted because the outcome light and a big-action ambient pulse can overlap: the class
 * leaves only when the LAST beat has ended (or was cancelled).
 */
export const ROOM_LIT_CLASS = 'futa04-room-lit';

let held = 0;

/** Hold the room-light window open; call the returned release exactly once when the beat ends. */
export const holdRoomLight = (): (() => void) => {
  if (typeof document === 'undefined') return () => undefined;
  held += 1;
  document.documentElement.classList.add(ROOM_LIT_CLASS);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    held = Math.max(0, held - 1);
    if (held === 0) document.documentElement.classList.remove(ROOM_LIT_CLASS);
  };
};
