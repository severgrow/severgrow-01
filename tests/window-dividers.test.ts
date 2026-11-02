/**
 * THE OWNER'S RULE (2026-11-02): "i also dont like the hairline divisions in profile (and if shows
 * up anywhere else) - id remove and not add in new widnows iin future".
 *
 * Windows do not use interior hairline dividers. A row or block is separated from its neighbour by
 * space, by a change of size/weight, or by a muted label — not by a 1px rule drawn between them.
 * The glass material's own edge is not this rule: the outer edge of a plate is allowed (and the
 * product already gives it no contour at all).
 *
 * A comment cannot enforce a rule, so this guard does. It reads every stylesheet in the app —
 * `web/src/style.css` and the CSS held in `*_CSS` template literals — finds each rule whose
 * selector is inside a window, and fails on a directional hairline (`border-top`, `border-bottom`,
 * `border-left`, `border-right` under 2px) or on a pseudo-element that draws a hairline with a
 * background. The four Profile rules that shipped before this change (`.sp-head`, `.sp-row +
 * .sp-row`, `.sp-play`, `.sp-play-row + .sp-play-row`) are exactly what it reports; the fixture
 * below keeps that proof in the suite.
 *
 * If a divider is ever genuinely unavoidable, write the reason at the rule as
 * `/* divider-ok: <reason> *\/` and this guard will allow it. The comment is the point: the next
 * reader must be able to see WHY a line exists where the house rule says there is none.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_SRC = join(import.meta.dirname, '..', 'web', 'src');

type Sheet = { file: string; text: string };
type Offence = { file: string; selector: string; declaration: string; why: string };

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
    // The same literal shape tests/css-template-literals.test.ts guards, plus the non-exported
    // `const CSS =` used by the glass/feedback/account/live windows.
    const re = /(?:export\s+)?const\s+([A-Z_]*CSS)\s*=\s*`([\s\S]*?)`\s*;/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out.push({ file: `${rel} (${m[1]})`, text: m[2]! });
  }
  return out;
};

/**
 * The window's own surface. A rule whose selector is ONLY one of these is the plate's outer edge,
 * which the house rule leaves alone. Anything below one of them is interior.
 */
const ROOT_ONLY: RegExp[] = [
  /^#sheet-[\w-]+$/,
  /^\.sheet(?:\.confirm-sheet)?$/,
  /^#gameover$/,
  /^\.go-card$/,
  /^#futasaku-glass$/,
  /^#install-prompt$/,
  /^\.install-sheet(?:\.sheet)?$/,
  /^\.world-panel$/,
  /^\.world-challenge-card$/,
  /^\.match-chat-panel$/,
  /^\.fb-glass$/,
  /^\.acct-glass$/,
  /^\.live-glass$/,
  /^\.levels-inner$/,
  /^#tutorial-bloom-demo$/,
  /^#tutorial-chapter-menu$/,
];

/** Elements that live inside a window even when their selector does not name its root. */
const WINDOW_ROOTS = /(?:#sheet-[\w-]+|#gameover|#futasaku-glass|#install-prompt|#tutorial-[\w-]+|\.sheet(?![\w-])|\.go-card|\.world-panel|\.world-challenge-card|\.match-chat(?:-panel)?|\.fb-glass|\.acct-glass|\.live-glass|\.install-sheet|\.levels-inner)/;
const WINDOW_FURNITURE = /(?:\.sp-|\.gm-|\.sheet-head|\.sheet-body|\.row(?![\w-])|\.history(?![\w-])|\.highlights(?![\w-])|\.settings-|\.lab-|\.intel-|\.match-chat-|\.world-|\.install-)/;

const isRootOnly = (selector: string): boolean =>
  ROOT_ONLY.some((re) => re.test(selector.replace(/^html\.[\w-]+\s+/, '').trim()));

const isWindowRule = (selector: string): boolean =>
  WINDOW_ROOTS.test(selector) || WINDOW_FURNITURE.test(selector);

/** `border-top: 1px solid …` and friends. A 2px+ accent is a mark, not a hairline. */
const HAIRLINE = /^(?:0?\.\d+|1(?:\.\d+)?)px\b/i;
const DIRECTION = /^border-(top|bottom|left|right)$/i;

/** Blank comments and interpolations with spaces, so string offsets stay usable for exemptions. */
const parseText = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/\$\{[^}]*\}/g, (m) => ' '.repeat(m.length));

