// The display-name rules (server/src/display-name.ts): what a signed-in player may call themselves.
// These are the SERVER's rules; the client's filter is only a courtesy.
import { describe, expect, it } from 'vitest';
import {
  DISPLAY_NAME_MAX,
  checkDisplayName,
  filterForm,
  isBlockedName,
  normalizeDisplayName,
} from '../src/display-name.js';

const ok = (raw: unknown): string => {
  const r = checkDisplayName(raw);
  if (!r.ok) throw new Error(`expected ${JSON.stringify(raw)} to be allowed, got ${r.problem}`);
  return r.value;
};
const problem = (raw: unknown): string => {
  const r = checkDisplayName(raw);
  if (r.ok) throw new Error(`expected ${JSON.stringify(raw)} to be refused`);
  return r.problem;
};

describe('normalising a display name', () => {
  it('trims the ends and collapses runs of whitespace to one space', () => {
    expect(normalizeDisplayName('  Big    Fox  ')).toBe('Big Fox');
    expect(normalizeDisplayName('A\t \tB')).toBe('A B');
  });

  it('folds the typographic apostrophe people actually type onto the ASCII one', () => {
    expect(ok('O\u2019Brien')).toBe("O'Brien");
  });

  it('stores exactly the normalised value, never a generated name', () => {
    expect(ok('  Renée   O\'Neill ')).toBe("Renée O'Neill");
  });
});

describe('what is allowed', () => {
  it('accepts letters (accents too), digits, spaces and - _ \'', () => {
    for (const name of ['Grow', 'Renée', "O'Brien", 'Blast-2', 'the_best', 'Zoë7', 'Fern 9']) {
      expect(ok(name)).toBe(name);
    }
  });

  it('accepts a name up to the bound and refuses one character more', () => {
    expect(ok('x'.repeat(DISPLAY_NAME_MAX))).toHaveLength(DISPLAY_NAME_MAX);
    expect(problem('x'.repeat(DISPLAY_NAME_MAX + 1))).toBe('length');
  });

  it('does not start refusing innocent names that merely contain a blocked fragment', () => {
    for (const name of ['Cassandra Fox', 'Grapevine', 'Michelle', 'Blossom']) {
      expect(ok(name)).toBe(name);
    }
  });
});

describe('what is refused', () => {
  it('refuses an empty name after trimming', () => {
    for (const raw of ['', '   ']) {
      expect(checkDisplayName(raw).ok).toBe(false);
    }
  });

  it('refuses control characters and newlines outright, never silently squashing them', () => {
    expect(problem('Big\nFox')).toBe('chars');
    expect(problem('Big\u0000Fox')).toBe('chars');
    expect(problem('Big\u200bFox')).toBe('chars'); // zero-width space (format char)
    expect(problem('Big\u202eFox')).toBe('chars'); // right-to-left override
  });

  it('refuses characters outside the set — emoji included', () => {
    expect(problem('Grow 🌱')).toBe('chars');
    expect(problem('<script>')).toBe('chars');
    expect(problem('a@b')).toBe('chars');
    expect(problem('50%')).toBe('chars');
  });

  it('refuses a name that is only punctuation or whitespace', () => {
    expect(problem('...')).toBe('chars');
    expect(problem("- _ '")).toBe('chars');
  });

  it('refuses a non-string', () => {
    expect(problem(undefined)).toBe('empty');
    expect(problem(42)).toBe('empty');
  });
});

describe('the blocklist', () => {
  it('refuses a plainly written blocked word', () => {
    expect(problem('fuck')).toBe('blocked');
    expect(problem('  FUCK  ')).toBe('blocked');
  });

  it('still refuses it when the letters are spaced out', () => {
    expect(problem('f u c k')).toBe('blocked');
    expect(problem('f   u  c k')).toBe('blocked');
  });

  it('still refuses it through digit leetspeak', () => {
    expect(problem('sh1t')).toBe('blocked');
    expect(problem('b1tch')).toBe('blocked');
    // A symbol outside the charset is refused even earlier — before the blocklist runs at all.
    expect(problem('f@ck')).toBe('chars');
  });

  it('still refuses it when one letter is repeated', () => {
    expect(problem('fuuuck')).toBe('blocked');
  });

  it('does not refuse a name that merely starts with the same letters', () => {
    expect(ok('Fuchsia')).toBe('Fuchsia');
  });

  it('compares both sides in the same filtered form', () => {
    expect(filterForm('F u C k 3 r')).toBe('fucker');
    expect(isBlockedName('f u c k 3 r')).toBe(true);
  });
});
