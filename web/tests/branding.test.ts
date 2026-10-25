// ONE definition of the mark, and a mark that can never sit under a veil again.
//
// Owner (2026-10-24): "when paused - dont blur the futasaku in top right corner , show the same
// logo nicely symmetricallyy on the end of game screen and any similar ... use branding very
// wisely, but have nearly every page have the logo somewhere".
//
// `web/e2e/branding-surfaces.ts` measures the built page. This file locks the source invariants
// that make that possible, so a future surface cannot quietly grow a second, drifting logo:
//   - exactly one module imports the silhouette assets, and exactly one function builds the mark;
//   - the pause/finish/submenu mark is the SAME helper (`createHudBrandMark`), never a copy;
//   - the mark is app-level and fixed, above the veils, not a child of the HUD (`#game`), where
//     the pause scrim's and the finish screen's `backdrop-filter` used to smear it.
import { readFileSync, readdirSync, statSync } from 'node:fs';
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

describe('one Futasaku mark, drawn once', () => {
  it('only branding.ts imports the silhouette art', () => {
    const importers = allSource
      .filter((f) => /futasaku-(emblem|wordmark)-silhouette/.test(f.text))
      .map((f) => f.path);
    expect(importers, 'a second surface with its own copy of the logo drifts in weight and colour').toEqual([
      'src/player/branding.ts',
    ]);
  });

  it('the mask is built in exactly one function', () => {
    // The alpha-thresholded silhouette: one feComponentTransfer, one feFlood tinted by --c-accent.
    expect(branding.match(/<feComponentTransfer/g)?.length ?? 0).toBe(1);
    expect(branding.match(/--c-accent/g)?.length ?? 0).toBeGreaterThan(0);
    expect(branding).not.toMatch(/fill\s*[:=]\s*['"]#(?:fff|ffffff|d4af37)/i);
  });

  it('every surface asks the same helper for its mark', () => {
    // The finish plate's cap and the HUD badge are ONE helper, one asset, one filter treatment.
    expect(branding).toMatch(/export function createHudBrandMark/);
    const finishes = main.match(/createHudBrandMark/g)?.length ?? 0;
    expect(finishes, 'main.ts must not hand-build a second mark').toBe(0);
    const players = allSource.filter((f) => /createHudBrandMark/.test(f.text)).map((f) => f.path).sort();
    // Three surfaces, ONE helper: the lobby's header, the replay's footer (owner brief, 2026-10-25:
    // "the replay shows only the board and the logo") and branding.ts that builds it. The replay
    // asks this helper rather than drawing its own mark — which is exactly what the rule wants.
    expect(players).toEqual(['src/online/lobby-ui.ts', 'src/player/branding.ts', 'src/replay/player.ts']);
  });

  it('the mark is mounted outside #game, where the veils cannot reach it', () => {
    // The pause scrim and the finish screen blur their backdrop; anything inside #game is behind
    // them. The badge is appended to the page itself.
    expect(branding).toMatch(/document\.body\.append\(image\)/);
    expect(branding).not.toMatch(/#game > \.hud'\)\?\.append/);
  });

  it('the badge is fixed above every veil and never filtered', () => {
    const css = branding.slice(branding.indexOf('export const BRANDING_CSS'));
    const rule = css.match(/#hud-brand\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule, 'the badge needs its own layer above the scrim (z 10), sheets (z 11) and the finish plate (z 12)').toMatch(/position:\s*fixed/);
    expect(rule).toMatch(/z-index:\s*7[0-9]/);
    expect(rule, 'a filter would blur the badge by design').not.toMatch(/(^|;|\s)(-webkit-)?filter\s*:/);
    // The finish cap and the corner badge share one size token, set once on the document.
    expect(css).toMatch(/#go-brand\s*\{[^}]*var\(--futasaku-logo-height/);
    expect(branding).toMatch(/setProperty\('--futasaku-logo-height'/);
  });
});
