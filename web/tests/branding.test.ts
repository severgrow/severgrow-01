// ONE definition of the mark per surface role (owner brand pack, 2026-11-07):
//   PAINT  → home-screen menu only (true vector SVG)
//   PLAIN  → small logos everywhere else (true vector SVG)
//   HEX    → app icon + card back (SVG → PNG/WebP offline)
//   FAVICON tree-hex → favicon + tiny marks (tree-only PNG; HEX has kanji)
//
// `web/e2e/branding-surfaces.ts` measures the built page. This file locks the source invariants
// that make that possible, so a future surface cannot quietly grow a second, drifting logo.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const branding = read('src/player/branding.ts');
const main = read('src/main.ts');

const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (name === 'assets' || name === 'fonts') return [];
  if (statSync(path).isDirectory()) return sources(path);
  return path.endsWith('.ts') ? [path] : [];
});

const allSource = sources(join(root, 'src')).map((path) => ({ path: path.slice(root.length), text: readFileSync(path, 'utf8') }));

describe('owner brand pack roles', () => {
  it('ships the owner pure-vector SVGs plus tree-only favicon and HEX PNG derivative', () => {
    for (const name of [
      'src/assets/brand/favicon-tree-hex.png',
      'src/assets/brand/plain-wordmark.svg',
      'src/assets/brand/paint-wordmark.svg',
      'src/assets/brand/hex-emblem.svg',
      'src/assets/brand/hex-emblem.png',
      'src/assets/brand/plain-wordmark.png',
    ]) expect(existsSync(join(root, name)), name).toBe(true);
  });

  it('tab icon: edge to edge, cream on a dark browser and off-black on a light one (owner, 2026-11-09)', () => {
    const html = read('index.html');
    for (const size of [16, 32, 48]) {
      expect(html).toContain(`href="./futasaku-tab-${size}.png"`);
      expect(html).toMatch(new RegExp(`href="./futasaku-tab-dark-${size}\\.png" media="\\(prefers-color-scheme: light\\)"`));
      for (const name of [`futasaku-tab-${size}.png`, `futasaku-tab-dark-${size}.png`]) {
        expect(existsSync(join(root, 'public', name)), name).toBe(true);
        // PNG width/height live at bytes 16..23 of the IHDR chunk
        const png = readFileSync(join(root, 'public', name));
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
      }
    }
    // the light-mode set comes after the default set, so a browser that ignores `media` still reads
    expect(html.indexOf('futasaku-tab-dark-16')).toBeGreaterThan(html.indexOf('futasaku-tab-48'));
  });

  it('PAINT and PLAIN SVGs are pure vector (no embedded raster)', () => {
    for (const name of ['src/assets/brand/plain-wordmark.svg', 'src/assets/brand/paint-wordmark.svg', 'src/assets/brand/hex-emblem.svg']) {
      const svg = read(name);
      expect(svg, name).not.toMatch(/<image|data:image/);
      expect(svg, name).toMatch(/<path/);
    }
    expect(read('src/assets/brand/paint-wordmark.svg').match(/<path/g)?.length ?? 0).toBeGreaterThanOrEqual(90);
  });

  it('maps PAINT SVG to the home menu and PLAIN SVG to small marks', () => {
    expect(branding).toContain("import paintUrl from '../assets/brand/paint-wordmark.svg?url'");
    expect(branding).toContain("import plainUrl from '../assets/brand/plain-wordmark.svg?url'");
    expect(branding).toContain('export const WORDMARK_URL: string = plainUrl');
    expect(branding).toContain('export const PAINT_URL: string = paintUrl');
    expect(branding).toMatch(/Home screen menu ONLY uses PAINT|paintMarkImg|paintUrl/);
    expect(branding).toContain('createHudBrandMark');
    expect(branding).toMatch(/markSvg\(id, plainUrl/);
  });

  it('only branding.ts imports the live brand marks', () => {
    const importers = allSource
      .filter((f) => /assets\/brand\/(paint-wordmark|plain-wordmark)/.test(f.text))
      .map((f) => f.path);
    expect(importers, 'a second surface with its own logo import drifts').toEqual([
      'src/player/branding.ts',
    ]);
  });

  it('every surface asks the same helper for its mark', () => {
    expect(branding).toMatch(/export function createHudBrandMark/);
    const finishes = main.match(/createHudBrandMark/g)?.length ?? 0;
    expect(finishes, 'main.ts must not hand-build a second mark').toBe(0);
    const players = allSource.filter((f) => /createHudBrandMark/.test(f.text)).map((f) => f.path).sort();
    expect(players).toEqual(['src/online/lobby-ui.ts', 'src/player/branding.ts', 'src/replay/player.ts']);
  });

  it('the mark is mounted outside #game, where the veils cannot reach it', () => {
    expect(branding).toMatch(/document\.body\.append\(image\)/);
    expect(branding).not.toMatch(/#game > \.hud'\)\?\.append/);
  });

  it('the badge is fixed above every veil and never filtered', () => {
    const css = branding.slice(branding.indexOf('export const BRANDING_CSS'));
    const rule = css.match(/#hud-brand\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/position:\s*fixed/);
    expect(rule).toMatch(/z-index:\s*7[0-9]/);
    expect(rule, 'a filter would blur the badge by design').not.toMatch(/(^|;|\s)(-webkit-)?filter\s*:/);
    expect(css).toMatch(/#go-brand\s*\{[^}]*var\(--futasaku-logo-height/);
    expect(branding).toMatch(/setProperty\('--futasaku-logo-height'/);
  });

  it('PAINT gets a barely-noticeable almost-black drop shadow on the home menu', () => {
    expect(branding).toMatch(/drop-shadow\(0 1px 1\.5px rgba\(8, 8, 10/);
  });

  it('the badge stands down while the install invitation is open', () => {
    const css = branding.slice(branding.indexOf('export const BRANDING_CSS'));
    expect(css)
      .toMatch(/:has\(#install-prompt:not\(\[hidden\]\)\)\s*#hud-brand\s*\{\s*display:\s*none/);
  });

  // OWNER CHANGED THE RULE (2026-11-08: the desktop menu showed the brush grain as rectangles, "should
  // never happen"): the home menu uses a 4x render of the vector, not the SVG. Still never a SOFT
  // upsample: it is rendered from the vector at 4x its largest on-screen size.
  it('preloads the 4x PAINT render, not a soft raster upsample or the retired primary SVG', () => {
    expect(read('index.html')).toMatch(/rel="preload" href="\.\/src\/assets\/brand\/paint-wordmark-4x\.webp"/);
    expect(read('index.html')).not.toMatch(/paint-wordmark-shadow-3x\.png/);
    expect(read('index.html')).not.toMatch(/futasaku-primary-logo\.svg/);
  });

  it('home PAINT box matches the SVG viewBox aspect and avoids crunchy rendering', () => {
    const css = branding.slice(branding.indexOf('export const BRANDING_CSS'));
    expect(css).toMatch(/#menu #logo\s*\{[^}]*aspect-ratio:\s*1995\s*\/\s*565/);
    expect(css).toMatch(/image-rendering:\s*auto/);
    expect(read('src/style.css')).toMatch(/paint-wordmark-4x\.webp/);
    expect(read('src/player/planet-lockup.ts')).toMatch(/aspect-ratio:\s*1995\s*\/\s*565/);
  });

  it('does not ship the soft 3× PAINT upsample as a live asset', () => {
    expect(existsSync(join(root, 'src/assets/brand/paint-wordmark-3x.png'))).toBe(false);
    expect(existsSync(join(root, 'src/assets/brand/paint-wordmark-shadow-3x.png'))).toBe(false);
    expect(existsSync(join(root, 'src/assets/brand/paint-wordmark-shadow.png'))).toBe(false);
  });
});

describe('the home PAINT mark cannot come apart (owner, 2026-11-08)', () => {
  it('is one 4x render of the vector: wide enough for a retina desktop menu, and small', async () => {
    const { readFileSync, statSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const file = fileURLToPath(new URL('../src/assets/brand/paint-wordmark-4x.webp', import.meta.url));
    const buf = readFileSync(file);
    // RIFF....WEBP, VP8L/VP8X: width from the VP8X header (24-bit, little-endian, +1)
    expect(buf.subarray(0, 4).toString()).toBe('RIFF');
    expect(buf.subarray(8, 12).toString()).toBe('WEBP');
    const chunk = buf.subarray(12, 16).toString();
    const width = chunk === 'VP8X' ? 1 + buf.readUIntLE(24, 3) : 0;
    expect(width).toBeGreaterThanOrEqual(1800); // the desktop menu shows it at ~450 px, x4
    expect(statSync(file).size).toBeLessThan(200_000);
    const branding = readFileSync(fileURLToPath(new URL('../src/player/branding.ts', import.meta.url)), 'utf8');
    expect(branding).toContain('img.src = paintMenuUrl;');
  });
});
