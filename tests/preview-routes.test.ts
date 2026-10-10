// The Pages preview publisher must add Futasaku 0.4 without rewriting the
// already composed Main worker beyond one extra path exclusion, and the boot
// page, save prefix and offline worker must name that same address.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url);

describe('Futasaku preview routes', () => {
  it('keeps the 0.3 and 0.4 addresses aligned in boot, saves and the offline worker', () => {
    const html = readFileSync(new URL('./web/index.html', root), 'utf8');
    const worker = readFileSync(new URL('./web/public/test2-sw.js', root), 'utf8');
    const channel = readFileSync(new URL('./web/src/channel.ts', root), 'utf8');
    for (const path of ['futasaku-03-preview', 'futasaku-04-preview']) {
      expect(html).toContain(path);
      expect(worker).toContain(path);
      expect(channel).toContain(path);
    }
    expect(html).toContain("'futasaku04:'");
    expect(channel).toContain("'futasaku04:'");
    expect(worker).toContain("'futasaku04-'");
  });

  it('adds an isolated 0.4 route beside the 0.3 preview', () => {
    const dir = mkdtempSync(join(tmpdir(), 'futasaku-preview-'));
    const site = join(dir, 'site');
    const preview = join(dir, 'preview');
    mkdirSync(site);
    mkdirSync(preview);
    try {
      writeFileSync(join(site, 'sw.js'), "const CACHE = 'severgrow-v2-scoped';\nif (/\\/test2?(\\/|$)/.test(path)) return;\n");
      writeFileSync(join(preview, 'index.html'), '<script src="./assets/app.js"></script>\n<script>var prefix = /\\/futasaku-04-preview\\//.test(location.pathname) ? \'futasaku04:\' : \'\';</script>\n');
      const commit = 'a'.repeat(40);
      const run = (script: string) => execFileSync(process.execPath, [new URL(`./scripts/${script}`, root).pathname, site, preview, commit], { encoding: 'utf8' });
      expect(run('compose-futasaku-preview.mjs')).toContain('/futasaku-03-preview/');
      expect(run('compose-futasaku-04-preview.mjs')).toContain('/futasaku-04-preview/');

      const published = readFileSync(join(site, 'sw.js'), 'utf8');
      expect(published).toContain('/\\/(?:test2?|futasaku-03-preview|futasaku-04-preview)(\\/|$)/');
      expect(published).not.toContain('/\\/test2?(\\/|$)/');
      expect(JSON.parse(readFileSync(join(site, 'futasaku-03-preview', 'release.json'), 'utf8'))).toEqual({ channel: 'Futasaku0.3', commit });
      expect(JSON.parse(readFileSync(join(site, 'futasaku-04-preview', 'release.json'), 'utf8'))).toEqual({ channel: 'Futasaku0.4', commit });
      const page = readFileSync(join(site, 'futasaku-04-preview', 'index.html'), 'utf8');
      expect(page).toContain('futasaku-04-preview');
      expect(page).toContain("'futasaku04:'");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
