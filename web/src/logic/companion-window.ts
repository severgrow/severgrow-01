// THE DESKTOP APP OPENS AS A COMPANION WINDOW (owner, 2026-11-17: "by default when opening in a new window
// - don't make it full screen but more like mobile layout but a bit wider ... GOAL - when playing FUTASAKU
// on desktop as an app, it encourages to watch youtube / anything else in the background ... without
// saying anything, just making layout friendly for this typa use").
//
// The installed app's FIRST launch on a desktop sizes its own window to a tall portrait column at the
// right edge of the screen: the portrait layout, the board across nearly the whole width, the rest of
// the screen free beside it. Once only: after that the window is wherever the player leaves it (the
// browser remembers an app window's size), and a browser tab is never touched. Browsers that refuse
// to resize an app window simply ignore it.

/** `severgrow.*`: the companion window has been offered once on this device. */
export const APP_WINDOW_KEY = 'severgrow.appWindow.v1';
/** The column: portrait, wide enough that the board is large, narrow enough to leave room beside it. */
export const APP_WINDOW_W = 540;
export const APP_WINDOW_MAX_H = 1000;
/** Breathing room from the screen's edges. */
export const APP_WINDOW_MARGIN = 24;

export type ScreenBox = { availLeft: number; availTop: number; availWidth: number; availHeight: number };
export type WindowPlan = { x: number; y: number; w: number; h: number };

/**
 * The window to open as, or null to leave it alone: only an installed app (standalone), only with a
 * mouse or trackpad on a screen wide enough for a column beside something else, only the first time.
 */
export const appWindowPlan = (m: { standalone: boolean; finePointer: boolean; screen: ScreenBox; offered: boolean }): WindowPlan | null => {
  if (!m.standalone || !m.finePointer || m.offered) return null;
  const s = m.screen;
  if (s.availWidth < 1000 || s.availHeight < 640) return null;
  const h = Math.min(APP_WINDOW_MAX_H, s.availHeight - 2 * APP_WINDOW_MARGIN);
  const w = Math.min(APP_WINDOW_W, Math.round(h * 0.6));
  return {
    w, h,
    x: s.availLeft + s.availWidth - w - APP_WINDOW_MARGIN,
    y: s.availTop + Math.round((s.availHeight - h) / 2),
  };
};

type Storage = { get(key: string): string | null; set(key: string, value: string): void };

/** Apply the plan once (installed desktop app, first launch). Never throws. */
export const openAsCompanionWindow = (store: Storage, win: Window = window): void => {
  try {
    const plan = appWindowPlan({
      standalone: win.matchMedia('(display-mode: standalone)').matches || win.matchMedia('(display-mode: window-controls-overlay)').matches,
      finePointer: win.matchMedia('(pointer: fine)').matches,
      screen: win.screen as unknown as ScreenBox,
      offered: store.get(APP_WINDOW_KEY) === '1',
    });
    if (!plan) return;
    store.set(APP_WINDOW_KEY, '1');
    win.resizeTo(plan.w, plan.h);
    win.moveTo(plan.x, plan.y);
  } catch { /* a browser that will not move an app window: it stays as it opened */ }
};
