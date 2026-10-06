// Loaded only by the literal Test2 guard: Main and Dev keep their existing brand.
import logoUrl from '../assets/futasaku-white.png?url';
import { bestFit, boardUnits } from '../logic/layout.js';
import type { Layout, Viewport } from '../logic/layout.js';

export const BRANDING_CSS = `
html.test2-branding.slim-hud .game > .hud {
  position: fixed;
  inset: env(safe-area-inset-top) env(safe-area-inset-right) auto env(safe-area-inset-left);
  width: auto;
  z-index: 7;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  box-sizing: border-box;
  padding: 0 6px;
  gap: 8px;
}
html.test2-branding .game > #race { display: none !important; }
html.test2-branding .game { max-width: none; margin: 0; }
html.test2-branding .play { --board-margin: 2px; }
html.test2-branding[data-layout='stack'] .board-wrap {
  margin-left: 2px;
  margin-right: 2px;
}
html.test2-branding[data-layout='side'] .dock { align-self: end; row-gap: 8px; }
/* The screen already reserves the notch/home-indicator insets. */
html.test2-branding .dock { padding-bottom: 4px; }
html.test2-branding[data-thumb] .dock { padding: 0; }
html.test2-branding #hud-brand {
  grid-column: 3;
  justify-self: end;
  height: var(--futasaku-logo-height, 12px);
  width: auto;
  max-width: 150px;
  display: block;
  pointer-events: none;
  user-select: none;
}
html.test2-branding #menu #terrarium { display: none !important; }
html.test2-branding #menu #logo {
  display: block !important;
  width: min(280px, 76vw);
  margin: 0 auto 16px;
}
html.test2-branding #menu #logo svg { display: block; width: 100%; height: auto; }
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
    l.parts.fan = { ...l.dock };
    l.zone = { x: left + 2, y: l.header.y + l.header.h, w: v.w-left-right-4, h: l.dock.y-l.header.y-l.header.h };
  } else {
    l.rows.table = Math.max(84, l.parts.pileCard.h + 22);
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
function whiteLogo(id: string, accessible: boolean): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '79 57 2072 638');
  svg.setAttribute('width', '2072');
  svg.setAttribute('height', '638');
  svg.setAttribute('focusable', 'false');
  if (accessible) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Futasaku'); }
  else svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<defs><filter id="${id}" color-interpolation-filters="sRGB"><feComponentTransfer result="logo-mask">
    <feFuncR type="linear" slope="0" intercept="1"/><feFuncG type="linear" slope="0" intercept="1"/>
    <feFuncB type="linear" slope="0" intercept="1"/><feFuncA type="discrete" tableValues="0 1"/>
  </feComponentTransfer><feFlood style="flood-color:var(--c-accent)"/><feComposite operator="in" in2="logo-mask"/></filter></defs>`;
  const image = document.createElementNS(ns, 'image');
  image.setAttribute('href', logoUrl);
  image.setAttribute('width', '2200');
  image.setAttribute('height', '715');
  image.setAttribute('filter', `url(#${id})`);
  svg.append(image);
  return svg;
}

export function drawLogo() {
  const container = document.getElementById('logo');
  if (!container) return;
  container.replaceChildren(whiteLogo('futasaku-menu-white', false));
}

export function mountBranding() {
  document.documentElement.classList.add('test2-branding');
  document.title = 'Futasaku';
  const title = document.querySelector('#menu .title');
  if (title) title.textContent = 'Futasaku';
  const style = document.createElement('style');
  style.id = 'test2-branding-style';
  style.textContent = BRANDING_CSS;
  document.head.append(style);
  const race = document.getElementById('race');
  if (race) { race.hidden = true; race.setAttribute('aria-hidden', 'true'); }
  const image = whiteLogo('futasaku-hud-white', true);
  image.id = 'hud-brand';
  document.querySelector('#game > .hud')?.append(image);
  // Match the visible ink, including the rounded stroke, rather than the 44px tap target.
  const menuIcon = document.querySelector<HTMLElement>('#hud-menu .i');
  const align = () => {
    const path = menuIcon?.querySelector<SVGGraphicsElement>('path');
    const matrix = path?.getScreenCTM();
    if (!path || !matrix) return;
    const stroke = parseFloat(getComputedStyle(path).strokeWidth) || 0;
    const height = (path.getBBox().height + stroke) * Math.hypot(matrix.c, matrix.d);
    if (height > 0) image.style.setProperty('--futasaku-logo-height', `${height}px`);
  };
  if (menuIcon) {
    new ResizeObserver(align).observe(menuIcon);
    new MutationObserver(align).observe(menuIcon, { childList: true, subtree: true });
  }
  window.addEventListener('resize', align);
  requestAnimationFrame(align);
  drawLogo();
}
