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
    // The finish plate's entering hairline used to be switched off here; the pseudo-element and its
    // animation are gone entirely now (owner, 2026-11-02: no interior rules in windows).
    expect(css).not.toMatch(/#gameover \.go-card::before/);
    expect(css).not.toMatch(/go-hairline/);
    // nothing in the last-word block brings a frame back
    expect(rule).not.toMatch(/border:\s*[1-9]/);
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
  it('its denser READING variant is still frameless (owner, 2026-11-02)', () => {
    // The reading surface keeps its documented density (0.86 + blur 16) because the hand's cards
    // showed through at 42%, but the 1px inset ivory hairline it used to add all round was a
    // frame contour drawn on the glass. The owner's rule is that no window has one.
    const surface = readFileSync(fileURLToPath(new URL('../src/player/glass-surface.ts', import.meta.url)), 'utf8');
    // The variant is declared twice (layout, then material); read every block.
    const intelBlocks = [...surface.matchAll(/#futasaku-glass\[data-mode='intel'\] \{([^}]*)\}/g)].map((m) => m[1] ?? '');
    const intel = intelBlocks.find((block) => block.includes('background')) ?? '';
    expect(intel).toContain('background:rgba(8,10,10,.86)');
    expect(intel).toContain('backdrop-filter:blur(16px) saturate(1.05)');
    expect(intelBlocks.every((block) => !/inset/.test(block))).toBe(true);
  });
});

describe('the Territory challenge card is the same window as every other sheet (owner, 2026-11-02)', () => {
  // "territory and profile windows dont match really - we should never use frame contour like in
  // territory challenge ... BOTH (and any other similar) should be using our classic dark glass
  // window style ... challenge and not now buttons should have a frame neither". The card used to be
  // #1c211edb with a 1px #d8cda557 outline, a 10px blur and a 20px/80px shadow of its own.
  const online = readFileSync(fileURLToPath(new URL('../src/online/online-css.ts', import.meta.url)), 'utf8');
  it('wears --dark-glass, the family corner and the one shadow, with no outline', () => {
    const card = /\.world-invitation-card \{([^}]*)\}/.exec(online)?.[1] ?? '';
    expect(card).toMatch(/background: var\(--dark-glass\);/);
    expect(card).toMatch(/backdrop-filter: var\(--dark-glass-blur\);/);
    expect(card).toMatch(/border-radius: 15px;/);
    expect(card).toMatch(/box-shadow: 0 10px 28px rgba\(0, 0, 0, 0\.22\);/);
    expect(card).toMatch(/border: 0; outline: none;/);
    expect(online).not.toMatch(/background: #1c211edb/);
    expect(online).not.toMatch(/border: 1px solid #d8cda5/);
  });
  it('its action keys draw no ring and reuse the game\'s key shape', () => {
    const key = /\.world-invitation-card button \{([^}]*)\}/.exec(online)?.[1] ?? '';
    expect(key).toMatch(/border: 0;/);
    expect(key).toMatch(/border-radius: 10px;/);
    expect(key).toMatch(/min-height: 44px;/);
    // The lead key is a FILL, the quiet one is not: that is how the pair still reads without rings.
    expect(online).toMatch(/\.world-invitation-card :is\(\.world-invitation-primary, \.world-challenge-primary\) \{\s*background: var\(--c-gold, #f2c14e\);/);
    expect(online).toMatch(/\.world-challenge-keys button\[aria-busy='true'\]/);
  });
});
