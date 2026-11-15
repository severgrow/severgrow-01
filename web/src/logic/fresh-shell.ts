// A LAUNCH THAT IS ONE DEPLOY BEHIND, WITH NO CHANCE TO CATCH UP (owner, 2026-11-15: fixes were on
// /test/ for twelve hours and his phone still showed the old build — "there is still this rounded
// rectangle under draw pile, and gold frame placing in middle is still broken").
//
// Why it happened. `public/futa04-sw.js` answered a navigation from the SAVED page at once and
// refreshed that saved copy in the background "for the next launch" — deliberately, because iOS
// paints a white page while a home-screen app waits for the network (owner, 2026-11-06). That trade
// is right for the launch itself, but it meant a launch NEVER showed the build that was already
// deployed; the update only appeared on the FOLLOWING launch. An installed app that is switched away
// from and resumed is not a navigation at all, so it could sit on one old build indefinitely, and the
// only recovery in place (`logic/stale-build.ts`) fires when a lazy chunk 404s — which never happens
// while the old build's own files are still served.
//
// THE WORKER IS THE RESCUE (2026-11-15). It now proves the saved page's own entry file still exists
// before answering a navigation, so a page whose build is gone can no longer run. This module is the
// other half, and it only helps pages that CONTAIN it (a page from November cannot be retrofitted):
//   1. a message from the worker ("the site now runs entry X") moves the page onto it;
//   2. the worker posts that on activation and whenever a navigation replaces the saved page, so a
//      RESUMED app — which never navigates — can still be told;
//   3. one direct look per launch remains for pages the worker does not control.
//
// It is safe by construction:
// - menu only: a live game, a tutorial or a sheet is never interrupted mid-turn;
// - once per session, and never twice inside `STALE_RELOAD_WINDOW_MS`, so a bad deploy cannot loop;
// - after paint, and the launched page's own download is skipped when the worker already answered it;
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
  /** True when a service worker is controlling this page (the worker then does the checking). */
  controlled?: () => boolean;
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
 * Reload once onto `deployed` — the entry file the site now runs — or leave the page alone.
 * This is the ONE place the page navigates for a new build, so every guard lives here:
 * the menu, the running build, the "never twice inside the window" record.
 */
export const reloadOntoEntry = (deployed: string | null, deps: FreshShellDeps = {}): string | null => {
  const doc = deps.doc ?? document;
  const win = deps.win ?? window;
  const now = deps.now ?? (() => Date.now());
  if (!deployed) return null;
  const running = runningEntry(doc);
  if (!running || deployed === running) return null;
  // Never over a game, a sheet or a tutorial: the player is in the middle of something.
  if (!onMenu(doc)) return null;

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

/**
 * Reload onto the deployed build when this page is running an older one. Resolves to the address it
 * navigated to, or null when it left the page alone (also what the test asserts on).
 */
export const reloadIfDeployedBuildDiffers = async (deps: FreshShellDeps = {}): Promise<string | null> => {
  const doc = deps.doc ?? document;
  const fetchText = deps.fetchText ?? defaultFetchText;
  if (!onMenu(doc)) return null;
  if (!runningEntry(doc)) return null;

  const html = await fetchText('./index.html');
  if (!html) return null;
  return reloadOntoEntry(entryOf(html), deps);
};

/** The worker's message: the entry file the site (and its saved page) now runs. */
export type ShellAnnouncement = { type?: string; entry?: unknown };

/** Handle one message from the worker. Returns the address it navigated to, or null. */
export const onWorkerAnnouncement = (data: ShellAnnouncement | null, deps: FreshShellDeps = {}): string | null => {
  if (!data || data.type !== 'futa-shell' || typeof data.entry !== 'string') return null;
  return reloadOntoEntry(data.entry, deps);
};

/** A worker controls this page, so the worker has already proved the saved page's build exists. */
const workerControls = (win: Window): boolean => {
  try {
    const sw = (win.navigator as Navigator & { serviceWorker?: ServiceWorkerContainer }).serviceWorker;
    return !!sw && !!sw.controller;
  } catch {
    return false;
  }
};

/** Ask the browser for a worker update (a few kB) — never a download of the app itself. */
const askForWorkerUpdate = (win: Window): void => {
  try {
    const sw = (win.navigator as Navigator & { serviceWorker?: ServiceWorkerContainer }).serviceWorker;
    if (!sw) return;
    void sw.getRegistration().then((reg) => reg?.update()).catch(() => undefined);
  } catch {
    /* no worker: nothing to ask */
  }
};

/**
 * Run the check once, after paint, so it can never delay the app or the first frame.
 *
 * WHAT IT NO LONGER DOES (owner, 2026-11-15). It used to keep a 15-second timer alive for up to ten
 * minutes while a match was on screen, and took one direct look at the menu first. Measured on a
 * 4x-throttled phone viewport with a game on screen: ZERO network requests and a median 0 ms (max
 * 0.6 ms) menu test per tick — so the timer was never the "slow in a match" bug, and it is gone
 * anyway. The cost it did have was at every launch: a full page download (~97 kB, measured) after
 * paint, to answer a question the worker had already answered. That one is now skipped whenever a
 * worker is controlling the page, and the worker's announcement replaces it.
 */
export const installFreshShellReload = (deps: FreshShellDeps = {}): void => {
  const win = deps.win ?? window;
  const doc = deps.doc ?? document;
  const now = deps.now ?? (() => Date.now());
  const controlled = deps.controlled ?? (() => workerControls(win));

  // ONE LOOK PER LAUNCH, AND ONLY WHEN THE WORKER DID NOT ALREADY MAKE IT. When this launch came
  // from the worker, the worker proved the saved page's build still exists (otherwise it answered
  // from the network), so the page spends nothing on a second copy of the same question.
  const attempt = async (): Promise<void> => {
    try {
      if (!controlled()) await reloadIfDeployedBuildDiffers({ ...deps, doc, win });
    } catch {
      /* never let this break the page */
    }
  };
  const later = (): void => { void attempt(); };
  if (typeof (win as Window & { requestIdleCallback?: unknown }).requestIdleCallback === 'function') {
    (win as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(later);
  } else {
    win.setTimeout(later, 2500);
  }

  if (typeof win.addEventListener !== 'function') return;
  // THE WORKER TELLS THE PAGE (on activation, and when a navigation replaces the saved page). The page
  // decides, through the same guards: menu only, once per window.
  win.addEventListener('message', (event: MessageEvent) => {
    try {
      onWorkerAnnouncement(event.data as ShellAnnouncement | null, { ...deps, doc, win });
    } catch {
      /* never let this break the page */
    }
  });
  // THE MENU IS BACK: ask for a worker update. If a deploy landed while the player was in a match, the
  // new worker activates, announces its entry, and the message above finishes the job.
  let lastAsked = 0;
  win.addEventListener('futasaku:menu', () => {
    const at = now();
    if (lastAsked && at - lastAsked < STALE_RELOAD_WINDOW_MS) return;
    lastAsked = at;
    askForWorkerUpdate(win);
  });
};
