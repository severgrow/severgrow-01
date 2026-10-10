// The pointer drag layer: an extra way to make the moves taps already make. It owns the
// pointer (Pointer Events only), a ghost that follows the finger, the four hover looks and
// the short haptic tick. It never decides legality: `logic/drag.ts` reads the engine's legal
// actions and this file only plays the exact action it returns. Taps, buttons and the
// existing board painting are untouched.
import type { Action, View } from '../../../src/engine/index.js';
import type { Sel } from '../logic/interaction.js';
import { DRAG_THRESHOLD_PX, resolveDrag } from '../logic/drag.js';
import type { DragHover, DragLedWord, DragResolution, DragSource } from '../logic/drag.js';

export type DragLayerHooks = {
  /** True only when a drag may start at all (my turn, not busy, a game on screen). */
  canDrag: () => boolean;
  view: () => View | null;
  legal: () => readonly Action[];
  sel: () => Sel;
  /** The board hex under a client point (the board's own hit testing). */
  keyAt: (clientX: number, clientY: number) => string | null;
  /** A hex's centre on screen, for the small snap toward it. */
  pointOf: (key: string) => { x: number; y: number } | null;
  overDiscardPile: (clientX: number, clientY: number) => boolean;
  upperBoard: (clientY: number) => boolean;
  /** Plays a legal action the same way the tap path would. */
  commit: (action: Action) => void;
  /** No group chosen: open the existing Bloom choices for this card. */
  openBloom: (cardId: number, key: string) => void;
  /** Show a word on the cockpit sign, or null to clear it. */
  led: (word: DragLedWord | null) => void;
  /** Mirror a Bloom drag's shape into the board's existing paint ghost (empty clears it). */
  onShape?: (shape: readonly string[]) => void;
  /** Show the dragged hand card's legal hexes on the board without changing the tap selection. */
  onCardFocus?: (cardId: number | null) => void;
  /** The legal hex the finger is over (for the board's selected cue), or null. */
  onHoverKey?: (key: string | null) => void;
  /** A drag began (measure once here) or ended (drop any cached measurement). */
  onDragBegin?: () => void;
  onDragEnd?: () => void;
  /** One light tick when the pointer first enters a legal target. */
  onEnterTarget: () => void;
  reducedMotion: () => boolean;
  /** Returns a cancelled ghost to its source. */
  flyBack: (from: HTMLElement, to: HTMLElement) => void;
};

const DRAG_CSS = `
/* The drag sources take the touch gesture themselves, so a drag is never stolen by a
   scroll (the game screen scrolls). Only the hand and the two piles: the rest of the
   page keeps its normal scrolling and pinch-zoom. */
#hand .card, #deck, #discard { touch-action: none; }
.drag-ghost {
  position: fixed; left: 0; top: 0; margin: 0; padding: 0; z-index: 90;
  pointer-events: none; touch-action: none; will-change: transform;
  transform-origin: 50% 55%; opacity: .96;
  box-shadow: 0 10px 22px rgba(0,0,0,.42);
}
.drag-source-dim { opacity: .45 !important; }
/* The source keeps its dim through a re-render: the attribute is not touched by renderHand. */
#hand .card[data-drag-dim], #deck[data-drag-dim], #discard[data-drag-dim] { opacity: .45 !important; }
/* The four visible states: opacity, a 1px ring and the LED word. No new colours. */
.drag-ghost.drag-legal { opacity: 1; box-shadow: 0 10px 22px rgba(0,0,0,.42), 0 0 0 1px currentColor; }
.drag-ghost.drag-illegal { opacity: .6; }
.drag-ghost.drag-pile { opacity: 1; box-shadow: 0 10px 22px rgba(0,0,0,.42), 0 0 0 1px currentColor; }
.drag-ghost.drag-flick { opacity: .92; box-shadow: 0 10px 22px rgba(0,0,0,.42), 0 0 0 1px currentColor; }
/* A faint downward chevron (draw/place/pile) or upward chevron (flick): direction only. */
.drag-ghost .drag-chevron {
  position: absolute; left: 50%; bottom: -13px; width: 12px; height: 10px;
  transform: translateX(-50%); opacity: .55; pointer-events: none;
  background: currentColor; clip-path: polygon(0 0,100% 0,50% 100%);
}
.drag-ghost.drag-flick .drag-chevron { top: -13px; bottom: auto; clip-path: polygon(50% 0,100% 100%,0 100%); opacity: .8; }
.drag-ghost.drag-legal .drag-chevron, .drag-ghost.drag-pile .drag-chevron { opacity: .9; }
/* The pile a draw or throw is aimed at catches a 1px ring (existing currentColor only). */
#deck.drag-target, #discard.drag-target { outline: 1px solid currentColor; outline-offset: 2px; }
`;

