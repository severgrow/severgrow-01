// Phase 0+1: ONE press primitive.
//
// A single delegated listener in the capture phase answers every pressable surface: buttons,
// hardware keys, smart-cockpit keys and chips, hand cards, the two piles, board hexes, lesson
// CTAs and settings controls. It only paints state:
//   data-pressed="true", --press-depth (the shape's compression) and --press-drop (its depth)
// on pointerdown, holds while the pointer is down, and clears on pointerup / cancel / leave /
// blur. A pointer that travels more than 10 px (a drag) cancels the visual press, so painting a
// shape never looks like a tap. Space and Enter get the same press/release, auto-repeat is ignored.
//
// Phase 1: the depth is a PHYSICAL distance in px, chosen by the surface's size — 2 px on a 56 px
// button, 1 px on a 44 px key / a hex / a pile, and 1.5-3 px on a hand card by its weight. A card
// carries its own `--weight` (logic/card-weight.ts) so the CSS calc reads it, and its hit box never
// changes: only `translate`/`scale` move. The shadow compression is a pre-baked `.press-shade`
// layer added on press (one per surface, kept with opacity 0) whose OPACITY animates; no
// box-shadow or filter is animated per frame.
//
// It NEVER calls preventDefault, stopPropagation, or an action handler. Clicks keep working.
import { recordPressLatency } from './perf.js';

/** The one selector list every surface resolves through. */
export const PRESS_SELECTOR = [
  'button',
  '[role="button"]',
  '.hand-slot',
  '.futa04-hardware-control',
  '#smart-context',
  '#smart-bloom-button',
  '#smart-panel button',
  '#smart-panel [role="button"]',
  '.futa04-mini-card',
  '.chip',
  '#hand .card',
  '#deck',
  '#discard',
  '#board .tile',
  '#board .hex-cell',
  '#board .target',
  '#lesson-plate button',
  '#lesson-plate [role="button"]',
  '.lesson-cta',
  '#sheet-settings button',
  '#sheet-settings .seg-btn',
  '#sheet-settings .chip',
  '#sheet-settings label',
  '#sheet-settings input',
  '#sheet-settings summary',
  '#settings-lab button',
  '#settings-lab .lab-card',
  '#settings-lab summary',
  '#settings-lab input',
].join(',');

/** A drag longer than this (in CSS px) is painting/scrolling, not a press. */
export const PRESS_DRAG_PX = 10;

type PressLike = {
  closest(selector: string): PressLike | null;
  contains(node: Element): boolean;
  addEventListener?(type: string, listener: (event: PointerEvent) => void, options?: AddEventListenerOptions): void;
  removeEventListener?(type: string, listener: (event: PointerEvent) => void, options?: EventListenerOptions): void;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  style: { setProperty(name: string, value: string): void; removeProperty(name: string): void };
  disabled?: boolean;
  hidden?: boolean;
};

const asPressLike = (el: Element | null): PressLike | null => el as unknown as PressLike | null;

/** Disabled, hidden, inert, or inside a hidden subtree: never answer. */
export const shouldSkipPress = (el: PressLike | null): boolean => {
  if (!el) return true;
  if (el.disabled || el.hidden) return true;
  if (el.getAttribute('aria-disabled') === 'true') return true;
  if (el.closest('[hidden], [inert], [aria-hidden="true"]')) return true;
  return !!el.closest('input:disabled, button:disabled, select:disabled, textarea:disabled');
};

/** Hardware keys use the cockpit's 1 px lift; everything else uses the ordinary press depth. */
export const pressSurface = (el: PressLike | null): 'key' | 'plain' =>
  el?.closest('.futa04-hardware-control, #smart-context, #smart-bloom-button, #futa04-actions > .hand-slot') ? 'key' : 'plain';

/** The scale the visual press settles to. Kept as a custom property so CSS owns the shape. */
export const pressDepth = (surface: 'key' | 'plain'): string => (surface === 'key' ? '0.98' : '0.97');

/** Phase 1: how deep a surface physically goes, decided by its size (never measured per frame). */
export type PressSize = 'card' | 'hex' | 'big' | 'key';

