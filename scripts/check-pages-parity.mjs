// Abort preview publication if rebuilding current Main/Dev/Test2 would alter
// their published HTML, entry assets or release metadata.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const site = process.argv[2];
assert(site, 'Composed Pages directory required');
const base = 'https://severgrow.github.io/severgrow-01/';
const files = ['index.html', 'test/index.html', 'test2/index.html', 'release.json', 'test2/release.json'];
for (const prefix of ['', 'test/', 'test2/']) {
  for (const name of readdirSync(join(site, prefix, 'assets')))
    if (/^index-.+\.(?:js|css)$/.test(name)) files.push(`${prefix}assets/${name}`);
}
for (const file of files) {
  const url = new URL(file, base);
  url.searchParams.set('parity', String(Date.now()));
  // curl honours the CI/local HTTPS proxy and fails closed on a missing route.
  const published = execFileSync('curl', ['-fsSL', '--retry', '3', '-H', 'Cache-Control: no-cache', url.href]);
  const candidate = readFileSync(join(site, file));
  assert(candidate.equals(published), `Preview would alter published ${file}`);
  console.log(`Published ${file}: identical`);
}
