// The engine, the bots and the server-core must give the same answer on every machine
// (phone, laptop, server): no randomness, clocks, platform APIs, or maths functions whose
// last digit can differ between JavaScript engines.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../src');
const DIRS = ['engine', 'bots', 'server-core'];
const files = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.ts') ? [join(dir, f)] : [])) : [];
const all = DIRS.flatMap((d) => files(join(ROOT, d)));

const BANNED: [RegExp, string][] = [
  [/Math\.random/, 'Math.random'],
  [/\b(Date|performance)\b/, 'clocks (Date, performance)'],
  [/\b(setTimeout|setInterval|requestAnimationFrame)\b/, 'timers'],
  [/\b(window|document|navigator|localStorage|sessionStorage|fetch|XMLHttpRequest)\b/, 'browser APIs'],
  [/\bprocess\.|from ['"](node:|fs|path|http|https|os|crypto)['"]|require\(/, 'Node-only APIs'],
  [/Math\.(pow|exp|expm1|log|log2|log10|log1p|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|cbrt|hypot)\b/, 'maths functions that can differ between engines'],
];

describe('pure code: same answer on every machine', () => {
  it('finds the files', () => expect(all.length).toBeGreaterThan(20));
  it.each(all.map((f) => [f.slice(ROOT.length + 1), f]))('%s', (_name, f) => {
    // Comments may mention these words; only code counts.
    const code = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const [re, what] of BANNED) expect(code, `uses ${what}`).not.toMatch(re);
  });
});
