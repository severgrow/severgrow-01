import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// The publication parity guard is what stands between a broken compose and a live site, so it is run
// for real here — with `curl` stubbed out — rather than merely grepped.
//
// This exists because the guard's first version built Main's on-disk path twice over and the deploy
// died on `site/firststep/firststep/assets/index-…js` instead of comparing Main at
// `site/firststep/assets/…js`. The compose itself was correct; only the check was wrong. A guard that
// looks right but resolves the wrong paths would otherwise pass every review.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const guard = join(repo, 'scripts', 'check-pages-parity-root.mjs');

// A `curl` that serves the "published" bytes from a directory instead of the network, so the guard's
// own path building is what is under test.
const CURL_STUB = `#!/bin/sh
body=""; out=""; fmt=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2;;
    -w) fmt="$2"; shift 2;;
    -H|--retry) shift 2;;
    *) url="$1"; shift;;
  esac
done
path="\${url#https://severgrow.github.io/severgrow-01/}"
path="\${path%%\\?*}"
file="$PARITY_PUBLISHED/$path"
if [ -f "$file" ]; then code=200; else code=404; fi
case "$fmt" in *%{http_code}*) printf '%s' "$code";; esac
if [ -n "$out" ]; then exit 0; fi
if [ "$code" = 200 ]; then cat "$file"; exit 0; fi
exit 22
`;

const MAIN_HTML = '<!doctype html><title>Severor</title><script src="./assets/index-MAIN.js"></script>';
const FUTA05_HTML = '<!doctype html><title>Futasaku</title><script src="./assets/index-F05.js"></script>';
const TEST_HTML = '<!doctype html><title>Severor</title> dev copy';
const TEST2_HTML = '<!doctype html><title>Futasaku</title> candidate';

const created: string[] = [];
afterEach(() => {
  while (created.length > 0) {
    const path = created.pop();
    if (path) rmSync(path, { recursive: true, force: true });
  }
});

const write = (path: string, body: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
};

/**
 * `published` mirrors the live site; `site` mirrors what the workflow just composed. `atRoot` is the
 * one thing that varies: before the move Main is still published at the root, afterwards at
 * /firststep/.
 */
const fixture = (atRoot: boolean) => {
  const root = mkdtempSync(join(tmpdir(), 'parity-'));
  created.push(root);
  const published = join(root, 'published');
  const site = join(root, 'site');

  // The composed tree: FUTASAKU 0.5 at the root, Main moved to /firststep/.
  write(join(site, 'index.html'), FUTA05_HTML);
  write(join(site, 'firststep', 'index.html'), MAIN_HTML);
  write(join(site, 'firststep', 'assets', 'index-MAIN.js'), 'main entry');
  write(join(site, 'firststep', 'assets', 'index-MAIN.css'), 'main style');
  write(join(site, 'test', 'index.html'), TEST_HTML);
  write(join(site, 'test', 'assets', 'index-DEV.js'), 'dev entry');
  write(join(site, 'test2', 'index.html'), TEST2_HTML);
  write(join(site, 'test2', 'assets', 'index-CAND.js'), 'candidate entry');
  write(join(site, 'release.json'), '{"main":"a","test":"b","test2":"c"}');
  write(join(site, 'test2', 'release.json'), '{"channel":"test2"}');

  // The published tree: /test/ and /test2/ always, Main at wherever it currently is.
  const main = atRoot ? published : join(published, 'firststep');
  write(join(main, 'index.html'), MAIN_HTML);
  write(join(main, 'assets', 'index-MAIN.js'), 'main entry');
  write(join(main, 'assets', 'index-MAIN.css'), 'main style');
  write(join(published, 'test', 'index.html'), TEST_HTML);
  write(join(published, 'test', 'assets', 'index-DEV.js'), 'dev entry');
  write(join(published, 'test2', 'index.html'), TEST2_HTML);
  write(join(published, 'test2', 'assets', 'index-CAND.js'), 'candidate entry');
  write(join(published, 'release.json'), '{"main":"a","test":"b","test2":"c"}');
  write(join(published, 'test2', 'release.json'), '{"channel":"test2"}');

  const bin = join(root, 'bin');
  write(join(bin, 'curl'), CURL_STUB);
  chmodSync(join(bin, 'curl'), 0o755);
  return { root, published, bin };
};

const runGuard = (f: { root: string; published: string; bin: string }) => {
  try {
    const stdout = execFileSync(process.execPath, [guard, 'site'], {
      cwd: f.root,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${f.bin}:${process.env.PATH}`, PARITY_PUBLISHED: f.published },
    });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { code: failure.status ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
};

describe('check-pages-parity-root: refuses to publish a site that moves a protected build', () => {
  it('passes when Main is still published at the root, without doubling the /firststep/ prefix', () => {
    const result = runGuard(fixture(true));
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    // The crash that inspired this test: comparing Main's on-disk path with the prefix applied twice.
    expect(result.stderr).not.toMatch(/firststep\/firststep/);
    expect(result.stdout).toContain('Main is still published at the root');
    expect(result.stdout).toContain('Published index.html: identical');
    expect(result.stdout).toContain('Published assets/index-MAIN.js: identical');
    expect(result.stdout).toContain('Published test2/assets/index-CAND.js: identical');
  });

  it('passes once Main is published at /firststep/, comparing there instead of the root', () => {
    const result = runGuard(fixture(false));
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Main is published at /firststep/');
    expect(result.stdout).toContain('Published firststep/index.html: identical');
    expect(result.stdout).toContain('Published firststep/assets/index-MAIN.js: identical');
  });

  it('fails when the deploy would change Main, and when it would drop it entirely', () => {
    const changed = fixture(true);
    write(join(changed.published, 'assets', 'index-MAIN.js'), 'main entry, but not these bytes');
    const altered = runGuard(changed);
    expect(altered.code).not.toBe(0);
    expect(altered.stderr).toContain('Preview would alter published assets/index-MAIN.js');

    // A composed tree with no Main under /firststep/ at all must fail loudly rather than pass empty.
    const missing = fixture(true);
    rmSync(join(missing.root, 'site', 'firststep'), { recursive: true, force: true });
    const gone = runGuard(missing);
    expect(gone.code).not.toBe(0);
    expect(gone.stderr).toMatch(/firststep/);
  });

  it('lets /test/ change: it is the staging copy now, rebuilt on every push (owner, 2026-10-29)', () => {
    const f = fixture(true);
    write(join(f.root, 'site', 'test', 'index.html'), '<!doctype html><title>TEST · Futasaku</title> the new staging build');
    write(join(f.root, 'site', 'test', 'assets', 'index-DEV.js'), 'a different build');
    const result = runGuard(f);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain('Published test/');
  });

  it('fails when a deploy would change /test2/', () => {
    const f = fixture(true);
    write(join(f.root, 'site', 'test2', 'index.html'), '<!doctype html><title>Futasaku</title> edited');
    const result = runGuard(f);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('Preview would alter published test2/index.html');
  });

  it('is the guard the composer installs, so the workflow runs exactly what is tested here', () => {
    const composer = readFileSync(join(repo, 'scripts', 'compose-futa05-preview.mjs'), 'utf8');
    expect(composer).toContain("'./check-pages-parity-root.mjs'");
    expect(composer).toContain("resolve('preview/scripts/check-pages-parity.mjs')");
  });
});
