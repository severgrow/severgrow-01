// EVERY SUBMENU ON DARK GLASS (owner, 2026-10-23: "use glass style on all submenus"). The pause
// panel's glass is the family look: every sheet wears it and floats clear of the edges on a phone,
// the PLAY submenu and the difficulty list rest on the same plate, and the screen behind an open
// sheet is veiled. Locked at the source; the screenshots were checked in a real browser.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../src/style.css', import.meta.url)), 'utf8');
const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
// The game's one dark glass (owner, 2026-10-23: "that's not the dark glass"): the lesson window's recipe.
const glass = /background: var\(--dark-glass\);\s*-webkit-backdrop-filter: var\(--dark-glass-blur\);\s*backdrop-filter: var\(--dark-glass-blur\);/;

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

describe('the screen behind an open sheet is veiled by the backdrop — and only while one is open', () => {
  it('counts only the top-level sheets (the install sheet lives inside its own hidden container)', () => {
    // The veil is the backdrop's own blur: it exists only while the scrim (or the install
    // invitation's own scrim) is shown, so a closed sheet can never leave a screen blurred.
    expect(css).toMatch(/html\.futasaku-product \.scrim,\s*html\.futasaku-product #gameover,\s*html\.futasaku-product \.install-prompt-scrim \{/);
    expect(css).not.toMatch(/:has\([^)]*\.sheet:not\(\[hidden\]\)/);
    expect(html).toMatch(/<div id="install-prompt" class="install-prompt" hidden data-ix-surface>[\s\S]{0,400}<section class="sheet install-sheet"/);
  });
});

describe('no frame around the glass, ever (owner, 2026-10-23)', () => {
  it('the last word on every glass surface takes away the border and the edge line', () => {
    const tail = css.slice(css.lastIndexOf('NO FRAME AROUND THE GLASS'));
    const rule = /html\.futasaku-product :is\(\.sheet, #sheet-menu, #gameover \.go-card, #play-menu \.levels-inner, #levels \.levels-inner\) \{([^}]*)\}/.exec(tail)?.[1] ?? '';
    expect(rule).toMatch(/border: 0;/);
    // Match Intel's own setup: its 15px corner and a soft DROP shadow, never an inset edge line.
    expect(rule).toMatch(/border-radius: 15px;/);
    expect(rule).toMatch(/box-shadow: 0 10px 28px rgba\(0, 0, 0, 0\.22\);/);
    expect(rule).not.toMatch(/inset/);
    expect(tail).toMatch(/html\.futasaku-product #gameover \.go-card::before \{\s*display: none;/);
    // nothing after it brings a frame back
    expect(tail.slice(tail.indexOf('display: none;'))).not.toMatch(/border:\s*[1-9]/);
  });
  it('the glass rules themselves carry no frame', () => {
    for (const re of [/#sheet-menu \{\n  --gm-pad[^}]*\}/, /html\.futasaku-product #gameover \.go-card \{[^}]*\}/, /html\.futasaku-product \.sheet \{[^}]*\}/, /html\.futasaku-product :is\(#play-menu, #levels\) \.levels-inner \{[^}]*\}/]) {
      const rule = re.exec(css)?.[0] ?? '';
      expect(rule.length, String(re)).toBeGreaterThan(0);
      expect(rule, String(re)).not.toMatch(/border: 1px|box-shadow: inset/);
    }
  });
});

describe('the dark glass is the lesson window\'s own recipe', () => {
  const surface = readFileSync(fileURLToPath(new URL('../src/player/glass-surface.ts', import.meta.url)), 'utf8');
  it('the shared tokens match the glass surface the lessons and Match Intel use', () => {
    expect(surface).toMatch(/background:rgba\(8,10,10,\.42\)/);
    expect(surface).toMatch(/backdrop-filter:blur\(9px\) saturate\(1\.05\)/);
    expect(css).toMatch(/--dark-glass: rgba\(8, 10, 10, 0\.42\);\s*--dark-glass-blur: blur\(9px\) saturate\(1\.05\);/);
    expect(css).not.toMatch(/color-mix\(in srgb, var\(--c-surface\) 72%, transparent\)/);
  });
});

describe('the install invitation is a dialog on the glass, not a bottom sheet (owner, 2026-10-24)', () => {
  // "grow futasaku on ur home screen looks so cramped — that can never happen. stretch the dark
  // glass and blur background so it's nice". The rules that stop it regressing are pinned here;
  // the four sizes (320x568, 390x844, 768x1024, 1280x800) were measured in a real browser.
  const block = css.slice(
    css.indexOf('THE INSTALL INVITATION, AS A DIALOG ON THE GLASS'),
    css.indexOf('/* ONE TITLE PATTERN'),
  );

  it('the card is centred by its own container, with air on every side', () => {
    expect(block).toMatch(/#install-prompt \{\s*display: grid;\s*place-items: center;/);
    expect(block).toMatch(/padding: max\(16px, env\(safe-area-inset-top\)\)/);
  });

  it('nothing can anchor it to a window edge', () => {
    // STATIC, and the wide-screen dialog centring (left/top 50% + a -50% transform) is named: that
    // transform moved the card half its own size up and to the LEFT, hanging it off a desktop
    // window's top. Offsets are inert on a static box; the transform is not.
    expect(block).toMatch(/position: static;/);
    expect(block).toMatch(/transform: none;/);
    expect(block).toMatch(/inset: auto;/);
    expect(block).not.toMatch(/bottom: max\(10px/);
  });

  it('the title owns its line and the close key cannot sit on the words', () => {
    // The sheet family places the close ABSOLUTELY at the right and centres the title under it.
    // For a sentence-length title that is what read as cramped, so this card puts both in flow.
    expect(block).toMatch(/#install-prompt \.sheet-head > \.icon-only:last-child \{\s*position: static;/);
    expect(block).toMatch(/#install-prompt #install-title \{[^}]*text-align: left;/);
    expect(block).toMatch(/text-wrap: balance;/);
    expect(block).toMatch(/font-size: clamp\(1\.15rem, 4\.6vw, 1\.32rem\);/);
  });

  it('the page behind it is veiled harder than a sheet is, because it opens over a finished game', () => {
    expect(block).toMatch(/backdrop-filter: blur\(20px\) brightness\(0\.5\) saturate\(0\.9\);/);
  });

  it('a short screen tightens the rhythm rather than turning the plate into a scroller', () => {
    expect(block).toMatch(/@media \(max-height: 700px\)/);
    expect(block).toMatch(/font-size: 0\.88rem;/);
  });
});

describe('Match Intel\'s own glass has no frame either', () => {
  it('blur, shade and a soft drop shadow; no border and no inset edge line', () => {
    const surface = readFileSync(fileURLToPath(new URL('../src/player/glass-surface.ts', import.meta.url)), 'utf8');
    const base = /#futasaku-glass \{ position:fixed;[^}]*\}/.exec(surface)?.[0] ?? '';
    expect(base).toContain('border:none');
    expect(base).toContain('box-shadow:0 10px 28px rgba(0,0,0,.22)');
    expect(base).not.toMatch(/inset|border:1px/);
  });
});
