// Extend the already-composed Main/Dev/Test2 Pages artifact with isolated
// Futasaku 0.4 (+ optional TEST) routes. Published Main/Dev/Test2 stays intact.
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [site, preview, commit, testDist] = process.argv.slice(2);
assert(site && preview && /^[0-9a-f]{40}$/.test(commit), 'site, preview and full commit SHA required');

const addRoute = (route, dist, channel) => {
  cpSync(dist, join(site, route), { recursive: true });
  writeFileSync(join(site, route, 'release.json'), JSON.stringify({ channel, commit }, null, 2) + '\n');
  assert(readFileSync(join(site, route, 'index.html'), 'utf8').includes('./assets/'), `${route} must use relative asset paths`);
  console.log(`Added /${route}/ at ${commit}`);
};

addRoute('futa0.4', preview, 'Futasaku0.4');
if (testDist && existsSync(testDist)) addRoute('futa-test', testDist, 'Futasaku-TEST');

// Main's root-scope worker would otherwise cache the preview navigation as
// Main's offline index on a visitor's first load. Add only this path exclusion;
// Main's own fetch/cache behaviour and every other file remain unchanged.
const workerPath = join(site, 'sw.js');
const worker = readFileSync(workerPath, 'utf8');
const prior = '/\\/test2?(\\/|$)/';
const already = '/\\/(?:test2?|futa0[.]4|futa-test)(\\/|$)/';
const fromPreview = '/\\/(?:test2?|futa0[.]4)(\\/|$)/';
if (worker.includes(already)) {
  // nothing to do
} else if (worker.includes(fromPreview)) {
  writeFileSync(workerPath, worker.replace(fromPreview, already));
} else {
  assert(worker.includes(prior), 'Review changed Main worker before publication');
  writeFileSync(workerPath, worker.replace(prior, already));
}
