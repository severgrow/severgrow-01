import { spacePath } from './space-path.js';
// THE SPACE BACKDROP (0.75 polish pass, owner 2026-11-04: "ONE SHARED SPACE BACKGROUND ... behind
// the Play submenu ... and behind the board in game").
//
// The planet's own sky (web/src/sphere/space.ts) without a planet, at the bottom of the page
// background (#texture), below every screen: behind the Play submenu, the game, and the menu until its
// planet is drawing. The stars carry on from the planet's own offset (no cut between menu and game).
//
// WHAT IT COSTS, AND WHY IT IS BUILT THIS WAY (measured, docs/DECISIONS.md "Space backdrop cost"):
// redrawing the shader every frame behind an idle game, even at 10 frames a second, multiplied the
// main thread's idle work ~45x on the 4x-CPU phone probe and stuttered a move (p95 33 -> 208 ms). So
// the shader draws each star layer ONCE, onto a canvas a little larger than the screen, and the
// compositor slides the cached sky (one combined layer in game, two parallax layers in menus at the
// menu pace). Every SLIDE_MS the layers are redrawn exactly one slide further on and the slide restarts,
// so nothing jumps. Between redraws: no frames asked for, no main-thread work.
//
// The sky's own colour is the page background beneath (html.space-backdrop), and the film grain is the
// app's one grain above everything. Reduce motion = still stars. A hidden tab pauses the slide.
import { interfaceMotionAllowed } from '../ui/interface-motion.js';
import { DRIFT_PX_PER_MS, DRIFT_Y_SHARE, onSpaceClaim, onSpaceFree, spaceDrift, SpaceRenderer } from '../sphere/space.js';

/** One slide of the stars between two redraws (ms): ~20 s at the menu's own pace. */
export const SLIDE_MS = 20_000;
/** The far star layer moves this share of the near one (the shader's own parallax). */
const FAR = .35;

/** The screens the stars show behind (the menu only until its planet is drawing). */
const SCREENS = ['menu', 'play-menu', 'game'] as const;

const CSS = `
#texture:has(> #space-backdrop:not([hidden]):not(.in-game)) { background: #030404; }
/* IN GAME the game's own background stays; the sky (black) and its stars lie over it at 35% (owner,
   2026-11-04: "still use background we have now, put the black and stars on top of existing one with
   like 35% opacity"). */
#space-backdrop.in-game { background-color: #030404; }
#space-backdrop.in-game.lit { opacity: .35; }
#space-backdrop { position: absolute; inset: 0; overflow: hidden; pointer-events: none; opacity: 0; transition: opacity 260ms ease-out; }
#space-backdrop.lit { opacity: 1; }
#space-backdrop[hidden] { display: none; }
#space-backdrop { background: no-repeat 0 0 / 100% 100%; }
#space-backdrop > canvas { position: absolute; left: 0; display: block; }
#space-backdrop > canvas[hidden] { display: none; }
`;

export type SpaceBackdrop = { snapshot: () => { sliding: boolean; redraws: number; visible: boolean } };

let mounted: SpaceBackdrop | null = null;
/**
 * HELD WHILE A MOVE PLAYS (measured: two full-screen layers sliding during a move cost the move ~10
 * fps on the 4x-CPU phone probe). The game holds the stars from the first step of a move to the
 * settled board; between moves, while the player thinks, they slide.
 */
let held = false, onHold: (() => void) | null = null;
export const holdStars = (on: boolean) => { if (held === on) return; held = on; onHold?.(); };
/** The test hook. */
export const spaceBackdrop = () => mounted;

