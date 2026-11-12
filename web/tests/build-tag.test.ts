// THE PUBLISH NUMBER ON THE MENU (owner, 2026-11-08: "on main futasaku.com also include the publish number
// like '46f8579a' just make it less visible and no 'test'"). Each publish writes the commit it built into
// ./BUILD_SHA beside the page (.github/workflows/futasaku04-preview.yml). The menu's beta line ends with
// its first 8 characters, faint, the same on futasaku.com and /test/, never with the word "test".
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUILD_TAG_CSS, buildTagOf } from '../src/feedback/build-tag.js';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

describe('the publish number', () => {
  it('reads the 8-character commit from BUILD_SHA, and nothing else', () => {
    expect(buildTagOf('46f8579ac55df096c40325bada0d274df2e3cb7a\n')).toBe('46f8579a');
    expect(buildTagOf('46f8579a')).toBe('46f8579a');
    // a missing file is the site's HTML 404 page, an empty file, or junk: no tag at all
    for (const bad of ['', '<!doctype html><title>404</title>', 'test 46f8579a', 'zzzzzzzz', null]) expect(buildTagOf(bad)).toBeNull();
  });
  it('is faint and small, and never says "test"', () => {
    expect(BUILD_TAG_CSS).toMatch(/#menu-beta \.beta-build \{[^}]*opacity:\s*0?\.(3[5-9]|4[0-9])/);
    const src = read('../src/feedback/build-tag.ts');
    // the span holds the number and nothing else: no "test", no label
    expect(src).toContain('span.textContent = tag;');
    expect(src).not.toMatch(/['"`]\s*test\b/i);
  });
  it('is asked for after the menu is painted, never delaying it', () => {
    const main = read('../src/main.ts');
    expect(main).toMatch(/paintBetaLine\(document\.getElementById\('menu-beta'\)\);\n\s*void paintBuildTag\(document\.getElementById\('menu-beta'\)\);/);
  });
});
