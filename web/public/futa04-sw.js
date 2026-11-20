// Futa04 owns only its scope and cache. It never deletes Main or experimental caches.
//
// What it answers, and what it asks the network for first:
// - pages (navigations): the saved page AT ONCE, refreshed in the background for the next launch
//   (see `navigate` below). Only the game's own page is ever saved — never a sub-page.
// - files whose address can never change content (hashed build files in /assets/, art asked
//   for as file?v=<content hash>): cache first, they are immutable
// - everything else (the art manifest, icons, any unversioned file): network first, falling
//   back to the cache only when offline. A stale copy is never preferred to a fresh one.
// - other tools on this origin (/art/, and the sibling routes the publisher guards): nothing at
//   all — the worker steps aside and the browser talks to the network. Their exclusions must come
//   BEFORE the navigation branch below; that ordering is what makes an exclusion real.
// Each new version of this worker drops the older Futa04 caches (only its own, by prefix).
const PREFIX = cachePrefix();
function cachePrefix() {
  const url = new URL(self.registration.scope);
  // The onboarding line, published beside the released game at /2/. It is its own scope and must
  // never share a cache with the root or with Main: without this branch it would fall through to
  // Main's prefix, and could answer an offline /2/ navigation with Main's page.
  if (url.pathname.includes('/2/')) return 'futa05onboarding-';
  // The /3/ preview (levels 1-10 as the tutorial): its own scope, its own cache.
  if (/^\/3\//.test(url.pathname)) return 'futa05lessons3-';
  if (url.pathname.includes('/futa0.5/')) return 'futa05-';
  // The TEST copy at /test/ (docs/RELEASE-FLOW.md): the same game one promote ahead of the root. Its
  // own prefix, so a newer cache version there can never purge the live game's cache, or vice versa.
  if (/^\/test\//.test(url.pathname)) return 'futa05test-';
  if (url.hostname.endsWith('.chatgpt.site') || url.pathname.includes('/futa0.4/')) return 'futa04-';
  return 'severor-main2-';
}
// v3 (2026-10-19): levels 1-10 became the guided lessons and the campaign was reset, so every
// returning player must get the new app rather than a cached v2 shell.
// v4 (2026-11-12): the Art Lab went live at /art/ on this origin. Workers without the /art/ guard
// saved the lab's page as the game's offline copy when a designer opened it (and cached the lab's
// files), so a new cache name drops those copies on the first launch after this deploy.
// v5 (2026-11-15): the saved page is no longer trusted on its own (see `navigate`). A page could run
// a 150-commit-old shell indefinitely: the worker answered every launch from the saved copy and only
// refreshed it for the NEXT one, and a home-screen app that is resumed never navigates at all. The
// new name makes the first launch of a stuck client start from a copy this worker has proved.
// v6 (2026-11-20): WEB PUSH. The worker now shows a server-sent notification when no game window is
// visible, and opens the game on tap. A new cache name makes every installed app pick the handler up
// on its next launch (a push that arrives before that simply waits in the push service).
const CACHE = `${PREFIX}v6`;
const scope = new URL(self.registration.scope);
const shell = ['./', './index.html', './manifest.webmanifest', './futasaku-icon-192.png', './futasaku-icon-512.png'];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(shell)));
});
// drop older Futa04 caches; also on every page load, since an outgoing worker can still write to
// its cache for a moment after this one takes over
const purge = () => caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))));
self.addEventListener('activate', (e) => e.waitUntil(Promise.all([
  purge(),
  self.registration.navigationPreload?.enable().catch(() => undefined),
]).then(() => self.clients.claim()).then(() => savedPage().then(pageEntry)).then((entry) => {
  // A new worker just took over: pages already running may be a build behind, and a resumed
  // home-screen app will not navigate again today. They are told, and the page decides (menu only).
  if (entry) announce(entry);
}).catch(() => undefined)));
const immutable = (url) => url.pathname.includes('/assets/') || /[?&]v=[0-9a-f]{6,}/.test(url.search);
// The only page this worker may keep as the offline copy is the scope's OWN page. A navigation to a
// sub-page (the Art Lab, the admin dashboard, a forwarding route) must never be saved as the root
// index: with the route guards above that cannot happen, but a guard can be lost in a later edit or
// in a published worker, and this is the one place the mistake would become an offline bug.
const ownPage = (address) => {
  if (!address) return true; // a stubbed/opaque response: nothing to prove wrong
  const path = new URL(address).pathname;
  return path === scope.pathname || path === `${scope.pathname}index.html`;
};
const networkFirst = (req, key) =>
  fetch(req)
    .then(async (res) => {
      if (res.ok) await (await caches.open(CACHE)).put(key, res.clone());
      return res;
    })
    .catch(() => caches.open(CACHE).then((c) => c.match(key, { ignoreSearch: true })));
