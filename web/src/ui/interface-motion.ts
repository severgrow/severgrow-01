// INTERFACE MOTION (owner direction, 2026-10-22).
//
// The game's own choreography lives in `web/src/logic/motion.ts` (two tempo tokens, pinned beats,
// the board's juice budget). This file is the other, quieter half: the motion of the *interface*
// surfaces around the game — sheets, the pause face, the finish plate, confirmations, overlays.
//
// The rule is one sentence: an element simply BECOMES PRESENT, with a little physical movement.
// No bounce, no big slides, no zoom. Opening is 200ms and travels 8px at 99% scale; closing is
// quicker (150ms) and is the coordinated reverse. Presses answer in 90ms.
//
// This layer is deliberately small and dependency-free: two durations, two easings, one travel
// distance and two primitives. FUTURE AGENTS ADOPT IT BY MARKUP:
//
//   <div class="sheet" data-ix-surface>…</div>          // CSS settles it if JS never runs
//   <button class="btn" data-ix-press>…</button>        // CSS press on pointerdown/up
//
// and by calling `enterSurface` / `exitSurface` from the one place that hides or shows the
// surface. See `docs/INTERFACE-MOTION.md` for the principles and the adoption recipe.

/** The whole vocabulary. The CSS custom properties of the same names are kept in sync by a test. */
export const INTERFACE_MOTION = Object.freeze({
  /** A surface arrives: 200ms (the brief's 150–230ms). */
  open: 200,
  /** A surface leaves: 150ms, deliberately quicker than its arrival (110–190ms). */
  close: 150,
  /** A press or a hover-sized acknowledgement: 90ms (70–130ms). */
  press: 90,
  /** How far a surface travels while it arrives: 8px (the brief's 4–10px). */
  travel: 8,
  /** The scale it settles from: 99% (the brief's 98.5–99%). */
  scale: 0.99,
  /** Decelerate into rest. No overshoot: this interface never springs. */
  easeOpen: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  /** Accelerate away. The exact reverse feeling, not a new personality. */
  easeClose: 'cubic-bezier(0.4, 0, 1, 1)',
});

export type SurfaceMotion = Readonly<typeof INTERFACE_MOTION>;

/** Per-call overrides. Surfaces may travel less on a phone; they may not invent new tokens. */
export type SurfaceOptions = {
  /** Default `INTERFACE_MOTION.open` / `.close`. */
  duration?: number;
  /** Default `INTERFACE_MOTION.travel`. */
  travel?: number;
  /** Default `INTERFACE_MOTION.scale`. */
  scale?: number;
  /** Called once the surface has finished leaving (never after an interruption). */
  onDone?: () => void;
};

type SurfaceState = 'opening' | 'open' | 'closing' | 'closed';
const running = new WeakMap<HTMLElement, Animation>();
const stateOf = new WeakMap<HTMLElement, SurfaceState>();

/**
 * True when motion is allowed: neither the OS preference nor the game's own Reduce motion setting.
 * Speed Off (the game's time scale) is deliberately NOT read here — that setting is about the
 * board's choreography, not about a menu opening.
 */
export const interfaceMotionAllowed = (): boolean => {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  if (root.classList.contains('reduce-motion')) return false;
  return typeof matchMedia === 'function' ? !matchMedia('(prefers-reduced-motion: reduce)').matches : true;
};

const settle = (el: HTMLElement, state: SurfaceState): void => {
  stateOf.set(el, state);
  el.dataset.ixState = state;
  // The final resting state is the element's own CSS (opacity 1, no translate, scale 1). Removing
  // the animation after it finishes means nothing lingers if the surface is later hidden or moved.
  el.style.removeProperty('opacity');
  el.style.removeProperty('translate');
  el.style.removeProperty('scale');
};

const isElement = (el: HTMLElement | null | undefined): el is HTMLElement => !!el && el.nodeType === 1;

/**
 * Show a surface. Call it AFTER `hidden = false`; it never changes `hidden` itself (the caller owns
 * visibility, focus and state). Returns the running Animation, or null when motion is off.
 *
 * A tap during an open jumps the animation to its end (the WAAPI `finish()`), so a fast player is
 * never made to wait for the interface.
 */
