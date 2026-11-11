/**
 * NO BORDER CONTOUR FRAMES ON KEYS (house rule, owner 2026-11-11: "no border contour frames on
 * buttons please - never").
 *
 * The product already says this in its own words (the "NO FRAME" comment family in
 * `web/src/style.css`, owner 2026-10-31 / 2026-11-02): a key earns its shape from its FILL or from a
 * tonal step against the surface, never from a 1px outline drawn around it. Focus is different and
 * is NOT this rule — an outer `outline` on `:focus-visible` is the product's accessibility
 * affordance and must stay.
 *
 * This guard reads the same sources `tests/window-dividers.test.ts` reads (style.css plus every
 * `*_CSS` template literal in web/src, which is where the planet window and the result window keep
 * their CSS) and fails on any non-zero `border`, `border-*` or `border-color` declaration inside a
 * finish-card key or the planet window's own key.
 *
 * The parsers below are deliberately shaped like `window-dividers.test.ts`'s (`stylesheets()` over
 * the same directory, the same `const CSS = \`…\`` literal regex, the same comment blanking and the
 * same rule regex), so the two suites cannot disagree about what a rule is.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_SRC = join(import.meta.dirname, '..', 'web', 'src');

type Sheet = { file: string; text: string };

/** Every stylesheet in the app: plain .css plus the CSS exported in template literals. */
const stylesheets = (): Sheet[] => {
  const out: Sheet[] = [];
  for (const rel of readdirSync(WEB_SRC, { recursive: true }).map(String)) {
    if (!rel.endsWith('.css') && !rel.endsWith('.ts')) continue;
    const text = readFileSync(join(WEB_SRC, rel), 'utf8');
    if (rel.endsWith('.css')) {
      out.push({ file: rel, text });
      continue;
    }
    const re = /(?:export\s+)?const\s+([A-Z_]*CSS)\s*=\s*`([\s\S]*?)`\s*;/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out.push({ file: `${rel} (${m[1]})`, text: m[2]! });
  }
  return out;
};

/** Blank comments and interpolations so offsets and rule bodies stay clean (same as the divider guard). */
const parseText = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length)).replace(/\$\{[^}]*\}/g, (m) => ' '.repeat(m.length));

type Offence = { file: string; selector: string; declaration: string };

/** Every rule in a sheet, as (selector, declarations) — the divider guard's own rule regex. */
const rules = (text: string): { selector: string; body: string }[] => {
  const parsed = parseText(text);
  const out: { selector: string; body: string }[] = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(parsed)) !== null) {
    const selector = m[1]!.replace(/\s+/g, ' ').trim();
    if (!selector || selector.startsWith('@')) continue;
    out.push({ selector, body: m[2]! });
  }
  return out;
};

/**
 * A KEY of the finish card or of the planet window:
 *   - anything under `#gameover .go-buttons` (the four keys and the classic card's own keys),
 *   - the planet window's action key (`.go-world-grow`),
 *   - the RESULT window's keys (`.go-result-keys .btn`).
 */
const KEY = /(?:(?:#gameover|\.gameover)[^{]*\.go-buttons|\.go-world-grow|\.go-result-keys\s+\.btn)\b/;

/** Non-zero border shorthands, sides and colours. `border: 0` is not a frame — it is the rule. */
const FRAMING = /^border(?:-(?:top|right|bottom|left|color|width|style))*$/i;
const isZero = (value: string): boolean => /^(?:0|none|initial|unset|revert)\b/i.test(value.trim());

const offencesIn = (sheet: Sheet): Offence[] => {
  const out: Offence[] = [];
  for (const { selector, body } of rules(sheet.text)) {
    if (!KEY.test(selector)) continue;
    // The shared focus ring is an `outline`, never a border: it is untouched by this rule.
    for (const raw of body.split(';')) {
      const [propRaw = '', ...valueParts] = raw.split(':');
      const prop = propRaw.trim();
      const value = valueParts.join(':').trim();
      if (!prop || !value) continue;
      if (!FRAMING.test(prop)) continue;
      if (isZero(value)) continue;
      out.push({ file: sheet.file, selector, declaration: `${prop}: ${value}` });
    }
  }
  return out;
};

const offenders = (): Offence[] => stylesheets().flatMap(offencesIn);

const report = (list: Offence[]): string =>
  list.map((o) => `${o.file}: ${o.selector} { ${o.declaration} }`).join('\n');

describe('no border contour frames on the finish card\'s keys (owner, 2026-11-11)', () => {
  it('the guard is looking at the real stylesheets, including the planet window\'s inline CSS', () => {
    const sheets = stylesheets();
    // A guard for the guard: if a file or the literal convention moves, fail rather than pass empty.
    expect(sheets.some((s) => s.file === 'style.css')).toBe(true);
    expect(sheets.some((s) => s.file.startsWith('online/endgame-planet.ts'))).toBe(true);
  });

  it('reports an outlined key (the guard bites)', () => {
    const fixture = `
      #gameover .go-buttons .btn { border: 1px solid var(--fu-cream-22); }
      #gameover[data-anatomy='planet'] .go-buttons .btn.primary { border-color: var(--fu-cream); }
      .go-world-grow { border: 1px solid #e8ddc5; }
      .go-result-keys .btn { border-left: 1.5px solid #fff; }
    `;
    const found = offencesIn({ file: 'fixture.css', text: fixture });
    expect(found).toHaveLength(4);
    expect(found.map((o) => o.selector)).toEqual([
      '#gameover .go-buttons .btn',
      "#gameover[data-anatomy='planet'] .go-buttons .btn.primary",
      '.go-world-grow',
      '.go-result-keys .btn',
    ]);
  });

  it('accepts `border: 0` and leaves focus and the card\'s own plate alone', () => {
    const fixture = `
      #gameover .go-buttons .btn { border: 0; background: color-mix(in srgb, var(--fu-cream) 7%, transparent); }
      #gameover .go-buttons .btn:focus-visible { outline: 2px solid var(--fu-cream); outline-offset: 2px; }
      #gameover .go-card { border: 1px solid var(--fu-cream-22); }
    `;
    expect(offencesIn({ file: 'fixture.css', text: fixture })).toEqual([]);
  });

  it('no key anywhere in the product keeps a contour', () => {
    const found = offenders();
    expect(found, `keys earn their shape from tone, never a border:\n${report(found)}`).toEqual([]);
  });
});
