// HOW A BIG COUNT IS WRITTEN (owner, 2026-11-01 polish pass): five digits and up are grouped with a
// thin no-break space so the eye can parse them at a glance; four and under are left alone because
// they read faster unbroken in a small box. Shared by the profile and the Territory entry, so the
// same balance looks the same in both.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groupDigits } from '../src/logic/format.js';

const THIN = '\u202F';

describe('grouping a count', () => {
  it('leaves small numbers exactly as they are', () => {
    expect(groupDigits(0)).toBe('0');
    expect(groupDigits(7)).toBe('7');
    expect(groupDigits(999)).toBe('999');
    expect(groupDigits(1240)).toBe('1240'); // four digits read faster unbroken
  });

  it('groups five digits and up in threes', () => {
    expect(groupDigits(12400)).toBe(`12${THIN}400`);
    expect(groupDigits(123456)).toBe(`123${THIN}456`);
    expect(groupDigits(1234567)).toBe(`1${THIN}234${THIN}567`);
  });

  it('uses a NO-BREAK space, so a number can never wrap inside a tile', () => {
    const grouped = groupDigits(12345);
    expect(grouped).toContain(THIN);
    expect(grouped).not.toContain(' '); // an ordinary space would be a wrap opportunity
  });

  it('truncates fractions and keeps a sign', () => {
    expect(groupDigits(12400.9)).toBe(`12${THIN}400`);
    expect(groupDigits(-12400)).toBe(`-12${THIN}400`);
  });

  it('never prints NaN or Infinity', () => {
    expect(groupDigits(Number.NaN)).toBe('—');
    expect(groupDigits(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('where the formatter is used', () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

  it('is the ONE formatter: the profile and the Territory entry both call it', () => {
    // Owner, 2026-11-01 polish pass: the same balance must read the same way in both places.
    const profile = read('../src/accounts/profile.ts');
    const menu = read('../src/online/menu-territory.ts');
    expect(profile).toContain("import { groupDigits } from '../logic/format.js'");
    expect(menu).toContain("import { groupDigits } from '../logic/format.js'");
    expect(profile).toMatch(/groupDigits\(Math\.floor\(n\)\)/);
    expect(menu).toMatch(/seedsValue\.textContent = groupDigits\(counts\.seeds\)/);
    expect(menu).toMatch(/answerText \?\? groupDigits\(shown\.tiles\)/);
    // Neither module keeps a second copy of the rule.
    expect(profile).not.toMatch(/\\u202F/);
    expect(menu).not.toMatch(/\\u202F/);
  });

  it('keeps the countdown on one line, so the entry never shifts mid-tick', () => {
    const css = read('../src/style.css');
    expect(css).toMatch(/#menu \.menu-territory-value \{ white-space: nowrap; \}/);
  });
});