export function enterSurface(el: HTMLElement | null | undefined, options: SurfaceOptions = {}): Animation | null {
  if (!isElement(el)) return null;
  const previous = running.get(el);
  if (previous) {
    try {
      previous.finish();
    } catch {
      previous.cancel();
    }
    running.delete(el);
  }
  el.removeAttribute('inert');
  el.classList.remove('ix-closing');
  const duration = options.duration ?? INTERFACE_MOTION.open;
  if (!interfaceMotionAllowed() || duration <= 0) {
    settle(el, 'open');
    return null;
  }
  const travel = options.travel ?? INTERFACE_MOTION.travel;
  const scale = options.scale ?? INTERFACE_MOTION.scale;
  const a = el.animate(
    [
      { opacity: 0, translate: `0 ${travel}px`, scale: String(scale) },
      { opacity: 1, translate: '0 0', scale: '1' },
    ],
    { duration, easing: INTERFACE_MOTION.easeOpen, fill: 'both' },
  );
  running.set(el, a);
  stateOf.set(el, 'opening');
  el.dataset.ixState = 'opening';
  a.finished
    .then(() => {
      if (running.get(el) !== a) return;
      running.delete(el);
      a.cancel();
      settle(el, 'open');
    })
    .catch(() => undefined);
  return a;
}

/**
 * Hide a surface. The caller may keep the node in the DOM; `onDone` is where it sets `hidden`,
 * removes itself, or returns focus. The callback is NOT called if the exit is interrupted (for
 * example a rapid re-open), so a late timeout can never hide a panel the player has just reopened.
 *
 * The closing surface is made `inert` and `pointer-events: none` (CSS) so it cannot swallow a tap
 * or a Tab while it fades. Input is never locked globally.
 */
export function exitSurface(el: HTMLElement | null | undefined, options: SurfaceOptions = {}): Animation | null {
  if (!isElement(el)) return null;
  const previous = running.get(el);
  if (previous) {
    try {
      previous.finish();
    } catch {
      previous.cancel();
    }
    running.delete(el);
  }
  const duration = options.duration ?? INTERFACE_MOTION.close;
  const finish = (): void => {
    settle(el, 'closed');
    options.onDone?.();
  };
  if (!interfaceMotionAllowed() || duration <= 0) {
    finish();
    return null;
  }
  const travel = options.travel ?? Math.round(INTERFACE_MOTION.travel * 0.75);
  const scale = options.scale ?? INTERFACE_MOTION.scale + 0.005;
  el.classList.add('ix-closing');
  el.setAttribute('inert', '');
  const a = el.animate(
    [
      { opacity: 1, translate: '0 0', scale: '1' },
      { opacity: 0, translate: `0 ${travel}px`, scale: String(scale) },
    ],
    { duration, easing: INTERFACE_MOTION.easeClose, fill: 'both' },
  );
  running.set(el, a);
  stateOf.set(el, 'closing');
  el.dataset.ixState = 'closing';
  a.finished
    .then(() => {
      if (running.get(el) !== a) return;
      running.delete(el);
      a.cancel();
      el.removeAttribute('inert');
      el.classList.remove('ix-closing');
      finish();
    })
    .catch(() => undefined);
  return a;
}

/**
 * Stop whatever a surface is doing and forget it. Used when a surface is hidden by a screen
 * change rather than by its own close path (never leaves a ghost animation behind).
 */
export function resetSurface(el: HTMLElement | null | undefined): void {
  if (!isElement(el)) return;
  const a = running.get(el);
  if (a) {
    try {
      a.cancel();
    } catch {
      /* already gone */
    }
    running.delete(el);
  }
  el.removeAttribute('inert');
  el.classList.remove('ix-closing');
  el.style.removeProperty('opacity');
  el.style.removeProperty('translate');
  el.style.removeProperty('scale');
  stateOf.set(el, 'closed');
  el.dataset.ixState = 'closed';
}

/**
 * A short, physical press for controls that cannot use `:active` (a canvas button, a custom
 * control) or that need the answer to a keyboard activation. Where `:active` works, CSS with the
 * same tokens is preferable — this is not a second button system.
 */
export function press(el: HTMLElement | null | undefined, options: SurfaceOptions = {}): Animation | null {
  if (!isElement(el)) return null;
  const duration = options.duration ?? INTERFACE_MOTION.press;
  if (!interfaceMotionAllowed() || duration <= 0) return null;
  const compress = 1 - (1 - INTERFACE_MOTION.scale) * 0.6;
  return el.animate(
    [
      { scale: '1' },
      { scale: String(compress), offset: 0.45 },
      { scale: '1' },
    ],
    { duration, easing: INTERFACE_MOTION.easeOpen },
  );
}

/** Exposed for tests and for future surfaces that need to know where a surface is in its life. */
export const surfaceState = (el: HTMLElement): SurfaceState => stateOf.get(el) ?? 'closed';
