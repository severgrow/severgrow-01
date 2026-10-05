// Test2 owns only its scope and cache. It never deletes Main or experimental caches.
const CACHE = 'severor-main2-v1';
const scope = new URL(self.registration.scope);
const shell = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(shell)));
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(async (res) => {
      if (res.ok) await (await caches.open(CACHE)).put('./index.html', res.clone());
      return res;
    }).catch(() => caches.open(CACHE).then((c) => c.match('./index.html'))));
  } else {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) await c.put(req, res.clone());
      return res;
    }));
  }
});
