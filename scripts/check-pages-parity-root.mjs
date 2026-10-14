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

/**
 * The build's entry file names under `<prefix>assets/` — hashed, so their names are stable only
 * while the build is.
 *
 * These are bare file names, never paths: every caller joins its own prefix on. The first version of
 * this guard returned a prefixed path and then prefixed it again, which is how a deploy died on
 * `site/firststep/firststep/assets/…` instead of finding Main at `site/firststep/assets/…`.
 */
const entryNames = (prefix) => {
  const dir = join(site, prefix, 'assets');
  assert(existsSync(dir), `composed site is missing ${prefix}assets/`);
  return readdirSync(dir).filter((name) => /^index-.+\.(?:js|css)$/.test(name));
};

/** `file` is relative to the composed site on disk and to the published base URL. */
const identical = (onDisk, published = onDisk) => {
  const candidate = readFileSync(join(site, onDisk));
  assert(candidate.equals(get(published)), `Preview would alter published ${published}`);
  console.log(`Published ${published}: identical`);
};

// /test/ and /test2/ are rebuilt from their published SHAs and must not move by a single byte.
for (const file of ['test/index.html', 'test2/index.html', 'release.json', 'test2/release.json']) identical(file);
for (const prefix of ['test', 'test2'])
  for (const name of entryNames(`${prefix}/`)) identical(`${prefix}/assets/${name}`);

// Main: it is always on disk at /firststep/ (the composer puts it there), but where it is *published*
// depends on whether the move has happened yet. On the one run that performs the move it is still at
// the root; from then on it is at /firststep/. One layout, one check, no bootstrap deadlock.
//
// Main is the only route whose two addresses differ, so it is the only one built from an explicit
// prefix. `publishedMain` is always a *prefix* ('' or 'firststep/'), prepended to a bare file name —
// never joined to an already-prefixed path.
const publishedMain = status('firststep/index.html') === '200' ? 'firststep/' : '';
console.log(
  publishedMain
    ? 'Main is published at /firststep/ — comparing there'
    : 'Main is still published at the root — comparing before the first move',
);
identical('firststep/index.html', `${publishedMain}index.html`);
for (const name of entryNames('firststep/')) identical(`firststep/assets/${name}`, `${publishedMain}assets/${name}`);