/**
 * A card's depth follows its weight: 1.5 px for the lightest, 3 px for the heaviest. The CSS calc
 * reads the card's own `--weight`, so one value per press is all the JS writes.
 */
export const CARD_PRESS_DROP = 'calc(1.5px + 1.5px * var(--weight, 0))';

/** The one place a surface's press distance comes from. */
export const pressDrop = (size: PressSize): string =>
  size === 'card' ? CARD_PRESS_DROP : size === 'big' ? '2px' : '1px';

/** Which physical family the surface belongs to (56 px button / 44 px key / hex / hand card). */
export const pressSize = (el: PressLike | null): PressSize => {
  if (!el) return 'key';
  if (el.closest('#board')) return 'hex';
  if (el.closest('#hand .card, .card')) return 'card';
  if (el.closest('.btn.big')) return 'big';
  return 'key';
};

/** A short move is still a tap; this is the one drag threshold. */
export const dragExceeded = (x0: number, y0: number, x: number, y: number, threshold = PRESS_DRAG_PX): boolean =>
  Math.hypot(x - x0, y - y0) > threshold;

export const isPressKey = (key: string): boolean => key === ' ' || key === 'Spacebar' || key === 'Enter';

export type PressOptions = {
  /**
   * Defaults to the window: its capture listeners run BEFORE the document's, so a surface that a
   * later capture listener vetoes (a lesson's lit target during an explanation) still paints its
   * press. Painting state is never a game action, so being first is safe. Tests can pass any root.
   */
  root?: Document | Window;
  now?: () => number;
  latency?: (ms: number) => void;
};

const paint = (el: PressLike, surface: 'key' | 'plain') => {
  const size = pressSize(el);
  el.setAttribute('data-pressed', 'true');
  el.setAttribute('data-press-surface', surface);
  el.setAttribute('data-press-size', size);
  el.style.setProperty('--press-depth', pressDepth(surface));
  el.style.setProperty('--press-drop', pressDrop(size));
  addShade(el);
};

/** The pre-baked shadow layer: it lives in the surface and only its opacity ever animates. */
const SHADE = 'press-shade';
/** A void element cannot hold a layer; an SVG paints its own tone (see #board in style.css). */
const VOID_HOSTS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'IMG', 'SVG', 'HR', 'BR']);
const addShade = (el: PressLike) => {
  if (typeof document === 'undefined' || typeof HTMLElement === 'undefined') return;
  const host = el as unknown as HTMLElement;
  if (!(host instanceof HTMLElement)) return;
  if (VOID_HOSTS.has(host.tagName)) return;
  if (host.querySelector(`:scope > .${SHADE}`)) return;
  const shade = host.ownerDocument.createElement('span');
  shade.className = SHADE;
  shade.setAttribute('aria-hidden', 'true');
  host.append(shade);
};

const unpaint = (el: PressLike) => {
  el.removeAttribute('data-pressed');
  el.removeAttribute('data-press-surface');
  el.removeAttribute('data-press-size');
  el.style.removeProperty('--press-depth');
  el.style.removeProperty('--press-drop');
};

/**
 * Install the delegated primitive. Returns an uninstall function (used by tests/teardown only).
 * Every listener is capture + passive; no handler mutates the event.
 */