type Active = {
  pointerId: number;
  source: DragSource;
  sourceEl: HTMLElement;
  faceEl: HTMLElement;
  startX: number;
  startY: number;
  x: number;
  y: number;
  time: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  shape: string[];
  started: boolean; // past the threshold
  resolution: DragResolution;
  led: DragLedWord | null;
  shapeKey: string;
  hoverKey: string | null;
  hover: DragHover;
  pileEl: HTMLElement | null;
};

const INACTIVE: DragResolution = {
  active: false, mode: 'none', commit: null, hoverKey: null, hover: 'none',
  shape: [], openOptions: false, led: null,
};

/** Installs the drag listeners once; the page calls `attach*` when its elements exist. */
export function mountDragLayer(hooks: DragLayerHooks) {
  const style = document.createElement('style');
  style.id = 'drag-layer-style';
  style.textContent = DRAG_CSS;
  document.head.append(style);

  let active: Active | null = null;
  let ghost: HTMLElement | null = null;
  let gx = 0;
  let gy = 0;
  let tx = 0;
  let ty = 0;
  let raf = 0;
  let lastTick = 0;
  /** Clicks are swallowed for a short window after a drag (touch clicks can arrive late). */
  let suppressUntil = 0;
  let suppressTimer = 0;
  let deckEl: HTMLElement | null = null;
  let discardEl: HTMLElement | null = null;

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const reduced = () => hooks.reducedMotion();

  const armClickGuard = () => {
    suppressUntil = performance.now() + 600;
    window.clearTimeout(suppressTimer);
    suppressTimer = window.setTimeout(() => (suppressUntil = 0), 620);
  };

  const stopGhost = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastTick = 0;
    ghost?.remove();
    ghost = null;
  };

  const faceOf = (el: HTMLElement): HTMLElement => {
    if (el.classList.contains('card')) return el;
    return el.querySelector<HTMLElement>('.pile-top') ?? el.querySelector<HTMLElement>('.pile-card') ?? el;
  };

  const buildGhost = (a: Active) => {
    const g = document.createElement('div');
    const cls = a.faceEl.classList.contains('card') ? a.faceEl.className : 'card';
    g.className = `drag-ghost ${cls}`;
    g.innerHTML = a.faceEl.innerHTML;
    const r = a.faceEl.getBoundingClientRect();
    const w = Math.max(8, r.width);
    const h = Math.max(8, r.height);
    g.style.width = `${w}px`;
    g.style.height = `${h}px`;
    const chev = document.createElement('span');
    chev.className = 'drag-chevron';
    g.append(chev);
    document.body.append(g);
    ghost = g;
    gx = tx = a.x - w / 2;
    gy = ty = a.y - h * 0.8;
    a.sourceEl.classList.add('drag-source-dim');
    a.sourceEl.setAttribute('data-drag-dim', '');
  };

  const applyHover = (hover: DragHover) => {
    if (!ghost) return;
    ghost.classList.toggle('drag-legal', hover === 'legal' || hover === 'pile' || hover === 'flick');
    ghost.classList.toggle('drag-illegal', hover === 'illegal');
    ghost.classList.toggle('drag-pile', hover === 'pile');
    ghost.classList.toggle('drag-flick', hover === 'flick');
  };

  const setLed = (a: Active, word: DragLedWord | null) => {
    if (a.led === word) return;
    a.led = word;
    hooks.led(word);
  };

  const tick = (now: number) => {
    raf = 0;
    if (!ghost || !active) return;
    // Frame-rate independent easing: ~160ms to settle (EASE.out quick).
    const dt = lastTick ? Math.min(64, now - lastTick) : 16;
    lastTick = now;
    const k = reduced() ? 1 : 1 - Math.exp(-dt / 42);
    gx += (tx - gx) * k;
    gy += (ty - gy) * k;
    const tilt = reduced() ? 0 : clamp((tx - gx) * 0.4, -9, 9);
    ghost.style.transform = `translate(${gx.toFixed(1)}px, ${gy.toFixed(1)}px) rotate(${tilt.toFixed(2)}deg)`;
    if (Math.abs(tx - gx) > 0.2 || Math.abs(ty - gy) > 0.2) raf = requestAnimationFrame(tick);
  };

  const scheduleTick = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const updateTargets = (a: Active) => {
    const view = hooks.view();
    if (!view) return finish(false);
    const d = Math.hypot(a.x - a.startX, a.y - a.startY);
    if (!a.started && d >= DRAG_THRESHOLD_PX) {
      a.started = true;
      armClickGuard();
      buildGhost(a);
      hooks.onDragBegin?.();
      if (a.source.kind === 'hand') hooks.onCardFocus?.(a.source.cardId);
    }
    if (!a.started || !ghost) return;
    const dt = Math.max(1, a.time - a.lastTime);
    const upSpeed = Math.max(0, (a.lastY - a.y) / dt);
    const res = resolveDrag({
      view,
      legal: hooks.legal(),
      sel: hooks.sel(),
      source: a.source,
      distance: d,
      boardKey: hooks.keyAt(a.x, a.y),
      overDiscardPile: hooks.overDiscardPile(a.x, a.y),
      shape: a.shape,
      upSpeed,
      upperBoard: hooks.upperBoard(a.y),
    });
    a.shape = res.shape;
    const wasLegal = a.resolution.hover !== 'none' && a.resolution.hover !== 'illegal';
    const isLegal = res.hover !== 'none' && res.hover !== 'illegal';
    a.resolution = res;
    applyHover(res.hover);
    setLed(a, res.led);
    // The pile a draw or throw aims at catches a ring.
    const pileEl = res.mode === 'draw-deck' ? deckEl
      : res.mode === 'draw-discard' || res.mode === 'discard' || res.mode === 'flick' ? discardEl
      : null;
    if (pileEl !== a.pileEl) {
      a.pileEl?.classList.remove('drag-target');
      pileEl?.classList.add('drag-target');
      a.pileEl = pileEl;
    }
    // The board's selected cue follows the legal hex under the finger (not the tap selection).
    const hoverKey = res.hover === 'legal' && res.mode !== 'bloom' ? res.hoverKey : null;
    if (hoverKey !== a.hoverKey) {
      a.hoverKey = hoverKey;
      hooks.onHoverKey?.(hoverKey);
    }
    const shapeKey = res.mode === 'bloom' ? res.shape.join('|') : '';
    if (shapeKey !== a.shapeKey) {
      a.shapeKey = shapeKey;
      hooks.onShape?.(res.mode === 'bloom' ? res.shape : []);
    }
    if (isLegal && !wasLegal) hooks.onEnterTarget();
    // The ghost follows the finger, with a small snap toward a legal hex centre.
    let targetX = a.x;
    let targetY = a.y;
    if (res.hover === 'legal' && res.hoverKey) {
      const p = hooks.pointOf(res.hoverKey);
      if (p) {
        const dx = p.x - a.x;
        const dy = p.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        targetX += (dx / len) * 8;
        targetY += (dy / len) * 8;
      }
    }
    const r = ghost.getBoundingClientRect();
    tx = targetX - r.width / 2;
    ty = targetY - r.height * 0.8;
    if (reduced()) {
      gx = tx;
      gy = ty;
      ghost.style.transform = `translate(${gx.toFixed(1)}px, ${gy.toFixed(1)}px)`;
      return;
    }
    scheduleTick();
  };

  const finish = (commit: boolean) => {
    const a = active;
    if (!a) return;
    active = null;
    a.sourceEl.classList.remove('drag-source-dim');
    a.sourceEl.removeAttribute('data-drag-dim');
    const res = a.resolution;
    const from = ghost;
    setLed(a, null);
    a.pileEl?.classList.remove('drag-target');
    a.pileEl = null;
    if (a.hoverKey) hooks.onHoverKey?.(null);
    if (a.source.kind === 'hand' && a.started) hooks.onCardFocus?.(null);
    if (!a.started) {
      stopGhost();
      return;
    }
    if (a.shapeKey) hooks.onShape?.([]);
    armClickGuard();
    hooks.onDragEnd?.();
    if (commit) {
      if (res.commit) hooks.commit(res.commit);
      else if (res.openOptions && res.hoverKey && a.source.kind === 'hand') hooks.openBloom(a.source.cardId, res.hoverKey);
      else if (from) hooks.flyBack(from, a.sourceEl);
    } else if (from) {
      hooks.flyBack(from, a.sourceEl);
    }
    stopGhost();
  };

  const onMove = (event: PointerEvent) => {
    if (!active || event.pointerId !== active.pointerId) return;
    active.lastX = active.x;
    active.lastY = active.y;
    active.lastTime = active.time;
    active.x = event.clientX;
    active.y = event.clientY;
    active.time = event.timeStamp || performance.now();
    updateTargets(active);
  };
  const onUp = (event: PointerEvent) => {
    if (!active || event.pointerId !== active.pointerId) return;
    finish(true);
  };
  const onCancel = (event: PointerEvent) => {
    if (!active || event.pointerId !== active.pointerId) return;
    finish(false);
  };
  const abort = () => {
    if (active) finish(false);
  };

  document.addEventListener('pointermove', onMove, true);
  document.addEventListener('pointerup', onUp, true);
  document.addEventListener('pointercancel', onCancel, true);
  // A drag must never stick: leaving the page (alt-tab, a call) cancels it cleanly.
  window.addEventListener('blur', abort);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) abort();
  });
  document.addEventListener(
    'click',
    (event) => {
      if (performance.now() >= suppressUntil) return;
      // Only swallow the synthetic click that lands back on the hand or a pile after a drag.
      // Any other click (Confirm, menu, board tools) must keep working normally.
      const target = (event.target as Element | null)?.closest?.('#hand, #deck, #discard');
      if (!target) return;
      suppressUntil = 0;
      event.stopPropagation();
      event.preventDefault();
    },
    true,
  );

  const begin = (event: PointerEvent, source: DragSource, el: HTMLElement): void => {
    if (active || event.button === 2) return; // one drag at a time; a second finger does nothing
    if (!hooks.canDrag() || !hooks.view()) return;
    active = {
      pointerId: event.pointerId,
      source,
      sourceEl: el,
      faceEl: faceOf(el),
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp || performance.now(),
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: event.timeStamp || performance.now(),
      shape: [],
      started: false,
      resolution: INACTIVE,
      led: null,
      shapeKey: '',
      hoverKey: null,
      hover: 'none',
      pileEl: null,
    };
    try {
      el.setPointerCapture?.(event.pointerId);
    } catch {
      /* capture is best-effort; the pointer still reaches us */
    }
  };

  return {
    /** Hand cards: delegated, so a re-render never leaves a stale listener behind. */
    attachHand(hand: HTMLElement) {
      hand.addEventListener('pointerdown', (event) => {
        const card = (event.target as HTMLElement | null)?.closest<HTMLElement>('#hand [data-card]');
        if (!card) return;
        const id = Number(card.dataset.card);
        if (!Number.isFinite(id)) return;
        begin(event, { kind: 'hand', cardId: id }, card);
      });
    },
    attachDeck(deck: HTMLElement) {
      deckEl = deck;
      deck.addEventListener('pointerdown', (event) => begin(event, { kind: 'deck' }, deck));
    },
    attachDiscard(discard: HTMLElement) {
      discardEl = discard;
      discard.addEventListener('pointerdown', (event) => begin(event, { kind: 'discard' }, discard));
    },
  };
}
