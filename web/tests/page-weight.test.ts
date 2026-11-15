// THE SHIPPED PAGE'S OWN WEIGHT (2026-11-15 lightweight pass).
//
// Three things the browser was made to carry without ever using them:
//   1. The three product fonts were preloaded TWICE — once by index.html (before the module runs)
//      and once by `installFonts()` — so each face was fetched twice: 6 requests / 103,904 bytes
//      for 51,952 bytes of font, plus three "preloaded but not used" console warnings.
//   2. Every HTML comment in web/index.html shipped to every visitor (104 comments, 28,681 bytes:
//      29% of a document that has to arrive before any script, style or font can start).
//   3. The 0.75 stylesheet shipped to pages that never carry `html.v075`, so all of its rules
//      could never match (futa05 is the only build that sets that class).
//
// 1 is pinned by behaviour (a stubbed DOM, the real function). 2 and 3 are build-time transforms
// of index.html, so they are pinned the way this repo already pins build rules
// (web/tests/menu-first-paint.test.ts): a source assertion about the transform, not about
// incidental formatting.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const vite = readFileSync(fileURLToPath(new URL('../vite.config.ts', import.meta.url)), 'utf8');
const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

type FakeLink = { rel: string; as?: string; type?: string; crossOrigin?: string | null; href: string };

/** A document just real enough for `installFonts()`: existing links, a head that collects writes. */
const stubDocument = (existing: { rel: string; href: string }[], baseURI = 'https://www.futasaku.com/') => {
  const appended: FakeLink[] = [];
  vi.stubGlobal('document', {
    baseURI,
    // A real `HTMLLinkElement.href` is always the RESOLVED absolute URL, and that is what the
    // duplicate check compares against. Model that, or the stub would test a shape the browser
    // never produces.
    querySelectorAll: (selector: string) => {
      expect(selector).toBe('link[rel="preload"][as="font"]');
      return existing.map((link) => ({
        rel: link.rel,
        get href() {
          return new URL(link.href, baseURI).href;
        },
      }));
    },
    createElement: () => ({ rel: '', href: '' }) as FakeLink,
    head: { append: (el: FakeLink) => appended.push(el) },
  });
  return appended;
};

describe('the three product fonts are preloaded once, not twice', () => {
  it('adds no preload when index.html already asked for the file', async () => {
    // What the module itself preloads on a page that has not asked yet: on the product build the
    // same three files are already in index.html (with the same hashed URLs), so this is exact.
    const first = stubDocument([]);
    let fonts = await import('../src/player/fonts.js');
    fonts.installFonts();
    const urls = first.filter((link) => link.rel === 'preload').map((link) => link.href);
    expect(urls).toHaveLength(3);
    vi.resetModules();

    const existing: FakeLink[] = urls.map((href) => ({ rel: 'preload', as: 'font', href }));
    const appended = stubDocument(existing);
    fonts = await import('../src/player/fonts.js');
    fonts.installFonts();
    expect(appended.filter((link) => link.rel === 'preload'), 'a second link for an already-preloaded font re-downloads it').toHaveLength(0);
    // The @font-face rules themselves still install: only the duplicate hint is skipped.
    expect(appended.map((link) => (link as unknown as { id?: string }).id)).toContain('typography-v2');
  });

  it('still preloads all three on a page that has not asked for them', async () => {
    // The legacy/live shape strips the font preloads out of index.html. There the module is the
    // only thing that can start the fetch early, and it must keep doing the whole job.
    const appended = stubDocument([]);
    const { installFonts } = await import('../src/player/fonts.js');
    installFonts();
    const preloads = appended.filter((link) => link.rel === 'preload');
    expect(preloads).toHaveLength(3);
    expect(preloads.every((link) => link.as === 'font' && link.type === 'font/woff2' && link.crossOrigin === 'anonymous')).toBe(true);
    expect(preloads.every((link) => /\.woff2$/.test(link.href))).toBe(true);
  });
});

describe('the built document carries no weight a browser cannot read', () => {
  it('strips HTML comments from the built page', () => {
    // ~29% of index.html is prose for whoever edits it. It is worth keeping in the source and
    // worth nothing in the file every visitor waits for, so the build strips it.
    expect(vite).toContain("name: 'strip-html-comments'");
    expect(vite, 'the build must strip comments from the shipped HTML').toContain("html.replace(/<!--[\\s\\S]*?-->/g, '')");
    // ...and the source still explains itself, so the strip is the ONLY place that removes them.
    expect(html, 'the source keeps its comments').toContain('<!--');
  });

  it('ships the 0.75 stylesheet only to a page that carries html.v075', () => {
    expect(vite, 'the 0.75 rules are all scoped to html.v075').toContain('const withoutV075 = spaceFirst ? html : html.replace(');
    expect(vite, 'the dropped link is the 0.75 sheet').toContain('./src/polish-075.css');
    expect(vite, 'futa05 is the build that writes html.v075').toContain("const spaceFirst = process.env.CHANNEL === 'futa05'");
  });
});
