// Futasaku 0.4 uses the Futa04 presentation; historical channels keep their existing brand.
// This SVG deliberately uses only each mark's alpha (feFuncA below). The browser copies contain
// the exact thresholded silhouettes; the original art stays intact for icon/OG generation.
import logoUrl from '../assets/futasaku-emblem-silhouette.webp?url';
import wordmarkUrl from '../assets/futasaku-wordmark-silhouette.webp?url';
import { bestFit, boardUnits } from '../logic/layout.js';
import type { Layout, Viewport } from '../logic/layout.js';

export const BRANDING_CSS = `
html.futa04-branding.slim-hud .game > .hud {
  position: fixed;
  inset: env(safe-area-inset-top) env(safe-area-inset-right) auto env(safe-area-inset-left);
  width: auto;
  z-index: 7;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  box-sizing: border-box;
  padding: 0 6px;
  gap: 8px;
}
html.futa04-branding .game > #race { display: none !important; }
html.futa04-branding .game { max-width: none; margin: 0; }
/* iOS home-screen apps expose the notch/home insets to the layout code. The
   shared .screen padding would reserve the same insets again, shrinking the
   board and leaving an unused band below the hand. Safari tabs keep it. */
html.futa04-branding.home-screen-app #game { padding: 0; }
/* Reserve the home indicator once, inside the play grid; its background still
   paints to the physical screen edge while the dock stays above the gesture. */
html.futa04-branding.home-screen-app #game > .play { padding-bottom: env(safe-area-inset-bottom); }
html.futa04-branding.home-screen-app,
html.futa04-branding.home-screen-app body { height:var(--futasaku-app-height,100dvh); }
html.futa04-branding.home-screen-app :is(#game,#texture) {
  height:var(--futasaku-app-height,100dvh); bottom:auto;
}
html.futa04-branding .play { --board-margin: 2px; }
html.futa04-branding[data-layout='stack'] .board-wrap {
  margin-left: 2px;
  margin-right: 2px;
}
html.futa04-branding[data-layout='side'] .dock { align-self: end; row-gap: 8px; }
/* The screen already reserves the notch/home-indicator insets. */
html.futa04-branding .dock { padding-bottom: 4px; }
html.futa04-branding[data-thumb] .dock { padding: 0; }
/* THE BADGE (owner, 2026-10-24: "when paused - dont blur the futasaku in top right corner").
   It used to live in the HUD grid. The pause scrim (z 10) and the finish screen (z 12) both carry
   a backdrop-filter of var(--veil), and a backdrop filter blurs everything painted BENEATH it — so
   the badge inside #game was smeared and darkened by a veil it could never escape. The mark is now
   the app's own fixed layer, outside #game and above every veil, at exactly the optical spot it has
   in play: its top meets the menu ink's top (measured in alignBrand, never guessed) and its right
   edge keeps the HUD's 6px lane. Silent, untappable, and above scrim 10 / sheets 11 / finish 12 /
   tutorial 50. */
html.futa04-branding #hud-brand {
  position: fixed;
  top: var(--futasaku-logo-top, 16px);
  right: calc(env(safe-area-inset-right, 0px) + 6px);
  z-index: 74;
  height: var(--futasaku-logo-height, 22px);
  width: auto;
  max-width: 90px;
  display: block;
  opacity: .75;
  pointer-events: none;
  user-select: none;
}
/* ONE mark per screen. The layer stays off until main.ts says which surface owns the screen: the
   main menu keeps the big logo, the finish plate carries its own cap, the online header its own. */
html.futa04-branding:not(.brand-mark) #hud-brand { display: none; }
/* The install invitation (z 13) is a modal whose 20px blur is meant to be the only thing in focus.
   The badge is painted above every veil at z 74, so it must stand down while the invitation is
   open — otherwise the corner mark floats, sharp, over the darkened dialog. The :has selector makes
   that independent of a sync: the invitation can be opened from the page's own flow. */
html.futa04-branding:has(#install-prompt:not([hidden])) #hud-brand { display: none; }
/* The HUD's own key is untouched by the move. */
html.futa04-branding #hud-menu { position: relative; top: 0; }
/* THE FINISH PLATE'S CAP — the SAME mark through the SAME helper, at the same size token, on the
   plate's own axis. The corner badge stands down there (never two marks), so the plate is the
   matching half: the mark the corner would wear is centred over the lockup. */
html.futa04-branding #go-brand {
  display: block;
  height: var(--futasaku-logo-height, 22px);
  width: auto;
  max-width: 90px;
  margin: 0 auto 12px;
  opacity: .8;
  pointer-events: none;
  user-select: none;
}
/* It fades in WITH the plate, on the title's own beat; it never moves, loops or delays a tap. */
html.futa04-branding #gameover[data-fresh='1'] #go-brand {
  animation: go-brand-in var(--ix-open) var(--ix-ease-open) both;
}
@keyframes go-brand-in { from { opacity: 0; } }
.reduce-motion #gameover #go-brand { animation: none !important; }
@media (prefers-reduced-motion: reduce) {
  #gameover #go-brand { animation: none !important; }
}
/* A short phone keeps the mark, a step smaller, so the lockup never has to move for it. */
@media (max-height: 660px) {
  html.futa04-branding #hud-brand,
  html.futa04-branding #go-brand { height: calc(var(--futasaku-logo-height, 22px) * 0.82); }
  html.futa04-branding #go-brand { margin-bottom: 9px; }
}
html.futa04-branding #menu #terrarium { display: none !important; }
html.futa04-branding #menu #logo {
  display: block !important;
  /* Always visible, sized from the room the screen has: full size on a tall phone, a smaller mark
     on a short one. It never disappears — a menu without its logo is not the menu. */
  flex: none;
  width: min(240px, 58vw, 26dvh);
  margin: 0 auto;
}
html.futa04-branding #menu #logo svg { display: block; width: 100%; height: auto; }
`;

