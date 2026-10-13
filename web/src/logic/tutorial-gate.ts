// Hard input lock for the FUTASAKU tutorial. Outside the current target and the
// glass window buttons, every pointer/keyboard event is swallowed. Pure helpers
// stay testable; DOM wiring lives in mountTutorialGate.
import type { TutorialLesson } from './tutorial-script.js';

export type GateMode = 'step' | 'busy' | 'off';

export type GateAllow = {
  /** CSS selectors that may receive input. */
  selectors: readonly string[];
  /** When true, only glass window controls are allowed (Previous / Next / Exit). */
  windowOnly?: boolean;
};

/** Regions that become inert while a step runs (everything except the glass).
 *  #scrim stays live so the pause menu can open/close during tutorial. */
export const GATE_INERT_ROOTS = Object.freeze([
  '#game', '#menu', '#levels',
] as const);

/** Controls that always stay reachable inside the glass window. */
export const GATE_WINDOW_SELECTORS = Object.freeze([
  '#futasaku-glass .glass-head button',
  '#futasaku-glass .glass-actions button',
  '#futasaku-glass [data-tut]',
] as const);

/** Dead chrome the player must never reach mid-step. Never include #hud-menu. */
export const GATE_BLOCKED_SELECTORS = Object.freeze([
  '#hud-history', '#menu-settings',
  '#tool-undo', '#hand-sort', '#deck', '#discard',
  '#tool-weak', '#tool-targets', '#tool-replay', '#futa04-help-button',
] as const);

/** Always reachable while tutorial is gated (exit lives in the pause menu). */
export const GATE_MENU_SELECTORS = Object.freeze([
  '#hud-menu',
] as const);

/** Guard: menu must never appear in the blocked list. */
if ((GATE_BLOCKED_SELECTORS as readonly string[]).includes('#hud-menu')) {
  throw new Error('#hud-menu must stay reachable during tutorial');
}

/** Pause sheets opened from the menu during tutorial. */
export const GATE_SHEET_SELECTORS = Object.freeze([
  '#scrim',
  '#sheet-menu', '#sheet-menu button', '#sheet-menu [data-close]',
  '#sheet-howto', '#sheet-howto button', '#sheet-howto [data-close]', '#sheet-howto .link',
  '#sheet-settings', '#sheet-settings button', '#sheet-settings [data-close]',
  '#sheet-settings input', '#sheet-settings label', '#sheet-settings select',
  '#sheet-history', '#sheet-history button', '#sheet-history [data-close]',
] as const);

/** What moves a Next step on: the glass NEXT and the cockpit's » (its #moves source). */
export const GATE_NEXT_SELECTORS = Object.freeze([
  '#futasaku-glass [data-tut="next"]', '#smart-context', '#moves .tutorial-next',
] as const);

export const allowedSelectorsForLesson = (
  lesson: TutorialLesson | null,
  targetSelector: string,
  mode: GateMode,
): GateAllow => {
  if (mode === 'off') return { selectors: [] as string[] };
  if (mode === 'busy' || !lesson) {
    return {
      selectors: [...GATE_WINDOW_SELECTORS, ...GATE_MENU_SELECTORS] as string[],
      windowOnly: true,
    };
  }
  // Next steps: the glass NEXT, and the cockpit's » (it mirrors #moves .tutorial-next). A tap
  // anywhere else is blocked here and still counts as Next (main.ts onBlockedTap).
  if (lesson.focus === 'explainer') {
    return {
      selectors: [...GATE_WINDOW_SELECTORS, ...GATE_MENU_SELECTORS, ...GATE_NEXT_SELECTORS] as string[],
    };
  }
  // Look-and-tap Next steps (homes, buttons): glow the named target; tapping it advances.
  if (lesson.action === 'Next' && targetSelector) {
    return {
      selectors: [...GATE_WINDOW_SELECTORS, ...GATE_MENU_SELECTORS, targetSelector, ...GATE_NEXT_SELECTORS] as string[],
    };
  }
  if (lesson.action === 'Next') {
    return {
      selectors: [...GATE_WINDOW_SELECTORS, ...GATE_MENU_SELECTORS, ...GATE_NEXT_SELECTORS] as string[],
    };
  }
  // Free play clears the gate in main (everything open). Keep menu listed for audits.
  if (lesson.action === 'FreeTurn') {
    return { selectors: [...GATE_MENU_SELECTORS] as string[] };
  }
  if (lesson.focus === 'none') {
    return {
      selectors: [...GATE_WINDOW_SELECTORS, ...GATE_MENU_SELECTORS] as string[],
      windowOnly: true,
    };
  }
  const selectors: string[] = [...GATE_WINDOW_SELECTORS, ...GATE_MENU_SELECTORS];
  // Keep the target as one selector — never split on commas (hex keys use "q,r").
  if (targetSelector) selectors.push(targetSelector);
  // Whole-hand grow step: any card in the fan.
  if (lesson.focus === 'hand') selectors.push('#hand .card', '#hand');
  // Card→tile grow: allow the named card while the tile is the glow target.
  if (lesson.focus === 'tile' && lesson.card) selectors.push('#hand .card');
  // End Grow / Skip: smart-context mirrors #moves .end — allow both.
  if (lesson.action === 'EndAct') {
    selectors.push('#smart-context', '#moves .end', '#moves .futa04-skip', '#moves .skip');
  }
  // Bloom / Blast: button, recipe menu, paint hexes, and paint helpers.
  if (lesson.action === 'Bloom' || lesson.action === 'MegaBomb') {
    selectors.push(
      '#smart-bloom', '#smart-bloom-button', '#smart-bloom-selector', '#smart-bloom-selector button',
      '#moves button[data-kind]', '#moves .bloom-toggle', '#moves .bloom-options', '#moves .bloom-options button',
      '#moves .draw-clear', '#moves .draw-reverse',
      '#board', '#board-wrap', '#board .hex-cell', '#board .hex-cell.target', '#board .target', '#board .ghost',
    );
  }
  // Throw: any hand card + discard pile (look / drag target only — no Draw from it).
  if (lesson.action === 'Discard') {
    selectors.push('#hand .card', '#hand', '#discard');
  }
  // Bomb / strengthen / cut: card then tile.
  if (lesson.action === 'PlayFruit' || (lesson.action === 'Sprout' && lesson.focus === 'tile')) {
    selectors.push('#hand .card', '#hand', '#board .hex-cell');
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
  /** Every blocked tap (pointerup), unthrottled: explanation steps treat a tap anywhere as Next. */
  onBlockedTap?: () => void;
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
    // Allow Escape to close pause sheets / cancel as usual.
    const keyEvent = event as { key?: string };
    if (typeof keyEvent.key === 'string' && keyEvent.key === 'Escape') return;
    const target = event.target;
    if (isAllowedElement(target, allow)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (event.type === 'pointerup') hooks.onBlockedTap?.();
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
