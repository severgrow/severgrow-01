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
import { deployLabel } from '../src/feedback/deploy.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const html = read('../index.html');
const mountSource = read('../src/feedback/mount.ts');
/** The line's words and link are painted by ONE function, called from the menu's first layout. */
const lineSource = read('../src/feedback/beta-line.ts');
const mainSource = read('../src/main.ts');

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
    expect(lineSource).toMatch(/beta\.append\(document\.createTextNode\(`\$\{FEEDBACK\.betaNote\(FEEDBACK\.betaVersion\)\} `\)\)/);
    expect(lineSource).toMatch(/beta\.hidden = false/);
    // Painted with the other menu keys (owner, 2026-10-22: everything on the menu appears at once),
    // and the feedback module paints through the same function if it arrives first.
    const layout = mainSource.slice(mainSource.indexOf('function layoutMenu('), mainSource.indexOf('function layoutMenu(') + 6000);
    expect(layout).toContain("paintBetaLine(document.getElementById('menu-beta'))");
    expect(mountSource).toContain("paintBetaLine(document.getElementById('menu-beta'))");
    // The old rule that hid it on the product menu is gone (owner, 2026-10-20).
    expect(mountSource).not.toMatch(/note\.hidden = FEATURES\.campaign/);
    // It never creates a duplicate element of its own.
    expect(mountSource).not.toMatch(/note\.id = 'menu-beta'/);
  });

  it('carries the version and the link words from the one strings module', () => {
    // PINNED to the shipped value, not merely the shape: the menu line is what a player reads, so a
    // silent drift (0.7 -> 0.8 half-deployed) must fail here rather than ship. Bump this in the same
    // commit that bumps FEEDBACK.betaVersion.
    expect(FEEDBACK.betaVersion).toBe('0.7');
    expect(FEEDBACK.betaNote(FEEDBACK.betaVersion)).toContain('(0.7)');
    expect(FEEDBACK.betaLink).toBe('let us know here.');
    expect(lineSource).toContain('FEEDBACK.betaLink');
    // No second copy of the sentence in the markup or the modules.
    expect(html).not.toContain('This is a beta version');
    expect(mountSource).not.toContain('This is a beta version');
    expect(lineSource).not.toContain('This is a beta version');
  });

  // Owner, 2026-10-27: no date or time stamp on the main menu. (It carried a "last update" stamp
  // from 2026-10-22; the owner took it off.) The build still records when it was made — deploy.ts
  // and vite's __DEPLOYED_AT__ are untouched — it is just no longer shown on the menu.
  it('shows no date or time on the main menu', () => {
    expect(FEEDBACK.betaNote('0.7')).toBe(
      'This is a beta version (0.7) of an evolving game. If you spot any problems or have suggestions for improvement,',
    );
    expect(FEEDBACK.betaNote('0.7')).not.toMatch(/last update|\d{1,2}:\d{2}|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/);
    expect(lineSource).not.toMatch(/deployLabel|DEPLOYED_AT/);
    // the deploy stamp itself still works for anything that wants it later
    expect(deployLabel('2026-10-22T11:12:20Z', 'UTC')).toBe('22 Oct, 11:12');
    for (const bad of ['', 'not a date', undefined, null]) expect(deployLabel(bad as never)).toBeNull();
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
