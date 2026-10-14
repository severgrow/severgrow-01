import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The owner moved the site root to the FUTASAKU 0.5 build and the previous root (Main) to
// /firststep/. This is the whole routing contract of that move, checked without a network.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(repo, 'scripts', 'compose-futa05-preview.mjs');
const MAIN_SHA = 'a'.repeat(40);
const FUTA05_SHA = 'b'.repeat(40);

const written: string[] = [];
const write = (path: string, body: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  written.push(path);
  return body;
};

/** The `futa0.4` line's guard, which this composer has to replace with the root-aware one. */
const ORIGINAL_GUARD = `import assert from 'node:assert/strict';
const site = process.argv[2];
assert(site, 'Composed Pages directory required');
const files = ['index.html', 'test/index.html', 'test2/index.html', 'release.json', 'test2/release.json'];
for (const prefix of ['', 'test/', 'test2/']) {
  for (const name of readdirSync(join(site, prefix, 'assets')))
    if (/^index-.+\\.(?:js|css)$/.test(name)) files.push(\`\${prefix}assets/\${name}\`);
}
`;

const MAIN_HTML = '<!doctype html><title>Severor</title><script src="./assets/index-MAIN.js"></script>';
const FUTA05_HTML = '<!doctype html><title>Futasaku</title><script src="./assets/index-F05.js"></script>';
// The real file's fetch guard, which the composer anchors its sibling-route line to.
const WORKER = [
  "self.addEventListener('fetch', (e) => {",
  '  const req = e.request, url = new URL(req.url);',
  '  if (isDuelApi(url)) return;',
  "  if (req.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;",
  "  if (req.mode === 'navigate') e.respondWith(networkFirst(req, './index.html'));",
  '});',
  '',
].join('\n');

const composed = (root: string) => {
  // What compose-pages.mjs + compose-futasaku-preview.mjs have already produced: Main at the root,
  // the three protected channels beside it, and the release metadata the workflow reads back.
  write(join(root, 'site', 'index.html'), MAIN_HTML);
  write(join(root, 'site', 'assets', 'index-MAIN.js'), 'main entry');
  write(join(root, 'site', 'assets', 'index-MAIN.css'), 'main style');
  write(join(root, 'site', 'manifest.webmanifest'), '{"name":"Severor"}');
  write(
    join(root, 'site', 'sw.js'),
    '  if (/\\/(?:test2?|futa0[.]4|futa0[.]5|futa-test)(\\/|$)/.test(path)) return;\n',
  );
  write(join(root, 'site', 'test', 'index.html'), '<!doctype html><title>Severor</title> dev copy');
  write(join(root, 'site', 'test', 'assets', 'index-DEV.js'), 'dev entry');
  write(join(root, 'site', 'test2', 'index.html'), '<!doctype html><title>Futasaku</title> candidate');
  write(join(root, 'site', 'test2', 'assets', 'index-CAND.js'), 'candidate entry');
  write(join(root, 'site', 'futa0.4', 'index.html'), '<!doctype html><title>Futasaku</title> 0.4');
  write(join(root, 'site', 'futa0.4', 'futa04-sw.js'), WORKER);
  write(join(root, 'site', 'futa-test', 'index.html'), '<!doctype html><title>Futaku TEST</title>');
  write(join(root, 'site', 'release.json'), JSON.stringify({ main: MAIN_SHA, test: 'c'.repeat(40), test2: 'd'.repeat(40) }));
  write(join(root, 'site', '.nojekyll'), '');
  // The FUTASAKU 0.5 build, which becomes the root.
  write(join(root, 'dist', 'index.html'), FUTA05_HTML);
  write(join(root, 'dist', 'assets', 'index-F05.js'), 'futa05 entry');
  write(join(root, 'dist', 'manifest.webmanifest'), '{"name":"Futasaku","short_name":"Futasaku"}');
  write(join(root, 'dist', 'sw.js'), 'const CACHE = "severgrow-v1";\n');
  write(join(root, 'dist', 'futa04-sw.js'), WORKER);
  // The preview checkout's own guard, which the workflow invokes straight after this composer.
  write(join(root, 'preview', 'scripts', 'check-pages-parity.mjs'), ORIGINAL_GUARD);
};

