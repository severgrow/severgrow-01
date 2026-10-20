// Compose the FUTASAKU 0.5 route AND the site root map into an already-composed Pages tree.
//
//   node scripts/compose-futa05-preview.mjs site web/dist <full-commit-sha>
//
// Owner decision (2026-10-14): `https://www.futasaku.com/` serves FUTASAKU 0.5, and the build that
// used to be the root (Main — the original "Severor" release) moves, byte for byte, to `/firststep/`.
// `/futa0.4/`, `/futa-test/`, `/test/` and `/test2/` keep serving exactly what they served before.
//
// WHY THIS FILE OWNS THE ROOT — and why nothing else had to change to make that stick
// ---------------------------------------------------------------------------------
// Two workflows publish this Pages site and both use concurrency group `pages`:
//   * pages.yml               — main + /test/ + /test2/ (last ran 2026-10-06; dormant since)
//   * futasaku04-preview.yml  — the same three, rebuilt from their published SHAs, plus the
//                               futa routes. This one has published the site since 2026-10-06.
// Whichever deploy lands last decides the bytes, so both had to agree on the root or the site would
// flip between two states.
//
// This script is the futa0.5-online copy, and futasaku04-preview.yml runs it as
// `futa05/scripts/compose-futa05-preview.mjs` — i.e. it always executes the futa0.5-online version,
// whether the workflow was triggered by a push to futa0.5-online (`futa05` = that push) or to
// futa0.4 (`futa05` = futa0.5-online HEAD). So the root map below is applied identically for both
// trigger refs, and the workflow file itself needs no edit on either branch. That is the only
// arrangement here that cannot produce two different roots.
//
// THE ADMIN DASHBOARD (docs/ADMIN.md) IS OPT-IN, AND THAT IS DELIBERATE.
// `adminDist` is an OPTIONAL fourth argument. The workflow does not pass it unless the repository
// variable ADMIN_ROUTE is '1', so a plain push composes a byte-identical site and cannot publish
// /admin/ by accident. When it IS passed, the dashboard's own build is copied to /admin/ and the
// route joins SIBLING_ROUTES so neither the root promotion nor the worker guards can sweep it away.
import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [site, dist, commit, adminDist, onboardingDist, onboardingSha] = process.argv.slice(2);
assert(site && dist && /^[0-9a-f]{40}$/.test(commit ?? ''), 'Usage: site dist fullCommitSha [adminDist] [onboardingDist onboardingSha]');
assert(existsSync(join(dist, 'index.html')), `missing ${dist}/index.html`);
assert(
  readFileSync(join(dist, 'index.html'), 'utf8').includes('./assets/'),
  'the FUTASAKU 0.5 build must use relative asset paths to work at the root',
);

/** Routes that live beside the root and must never be swept into /firststep/. */
const SIBLING_ROUTES = ['admin', 'firststep', 'test', 'test2', 'futa0.4', 'futa-test', 'futa0.5', '2', '3'];

/**
 * Main's own worker must not treat a sibling route as its offline index. compose-pages.mjs and
 * compose-futasaku-preview.mjs already exclude these; repeated here so this script is correct on its
 * own, whichever older copy of them runs first.
 */
const patchMainWorker = (path) => {
  if (!existsSync(path)) return;
  const worker = readFileSync(path, 'utf8');
  const excludedNow = '/\\/(?:test2?|futa0[.]4|futa0[.]5|futa-test|admin)(\\/|$)/';
  const excludedBefore = '/\\/(?:test2?|futa0[.]4|futa-test)(\\/|$)/';
  const excludedFirst = '/\\/(?:test2?|futa0[.]4)(\\/|$)/';
  const original = '/\\/test2?(\\/|$)/';
  // The early return stays keyed on `futa0[.]5`: a worker that already mentions it was patched by an
  // earlier copy of this script, and re-deriving the exact old text to add `admin` would risk an
  // assert in a live deploy. Main's worker is scoped to /firststep/ after the move, so it can never
  // serve /admin/ — the guard that must know about /admin/ is the ROOT worker (see patchRootWorker).
  if (worker.includes(excludedNow) || worker.includes('futa0[.]5')) return;
  // Replacer functions, not strings: these patterns contain `$`, which a replacement string mangles.
  if (worker.includes(excludedBefore)) writeFileSync(path, worker.replace(excludedBefore, () => excludedNow));
  else if (worker.includes(excludedFirst)) writeFileSync(path, worker.replace(excludedFirst, () => excludedNow));
  else {
    assert(worker.includes(original), 'Review the changed Main worker before publication');
    writeFileSync(path, worker.replace(original, () => excludedNow));
  }
};

