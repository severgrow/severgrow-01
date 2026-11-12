// THE ART LAB OWNS /art/ (futasaku.com/art). Its scope is /art/ — narrower than the game's worker,
// which owns "/" — so for a page under /art/ this worker decides, not the game's offline cache.
//
// Why it exists: the game's worker answers a navigation from its saved page (that is how the game
// opens fast on a phone). A page at /art/ must never be answered from another route's saved page, and
// must never be saved as one. This worker therefore answers the lab's own navigations from the
// NETWORK with `cache: 'reload'`: GitHub Pages serves HTML with `max-age=600`, and a document held in
// the browser's HTTP cache is the one thing that can show a designer something other than the lab.
// `reload` also refreshes that cache entry.
//
// Nothing is stored here. The lab is a tool used online, its build files are content-hashed (so they
// need no worker), and a stale page is exactly the failure this worker prevents. If the network is
// unreachable, the ordinary fetch is tried once more, which may still answer from the HTTP cache: an
// out-of-date lab is better than no lab at all.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  event.respondWith(fetch(request, { cache: 'reload' }).catch(() => fetch(request)));
});
