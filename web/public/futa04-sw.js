// Futa04 owns only its scope and cache. It never deletes Main or experimental caches.
//
// What it may answer from its cache, and what it must ask the network for first:
// - pages: network first (offline: the cached page)
// - files whose address can never change content (hashed build files in /assets/, art asked
//   for as file?v=<content hash>): cache first, they are immutable
// - everything else (the art manifest, icons, any unversioned file): network first, falling
//   back to the cache only when offline. A stale copy is never preferred to a fresh one.
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
const CACHE = `${PREFIX}v3`;
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
]).then(() => self.clients.claim())));
const immutable = (url) => url.pathname.includes('/assets/') || /[?&]v=[0-9a-f]{6,}/.test(url.search);
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
// background for the next launch (its build files are hashed, so an older page still finds its own
// files); only a first visit, with nothing saved yet, waits for the network.
const navigate = async (event) => {
  const network = Promise.resolve(event.preloadResponse).then((preloaded) => preloaded || fetch(event.request))
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => undefined));
      }
      return res;
    });
  event.waitUntil(network.then(() => undefined, () => undefined));
  const cached = await caches.open(CACHE).then((c) => c.match('./index.html', { ignoreSearch: true })).catch(() => undefined);
  // A STALE-PAGE RECOVERY (owner, 2026-11-08: "territory keeps loading forever"): the page reloads with
  // ?_fresh= when its own code files are gone from the site. Answering that from the same saved page
  // would fail again, so the recovery waits for the network page (the saved one only when offline).
  if (new URL(event.request.url).searchParams.has('_fresh')) return network.catch(() => cached || Response.error());
  return cached || network;
};
// P-5: never cache the duel API. Cross-origin calls already bypass this worker; when the API
// is same-origin under the app path (or proxied), still skip caching match GETs.
const isDuelApi = (url) =>
  url.pathname.includes('/functions/v1/duel') ||
  url.pathname.includes('/v1/matches') ||
  url.pathname.includes('/v1/guests') ||
  url.pathname.includes('/v1/players') ||
  url.pathname.includes('/v1/health') ||
  url.pathname.includes('/v1/sweep');
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (isDuelApi(url)) return; // network only — never touch the cache
  if (req.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
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
