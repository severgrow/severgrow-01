// The in-game corner rail (owner, 2026-10-15): a row of icon-only controls tucked UNDER the
// wordmark at the top right, its right edge on the wordmark's right edge. Today it holds the
// full-screen icon (computers) and the real-time bolt (online duels); the bolt is always rightmost.
// One rail, positioned from the wordmark's real box (re-measured whenever the wordmark settles), so
// the controls never cover the logo whatever header the screen shows.

const CSS = `
#hud-rail { position:fixed; z-index:8; display:flex; flex-direction:row; justify-content:flex-end; gap:2px;
  top:var(--hud-rail-top, 44px); right:var(--hud-rail-right, 6px); pointer-events:none; }
#hud-rail > * { pointer-events:auto; }
#hud-rail[hidden], #game[hidden] ~ #hud-rail { display:none; }
`;

let rail: HTMLElement | null = null;

/** The rail, created once (in the game screen's container, so it shows only with the game). */
export const hudRail = (): HTMLElement => {
  if (rail) return rail;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  rail = document.createElement('div');
  rail.id = 'hud-rail';
  const game = document.getElementById('game');
  (game?.parentElement ?? document.body).append(rail);
  const place = () => {
    const brand = document.getElementById('hud-brand')?.getBoundingClientRect();
    if (!brand || brand.width === 0) return;
    const root = document.documentElement.style;
    root.setProperty('--hud-rail-right', `${Math.max(0, Math.round(innerWidth - brand.right))}px`);
    root.setProperty('--hud-rail-top', `${Math.round(brand.bottom + 4)}px`);
  };
  const brandEl = document.getElementById('hud-brand');
  if (brandEl && typeof ResizeObserver === 'function') new ResizeObserver(place).observe(brandEl);
  window.addEventListener('resize', place);
  if (game) new MutationObserver(() => requestAnimationFrame(place)).observe(game, { attributes: true, attributeFilter: ['hidden'] });
  place();
  requestAnimationFrame(place);
  return rail;
};