/** The marker every route guard carries, so a later run can replace it instead of doubling it. */
const GUARD_COMMENT = "// a sibling channel is never this worker's page";

/**
 * FUTASAKU 0.5 owns scope "/" from the root. Its worker may only answer for its own routes: the
 * navigate handler caches whatever page it served under the root index, so without this a visit to
 * /firststep/ would leave Main's page as the offline copy of the root.
 */
const patchRootWorker = (path) => {
  assert(existsSync(path), `missing ${path}`);
  const worker = readFileSync(path, 'utf8');
  // `/admin/` is in this guard because the dashboard is served from the ROOT's scope: without the
  // early return, a visit to /admin/ would be cached by this worker as the root's offline index.
  // `/2/` and `/3/` are the retired preview lines: each now holds only a forwarding page and a worker
  // that removes itself (compose-retired-routes.mjs), and the root's worker must never cache those.
  const guard = String.raw`  if (/^\/(?:firststep|test2?|futa0[.]4|futa0[.]5|futa-test|admin|2|3)(\/|$)/.test(url.pathname)) return; ${GUARD_COMMENT}`;
  // A guard installed by an earlier copy of this script is REPLACED, never doubled: the route list
  // grows over time, and appending a second guard line would leave the old one in place forever.
  const without = worker.split('\n').filter((line) => !line.includes(GUARD_COMMENT)).join('\n');
  const anchor = String.raw`  if (req.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;`;
  assert(without.includes(anchor), 'Review the changed FUTASAKU 0.5 worker before publishing it at the root');
  // A replacer function, not a string: the guard contains `$`, which a replacement string mangles.
  const next = without.replace(anchor, () => `${anchor}\n${guard}`);
  if (next !== worker) writeFileSync(path, next);
};

/**
 * The build that just left the root registered its worker from `/sw.js` with scope "/". Two
 * registrations at one scope would fight over it, and the old one could answer an offline navigation
 * with the Main page. This worker handles no request — it only removes itself. It deliberately
 * leaves every cache alone: Main's own cache is reused by Main at /firststep/.
 */
const LEGACY_ROOT_WORKER = `// Legacy cleanup for a visitor who opened the site root before FUTASAKU 0.5 moved there.
//
// This address used to serve Main's offline worker, registered over the whole site. The root is now
// the FUTASAKU 0.5 app, which registers ./futa04-sw.js, so that old worker must go: two registrations
// at scope "/" would fight over it, and the old one could answer an offline navigation with the
// Main (Severor) page. This worker never handles a request; it only removes itself.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.registration.unregister());
});
`;

/**
 * Shared /futa0.5/ links keep working: the app moved to the root, so this is a forwarding page.
 *
 * It carries the root's OWN share metadata (lifted from the build it forwards to) so a link that was
 * shared while the game still lived at /futa0.5/ still previews correctly: a scraper reads this page
 * before any script runs, and without the tags it would find no picture at all. Reusing the build's
 * tags — rather than repeating the words here — is what keeps the two from drifting apart.
 */
