// Hard input lock for the FUTASAKU tutorial. Outside the current target and the
// glass window buttons, every pointer/keyboard event is swallowed. Pure helpers
// stay testable; DOM wiring lives in mountTutorialGate.
import type { TutorialLesson } from './tutorial-script.js';

export type GateMode = 'step' | 'busy' | 'off';

export type GateAllow = {
  /** CSS selectors that may receive input. */
  selectors: readonly string[];
  /** When true, only glass window controls are allowed (Skip / Chapters / Exit). */
  windowOnly?: boolean;
};

/** Regions that become inert while a step runs (everything except the glass). */
export const GATE_INERT_ROOTS = Object.freeze([
  '#game', '#menu', '#levels', '#scrim',
] as const);

/** Controls that always stay reachable inside the glass window. */
export const GATE_WINDOW_SELECTORS = Object.freeze([
  '#futasaku-glass .glass-actions button',
  '#futasaku-glass [data-tut]',
  '#tutorial-chapter-menu',
  '#tutorial-chapter-menu button',
] as const);

/** Dead chrome the player must never reach mid-step. */
export const GATE_BLOCKED_SELECTORS = Object.freeze([
  '#hud-menu', '#hud-history', '#menu-settings', '#hint-btn',
  '#tool-undo', '#hand-sort', '#deck', '#discard',
  '#tool-weak', '#tool-targets', '#tool-replay', '#futa04-help-button',
] as const);

export const allowedSelectorsForLesson = (
  lesson: TutorialLesson | null,
  targetSelector: string,
  mode: GateMode,
): GateAllow => {
  if (mode === 'off') return { selectors: [] };
  if (mode === 'busy' || !lesson) {
    return { selectors: [...GATE_WINDOW_SELECTORS], windowOnly: true };
  }
  if (lesson.action === 'Next' || lesson.focus === 'explainer') {
    return {
      selectors: [...GATE_WINDOW_SELECTORS, '#futasaku-glass [data-tut="next"]'],
    };
  }
  if (lesson.action === 'FreeTurn' || lesson.focus === 'none') {
    return { selectors: [...GATE_WINDOW_SELECTORS], windowOnly: true };
  }
  const selectors = [...GATE_WINDOW_SELECTORS];
  if (targetSelector) selectors.push(targetSelector);
  // Bloom paint: allow the bloom button and every receptive hex while painting.
  if (lesson.action === 'Bloom' || lesson.action === 'MegaBomb') {
    selectors.push('#smart-bloom-button', '#board .hex-cell.target', '#board .target', '#board .ghost');
  }
  return { selectors: [...new Set(selectors)] };
};

/** Hit-test: is this element (or an ancestor) inside an allowed selector? */
type ClosestEl = { closest: (sel: string) => unknown; contains?: (other: unknown) => boolean };

export const isAllowedElement = (
  element: EventTarget | null,
  allow: GateAllow,
  root: { querySelectorAll?: (sel: string) => ArrayLike<unknown> } | null =
    typeof document !== 'undefined' ? document : null,
): boolean => {
  const el = element as ClosestEl | null;
  if (!el || typeof el.closest !== 'function') return false;
  for (const selector of allow.selectors) {
    try {
      if (el.closest(selector)) return true;
      const nodes = root?.querySelectorAll?.(selector);
      if (nodes) {
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i] as ClosestEl;
          if (node === el || node.contains?.(el)) return true;
        }
      }
    } catch { /* bad selector */ }
  }
  return false;
};

export type TutorialGate = {
  set: (allow: GateAllow, mode: GateMode) => void;
  clear: () => void;
  isActive: () => boolean;
  mode: () => GateMode;
  allow: () => GateAllow;
  /** Test hook: run the capture decision without dispatching. */
  wouldBlock: (target: EventTarget | null) => boolean;
};

const CAPTURE_EVENTS = [
  'pointerdown', 'pointerup', 'click', 'touchstart', 'touchmove',
  'dblclick', 'contextmenu', 'wheel', 'keydown', 'keyup',
] as const;

export const mountTutorialGate = (hooks: {
  onBlocked: () => void;
  /** Return false while a bloom paint drag is active so pointermove stays free. */
  isPaintDragging?: () => boolean;
}): TutorialGate => {
  let mode: GateMode = 'off';
  let allow: GateAllow = { selectors: [] };
  let lastBlockAt = 0;
  const inerted = new Set<HTMLElement>();

  const applyInert = (on: boolean) => {
    for (const el of inerted) {
      el.removeAttribute('inert');
      el.removeAttribute('aria-disabled');
    }
    inerted.clear();
    if (!on || mode === 'off') return;
    for (const selector of GATE_INERT_ROOTS) {
      const root = document.querySelector(selector);
      if (!root || typeof (root as HTMLElement).setAttribute !== 'function') continue;
      // Capture gate handles #game (inert would also block the live target).
      if (selector === '#game') continue;
      const el = root as HTMLElement;
      el.setAttribute('inert', '');
      el.setAttribute('aria-disabled', 'true');
      inerted.add(el);
    }
  };

  const onCapture = (event: Event) => {
    if (mode === 'off') return;
    if (hooks.isPaintDragging?.() && (event.type === 'pointermove' || event.type === 'touchmove' || event.type === 'pointerup')) {
      return;
    }
    // Allow Escape to still reach the window for Exit.
    const keyEvent = event as { key?: string };
    if (typeof keyEvent.key === 'string' && keyEvent.key === 'Escape') return;
    const target = event.target;
    if (isAllowedElement(target, allow)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const now = performance.now();
    if (now - lastBlockAt >= 400) {
      lastBlockAt = now;
      hooks.onBlocked();
    }
  };

  const attach = () => {
    for (const name of CAPTURE_EVENTS) {
      document.addEventListener(name, onCapture, { capture: true, passive: false });
    }
  };
  const detach = () => {
    for (const name of CAPTURE_EVENTS) {
      document.removeEventListener(name, onCapture, { capture: true } as EventListenerOptions);
    }
  };

  let attached = false;

  const set = (next: GateAllow, nextMode: GateMode) => {
    allow = next;
    mode = nextMode;
    if (mode === 'off') {
      if (attached) { detach(); attached = false; }
      applyInert(false);
      return;
    }
    if (!attached) { attach(); attached = true; }
    applyInert(true);
  };

  const clear = () => set({ selectors: [] }, 'off');

  return {
    set,
    clear,
    isActive: () => mode !== 'off',
    mode: () => mode,
    allow: () => allow,
    wouldBlock: (target) => mode !== 'off' && !isAllowedElement(target, allow),
  };
};
