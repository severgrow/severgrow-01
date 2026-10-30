// Menu alignment invariants, locked at the source so they cannot silently drift again.
//
// The owner asked (2026-10-14) that every menu-like surface read as ONE product: the same centred
// column, the same rhythm, the same heading scale and the same button treatment. `menu-audit.ts`
// measures the built page; this test guards the CSS that produces those numbers, so a rename or a
// stray override fails `npm run check` immediately instead of waiting for the next visual pass.
//
// Background: the online hub and the difficulty pick used to drift (a Fragment Mono 1.4rem heading
// vs. the fluid Besley display heading; difficulty tiles 52px/r14 vs. the 56px/44px pill buttons),
// and `#online-matched` was missing from the cream-token scope so its buttons rendered as bare text.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const styleCss = read('../src/style.css');
const onlineCss = read('../src/online/online-css.ts');
// `fonts.ts` holds its CSS in a template literal, so drop the `${...}` placeholders before parsing.
const fontsCss = read('../src/player/fonts.ts').replace(/\$\{[^}]*\}/g, '');

type Rule = { prelude: string; body: string };
/** Every flat rule (prelude + declaration body) in a stylesheet. */
const rules = (css: string): Rule[] => {
  const out: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const prelude = (m[1] ?? '').trim();
    if (prelude.startsWith('@')) continue;
    out.push({ prelude, body: m[2] ?? '' });
  }
  return out;
};
const rulesFor = (css: string, needle: string) => rules(css).filter((r) => r.prelude.includes(needle));
const has = (css: string, needle: string, decl: string) => rulesFor(css, needle).some((r) => r.body.includes(decl));

const html = read('../index.html');
/** One `<section id="…">` of the built page, from its opening tag to its own closing `</section>`. */
const sectionById = (id: string): string => {
  const start = html.indexOf(`<section id="${id}"`);
  expect(start, `#${id} must exist in web/index.html`).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('</section>', start));
};
/** The button's own class attribute, by id, inside a section. */
const classesOf = (section: string, id: string): string => {
  const m = new RegExp(`<button id="${id}" class="([^"]*)"`).exec(section);
  expect(m, `#${id} must be a button in that section`).toBeTruthy();
  return m![1]!;
};

// The one column every menu surface centres itself in.
const COLUMN = 'width: min(420px, 100% - 32px)';

