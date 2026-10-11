// Extend the already-composed Main/Dev/Test2 Pages artifact with the Futasaku routes:
// /futa0.4/ (the game, branch futa0.4) and, when given, /futa-test/ (the test copy, branch
// futa-test). The three older published game builds stay byte-for-byte intact.
// Usage: node compose-futasaku-preview.mjs <site> <futa0.4 dist> <futa0.4 sha> [<futa-test dist> <futa-test sha>]
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [site, game, gameCommit, test, testCommit] = process.argv.slice(2);
const sha = (s) => /^[0-9a-f]{40}$/.test(s ?? '');
assert(site && game && sha(gameCommit), 'site, game dist and full commit SHA required');
assert(!test || sha(testCommit), 'the test copy needs its full commit SHA');

const add = (route, dist, commit, channel) => {
  cpSync(dist, join(site, route), { recursive: true });
  writeFileSync(join(site, route, 'release.json'), JSON.stringify({ channel, commit }, null, 2) + '\n');
  assert(readFileSync(join(site, route, 'index.html'), 'utf8').includes('./assets/'), `${route} must use relative asset paths`);
  console.log(`Added /${route}/ at ${commit}`);
};
add('futa0.4', game, gameCommit, 'Futasaku0.4');
if (test) add('futa-test', test, testCommit, 'Futasaku test copy');

// Main's root-scope worker would otherwise cache a Futasaku page as Main's offline index on a
// visitor's first load. Add only these path exclusions; Main's own fetch/cache behaviour and
// every other file remain unchanged.
const workerPath = join(site, 'sw.js');
const worker = readFileSync(workerPath, 'utf8');
const prior = '/\\/test2?(\\/|$)/';
const scoped = '/\\/(?:test2?|futa0[.]4|futa-test)(\\/|$)/';
assert(worker.includes(prior) && !worker.includes(scoped), 'Review changed Main worker before publication');
writeFileSync(workerPath, worker.replace(prior, scoped));