/** The declaration's rule, plus whether a `divider-ok: <reason>` comment sits immediately above it. */
const scanSheet = ({ file, text }: Sheet): Offence[] => {
  const parsed = parseText(text);
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  const out: Offence[] = [];
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(parsed)) !== null) {
    const selector = m[1]!.replace(/\s+/g, ' ').trim();
    if (!selector || selector.startsWith('@')) continue;
    if (!isWindowRule(selector) || isRootOnly(selector)) continue;
    // The selector chunk starts after the previous rule's `}`, so a comment written immediately
    // above this rule is inside the chunk (blanked in `parsed`, intact in `text`). That is where
    // the exemption is read, so it is the comment AT the rule, not a stray note elsewhere.
    const above = text.slice(m.index, m.index + m[1]!.length);
    const excused = /\/\*\s*divider-ok:\s*[^*]+\*\//i.test(above);
    if (excused) continue;
    for (const raw of m[2]!.split(';')) {
      const [propRaw = '', ...valueParts] = raw.split(':');
      const prop = propRaw.trim();
      const value = valueParts.join(':').trim();
      if (!prop || !value) continue;
      if (DIRECTION.test(prop) && HAIRLINE.test(value)) {
        out.push({ file, selector, declaration: `${prop}: ${value}`, why: 'a directional hairline inside a window' });
      }
    }
    // A pseudo-element that fills a 1px strip, or paints a hair token, is a divider too.
    if (/::(?:before|after)\b/.test(selector)) {
      const body = m[2]!;
      const drawsLine =
        /content\s*:\s*['"]{2}/.test(body) &&
        (/background\s*:[^;]*hair/i.test(body) ||
          /(?:width|height)\s*:\s*(?:0?\.\d+|1|1\.5)px\b/i.test(body));
      if (drawsLine) {
        out.push({ file, selector, declaration: body.replace(/\s+/g, ' ').trim().slice(0, 90), why: 'a pseudo-element hairline inside a window' });
      }
    }
  }
  return out;
};

const offenders = (): Offence[] => stylesheets().flatMap(scanSheet);

const report = (list: Offence[]): string =>
  list.map((o) => `${o.file}: ${o.selector} { ${o.declaration} } — ${o.why}`).join('\n');

describe('windows have no interior hairline dividers', () => {
  it('the guard is looking at the real stylesheets', () => {
    const sheets = stylesheets();
    // A guard for the guard: if the literal naming convention changes, fail rather than pass on
    // an empty list.
    expect(sheets.some((s) => s.file === 'style.css')).toBe(true);
    expect(sheets.some((s) => s.file.startsWith('online/chat/style.ts'))).toBe(true);
    expect(sheets.some((s) => s.file.startsWith('player/glass-surface.ts'))).toBe(true);
  });

  it('reports the four Profile rules that shipped before 2026-11-02 (the guard bites)', () => {
    const before = `
      #sheet-profile .sp-head { border-bottom: 1px solid var(--sp-hair); }
      #sheet-profile .sp-row + .sp-row { border-top: 1px solid var(--sp-hair); }
      #sheet-profile .sp-play { padding-top: 12px; border-top: 1px solid var(--sp-hair); }
      #sheet-profile .sp-play-row + .sp-play-row { border-top: 1px solid var(--sp-hair); }
      #sheet-profile .sp-tile { border: 1px solid var(--sp-hair); }
      .sheet { border-top: 1.5px solid var(--c-line); }
    `;
    const found = scanSheet({ file: 'fixture.css', text: before });
    expect(found.map((o) => o.selector)).toEqual([
      '#sheet-profile .sp-head',
      '#sheet-profile .sp-row + .sp-row',
      '#sheet-profile .sp-play',
      '#sheet-profile .sp-play-row + .sp-play-row',
    ]);
    // The plate's own edge is the material, not an interior divider; the tile contour is an
    // all-round border, not a rule between blocks. Neither is reported.
    expect(found.every((o) => !o.selector.includes('.sp-tile') && o.selector !== '.sheet')).toBe(true);
  });

  it('accepts a divider that says why it is there', () => {
    const text = `
      /* divider-ok: a two-column form needs its cells bounded on narrow screens */
      .world-panel .world-cell { border-bottom: 1px solid var(--c-line); }
    `;
    expect(scanSheet({ file: 'fixture.css', text })).toEqual([]);
  });

  it('has no interior hairline dividers in any window', () => {
    const found = offenders();
    expect(found, `the house rule says no interior hairline dividers in windows:\n${report(found)}`).toEqual([]);
  });
});
