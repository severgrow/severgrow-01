// THE VIEWPORT GUARD (owner, 2026-10-31: "global chat leaking outside of the screen — should never
// happen"). The game is a fixed, full-screen surface: the document itself never scrolls. But iOS
// Safari scrolls the document anyway to bring a focused text box into view above the keyboard, and
// when the keyboard goes away it can leave the page shifted — the header under the status bar and
// every right-hand control clipped (iPhone 17, Territory chat). This puts the page back at its origin
// whenever no text box is focused, for every text box in the game, with no per-feature code.
//
// No timers that keep running, no animation: one check on focusout and one on a viewport change.

const isTextBox = (el: Element | null): boolean =>
  !!el && (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select') || (el as HTMLElement).isContentEditable);

/** The document is never meant to be scrolled; put it back when nothing is being typed into. */
export const settleViewport = (win: Window = window): void => {
  if (isTextBox(win.document.activeElement)) return;
  const root = win.document.scrollingElement ?? win.document.documentElement;
  if (win.scrollX !== 0 || win.scrollY !== 0) win.scrollTo(0, 0);
  if (root.scrollLeft !== 0 || root.scrollTop !== 0) { root.scrollLeft = 0; root.scrollTop = 0; }
  const body = win.document.body;
  if (body && (body.scrollLeft !== 0 || body.scrollTop !== 0)) { body.scrollLeft = 0; body.scrollTop = 0; }
};

export const mountViewportGuard = (win: Window = window): (() => void) => {
  // focusout fires before the next element takes focus; wait a frame so moving from one text box to
  // another (or to its Send key, then back) is not treated as "the keyboard closed".
  const later = () => win.requestAnimationFrame(() => win.requestAnimationFrame(() => settleViewport(win)));
  const vv = win.visualViewport;
  win.document.addEventListener('focusout', later, true);
  vv?.addEventListener('resize', later);
  win.addEventListener('orientationchange', later);
  return () => {
    win.document.removeEventListener('focusout', later, true);
    vv?.removeEventListener('resize', later);
    win.removeEventListener('orientationchange', later);
  };
};
