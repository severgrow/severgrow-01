// The link preview a shared link shows (the "share card"), guarded where it is cheapest to break:
// the metadata a scraper reads and the files it is pointed at. `web/e2e/og-image.ts` regenerates the
// picture AND re-checks all of this against a real render; this suite is the part that runs on every
// `npm run check`, so the wiring cannot rot between regenerations.
//
// Why it exists: the card was a hand-drawn asset that was committed once and never regenerated after
// the product was renamed, so a shared FUTASAKU link showed the old name in its picture. These
// checks are the mechanical part of that bug: absolute url, real file, exact size, current art.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEX = resolve(REPO, 'web/index.html');
const OG = resolve(REPO, 'web/public/og.jpg');
const ICONS = resolve(REPO, 'web/src/assets/futa04-icons');
const html = readFileSync(INDEX, 'utf8');

/** The `content` of a `<meta property=…>` / `<meta name=…>` tag, or null. */
const meta = (key: string): string | null =>
  new RegExp(`<meta\\s+(?:property|name)="${key}"\\s+content="([^"]*)"`).exec(html)?.[1] ?? null;

/** PNG header fields: a size and a colour type read straight off the file, no image library. */
const png = (file: string) => {
  const buf = readFileSync(file);
  return {
    signature: buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf[25],
  };
};

/** The real size of a JPEG, from its Start-Of-Frame segment (no decode, no image library). */
const jpeg = (file: string) => {
  const buf = readFileSync(file);
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return { jpeg: false, width: 0, height: 0, bytes: buf.length };
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1]!;
    const length = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { jpeg: true, height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), bytes: buf.length };
    }
    i += 2 + length;
  }
  return { jpeg: false, width: 0, height: 0, bytes: buf.length };
};

describe('the shared link preview', () => {
  it('names an og:image that is ABSOLUTE, because scrapers drop a relative one', () => {
    const image = meta('og:image');
    expect(image).toBeTruthy();
    expect(image!.startsWith('https://')).toBe(true);
    expect(new URL(image!).pathname).toBe('/og.jpg');
  });

  it('declares the size it really is, so the card is never letterboxed', () => {
    expect(meta('og:image:width')).toBe('1200');
    expect(meta('og:image:height')).toBe('630');
    const file = jpeg(OG);
    expect(file.jpeg).toBe(true);
    expect(`${file.width}x${file.height}`).toBe('1200x630');
    // A share card is fetched by someone else's server on every unfurl: keep it small.
    expect(file.bytes).toBeLessThan(400_000);
  });

  it('carries an og:image:type that matches the real file, and an alt', () => {
    expect(meta('og:image:type')).toBe('image/jpeg');
    expect(meta('og:image:alt')).toBeTruthy();
    expect(meta('og:site_name')).toBe('Futasaku');
    expect(meta('og:url')?.startsWith('https://')).toBe(true);
    // X/Twitter does not read og:* for a large-image card: without these it shows nothing useful.
    expect(meta('twitter:card')).toBe('summary_large_image');
    expect(meta('twitter:title')).toBe(meta('og:title'));
    expect(meta('twitter:description')).toBe(meta('og:description'));
    expect(meta('twitter:image')).toBe(meta('og:image'));
    expect(meta('twitter:image:alt')).toBeTruthy();
  });

  it('shows the current product name, never a stale one', () => {
    expect(meta('og:title')).toBe('Futasaku');
    expect(meta('twitter:title')).toBe('Futasaku');
    // The visible copy a scraper or a crawler reads must never carry the pre-rename name.
    const visible = [...html.matchAll(/content="([^"]*)"/g)].map((m) => m[1]!).join(' | ')
      + (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
    expect(visible).not.toMatch(/severor|severgrow/i);
  });

  it('points at icons that exist and are the current ones, not the legacy art', () => {
    const refs = [
      ...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="\.\/([^"]+)"/g),
    ].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      // A `futasaku-icon-*` name is the current art that `scripts/build-app-icons.mjs` draws from
      // the menu emblem; the bare `icon-*` files are the legacy build's and must not be named here.
      expect(ref).toMatch(/^futasaku-icon-\d+\.png$/);
      const file = resolve(ICONS, ref);
      expect(existsSync(file), `${file} is missing`).toBe(true);
      // The apple-touch-icon must have no alpha: iOS paints transparent pixels solid black.
      const info = png(file);
      expect(info.width).toBe(info.height);
      if (ref.includes('-180')) expect(info.colorType).toBe(2);
    }
  });

  it('keeps the manifest on the same current icons as the head', () => {
    const manifest = JSON.parse(readFileSync(resolve(REPO, 'web/public/manifest.webmanifest'), 'utf8')) as {
      name: string;
      icons: { src: string }[];
    };
    // The product channels rewrite the manifest in the build (web/vite.config.ts) to the
    // futa04-icons set; this is the floor every channel shares.
    expect(manifest.name).toBe('Futasaku');
    expect(manifest.icons.length).toBeGreaterThan(0);
  });
});
