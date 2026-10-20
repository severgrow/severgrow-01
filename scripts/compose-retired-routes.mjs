// /2/ and /3/ — RETIRED PREVIEW LINES (owner decision, 2026-10-20).
//
//   node futa05/scripts/compose-retired-routes.mjs site
//
// Run by the preview workflow AFTER compose-futa05-preview.mjs. Everything /2/ (the onboarding line)
// and /3/ (levels 1-10 as the tutorial) previewed now ships at the root, so neither is built any more.
// Their addresses keep working, and a phone that installed one of them is cleaned up:
//   1. index.html forwards to the root, keeping the query string and the hash (invite links).
//   2. futa04-sw.js — the worker those builds registered under /2/ and /3/ — is replaced by one that
//      deletes its own route's cache, unregisters itself and sends any open tab to the root. The
//      browser checks a registered worker's script on every navigation, so the old offline copy is
//      gone after one visit. It never touches the root's, Main's or any other route's caches.
//   3. The root worker's sibling-route guard covers both routes (compose-futa05-preview.mjs), so the
//      root never keeps one of these pages as its offline copy.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [site] = process.argv.slice(2);
assert(site && existsSync(join(site, 'index.html')), 'Usage: compose-retired-routes.mjs <composed site>');

/** Each retired route, and the cache prefix its worker used (web/public/futa04-sw.js). */
const RETIRED = { 2: 'futa05onboarding-', 3: 'futa05lessons3-' };

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>FUTASAKU</title>
    <meta name="robots" content="noindex" />
    <link rel="canonical" href="https://www.futasaku.com/" />
    <script>
      location.replace('/' + location.search + location.hash);
    </script>
    <meta http-equiv="refresh" content="0; url=/" />
  </head>
  <body>
    <p>FUTASAKU is at <a href="/">www.futasaku.com</a>.</p>
  </body>
</html>
`;

const worker = (prefix) => `// This preview line is retired: FUTASAKU lives at the root. This worker replaces the one the preview
// registered here; it never answers a request. It deletes this route's own cache, removes itself and
// sends any open tab to the root.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(${JSON.stringify(prefix)})).map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((tabs) => Promise.all(tabs.map((tab) => tab.navigate('/').catch(() => undefined)))),
  );
});
`;

for (const [route, prefix] of Object.entries(RETIRED)) {
  const target = join(site, route);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'index.html'), page);
  writeFileSync(join(target, 'futa04-sw.js'), worker(prefix));
  writeFileSync(join(target, 'release.json'), JSON.stringify({ channel: 'retired preview', movedTo: '/' }, null, 2) + '\n');
  console.log(`/${route}/      = retired, forwards to /`);
}

const rootWorker = readFileSync(join(site, 'futa04-sw.js'), 'utf8');
assert(/\|2\|3\)\(\\\/\|\$\)/.test(rootWorker), 'the root worker guard must cover /2/ and /3/');
