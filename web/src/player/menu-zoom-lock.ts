// THE MAIN MENU DOES NOT ZOOM (owner, 2026-11-08: "make it impossible to zoom out on main menu").
//
// The planet behind the menu already ignores pinch and wheel in its menu mode (sphere/planet.ts). What
// moved was the PAGE itself: a touch pinch, a trackpad pinch (ctrl + wheel) or Ctrl/Cmd + - / + / 0.
// While #menu shows (and Territory is not open over it), each of those is refused. Every other screen keeps the browser's own zoom.
//
// Cost: one attribute observer on #menu and #online-world-screen (their `hidden`), and listeners that only act while locked.

export const MENU_ZOOM_LOCK_CSS = `
html.menu-zoom-lock, html.menu-zoom-lock body { touch-action: pan-x pan-y; }
`;

/** Ctrl or Cmd with + - = _ 0: the browser's page-zoom keys. */
export const isZoomKey = (e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey'>): boolean =>
  (e.ctrlKey || e.metaKey) && ['+', '-', '=', '_', '0'].includes(e.key);

const LOCKED_VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

export const mountMenuZoomLock = (): void => {
  if (typeof document === 'undefined') return;
  const menu = document.getElementById('menu');
  if (!menu) return;
  // Territory opens OVER the menu without hiding it; its planet keeps its own pinch and the page lock
  // must step aside while it is up.
  const world = document.getElementById('online-world-screen');
  const style = document.createElement('style');
  style.id = 'menu-zoom-lock-css';
  style.textContent = MENU_ZOOM_LOCK_CSS;
  document.head.append(style);

  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const openViewport = viewport?.content ?? '';
  let locked = false;

  const sync = (): void => {
    const next = !menu.hidden && (!world || !!world.hidden);
    if (next === locked) return;
    locked = next;
    document.documentElement.classList.toggle('menu-zoom-lock', locked);
    // Android honours the viewport's maximum-scale; iOS ignores it, and the gesture guard covers it.
    if (viewport) viewport.content = locked ? LOCKED_VIEWPORT : openViewport;
  };

  const refuse = (e: Event): void => {
    if (locked) e.preventDefault();
  };
  for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(name, refuse, { passive: false });
  }
  // A pinch that starts with two fingers on a touch screen (Safari before touch-action applies).
  document.addEventListener('touchmove', (e) => {
    if (locked && e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  // The trackpad pinch arrives as a wheel with ctrlKey.
  window.addEventListener('wheel', (e) => {
    if (locked && e.ctrlKey) e.preventDefault();
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (locked && isZoomKey(e)) e.preventDefault();
  });

  const watch = new MutationObserver(sync);
  watch.observe(menu, { attributes: true, attributeFilter: ['hidden'] });
  if (world) watch.observe(world, { attributes: true, attributeFilter: ['hidden'] });
  sync();
};
