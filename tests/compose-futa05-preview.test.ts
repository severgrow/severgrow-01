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
const FUTA05_HTML = [
  '<!doctype html><html lang="en"><head><meta charset="utf-8" />',
  '<title>Futasaku</title>',
  '<meta property="og:title" content="Futasaku" />',
  '<meta property="og:description" content="Grow your network. Keep it joined to your home. Cut your opponent\'s links." />',
  '<meta property="og:image" content="https://www.futasaku.com/og.jpg?v=2" />',
  '<meta name="twitter:card" content="summary_large_image" />',
  '<meta name="twitter:image" content="https://www.futasaku.com/og.jpg?v=2" />',
  '</head><body><script src="./assets/index-F05.js"></script></body></html>',
].join('\n');
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

/** The admin build the composer may be handed as a fourth argument (opt-in, docs/ADMIN.md §7). */
const ADMIN_HTML = '<!doctype html><title>FUTASAKU · Admin</title><script type="module" src="./admin.js"></script><link rel="stylesheet" href="./admin.css">';

const withAdmin = (
  root: string,
  admin: { html?: string; entry?: boolean; css?: boolean } = {},
): string => {
  write(join(root, 'dist-admin', 'index.html'), admin.html ?? ADMIN_HTML);
  if (admin.entry !== false) write(join(root, 'dist-admin', 'admin.js'), 'admin entry');
  if (admin.css !== false) write(join(root, 'dist-admin', 'admin.css'), 'admin style');
  write(join(root, 'dist-admin', 'admin.woff2'), 'font');
  return root;
};