const shareMeta = (html) => {
  const tags = [...html.matchAll(/<meta\s+(?:property|name)="(?:og:[^"]+|twitter:[^"]+)"[^>]*>/g)].map((m) => m[0]);
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? 'FUTASAKU';
  return { title, tags };
};
const redirectHtml = (distHtml) => {
  const { title, tags } = shareMeta(distHtml);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <meta name="robots" content="noindex" />
    <link rel="canonical" href="https://www.futasaku.com/" />
${tags.map((tag) => `    ${tag}`).join('\n')}
    <script>
      // Invite links look like /futa0.5/#/join/CODE: keep the query string and the hash.
      location.replace('/' + location.search + location.hash);
    </script>
    <!-- No JavaScript (or a blocked redirect): the app is at the root either way. -->
    <meta http-equiv="refresh" content="0; url=/" />
  </head>
  <body>
    <p>FUTASAKU is at <a href="/">www.futasaku.com</a>.</p>
  </body>
</html>
`;
};

// 1. Make Main's worker safe while it is still at the root.
patchMainWorker(join(site, 'sw.js'));

// 2. The published Main/Test/Test2 SHAs live in the root release.json and stay there: the preview
//    workflow reads them from that exact address to know what to rebuild on the next run.
const release = JSON.parse(readFileSync(join(site, 'release.json'), 'utf8'));
assert(/^[0-9a-f]{40}$/.test(release.main ?? ''), 'the composed root release.json must name Main');

// 3. Move the previous root — Main, the Severor build — to /firststep/, byte for byte. Everything
//    that is not a sibling route is Main's: the composed root holds nothing else. Start from an empty
//    /firststep/ so the move is a plain rename and never depends on what a previous tree left behind.
const firststep = join(site, 'firststep');
rmSync(firststep, { recursive: true, force: true });
mkdirSync(firststep, { recursive: true });
const moved = [];
for (const entry of readdirSync(site)) {
  if (entry === 'firststep' || entry === 'release.json' || entry === '.nojekyll') continue;
  if (SIBLING_ROUTES.includes(entry)) continue;
  renameSync(join(site, entry), join(firststep, entry));
  moved.push(entry);
}
assert(moved.includes('index.html'), 'no Main build found at the composed root to move to /firststep/');
assert(existsSync(join(firststep, 'assets')), 'no Main assets found at the composed root to move to /firststep/');

// 4. Promote the FUTASAKU 0.5 build to the root: it is the product at https://www.futasaku.com/.
cpSync(dist, site, { recursive: true });
assert(
  readFileSync(join(site, 'index.html')).equals(readFileSync(join(dist, 'index.html'))),
  'the site root must be exactly the FUTASAKU 0.5 build',
);
// What this build is, beside the files it is: the same note each other route carries.
writeFileSync(
  join(firststep, 'release.json'),
  JSON.stringify({ channel: 'Severor (Main, moved off the root to /firststep/)', commit: release.main }, null, 2) + '\n',
);

// 5. The root now belongs to FUTASAKU 0.5: retire the old root worker, and keep the new one inside
//    its own routes.
writeFileSync(join(site, 'sw.js'), LEGACY_ROOT_WORKER);
patchRootWorker(join(site, 'futa04-sw.js'));

// 6. /futa0.5/ forwards to the root so every shared link keeps working.
mkdirSync(join(site, 'futa0.5'), { recursive: true });
// The publisher reads the FUTASAKU 0.5 build it just promoted to the root, so the forwarding page
// carries that build's own share tags (title, og:image, twitter:image) — a link shared while the
// game lived at /futa0.5/ still previews with the current card.
writeFileSync(join(site, 'futa0.5', 'index.html'), redirectHtml(readFileSync(join(site, 'index.html'), 'utf8')));
writeFileSync(join(site, 'futa0.5', 'release.json'), JSON.stringify({ channel: 'Futasaku0.5', commit, movedTo: '/' }, null, 2) + '\n');

// 6c. /2/ — the ONBOARDING line (owner direction, 2026-10-17).
//
// The root keeps the released campaign, exactly as it shipped. The teaching work — levels 1-10 on the
// small map, the tap feedback — is built from the `futa0.5-onboarding` branch and published beside the
// root, so it can be played on a real phone at futasaku.com/2 without changing what everyone else
// gets at futasaku.com. Optional: a run without the argument composes exactly the site it composed
// before, so a push to futa0.4 cannot publish a half-built /2 by accident.
if (onboardingDist) {
  assert(/^[0-9a-f]{40}$/.test(onboardingSha ?? ''), 'the /2 build must be published with its exact commit');
  const source = resolve(onboardingDist);
  assert(existsSync(join(source, 'index.html')), `the /2 build has no index.html: ${onboardingDist}`);
  // The one property that decides whether a page works from a subdirectory at all.
  assert(
    readFileSync(join(source, 'index.html'), 'utf8').includes('./assets/'),
    'the /2 build must use relative asset paths to work at /2/',
  );
  const target = join(site, '2');
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
  writeFileSync(
    join(target, 'release.json'),
    JSON.stringify({ channel: 'FUTASAKU onboarding (campaign as the tutorial)', commit: onboardingSha }, null, 2) + '\n',
  );
  console.log(`/2/      = the onboarding line (${onboardingSha.slice(0, 7)})`);
} else {
  console.log('/2/      = not included (no onboarding build was passed)');
}

// 6b. The ADMIN DASHBOARD at /admin/ — OPT-IN (docs/ADMIN.md §7).
//
// Nothing here runs unless the workflow passes a fourth argument, which it does only when the
// repository variable ADMIN_ROUTE is '1'. A plain push therefore composes exactly the site it
// composed before, and cannot publish the dashboard by accident.
//
// The build is verified rather than trusted: it must use RELATIVE asset paths (base './'), which is
// the one property that decides whether the page works from a subdirectory at all.
if (adminDist) {
  const source = resolve(adminDist);
  assert(existsSync(join(source, 'index.html')), `the admin build passed to the composer has no index.html: ${adminDist}`);
  const target = join(site, 'admin');
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
  const adminHtml = readFileSync(join(target, 'index.html'), 'utf8');
  assert(adminHtml.includes('./admin.js'), 'the admin build must reference its entry relatively (base: "./")');
  assert(adminHtml.includes('./admin.css'), 'the admin build must reference its stylesheet relatively (base: "./")');
  assert(existsSync(join(target, 'admin.js')) && existsSync(join(target, 'admin.css')), 'the admin build is missing its entry files');
  // It must never register a service worker: the root's worker owns this origin, and a second
  // registration at the same scope would fight it.
  assert(!adminHtml.includes('serviceWorker'), 'the admin build must not register a service worker');
  writeFileSync(join(target, 'release.json'), JSON.stringify({ channel: 'FUTASAKU Admin', commit }, null, 2) + '\n');
  console.log(`/admin/  = the admin dashboard (${adminDist})`);
} else {
  console.log('/admin/  = not included (no admin build was passed; set ADMIN_ROUTE=1 to publish it)');
}

// 7. The workflow's parity guard still expects Main at the root. Install the guard that knows where
//    Main went — the workflow line itself is untouched, so a push to futa0.4 (which runs its own
//    copy of the workflow) compares exactly the same way as a push to futa0.5-online.
const guardSource = readFileSync(fileURLToPath(new URL('./check-pages-parity-root.mjs', import.meta.url)), 'utf8');
const guardTarget = resolve('preview/scripts/check-pages-parity.mjs');
assert(
  existsSync(guardTarget),
  'expected the futa0.4 checkout at preview/scripts/check-pages-parity.mjs (this script runs inside the preview workflow)',
);
const installed = readFileSync(guardTarget, 'utf8');
if (installed !== guardSource) {
  assert(
    installed.includes("const files = ['index.html', 'test/index.html', 'test2/index.html', 'release.json', 'test2/release.json'];"),
    'preview/scripts/check-pages-parity.mjs was changed on its branch: port the change into scripts/check-pages-parity-root.mjs before publishing',
  );
  writeFileSync(guardTarget, guardSource);
}

console.log(`Root = FUTASAKU 0.5 ${commit}; /firststep/ = Main ${release.main}; /futa0.5/ -> /${onboardingDist ? '; /2/ = onboarding' : ''}`);
