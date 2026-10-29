import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

// futasaku.com/test is the STAGING copy of the game (docs/RELEASE-FLOW.md): the publish workflow
// puts futa0.5-online's head there, and `npm run promote` moves it to the root. This is the whole
// contract of that route, checked without a network.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(repo, 'scripts', 'compose-test-route.mjs');
const SHA = 'c0ffee'.padEnd(40, '1');
const root = mkdtempSync(join(tmpdir(), 'test-route-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const put = (path: string, body: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, body); };
const HTML = '<!doctype html><html><head><title>Futasaku</title></head><body><script src="./assets/index-T.js"></script></body></html>';

describe('the /test/ route', () => {
  const site = join(root, 'site');
  const dist = join(root, 'dist');
  put(join(dist, 'index.html'), HTML);
  put(join(dist, 'assets', 'index-T.js'), 'game');
  // what the old dev copy of Main left there, and a sibling route that must survive
  put(join(site, 'test', 'index.html'), 'old dev copy');
  put(join(site, 'test', 'stale.js'), 'old');
  put(join(site, 'test2', 'index.html'), 'test2 untouched');
  execFileSync(process.execPath, [script, site, dist, SHA]);
  const html = readFileSync(join(site, 'test', 'index.html'), 'utf8');

  it('replaces whatever /test/ held with the test build, whole', () => {
    expect(readFileSync(join(site, 'test', 'assets', 'index-T.js'), 'utf8')).toBe('game');
    expect(existsSync(join(site, 'test', 'stale.js'))).toBe(false);
    expect(readFileSync(join(site, 'test2', 'index.html'), 'utf8')).toBe('test2 untouched');
  });
  it('names the commit promote will move live', () => {
    expect(JSON.parse(readFileSync(join(site, 'test', 'release.json'), 'utf8')).commit).toBe(SHA);
  });
  it('can never be mistaken for the live game or indexed', () => {
    expect(html).toContain(`TEST · ${SHA.slice(0, 7)}`);
    expect(html).toContain('<title>TEST · Futasaku</title>');
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).toMatch(/id="staging-badge"[^>]*pointer-events:none/);
  });
  it('refuses a build with absolute asset paths (it would load the live game’s files)', () => {
    const bad = join(root, 'bad');
    put(join(bad, 'index.html'), '<html><head></head><body><script src="/assets/x.js"></script></body></html>');
    expect(() => execFileSync(process.execPath, [script, join(root, 'site2'), bad, SHA], { stdio: 'pipe' })).toThrow();
  });
  it('the service worker gives /test/ its own cache, apart from the root', () => {
    const worker = readFileSync(join(repo, 'web', 'public', 'futa04-sw.js'), 'utf8');
    expect(worker).toContain("return 'futa05test-'");
    // the test branch must come before the root's default prefix
    expect(worker.indexOf("'futa05test-'")).toBeLessThan(worker.indexOf("return 'severor-main2-'"));
  });
});
