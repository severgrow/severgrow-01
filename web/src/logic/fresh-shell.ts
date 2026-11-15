// A LAUNCH THAT IS ONE DEPLOY BEHIND, WITH NO CHANCE TO CATCH UP (owner, 2026-11-15: fixes were on
// /test/ for twelve hours and his phone still showed the old build — "there is still this rounded
// rectangle under draw pile, and gold frame placing in middle is still broken").
//
// Why it happened. `public/futa04-sw.js` answers a navigation from the SAVED page at once and
// refreshes that saved copy in the background "for the next launch" — deliberately, because iOS
// paints a white page while a home-screen app waits for the network (owner, 2026-11-06). That trade
// is right for the launch itself, but it means a launch NEVER shows the build that is already
// deployed; the update only appears on the FOLLOWING launch. An installed app that is switched away
// from and resumed is not a navigation at all, so it can sit on one old build indefinitely, and the
// only recovery in place (`logic/stale-build.ts`) fires when a lazy chunk 404s — which never happens
// while the old build's own files are still served.
//
// What this does. After the first paint, on the menu only, ask the network for the current page and
// compare the CODE FILE it names with the one this page is running. A deploy replaces the hashed
// `assets/index-<hash>.js`, so a different name means a newer build is live. Then reload ONCE onto
// it through `?_fresh=` — the address the worker answers from the network, never from the saved page.
//
// It is safe by construction:
// - menu only: a live game, a tutorial or a sheet is never interrupted mid-turn;
// - once per session, and never twice inside `STALE_RELOAD_WINDOW_MS`, so a bad deploy cannot loop;
// - after paint and after a short delay, so it never delays the first frame or the app's start;
// - a failed or offline fetch simply leaves the page alone.
//
// `web/tests/fresh-shell.test.ts` covers the fingerprinting, the guards and the decision.

import { STALE_RELOAD_KEY, STALE_RELOAD_WINDOW_MS } from './stale-build.js';

/** The build's entry code file named by a page, e.g. `/test/assets/index-BoVygnnJ.js`. */
export const entryOf = (html: string): string | null => {
  // The Vite entry is the page's module script; hashed chunks are quoted in `src`/`href`, and the
  // preload links repeat the same set, so the first `assets/index-` reference is the entry.
  const match = /assets\/index-[A-Za-z0-9_-]+\.js/.exec(html);
  return match ? match[0] : null;
};

/** The entry this page is actually running, or null when it cannot be read. */
export const runningEntry = (doc: Document = document): string | null => {
  const script = doc.querySelector<HTMLScriptElement>('script[type="module"][src]');
  const src = script?.src ?? '';
  const match = /assets\/index-[A-Za-z0-9_-]+\.js/.exec(src);
  return match ? match[0] : null;
};

/** An element that actually paints: `hidden` is only one of the ways these are taken off screen
    (sheets are also closed by class), so the layout box decides. */
const shown = (el: Element | null | undefined): boolean => {
  if (!el) return false;
  const node = el as HTMLElement;
  if (node.hidden) return false;
  return typeof node.getClientRects === 'function' ? node.getClientRects().length > 0 : true;
};

/** True when the menu is the only thing on screen: nothing in progress to interrupt. */
export const onMenu = (doc: Document = document): boolean => {
  if (!shown(doc.getElementById('menu'))) return false;
  // The game, the end screen and the install prompt each mean the player is doing something.
  for (const id of ['game', 'gameover', 'install-prompt']) {
    if (shown(doc.getElementById(id))) return false;
  }
  // Every sheet is `#sheet-*` (settings, tutorial, history, ...) and a tutorial step is its own
  // screen. A visible one covers the menu, so reloading would throw away what it was showing.
  if (typeof doc.querySelectorAll !== 'function') return true;
  for (const el of doc.querySelectorAll('[id^="sheet-"], [id^="futa04-tutorial"], [role="dialog"]')) {
    if (shown(el)) return false;
  }
  return true;
};

export type FreshShellDeps = {
  doc?: Document;
  win?: Window;
  fetchText?: (url: string) => Promise<string | null>;
  now?: () => number;
};

const defaultFetchText = async (url: string): Promise<string | null> => {
  if (typeof fetch !== 'function') return null;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
};

/**
 * Reload onto the deployed build when this page is running an older one. Resolves to the address it
 * navigated to, or null when it left the page alone (also what the test asserts on).
 */
export const reloadIfDeployedBuildDiffers = async (deps: FreshShellDeps = {}): Promise<string | null> => {
  const doc = deps.doc ?? document;
  const win = deps.win ?? window;
  const fetchText = deps.fetchText ?? defaultFetchText;
  const now = deps.now ?? (() => Date.now());

  if (!onMenu(doc)) return null;
  const running = runningEntry(doc);
  if (!running) return null;

  const html = await fetchText('./index.html');
  if (!html) return null;
  const deployed = entryOf(html);
  if (!deployed || deployed === running) return null;

  // Never twice inside the window: a deploy that somehow keeps disagreeing must not spin.
  let store: Storage | null = null;
  try { store = win.sessionStorage; } catch { store = null; }
  if (!store) return null;
  try {
    const at = now();
    const last = Number(store.getItem(STALE_RELOAD_KEY) ?? '');
    if (Number.isFinite(last) && last > 0 && at - last < STALE_RELOAD_WINDOW_MS) return null;
    store.setItem(STALE_RELOAD_KEY, String(at));
  } catch {
    return null;
  }

  const next = new URL(win.location.href);
  next.searchParams.set('_fresh', String(now()));
  const href = next.href;
  win.location.replace(href);
  return href;
};

/** Run the check once, after paint, so it can never delay the app or the first frame. */
export const installFreshShellReload = (deps: FreshShellDeps = {}): void => {
  const win = deps.win ?? window;
  const doc = deps.doc ?? document;
  // A resumed home-screen app is never a navigation, so a single look at launch is not enough: the
  // player may launch straight back into a match and stay there. Retry on a slow, bounded cadence
  // until the menu is on screen; the reload itself still only ever happens on the menu.
  const RETRY_MS = 15_000;
  const DEADLINE_MS = 10 * 60_000;
  const started = (deps.now ?? (() => Date.now()))();
  const now = deps.now ?? (() => Date.now());
  const attempt = async (): Promise<void> => {
    try {
      const href = await reloadIfDeployedBuildDiffers({ ...deps, doc, win });
      if (href) return; // navigating away
      if (!onMenu(doc) && now() - started < DEADLINE_MS) win.setTimeout(() => { void attempt(); }, RETRY_MS);
    } catch {
      /* never let this break the page */
    }
  };
  const later = () => { void attempt(); };
  if (typeof (win as Window & { requestIdleCallback?: unknown }).requestIdleCallback === 'function') {
    (win as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(later);
  } else {
    win.setTimeout(later, 2500);
  }
};
