// /3/ — LEVELS 1-10 AS THE TUTORIAL (owner brief, 2026-10-18).
//
// Run by the preview workflow AFTER the FUTASAKU 0.5 composer (futa0.5-online's
// scripts/compose-futa05-preview.mjs), the same way /2/ is published: the root and /2/ stay exactly
// as that composer left them, and the `futa0.5-onboarding-3` build is copied beside them at /3/.
//
//   node lessons3/scripts/compose-lessons3.mjs site lessons3/web/dist <fullCommitSha>
//
// Two things, both checked rather than trusted:
//   1. /3/ gets the build (relative asset paths, its own release note). It registers its own service
//      worker under /3/, whose cache name is its own (web/public/futa04-sw.js: `futa05lessons3-`).
//   2. The ROOT worker must never treat a /3/ page as the root's offline copy: its sibling-route guard
//      (installed by the 0.5 composer, marked with GUARD_COMMENT) gets `3` added to its route list.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const assert = (ok, message) => { if (!ok) { console.error(`compose-lessons3: ${message}`); process.exit(1); } };
const [site, dist, commit] = process.argv.slice(2);
assert(site && dist && /^[0-9a-f]{40}$/.test(commit ?? ''), 'Usage: site dist fullCommitSha');

const source = resolve(dist);
assert(existsSync(join(source, 'index.html')), `the /3 build has no index.html: ${dist}`);
assert(readFileSync(join(source, 'index.html'), 'utf8').includes('./assets/'), 'the /3 build must use relative asset paths to work at /3/');
const target = join(site, '3');
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
writeFileSync(
  join(target, 'release.json'),
  JSON.stringify({ channel: 'FUTASAKU levels 1-10 as the tutorial', commit }, null, 2) + '\n',
);

// The root worker's guard: the line the 0.5 composer installed, with `3` joined to its routes.
const GUARD_COMMENT = "// a sibling channel is never this worker's page";
const worker = join(site, 'futa04-sw.js');
assert(existsSync(worker), 'no root worker at site/futa04-sw.js: run this after the FUTASAKU 0.5 composer');
const lines = readFileSync(worker, 'utf8').split('\n');
const at = lines.findIndex((line) => line.includes(GUARD_COMMENT));
assert(at >= 0, 'the root worker has no sibling-route guard: review the 0.5 composer before publishing /3/');
const guard = lines[at];
const routes = /\(\?:([^)]*)\)\(\\\/\|\$\)/.exec(guard);
assert(!!routes, `unexpected guard shape, review it: ${guard.trim()}`);
const list = routes[1].split('|');
if (!list.includes('3')) {
  lines[at] = guard.replace(routes[0], routes[0].replace(routes[1], [...list, '3'].join('|')));
  writeFileSync(worker, lines.join('\n'));
}
assert(/\|3\)\(\\\/\|\$\)/.test(readFileSync(worker, 'utf8')), 'the root worker guard does not cover /3/');
console.log(`/3/      = levels 1-10 as the tutorial (${commit.slice(0, 7)})`);
