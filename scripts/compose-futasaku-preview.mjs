// Extend the already-composed Main/Dev/Test2 Pages artifact with an isolated
// Futasaku 0.4 route. The three published game builds stay byte-for-byte intact.
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [site, preview, commit] = process.argv.slice(2);
assert(site && preview && /^[0-9a-f]{40}$/.test(commit), 'site, preview and full commit SHA required');
const route = 'futa0.4';
cpSync(preview, join(site, route), { recursive: true });
writeFileSync(join(site, route, 'release.json'), JSON.stringify({ channel: 'Futasaku0.4', commit }, null, 2) + '\n');

// Main's root-scope worker would otherwise cache the preview navigation as
// Main's offline index on a visitor's first load. Add only this path exclusion;
// Main's own fetch/cache behaviour and every other file remain unchanged.
const workerPath = join(site, 'sw.js');
const worker = readFileSync(workerPath, 'utf8');
const prior = '/\\/test2?(\\/|$)/';
const scoped = '/\\/(?:test2?|futa0[.]4)(\\/|$)/';
assert(worker.includes(prior) && !worker.includes(scoped), 'Review changed Main worker before publication');
writeFileSync(workerPath, worker.replace(prior, scoped));
assert(readFileSync(join(site, route, 'index.html'), 'utf8').includes('./assets/'), 'Preview must use relative asset paths');
console.log(`Added /${route}/ at ${commit}`);
