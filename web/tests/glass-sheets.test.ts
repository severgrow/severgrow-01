// EVERY SUBMENU ON DARK GLASS (owner, 2026-10-23: "use glass style on all submenus"). The pause
// panel's glass is the family look: every sheet wears it and floats clear of the edges on a phone,
// the PLAY submenu and the difficulty list rest on the same plate, and the screen behind an open
// sheet is veiled. Locked at the source; the screenshots were checked in a real browser.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../src/style.css', import.meta.url)), 'utf8');
const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const glass = /background: color-mix\(in srgb, var\(--c-surface\) 72%, transparent\);\s*-webkit-backdrop-filter: blur\(18px\) saturate\(1\.15\);\s*backdrop-filter: blur\(18px\) saturate\(1\.15\);/;

describe('every sheet is the pause panel\'s glass', () => {
  it('on the product channels, every .sheet wears the glass', () => {
    const rule = /html\.futasaku-product \.sheet \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(glass);
  });
  it('floats clear of the edges on a phone, and stays a centred dialog on wide screens', () => {
    expect(css).toMatch(/html\.futasaku-product \.sheet:not\(#sheet-menu\):not\(\.confirm-sheet\) \{\s*left: 10px;\s*right: 10px;/);
    expect(css).toMatch(/\(orientation: landscape\) and \(max-height: 560px\) \{\s*html\.futasaku-product \.sheet:not\(#sheet-menu\):not\(\.confirm-sheet\) \{\s*left: 50%;\s*right: auto;\s*bottom: auto;/);
  });
  it('the PLAY submenu and the difficulty list rest on the same plate', () => {
    const rule = /html\.futasaku-product :is\(#play-menu, #levels\) \.levels-inner \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(glass);
  });
});

describe('the screen behind an open sheet is veiled — and only when a sheet is really open', () => {
  it('counts only the top-level sheets (the install sheet lives inside its own hidden container)', () => {
    expect(css).toContain('html.futasaku-product:has(body > .sheet:not([hidden]), .install-prompt:not([hidden])) .screen:not(#game):not([hidden])');
    expect(css).not.toMatch(/:has\(\.sheet:not\(\[hidden\]\)/);
    expect(html).toMatch(/<div id="install-prompt" class="install-prompt" hidden data-ix-surface>[\s\S]{0,400}<section class="sheet install-sheet"/);
  });
});