const run = () => {
  const root = mkdtempSync(join(tmpdir(), 'compose-futa05-'));
  written.push(root);
  composed(root);
  execFileSync(process.execPath, [script, 'site', 'dist', FUTA05_SHA], { cwd: root, encoding: 'utf8' });
  return root;
};

const read = (root: string, ...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');

afterAll(() => {
  while (written.length > 0) {
    const path = written.pop();
    if (path) rmSync(path, { recursive: true, force: true });
  }
});

describe('compose-futa05-preview: the site root map', () => {
  let root = '';
  beforeAll(() => {
    root = run();
  });

  it('promotes the FUTASAKU 0.5 build to the root, byte for byte', () => {
    expect(read(root, 'site', 'index.html')).toBe(FUTA05_HTML);
    expect(read(root, 'site', 'assets', 'index-F05.js')).toBe('futa05 entry');
    expect(read(root, 'site', 'manifest.webmanifest')).toContain('"name":"Futasaku"');
  });

  it('moves the previous root (Main) to /firststep/ unchanged, with its assets', () => {
    expect(read(root, 'site', 'firststep', 'index.html')).toBe(MAIN_HTML);
    expect(read(root, 'site', 'firststep', 'assets', 'index-MAIN.js')).toBe('main entry');
    expect(read(root, 'site', 'firststep', 'assets', 'index-MAIN.css')).toBe('main style');
    expect(read(root, 'site', 'firststep', 'manifest.webmanifest')).toBe('{"name":"Severor"}');
    expect(read(root, 'site', 'firststep', 'sw.js')).toContain('futa0[.]5');
    expect(JSON.parse(read(root, 'site', 'firststep', 'release.json')).commit).toBe(MAIN_SHA);
  });

  it('leaves every other route exactly where it was', () => {
    expect(read(root, 'site', 'test', 'index.html')).toContain('dev copy');
    expect(read(root, 'site', 'test', 'assets', 'index-DEV.js')).toBe('dev entry');
    expect(read(root, 'site', 'test2', 'index.html')).toContain('candidate');
    expect(read(root, 'site', 'test2', 'assets', 'index-CAND.js')).toBe('candidate entry');
    expect(read(root, 'site', 'futa0.4', 'index.html')).toContain('0.4');
    expect(read(root, 'site', 'futa-test', 'index.html')).toContain('Futaku TEST');
    // The workflow reads the published SHAs back from this exact address on the next run.
    expect(JSON.parse(read(root, 'site', 'release.json')).main).toBe(MAIN_SHA);
    expect(existsSync(join(root, 'site', '.nojekyll'))).toBe(true);
  });

  it('forwards /futa0.5/ to the root without dropping an invite hash', () => {
    const redirect = read(root, 'site', 'futa0.5', 'index.html');
    expect(redirect).toContain("location.replace('/' + location.search + location.hash)");
    expect(redirect).toContain('http-equiv="refresh"');
    expect(JSON.parse(read(root, 'site', 'futa0.5', 'release.json')).commit).toBe(FUTA05_SHA);
  });

  it('retires the old root worker and keeps the new one inside its own routes', () => {
    const retired = read(root, 'site', 'sw.js');
    expect(retired).toContain('self.registration.unregister()');
    expect(retired).not.toContain('addEventListener(\'fetch\'');
    expect(read(root, 'site', 'futa04-sw.js')).toContain(
      'firststep|test2?|futa0[.]4|futa0[.]5|futa-test',
    );
  });

  it('installs a parity guard that checks Main where Main now lives', () => {
    const guard = read(root, 'preview', 'scripts', 'check-pages-parity.mjs');
    expect(guard).toBe(readFileSync(join(repo, 'scripts', 'check-pages-parity-root.mjs'), 'utf8'));
    expect(guard).toContain("status('firststep/index.html')");
  });

  it('refuses to publish when the preview guard changed without this composer knowing', () => {
    const dirty = mkdtempSync(join(tmpdir(), 'compose-futa05-'));
    written.push(dirty);
    composed(dirty);
    write(join(dirty, 'preview', 'scripts', 'check-pages-parity.mjs'), '// hardened elsewhere, root no longer assumed\n');
    expect(() =>
      execFileSync(process.execPath, [script, 'site', 'dist', FUTA05_SHA], { cwd: dirty, encoding: 'utf8' }),
    ).toThrowError(/port the change into scripts\/check-pages-parity-root\.mjs/);
  });
});