describe('every menu surface centres the same column', () => {
  it('the main menu column is the shared width, and a height-aware rhythm', () => {
    expect(has(styleCss, '.menu-inner', COLUMN)).toBe(true);
    // Owner, 2026-10-19: the menu spreads over tall screens and compresses on short ones, so its
    // padding and rhythm are clamps of the viewport height (never fixed pixels that force a scroll).
    const inner = rulesFor(styleCss, '.menu-inner');
    const body = inner.map((r) => r.body).join('\n');
    expect(body).toMatch(/--menu-rhythm:\s*clamp\([^)]*dvh/);
    expect(body).toMatch(/padding:\s*clamp\([^)]*dvh/);
    expect(body).toContain('gap: var(--menu-rhythm)');
  });

  it('the menu fits the screen by construction: spread, capped, and never scrollable', () => {
    // (a rule's prelude also carries the comment above it, so match on the selector it ends with)
    const menu = rules(styleCss).filter((r) => r.prelude.trim().endsWith('.menu')).map((r) => r.body).join('\n');
    // No scrolling fallback: the layout itself has to fit.
    expect(menu).toContain('overflow: hidden');
    expect(menu).not.toContain('overflow-y: auto');
    const inner = rulesFor(styleCss, '.menu-inner').map((r) => r.body).join('\n');
    // Tall screens: the free height is shared evenly above, between and below the three blocks…
    expect(inner).toContain('justify-content: space-evenly');
    // …capped, so a very tall screen never becomes a sparse ladder.
    expect(inner).toMatch(/height:\s*min\(100%,\s*max\(\d+px,\s*[\d.]+dvh\)\)/);
    expect(inner).toContain('max-height: 100%');
    // Short screens compress the gaps first; the KEYS keep the owner's one 50px height (2026-10-21).
    const keys = rules(styleCss)
      .filter((r) => r.prelude.includes('#menu .menu-buttons .btn') || r.prelude.includes('#play-menu .menu-buttons .btn'))
      .map((r) => r.body)
      .join('\n');
    expect(keys).toContain('min-height: var(--menu-key-h)');
    expect(keys).toContain('height: var(--menu-key-h)');
    expect(rules(styleCss).some((r) => r.body.includes('--menu-key-h: 50px'))).toBe(true);
    // The logo is never hidden: every supported screen keeps the mark.
    expect(styleCss).not.toMatch(/#menu #logo[^{]*\{\s*display:\s*none/);
  });

  it('the difficulty pick repeats it exactly', () => {
    expect(has(styleCss, '.levels-inner', COLUMN)).toBe(true);
    expect(has(styleCss, '.levels-inner', 'padding: 32px 0')).toBe(true);
    expect(has(styleCss, '.levels-inner', 'gap: 14px')).toBe(true);
  });

  it('the online submenu repeats it exactly', () => {
    expect(has(onlineCss, '.online-inner', COLUMN)).toBe(true);
    expect(has(onlineCss, '.online-inner', 'padding: 32px 0')).toBe(true);
    expect(has(onlineCss, '.online-inner', 'gap: 14px')).toBe(true);
  });

  it('the PLAY submenu reuses that same column, header and buttons (it is not a second menu)', () => {
    // The submenu composes from the components that already exist — the shared column, the shared
    // back-button + display heading, and the menu's own `.menu-buttons` — so it echoes the main
    // menu exactly instead of growing a parallel style system of its own.
    const section = sectionById('play-menu');
    expect(section).toContain('class="levels-inner"');
    expect(section).toContain('class="levels-head"');
    expect(section).toContain('class="menu-buttons"');
    expect(section).toContain('id="play-back"');
    // Nothing named after the submenu itself: a `play-inner` / `play-head` class would be the start
    // of the parallel system this is deliberately avoiding.
    expect(section).not.toMatch(/play-inner|play-head/);
    // And the section itself joins the difficulty screen's own centring rule rather than adding one.
    expect(rulesFor(styleCss, '#play-menu').some((r) => r.prelude.includes('.levels'))).toBe(true);
  });
});

describe('the main menu gives the wordmark deliberate breathing room', () => {
  it('the head gap is a token of two rhythm steps (28px), not a bare number', () => {
    expect(has(styleCss, '.menu-inner', '--menu-head-gap: calc(2 * var(--menu-rhythm))')).toBe(true);
  });

  it('the gap is applied across the beta line, so the wordmark never crowds the actions', () => {
    // Owner decision (2026-10-20): the beta line sits BETWEEN the wordmark and the buttons, so the
    // head gap is carried by the beta line's step into the column (and still honoured if the line
    // is ever absent).
    const chain = rulesFor(styleCss, '#menu-beta + .menu-buttons');
    expect(chain.length).toBeGreaterThan(0);
    expect(chain.map((r) => r.body).join('\n')).toContain('--menu-head-gap');
    const pair = rulesFor(styleCss, '.title + .menu-buttons');
    expect(pair.length).toBeGreaterThan(0);
    expect(pair.map((r) => r.body).join('\n')).toContain('--menu-head-gap');
  });
});

describe('one leader per screen: the menu and the PLAY submenu', () => {
  it('the main menu has exactly one leading action (PLAY), and it is the cream fill', () => {
    const menu = sectionById('menu');
    // Every entry that STAYS on the main menu is quiet except PLAY. The three that main.ts moves
    // into #play-actions (LEVEL n / Play online / Practice match) are checked in the submenu below.
    expect(classesOf(menu, 'menu-play')).toContain('primary');
    for (const id of ['menu-login', 'menu-continue', 'menu-world', 'menu-tutorial', 'menu-settings']) {
      expect(classesOf(menu, id), `${id} must be the quiet ghost`).toContain('ghost');
      expect(classesOf(menu, id), `${id} must not carry the cream fill`).not.toContain('primary');
    }
  });

  it('the world map is a TOP-LEVEL menu entry, not a child of PLAY', () => {
    const menu = sectionById('menu');
    expect(classesOf(menu, 'menu-world')).toContain('ghost');
    // It sits in the menu's own column, after PLAY, and is never one of PLAY's moved entries.
    expect(menu.indexOf('id="menu-world"')).toBeGreaterThan(menu.indexOf('id="menu-play"'));
    expect(menu.indexOf('id="menu-world"')).toBeLessThan(menu.indexOf('id="menu-tutorial"'));
  });

  it('PLAY holds LEVEL n, then Play online, then Practice match, in that order', () => {
    const main = read('../src/main.ts');
    const list = /const PLAY_MENU_ENTRIES = \[([^\]]*)\] as const;/.exec(main);
    expect(list, 'PLAY_MENU_ENTRIES must exist').toBeTruthy();
    // Three entries: the "Levels" list was removed (owner, 2026-10-16) so the player is not offered
    // the whole level list; LEVEL <n> opens the next uncompleted level instead.
    // ORDER (owner, 2026-10-20): LEVEL is the FIRST entry, above Play online. The array is the DOM
    // order (main.ts appends one by one), so this one assertion also pins what is seen and tabbed.
    expect(list![1]!.replace(/['\s]/g, '')).toBe('menu-campaign,menu-online,menu-new');
    // The markup that the move takes those nodes from lists them in the SAME order, so the source
    // reads in the order the submenu shows (no CSS `order` is involved anywhere).
    const menu = sectionById('menu');
    expect(menu.indexOf('id="menu-campaign"'), 'LEVEL must come before Play online in the markup').toBeLessThan(menu.indexOf('id="menu-online"'));
    // Every one is a real button in the menu markup, so the move can never append a missing node.
    for (const id of ['menu-online', 'menu-campaign', 'menu-new']) expect(menu).toContain(`id="${id}"`);
    expect(menu, 'the removed Levels entry must not be in the markup at all').not.toContain('menu-levels');
  });
});

describe('the difficulty tiles are the same button as the menu', () => {
  it('do not carry their own height or corner (they inherit the shared .btn scale: 56 big, pill)', () => {
    const shared = rulesFor(styleCss, '#levels .level-grid .difficulty-tile');
    expect(shared.length).toBeGreaterThan(0);
    const body = shared.map((r) => r.body).join('\n');
    expect(body).not.toMatch(/min-height\s*:/);
    expect(body).not.toMatch(/border-radius\s*:/);
  });
});

describe('one heading scale across the screen titles', () => {
  it('the online hub heading uses the display face', () => {
    const group = rulesFor(fontsCss, '.online-head h2').find((r) => r.body.includes('font-family: var(--font-display)'));
    expect(group, 'the online heading must join the display heading group').toBeTruthy();
  });

  it('the PLAY submenu heading is the shared difficulty heading (it reuses .levels-head)', () => {
    // The submenu deliberately has no heading style of its own: it uses `.levels-head h2`, so the
    // clamp below is the ONE heading size the difficulty pick, the campaign and PLAY all share.
    expect(rulesFor(fontsCss, '.levels-head h2').some((r) => r.body.includes('font-size: clamp(1.45rem, 2.4vw + 0.9rem, 2rem)'))).toBe(true);
  });

  it('the online hub heading shares the difficulty heading size', () => {
    const clamp = 'font-size: clamp(1.45rem, 2.4vw + 0.9rem, 2rem)';
    expect(rulesFor(fontsCss, '.online-head h2').some((r) => r.body.includes(clamp))).toBe(true);
    expect(rulesFor(fontsCss, '.levels-head h2').some((r) => r.body.includes(clamp))).toBe(true);
  });
});

describe('every surface that shows a cream menu button is in the cream-token scope', () => {
  it('the "Opponent found" card is included (outside the scope its buttons fall back to bare text)', () => {
    const scope = rules(styleCss).find((r) => r.body.includes('--fu-cream: #e8ddc5'));
    expect(scope, 'the cream-token scope must exist').toBeTruthy();
    for (const id of ['#menu', '#play-menu', '#levels', '.gameover', '#online-hub', '#online-waiting', '#online-join', '#online-matched']) {
      expect(scope!.prelude, `${id} must share the cream tokens`).toContain(id);
    }
  });
});
