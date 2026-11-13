// SEO, BROWSER METADATA AND SHARING (owner, 2026-11-13). The essentials live in the page's own HTML
// (crawlers do not run JavaScript); the title is exactly "Futasaku"; the official address is
// https://www.futasaku.com/ (futasaku.com redirects there); test and preview copies are never indexed
// and never carry the live page's canonical.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const html = read('../index.html');
const meta = (name: string) => new RegExp(`<meta\\s+(?:name|property)="${name}"\\s+content="([^"]*)"`).exec(html)?.[1];

describe('the live page metadata, in its initial HTML', () => {
  it('the title is exactly Futasaku; language, viewport and theme colour are set', () => {
    expect(html.match(/<title>([^<]*)<\/title>/)?.[1]).toBe('Futasaku');
    expect(html).toMatch(/<html lang="en"/);
    expect(meta('viewport')).toContain('width=device-width');
    expect(meta('theme-color')).toBe('#0e0f10');
  });

  it('a natural description, and one canonical address on www', () => {
    const description = meta('description')!;
    expect(description.length).toBeGreaterThan(80);
    expect(description.length).toBeLessThanOrEqual(230);
    expect(description).toMatch(/strategy card game/);
    expect(html.match(/<link rel="canonical" href="([^"]+)"/g)).toHaveLength(1);
    expect(html).toContain('<link rel="canonical" href="https://www.futasaku.com/" />');
  });

  it('Open Graph and Twitter name the game Futasaku and share the same absolute 1200x630 image', () => {
    expect(meta('og:title')).toBe('Futasaku');
    expect(meta('twitter:title')).toBe('Futasaku');
    expect(meta('og:url')).toBe('https://www.futasaku.com/');
    expect(meta('og:image')).toMatch(/^https:\/\/www\.futasaku\.com\/og\.jpg/);
    expect(meta('twitter:image')).toBe(meta('og:image'));
    expect([meta('og:image:width'), meta('og:image:height')]).toEqual(['1200', '630']);
    expect(meta('twitter:card')).toBe('summary_large_image');
    expect(meta('og:description')).toBe(meta('twitter:description'));
  });

  it('the installed app is simply Futasaku, with the current description', () => {
    const manifest = JSON.parse(read('../public/manifest.webmanifest')) as { name: string; short_name: string; description: string; display: string };
    expect([manifest.name, manifest.short_name, manifest.display]).toEqual(['Futasaku', 'Futasaku', 'standalone']);
    expect(manifest.description).not.toMatch(/root|bot/);
  });
});