const runWithAdmin = (admin: { html?: string; entry?: boolean; css?: boolean } = {}): string => {
  const root = mkdtempSync(join(tmpdir(), 'compose-admin-'));
  written.push(root);
  composed(root);
  withAdmin(root, admin);
  execFileSync(process.execPath, [script, 'site', 'dist', FUTA05_SHA, 'dist-admin'], { cwd: root, encoding: 'utf8' });
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

  it('gives the /futa0.5/ forwarding page the root build\'s own share tags', () => {
    // A link shared while the game still lived at /futa0.5/ hits this page, and a scraper reads it
    // before any script runs: without the tags that link previews with no picture at all. They are
    // LIFTED from the promoted build so the forwarding page can never carry stale words or a stale
    // image address of its own.
    const redirect = read(root, 'site', 'futa0.5', 'index.html');
    expect(redirect).toContain('<title>Futasaku</title>');
    expect(redirect).toContain('property="og:image" content="https://www.futasaku.com/og.jpg?v=2"');
    expect(redirect).toContain('name="twitter:image" content="https://www.futasaku.com/og.jpg?v=2"');
    expect(redirect).toContain('property="og:title" content="Futasaku"');
    // and still noindex: it is a doorway, never the page a search engine should keep.
    expect(redirect).toContain('content="noindex"');
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

  it('does NOT publish /admin/ unless a build is passed to the composer', () => {
    // The default path is the whole safety story: a plain push composes exactly the site it composed
    // before, so the dashboard cannot go live by accident (docs/ADMIN.md §7).
    expect(existsSync(join(root, 'site', 'admin'))).toBe(false);
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

describe('compose-futa05-preview: /2/ is the onboarding line, published beside the root', () => {
  const ONBOARDING_SHA = 'e'.repeat(40);
  const onboarding = (root: string, html = FUTA05_HTML) => {
    write(join(root, 'dist-onboarding', 'index.html'), html);
    write(join(root, 'dist-onboarding', 'assets', 'index-ONB.js'), 'onboarding entry');
    write(join(root, 'dist-onboarding', 'futa04-sw.js'), WORKER);
    return root;
  };
  const runOnboarding = (html?: string): string => {
    const root = mkdtempSync(join(tmpdir(), 'compose-onboarding-'));
    written.push(root);
    composed(root);
    onboarding(root, html);
    // The workflow passes the admin build AND the onboarding build in the same run, so the test
    // does too: /2/ must not disturb /admin/ or the root.
    withAdmin(root);
    execFileSync(
      process.execPath,
      [script, 'site', 'dist', FUTA05_SHA, 'dist-admin', 'dist-onboarding', ONBOARDING_SHA],
      { cwd: root, encoding: 'utf8' },
    );
    return root;
  };

  it('is not published when no onboarding build is passed', () => {
    // The default path is the safety story: a push to futa0.4 composes exactly the site it did before.
    expect(existsSync(join(run(), 'site', '2'))).toBe(false);
  });

  it('publishes the teaching build at /2/ and leaves the released root untouched', () => {
    const withOnboarding = runOnboarding();
    expect(read(withOnboarding, 'site', '2', 'index.html')).toBe(FUTA05_HTML);
    expect(read(withOnboarding, 'site', '2', 'assets', 'index-ONB.js')).toBe('onboarding entry');
    expect(read(withOnboarding, 'site', '2', 'futa04-sw.js')).toBe(WORKER);
    expect(JSON.parse(read(withOnboarding, 'site', '2', 'release.json')).commit).toBe(ONBOARDING_SHA);
    // The root is still the released build: /2/ must never displace it.
    expect(read(withOnboarding, 'site', 'index.html')).toBe(FUTA05_HTML);
    expect(read(withOnboarding, 'site', 'assets', 'index-F05.js')).toBe('futa05 entry');
    // ...and joining the site must not sweep it into /firststep/.
    expect(existsSync(join(withOnboarding, 'site', 'firststep', '2'))).toBe(false);
  });

  it('teaches the root worker to leave /2/ alone, replacing the old guard instead of doubling it', () => {
    const withOnboarding = runOnboarding();
    const worker = read(withOnboarding, 'site', 'futa04-sw.js');
    // Without this, a /2/ page would be cached as the ROOT's offline index.
    expect(worker).toContain('futa-test|admin|2');
    // Exactly one guard, however many times the composer has run: the route list keeps growing.
    expect(worker.split("// a sibling channel is never this worker's page")).toHaveLength(2);
  });

  it('refuses a /2/ build that could not work from a subdirectory', () => {
    expect(() => runOnboarding('<script src="/assets/index.js"></script>')).toThrowError(/relative asset paths/);
  });
});

describe('compose-futa05-preview: the admin route is opt-in', () => {
  it('publishes the dashboard at /admin/ when a build is passed, and nowhere else', () => {
    const withAdminRoot = runWithAdmin();
    expect(read(withAdminRoot, 'site', 'admin', 'index.html')).toBe(ADMIN_HTML);
    expect(read(withAdminRoot, 'site', 'admin', 'admin.js')).toBe('admin entry');
    expect(read(withAdminRoot, 'site', 'admin', 'admin.css')).toBe('admin style');
    expect(JSON.parse(read(withAdminRoot, 'site', 'admin', 'release.json')).channel).toBe('FUTASAKU Admin');
    // The Main move must not have swept the dashboard into /firststep/ (that is what SIBLING_ROUTES
    // is for), and the root must still be the game.
    expect(existsSync(join(withAdminRoot, 'site', 'firststep', 'admin'))).toBe(false);
    expect(read(withAdminRoot, 'site', 'index.html')).toBe(FUTA05_HTML);
  });

  it('teaches the root worker to leave /admin/ alone', () => {
    const withAdminRoot = runWithAdmin();
    const worker = read(withAdminRoot, 'site', 'futa04-sw.js');
    // Without this, a visit to /admin/ would be cached as the root's offline index.
    expect(worker).toContain('firststep|test2?|futa0[.]4|futa0[.]5|futa-test|admin');
  });

  it('refuses a build that could not work from a subdirectory', () => {
    // An absolute asset path is the classic way a page works at one address and 404s at another.
    expect(() => runWithAdmin({ html: '<script src="/admin.js"></script>' })).toThrowError(/relative|relative asset paths/);
    expect(() => runWithAdmin({ entry: false })).toThrowError(/relative|missing its entry files/);
    expect(() => runWithAdmin({ html: '<script src="./admin.js"></script><link rel="stylesheet" href="./admin.css"><script>navigator.serviceWorker.register("./sw.js")</script>' })).toThrowError(
      /must not register a service worker/,
    );
  });
});

describe('compose-retired-routes: /2/ and /3/ forward to the root and clean up after themselves', () => {
  const retired = join(repo, 'scripts', 'compose-retired-routes.mjs');
  const runRetired = (): string => {
    const root = run();
    execFileSync(process.execPath, [retired, 'site'], { cwd: root, encoding: 'utf8' });
    return root;
  };

  it('replaces each route with a page that forwards to the root, keeping the invite hash', () => {
    const root = runRetired();
    for (const route of ['2', '3']) {
      const page = read(root, 'site', route, 'index.html');
      expect(page).toContain("location.replace('/' + location.search + location.hash)");
      expect(page).toContain('content="0; url=/"');
      expect(page).not.toContain('./assets/');
      expect(existsSync(join(root, 'site', route, 'assets'))).toBe(false);
    }
  });

  it('serves a worker at the old address that deletes only its own cache and unregisters', () => {
    const root = runRetired();
    const two = read(root, 'site', '2', 'futa04-sw.js');
    const three = read(root, 'site', '3', 'futa04-sw.js');
    expect(two).toContain('"futa05onboarding-"');
    expect(three).toContain('"futa05lessons3-"');
    for (const worker of [two, three]) {
      expect(worker).toContain('self.registration.unregister()');
      expect(worker).not.toContain("addEventListener('fetch'");
    }
  });

  it('keeps the released root and the root worker guard covering both routes', () => {
    const root = runRetired();
    expect(read(root, 'site', 'index.html')).toBe(FUTA05_HTML);
    expect(read(root, 'site', 'futa04-sw.js')).toContain('futa-test|admin|2|3)');
    expect(existsSync(join(root, 'site', 'firststep', '3'))).toBe(false);
  });
});
