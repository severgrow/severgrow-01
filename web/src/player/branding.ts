// Owner brand pack (2026-11-07): pure-vector SVGs — never redraw letterforms.
//   PAINT  → home-screen menu only (true vector paint SVG; CSS drop-shadow OK)
//   PLAIN  → small logos in menus / in-game / everywhere else
//   HEX    → app icon + card back (SVG rasterised offline)
//   FAVICON tree-hex → the page icon only (index.html). Do not import that PNG here: it is
//   ~710KB and nothing in the app reads it, so an import would ship it inside the JS bundle.
import paintUrl from '../assets/brand/paint-wordmark.svg?url';
import plainUrl from '../assets/brand/plain-wordmark.svg?url';
import { bestFit, boardUnits } from '../logic/layout.js';
import type { Layout, Viewport } from '../logic/layout.js';

/** PLAIN wordmark URL — shared by replay video / poster exports and small HUD marks. */
export const WORDMARK_URL: string = plainUrl;
/** Home-menu PAINT mark (true vector SVG). */
export const PAINT_URL: string = paintUrl;

/** PLAIN wordmark viewBox width÷height (`-28 11 2106 662`). The home PAINT box is tighter: 1995×565. */
export const WORDMARK_ASPECT = 2106 / 662;

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
html.futa04-branding #hud-menu:focus-visible { outline-offset: -3px; }
html.futa04-branding.home-screen-app #game { padding: 0; }
html.futa04-branding.home-screen-app #game > .play { padding-bottom: env(safe-area-inset-bottom); }
html.futa04-branding.home-screen-app,
html.futa04-branding.home-screen-app body { height:var(--futasaku-app-height,100lvh); }
html.futa04-branding.home-screen-app :is(#game,#texture) {
  height:var(--futasaku-app-height,100lvh); bottom:auto;
}
html.futa04-branding .play { --board-margin: 2px; }
html.futa04-branding[data-layout='stack'] .board-wrap {
  margin-left: 2px;
  margin-right: 2px;
}
html.futa04-branding[data-layout='side'] .dock { align-self: center; row-gap: 8px; }
html.futa04-branding .dock { padding-bottom: 4px; }
html.futa04-branding[data-thumb] .dock { padding: 0; }
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
html.futa04-branding:not(.brand-mark) #hud-brand { display: none; }
html.futa04-branding:has(:is(#online-world-screen,#online-hub,#online-waiting,#online-join):not([hidden]):not([aria-hidden="true"])) #hud-brand { display:none !important; }
html.futa04-branding:has(#install-prompt:not([hidden])) #hud-brand { display: none; }
html.futa04-branding #hud-menu { position: relative; top: 0; }
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
html.futa04-branding #gameover[data-fresh='1'] #go-brand {
  animation: go-brand-in var(--ix-open) var(--ix-ease-open) both;
}
@keyframes go-brand-in { from { opacity: 0; } }
.reduce-motion #gameover #go-brand { animation: none !important; }
@media (prefers-reduced-motion: reduce) {
  #gameover #go-brand { animation: none !important; }
}
@media (max-height: 660px) {
  html.futa04-branding #hud-brand,
  html.futa04-branding #go-brand { height: calc(var(--futasaku-logo-height, 22px) * 0.82); }
  html.futa04-branding #go-brand { margin-bottom: 9px; }
}
html.futa04-branding #menu #terrarium { display: none !important; }
html.futa04-branding #menu #logo {
  display: block !important;
  flex: none;
  width: min(200px, 52vw, 22dvh);
  aspect-ratio: 1995 / 565;
  margin: 0 auto;
}
html.futa04-branding #menu #logo img,
html.futa04-branding #menu #logo svg {
  display: block; width: 100%; height: auto;
  image-rendering: auto;
}
/* PAINT on the home menu: a barely-noticeable almost-black drop shadow so it pops a tiny bit. */
html.futa04-branding #menu #logo img.paint-mark,
html.futa04-branding #menu #logo svg.paint-mark {
  filter: drop-shadow(0 1px 1.5px rgba(8, 8, 10, .55));
}
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
    const cockpitExtra = 24;
    l.dock.h += cockpitExtra; l.dock.y -= cockpitExtra; l.rows.hand = l.dock.h;
    l.thumb.fan.baseY += cockpitExtra;
    l.thumb.band.y += cockpitExtra;
    l.parts.fan = { ...l.dock };
    l.zone = { x: left + 2, y: l.header.y + l.header.h, w: v.w-left-right-4, h: l.dock.y-l.header.y-l.header.h };
  } else {
    l.rows.table = Math.max(124, l.parts.pileCard.h + 22);
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

/** Build an SVG wrapping a mark so existing callers that expect SVGSVGElement keep working. */
function markSvg(id: string, href: string, accessible: boolean, wide: boolean, paint = false): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const width = wide ? 2106 : 1254, height = wide ? 662 : 1254;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('focusable', 'false');
  if (accessible) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Futasaku'); }
  else svg.setAttribute('aria-hidden', 'true');
  const image = document.createElementNS(ns, 'image');
  image.id = id;
  image.setAttribute('href', href);
  image.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  image.setAttribute('x', '0');
  image.setAttribute('y', '0');
  image.setAttribute('width', String(width));
  image.setAttribute('height', String(height));
  if (paint) image.setAttribute('class', 'paint-mark');
  svg.append(image);
  return svg;
}