export const installPress = (options: PressOptions = {}): (() => void) => {
  if (typeof document === 'undefined' && !options.root) return () => undefined;
  const root: Document | Window = options.root ?? (typeof window !== 'undefined' ? window : document);
  const now = options.now ?? (() => performance.now());
  const latency = options.latency ?? recordPressLatency;

  let pointer: { id: number; x: number; y: number; el: PressLike; cancelled: boolean; onLeave: (event: PointerEvent) => void } | null = null;
  let keyboard: { el: PressLike; key: string } | null = null;

  const clearPointer = (visualOnly = false) => {
    if (pointer) {
      pointer.el.removeEventListener?.('pointerleave', pointer.onLeave);
      unpaint(pointer.el);
    }
    if (!visualOnly) pointer = null;
  };
  const clearKeyboard = () => {
    if (keyboard) unpaint(keyboard.el);
    keyboard = null;
  };
  const clearAll = () => {
    clearPointer();
    clearKeyboard();
  };

  const resolve = (target: EventTarget | null): PressLike | null => {
    const node = target instanceof Element ? target : null;
    const el = asPressLike(node?.closest(PRESS_SELECTOR) ?? null);
    return shouldSkipPress(el) ? null : el;
  };

  const measure = (timeStamp: number): number => Math.max(0, now() - timeStamp);

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // A new pointer cancels whatever the previous one was showing.
    clearAll();
    const el = resolve(e.target);
    if (!el) return;
    const onLeave = (event: PointerEvent) => {
      if (!pointer || pointer.el !== el) return;
      // A breathing/pulsing surface can slip out from under a perfectly still finger; that is
      // not the player leaving. Only a pointer that actually moved clears the press.
      if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 2) return;
      pointer.cancelled = true;
      unpaint(el);
    };
    el.addEventListener?.('pointerleave', onLeave, { passive: true });
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, el, cancelled: false, onLeave };
    paint(el, pressSurface(el));
    latency(measure(e.timeStamp));
  };

  const onMove = (e: PointerEvent) => {
    if (!pointer || pointer.id !== e.pointerId || pointer.cancelled) return;
    if (!dragExceeded(pointer.x, pointer.y, e.clientX, e.clientY)) return;
    pointer.cancelled = true;
    unpaint(pointer.el);
  };

  const onUp = (e: PointerEvent) => {
    if (!pointer || pointer.id !== e.pointerId) return;
    clearPointer();
  };

  const onCancel = (e: PointerEvent) => {
    if (!pointer || pointer.id !== e.pointerId) return;
    clearPointer();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!isPressKey(e.key) || e.repeat) return;
    const el = resolve(e.target);
    if (!el) return;
    clearAll();
    keyboard = { el, key: e.key === 'Enter' ? 'Enter' : ' ' };
    paint(el, pressSurface(el));
    latency(measure(e.timeStamp));
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (!keyboard || !isPressKey(e.key)) return;
    if (e.key === 'Enter' && keyboard.key !== 'Enter') return;
    if (e.key !== 'Enter' && keyboard.key === 'Enter') return;
    clearKeyboard();
  };

  const onBlur = (event: Event) => {
    // `blur` does not bubble, but a capture listener sees an ELEMENT losing focus too. Only the
    // window losing focus (app switch, OS dialog) clears the press.
    if (event.target !== window) return;
    clearAll();
  };
  const onVisibility = () => {
    if (typeof document !== 'undefined' && document.hidden) clearAll();
  };

  root.addEventListener('pointerdown', onDown as EventListener, { capture: true, passive: true });
  root.addEventListener('pointermove', onMove as EventListener, { capture: true, passive: true });
  root.addEventListener('pointerup', onUp as EventListener, { capture: true, passive: true });
  root.addEventListener('pointercancel', onCancel as EventListener, { capture: true, passive: true });
  root.addEventListener('keydown', onKeyDown as EventListener, { capture: true, passive: true });
  root.addEventListener('keyup', onKeyUp as EventListener, { capture: true, passive: true });
  root.addEventListener('visibilitychange', onVisibility, { passive: true });
  if (typeof window !== 'undefined') window.addEventListener('blur', onBlur, { capture: true, passive: true });

  return () => {
    root.removeEventListener('pointerdown', onDown as EventListener, { capture: true });
    root.removeEventListener('pointermove', onMove as EventListener, { capture: true });
    root.removeEventListener('pointerup', onUp as EventListener, { capture: true });
    root.removeEventListener('pointercancel', onCancel as EventListener, { capture: true });
    root.removeEventListener('keydown', onKeyDown as EventListener, { capture: true });
    root.removeEventListener('keyup', onKeyUp as EventListener, { capture: true });
    root.removeEventListener('visibilitychange', onVisibility);
    if (typeof window !== 'undefined') window.removeEventListener('blur', onBlur, { capture: true });
    clearAll();
  };
};
