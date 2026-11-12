// A TEXT FIELD MUST NEVER MAKE A PHONE ZOOM.
//
// Owner (2026-10-26), on an iPhone: the match chat "zooms in awkwardly when entering text box to
// send a message ... should never happen on any phone -- esp since it covers the 'x' button to
// close the chat".
//
// iOS Safari magnifies the page when a focused text field computes under 16px, and the page stays
// magnified after the keyboard closes — so a small font on a field is not a typographic preference,
// it is a layout bug that hides controls. This scan walks every style source in the app, finds the
// rules that size a text-entry control, and fails if any of them asks for less than 16px.
//
// It checks what the app DECLARES. The runtime floor for undeclared fields lives in
// `src/style.css` (`@media (pointer: coarse)`, `font-size: max(16px, 1em)` on `:where(...)`), and
// that rule is asserted here too so it cannot be deleted quietly.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = join(__dirname, '..');
const FLOOR = 16;

/** Every .css file plus every .ts exporting a CSS template, anywhere under web/src. */
const styleSources = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.css') || name.endsWith('.ts')) out.push(path);
    }
  };
  walk(join(WEB, 'src'));
  return out;
};

/** A text-entry control: it takes typing, so iOS will focus-zoom it when it is too small. */
const TEXT_ENTRY = /(^|[\s,>+~(])(input|textarea|select)\b(?!\[type=['"]?(checkbox|radio|range|file|color|submit|button))/;

type Rule = { selector: string; body: string; file: string };

/** Flatten `@media`/`@supports` wrappers and collect top-level rules with their selectors. */
const rules = (text: string, file: string): Rule[] => {
  const out: Rule[] = [];
  // Strip comments so a commented-out rule is never read as the truth.
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1]!.trim().replace(/\s+/g, ' ');
    const body = match[2]!;
    if (!selector || selector.startsWith('@') || selector.endsWith(';')) continue;
    out.push({ selector, body, file });
  }
  return out;
};

const declaredSizes = (body: string): number[] => {
  const sizes: number[] = [];
  // `font-size: 12px` and the `font:` shorthand (`font:400 15px/1.4 ...`).
  for (const m of body.matchAll(/font-size\s*:\s*([\d.]+)px/g)) sizes.push(Number(m[1]));
  for (const m of body.matchAll(/(?:^|;)\s*font\s*:[^;{}]*?([\d.]+)px/g)) sizes.push(Number(m[1]));
  return sizes;
};

describe('no text field may make a phone zoom', () => {
  it('no rule sizes a text-entry control below 16px', () => {
    const offenders: string[] = [];
    for (const file of styleSources()) {
      const text = readFileSync(file, 'utf8');
      for (const rule of rules(text, file)) {
        if (!TEXT_ENTRY.test(rule.selector)) continue;
        // A rule may target a text field and other things at once; only its own sizes count.
        for (const size of declaredSizes(rule.body)) {
          if (size < FLOOR)
            offenders.push(`${rule.file.replace(WEB + '/', '')} — "${rule.selector}" asks for ${size}px`);
        }
      }
    }
    expect(offenders, `Fields under ${FLOOR}px zoom the whole page on iOS:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the runtime floor stays, and it stays specificity-free', () => {
    const css = readFileSync(join(WEB, 'src/style.css'), 'utf8');
    // Touch pointers only: a mouse never focus-zooms, and desktop typography is not the target.
    expect(css).toMatch(/@media \(pointer: coarse\) \{[\s\S]*?font-size: max\(16px, 1em\)/);
    // `:where()` keeps it at zero specificity, so a component that states its own (larger) size
    // still wins. Without it this rule would outrank deliberate typography — including the
    // 1.1rem join-code field.
    const floorBlock = css.slice(css.indexOf('@media (pointer: coarse)'));
    const upToRule = floorBlock.slice(0, floorBlock.indexOf('font-size: max'));
    expect(upToRule).toContain(':where(');
    expect(upToRule).not.toMatch(/!important/);
  });

  it('the fields that were caught are fixed at their own declaration', () => {
    // The match chat's composer was 16px — exactly on Apple's threshold, which is why it is 17px.
    const chat = readFileSync(join(WEB, 'src/online/chat/style.ts'), 'utf8');
    const composer = chat.match(/^\.match-chat input \{([^}]*)\}/m)?.[1] ?? '';
    expect(Number(composer.match(/font-size:([\d.]+)px/)?.[1])).toBeGreaterThan(FLOOR);
    // The report reason (was 12px).
    const select = chat.match(/match-chat-report-form select \{([^}]*)\}/)?.[1] ?? '';
    expect(Number(select.match(/font-size:\s*([\d.]+)px/)?.[1])).toBeGreaterThanOrEqual(FLOOR);
    // The beta feedback box (was 15px).
    const feedback = readFileSync(join(WEB, 'src/feedback/mount.ts'), 'utf8');
    expect(feedback).toMatch(/fb-glass textarea \{[^}]*font:400 16px/);
  });
});