/** Home-menu PAINT mark as an <img> so the CSS drop-shadow filter applies cleanly. */
function paintMarkImg(): HTMLImageElement {
  const img = document.createElement('img');
  img.className = 'paint-mark';
  img.src = paintUrl;
  img.alt = '';
  img.width = 1995;
  img.height = 565;
  img.setAttribute('aria-hidden', 'true');
  img.decoding = 'async';
  img.draggable = false;
  return img;
}

export function drawLogo(_kanji = false) {
  const container = document.getElementById('logo');
  if (!container) return;
  // Home screen menu ONLY uses PAINT (owner, 2026-11-07).
  container.replaceChildren(paintMarkImg());
}

export function createHudBrandMark(id = 'futasaku-hud-plain'): SVGSVGElement {
  return markSvg(id, plainUrl, true, true);
}

export function createWordmarkMark(id = 'futasaku-wordmark-plain'): SVGSVGElement {
  return markSvg(id, plainUrl, false, true);
}

/** The badge is measured from the HUD's own menu ink; main.ts asks for a re-measure on screen change. */
let alignBrand: (() => void) | null = null;

export function mountBranding() {
  document.documentElement.classList.add('futa04-branding');
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
  const image = createHudBrandMark('futasaku-hud-plain');
  image.id = 'hud-brand';
  document.body.append(image);
  const cap = createHudBrandMark('futasaku-go-plain');
  cap.id = 'go-brand';
  document.querySelector('#gameover .go-summary')?.prepend(cap);
  const menuIcon = document.querySelector<HTMLElement>('#hud-menu .i');
  const root = document.documentElement.style;
  const align = () => {
    if (document.getElementById('game')?.hidden) return;
    const path = menuIcon?.querySelector<SVGGraphicsElement>('path');
    const matrix = path?.getScreenCTM();
    if (!path || !matrix) return;
    const stroke = parseFloat(getComputedStyle(path).strokeWidth) || 0;
    const ink = (path.getBBox().height + stroke) * Math.hypot(matrix.c, matrix.d);
    if (!(ink > 8)) return;
    root.setProperty('--futasaku-logo-height', `${ink * 1.82}px`);
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

export function setBrandMark(on: boolean) {
  document.documentElement.classList.toggle('brand-mark', on);
  if (on) requestAnimationFrame(() => alignBrand?.());
}
