// MAY ANYTHING BEHIND THE GLASS KEEP MOVING? No. One answer, one place.
//
// WHY THIS EXISTS (measured, docs/PERF-THERMAL.md): every full-screen surface over the game wears a
// live `backdrop-filter` (`--veil`, `--dark-glass-blur`). A backdrop blur is only composited once
// while the layer *under* it is still; the moment that layer animates, the blur is recomputed every
// frame. MEASURED on the 4x-CPU phone probe: the finish card, with the board still breathing behind
// it, held the main thread 27% busy with 601 layouts and 602 paints in five idle seconds; with this
// gate the same card costs 10%.
//
// The same gate stops the planet's own render loop and the space backdrop's slide, because those are
// JavaScript/WebGL and a CSS pause cannot reach them.
//
// WHAT COUNTS AS A VEIL: a surface that both covers the screen and carries a backdrop-filter.
// Cheap on purpose — `refresh()` runs only when a surface opens, closes, or the tab is shown again,
// never per frame.
export const VEIL_SELECTORS = [
  '#gameover:not([hidden])',
  '#install-prompt:not([hidden])',
  '#sheet-menu:not([hidden])',
  '.sheet:not([hidden])',
  '.world-panel:not([hidden])',
  '.world-chat:not([hidden])',
] as const;

const QUERY = VEIL_SELECTORS.join(',');

type Doc = Pick<Document, 'querySelectorAll'> & { documentElement?: { classList: { toggle: (c: string, on: boolean) => unknown } } };

/**
 * Is a veil up right now? Pure: takes the document, so the rule can be tested without a browser.
 * A match must be VISIBLE, not merely unhidden: the install invitation's own `.sheet` lives inside a
 * `hidden` wrapper and would otherwise hold the gate from the first frame (found at boot).
 */
export const veilCovering = (doc: Doc | null): boolean => {
  if (!doc) return false;
  try {
    for (const el of doc.querySelectorAll(QUERY)) {
      const rects = (el as Element & { getClientRects?: () => ArrayLike<unknown> }).getClientRects;
      if (typeof rects !== 'function' || rects.call(el).length > 0) return true;
    }
    return false;
  } catch { return false; }
};

/**
 * The page's own state: `held` is what every loop reads. It is written by `refresh()` and read by
 * `backdropHeld()`; `onBackdropChange` lets a renderer stop or restart its loop at the edges only.
 */
let held = false;
const listeners = new Set<(held: boolean) => void>();

/** True while a veil covers the live layer. Cheap enough to read once per frame. */
export const backdropHeld = (): boolean => held;

/** Subscribe to the edges (held ↔ released). Returns the unsubscribe. */
export const onBackdropChange = (fn: (held: boolean) => void): (() => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

/**
 * Recompute the gate. Called when a surface opens or closes (main.ts `syncVeil`, the one choke point
 * for every sheet and the finish card) and when the tab is shown again. Toggles the class the
 * stylesheet uses to pause every decorative animation behind the veil.
 */
export const refreshBackdropGate = (doc: Document | null = typeof document === 'undefined' ? null : document): boolean => {
  const next = veilCovering(doc);
  if (doc?.documentElement) doc.documentElement.classList.toggle('backdrop-held', next);
  if (next === held) return held;
  held = next;
  for (const fn of listeners) {
    try { fn(next); } catch { /* one bad listener must not stop the others */ }
  }
  return held;
};

/** Mount the listeners that no surface owns: a backgrounded tab is held too, and a return refreshes. */
export const mountBackdropGate = (): void => {
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshBackdropGate(); });
  // A page restored from the back/forward cache has been frozen with whatever animations it had.
  addEventListener('pageshow', () => refreshBackdropGate());
  // Every veil in this app is shown and hidden with the `hidden` attribute, so one observer covers
  // surfaces that do not go through main.ts's `syncVeil` (the install invitation, the lobby's own
  // windows). Attribute-only, `hidden`-only: a cheap, rare event, never a per-frame cost.
  if (document.body) {
    new MutationObserver(() => refreshBackdropGate()).observe(document.body, {
      attributes: true, attributeFilter: ['hidden'], subtree: true,
    });
  }
  refreshBackdropGate();
};