/** Presentation-only boxes. Card sizes, hand order, tile coordinates and inputs are unchanged. */
export function polishLayout(layout: Layout, v: Viewport, radius: number): Layout {
  const l = { ...layout, dock: { ...layout.dock }, zone: { ...layout.zone }, rows: { ...layout.rows }, parts: { ...layout.parts } };
  const bottom = v.safeBottom ?? 0, left = v.safeLeft ?? 0, right = v.safeRight ?? 0;
  if (layout.thumb) {
    const old = layout.thumb;
    const reclaim = Math.max(0, old.deck.y - 2 - 8);
    const reduction = 8 + 2 * reclaim;
    l.dock.h -= reduction; l.dock.y += reduction; l.rows.hand = l.dock.h;
    const lower = (box: typeof old.deck) => ({ ...box, y: box.y - reclaim });
    l.thumb = { ...old, deck: lower(old.deck), discard: lower(old.discard), piles: lower(old.piles),
      moves: lower(old.moves), undo: lower(old.undo), sort: lower(old.sort),
      fan: { ...old.fan, baseY: old.fan.baseY - 2 * reclaim },
      band: { ...old.band, y: old.band.y - 2 * reclaim } };
    for (const name of ['deck','discard','piles','moves','undo','sort'] as const)
      l.parts[name] = { ...l.parts[name], y: l.parts[name].y + 8 + reclaim };
    // Reserve the 104px cockpit without pushing the fan below the safe screen edge.
    const cockpitExtra = 24;
    l.dock.h += cockpitExtra; l.dock.y -= cockpitExtra; l.rows.hand = l.dock.h;
    l.thumb.fan.baseY += cockpitExtra;
    l.thumb.band.y += cockpitExtra;
    l.parts.fan = { ...l.dock };
    l.zone = { x: left + 2, y: l.header.y + l.header.h, w: v.w-left-right-4, h: l.dock.y-l.header.y-l.header.h };
  } else {
    // Two compact control rows plus clearance for the fan's rotated upper corners.
    l.rows.table = Math.max(124, l.parts.pileCard.h + 22);
    // The curved/rotated desktop fan needs its original 20px clearance; remove only
    // the surplus spacing, so its lower corners never cross the screen edge.
    l.rows.hand = l.card.h + 20;
    const gap = l.mode === 'side' ? 8 : 0;
    l.dock.h = l.rows.table + l.rows.hand + gap + 4;
    l.dock.y = v.h-bottom-l.dock.h;
    if (l.mode === 'stack') {
      l.zone = { x: left+2, y: l.header.y+l.header.h, w: v.w-left-right-4, h: l.dock.y-l.header.y-l.header.h };
    } else {
      l.zone = { x: left+2, y: l.header.y+l.header.h, w: v.w-left-right-l.dock.w-6, h: v.h-l.header.y-l.header.h-bottom-2 };
      l.dock.x = v.w-right-l.dock.w-2;
    }
  }
  const fit = bestFit(l.zone.w,l.zone.h,radius), units = boardUnits(radius,fit.orient);
  l.orient = fit.orient; l.scale = fit.scale; l.hexPx = units.hexW*fit.scale;
  l.board = { x: l.zone.x+(l.zone.w-units.w*fit.scale)/2,
    y: l.zone.y+(l.thumb ? l.zone.h-units.h*fit.scale : (l.zone.h-units.h*fit.scale)/2),
    w: units.w*fit.scale, h: units.h*fit.scale };
  return l;
}

