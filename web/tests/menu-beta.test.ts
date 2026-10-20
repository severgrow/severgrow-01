// The main menu's beta line, locked at the source (owner decision, 2026-10-20).
//
// Placement is a product rule: the line sits BETWEEN the wordmark and the entries — logo → beta line
// → PLAY → TERRITORY → LOG IN → Settings — so it is seen, tabbed to and read in that order. It is a
// quiet version line (never a fourth button), it is legible and its link is a full 44px tap target,
// and it opens its own sheet. This file guards the wiring and the words; web/e2e/beta-feedback.ts
// proves the behaviour in a real browser and web/e2e/menu-fit.ts proves it still fits every screen.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FEEDBACK } from '../../src/strings.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const html = read('../index.html');
const mountSource = read('../src/feedback/mount.ts');

const menuSection = html.slice(html.indexOf('<section id="menu"'), html.indexOf('</section>', html.indexOf('<section id="menu"')));
/** The `#menu-beta` rule block from the feedback module's own CSS. */
const betaRules = (): string => {
  const start = mountSource.indexOf('#menu-beta {');
  expect(start, 'feedback/mount.ts must style #menu-beta').toBeGreaterThan(-1);
  return mountSource.slice(start, mountSource.indexOf('#menu-beta button:focus-visible'));
};

describe('the beta line is a quiet version line between the wordmark and the entries', () => {
  it('has one slot in the markup, in source order, empty until the feedback module fills it', () => {
    expect(menuSection).toMatch(/<p id="menu-beta" class="tagline" hidden><\/p>/);
    expect(menuSection.indexOf('class="title"')).toBeLessThan(menuSection.indexOf('id="menu-beta"'));
    expect(menuSection.indexOf('id="menu-beta"')).toBeLessThan(menuSection.indexOf('class="menu-buttons"'));
    // Exactly one beta slot: no second copy anywhere in the page.
    expect(html.match(/id="menu-beta"/g) ?? []).toHaveLength(1);
  });

  it('fills the existing slot and reveals it, on every channel', () => {
    expect(mountSource).toContain("const beta = document.getElementById('menu-beta')");
    expect(mountSource).toMatch(/beta\.append\(document\.createTextNode\(`\$\{FEEDBACK\.betaNote\(FEEDBACK\.betaVersion\)\} `\)\)/);
    expect(mountSource).toMatch(/beta\.hidden = false/);
    // The old rule that hid it on the product menu is gone (owner, 2026-10-20).
    expect(mountSource).not.toMatch(/note\.hidden = FEATURES\.campaign/);
    // It never creates a duplicate element of its own.
    expect(mountSource).not.toMatch(/note\.id = 'menu-beta'/);
  });

  it('carries the version and the link words from the one strings module', () => {
    expect(FEEDBACK.betaVersion).toMatch(/^\d+\.\d+$/);
    expect(FEEDBACK.betaNote(FEEDBACK.betaVersion)).toContain(`(${FEEDBACK.betaVersion})`);
    expect(FEEDBACK.betaLink).toBe('let us know here.');
    expect(mountSource).toContain('FEEDBACK.betaLink');
    // No second copy of the sentence in the markup or the module.
    expect(html).not.toContain('This is a beta version');
    expect(mountSource).not.toContain('This is a beta version');
  });

  it('opens its sheet: the tester guide before a server, the report form once there is one', () => {
    expect(mountSource).toMatch(/betaLink\.addEventListener\('click', \(\) => openGuide\(\)\)/);
    expect(mountSource).toMatch(/if \(betaLink\) \{[\s\S]{0,240}openReport/);
  });

  it('is legible but secondary, and its link is a full 44px tap target', () => {
    const css = betaRules();
    // Secondary: the menu's quiet cream, not the entries' cream fill.
    expect(css).toContain('var(--fu-cream-62)');
    // A real 44px box, pulled back into the text line so the line stays one quiet line.
    expect(css).toMatch(/min-height: 44px/);
    expect(css).toMatch(/margin: -13px 0/);
    expect(css).toContain('text-decoration: underline');
  });
});
