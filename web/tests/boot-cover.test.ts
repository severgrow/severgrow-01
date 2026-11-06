// THE BOOT COVER (owner, 2026-11-06: "in live .com version when opening the website first thing it
// loads the old logo, the old territory view background all for 0.5s and then to our screen. on /test
// version there is short black fade in loading screen that takes you straight to beautiful loaded
// menu ... the solution from /test should be on live too").
//
// Whatever a browser has from earlier visits, nothing half-built ever shows: a cover in the page's
// very first paint (the HTML itself, before any script), lifted with a short fade once the menu is
// composed, never later than a cap.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOOT_COVER_MAX_MS, BOOT_COVER_FADE_MS } from '../src/player/boot-cover.js';
import { STARTUP_FADE_MS } from '../src/player/startup.js';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const html = read('../index.html');
const main = read('../src/main.ts');

describe('the boot cover', () => {
  it('is in the HTML itself, painted before any script, for the live game (html.space-first) only', () => {
    expect(html).toMatch(/<div id="boot-cover" aria-hidden="true"><\/div>/);
    const css = html.slice(html.indexOf('<style id="boot-cover-css">'), html.indexOf('</style>', html.indexOf('<style id="boot-cover-css">')));
    expect(css).toContain('html.space-first #boot-cover');
    expect(css).toMatch(/position:\s*fixed/);
    expect(css).toMatch(/inset:\s*0/);
    expect(css).toMatch(/background:\s*#0e0f10/);
    // the cover sits in <head> so it applies before the body is parsed
    expect(html.indexOf('<style id="boot-cover-css">')).toBeLessThan(html.indexOf('</head>'));
    // the cover element comes before every screen in the body
    expect(html.indexOf('id="boot-cover"')).toBeLessThan(html.indexOf('id="menu"'));
  });

  it('says "dark" before anything else loads, so no browser blinks white first (owner, 2026-11-06: "it flashes white for like 0.1s before doing the black fade in")', () => {
    const head = html.slice(0, html.indexOf('</head>'));
    const firstLoad = Math.min(...['<script', '<link'].map((t) => head.indexOf(t)).filter((i) => i >= 0));
    const scheme = head.indexOf('<meta name="color-scheme" content="dark"');
    const ground = head.indexOf('<style id="first-ground">');
    expect(scheme).toBeGreaterThan(0);
    expect(ground).toBeGreaterThan(0);
    // both before the first script or stylesheet
    expect(scheme).toBeLessThan(firstLoad);
    expect(ground).toBeLessThan(firstLoad);
    const css = head.slice(ground, head.indexOf('</style>', ground));
    expect(css).toMatch(/html\{[^}]*background:\s*#18191a/);
    // html:where(): no stronger than style.css, so the loaded page keeps its own ground
    expect(css).toMatch(/html:where\(\.space-first\)\{[^}]*background:\s*#0e0f10/);
  });

  it('uses one calm first reveal with a bounded readiness wait', () => {
    expect(BOOT_COVER_FADE_MS).toBeGreaterThanOrEqual(150);
    // OWNER CHANGED THE RULE (2026-11-06: "black screen until fully loaded and fade in ... no longer
    // than 1s or 1.5s"): a short fade, so the whole entrance stays inside 1.5 s.
    expect(BOOT_COVER_FADE_MS).toBe(300);
    expect(STARTUP_FADE_MS).toBe(400);
    expect(html).toMatch(/startupFallback = setTimeout\([\s\S]{0,200}\}, 1200\);/);
    expect(BOOT_COVER_MAX_MS).toBeLessThanOrEqual(1500);
    expect(main).toContain('liftBootCover(');
  });
});