export const mountSpaceBackdrop = (): SpaceBackdrop | null => {
  if (mounted) return mounted;
  const host = document.getElementById('texture');
  if (!host) return null;
  if (!document.getElementById('space-backdrop-css')) {
    const style = document.createElement('style');
    style.id = 'space-backdrop-css';
    style.textContent = CSS;
    document.head.append(style);
  }
  let renderer: SpaceRenderer;
  try { renderer = new SpaceRenderer(document.createElement('canvas')); } catch { return null; }
  const root = document.createElement('div');
  root.id = 'space-backdrop';
  root.setAttribute('aria-hidden', 'true');
  const far = document.createElement('canvas'), near = document.createElement('canvas');
  root.append(far, near);
  host.prepend(root);
  document.documentElement.classList.add('space-backdrop');

  const screens = SCREENS.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
  const planetDrawing = () => spaceDrift.owner === 'planet';
  const seen = () => screens.some((el) => !el.hidden && (el.id !== 'menu' || !planetDrawing()));
  // The near layer's full slide in CSS px (x left, y down); the far one is FAR of it.
  const mx = DRIFT_PX_PER_MS * SLIDE_MS, my = mx * DRIFT_Y_SHARE;
  let anims: Animation[] = [], base = { x: spaceDrift.x, y: spaceDrift.y }, started = 0, redraws = 0, pendingDraw = 0;

  /** Where the stars are right now (the offset a planet taking over must start from). */
  const now = () => {
    if (!anims.length || !started) return base;
    const t = Math.min(1, ((anims[0]?.currentTime as number | null) ?? 0) / SLIDE_MS);
    const p = spacePath(t);
    return { x: base.x + mx * p.x, y: base.y + my * p.y };
  };
  const game = document.getElementById('game');
  let inGame = false;
  const paint = () => {
    const w = innerWidth, h = innerHeight;
    inGame = !!game && !game.hidden; near.hidden = inGame;
    root.style.backgroundImage = '';
    for (const [canvas, share, which] of [[far, FAR, 'far'], [near, 1, 'near']] as const) {
      const driftShare = inGame ? 1 : share;
      const cw = w + mx * driftShare, ch = h + my * driftShare;
      const source = renderer.layer(which, cw, ch, [base.x, base.y]);
      const target = inGame ? far : canvas;
      if (target.width !== source.width || target.height !== source.height) { target.width = source.width; target.height = source.height; }
      target.style.width = `${cw}px`; target.style.height = `${ch}px`; target.style.top = `${-my * driftShare}px`;
      const ctx = target.getContext('2d');
      if (!ctx) continue;
      if (!inGame || which === 'far') ctx.clearRect(0, 0, target.width, target.height);
      ctx.drawImage(source, 0, 0);
    }
    redraws++;
    root.classList.add('lit');
    document.documentElement.classList.add('space-lit');
  };
  const halt = () => {
    if (anims.length) { const at = now(); base = { x: at.x, y: at.y }; }
    for (const a of anims) a.cancel();
    anims = []; started = 0;
    if (pendingDraw) { window.clearTimeout(pendingDraw); pendingDraw = 0; }
  };
  const slideOnce = () => {
    for (const a of anims) a.cancel();
    anims = [];
    if (!interfaceMotionAllowed()) { started = 0; return; }
    anims = [[far, FAR], [near, 1]].map(([canvas, share]) => (canvas as HTMLCanvasElement).animate(
      [0,.25,.5,.75,1].map(t => { const p = spacePath(t); return { offset: t, translate: `${-mx * (inGame ? 1 : share as number) * p.x}px ${my * (inGame ? 1 : share as number) * p.y}px` }; }),
      { duration: SLIDE_MS, easing: 'linear', fill: 'forwards' }));
    started = performance.now();
    if (held) for (const a of anims) a.pause();
    anims[1]!.onfinish = () => {
      // One slide done: the next drawing is exactly one slide further on, so nothing jumps.
      base = { x: base.x + mx, y: base.y + my };
      pendingDraw = window.setTimeout(() => { pendingDraw = 0; if (seen() && !document.hidden) { paint(); slideOnce(); } }, 0);
    };
  };
  let size = '';
  const wake = () => {
    root.classList.toggle('in-game', !!game && !game.hidden);
    const visible = seen();
    root.hidden = !visible;
    if (!visible || document.hidden || renderer.lost) {
      // A hidden tab or another screen: the slide stops where it is and resumes from there.
      if (document.hidden) for (const a of anims) a.pause();
      else halt();
      return;
    }
    const key = `${innerWidth}x${innerHeight}x${devicePixelRatio}`;
    if (key !== size || !redraws || inGame !== (!!game && !game.hidden)) { halt(); size = key; paint(); slideOnce(); return; }
    if (!anims.length) slideOnce();
    else for (const a of anims) { if (held) a.pause(); else if (a.playState === 'paused') a.play(); }
  };
  // The planet takes the sky from where the backdrop's stars are now; when it lets go, the backdrop
  // carries on from where the planet left them.
  spaceDrift.sync = () => { const at = now(); spaceDrift.x = at.x; spaceDrift.y = at.y; };
  onSpaceClaim(() => { halt(); wake(); });
  onSpaceFree(() => { halt(); base = { x: spaceDrift.x, y: spaceDrift.y }; size = ''; wake(); });

  onHold = () => {
    // Pause compositor motion during moves without re-reading layout.
    if (document.hidden) return;
    for (const animation of anims) {
      if (held) animation.pause(); else if (animation.playState === 'paused') animation.play();
    }
  };
  wake();
  const watch = new MutationObserver(wake);
  for (const el of screens) watch.observe(el, { attributes: true, attributeFilter: ['hidden'] });
  addEventListener('resize', wake, { passive: true });
  document.addEventListener('visibilitychange', wake);

  mounted = { snapshot: () => ({ sliding: anims.some((a) => a.playState === 'running'), redraws, visible: !root.hidden }) };
  return mounted;
};