// THE INSTALLED APP OPENS AT ONCE (owner, 2026-11-06: "after adding the app to home screen it loads
// long and flashes white"): iOS shows a blank WHITE page between its launch screen and the first paint,
// so any wait here is a white flash. A saved page is answered immediately and refreshed in the
// background (its build files are hashed, so an older page still finds its own files); only a first
// visit, with nothing saved yet, waits for the network.
//
// BUT A SAVED PAGE IS ONLY GOOD WHILE ITS OWN BUILD IS STILL ON THE SITE (owner, 2026-11-15: "after
// opening /test on browser mobile - should never ever happen"; his phone ran a page from 2026-11-12,
// 150 commits behind, with board and card pictures painted as the browser's broken-image placeholder).
// The saved copy names the one code file it runs (`assets/index-<hash>.js` in its own HTML). A deploy
// replaces the whole directory, so ONE `HEAD` on that file settles it for the entire build: if it
// answers 404/410 the saved page can no longer run — its own scripts, chunks and pictures are gone —
// and this launch gets the deployed page instead. That is the only launch that pays the white flash,
// and only when it is a real update. Any other answer (200, another status, a network error, a slow
// server) keeps the saved page, so offline and a flaky connection behave exactly as before.
//
// This test lives in the WORKER, not in the page, on purpose: a page from November cannot be fixed by
// new page code it does not contain. The worker is replaced by the browser on its own schedule, so
// this is the only place that can rescue a client which is already stuck.
const ENTRY_FILE = /assets\/index-[A-Za-z0-9_-]+\.js/;
/** The build's entry code file named by a page, e.g. `assets/index-BoVygnnJ.js`. */
const entryOf = (html) => {
  const match = ENTRY_FILE.exec(html || '');
  return match ? match[0] : null;
};
/** The entry file of a stored page, or null when it names none / cannot be read. Never rejects. */
const pageEntry = (res) => (res ? res.clone().text().then(entryOf, () => null) : Promise.resolve(null));
const savedPage = () => caches.open(CACHE).then((c) => c.match('./index.html', { ignoreSearch: true })).catch(() => undefined);
/** The tightest deadline a launch can afford before it must show the saved page. */
const VERIFY_MS = 1200;
/**
 * Is the saved page's own entry file still on the site? One `HEAD`, raced against a short deadline so
 * a slow or offline connection can never hold the launch: a timeout, an error or a server that will
 * not answer HEAD all mean "keep the saved page" (it is the only copy the device has, and the app is
 * not the thing at fault). Only a definite 404/410 means the build is gone.
 */
const stillOnSite = (entry, base) => {
  const head = fetch(new URL(entry, base), { method: 'HEAD', cache: 'no-store' })
    .then((res) => res.status !== 404 && res.status !== 410, () => true);
  const deadline = new Promise((done) => setTimeout(() => done(true), VERIFY_MS));
  return Promise.race([head, deadline]);
};
/**
 * TELL THE PAGES ALREADY RUNNING (a resumed home-screen app never navigates, so no navigation will
 * ever tell it). The page decides what to do — it reloads only on the menu, never over a game — and an
 * older page that does not listen is simply unaffected. The message carries the entry file the site
 * now runs, so the page needs no second download of its own to compare.
 */
