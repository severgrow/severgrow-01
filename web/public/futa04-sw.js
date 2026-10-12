// Futa04 owns only its scope and cache. It never deletes Main or experimental caches.
//
// What it may answer from its cache, and what it must ask the network for first:
// - pages: network first (offline: the cached page)
// - files whose address can never change content (hashed build files in /assets/, art asked
//   for as file?v=<content hash>): cache first, they are immutable
// - everything else (the art manifest, icons, any unversioned file): network first, falling
//   back to the cache only when offline. A stale copy is never preferred to a fresh one.
// Each new version of this worker drops the older Futa04 caches (only its own, by prefix).
const PREFIX = scopeIsPreview() ? 'futa04-' : 'severor-main2-';
function scopeIsPreview() {
  const url = new URL(self.registration.scope);
  return url.hostname.endsWith('.chatgpt.site') || url.pathname.includes('/futa0.4/');
}
const CACHE = `${PREFIX}v2`;
const scope = new URL(self.registration.scope);
const shell = ['./', './index.html', './manifest.webmanifest', './futasaku-icon-192.png', './futasaku-icon-512.png'];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(shell)));
});
// drop older Futa04 caches; also on every page load, since an outgoing worker can still write to
// its cache for a moment after this one takes over
const purge = () => caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))));
self.addEventListener('activate', (e) => e.waitUntil(purge().then(() => self.clients.claim())));
const immutable = (url) => url.pathname.includes('/assets/') || /[?&]v=[0-9a-f]{6,}/.test(url.search);
const networkFirst = (req, key) =>
  fetch(req)
    .then(async (res) => {
      if (res.ok) await (await caches.open(CACHE)).put(key, res.clone());
      return res;
    })
    .catch(() => caches.open(CACHE).then((c) => c.match(key, { ignoreSearch: true })));
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
    e.respondWith(networkFirst(req, './index.html'));
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