describe('indexing', () => {
  it('robots.txt keeps the admin out and names the sitemap; the sitemap lists the public pages on www', () => {
    const robots = read('../public/robots.txt');
    expect(robots).toMatch(/User-agent: \*/);
    expect(robots).toMatch(/Disallow: \/admin\//);
    expect(robots).toContain('Sitemap: https://www.futasaku.com/sitemap.xml');
    const sitemap = read('../public/sitemap.xml');
    for (const url of ['https://www.futasaku.com/', 'https://www.futasaku.com/privacy/', 'https://www.futasaku.com/terms/']) expect(sitemap).toContain(`<loc>${url}</loc>`);
    expect(sitemap).not.toMatch(/\/test\/|\/admin\//);
  });

  it('the /test/ copy is noindex and loses the live canonical', () => {
    const work = mkdtempSync(join(tmpdir(), 'seo-test-route-'));
    try {
      const dist = join(work, 'dist');
      mkdirSync(dist, { recursive: true });
      writeFileSync(join(dist, 'index.html'), html.replace('</head>', '<script src="./assets/x.js"></script></head>'));
      mkdirSync(join(work, 'site'), { recursive: true });
      execFileSync(process.execPath, [new URL('../../scripts/compose-test-route.mjs', import.meta.url).pathname, join(work, 'site'), dist, 'a'.repeat(40)], { stdio: 'ignore' });
      const test = readFileSync(join(work, 'site', 'test', 'index.html'), 'utf8');
      expect(test).toContain('<meta name="robots" content="noindex" />');
      expect(test.match(/<meta name="robots"/g)).toHaveLength(1);
      expect(test).not.toContain('rel="canonical"');
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('the older preview copies are kept out of search by robots.txt, never by editing their locked files', () => {
    const robots = read('../public/robots.txt');
    for (const route of ['futa0.4', 'futa-test', 'test2', 'firststep']) expect(robots).toContain(`Disallow: /${route}/`);
    // The publish job's parity check refuses any change to those copies' own pages.
    expect(read('../../scripts/compose-retired-routes.mjs')).not.toMatch(/'futa0\.4', 'futa-test', 'test2', 'firststep'/);
  });
});

describe('six discoverability extras (owner, 2026-11-13)', () => {
  it('structured data says what the game is (valid JSON-LD, static)', () => {
    const json = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1]!) as { '@graph': Array<Record<string, unknown>> };
    const game = json['@graph'].find((n) => n['@type'] === 'VideoGame')!;
    expect(game.name).toBe('Futasaku');
    expect(game.url).toBe('https://www.futasaku.com/');
    expect(game.isAccessibleForFree).toBe(true);
    expect(json['@graph'].find((n) => n['@type'] === 'WebSite')?.name).toBe('Futasaku');
  });
  it('large image previews are allowed on the live page; the app is named Futasaku everywhere', () => {
    expect(meta('robots')).toBe('index, follow, max-image-preview:large');
    expect(meta('application-name')).toBe('Futasaku');
    expect(meta('apple-mobile-web-app-title')).toBe('Futasaku');
    expect(meta('og:image:secure_url')).toBe(meta('og:image'));
  });
  it('the page says what it is without JavaScript, and the sitemap carries dates', () => {
    expect(html).toMatch(/<noscript>\s*<h1>Futasaku<\/h1>/);
    expect(read('../public/sitemap.xml').match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)).toHaveLength(3);
  });
});

describe('ten easy wins (owner, 2026-11-13)', () => {
  const pub = (p: string) => read(`../public/${p}`);

  it('the approved card ships under a new cache key, with alt text that describes it', () => {
    expect(meta('og:image')).toBe('https://www.futasaku.com/og.jpg?v=8');
    expect(meta('og:image:secure_url')).toBe(meta('og:image'));
    expect(meta('og:image:alt')).toMatch(/phone.*hand of cards/);
    expect(meta('twitter:image:alt')).toBe(meta('og:image:alt'));
  });

  it('a branded, unindexed 404 that leads back to the game', () => {
    const page = pub('404.html');
    expect(page).toContain('<title>Futasaku</title>');
    expect(page).toContain('<meta name="robots" content="noindex" />');
    expect(page).toContain('href="/"');
    expect(page).not.toMatch(/<script/i);
  });

  it('the legal pages carry the icon, theme colour and their own preview', async () => {
    const { renderTermsPage } = await import('../src/privacy-page.js');
    const { TERMS } = await import('../src/terms.js');
    const page = renderTermsPage(TERMS);
    expect(page).toContain('<link rel="icon" href="/favicon.ico" sizes="any" />');
    expect(page).toContain('<meta name="theme-color" content="#0e0f10" />');
    expect(page).toContain('<meta property="og:url" content="https://www.futasaku.com/terms/" />');
    expect(page).toContain('og.jpg?v=8');
  });

  it('the manifest has an id, a language and store categories', () => {
    const m = JSON.parse(pub('manifest.webmanifest'));
    expect(m).toMatchObject({ id: '/', lang: 'en', dir: 'ltr', categories: ['games', 'entertainment'] });
  });

  it('llms.txt and security.txt are plain, current and on www', () => {
    expect(pub('llms.txt')).toMatch(/^# Futasaku\n/);
    expect(pub('llms.txt')).toContain('https://www.futasaku.com/');
    const sec = pub('.well-known/security.txt');
    expect(sec).toContain('Contact: mailto:info@futasaku.com');
    expect(new Date(/Expires: (\S+)/.exec(sec)![1]!).getTime()).toBeGreaterThan(Date.parse('2026-11-13'));
  });

  it('iOS does not turn numbers into phone links; the sitemap and JSON-LD name the screenshot and how to play', () => {
    expect(meta('format-detection')).toBe('telephone=no');
    expect(pub('sitemap.xml')).toContain('<image:loc>https://www.futasaku.com/og.jpg</image:loc>');
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!);
    const game = ld['@graph'].find((n: { '@type': string }) => n['@type'] === 'VideoGame');
    expect(game.screenshot).toBe('https://www.futasaku.com/og.jpg');
    expect(game.potentialAction).toEqual({ '@type': 'PlayAction', target: 'https://www.futasaku.com/' });
  });

  it('shared result cards and replays carry the game address', () => {
    expect(read('../src/ui/sharecard.ts')).toMatch(/text: GAME_URL/);
    expect(read('../src/replay/video.ts')).toContain("text: 'https://www.futasaku.com/'");
  });
});
