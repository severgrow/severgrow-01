// Futasaku 0.3 uses the Test2 presentation; historical channels keep their existing brand.
import logoUrl from '../assets/futasaku-emblem.webp?url';
import wordmarkUrl from '../assets/futasaku-white.webp?url';
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
/* iOS home-screen apps expose the notch/home insets to the layout code. The
   shared .screen padding would reserve the same insets again, shrinking the
   board and leaving an unused band below the hand. Safari tabs keep it. */
html.test2-branding.home-screen-app #game { padding: 0; }
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
  height: var(--futasaku-logo-height, 22px);
  align-self: start; margin-top: var(--futasaku-logo-top, 18px);
  width: auto;
  max-width: 90px;
  display: block;
  opacity: .75;
  pointer-events: none;
  user-select: none;
}
html.test2-branding #hud-menu,
html.test2-branding #hud-brand { position: relative; top: 0; }
html.test2-branding #menu #terrarium { display: none !important; }
html.test2-branding #menu #logo {
  display: block !important;
  width: min(240px, 58vw, 29dvh);
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
  const image = whiteLogo('futasaku-hud-white', true, true);
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
    if (height > 0) {
      image.style.setProperty('--futasaku-logo-height', `${height * 1.82}px`);
      // The taller logo also changes the grid row's height, which moves the menu ink.
      // Re-measure both after each small correction until their tops meet, including safe areas.
      for (let i = 0; i < 7; i++) {
        const inkTop = path.getBoundingClientRect().top - stroke * Math.hypot(matrix.c, matrix.d) / 2;
        const delta = inkTop - image.getBoundingClientRect().top;
        if (Math.abs(delta) < .15) break;
        const top = parseFloat(getComputedStyle(image).marginTop) || 0;
        image.style.setProperty('--futasaku-logo-top', `${Math.max(0, top + delta)}px`);
      }
    }
  };
  if (menuIcon) {
    new ResizeObserver(align).observe(menuIcon);
    new MutationObserver(align).observe(menuIcon, { childList: true, subtree: true });
  }
  window.addEventListener('resize', align);
  requestAnimationFrame(align);
  drawLogo();
}
