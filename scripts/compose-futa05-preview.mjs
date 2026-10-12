// Phase 8 — add /futa0.5/ into an already-composed Pages site tree (does not rebuild Main).
//   node scripts/compose-futa05-preview.mjs site web/dist <full-commit-sha>
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [site, dist, commit] = process.argv.slice(2);
assert(site && dist && /^[0-9a-f]{40}$/.test(commit ?? ''), 'Usage: site dist fullCommitSha');
assert(existsSync(join(dist, 'index.html')), `missing ${dist}/index.html`);

const route = 'futa0.5';
cpSync(dist, join(site, route), { recursive: true });
writeFileSync(join(site, route, 'release.json'), JSON.stringify({ channel: 'Futasaku0.5', commit }, null, 2) + '\n');
assert(readFileSync(join(site, route, 'index.html'), 'utf8').includes('./assets/'), `${route} must use relative asset paths`);

// Main's root-scope worker must not cache /futa0.5/ as Main's offline index.
const workerPath = join(site, 'sw.js');
if (existsSync(workerPath)) {
  const worker = readFileSync(workerPath, 'utf8');
  const with05 = '/\\/(?:test2?|futa0[.]4|futa0[.]5|futa-test)(\\/|$)/';
  const withTest = '/\\/(?:test2?|futa0[.]4|futa-test)(\\/|$)/';
  const fromPreview = '/\\/(?:test2?|futa0[.]4)(\\/|$)/';
  const prior = '/\\/test2?(\\/|$)/';
  if (worker.includes(with05) || worker.includes('futa0[.]5') || worker.includes('futa0.5')) {
    // already excluded
  } else if (worker.includes(withTest)) {
    writeFileSync(workerPath, worker.replace(withTest, with05));
  } else if (worker.includes(fromPreview)) {
    writeFileSync(workerPath, worker.replace(fromPreview, with05));
  } else {
    assert(worker.includes(prior), 'Review changed Main worker before publication');
    writeFileSync(workerPath, worker.replace(prior, with05));
  }
}

console.log(`Added /${route}/ at ${commit}`);
