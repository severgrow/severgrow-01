/**
 * Keeps the CSS-inside-a-template-literal stylesheets well-formed at the SOURCE level.
 *
 * WHY THIS EXISTS: several stylesheets in this app are exported as JavaScript template literals
 * (`export const X_CSS = \`...\``), which means a BACKTICK CANNOT APPEAR ANYWHERE INSIDE - not even in
 * a comment. Writing a selector in backticks inside one of those comments terminates the string early
 * and breaks the build. That mistake was made three times in one day while editing these files, and
 * each time the only thing that caught it was the typecheck (a cryptic `TS1005: ',' expected`) or a
 * failed bundle - which is late, and easy to miss if you only run the tests (vitest does not
 * typecheck, so a broken file can still have a green test run).
 *
 * This test names the cause instead. It finds the literal by its real closing backtick - the first one
 * followed by `;` - so a stray backtick in the prose in between is detected rather than silently
 * ending the scan early.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_SRC = join(import.meta.dirname, '..', 'web', 'src');

type Found = { file: string; name: string; body: string };

const cssLiterals = (): Found[] => {
  const out: Found[] = [];
  for (const rel of readdirSync(WEB_SRC, { recursive: true }).map(String)) {
    if (!rel.endsWith('.ts')) continue;
    const text = readFileSync(join(WEB_SRC, rel), 'utf8');
    // Non-greedy up to the first backtick that is followed by optional whitespace and a semicolon -
    // i.e. the literal's real terminator. Anything the prose swallowed is therefore inside `body`.
    const re = /export const ([A-Z_]*_?CSS) = `([\s\S]*?)`\s*;/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out.push({ file: rel, name: m[1]!, body: m[2]! });
  }
  return out;
};

describe('stylesheets held in template literals contain no stray backtick', () => {
  it('finds the stylesheet literals', () => {
    const found = cssLiterals();
    // A guard for the guard: if the naming convention changes, this fails rather than silently
    // checking nothing.
    expect(found.length, 'expected to find the *_CSS template literals').toBeGreaterThan(5);
    expect(found.map((f) => f.name)).toContain('ONLINE_CSS');
    expect(found.map((f) => f.name)).toContain('ATMOSPHERE_CSS');
  });

  it('has no backtick inside any of them', () => {
    const offenders = cssLiterals()
      .filter((f) => f.body.includes('`'))
      .map((f) => `${f.file} (${f.name})`);
    expect(
      offenders,
      'a backtick inside a CSS template literal terminates the string and breaks the build - ' +
        'the stylesheet is a JS string, so backticks are not available for prose',
    ).toEqual([]);
  });
});
