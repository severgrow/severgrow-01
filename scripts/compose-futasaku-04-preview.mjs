// Extend the already-composed Pages artifact with an isolated Futasaku 0.4
// route. Main, Dev, Test2 and the Futasaku 0.3 preview stay in place. The only
// edit outside the new directory is one extra path exclusion in Main's worker,
// so a first visit cannot cache the 0.4 page as Main's offline index.
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [site, preview, commit] = process.argv.slice(2);
assert(site && preview && /^[0-9a-f]{40}$/.test(commit), 'site, preview and full commit SHA required');
const route = 'futasaku-04-preview';
cpSync(preview, join(site, route), { recursive: true });
writeFileSync(join(site, route, 'release.json'), JSON.stringify({ channel: 'Futasaku0.4', commit }, null, 2) + '\n');

const workerPath = join(site, 'sw.js');
const worker = readFileSync(workerPath, 'utf8');
const prior = '/\\/(?:test2?|futasaku-03-preview)(\\/|$)/';
const scoped = '/\\/(?:test2?|futasaku-03-preview|futasaku-04-preview)(\\/|$)/';
assert(worker.includes(prior) && !worker.includes('futasaku-04-preview'), 'Review changed Main worker before publication');
writeFileSync(workerPath, worker.replace(prior, scoped));
const page = readFileSync(join(site, route, 'index.html'), 'utf8');
assert(page.includes('./assets/'), 'Preview must use relative asset paths');
// The boot script stores the address inside a regular expression, so the slashes are escaped.
assert(page.includes('futasaku-04-preview') && page.includes("'futasaku04:'"), 'Preview boot must isolate Futasaku 0.4 storage');
assert(readFileSync(join(site, 'futasaku-03-preview', 'release.json'), 'utf8').includes('"channel": "Futasaku0.3"'), 'Futasaku 0.3 release must stay in place');
console.log(`Added /${route}/ at ${commit}`);