const announce = (entry) => {
  const clients = self.clients;
  if (!clients || !clients.matchAll) return;
  clients.matchAll({ type: 'window' })
    .then((list) => { for (const client of list) { try { client.postMessage({ type: 'futa-shell', entry }); } catch { /* a page that cannot take it */ } } })
    .catch(() => undefined);
};
const navigate = async (event) => {
  // The page request is started first, exactly as before: navigation preload is usually already in
  // flight, and a first visit has nothing saved to answer with.
  const started = Promise.resolve(event.preloadResponse).then((preloaded) => preloaded || fetch(event.request));
  const cached = await savedPage();
  const savedEntry = await pageEntry(cached);
  const network = started.then(async (res) => {
    if (res.ok && ownPage(res.url)) {
      const copy = res.clone();
      event.waitUntil(caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => undefined));
      // A deploy landed while pages are open: tell them the entry the saved page now names.
      if (savedEntry) {
        const entry = await pageEntry(res.clone());
        if (entry && entry !== savedEntry) announce(entry);
      }
    }
    return res;
  });
  event.waitUntil(network.then(() => undefined, () => undefined));
  // A STALE-PAGE RECOVERY (owner, 2026-11-08: "territory keeps loading forever"): the page reloads with
  // ?_fresh= when its own code files are gone from the site. Answering that from the same saved page
  // would fail again, so the recovery waits for the network page (the saved one only when offline).
  if (new URL(event.request.url).searchParams.has('_fresh')) return network.catch(() => cached || Response.error());
  if (!cached) return network;
  // A page that names its own entry, whose entry is gone, must not be answered: its code files are
  // gone with it. Offline is never asked (there is no answer to get, and the saved page is the app).
  const offline = self.navigator && self.navigator.onLine === false;
  if (savedEntry && !offline && !(await stillOnSite(savedEntry, event.request.url))) {
    return network.catch(() => cached);
  }
  return cached;
};
// P-5: never cache the duel API. Cross-origin calls already bypass this worker; when the API
// is same-origin under the app path (or proxied), still skip caching match GETs.
const isDuelApi = (url) =>
  url.pathname.includes('/functions/v1/duel') ||
  url.pathname.includes('/v1/matches') ||
  url.pathname.includes('/v1/guests') ||
  url.pathname.includes('/v1/players') ||
  url.pathname.includes('/v1/health') ||
  url.pathname.includes('/v1/push') ||
  url.pathname.includes('/v1/sweep');
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (isDuelApi(url)) return; // network only — never touch the cache
  if (req.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  // The Art Lab (/art/, /test/art/) is a separate tool with its own worker: never cached, never
  // served from here. THIS TEST MUST STAY ABOVE `req.mode === 'navigate'`: `navigate` answers from
  // `./index.html`, so a navigation that reaches it is answered with the GAME. `(\/|$)` also covers
  // the bare `/art`, which forwards to `/art/`.
  if (/\/art(\/|$)/.test(url.pathname)) return;
  if (req.mode === 'navigate') {
    e.waitUntil(purge());
    e.respondWith(navigate(e));
  } else if (immutable(url)) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) await c.put(req, res.clone());
      return res;
    }));
  } else {
    // the manifest is asked for with a one-off ?r= (never cached by address): keep one copy for offline
    e.respondWith(networkFirst(req, url.pathname.endsWith('/manifest.json') ? url.pathname : req));
  }
});

// WEB PUSH (docs/PUSH-NOTIFICATIONS.md). The SERVER decides who is told and what the words are; this
// worker only decides whether to show it. A VISIBLE game window already tells the player, so the
// notification is suppressed there — that is the one rule that keeps a live turn from buzzing the
// phone its owner is already looking at.
//
// Everything is optional: a push with no data, a broken payload or a platform that refuses
// `showNotification` must never surface as an unhandled rejection in the app.
const PUSH_TITLE = 'FUTASAKU';
const PUSH_ICON = './futasaku-icon-192.png';
const pushData = (event) => {
  try {
    const parsed = event.data ? event.data.json() : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};
const visibleWindow = async () => {
  if (!self.clients || !self.clients.matchAll) return false;
  try {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    return windows.some((client) => client.visibilityState === 'visible');
  } catch {
    return false;
  }
};
self.addEventListener('push', (event) => {
  const data = pushData(event);
  const title = typeof data.title === 'string' && data.title ? data.title.slice(0, 80) : PUSH_TITLE;
  const body = typeof data.body === 'string' ? data.body.slice(0, 200) : '';
  const tag = typeof data.tag === 'string' && data.tag ? data.tag.slice(0, 64) : 'futasaku';
  const url = typeof data.url === 'string' && data.url ? data.url : './';
  event.waitUntil((async () => {
    if (await visibleWindow()) return;
    await self.registration.showNotification(title, {
      body,
      tag,
      renotify: false,
      icon: PUSH_ICON,
      badge: './futasaku-tab-48.png',
      data: { url },
    });
  })().catch(() => undefined));
});

// A TAP OPENS THE GAME. Focus an existing window when there is one (never a second copy of the
// game), otherwise open the app; the notification's `url` is always inside this worker's scope.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  event.waitUntil((async () => {
    const target = new URL(typeof raw === 'string' && raw ? raw : './', self.registration.scope).href;
    const windows = self.clients && self.clients.matchAll
      ? await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      : [];
    for (const client of windows) {
      try {
        if ('focus' in client) await client.focus();
        if ('navigate' in client && client.url !== target) await client.navigate(target).catch(() => undefined);
        return;
      } catch { /* try the next window */ }
    }
    if (self.clients && self.clients.openWindow) await self.clients.openWindow(target);
  })().catch(() => undefined));
});