// The exported PNG has faint alpha fringes in otherwise empty space. Render the mark as
// uniformly cream, omit those fringes, and crop its transparent margins without stretching.
function whiteLogo(id: string, accessible: boolean, wordmark = false): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const width = wordmark ? 2200 : 1254, height = wordmark ? 715 : 1254;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('focusable', 'false');
  if (accessible) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Futasaku'); }
  else svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<defs><filter id="${id}" color-interpolation-filters="sRGB"><feComponentTransfer result="logo-mask">
    <feFuncR type="linear" slope="0" intercept="1"/><feFuncG type="linear" slope="0" intercept="1"/>
    <feFuncB type="linear" slope="0" intercept="1"/><feFuncA type="discrete" tableValues="0 1"/>
  </feComponentTransfer><feFlood style="flood-color:var(--c-accent)"/><feComposite operator="in" in2="logo-mask"/></filter></defs>`;
  const image = document.createElementNS(ns, 'image');
  image.setAttribute('href', wordmark ? wordmarkUrl : logoUrl);
  image.setAttribute('width', String(width));
  image.setAttribute('height', String(height));
  image.setAttribute('filter', `url(#${id})`);
  svg.append(image);
  return svg;
}

export function drawLogo() {
  const container = document.getElementById('logo');
  if (!container) return;
  container.replaceChildren(whiteLogo('futasaku-menu-white', false));
}

/**
 * The small, treeless Futasaku wordmark the game HUD shows top-right (`#hud-brand`), built as a
 * standalone element so other surfaces (the online submenu header) can reuse the exact same asset,
 * filter and treatment instead of inventing one. `id` must be unique in the document: it names the
 * SVG filter that tints the image, exactly as `#hud-brand` does.
 */
export function createHudBrandMark(id = 'futasaku-hud-white'): SVGSVGElement {
  return whiteLogo(id, true, true);
}

/** The badge is measured from the HUD's own menu ink; main.ts asks for a re-measure on screen change. */
let alignBrand: (() => void) | null = null;

export function mountBranding() {
  document.documentElement.classList.add('futa04-branding');
  // ONE mark per screen: the layer is off until main.ts's syncBrandMark says which surface owns
  // the screen (the menu's big logo, the corner badge, or the finish plate's cap).
  document.documentElement.classList.remove('brand-mark');
  document.title = 'Futasaku';
  const title = document.querySelector('#menu .title');
  if (title) title.textContent = 'Futasaku';
  const style = document.createElement('style');
  style.id = 'futa04-branding-style';
  style.textContent = BRANDING_CSS;
  document.head.append(style);
  const race = document.getElementById('race');
  if (race) { race.hidden = true; race.setAttribute('aria-hidden', 'true'); }
  const image = whiteLogo('futasaku-hud-white', true, true);
  image.id = 'hud-brand';
  // OUTSIDE #game. The veils live on the scrim (z 10) and the finish screen (z 12); a backdrop
  // blur can only veil what is painted beneath it, so the badge is appended to the page itself
  // and painted above them (see the #hud-brand note in BRANDING_CSS).
  document.body.append(image);
  // The finish plate's cap: the SAME helper, asset, filter and size token, mounted once. It is
  // the corner mark's matching half, so the owner's "same logo, symmetrically" is one definition.
  const cap = createHudBrandMark('futasaku-go-white');
  cap.id = 'go-brand';
  document.querySelector('#gameover .go-summary')?.prepend(cap);
  // Match the visible ink, including the rounded stroke, rather than the 44px tap target.
  const menuIcon = document.querySelector<HTMLElement>('#hud-menu .i');
  const root = document.documentElement.style;
  const align = () => {
    // The HUD is display:none on the menu and the submenus; measuring it then returns a fraction
    // of a pixel and would shrink the badge for the screen that follows. Keep the last good (or
    // the CSS fallback) until the match is actually on screen.
    if (document.getElementById('game')?.hidden) return;
    const path = menuIcon?.querySelector<SVGGraphicsElement>('path');
    const matrix = path?.getScreenCTM();
    if (!path || !matrix) return;
    const stroke = parseFloat(getComputedStyle(path).strokeWidth) || 0;
    const ink = (path.getBBox().height + stroke) * Math.hypot(matrix.c, matrix.d);
    if (!(ink > 8)) return;
    root.setProperty('--futasaku-logo-height', `${ink * 1.82}px`);
    // The badge is out of the HUD grid now, so the menu ink no longer moves with it: one measure
    // is enough (the old seven-pass correction chased a row height the mark no longer sets).
    const inkTop = path.getBoundingClientRect().top - stroke * Math.hypot(matrix.c, matrix.d) / 2;
    root.setProperty('--futasaku-logo-top', `${Math.max(0, inkTop)}px`);
  };
  alignBrand = align;
  if (menuIcon) {
    new ResizeObserver(align).observe(menuIcon);
    new MutationObserver(align).observe(menuIcon, { childList: true, subtree: true });
  }
  window.addEventListener('resize', align);
  requestAnimationFrame(align);
  drawLogo();
}

/** The badge is measured from the HUD's own menu ink; main.ts asks for a re-measure on screen change. */
export function setBrandMark(on: boolean) {
  document.documentElement.classList.toggle('brand-mark', on);
  if (on) requestAnimationFrame(() => alignBrand?.());
}
