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

// The one column every menu surface centres itself in.
const COLUMN = 'width: min(420px, 100% - 32px)';

describe('every menu surface centres the same column', () => {
  it('the main menu column is the shared width, padding and rhythm', () => {
    expect(has(styleCss, '.menu-inner', COLUMN)).toBe(true);
    expect(has(styleCss, '.menu-inner', 'padding: 32px 0')).toBe(true);
    expect(has(styleCss, '.menu-inner', '--menu-rhythm: 14px')).toBe(true);
    expect(has(styleCss, '.menu-inner', 'gap: var(--menu-rhythm)')).toBe(true);
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
});

describe('the main menu gives the wordmark deliberate breathing room', () => {
  it('the head gap is a token of two rhythm steps (28px), not a bare number', () => {
    expect(has(styleCss, '.menu-inner', '--menu-head-gap: calc(2 * var(--menu-rhythm))')).toBe(true);
  });

  it('the gap is applied to the wordmark→buttons pair only, so a restored tagline keeps its spacing', () => {
    const pair = rulesFor(styleCss, '.title + .menu-buttons');
    expect(pair.length).toBeGreaterThan(0);
    expect(pair.map((r) => r.body).join('\n')).toContain('--menu-head-gap');
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
    for (const id of ['#menu', '#levels', '.gameover', '#online-hub', '#online-waiting', '#online-join', '#online-matched']) {
      expect(scope!.prelude, `${id} must share the cream tokens`).toContain(id);
    }
  });
});
