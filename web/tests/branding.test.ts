// ONE definition of the mark per surface role (owner brand pack, 2026-11-07):
//   PAINT  → home-screen menu only
//   PLAIN  → small logos everywhere else
//   HEX    → app icon + card back (built offline)
//   FAVICON tree-hex → favicon + tiny marks
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
  it('ships the four exact owner-supplied rasters', () => {
    for (const name of [
      'src/assets/brand/favicon-tree-hex.png',
      'src/assets/brand/plain-wordmark.png',
      'src/assets/brand/hex-emblem.png',
      'src/assets/brand/paint-wordmark.png',
      'src/assets/brand/paint-wordmark-shadow.png',
    ]) expect(existsSync(join(root, name)), name).toBe(true);
  });

  it('ships a 3× PAINT derivative for the home menu (owner art is 300×94 only)', () => {
    const pngSize = (rel: string): { w: number; h: number } => {
      const buf = readFileSync(join(root, rel));
      expect(buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), rel).toBe(true);
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    };
    expect(pngSize('src/assets/brand/paint-wordmark.png')).toEqual({ w: 300, h: 94 });
    expect(pngSize('src/assets/brand/paint-wordmark-3x.png')).toEqual({ w: 900, h: 282 });
    expect(pngSize('src/assets/brand/paint-wordmark-shadow-3x.png')).toEqual({ w: 948, h: 330 });
  });

  it('maps PAINT to the home menu and PLAIN to small marks', () => {
    expect(branding).toContain("import paintUrl from '../assets/brand/paint-wordmark-shadow-3x.png?url'");
    expect(branding).toContain("import plainUrl from '../assets/brand/plain-wordmark.png?url'");
    expect(branding).toContain('export const WORDMARK_URL: string = plainUrl');
    expect(branding).toContain('export const PAINT_URL: string = paintUrl');
    expect(branding).toMatch(/Home screen menu ONLY uses PAINT|paintMarkImg|paintUrl/);
    expect(branding).toContain('createHudBrandMark');
    expect(branding).toMatch(/markSvg\(id, plainUrl/);
  });

  it('only branding.ts imports the live brand rasters', () => {
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
    expect(existsSync(join(root, 'src/assets/brand/paint-wordmark-shadow.png'))).toBe(true);
  });

  it('the badge stands down while the install invitation is open', () => {
    const css = branding.slice(branding.indexOf('export const BRANDING_CSS'));
    expect(css)
      .toMatch(/:has\(#install-prompt:not\(\[hidden\]\)\)\s*#hud-brand\s*\{\s*display:\s*none/);
  });

  it('preloads the PAINT mark, not the retired primary SVG', () => {
    expect(read('index.html')).toMatch(/paint-wordmark-shadow-3x\.png/);
    expect(read('index.html')).not.toMatch(/futasaku-primary-logo\.svg/);
  });

  it('home PAINT box matches the shadowed mark aspect and avoids crunchy rendering', () => {
    const css = branding.slice(branding.indexOf('export const BRANDING_CSS'));
    expect(css).toMatch(/#menu #logo\s*\{[^}]*aspect-ratio:\s*316\s*\/\s*110/);
    expect(css).toMatch(/image-rendering:\s*auto/);
    expect(read('src/style.css')).toMatch(/paint-wordmark-shadow-3x\.png/);
    expect(read('src/player/planet-lockup.ts')).toMatch(/aspect-ratio:\s*316\s*\/\s*110/);
  });
});
