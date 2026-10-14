// Parity guard for the re-mapped site root.
//
// The original guard (`scripts/check-pages-parity.mjs` on the `futa0.4` line, which the preview
// workflow calls) asserted that the published site ROOT still holds exactly Main's bytes. The owner
// moved the root to the Futasaku 0.5 build, so Main — the original "Severor" release — now lives at
// `/firststep/`. This guard follows Main's bytes to their new address instead of comparing the root,
// because the root is now a preview channel and is *expected* to change on every deploy.
//
// What it still refuses to let a deploy alter: Main, `/test/` and `/test2/`. That is the whole
// point of the guard, and it is unchanged.
//
// `scripts/compose-futa05-preview.mjs` installs this file over the `futa0.4` copy right before the
// workflow runs it — see the comment there for why the workflow line itself is not edited.
//
//   node scripts/check-pages-parity-root.mjs <site>
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const site = process.argv[2];
assert(site, 'Composed Pages directory required');

const base = 'https://severgrow.github.io/severgrow-01/';
const url = (file) => {
  const target = new URL(file, base);
  target.searchParams.set('parity', String(Date.now()));
  return target.href;
};
const get = (file) =>
  execFileSync('curl', ['-fsSL', '--retry', '3', '-H', 'Cache-Control: no-cache', url(file)]);
const status = (file) =>
  execFileSync(
    'curl',
    ['-sSL', '-o', '/dev/null', '-w', '%{http_code}', '--retry', '3', '-H', 'Cache-Control: no-cache', url(file)],
    { encoding: 'utf8' },
  ).trim();

/** The build entry files (hashed, so their names are stable only while the build is). */
const entryAssets = (prefix) => {
  const dir = join(site, prefix, 'assets');
  assert(existsSync(dir), `composed site is missing ${prefix}assets/`);
  return readdirSync(dir)
    .filter((name) => /^index-.+\.(?:js|css)$/.test(name))
    .map((name) => `${prefix}assets/${name}`);
};

const identical = (file, publishedFile = file) => {
  const candidate = readFileSync(join(site, file));
  assert(candidate.equals(get(publishedFile)), `Preview would alter published ${publishedFile}`);
  console.log(`Published ${publishedFile}: identical`);
};

// /test/ and /test2/ are rebuilt from their published SHAs and must not move by a single byte.
for (const file of [
  'test/index.html',
  'test2/index.html',
  'release.json',
  'test2/release.json',
  ...entryAssets('test/'),
  ...entryAssets('test2/'),
])
  identical(file);

// Main: compare where Main is actually published. On the one run that performs the move it is still
// at the root; from then on it is at /firststep/. One layout, one check, no bootstrap deadlock.
const publishedMain = status('firststep/index.html') === '200' ? 'firststep/' : '';
console.log(
  publishedMain
    ? 'Main is published at /firststep/ — comparing there'
    : 'Main is still published at the root — comparing before the first move',
);
for (const file of ['index.html', ...entryAssets('firststep/')]) identical(`firststep/${file}`, `${publishedMain}${file}`);
