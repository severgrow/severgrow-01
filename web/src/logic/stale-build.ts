// A PAGE LEFT OPEN ACROSS A DEPLOY (owner, 2026-11-04: "Duels broke in test version tho, skins don't
// load at all"). Every build names its code files by content hash and a deploy replaces the folder,
// so a tab or home-screen app opened before the deploy asks for files that no longer exist the
// first time it lazily loads a part it had not needed yet: the duel board, its art, a sheet. Vite
// reports that as `vite:preloadError`. Nothing listened, so the part simply failed. Now the page
// reloads ONCE onto the current build. A second failure within the window is a real outage (or
// offline), not a stale page, so it is left to the part's own fallback instead of looping.
export const STALE_RELOAD_KEY = 'futasaku.staleReload.v1';
/** Within this long of the last automatic reload, a new failure does not reload again. */
export const STALE_RELOAD_WINDOW_MS = 60_000;

type SessionLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** Decide (and record) whether this failure should reload the page. */
export const shouldReloadForStaleBuild = (store: SessionLike | null, now: number): boolean => {
  if (!store) return false;
  try {
    const last = Number(store.getItem(STALE_RELOAD_KEY) ?? '');
    if (Number.isFinite(last) && last > 0 && now - last < STALE_RELOAD_WINDOW_MS) return false;
    store.setItem(STALE_RELOAD_KEY, String(now));
    return true;
  } catch {
    // No session storage: reloading could loop, so leave the failure to the part's own fallback.
    return false;
  }
};

/** Listen for a stale build's failed lazy load and recover by reloading once. */
export const installStaleBuildReload = (win: Window = window): void => {
  win.addEventListener('vite:preloadError', (event) => {
    let store: SessionLike | null = null;
    try { store = win.sessionStorage; } catch { store = null; }
    if (!shouldReloadForStaleBuild(store, Date.now())) return;
    event.preventDefault();
    // Through the fresh address: the offline worker answers ?_fresh= from the network, never from the
    // saved page that named the missing files (public/futa04-sw.js).
    const next = new URL(win.location.href);
    next.searchParams.set('_fresh', String(Date.now()));
    win.location.replace(next.href);
  });
};
